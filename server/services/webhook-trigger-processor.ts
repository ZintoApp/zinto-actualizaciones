import { storage } from '../storage';
import { logger } from '../utils/logger';
import type {
  WebhookPayload,
  WebhookTriggerContext,
  FilterCondition,
  FilterEvaluationResult,
  ContactMappingConfig,
  ContactMappingStrategy,
  FilterOperator
} from '@shared/types/webhook-trigger';
import type { WebhookTrigger } from '@shared/schema';
import { matchMasterShopWebhookPresets } from '@shared/types/mastershop';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{10,}$/;

/**
 * WebhookTriggerProcessor - Handles the complete webhook processing pipeline:
 * filter evaluation, contact resolution, conversation management, and variable extraction.
 */
export class WebhookTriggerProcessor {
  /**
   * Get nested value from object using dot notation or JSONPath-style paths.
   * Recognizes paths starting with $. (e.g. $.order.customer.email) and strips the prefix
   * before traversing. Supports array indices (e.g. items[0].name). Falls back to existing
   * dot/array traversal for non-JSONPath paths.
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    if (obj === null || obj === undefined) return undefined;
    let traversePath = path.trim();
    if (traversePath === '$') return obj;
    if (traversePath.startsWith('$.')) traversePath = traversePath.slice(2);
    const parts = traversePath.split('.');
    let value: unknown = obj;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
      const key = bracketMatch ? bracketMatch[1] : part;
      const index = bracketMatch ? parseInt(bracketMatch[2], 10) : -1;
      if (typeof value !== 'object') return undefined;
      const record = value as Record<string, unknown>;
      if (!(key in record)) return undefined;
      value = record[key];
      if (index >= 0 && Array.isArray(value)) {
        value = value[index];
      }
    }
    return value;
  }

  /**
   * Flatten object recursively for variable access (e.g. order.customer.email)
   */
  private flattenObject(
    obj: unknown,
    prefix: string = '',
    maxDepth: number = 5,
    currentDepth: number = 0,
    seen: WeakSet<object> = new WeakSet()
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (currentDepth >= maxDepth) return result;
    if (obj === null || typeof obj !== 'object') {
      if (prefix) result[prefix] = obj;
      return result;
    }
    if (typeof obj === 'object' && obj !== null) {
      if (seen.has(obj as object)) return result;
      seen.add(obj as object);
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        const key = prefix ? `${prefix}[${i}]` : `[${i}]`;
        if (currentDepth + 1 < maxDepth && item !== null && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(result, this.flattenObject(item, key, maxDepth, currentDepth + 1, seen));
        } else {
          result[key] = item;
        }
      });
      return result;
    }
    const record = obj as Record<string, unknown>;
    for (const [k, v] of Object.entries(record)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && currentDepth + 1 < maxDepth) {
        Object.assign(result, this.flattenObject(v, key, maxDepth, currentDepth + 1, seen));
      } else {
        result[key] = v;
      }
    }
    return result;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  private isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  private isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
  }

  private evaluateFilters(payload: unknown, filterConditions: FilterCondition[]): FilterEvaluationResult {
    const evaluatedConditions: FilterEvaluationResult['evaluatedConditions'] = [];
    let passed = true;
    const body = this.isObject(payload) ? (payload as unknown as WebhookPayload).body : payload;
    const data = body !== undefined ? body : payload;

    for (const condition of filterConditions) {
      const actualValue = this.getNestedValue(data, condition.fieldPath);
      const expectedValue = condition.value;
      const caseSensitive = condition.caseSensitive ?? false;
      let result = false;
      let reason: string | undefined;

      const str = (v: unknown) => (this.isString(v) ? (caseSensitive ? v : v.toLowerCase()) : String(v ?? ''));
      const a = str(actualValue);
      const b = str(expectedValue);

      switch (condition.operator as FilterOperator) {
        case 'equals':
          result = a === b;
          break;
        case 'not_equals':
          result = a !== b;
          break;
        case 'contains':
          result = this.isString(actualValue) && (caseSensitive ? actualValue.includes(String(expectedValue ?? '')) : actualValue.toLowerCase().includes(b));
          break;
        case 'not_contains':
          result = !this.isString(actualValue) || !(caseSensitive ? actualValue.includes(String(expectedValue ?? '')) : actualValue.toLowerCase().includes(b));
          break;
        case 'starts_with':
          result = this.isString(actualValue) && (caseSensitive ? actualValue.startsWith(String(expectedValue ?? '')) : actualValue.toLowerCase().startsWith(b));
          break;
        case 'ends_with':
          result = this.isString(actualValue) && (caseSensitive ? actualValue.endsWith(String(expectedValue ?? '')) : actualValue.toLowerCase().endsWith(b));
          break;
        case 'greater_than':
          if (this.isNumber(actualValue) && this.isNumber(expectedValue)) {
            result = actualValue > expectedValue;
          } else {
            const an = Number(actualValue);
            const bn = Number(expectedValue);
            result = !Number.isNaN(an) && !Number.isNaN(bn) && an > bn;
          }
          break;
        case 'less_than':
          if (this.isNumber(actualValue) && this.isNumber(expectedValue)) {
            result = actualValue < expectedValue;
          } else {
            const an = Number(actualValue);
            const bn = Number(expectedValue);
            result = !Number.isNaN(an) && !Number.isNaN(bn) && an < bn;
          }
          break;
        case 'exists':
          result = actualValue !== undefined && actualValue !== null && actualValue !== '';
          break;
        case 'not_exists':
          result = actualValue === undefined || actualValue === null || actualValue === '';
          break;
        case 'in': {
          const arr = this.isArray(expectedValue) ? expectedValue : [expectedValue];
          result = arr.some((v) => str(v) === a);
          break;
        }
        case 'not_in': {
          const arr = this.isArray(expectedValue) ? expectedValue : [expectedValue];
          result = !arr.some((v) => str(v) === a);
          break;
        }
        default:
          reason = `Unknown operator: ${(condition as FilterCondition).operator}`;
          result = false;
      }

      if (!result) passed = false;
      evaluatedConditions.push({ condition, result, actualValue, reason });
    }

    return { passed, evaluatedConditions };
  }

  private async resolveContactExtract(
    payload: unknown,
    config: ContactMappingConfig,
    companyId: number
  ): Promise<number | null> {
    if (!config.extractField) return null;
    const body = this.isObject(payload) && 'body' in (payload as unknown as WebhookPayload) ? (payload as unknown as WebhookPayload).body : payload;
    const data = body !== undefined ? body : payload;
    const raw = this.getNestedValue(data, config.extractField);
    const identifier = raw !== undefined && raw !== null ? String(raw).trim() : '';
    if (!identifier) return null;

    const isEmail = EMAIL_REGEX.test(identifier);
    const isPhone = PHONE_REGEX.test(identifier.replace(/\s/g, ''));

    if (isEmail) {
      const contact = await storage.getContactByEmail(identifier, companyId);
      return contact?.id ?? null;
    }
    if (isPhone) {
      const contact = await storage.getContactByPhone(identifier, companyId);
      return contact?.id ?? null;
    }
    return null;
  }

  /** Contact fields that can be set from createFields.additionalFields (path → contact field key) */
  private static readonly ADDITIONAL_CONTACT_FIELDS = new Set<string>(['company', 'source', 'notes', 'tags', 'avatarUrl']);

  private async resolveContactCreate(
    payload: unknown,
    config: ContactMappingConfig,
    companyId: number
  ): Promise<number> {
    const body = this.isObject(payload) && 'body' in (payload as unknown as WebhookPayload) ? (payload as unknown as WebhookPayload).body : payload;
    const data = (body !== undefined ? body : payload) as Record<string, unknown>;
    const createFields = config.createFields ?? {};
    const get = (fieldPath?: string) => (fieldPath ? this.getNestedValue(data, fieldPath) : undefined);
    const nameRaw = get(createFields.nameField);
    const emailRaw = get(createFields.emailField);
    const phoneRaw = get(createFields.phoneField);
    const name = nameRaw !== undefined && nameRaw !== null ? String(nameRaw).trim() : 'Unknown';
    const email = emailRaw !== undefined && emailRaw !== null ? String(emailRaw).trim() : undefined;
    const phone = phoneRaw !== undefined && phoneRaw !== null ? String(phoneRaw).trim() : undefined;
    const identifier = email ?? phone ?? name;
    const identifierType = email ? 'email' : phone ? 'phone' : 'webhook';

    const contactData: Record<string, unknown> = {
      companyId,
      name: name || 'Unknown',
      email: email ?? null,
      phone: phone ?? null,
      identifier: identifier || undefined,
      identifierType: identifierType || undefined
    };

    const additionalFields = createFields.additionalFields ?? {};
    for (const [contactFieldKey, payloadPath] of Object.entries(additionalFields)) {
      if (!WebhookTriggerProcessor.ADDITIONAL_CONTACT_FIELDS.has(contactFieldKey)) continue;
      const raw = get(payloadPath);
      if (raw === undefined || raw === null) continue;
      if (contactFieldKey === 'tags') {
        contactData.tags = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',').map((s) => s.trim()) : [String(raw)]);
      } else {
        contactData[contactFieldKey] = String(raw).trim();
      }
    }

    const contact = await storage.getOrCreateContact(contactData as import('@shared/schema').InsertContact);
    return contact.id;
  }

  private async resolveContactSystem(): Promise<null> {
    return null;
  }

  private async getOrCreateConversation(
    contactId: number | null,
    companyId: number
  ): Promise<number | null> {
    if (contactId === null) return null;
    const connections = await storage.getChannelConnectionsByCompany(companyId);
    const active = connections.find((c) => c.status === 'active' || c.status === 'connected');
    if (!active) return null;
    const existing = await storage.getConversationByContactAndChannel(contactId, active.id);
    if (existing) return existing.id;
    const newConv = await storage.createConversation({
      contactId,
      channelId: active.id,
      channelType: active.channelType,
      companyId,
      status: 'open',
      lastMessageAt: new Date()
    } as import('@shared/schema').InsertConversation);
    return newConv.id;
  }

  private extractVariables(
    payload: WebhookPayload,
    customMappings?: Record<string, string>
  ): Record<string, unknown> {
    const vars: Record<string, unknown> = {};
    const body = payload.body;
    const flat = this.flattenObject(body, 'webhook.payload', 5);
    Object.assign(vars, flat);
    if (payload.headers && this.isObject(payload.headers)) {
      for (const [k, v] of Object.entries(payload.headers)) {
        vars[`webhook.headers.${k}`] = v;
      }
    }
    if (payload.queryParams && this.isObject(payload.queryParams)) {
      for (const [k, v] of Object.entries(payload.queryParams)) {
        vars[`webhook.queryParams.${k}`] = v;
      }
    }
    vars['webhook.method'] = payload.method;
    vars['webhook.path'] = payload.path;
    if (payload.ipAddress !== undefined) vars['webhook.ipAddress'] = payload.ipAddress;
    if (payload.userAgent !== undefined) vars['webhook.userAgent'] = payload.userAgent;

    if (customMappings && this.isObject(customMappings)) {
      for (const [varName, fieldPath] of Object.entries(customMappings)) {
        const value = this.getNestedValue(body, fieldPath);
        vars[varName] = value;
      }
    }
    return vars;
  }

  private getWebhookPayloadBody(payload: WebhookPayload): unknown {
    const body = payload.body;
    return body !== undefined ? body : payload;
  }

  private evaluateMastershopPresets(
    trigger: WebhookTrigger,
    payload: WebhookPayload
  ): {
    passed: boolean;
    mastershopPresetMatch: ReturnType<typeof matchMasterShopWebhookPresets>;
  } {
    const metadata = (trigger.metadata as Record<string, unknown>) ?? {};
    if (metadata.integration !== 'mastershop') {
      return {
        passed: true,
        mastershopPresetMatch: {
          passed: true,
          matchedPresetIds: [],
          matchedEventIds: [],
          selectedPresetIds: [],
          selectedEventIds: [],
          evaluatedPresets: [],
        },
      };
    }

    const body = this.getWebhookPayloadBody(payload);
    const presetIds = Array.isArray(metadata.mastershopPresetIds)
      ? (metadata.mastershopPresetIds as string[])
      : undefined;
    const eventIds = Array.isArray(metadata.mastershopEventIds)
      ? (metadata.mastershopEventIds as number[])
      : undefined;
    const mastershopPresetMatch = matchMasterShopWebhookPresets(body, {
      presetIds,
      eventIds,
    });
    return { passed: mastershopPresetMatch.passed, mastershopPresetMatch };
  }

  async processWebhook(
    requestId: string,
    trigger: WebhookTrigger,
    payload: WebhookPayload
  ): Promise<WebhookTriggerContext | null> {
    const triggerId = trigger.id;
    const flowId = trigger.flowId;
    const companyId = trigger.companyId;
    const filterConditions = (trigger.filterConditions as FilterCondition[]) ?? [];
    const contactMapping = (trigger.contactMapping as ContactMappingConfig) ?? { strategy: 'system' as ContactMappingStrategy };

    try {
      const { passed: mastershopPassed, mastershopPresetMatch } =
        this.evaluateMastershopPresets(trigger, payload);

      const genericFilterResult = this.evaluateFilters(payload, filterConditions);
      const filterResult = {
        ...genericFilterResult,
        passed: mastershopPassed && genericFilterResult.passed,
        mastershopPresetMatch,
        ...(mastershopPassed
          ? {}
          : { failedReason: mastershopPresetMatch.failedReason }),
      };

      if (!filterResult.passed) {
        await storage.updateWebhookTriggerLogByRequestId(requestId, {
          status: 'filtered',
          filterResult: filterResult as unknown as Record<string, unknown>
        }).catch((err) => logger.error('WebhookTriggerProcessor', 'Update log filtered failed', { requestId, triggerId, err }));
        return null;
      }

      let contactId: number | null = null;
      const strategy = contactMapping.strategy as ContactMappingStrategy;
      if (strategy === 'extract') {
        contactId = await this.resolveContactExtract(payload, contactMapping, companyId);
      } else if (strategy === 'create') {
        try {
          contactId = await this.resolveContactCreate(payload, contactMapping, companyId);
        } catch (err) {
          logger.error('WebhookTriggerProcessor', 'Contact create failed', { requestId, triggerId, err });
          await storage.updateWebhookTriggerLogByRequestId(requestId, {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Contact creation failed'
          }).catch(() => {});
          return null;
        }
      } else {
        contactId = await this.resolveContactSystem();
      }

      const conversationId = await this.getOrCreateConversation(contactId, companyId);

      const customMappings = (trigger.metadata as Record<string, unknown>)?.customVariableMappings as Record<string, string> | undefined;
      const variables = this.extractVariables(payload, customMappings);

      const context: WebhookTriggerContext = {
        triggerId,
        requestId,
        payload,
        filterResult,
        contactId: contactId ?? undefined,
        conversationId: conversationId ?? undefined,
        variables
      };

      await storage.updateWebhookTriggerLogByRequestId(requestId, {
        status: 'triggered',
        contactId: contactId ?? undefined,
        conversationId: conversationId ?? undefined,
        filterResult: filterResult as unknown as Record<string, unknown>
      }).catch((err) => logger.error('WebhookTriggerProcessor', 'Update log triggered failed', { requestId, triggerId, err }));

      return context;
    } catch (err) {
      logger.error('WebhookTriggerProcessor', 'processWebhook failed', {
        requestId,
        triggerId,
        flowId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      await storage.updateWebhookTriggerLogByRequestId(requestId, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Processing failed'
      }).catch(() => {});
      return null;
    }
  }

  testFilters(payload: unknown, conditions: FilterCondition[]): FilterEvaluationResult {
    return this.evaluateFilters(payload, conditions);
  }

  async testContactMapping(
    payload: unknown,
    config: ContactMappingConfig,
    companyId: number
  ): Promise<{ strategy: string; extractedValue?: unknown; contactId?: number; error?: string }> {
    try {
      const strategy = config.strategy;
      if (strategy === 'extract') {
        const body = this.isObject(payload) && 'body' in (payload as unknown as WebhookPayload) ? (payload as unknown as WebhookPayload).body : payload;
        const data = body !== undefined ? body : payload;
        const extractedValue = config.extractField ? this.getNestedValue(data, config.extractField) : undefined;
        const contactId = await this.resolveContactExtract(payload, config, companyId);
        return { strategy: 'extract', extractedValue, contactId: contactId ?? undefined };
      }
      if (strategy === 'create') {
        const contactId = await this.resolveContactCreate(payload, config, companyId);
        return { strategy: 'create', contactId };
      }
      return { strategy: 'system' };
    } catch (e) {
      return { strategy: config.strategy, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const webhookTriggerProcessor = new WebhookTriggerProcessor();
