import type { WebhookTriggerContext } from '@shared/types/webhook-trigger';

export const AI_PROMPT_MEMORY_PREFIX = 'ai.promptMemory.';

/** Live-turn namespaces that must not be overwritten from persisted session variables during condition evaluation. */
const CONDITION_EVAL_LIVE_TURN_PREFIXES = [
  'message.',
  'contact.',
  'conversation.',
  'current.',
  'date.',
  'time.',
  'flow.',
  'session.',
] as const;

const CONDITION_EVAL_LIVE_TURN_ROOT_KEYS = new Set([
  'message',
  'contact',
  'conversation',
  'current',
  'date',
  'time',
  'flow',
  'session',
]);

function isConditionEvalLiveTurnVariable(key: string): boolean {
  if (CONDITION_EVAL_LIVE_TURN_ROOT_KEYS.has(key)) return true;
  return CONDITION_EVAL_LIVE_TURN_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Flow Execution Context
 * Manages variables and data during flow execution
 */
export class FlowExecutionContext {
  private variables: Map<string, any> = new Map();
  private nodeData: Map<string, any> = new Map();
  private readonly startTime: Date;
  private readonly companyTimezone: string | null;

  constructor(initialData?: any, options?: { timezone?: string }) {
    this.startTime = new Date();
    this.companyTimezone = (options?.timezone && options.timezone.trim()) ? options.timezone.trim() : null;

    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        this.variables.set(key, value);
      });
    }

    this.setSystemVariables();
  }

  private formatInTimezone(date: Date, timeZone: string): { dateStr: string; timeStr: string } {
    try {
      return {
        dateStr: date.toLocaleDateString(undefined, { timeZone, dateStyle: 'short' }),
        timeStr: date.toLocaleTimeString(undefined, { timeZone, timeStyle: 'short', hour12: false })
      };
    } catch {
      return {
        dateStr: date.toLocaleDateString(),
        timeStr: date.toLocaleTimeString()
      };
    }
  }

  /**
   * Set a variable value
   */
  setVariable(key: string, value: any): void {
    this.variables.set(key, value);

  }

  /**
   * Remove a variable so it no longer appears in getAllVariables (unlike setVariable(key, undefined)).
   */
  deleteVariable(key: string): void {
    this.variables.delete(key);
  }

  /**
   * Set variables from a session with proper scoping to prevent pollution
   */
  setSessionVariables(sessionVariables: Map<string, any>, sessionId: string): void {
    sessionVariables.forEach((value, key) => {

      if (key.startsWith('session.') || key.startsWith('flow.') || key.startsWith('user.') || key.startsWith('contact.') || key.startsWith('message.')) {
        this.variables.set(key, value);
      }

      else if (!key.startsWith('system.')) {
        this.variables.set(`session.${sessionId}.${key}`, value);

        this.variables.set(key, value);
      }
    });
  }

  /**
   * Get a variable value
   */
  getVariable(key: string): any {
    return this.variables.get(key);
  }

  /**
   * Check if variable exists
   */
  hasVariable(key: string): boolean {
    return this.variables.has(key);
  }

  /**
   * Get all variables
   */
  getAllVariables(): Record<string, any> {
    const result: Record<string, any> = {};
    this.variables.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Load captured variables from storage into context
   * 
   * NOTE: HTTP and Webhook execution state persistence
   * This method loads all variables from storage, including http.* and webhook.* execution
   * flags and cached responses. This means that HTTP/webhook nodes that have been executed
   * in a previous session will not re-execute when the session is resumed, as their execution
   * state is restored from storage. This is intentional behavior to prevent duplicate API calls
   * across session boundaries, but maintainers should be aware of this persistence behavior.
   */
  async loadCapturedVariables(sessionId: string, scope?: string): Promise<void> {
    try {
      const { storage } = await import('../storage');
      const capturedVars = await storage.getFlowVariables(sessionId, scope);

      Object.entries(capturedVars).forEach(([key, value]) => {
        this.setVariable(key, value);
      });


    } catch (error) {
      console.error('Error loading captured variables:', error);
    }
  }

  /**
   * Restore persisted session variables for condition evaluation without clobbering
   * live-turn routing state (message, contact, conversation, date/time, flow, session).
   */
  async loadConditionSafeCapturedVariables(sessionId: string, scope?: string): Promise<void> {
    try {
      const { storage } = await import('../storage');
      const capturedVars = await storage.getFlowVariables(sessionId, scope);

      Object.entries(capturedVars).forEach(([key, value]) => {
        if (isConditionEvalLiveTurnVariable(key)) return;
        this.setVariable(key, value);
      });
    } catch (error) {
      console.error('Error loading condition-safe captured variables:', error);
    }
  }

  /**
   * Get captured variables with a specific prefix
   */
  getCapturedVariables(prefix?: string): Record<string, any> {
    const result: Record<string, any> = {};

    this.variables.forEach((value, key) => {
      if (!prefix || key.startsWith(prefix)) {

        if (!key.startsWith('current.') && !key.startsWith('flow.') &&
            !key.startsWith('session.') && !key.startsWith('message.') &&
            !key.startsWith('contact.')) {
          result[key] = value;
        }
      }
    });

    return result;
  }

  /**
   * Set node execution data
   */
  setNodeData(nodeId: string, data: any): void {
    this.nodeData.set(nodeId, data);
    
  }

  /**
   * Get node execution data
   */
  getNodeData(nodeId: string): any {
    return this.nodeData.get(nodeId);
  }

  /**
   * Replace variables in a template string with proper error handling and sanitization
   */
  replaceVariables(template: string): string {
    if (!template) return '';

    try {
      let result = template;

      this.variables.forEach((value, key) => {
        try {
          if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {

            return;
          }

          const regex = new RegExp(`{{${this.escapeRegex(key)}}}`, 'g');
          const stringValue = this.formatVariableValue(value);
          const sanitizedValue = this.sanitizeVariableValue(stringValue);


          if (key.startsWith('google_sheets')) {




          }

          result = result.replace(regex, sanitizedValue);
        } catch (error) {
          console.error(`Flow context: Error replacing variable "${key}":`, error);
        }
      });

      const nestedMatches = result.match(/{{([^}]+)}}/g);
      if (nestedMatches) {

        nestedMatches.forEach(match => {
          try {
            const variablePath = match.slice(2, -2);


            if (!/^[a-zA-Z0-9_.-]+$/.test(variablePath)) {

              return;
            }

            const value = this.getNestedVariable(variablePath);

            if (value !== undefined) {
              const sanitizedValue = this.sanitizeVariableValue(this.formatVariableValue(value));
              result = result.replace(match, sanitizedValue);

            } else {

            }
          } catch (error) {
            console.error(`Flow context: Error replacing nested variable "${match}":`, error);
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Flow context: Critical error in variable replacement:', error);
      return template;
    }
  }

  /**
   * Get nested variable value (e.g., contact.name)
   */
  private getNestedVariable(path: string): any {
    const parts = path.split('.');
    let current = this.getAllVariables();

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Resolve a dotted variable path (e.g. contact.phone) from the execution context.
   */
  resolveVariablePath(path: string): unknown {
    if (this.variables.has(path)) {
      return this.variables.get(path);
    }
    return this.getNestedVariable(path);
  }

  /**
   * Format variable value for string replacement
   */
  private formatVariableValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }


    if (Array.isArray(value)) {
      const firstValue = value.find(item => item !== null && item !== undefined && item !== '');
      return firstValue ? String(firstValue) : '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Sanitize variable value to prevent XSS and injection attacks
   * For WhatsApp messages, we don't need HTML encoding since it's plain text
   */
  private sanitizeVariableValue(value: string): string {
    if (!value) return '';



    return value;
  }

  /**
   * Escape special regex characters in variable keys
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Set system variables
   */
   private setSystemVariables(): void {
    const now = new Date();
    const { dateStr, timeStr } = this.companyTimezone
      ? this.formatInTimezone(now, this.companyTimezone)
      : { dateStr: now.toLocaleDateString(), timeStr: now.toLocaleTimeString() };

    this.setVariable('date.today', dateStr);
    this.setVariable('date.now', now.toISOString());
    this.setVariable('time.now', timeStr);
    this.setVariable('timestamp', now.getTime());
    this.setVariable('current.timestamp', now.toISOString());
    this.setVariable('current.date', dateStr);
    this.setVariable('current.time', timeStr);
    this.setVariable('execution.startTime', this.startTime.toISOString());
  }

  /**
   * Update current time variables to reflect the current moment
   */
  updateCurrentTimeVariables(): void {
    const now = new Date();
    const { dateStr, timeStr } = this.companyTimezone
      ? this.formatInTimezone(now, this.companyTimezone)
      : { dateStr: now.toLocaleDateString(), timeStr: now.toLocaleTimeString() };

    this.setVariable('date.today', dateStr);
    this.setVariable('date.now', now.toISOString());
    this.setVariable('time.now', timeStr);
    this.setVariable('timestamp', now.getTime());
    this.setVariable('current.timestamp', now.toISOString());
    this.setVariable('current.date', dateStr);
    this.setVariable('current.time', timeStr);
  }

  /**
   * Update contact variables
   */
  setContactVariables(contact: any): void {
    this.setVariable('contact.id', contact.id);
    this.setVariable('contact.name', contact.name || '');
    this.setVariable('contact.identifier', contact.identifier || '');
    this.setVariable('contact.phone', contact.phone || '');
    this.setVariable('contact.email', contact.email || '');
    this.setVariable('contact.username', contact.whatsappUsername || '');
    this.setVariable('contact', contact);
  }

  /**
   * Update message variables with enhanced contextual data
   */
  setMessageVariables(message: any): void {
    this.setVariable('message.id', message.id);
    this.setVariable('message.content', message.content || '');
    this.setVariable('message.type', message.type || '');
    this.setVariable('message.timestamp', message.timestamp);
    this.setVariable('message.direction', message.direction || '');
    this.setVariable('message.mediaUrl', message.mediaUrl || message.media_url || '');
    this.setVariable('message.metadata', message.metadata || '');
    this.setVariable('message', message);


    if (message.direction === 'inbound') {

      this.setVariable('sender.phone', this.getVariable('contact.phone') || '');

    } else if (message.direction === 'outbound') {

      this.setVariable('receiver.phone', this.getVariable('contact.phone') || '');

    }
  }

  /**
   * Update conversation variables
   */
  setConversationVariables(conversation: any): void {
    this.setVariable('conversation.id', conversation.id);
    this.setVariable('conversation.status', conversation.status || '');
    this.setVariable('conversation', conversation);
  }

  /**
   * Set webhook trigger variables from WebhookTriggerContext (payload, headers, custom mappings, metadata).
   */
  setWebhookTriggerVariables(webhookContext: WebhookTriggerContext): void {
    for (const [key, value] of Object.entries(webhookContext.variables)) {
      this.setVariable(key, value);
    }
    this.setVariable('webhook.triggerId', webhookContext.triggerId);
    this.setVariable('webhook.requestId', webhookContext.requestId);
    if (webhookContext.filterResult !== undefined) {
      this.setVariable('webhook.filterPassed', webhookContext.filterResult.passed);
    }
    this.setVariable('webhook.contactId', webhookContext.contactId);
    this.setVariable('webhook.conversationId', webhookContext.conversationId);
    this.setVariable('webhook.rawPayload', webhookContext.payload.body);
    this.setVariable('webhook.payload', webhookContext.payload.body);
  }

  /**
   * Set execution result variables for webhook response template interpolation.
   * Use after flow completes (sync mode) so response body can use {{execution.status}}, {{execution.duration}}, etc.
   */
  setExecutionResult(result: { status: 'completed' | 'failed'; result?: any; duration?: number; error?: string }): void {
    this.setVariable('execution.status', result.status);
    this.setVariable('execution.duration', result.duration ?? 0);
    this.setVariable('execution.completedAt', new Date().toISOString());
    this.setVariable('execution.result', result.result);
    this.setVariable('execution.error', result.error ?? '');
  }

  /**
   * Set availability data from calendar nodes
   */
  setAvailabilityData(availabilityData: string): void {
    this.setVariable('availability', availabilityData);
    this.setVariable('calendar.availability', availabilityData);
  }

  setPromptMemory(key: string, value: any): void {
    this.setVariable(`${AI_PROMPT_MEMORY_PREFIX}${key}`, value);
  }

  getPromptMemory<T = any>(key: string): T | undefined {
    return this.getVariable(`${AI_PROMPT_MEMORY_PREFIX}${key}`) as T | undefined;
  }

  deletePromptMemory(key: string): void {
    this.deleteVariable(`${AI_PROMPT_MEMORY_PREFIX}${key}`);
  }

  /**
   * Set AI response data
   */
  setAIResponse(response: string, metadata?: any): void {
    this.setVariable('ai.response', response);
    this.setVariable('ai.lastResponse', response);

    if (metadata) {
      this.setVariable('ai.metadata', metadata);
    }
  }

  /**
   * Set user input from quick reply or text input
   */
  setUserInput(input: string, inputType: 'text' | 'quickreply' = 'text'): void {
    this.setVariable('user.input', input);
    this.setVariable('user.lastInput', input);
    this.setVariable('user.inputType', inputType);
  }

  /**
   * Set webhook response data
   */
  setWebhookResponse(response: any): void {
    this.setVariable('webhook.response', response);
    this.setVariable('webhook.lastResponse', response);
  }

  /**
   * Mark a webhook node as executed
   * 
   * NOTE: Single-execution semantics scope
   * The execution flags (webhook.executed.*, http.executed.*) are designed for single in-memory
   * flow execution runs. They prevent duplicate executions within the same execution context.
   * These flags are preserved in clearUserVariables() and will persist across session restarts
   * if variables are saved to storage, which means HTTP/webhook nodes will not re-execute
   * even after server restarts or session resumption. This behavior is intentional to prevent
   * duplicate API calls, but maintainers should be aware that these nodes will not re-execute
   * in subsequent flow runs within the same session.
   * 
   * @param nodeId The ID of the webhook node
   * @param responseData The response data from the webhook call
   * @param pathId Optional path identifier to track execution per path
   */
  private webhookExecutionKeySuffix(nodeId: string, pathId?: string, runId?: string): string {
    if (pathId) return `${nodeId}.${pathId}`;
    const normalizedRunId = typeof runId === 'string' && runId.length > 0 ? runId : null;
    if (normalizedRunId) return `${nodeId}@${normalizedRunId}`;
    return nodeId;
  }

  markWebhookExecuted(nodeId: string, responseData?: any, pathId?: string, runId?: string): void {
    const keySuffix = this.webhookExecutionKeySuffix(nodeId, pathId, runId);
    this.setVariable(`webhook.executed.${keySuffix}`, true);
    this.setVariable(`webhook.executedAt.${keySuffix}`, new Date().toISOString());
    if (responseData !== undefined) {
      this.setVariable(`webhook.cachedResponse.${keySuffix}`, responseData);
    }
  }

  /**
   * Check if a webhook node has been executed
   * @param nodeId The ID of the webhook node
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the webhook has been executed, false otherwise
   *
   * AI assistant delegations pass a distinct `pathId` (e.g. `aiDelegation.<uuid>`) so agent-controlled
   * runs are not suppressed by the legacy single-execution key for the same node in normal traversal.
   */
  isWebhookExecuted(nodeId: string, pathId?: string, runId?: string): boolean {
    const keySuffix = this.webhookExecutionKeySuffix(nodeId, pathId, runId);
    return this.getVariable(`webhook.executed.${keySuffix}`) === true;
  }

  /**
   * Get cached response data from a previously executed webhook node
   * @param nodeId The ID of the webhook node
   * @param pathId Optional path identifier to retrieve cached response per path
   * @returns The cached response data, or null if not available
   */
  getWebhookCachedResponse(nodeId: string, pathId?: string, runId?: string): any {
    const keySuffix = this.webhookExecutionKeySuffix(nodeId, pathId, runId);
    return this.getVariable(`webhook.cachedResponse.${keySuffix}`) || null;
  }

  /**
   * Mark an HTTP request node as executed
   * 
   * NOTE: Single-execution semantics scope
   * The execution flags (webhook.executed.*, http.executed.*) are designed for single in-memory
   * flow execution runs. They prevent duplicate executions within the same execution context.
   * These flags are preserved in clearUserVariables() and will persist across session restarts
   * if variables are saved to storage, which means HTTP/webhook nodes will not re-execute
   * even after server restarts or session resumption. This behavior is intentional to prevent
   * duplicate API calls, but maintainers should be aware that these nodes will not re-execute
   * in subsequent flow runs within the same session.
   * 
   * @param nodeId The ID of the HTTP request node
   * @param responseData The response data from the HTTP request call
   * @param pathId Optional path identifier to track execution per path
   */
  markHttpExecuted(nodeId: string, responseData?: any, pathId?: string): void {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    this.setVariable(`http.executed.${keySuffix}`, true);
    this.setVariable(`http.executedAt.${keySuffix}`, new Date().toISOString());
    if (responseData !== undefined) {
      this.setVariable(`http.cachedResponse.${keySuffix}`, responseData);
    }
  }

  /**
   * Check if an HTTP request node has been executed
   * @param nodeId The ID of the HTTP request node
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the HTTP request has been executed, false otherwise
   *
   * Same as webhooks: delegated agent-control invocations use a unique `pathId` so they are not blocked
   * by persisted `http.executed.*` from earlier non-delegation runs with the same node id.
   */
  isHttpExecuted(nodeId: string, pathId?: string): boolean {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`http.executed.${keySuffix}`) === true;
  }

  /**
   * Get cached response data from a previously executed HTTP request node
   * @param nodeId The ID of the HTTP request node
   * @param pathId Optional path identifier to retrieve cached response per path
   * @returns The cached response data, or null if not available
   */
  getHttpCachedResponse(nodeId: string, pathId?: string): any {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`http.cachedResponse.${keySuffix}`) || null;
  }

  markDbExecuted(nodeId: string, responseData?: any, pathId?: string): void {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    this.setVariable(`db.executed.${keySuffix}`, true);
    this.setVariable(`db.executedAt.${keySuffix}`, new Date().toISOString());
    if (responseData !== undefined) {
      this.setVariable(`db.cachedResponse.${keySuffix}`, responseData);
    }
  }

  isDbExecuted(nodeId: string, pathId?: string): boolean {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`db.executed.${keySuffix}`) === true;
  }

  getDbCachedResponse(nodeId: string, pathId?: string): any {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`db.cachedResponse.${keySuffix}`) || null;
  }

  /**
   * Set HTTP request response data.
   * `http.response` is the full result envelope; `http.lastResponse` is the parsed body (`data`) only,
   * including when it is 0, false, "", or null. Dotted paths like `http.response.status` resolve via the nested `http` object.
   */
  setHttpResponse(envelope: {
    status: number;
    statusText: string;
    data: unknown;
    headers: Record<string, string>;
    url: string;
    method: string;
    timestamp: string;
    success: boolean;
    duration: number;
  }): void {
    this.setVariable('http.response', envelope);
    if (Object.prototype.hasOwnProperty.call(envelope, 'data')) {
      this.setVariable('http.lastResponse', envelope.data);
    }
    this.setVariable('http', {
      response: envelope,
      ...(Object.prototype.hasOwnProperty.call(envelope, 'data')
        ? { lastResponse: envelope.data }
        : {}),
      success: envelope.success,
      duration: envelope.duration,
      status: envelope.status,
    });
  }

  /**
   * Set CallAgent response data
   */
  setCallAgentResponse(response: any): void {
    this.setVariable('callAgent.response', response);
    this.setVariable('callAgent.lastResponse', response);
  }

  /**
   * Set contact notification response data
   */
  setContactNotificationResponse(response: any): void {
    this.setVariable('contactNotification.response', response);
    this.setVariable('contactNotification.lastResponse', response);
  }

  /**
   * Mark a contact notification node as executed
   * 
   * NOTE: Single-execution semantics scope
   * The execution flags (contactNotification.executed.*) are designed for single in-memory
   * flow execution runs. They prevent duplicate executions within the same execution context.
   * These flags are preserved in clearUserVariables() and will persist across session restarts
   * if variables are saved to storage, which means contact notification nodes will not re-execute
   * even after server restarts or session resumption. This behavior is intentional to prevent
   * duplicate messages, but maintainers should be aware that these nodes will not re-execute
   * in subsequent flow runs within the same session.
   * 
   * @param nodeId The ID of the contact notification node
   * @param responseData The response data from the notification call
   * @param pathId Optional path identifier to track execution per path
   */
  markContactNotificationExecuted(nodeId: string, responseData?: any, pathId?: string): void {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    this.setVariable(`contactNotification.executed.${keySuffix}`, true);
    this.setVariable(`contactNotification.executedAt.${keySuffix}`, new Date().toISOString());
    if (responseData !== undefined) {
      this.setVariable(`contactNotification.cachedResponse.${keySuffix}`, responseData);
    }
  }

  /**
   * Check if a contact notification node has been executed
   * @param nodeId The ID of the contact notification node
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the contact notification has been executed, false otherwise
   */
  isContactNotificationExecuted(nodeId: string, pathId?: string): boolean {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`contactNotification.executed.${keySuffix}`) === true;
  }

  /**
   * Mark an MCP Execute Tool node as executed
   *
   * NOTE: Single-execution semantics scope
   * The execution flags (mcpExecute.executed.*) are designed for single in-memory
   * flow execution runs. They prevent duplicate executions within the same execution context.
   * These flags are preserved in clearUserVariables() and will persist across session restarts
   * if variables are saved to storage, which means MCP Execute Tool nodes will not re-execute
   * even after server restarts or session resumption. This behavior is intentional to prevent
   * duplicate tool calls, but maintainers should be aware that these nodes will not re-execute
   * in subsequent flow runs within the same session.
   *
   * @param nodeId The ID of the MCP Execute Tool node
   * @param responseData The response data from the MCP tool call
   * @param pathId Optional path identifier to track execution per path
   */
  markMcpExecuteExecuted(nodeId: string, responseData?: any, pathId?: string): void {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    this.setVariable(`mcpExecute.executed.${keySuffix}`, true);
    this.setVariable(`mcpExecute.executedAt.${keySuffix}`, new Date().toISOString());
    if (responseData !== undefined) {
      this.setVariable(`mcpExecute.cachedResponse.${keySuffix}`, responseData);
    }
  }

  /**
   * Check if an MCP Execute Tool node has been executed
   * @param nodeId The ID of the MCP Execute Tool node
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the MCP Execute Tool has been executed, false otherwise
   */
  isMcpExecuteExecuted(nodeId: string, pathId?: string): boolean {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`mcpExecute.executed.${keySuffix}`) === true;
  }

  /**
   * Get cached response data from a previously executed MCP Execute Tool node
   * @param nodeId The ID of the MCP Execute Tool node
   * @param pathId Optional path identifier to retrieve cached response per path
   * @returns The cached response data, or null if not available
   */
  getMcpExecuteCachedResponse(nodeId: string, pathId?: string): any {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`mcpExecute.cachedResponse.${keySuffix}`) || null;
  }

  /**
   * Mark a CallAgent node as executed
   * 
   * NOTE: Single-execution semantics scope
   * The execution flags (callAgent.executed.*) are designed for single in-memory
   * flow execution runs. They prevent duplicate executions within the same execution context.
   * These flags are preserved in clearUserVariables() and will persist across session restarts
   * if variables are saved to storage, which means CallAgent nodes will not re-execute
   * even after server restarts or session resumption. This behavior is intentional to prevent
   * duplicate calls, but maintainers should be aware that these nodes will not re-execute
   * in subsequent flow runs within the same session.
   * 
   * @param nodeId The ID of the CallAgent node
   * @param responseData The response data from the call
   * @param pathId Optional path identifier to track execution per path
   */
  markCallAgentExecuted(nodeId: string, responseData?: any, pathId?: string): void {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    this.setVariable(`callAgent.executed.${keySuffix}`, true);
    this.setVariable(`callAgent.executedAt.${keySuffix}`, new Date().toISOString());
    if (responseData !== undefined) {
      this.setVariable(`callAgent.cachedResponse.${keySuffix}`, responseData);
    }
  }

  /**
   * Check if a CallAgent node has been executed
   * @param nodeId The ID of the CallAgent node
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the CallAgent has been executed, false otherwise
   */
  isCallAgentExecuted(nodeId: string, pathId?: string): boolean {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`callAgent.executed.${keySuffix}`) === true;
  }

  /**
   * Get cached response data from a previously executed CallAgent node
   * @param nodeId The ID of the CallAgent node
   * @param pathId Optional path identifier to retrieve cached response per path
   * @returns The cached response data, or null if not available
   */
  getCallAgentCachedResponse(nodeId: string, pathId?: string): any {
    const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
    return this.getVariable(`callAgent.cachedResponse.${keySuffix}`) || null;
  }

  /**
   * Merge context from another execution context
   */
  mergeContext(otherContext: FlowExecutionContext): void {
    const otherVariables = otherContext.getAllVariables();
    Object.entries(otherVariables).forEach(([key, value]) => {
      if (!key.startsWith('date.') && !key.startsWith('time.') && !key.startsWith('execution.')) {
        this.setVariable(key, value);
      }
    });
  }

  /**
   * Clear all variables except system variables
   * 
   * NOTE: HTTP and Webhook execution state preservation
   * This method preserves http.* and webhook.* variables (including execution flags and
   * cached responses) to maintain single-execution semantics across variable clearing
   * operations. This ensures that HTTP/webhook nodes do not re-execute when variables
   * are cleared, maintaining the intended behavior of executing these nodes only once
   * per flow execution context.
   */
  clearUserVariables(): void {
    // Build a map of preserved key/value pairs
    const preserved = new Map<string, any>();
    
    this.variables.forEach((value, key) => {
      if (
        key.startsWith('date.') ||
        key.startsWith('time.') ||
        key.startsWith('execution.') ||
        key.startsWith('webhook.') ||
        key.startsWith('http.') ||
        key.startsWith('contactNotification.') ||
        key.startsWith('callAgent.')
      ) {
        preserved.set(key, value);
      }
    });

    // Clear all variables
    this.variables.clear();

    // Restore the preserved entries
    preserved.forEach((value, key) => {
      this.setVariable(key, value);
    });

    // Reinitialize system variables (date/time) to ensure they're current
    this.setSystemVariables();
  }

  /**
   * Get context summary for debugging
   */
  getSummary(): any {
    return {
      variableCount: this.variables.size,
      nodeDataCount: this.nodeData.size,
      startTime: this.startTime,
      variables: this.getAllVariables()
    };
  }

  /**
   * Clone the context
   */
  clone(): FlowExecutionContext {
    const newContext = new FlowExecutionContext(undefined, this.companyTimezone ? { timezone: this.companyTimezone } : undefined);

    this.variables.forEach((value, key) => {
      newContext.setVariable(key, value);
    });

    this.nodeData.forEach((value, key) => {
      newContext.setNodeData(key, value);
    });

    return newContext;
  }
}
