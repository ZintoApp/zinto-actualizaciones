import type { ZodType } from 'zod';

export type FlowValidationSeverity = 'structural' | 'setup' | 'warning';

export type FlowNodeFieldDefinition = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
  description: string;
  required?: boolean;
  setupRequired?: boolean;
  values?: readonly string[];
  sensitive?: boolean;
  condition?: string;
  defaultValue?: unknown;
  /** Schema for array/object members when a node field contains structured configuration. */
  itemFields?: FlowNodeFieldDefinition[];
};

export type FlowCredentialRequirement = {
  key: string;
  label: string;
  description: string;
  fields?: string[];
  oauthService?: string;
  requiredForActivation: boolean;
};

export type FlowNodeHandleDefinition = {
  id: string;
  kind: 'source' | 'target';
  label?: string;
  controlFlow?: boolean;
  acceptsNodeTypes?: string[];
};

export type FlowNodeDefinition = {
  canvasType: string;
  canonicalType: string;
  aliases: string[];
  displayName: string;
  category: string;
  description: string;
  visible: boolean;
  generatable: boolean;
  canvasOnly?: boolean;
  entryPoint?: boolean;
  terminal?: boolean;
  fields: FlowNodeFieldDefinition[];
  handles: FlowNodeHandleDefinition[];
  credentials: FlowCredentialRequirement[];
  operations: string[];
  inputs: string[];
  outputs: string[];
  variableOutputs: string[];
  mappingFields: string[];
  behavior: string[];
  limitations: string[];
  examples: string[];
  keywords: string[];
  defaultData: () => Record<string, unknown>;
  dataSchema: ZodType<Record<string, unknown>>;
};

export type FlowGraphNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  [key: string]: unknown;
};

export type FlowGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type FlowGraphDraft = {
  name?: string;
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  customVariables?: Array<Record<string, unknown>>;
};

export type FlowValidationIssue = {
  severity: FlowValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  field?: string;
  requirementKey?: string;
};

export type FlowValidationResult = {
  valid: boolean;
  issues: FlowValidationIssue[];
  structuralIssues: FlowValidationIssue[];
  setupIssues: FlowValidationIssue[];
  warnings: FlowValidationIssue[];
};

export type AiFlowCreatorProvider = 'openai' | 'openrouter' | 'azure';
export type AiFlowCreatorCredentialSource = 'auto' | 'company' | 'system' | 'manual';
export type AiFlowCreatorMode = 'normal' | 'interactive';

export type AiFlowCreatorGraphOperation =
  | { type: 'add_node'; operationId: string; node: FlowGraphNode; label?: string; field?: string }
  | { type: 'update_node'; operationId: string; nodeId: string; patch: Record<string, unknown>; node: FlowGraphNode; label?: string; field?: string }
  | { type: 'move_node'; operationId: string; nodeId: string; position: { x: number; y: number }; node: FlowGraphNode; label?: string }
  | { type: 'remove_node'; operationId: string; nodeId: string; label?: string }
  | { type: 'add_edge'; operationId: string; edge: FlowGraphEdge; label?: string }
  | { type: 'remove_edge'; operationId: string; edgeId: string; label?: string };

export type AiFlowCreatorActivityEntry = {
  id: string;
  kind: 'narration' | 'operation' | 'validation';
  text: string;
  state?: 'active' | 'complete' | 'failed';
  operationType?: AiFlowCreatorGraphOperation['type'];
  nodeId?: string;
  edgeId?: string;
  createdAt?: string | Date;
};

export type AiFlowCreatorGenerationPhase = 'preflight' | 'retrieval' | 'planning' | 'building' | 'validating' | 'repairing';
export type AiFlowCreatorProgressPhase = AiFlowCreatorGenerationPhase | 'finalizing' | 'model_adjusted' | 'starting';
export type AiFlowCreatorProgressKind = 'narrative' | 'action';
export type AiFlowCreatorProgressState = 'streaming' | 'active' | 'complete' | 'failed';
export type AiFlowCreatorProgressMessageKey = `flow_builder.creator.progress.${AiFlowCreatorProgressPhase}.${AiFlowCreatorProgressKind}`;

export type AiFlowCreatorProgressEvent = {
  type: 'progress';
  generationId: string;
  entryId: string;
  phase: AiFlowCreatorProgressPhase;
  kind: AiFlowCreatorProgressKind;
  state: AiFlowCreatorProgressState;
  messageKey: AiFlowCreatorProgressMessageKey;
  params?: Record<string, string | number>;
  /** Monotonic reveal position for narrative entries. Actions do not use chunk fields. */
  chunkIndex?: number;
  chunkCount?: number;
};

export type AiFlowCreatorAttachmentKind = 'image' | 'document';

/** Safe attachment metadata exposed to the client and event stream. File contents are never persisted. */
export type AiFlowCreatorAttachmentDescriptor = {
  name: string;
  mimeType: string;
  size: number;
  kind: AiFlowCreatorAttachmentKind;
};

export type AiFlowGenerationEvent =
  | { type: 'started'; generationId: string }
  | { type: 'assistant_delta'; generationId: string; messageId: string; delta: string }
  | { type: 'operation_started'; generationId: string; operationId: string; operationType: AiFlowCreatorGraphOperation['type']; label: string; nodeId?: string; edgeId?: string; field?: string }
  | { type: 'operation_applied'; generationId: string; operation: AiFlowCreatorGraphOperation; draft: FlowGraphDraft }
  | { type: 'operation_rejected'; generationId: string; operationId: string; operationType: string; label: string; message: string }
  | { type: 'canvas_focus'; generationId: string; nodeId: string; field?: string }
  | { type: 'model_adjusted'; generationId: string; previousModel: string; model: string; reason: 'image_support' }
  | { type: 'phase'; generationId: string; phase: AiFlowCreatorGenerationPhase; message: string; attempt?: number }
  | AiFlowCreatorProgressEvent
  | { type: 'assumption'; generationId: string; assumption: string }
  | { type: 'node'; generationId: string; node: FlowGraphNode }
  | { type: 'edge'; generationId: string; edge: FlowGraphEdge }
  | { type: 'validation'; generationId: string; result: FlowValidationResult }
  | { type: 'complete'; generationId: string; generationProof: string; beforeGraphHash: string; draft: FlowGraphDraft; summary: string; assumptions: string[]; validation: FlowValidationResult; graphHash: string; provider: AiFlowCreatorProvider; credentialSource: AiFlowCreatorCredentialSource; model: string; activity?: AiFlowCreatorActivityEntry[] }
  | { type: 'error'; generationId: string; code: string; message: string; retryable?: boolean; activeBusinessType?: string; requestedBusinessType?: string };

export type AiCreatorCommitMetadata = {
  generationId: string;
  generationProof?: string;
  provider?: AiFlowCreatorProvider;
  model?: string;
  credentialSource?: AiFlowCreatorCredentialSource;
  generatedGraphHash: string;
  beforeGraphHash: string;
  acceptedGraphHash: string;
  prompt?: string;
  summary: string;
  assumptions: string[];
  validation: FlowValidationResult;
  temporaryMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type AiFlowCreatorHistory = {
  messages: Array<{
    id: number;
    role: 'user' | 'assistant';
    kind: string;
    content: string;
    activity?: AiFlowCreatorActivityEntry[];
    createdAt: string | Date;
  }>;
  revisions: Array<{
    id: number;
    generationId: string;
    summary: string;
    assumptions: string[];
    validation: FlowValidationResult;
    generatedGraphHash: string;
    beforeGraphHash: string;
    acceptedGraphHash: string;
    savedGraphHash: string;
    createdAt: string | Date;
  }>;
};
