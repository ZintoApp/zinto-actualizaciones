import { db } from '../db';
import { capturedFormSubmissions, type InsertCapturedFormSubmission } from '../../shared/schema';
import { storage } from '../storage';
import { logger } from '../utils/logger';

export type DataCaptureMediaKind = 'image' | 'video' | 'audio' | 'document' | 'any';

export interface DataCaptureRule {
  id: string;
  variableName: string;
  sourceType: 'message_content' | 'contact_field' | 'regex_extract' | 'user_input' | 'custom_prompt';
  sourceValue: string;
  dataType: 'string' | 'number' | 'boolean' | 'email' | 'phone' | 'date' | 'media';
  /** When dataType is media, restricts allowed inbound attachment category. */
  mediaKind?: DataCaptureMediaKind;
  required: boolean;
  defaultValue?: string;
  validationPattern?: string;
  validationErrorMessage?: string;
  description?: string;
}

export interface DataCaptureConfig {
  captureRules: DataCaptureRule[];
  storageScope: 'session' | 'flow' | 'global';
  overwriteExisting: boolean;
  enableValidation: boolean;
}

export interface CaptureContext {
  sessionId: string;
  messageContent: string;
  /** Inbound attachment URL when the user sends image/video/audio/document. */
  mediaUrl?: string | null;
  messageType?: string | null;
  contact: {
    name?: string;
    phone?: string;
    email?: string;
    company?: string;
    [key: string]: any;
  };
  nodeId: string;
}

export interface CaptureResult {
  success: boolean;
  capturedVariables: Record<string, any>;
  errors: Array<{
    variableName: string;
    error: string;
  }>;
  skipped: Array<{
    variableName: string;
    reason: string;
  }>;
}

export class DataCaptureService {
  validateFieldValue(
    rawValue: string,
    rule: DataCaptureRule,
    options?: { mediaUrl?: string | null; messageType?: string | null }
  ): boolean {
    if (rule.dataType === 'media') {
      const mediaUrl = String(options?.mediaUrl ?? '').trim();
      const text = String(rawValue ?? '').trim();
      const combined = mediaUrl || text;
      const processedValue = this.coerceAndProcessValue(combined, rule.dataType);
      if (!this.validateValue(processedValue, rule)) return false;
      return this.validateMediaKindMatch(rule, String(processedValue ?? '').trim(), options?.messageType ?? null);
    }
    const processedValue = this.coerceAndProcessValue(rawValue, rule.dataType);
    return this.validateValue(processedValue, rule);
  }

  /**
   * Resolve the value to store/validate for a single form-mode answer.
   * For regex_extract, returns only the matched substring (or null if no match).
   */
  resolveFormFieldValue(
    rawValue: string,
    rule: DataCaptureRule,
    options?: { mediaUrl?: string | null }
  ): string | null {
    if (rule.dataType === 'media') {
      const mediaUrl = String(options?.mediaUrl ?? '').trim();
      if (mediaUrl) return mediaUrl;
      const text = String(rawValue ?? '').trim();
      return text || null;
    }

    const text = String(rawValue ?? '');
    if (rule.sourceType === 'regex_extract') {
      return this.extractWithRegex(rule.sourceValue, text);
    }

    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Execute data capture based on configuration and context (message/contact extraction).
   */
  async captureData(config: DataCaptureConfig, context: CaptureContext): Promise<CaptureResult> {
    return this.runCapturePipeline(config, context, async (rule) => this.extractCaptureInput(rule, context));
  }

  /**
   * Execute capture using pre-collected values keyed by variable name (form completion or structured input).
   */
  async captureCollectedData(
    config: DataCaptureConfig,
    context: CaptureContext,
    collectedValues: Record<string, any>
  ): Promise<CaptureResult> {
    // Pre-collected answers (form wizard / structured delegation) must always persist. Session
    // context often already has placeholder keys (e.g. empty string) in flow_session_variables
    // from persistAllContextVariablesToSession; with overwriteExisting false, runCapturePipeline
    // would skip every rule and capture nothing.
    return this.runCapturePipeline(
      { ...config, overwriteExisting: true },
      context,
      async (rule) => collectedValues[rule.variableName]
    );
  }

  /**
   * Shared validation, overwrite rules, persistence, and CaptureResult shape for all capture entry points.
   */
  private async runCapturePipeline(
    config: DataCaptureConfig,
    context: CaptureContext,
    resolveRawForRule: (rule: DataCaptureRule) => Promise<unknown>
  ): Promise<CaptureResult> {
    const result: CaptureResult = {
      success: true,
      capturedVariables: {},
      errors: [],
      skipped: []
    };

    logger.info('DataCaptureService', `Starting capture pipeline with ${config.captureRules.length} rules`, {
      sessionId: context.sessionId,
      nodeId: context.nodeId,
      scope: config.storageScope
    });

    for (const rule of config.captureRules) {
      try {
        if (!config.overwriteExisting) {
          const existingValue = await storage.getFlowVariable(context.sessionId, rule.variableName);
          if (existingValue !== undefined) {
            result.skipped.push({
              variableName: rule.variableName,
              reason: 'Variable already exists and overwrite is disabled'
            });
            continue;
          }
        }

        const rawValue = await resolveRawForRule(rule);

        if (rawValue === null || rawValue === undefined) {
          if (rule.required) {
            result.errors.push({
              variableName: rule.variableName,
              error: 'Required field could not be extracted'
            });
            result.success = false;
            continue;
          }
          if (rule.defaultValue !== undefined && rule.defaultValue !== '') {
            const processedValue = this.coerceAndProcessValue(rule.defaultValue, rule.dataType);
            if (config.enableValidation && !this.validateValueWithContext(processedValue, rule, context)) {
              result.errors.push({
                variableName: rule.variableName,
                error: 'Default value failed validation'
              });
              continue;
            }
            result.capturedVariables[rule.variableName] = processedValue;
          } else {
            result.skipped.push({
              variableName: rule.variableName,
              reason: 'No value found and not required'
            });
            continue;
          }
        } else {
          const processedValue = this.coerceAndProcessValue(rawValue, rule.dataType);

          if (config.enableValidation && !this.validateValueWithContext(processedValue, rule, context)) {
            result.errors.push({
              variableName: rule.variableName,
              error: `Value "${processedValue}" failed validation for type ${rule.dataType}`
            });
            if (rule.required) {
              result.success = false;
            }
            continue;
          }

          result.capturedVariables[rule.variableName] = processedValue;
        }

        await storage.setFlowVariable({
          sessionId: context.sessionId,
          variableKey: rule.variableName,
          variableValue: result.capturedVariables[rule.variableName],
          variableType: rule.dataType === 'boolean' ? 'boolean' :
            rule.dataType === 'number' ? 'number' : 'string',
          scope: config.storageScope,
          nodeId: context.nodeId
        });

        logger.debug('DataCaptureService', `Captured variable: ${rule.variableName}`, {
          value: result.capturedVariables[rule.variableName],
          type: rule.dataType,
          scope: config.storageScope
        });
      } catch (error) {
        logger.error('DataCaptureService', `Error capturing variable ${rule.variableName}`, error);
        result.errors.push({
          variableName: rule.variableName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        if (rule.required) {
          result.success = false;
        }
      }
    }

    logger.info('DataCaptureService', 'Capture pipeline completed', {
      success: result.success,
      capturedCount: Object.keys(result.capturedVariables).length,
      errorCount: result.errors.length,
      skippedCount: result.skipped.length
    });

    return result;
  }

  /**
   * Convert string input (legacy extraction path).
   */
  private processStringValue(value: string, dataType: string): any {
    if (!value) return value;

    switch (dataType) {
      case 'number': {
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
      }
      case 'boolean': {
        const lower = value.toLowerCase().trim();
        return ['true', 'yes', '1', 'on', 'enabled'].includes(lower);
      }
      case 'email':
      case 'phone':
      case 'date':
      case 'media':
      case 'string':
      default:
        return value.trim();
    }
  }

  /**
   * Preserve typed structured inputs where they already match the target type; otherwise coerce via string path.
   */
  coerceAndProcessValue(raw: unknown, dataType: string): any {
    if (raw === null || raw === undefined) {
      return raw;
    }

    if (dataType === 'media') {
      if (typeof raw === 'string') return raw.trim();
      if (raw && typeof raw === 'object' && 'url' in raw) {
        const u = (raw as { url: unknown }).url;
        if (typeof u === 'string') return u.trim();
      }
      if (raw && typeof raw === 'object' && 'mediaUrl' in raw) {
        const u = (raw as { mediaUrl: unknown }).mediaUrl;
        if (typeof u === 'string') return u.trim();
      }
      return this.processStringValue(String(raw), dataType);
    }

    if (dataType === 'boolean') {
      if (typeof raw === 'boolean') return raw;
      return this.processStringValue(String(raw), dataType);
    }

    if (dataType === 'number') {
      if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
      return this.processStringValue(String(raw), dataType);
    }

    if (typeof raw === 'string') {
      return this.processStringValue(raw, dataType);
    }

    if (typeof raw === 'boolean' || typeof raw === 'number') {
      return this.processStringValue(String(raw), dataType);
    }

    return this.processStringValue(String(raw), dataType);
  }

  /**
   * Resolve raw input for a rule; prefers attachment URL when dataType is media.
   */
  private async extractCaptureInput(rule: DataCaptureRule, context: CaptureContext): Promise<unknown> {
    if (rule.dataType === 'media') {
      const url = String(context.mediaUrl ?? '').trim();
      if (url) return url;
    }
    return this.extractValue(rule, context);
  }

  /**
   * Extract value based on source type and configuration
   */
  private async extractValue(rule: DataCaptureRule, context: CaptureContext): Promise<string | null> {
    switch (rule.sourceType) {
      case 'message_content':
        return context.messageContent || null;

      case 'contact_field':
        return this.extractContactField(rule.sourceValue, context.contact);

      case 'regex_extract':
        return this.extractWithRegex(rule.sourceValue, context.messageContent);

      case 'user_input':

        return context.messageContent || null;

      case 'custom_prompt':


        return context.messageContent || null;

      default:
        logger.warn('DataCaptureService', `Unknown source type: ${rule.sourceType}`);
        return null;
    }
  }

  /**
   * Extract value from contact field
   */
  private extractContactField(fieldPath: string, contact: any): string | null {
    try {
      const parts = fieldPath.split('.');
      let value = contact;

      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          return null;
        }
      }

      return value ? String(value) : null;
    } catch (error) {
      logger.error('DataCaptureService', `Error extracting contact field ${fieldPath}`, error);
      return null;
    }
  }

  /**
   * Extract value using regex pattern
   */
  private extractWithRegex(pattern: string, text: string): string | null {
    try {
      const regex = new RegExp(pattern, 'iu'); // Case insensitive + Unicode (for \p{L} etc.)
      const match = text.match(regex);
      // Prefer first capturing group when present; otherwise use the full match.
      // Patterns like \b\d{6,10}\b have no group and previously returned null.
      return match ? String(match[1] ?? match[0] ?? '').trim() || null : null;
    } catch (error) {
      logger.error('DataCaptureService', `Error with regex pattern ${pattern}`, error);
      return null;
    }
  }

  /**
   * Type validation plus media subtype when rule.mediaKind is set.
   */
  private validateValueWithContext(
    value: any,
    rule: DataCaptureRule,
    ctx?: CaptureContext
  ): boolean {
    if (!this.validateValue(value, rule)) return false;
    if (rule.dataType !== 'media') return true;
    return this.validateMediaKindMatch(rule, String(value ?? '').trim(), ctx?.messageType ?? null);
  }

  private validateMediaKindMatch(
    rule: DataCaptureRule,
    mediaUrlString: string,
    messageType: string | null
  ): boolean {
    const kind = rule.mediaKind ?? 'any';
    if (kind === 'any') return true;
    const mt = (messageType || '').toLowerCase();
    if (mt && this.messageTypeMatchesMediaKind(mt, kind)) return true;
    const inferred = this.inferMediaKindFromUrl(mediaUrlString);
    if (inferred === kind) return true;
    return false;
  }

  private messageTypeMatchesMediaKind(mt: string, kind: DataCaptureMediaKind): boolean {
    if (kind === 'image') return mt === 'image' || mt === 'sticker';
    if (kind === 'video') return mt === 'video';
    if (kind === 'audio') return mt === 'audio' || mt === 'voice' || mt === 'ptt';
    if (kind === 'document') return mt === 'document';
    return false;
  }

  private inferMediaKindFromUrl(url: string): DataCaptureMediaKind | null {
    if (!url || !url.trim()) return null;
    const path = url.split(/[?#]/)[0].toLowerCase();
    if (/\.(jpe?g|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(path)) return 'image';
    if (/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(path)) return 'video';
    if (/\.(mp3|wav|m4a|aac|opus|flac)(\?|$)/i.test(path)) return 'audio';
    if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar)(\?|$)/i.test(path)) return 'document';
    return null;
  }

  /**
   * Validate value against data type and rules
   */
  private validateValue(value: any, rule: DataCaptureRule): boolean {
    if (value === null || value === undefined) {
      return !rule.required;
    }

    switch (rule.dataType) {
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(String(value));
      }

      case 'phone':

        const phoneRegex = /^[\+]?[\d\s\-\(\)]{7,15}$/;
        return phoneRegex.test(String(value).replace(/\s/g, ''));

      case 'number':
        return !isNaN(Number(value));

      case 'boolean':
        return typeof value === 'boolean';

      case 'date':
        return !isNaN(Date.parse(String(value)));

      case 'media': {
        const s = String(value ?? '').trim();
        if (!s) return !rule.required;
        if (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:')) return true;
        return s.length >= 3;
      }

      case 'string':
      default:
        if (rule.validationPattern) {
          try {
            const regex = new RegExp(rule.validationPattern);
            return regex.test(String(value));
          } catch (error) {
            logger.error('DataCaptureService', `Invalid validation pattern: ${rule.validationPattern}`, error);
            return true; // If pattern is invalid, skip validation
          }
        }
        return true;
    }
  }

  /**
   * Get all captured variables for a session
   */
  async getCapturedVariables(sessionId: string, scope?: string): Promise<Record<string, any>> {
    try {
      return await storage.getFlowVariables(sessionId, scope);
    } catch (error) {
      logger.error('DataCaptureService', `Error getting captured variables for session ${sessionId}`, error);
      return {};
    }
  }

  /**
   * Clear captured variables for a session
   */
  async clearCapturedVariables(sessionId: string, scope?: string): Promise<void> {
    try {
      await storage.clearFlowVariables(sessionId, scope);
      logger.info('DataCaptureService', `Cleared variables for session ${sessionId}`, { scope });
    } catch (error) {
      logger.error('DataCaptureService', `Error clearing variables for session ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * Save a completed form submission for later review
   */
  async saveFormSubmission(params: {
    companyId: number;
    flowId: number;
    contactId: number;
    nodeId: string;
    sessionId: string;
    capturedFields: Record<string, any>;
  }): Promise<void> {
    try {
      const submission: InsertCapturedFormSubmission = {
        companyId: params.companyId,
        flowId: params.flowId,
        contactId: params.contactId,
        nodeId: params.nodeId,
        sessionId: params.sessionId,
        capturedFields: params.capturedFields,
        submittedAt: new Date()
      };

      await db.insert(capturedFormSubmissions).values(submission);
    } catch (error) {
      logger.error('DataCaptureService', 'Error saving captured form submission', error);
      throw error;
    }
  }
}

export const dataCaptureService = new DataCaptureService();
