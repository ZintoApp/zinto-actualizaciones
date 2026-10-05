import {
  AI_TOOL_INPUT_HANDLE_ID,
  FLOW_DEFAULT_TARGET_HANDLE_ID,
  getFlowNodeDefinition,
} from './flow-node-registry';
import type {
  FlowGraphDraft,
  FlowGraphEdge,
  FlowGraphNode,
  FlowValidationIssue,
  FlowValidationResult,
} from './types/ai-flow-creator';
import { sha256Hex } from './sha256';
import {
  ERP_OPERATIONS,
  ERP_RESOURCE_BUSINESS_TYPE,
  ERP_RESOURCES,
  type ErpBusinessType,
  type ErpResource,
} from './erp-capabilities';

export type FlowGraphValidationOptions = {
  mode?: 'creator' | 'activation' | 'compatibility';
  setupAvailability?: Record<string, boolean>;
  erpBusinessType?: ErpBusinessType;
};

function isMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function isControlFlowEdge(edge: FlowGraphEdge): boolean {
  return edge.targetHandle !== AI_TOOL_INPUT_HANDLE_ID && edge.data?.isMcpToolEdge !== true;
}

function issue(
  severity: FlowValidationIssue['severity'],
  code: string,
  message: string,
  extra: Partial<FlowValidationIssue> = {},
): FlowValidationIssue {
  return { severity, code, message, ...extra };
}

function validateSetupFields(node: FlowGraphNode, issues: FlowValidationIssue[]): void {
  const definition = getFlowNodeDefinition(node.type, String(node.data?.label ?? ''));
  if (!definition) return;

  for (const field of definition.fields) {
    if (!field.setupRequired || !isMissing(node.data?.[field.name])) continue;
    issues.push(issue('setup', 'missing_setup_field', `${definition.displayName} requires ${field.name} before activation.`, {
      nodeId: node.id,
      field: field.name,
      requirementKey: `${definition.canvasType}:${field.name}`,
    }));
  }

  for (const credential of definition.credentials) {
    if (!credential.requiredForActivation) continue;
    if (credential.oauthService) {
      issues.push(issue('setup', 'missing_oauth_connection', `${credential.label} must be connected before activation.`, {
        nodeId: node.id,
        requirementKey: credential.key,
      }));
      continue;
    }
    const fields = credential.fields ?? [];
    const hasInlineOrReference = fields.some((field) => !isMissing(node.data?.[field]));
    const credentialSource = String(node.data?.credentialSource ?? '');
    const canResolveSharedCredential = ['auto', 'company', 'system'].includes(credentialSource);
    if (!hasInlineOrReference && !canResolveSharedCredential) {
      issues.push(issue('setup', 'missing_credential', `${credential.label} must be configured before activation.`, {
        nodeId: node.id,
        requirementKey: credential.key,
      }));
    }
  }

  if (node.type === 'database_query') {
    const hasConnectionString = !isMissing(node.data.connectionString);
    const hasFields = !isMissing(node.data.host) && !isMissing(node.data.database) && !isMissing(node.data.username);
    if (!hasConnectionString && !hasFields) {
      issues.push(issue('setup', 'missing_database_connection', 'Database requires a connection string or host, database, and username.', { nodeId: node.id, requirementKey: 'database' }));
    }
  }
  if (node.type === 'mcp_client_tool') {
    const servers = Array.isArray(node.data.servers) ? node.data.servers : [];
    if (!servers.some((server) => server && typeof server === 'object' && !isMissing((server as Record<string, unknown>).url))) {
      issues.push(issue('setup', 'missing_mcp_server_url', 'MCP Client Tool requires at least one server URL.', { nodeId: node.id, requirementKey: 'mcp-server' }));
    }
  }
  if (node.type === 'mcp_execute_tool') {
    const config = node.data.serverConfig as Record<string, unknown> | undefined;
    if (!config || isMissing(config.url)) {
      issues.push(issue('setup', 'missing_mcp_server_url', 'MCP Execute Tool requires a server URL.', { nodeId: node.id, requirementKey: 'mcp-execute-server' }));
    }
  }
  if (node.type === 'flow_trigger' && Number(node.data.targetFlowId) <= 0) {
    issues.push(issue('setup', 'missing_target_flow', 'Trigger Flow requires a saved target flow.', { nodeId: node.id, requirementKey: 'target-flow' }));
  }
}

function validateConditionalConfiguration(
  node: FlowGraphNode,
  issues: FlowValidationIssue[],
  options: Required<Pick<FlowGraphValidationOptions, 'mode'>> & Pick<FlowGraphValidationOptions, 'erpBusinessType'>,
): void {
  const mode = options.mode;
  const data = node.data ?? {};
  if (node.type === 'update_pipeline_stage') {
    const operation = String(data.operation ?? 'update_stage');
    if (mode === 'creator') {
      for (const field of ['dealDueDate', 'dealAssignedToUserId', 'targetPipelineId']) {
        if (data[field] != null) {
          issues.push(issue('structural', 'unsupported_pipeline_deal_field', `Pipeline ${operation} does not support generated field “${field}”.`, { nodeId: node.id, field }));
        }
      }
    }
    if (operation === 'create_stage' && isMissing(data.stageName)) {
      issues.push(issue('structural', 'missing_pipeline_stage_name', 'Pipeline create_stage requires stageName.', { nodeId: node.id, field: 'stageName' }));
    }
    if (operation === 'update_stage' && isMissing(data.stageId)) {
      issues.push(issue('setup', 'missing_pipeline_stage', 'Pipeline update_stage requires a target stage before activation.', { nodeId: node.id, field: 'stageId', requirementKey: 'update_pipeline_stage:stageId' }));
    }
    if (operation === 'update_deal') {
      const updateFields = ['pipelineId', 'stageId', 'dealTitle', 'dealValue', 'dealPriority', 'dealDescription', 'customFieldsToSet'];
      if (!data.createDealIfNotExists && updateFields.every((field) => isMissing(data[field]))) {
        issues.push(issue('warning', 'empty_deal_update', 'Pipeline update_deal has no deal fields to update.', { nodeId: node.id }));
      }
    }
    if (data.enableStageRevert === true) {
      if (isMissing(data.revertToStageId)) {
        issues.push(issue('setup', 'missing_revert_stage', 'Stage revert requires revertToStageId before activation.', { nodeId: node.id, field: 'revertToStageId', requirementKey: 'update_pipeline_stage:revertToStageId' }));
      }
      const amount = Number(data.revertTimeAmount);
      if (!Number.isFinite(amount) || amount < 1 || amount > 999) {
        issues.push(issue('structural', 'invalid_revert_time', 'Stage revert time must be between 1 and 999.', { nodeId: node.id, field: 'revertTimeAmount' }));
      }
      if (!['hours', 'days'].includes(String(data.revertTimeUnit))) {
        issues.push(issue('structural', 'invalid_revert_unit', 'Stage revert time unit must be hours or days.', { nodeId: node.id, field: 'revertTimeUnit' }));
      }
    }
    for (const field of ['tagsToAdd', 'tagsToRemove']) {
      if (Array.isArray(data[field]) && data[field].some((tag) => typeof tag !== 'string')) {
        issues.push(issue('structural', 'invalid_pipeline_tag', `${field} entries must be strings or variable expressions.`, { nodeId: node.id, field }));
      }
    }
    if (data.customFieldsToSet && typeof data.customFieldsToSet === 'object' && !Array.isArray(data.customFieldsToSet)) {
      for (const [field, value] of Object.entries(data.customFieldsToSet as Record<string, unknown>)) {
        const validArray = Array.isArray(value) && value.every((entry) => typeof entry === 'string');
        if (!['string', 'number', 'boolean'].includes(typeof value) && !validArray) {
          issues.push(issue('structural', 'invalid_deal_custom_field_value', `Deal custom field “${field}” must be a string, number, boolean, or string array.`, { nodeId: node.id, field: `customFieldsToSet.${field}` }));
        }
      }
    }
  }
  if (node.type === 'manage_task') {
    const operation = data.operation;
    if (operation === 'create_task' && isMissing(data.title)) {
      issues.push(issue('structural', 'missing_task_title', 'Manage Task create_task requires a title.', { nodeId: node.id, field: 'title' }));
    }
    if ((operation === 'update_task' || operation === 'delete_task') && isMissing(data.taskIdVariable)) {
      issues.push(issue('structural', 'missing_task_id', `Manage Task ${operation} requires taskIdVariable.`, { nodeId: node.id, field: 'taskIdVariable' }));
    }
    if (operation === 'delete_task' && data.deleteConfirmation !== true) {
      issues.push(issue('setup', 'task_delete_confirmation', 'Task deletion must be explicitly confirmed before activation.', { nodeId: node.id, field: 'deleteConfirmation' }));
    }
  }
  if (node.type === 'manage_contact' && data.operation === 'delete_contact' && data.deleteConfirmation !== true) {
    issues.push(issue('setup', 'contact_delete_confirmation', 'Contact deletion must be explicitly confirmed before activation.', { nodeId: node.id, field: 'deleteConfirmation' }));
  }
  if (node.type === 'stripe') {
    const resource = data.resource;
    const operation = data.operation;
    if (resource === 'payment' && ['createCharge', 'createPaymentIntent'].includes(String(operation)) && isMissing(data.amount)) {
      issues.push(issue('setup', 'stripe_amount_required', 'Stripe payment creation requires an amount.', { nodeId: node.id, field: 'amount' }));
    }
    if (resource === 'subscription' && operation === 'create' && (isMissing(data.customer) || (isMissing(data.priceId) && isMissing(data.plan)))) {
      issues.push(issue('setup', 'stripe_subscription_fields', 'Stripe subscription creation requires a customer and price or plan.', { nodeId: node.id }));
    }
  }
  if (node.type === 'erp') {
    const resource = String(data.resource ?? '') as ErpResource;
    const operation = String(data.operation ?? '');
    if (!ERP_RESOURCES.includes(resource)) {
      issues.push(issue('structural', 'unsupported_erp_resource', `Unsupported ERP resource “${resource || '(missing)'}”.`, { nodeId: node.id, field: 'resource' }));
    } else if (!ERP_OPERATIONS[resource].includes(operation)) {
      issues.push(issue('structural', 'unsupported_erp_operation', `ERP resource “${resource}” does not support operation “${operation || '(missing)'}”.`, { nodeId: node.id, field: 'operation' }));
    }
    const requiredBusinessType = ERP_RESOURCE_BUSINESS_TYPE[resource];
    if (requiredBusinessType && data.requiredBusinessType !== requiredBusinessType) {
      issues.push(issue('structural', 'invalid_erp_business_type_marker', `ERP resource “${resource}” must declare requiredBusinessType “${requiredBusinessType}”.`, { nodeId: node.id, field: 'requiredBusinessType' }));
    }
    if (requiredBusinessType && options.erpBusinessType && requiredBusinessType !== options.erpBusinessType) {
      issues.push(issue('structural', 'erp_business_type_mismatch', `ERP resource “${resource}” requires ${requiredBusinessType} mode, but ${options.erpBusinessType} mode is active.`, { nodeId: node.id, field: 'requiredBusinessType', requirementKey: `erp-business-type:${requiredBusinessType}` }));
    }
  }
}

const CREATOR_DATA_CAPTURE_SOURCE_TYPES = new Set(['custom_prompt', 'regex_extract']);
const LEGACY_DATA_CAPTURE_SOURCE_TYPES = new Set(['message_content', 'contact_field', 'regex_extract', 'user_input', 'custom_prompt']);
const CREATOR_DATA_CAPTURE_TYPES = new Set(['string', 'number', 'email', 'phone', 'media']);
const LEGACY_DATA_CAPTURE_TYPES = new Set(['string', 'number', 'boolean', 'email', 'phone', 'date', 'media']);
const DATA_CAPTURE_MEDIA_KINDS = new Set(['any', 'image', 'video', 'audio', 'document']);
const CREATOR_DATA_CAPTURE_RULE_FIELDS = new Set([
  'id', 'variableName', 'sourceType', 'sourceValue', 'dataType', 'mediaKind', 'required', 'validationErrorMessage', 'description',
]);

function validateDataCapture(
  node: FlowGraphNode,
  issues: FlowValidationIssue[],
  mode: NonNullable<FlowGraphValidationOptions['mode']>,
): void {
  if (node.type !== 'data_capture') return;
  const captureRules = node.data?.captureRules;
  if (!Array.isArray(captureRules)) return;
  if (captureRules.length === 0) {
    issues.push(issue('structural', 'missing_capture_rules', 'Data Capture requires at least one capture rule.', { nodeId: node.id, field: 'captureRules' }));
    return;
  }

  if (mode === 'creator') {
    if (node.data.formMode !== true) {
      issues.push(issue('structural', 'unsupported_capture_mode', 'Generated Data Capture nodes must use sequential form mode.', { nodeId: node.id, field: 'formMode' }));
    }
    if (node.data.storageScope !== 'session') {
      issues.push(issue('structural', 'unsupported_capture_scope', 'Generated Data Capture nodes must use session storage scope.', { nodeId: node.id, field: 'storageScope' }));
    }
  }

  const ruleIds = new Set<string>();
  const variableNames = new Set<string>();
  captureRules.forEach((entry, index) => {
    const baseField = `captureRules.${index}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(issue('structural', 'invalid_capture_rule', 'Each Data Capture rule must be an object.', { nodeId: node.id, field: baseField }));
      return;
    }
    const rule = entry as Record<string, unknown>;
    const id = String(rule.id ?? '').trim();
    const variableName = String(rule.variableName ?? '').trim();
    const sourceType = String(rule.sourceType ?? '').trim();
    const dataType = String(rule.dataType ?? '').trim();

    if (mode === 'creator') {
      const unsupportedFields = Object.keys(rule).filter((key) => !CREATOR_DATA_CAPTURE_RULE_FIELDS.has(key));
      for (const field of unsupportedFields) {
        issues.push(issue('structural', 'unsupported_capture_rule_field', `Data Capture does not expose rule field “${field}” to generated workflows.`, { nodeId: node.id, field: `${baseField}.${field}` }));
      }
    }

    if (!id) {
      issues.push(issue('structural', 'missing_capture_rule_id', 'Each Data Capture rule requires a stable ID.', { nodeId: node.id, field: `${baseField}.id` }));
    } else if (ruleIds.has(id)) {
      issues.push(issue('structural', 'duplicate_capture_rule_id', `Duplicate Data Capture rule ID “${id}”.`, { nodeId: node.id, field: `${baseField}.id` }));
    }
    if (id) ruleIds.add(id);

    if (!variableName || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(variableName)) {
      issues.push(issue('structural', 'invalid_capture_variable', 'Each capture rule requires a valid variableName.', { nodeId: node.id, field: `${baseField}.variableName` }));
    } else if (variableNames.has(variableName)) {
      issues.push(issue('structural', 'duplicate_capture_variable', `Data Capture cannot write more than one rule to “${variableName}”.`, { nodeId: node.id, field: `${baseField}.variableName` }));
    }
    if (variableName) variableNames.add(variableName);

    const sourceTypes = mode === 'creator' ? CREATOR_DATA_CAPTURE_SOURCE_TYPES : LEGACY_DATA_CAPTURE_SOURCE_TYPES;
    if (!sourceTypes.has(sourceType)) {
      issues.push(issue('structural', 'unsupported_capture_source', `Unsupported Data Capture sourceType “${sourceType || '(missing)'}”.`, { nodeId: node.id, field: `${baseField}.sourceType` }));
    }
    const dataTypes = mode === 'creator' ? CREATOR_DATA_CAPTURE_TYPES : LEGACY_DATA_CAPTURE_TYPES;
    if (!dataTypes.has(dataType)) {
      issues.push(issue('structural', 'unsupported_capture_data_type', `Unsupported Data Capture dataType “${dataType || '(missing)'}”.`, { nodeId: node.id, field: `${baseField}.dataType` }));
    }
    if (typeof rule.required !== 'boolean') {
      issues.push(issue('structural', 'invalid_capture_required', 'Data Capture rule required must be a boolean.', { nodeId: node.id, field: `${baseField}.required` }));
    }

    if (sourceType === 'custom_prompt' && isMissing(rule.description)) {
      issues.push(issue('structural', 'missing_capture_prompt', 'A custom_prompt capture rule requires a user-facing description/prompt.', { nodeId: node.id, field: `${baseField}.description` }));
    }
    if (sourceType === 'regex_extract') {
      if (isMissing(rule.sourceValue)) {
        issues.push(issue('structural', 'missing_capture_regex', 'A regex_extract capture rule requires sourceValue.', { nodeId: node.id, field: `${baseField}.sourceValue` }));
      } else {
        try {
          new RegExp(String(rule.sourceValue), 'iu');
        } catch {
          issues.push(issue('structural', 'invalid_capture_regex', 'Data Capture sourceValue must be a valid Unicode regular expression.', { nodeId: node.id, field: `${baseField}.sourceValue` }));
        }
      }
    }

    if (dataType === 'media') {
      const mediaKind = String(rule.mediaKind ?? 'any');
      if (!DATA_CAPTURE_MEDIA_KINDS.has(mediaKind)) {
        issues.push(issue('structural', 'unsupported_capture_media_kind', `Unsupported Data Capture mediaKind “${mediaKind}”.`, { nodeId: node.id, field: `${baseField}.mediaKind` }));
      }
    }
  });
}

function validateMappingsAndExpressions(node: FlowGraphNode, issues: FlowValidationIssue[], mode: NonNullable<FlowGraphValidationOptions['mode']>): void {
  const mappings = node.data?.variableMappings;
  if (mappings != null && !Array.isArray(mappings)) {
    issues.push(issue('structural', 'invalid_variable_mappings', 'variableMappings must be an array.', { nodeId: node.id, field: 'variableMappings' }));
  } else if (Array.isArray(mappings)) {
    mappings.forEach((mapping, index) => {
      if (!mapping || typeof mapping !== 'object') {
        issues.push(issue('structural', 'invalid_variable_mapping', 'Each variable mapping must be an object.', { nodeId: node.id, field: `variableMappings.${index}` }));
        return;
      }
      const current = mapping as Record<string, unknown>;
      const source = current.responseField ?? current.path;
      const target = current.variableName ?? current.variable;
      if (isMissing(source) || isMissing(target)) {
        issues.push(issue('structural', 'incomplete_variable_mapping', 'Each variable mapping requires a response field/path and target variable.', { nodeId: node.id, field: `variableMappings.${index}` }));
      } else if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(String(target))) {
        issues.push(issue('structural', 'invalid_variable_name', `Invalid mapped variable name “${String(target)}”.`, { nodeId: node.id, field: `variableMappings.${index}` }));
      }
    });
  }

  validateDataCapture(node, issues, mode);

  const inspect = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      const openings = value.match(/\{\{/g)?.length ?? 0;
      const closings = value.match(/\}\}/g)?.length ?? 0;
      if (openings !== closings || /\{\{\s*\}\}/.test(value)) {
        issues.push(issue('structural', 'malformed_variable_reference', `Malformed variable expression in ${path}.`, { nodeId: node.id, field: path }));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspect(entry, `${path}.${index}`));
    } else if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => inspect(child, path ? `${path}.${key}` : key));
    }
  };
  inspect(node.data, 'data');
}

function validateHandlesAndCompatibility(
  edge: FlowGraphEdge,
  sourceNode: FlowGraphNode,
  targetNode: FlowGraphNode,
  issues: FlowValidationIssue[],
): void {
  const sourceDefinition = getFlowNodeDefinition(sourceNode.type, String(sourceNode.data?.label ?? ''));
  const targetDefinition = getFlowNodeDefinition(targetNode.type, String(targetNode.data?.label ?? ''));
  if (!sourceDefinition || !targetDefinition) return;

  if (sourceDefinition.canvasOnly || targetDefinition.canvasOnly) {
    issues.push(issue('structural', 'annotation_connection', 'Notes and other canvas-only nodes cannot be connected.', { edgeId: edge.id }));
    return;
  }
  if (sourceDefinition.terminal && isControlFlowEdge(edge)) {
    issues.push(issue('structural', 'terminal_outgoing_edge', `${sourceDefinition.displayName} is terminal and cannot have an outgoing control-flow edge.`, { edgeId: edge.id, nodeId: sourceNode.id }));
  }
  if (targetDefinition.entryPoint && isControlFlowEdge(edge)) {
    issues.push(issue('structural', 'entry_incoming_edge', `${targetDefinition.displayName} is an entry point and cannot have an incoming control-flow edge.`, { edgeId: edge.id, nodeId: targetNode.id }));
  }

  if (edge.sourceHandle) {
    const allowed = sourceDefinition.handles.filter((handle) => handle.kind === 'source').map((handle) => handle.id);
    const dynamicMessageTriggerHandle = sourceNode.type === 'trigger' && (edge.sourceHandle.startsWith('keyword-') || edge.sourceHandle.startsWith('meta-ad:'));
    const dynamicAiTaskHandle = sourceNode.type === 'ai_assistant' && edge.sourceHandle.startsWith('task-');
    if (!allowed.includes(edge.sourceHandle) && !dynamicMessageTriggerHandle && !dynamicAiTaskHandle) {
      issues.push(issue('structural', 'unknown_source_handle', `Unknown source handle “${edge.sourceHandle}” on ${sourceDefinition.displayName}.`, { edgeId: edge.id, nodeId: sourceNode.id }));
    }
  }
  if (edge.targetHandle) {
    const allowed = targetDefinition.handles.filter((handle) => handle.kind === 'target').map((handle) => handle.id);
    if (!allowed.includes(edge.targetHandle)) {
      issues.push(issue('structural', 'unknown_target_handle', `Unknown target handle “${edge.targetHandle}” on ${targetDefinition.displayName}.`, { edgeId: edge.id, nodeId: targetNode.id }));
    }
  }

  if (sourceNode.type === 'condition' && !['yes', 'no'].includes(String(edge.sourceHandle ?? ''))) {
    issues.push(issue('structural', 'condition_branch_handle', 'Condition edges must use the yes or no source handle.', { edgeId: edge.id, nodeId: sourceNode.id }));
  }
  if (targetNode.type === 'translation' && sourceNode.type !== 'trigger') {
    issues.push(issue('structural', 'translation_input_source', 'Translation input can only be connected from a Message Trigger.', { edgeId: edge.id }));
  }
  if (targetNode.type === 'data_capture' && sourceNode.type === 'data_capture') {
    issues.push(issue('structural', 'data_capture_chain', 'A Data Capture node cannot directly feed another Data Capture node.', { edgeId: edge.id }));
  }
  if (sourceNode.type === 'mcp_client_tool') {
    if (targetNode.type !== 'ai_assistant' || edge.targetHandle !== AI_TOOL_INPUT_HANDLE_ID) {
      issues.push(issue('structural', 'mcp_tool_connection', 'MCP Client Tool can only connect to the AI Assistant tool-input handle.', { edgeId: edge.id }));
    }
  } else if (edge.targetHandle === AI_TOOL_INPUT_HANDLE_ID) {
    issues.push(issue('structural', 'invalid_ai_tool_input', 'Only MCP Client Tool may connect to the AI Assistant tool-input handle.', { edgeId: edge.id }));
  } else if (targetNode.type === 'ai_assistant' && edge.targetHandle && edge.targetHandle !== FLOW_DEFAULT_TARGET_HANDLE_ID) {
    issues.push(issue('structural', 'invalid_ai_flow_input', 'Normal control flow must enter AI Assistant through flow-in.', { edgeId: edge.id }));
  }
}

function findCycles(nodes: FlowGraphNode[], edges: FlowGraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges.filter(isControlFlowEdge)) adjacency.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      cycles.push([...stack.slice(start), nodeId]);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.id);
  return cycles;
}

function collectReachable(entryIds: string[], edges: FlowGraphEdge[]): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges.filter(isControlFlowEdge)) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }
  const reachable = new Set<string>();
  const queue = [...entryIds];
  while (queue.length) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return reachable;
}

export function validateFlowGraph(
  graph: FlowGraphDraft,
  options: FlowGraphValidationOptions = {},
): FlowValidationResult {
  const issues: FlowValidationIssue[] = [];
  const mode = options.mode ?? 'creator';
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeById = new Map<string, FlowGraphNode>();

  for (const node of nodes) {
    if (!node?.id || typeof node.id !== 'string') {
      issues.push(issue('structural', 'missing_node_id', 'Every node requires a stable string ID.'));
      continue;
    }
    if (nodeById.has(node.id)) {
      issues.push(issue('structural', 'duplicate_node_id', `Duplicate node ID “${node.id}”.`, { nodeId: node.id }));
      continue;
    }
    nodeById.set(node.id, node);
    const definition = getFlowNodeDefinition(node.type, String(node.data?.label ?? ''));
    if (!definition) {
      issues.push(issue('structural', 'unknown_node_type', `Unknown node type “${node.type}”.`, { nodeId: node.id }));
      continue;
    }
    if (mode === 'creator' && !definition.generatable) {
      issues.push(issue('structural', 'non_generatable_node', `${definition.displayName} is compatibility-only and cannot be generated.`, { nodeId: node.id }));
    }
    const parsed = definition.dataSchema.safeParse(node.data ?? {});
    if (!parsed.success) {
      for (const zodIssue of parsed.error.issues) {
        issues.push(issue('structural', 'invalid_node_data', `${definition.displayName}: ${zodIssue.message}`, { nodeId: node.id, field: zodIssue.path.join('.') }));
      }
    }
    for (const field of definition.fields) {
      if (!field.required || !isMissing(node.data?.[field.name])) continue;
      issues.push(issue('structural', 'missing_required_field', `${definition.displayName} requires ${field.name}.`, { nodeId: node.id, field: field.name }));
    }
    if (definition.operations.length > 0 && typeof node.data?.operation === 'string' && !definition.operations.includes(node.data.operation)) {
      issues.push(issue('structural', 'unsupported_operation', `${definition.displayName} does not support operation “${node.data.operation}”.`, { nodeId: node.id, field: 'operation' }));
    }
    validateSetupFields(node, issues);
    validateConditionalConfiguration(node, issues, { mode, erpBusinessType: options.erpBusinessType });
    validateMappingsAndExpressions(node, issues, mode);
  }

  const customVariableNames = new Set<string>();
  for (const [index, variable] of (graph.customVariables ?? []).entries()) {
    const name = String(variable.name ?? variable.key ?? '').trim();
    if (!name || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
      issues.push(issue('structural', 'invalid_custom_variable', 'Custom variables require a valid unique name.', { field: `customVariables.${index}` }));
    } else if (customVariableNames.has(name)) {
      issues.push(issue('structural', 'duplicate_custom_variable', `Duplicate custom variable “${name}”.`, { field: `customVariables.${index}` }));
    }
    customVariableNames.add(name);
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!edge?.id || edgeIds.has(edge.id)) {
      issues.push(issue('structural', edge?.id ? 'duplicate_edge_id' : 'missing_edge_id', edge?.id ? `Duplicate edge ID “${edge.id}”.` : 'Every edge requires a stable ID.', { edgeId: edge?.id }));
      continue;
    }
    edgeIds.add(edge.id);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      issues.push(issue('structural', 'dangling_edge', `Edge “${edge.id}” references a missing source or target node.`, { edgeId: edge.id }));
      continue;
    }
    if (edge.source === edge.target) {
      issues.push(issue('structural', 'self_loop', 'A node cannot connect to itself.', { edgeId: edge.id, nodeId: edge.source }));
    }
    validateHandlesAndCompatibility(edge, sourceNode, targetNode, issues);
  }

  const executableNodes = nodes.filter((node) => {
    const definition = getFlowNodeDefinition(node.type, String(node.data?.label ?? ''));
    return !definition?.canvasOnly && node.type !== 'mcp_client_tool';
  });
  const entryIds = executableNodes
    .filter((node) => getFlowNodeDefinition(node.type, String(node.data?.label ?? ''))?.entryPoint)
    .map((node) => node.id);
  if (executableNodes.length > 0 && entryIds.length === 0) {
    issues.push(issue('structural', 'missing_entry_point', 'The generated workflow requires at least one native entry trigger.'));
  }
  const reachable = collectReachable(entryIds, edges);
  for (const node of executableNodes) {
    if (!reachable.has(node.id)) {
      issues.push(issue('structural', 'unreachable_node', `Node “${String(node.data?.label ?? node.type)}” is not reachable from an entry trigger.`, { nodeId: node.id }));
    }
  }
  for (const cycle of findCycles(executableNodes, edges)) {
    issues.push(issue('structural', 'cycle_detected', `Unsupported control-flow cycle detected: ${cycle.join(' → ')}.`, { nodeId: cycle[0] }));
  }

  if (options.setupAvailability) {
    for (const entry of Object.entries(options.setupAvailability)) {
      if (entry[1]) continue;
      issues.push(issue('setup', 'external_setup_unavailable', `${entry[0]} is not available for this company.`, { requirementKey: entry[0] }));
    }
  }

  const deduplicated = [...new Map(issues.map((current) => [`${current.severity}:${current.code}:${current.nodeId ?? ''}:${current.edgeId ?? ''}:${current.field ?? ''}:${current.requirementKey ?? ''}`, current])).values()];
  const structuralIssues = deduplicated.filter((current) => current.severity === 'structural');
  const setupIssues = deduplicated.filter((current) => current.severity === 'setup');
  const warnings = deduplicated.filter((current) => current.severity === 'warning');
  return { valid: structuralIssues.length === 0, issues: deduplicated, structuralIssues, setupIssues, warnings };
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => typeof child !== 'function')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hashFlowGraph(graph: Pick<FlowGraphDraft, 'nodes' | 'edges' | 'customVariables'>): string {
  const serialized = stableSerialize({ nodes: graph.nodes, edges: graph.edges, customVariables: graph.customVariables ?? [] });
  return sha256Hex(serialized);
}
