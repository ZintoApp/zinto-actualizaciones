/**
 * Shared types for flow execution
 */

export interface FlowExecutionState {
  id: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number;
  currentNodeId: string | null;
  status: 'running' | 'waiting' | 'completed' | 'failed';
  startedAt: Date;
  lastActivity: Date;
  executionPath: string[];
  waitingForInput: boolean;
  lastNodeResult: any;
}

export interface FlowExecutionContext {
  variables: Record<string, any>;
  nodeData: Record<string, any>;
  startTime: Date;
}

export interface NodeExecutionResult {
  success: boolean;
  shouldContinue: boolean;
  nextNodeId?: string;
  waitForUserInput?: boolean;
  error?: string;
  data?: any;
}

/**
 * Normalized per-node result for delegated (agent-control) execution, stored in FlowExecutionContext.nodeData.
 */
export interface NormalizedDelegatedNodeResult {
  /** Resolved canonical node type (e.g. google_sheets, data_capture). */
  nodeType: string;
  success: boolean;
  operation?: string;
  resource?: string;
  /** Short human-readable outcome for UIs and AI summaries. */
  outputSummary?: string;
  /** Non-variable side-effect hints (e.g. ids, counts). */
  sideEffects?: Record<string, unknown>;
  error?: { message: string; details?: unknown };
  executedAt: string;
}

/** Source of an AI Assistant tool invocation (manual tasks or MCP). */
export type AIToolSource = 'manual_task' | 'mcp_tool';

/** Audit record for an MCP tool invoked autonomously by the AI assistant. */
export interface MCPToolInvocationRecord {
  functionName: string;
  originalToolName: string;
  serverId: string;
  serverName: string;
  nodeId?: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  content?: unknown;
  structuredContent?: unknown;
  error?: string;
  durationMs?: number;
  toolSource: 'mcp_tool';
}

/** A custom variable value written by the AI Assistant (set_variable tool). */
export interface AIVariableWrite {
  name: string;
  value: string;
}

export interface AICustomFieldWrite {
  path: string;
  value: unknown;
}

export interface AICustomFieldRuntimeDefinition {
  path: string;
  entity: 'contact' | 'deal';
  customFieldId: number;
  fieldName: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'boolean' | 'file_select';
  options?: unknown;
  readable: boolean;
  writable: boolean;
  unavailableReason?: string;
  requiredForCompletion?: boolean;
  currentValue?: unknown;
  availableFiles?: Array<{ key: string; name: string; mimeType: string; size: number }>;
}

/** Structured AI tool call for routing and audit (manual tasks). */
export interface AIDelegationInvocationRecord {
  outputHandle: string;
  functionName: string;
  arguments: Record<string, unknown>;
  targetNodeId?: string;
  targetNodeType?: string;
  targetNodeLabel?: string;
  toolSource: AIToolSource;
}

/** Node-step / run-level JSON payload for AI delegation audit (stored in tracking JSON columns). */
export interface AIDelegationAuditPayload {
  assistantNodeId: string;
  delegatedNodeId: string;
  delegatedNodeType: string;
  delegatedNodeLabel?: string;
  toolFunctionName: string;
  rawArguments?: unknown;
  outputHandle: string;
  toolSource: AIToolSource;
  guardAllowed: boolean;
  guardDenyReason?: string;
  normalizedResult?: NormalizedDelegatedNodeResult;
  timestamp: string;
  executionMode: 'manual_task';
}

/** Concise run-level summary for execution history / diagnostics. */
export interface AIDelegationRunSummary {
  lastDelegatedToolName?: string;
  lastDelegatedNodeId?: string;
  lastDelegatedNodeType?: string;
  lastResultSummary?: string;
  delegatedCallCount: number;
}

export interface AIAssistantPinnedVariableSnapshot {
  name: string;
  label: string;
  value: string;
  description?: string;
}

export interface AIAssistantPinnedToolOutcomeSummary {
  source: AIToolSource;
  name: string;
  target?: string;
  status: 'triggered' | 'success' | 'failed' | 'blocked';
  detail?: string;
  identifier?: string;
}

export interface AIAssistantPinnedCalendarFact {
  kind: 'availability' | 'booked' | 'updated' | 'cancelled';
  status: 'success' | 'failed' | 'no_slots';
  summary: string;
  date?: string;
  time?: string;
  slots?: string[];
  selectedPersonUserId?: number;
  selectedServiceId?: number | string;
  selectedDurationMinutes?: number;
  selectionMode?: 'customer_selected' | string;
  title?: string;
  attendeeEmail?: string;
  eventId?: string;
  eventLink?: string;
  updatedAt?: string;
}

/** Compact booking snapshot written to `calendar.booking.completedPayload` after Google `book_appointment` success. */
export interface AIAssistantCalendarBookingCompletedPayload {
  eventId?: string;
  eventLink?: string;
  title?: string;
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  selectedPersonUserId?: number;
  selectedPersonName?: string;
  selectedServiceId?: number | string;
  selectedServiceName?: string;
}

export interface AIAssistantBookingSelectionState {
  selectedPerson?: {
    userId: number;
    displayName: string;
    email?: string | null;
    role?: string | null;
  };
  selectedService?: {
    serviceId?: number | string;
    serviceName?: string;
    productType?: string | null;
  };
  selectedDuration?: {
    minutes: number;
    source?: string;
  };
  updatedAt?: string;
  selectedPersonUpdatedAt?: string;
  selectedServiceUpdatedAt?: string;
  selectedDurationUpdatedAt?: string;
}

export interface AIAssistantConversationSummary {
  text: string;
  updatedAt: string;
  coveredMessageCount?: number;
  coveredThroughMessageId?: number;
  facts?: {
    customerName?: string;
    deliveryAddress?: string;
    selectedProducts?: string[];
    quantities?: string[];
    notes?: string[];
    pendingConfirmationState?: string;
    lastOrderId?: string | number;
    lastInvoiceId?: string | number;
  };
}

export interface AIAssistantErpLineItemState {
  productId?: number | string;
  variantId?: number | string | null;
  productName?: string;
  quantity?: number | string;
  unitPrice?: string;
  notes?: string;
  specialInstructions?: string;
}

/** Normalized ERP catalog item shared between prompt memory, tool results, and outbound delivery. */
export interface AIAssistantErpCatalogItem {
  productId?: number | string;
  productName?: string;
  sku?: string | null;
  type?: string | null;
  unitPrice?: string | null;
  currency?: string | null;
  estimatedDurationMinutes?: number | null;
  description?: string | null;
  /** All public product image URLs in upload order. */
  imageUrls?: string[];
  /** First image URL; kept for backward compatibility (`imageUrls[0]`). */
  primaryImageUrl?: string | null;
  hasImage?: boolean;
}

/** Lightweight footprint of the latest ERP product search for delivery-time decisions. */
export interface AIAssistantErpLastProductSearch {
  isMenuCatalog: boolean;
  query?: string | null;
  resultCount: number;
  imageMatchItems?: AIAssistantErpCatalogItem[];
}

export interface AIAssistantErpContext {
  activeOrderDraft?: {
    customerName?: string;
    deliveryAddress?: unknown;
    selectedLineItems?: AIAssistantErpLineItemState[];
    notes?: string;
    confirmationState?: 'collecting' | 'pending_confirmation' | 'confirmed' | 'cancelled' | string;
    salesOrderId?: number | string;
    orderNumber?: string;
    status?: string;
  };
  menuCatalogItems?: AIAssistantErpCatalogItem[];
  lastProductSearch?: AIAssistantErpLastProductSearch;
  /** Set when erp_search_products runs for the current assistant turn; cleared after outbound send. */
  pendingProductSearchDelivery?: boolean;
  /** Set when erp_send_product_image runs for the current assistant turn; cleared after outbound send. */
  pendingImageDeliveryItems?: AIAssistantErpCatalogItem[];
  createdOrderId?: number | string;
  invoiceId?: number | string;
  lastStatus?: string;
  lastOperation?: string;
  lastUpdatedAt?: string;
}

export interface AIAssistantPinnedState {
  latestUserAsk?: string;
  voiceTranscript?: string;
  conversationSummary?: AIAssistantConversationSummary;
  erpContext?: AIAssistantErpContext;
  bookingSelection?: AIAssistantBookingSelectionState;
  activeCustomVariables?: AIAssistantPinnedVariableSnapshot[];
  variablesComplete?: boolean;
  recentToolOutcomes?: AIAssistantPinnedToolOutcomeSummary[];
  calendarFacts?: {
    availability?: AIAssistantPinnedCalendarFact;
    booked?: AIAssistantPinnedCalendarFact;
    updated?: AIAssistantPinnedCalendarFact;
    cancelled?: AIAssistantPinnedCalendarFact;
  };
}

export type FlowExecutionEventType =
  | 'flowExecutionStarted'
  | 'flowExecutionUpdated'
  | 'flowExecutionWaiting'
  | 'flowExecutionCompleted'
  | 'flowExecutionFailed'
  | 'flowExecutionResumed';

export type FlowNodeExecutionEventType =
  | 'flowNodeExecutionStarted'
  | 'flowNodeExecutionWaiting'
  | 'flowNodeExecutionCompleted'
  | 'flowNodeExecutionFailed'
  | 'flowNodeExecutionSkipped';

export interface FlowExecutionEventData {
  executionId: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number;
  currentNodeId?: string;
  status?: 'running' | 'waiting' | 'completed' | 'failed';
  executionPath?: string[];
  error?: string;
  result?: any;
  duration?: number;
  userInput?: any;
  waitingNodeId?: string;
}

export interface FlowExecutionEvent {
  type: FlowExecutionEventType;
  data: FlowExecutionEventData;
}

export interface FlowExecutionStats {
  total: number;
  running: number;
  waiting: number;
  completed: number;
  failed: number;
}

export interface FlowExecutionConfig {
  enableRealTimeUpdates: boolean;
  executionTimeout: number; // in milliseconds
  maxConcurrentExecutions: number;
  retryFailedNodes: boolean;
  logExecutionPath: boolean;
}

export interface NodeExecutionConfig {
  timeout?: number;
  retryCount?: number;
  skipOnError?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface FlowTriggerEvent {
  type: 'message_received' | 'webhook' | 'webhook_trigger' | 'schedule' | 'manual' | 'deal_enters_pipeline' | 'deal_moves_between_pipelines' | 'deal_stage_changed';
  data: {
    messageId?: number;
    conversationId: number;
    contactId: number;
    channelConnectionId: number;
    triggerData?: any;
    webhookTriggerId?: number;
    webhookRequestId?: string;
    webhookPayload?: any;
    webhookHeaders?: Record<string, string>;
    webhookQueryParams?: Record<string, string>;
    webhookMetadata?: any;
  };
}

export interface PipelineTriggerData {
  dealId: number;
  contactId: number;
  pipelineId: number;
  stageId?: number;
  previousPipelineId?: number;
  previousStageId?: number;
  triggeredBy: 'user' | 'automation' | 'flow';
}

export interface FlowExecutionMetrics {
  executionId: string;
  flowId: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  nodesExecuted: number;
  totalNodes: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  errorCount: number;
  lastError?: string;
  executionPath: string[];
  performance: {
    averageNodeExecutionTime: number;
    slowestNode: {
      nodeId: string;
      executionTime: number;
    };
    fastestNode: {
      nodeId: string;
      executionTime: number;
    };
  };
}

export interface FlowExecutionLog {
  id: string;
  executionId: string;
  nodeId: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  duration?: number;
}

export interface FlowExecutionSummary {
  executionId: string;
  flowId: number;
  flowName: string;
  conversationId: number;
  contactId: number;
  contactName?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  nodesExecuted: number;
  totalNodes: number;
  successRate: number;
  errorCount: number;
  lastError?: string;
  triggerType: string;
  executionPath: string[];
}

export type DurableFlowExecutionStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'abandoned' | 'timeout';

export type DurableFlowStepExecutionStatus = 'running' | 'completed' | 'failed' | 'skipped' | 'waiting' | 'timeout';

export interface DurableFlowExecutionSummary {
  id: number;
  runId: string;
  executionId: string;
  runtimeType: 'legacy' | 'session';
  sessionId: string | null;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number | null;
  status: DurableFlowExecutionStatus;
  triggerNodeId: string;
  currentNodeId: string | null;
  executionPath: unknown;
  startedAt: Date | string | null;
  lastActivityAt?: Date | string | null;
  completedAt: Date | string | null;
  totalDurationMs: number | null;
  errorMessage: string | null;
}

export interface DurableFlowStepExecutionSummary {
  id: number;
  flowExecutionId: number;
  sessionId: string | null;
  nodeId: string;
  nodeType: string;
  stepOrder: number;
  status: DurableFlowStepExecutionStatus;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  durationMs: number | null;
  errorMessage: string | null;
  inputData: unknown;
  outputData: unknown;
  retryCount: number | null;
  maxRetries: number | null;
}

export interface DurableFlowExecutionDetailResponse {
  run: DurableFlowExecutionSummary & {
    contextData: unknown;
  };
  steps: DurableFlowStepExecutionSummary[];
}


export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  clientId?: string;
}

export interface FlowExecutionWebSocketMessage extends WebSocketMessage {
  type: FlowExecutionEventType | FlowNodeExecutionEventType;
  data: FlowExecutionEventData | FlowNodeExecutionEventData;
}


export type NodeExecutionStatus = 'pending' | 'executing' | 'executed' | 'waiting' | 'failed' | 'skipped';

export interface FlowNodeExecutionEventData {
  executionId?: string;
  sessionId?: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number;
  nodeId: string;
  nodeType: string;
  status: Exclude<NodeExecutionStatus, 'pending'>;
  duration?: number;
  error?: string;
  result?: any;
  timestamp?: Date | string;
}

export interface FlowNodeExecutionEvent {
  type: FlowNodeExecutionEventType;
  data: FlowNodeExecutionEventData;
}

export interface NodeExecutionInfo {
  nodeId: string;
  status: NodeExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  result?: any;
  retryCount?: number;
}


export interface FlowExecutionQuery {
  flowId?: number;
  conversationId?: number;
  contactId?: number;
  status?: FlowExecutionState['status'];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'startTime' | 'endTime' | 'duration' | 'status';
  sortOrder?: 'asc' | 'desc';
}


export interface FlowExecutionAnalytics {
  flowId: number;
  flowName: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  successRate: number;
  mostExecutedNodes: Array<{
    nodeId: string;
    nodeType: string;
    executionCount: number;
  }>;
  commonFailurePoints: Array<{
    nodeId: string;
    nodeType: string;
    failureCount: number;
    failureRate: number;
  }>;
  performanceMetrics: {
    averageExecutionTime: number;
    medianExecutionTime: number;
    p95ExecutionTime: number;
    p99ExecutionTime: number;
  };
  triggerAnalytics: {
    messageReceived: number;
    webhook: number;
    schedule: number;
    manual: number;
  };
}
