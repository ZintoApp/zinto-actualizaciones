import { z } from 'zod';
import {
  FLOW_DEFAULT_TARGET_HANDLE_ID,
  getFlowNodeDefinition,
} from './flow-node-registry';
import type { FlowGraphDraft, FlowGraphEdge, FlowGraphNode } from './types/ai-flow-creator';
import { getErpRequiredBusinessType } from './erp-capabilities';

export const aiFlowIntermediatePlanSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(3000),
  assumptions: z.array(z.string().max(1000)).max(20).default([]),
  nodes: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/),
    type: z.string(),
    label: z.string().min(1).max(160).optional(),
    config: z.record(z.unknown()).default({}),
  })).min(1).max(100),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
  })).max(200).default([]),
});

export type AiFlowIntermediatePlan = z.infer<typeof aiFlowIntermediatePlanSchema>;

const SENSITIVE_CONFIG_KEY = /(api[-_]?key|token|password|secret|authorization|connectionstring|consumersecret|clientsecret|privatekey|refreshtoken|accesstoken)/i;

function stripSensitiveModelConfig(config: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_CONFIG_KEY.test(key)) continue;
    if (Array.isArray(value)) {
      output[key] = value.map((entry) => entry && typeof entry === 'object'
        ? stripSensitiveModelConfig(entry as Record<string, unknown>)
        : entry);
    } else if (value && typeof value === 'object') {
      output[key] = stripSensitiveModelConfig(value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function normalizeDataCaptureConfig(data: Record<string, unknown>, nodeId: string): Record<string, unknown> {
  if (!Array.isArray(data.captureRules)) return data;
  const captureRules = data.captureRules.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const rule = { ...(entry as Record<string, unknown>) };
    if (typeof rule.id !== 'string' || !rule.id.trim()) rule.id = `${nodeId}_rule_${index + 1}`;
    if (rule.sourceType == null) rule.sourceType = 'custom_prompt';
    if (rule.dataType == null) rule.dataType = 'string';
    if (rule.required == null) rule.required = false;
    if (rule.sourceType === 'custom_prompt' && typeof rule.description === 'string') {
      // Match DataCaptureNode persistence: prompt rules use description as sourceValue.
      rule.sourceValue = rule.description.trim();
    }
    if (rule.dataType === 'media') {
      if (rule.mediaKind == null) rule.mediaKind = 'any';
    } else {
      delete rule.mediaKind;
    }
    return rule;
  });
  return { ...data, captureRules };
}

function normalizePipelineConfig(
  data: Record<string, unknown>,
  modelConfig: Record<string, unknown>,
  allowedFields: string[],
): Record<string, unknown> {
  const allowed = new Set(allowedFields);
  const unsupported = Object.keys(modelConfig).filter((field) => !allowed.has(field));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported Pipeline configuration field${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}`);
  }

  // Pipeline's manual creation defaults are for update_stage. Do not let its
  // default medium priority turn an update_deal with no priority into a write.
  if (modelConfig.operation === 'update_deal' && !Object.prototype.hasOwnProperty.call(modelConfig, 'dealPriority')) {
    delete data.dealPriority;
  }
  return data;
}

export function compileAiFlowGraph(plan: AiFlowIntermediatePlan, generationId: string): FlowGraphDraft {
  const duplicateKey = plan.nodes.find((node, index) => plan.nodes.findIndex((candidate) => candidate.key === node.key) !== index)?.key;
  if (duplicateKey) throw new Error(`Duplicate node key: ${duplicateKey}`);

  const keyToId = new Map<string, string>();
  const nodes: FlowGraphNode[] = plan.nodes.map((node, index) => {
    const definition = getFlowNodeDefinition(node.type);
    if (!definition?.generatable) throw new Error(`Unsupported generated node type: ${node.type}`);
    const id = `ai_${generationId.slice(0, 8)}_${index + 1}`;
    keyToId.set(node.key, id);
    const modelConfig = stripSensitiveModelConfig(node.config);
    let data: Record<string, unknown> = {
      ...definition.defaultData(),
      ...modelConfig,
      label: node.label || definition.displayName,
    };
    if (definition.canvasType === 'update_pipeline_stage') {
      data = normalizePipelineConfig(data, modelConfig, definition.fields.map((field) => field.name));
    }
    if (definition.canvasType === 'erp') {
      const requiredBusinessType = getErpRequiredBusinessType(data.resource);
      if (requiredBusinessType) data.requiredBusinessType = requiredBusinessType;
      else delete data.requiredBusinessType;
    }
    return {
      id,
      type: definition.canvasType,
      position: { x: 0, y: index * 180 },
      data: definition.canvasType === 'data_capture' ? normalizeDataCaptureConfig(data, id) : data,
      ...(definition.canvasOnly ? { style: { width: 300, height: 220 } } : {}),
    };
  });

  const edges: FlowGraphEdge[] = plan.edges.map((edge, index) => {
    const source = keyToId.get(edge.from);
    const target = keyToId.get(edge.to);
    if (!source || !target) throw new Error(`Edge references unknown node key: ${edge.from} → ${edge.to}`);
    const sourceNode = nodes.find((node) => node.id === source)!;
    const targetNode = nodes.find((node) => node.id === target)!;
    const mcpToolEdge = sourceNode.type === 'mcp_client_tool' && targetNode.type === 'ai_assistant';
    const targetHandle = mcpToolEdge
      ? 'tool-input'
      : edge.targetHandle || (targetNode.type === 'ai_assistant' ? FLOW_DEFAULT_TARGET_HANDLE_ID : targetNode.type === 'translation' ? 'input' : undefined);
    return {
      id: `ai_edge_${generationId.slice(0, 8)}_${index + 1}`,
      source,
      target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(targetHandle ? { targetHandle } : {}),
      animated: !mcpToolEdge,
      type: 'smoothstep',
      ...(mcpToolEdge ? { data: { isMcpToolEdge: true }, style: { strokeDasharray: '6 4' } } : {}),
    };
  });

  const controlEdges = edges.filter((edge) => edge.targetHandle !== 'tool-input');
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of controlEdges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  const level = new Map(queue.map((id) => [id, 0]));
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of outgoing.get(current) ?? []) {
      level.set(next, Math.max(level.get(next) ?? 0, (level.get(current) ?? 0) + 1));
      incoming.set(next, (incoming.get(next) ?? 1) - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  const byLevel = new Map<number, FlowGraphNode[]>();
  for (const node of nodes) {
    const nodeLevel = level.get(node.id) ?? 0;
    const group = byLevel.get(nodeLevel) ?? [];
    group.push(node);
    byLevel.set(nodeLevel, group);
  }
  for (const [nodeLevel, group] of byLevel) {
    group.forEach((node, index) => {
      node.position = { x: (index - (group.length - 1) / 2) * 360, y: nodeLevel * 220 };
    });
  }
  return { name: plan.title, nodes, edges, customVariables: [] };
}
