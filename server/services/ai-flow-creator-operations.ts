import { z } from 'zod';
import { compileAiFlowGraph } from '@shared/ai-flow-graph-compiler';
import { FLOW_DEFAULT_TARGET_HANDLE_ID, getFlowNodeDefinition } from '@shared/flow-node-registry';
import type {
  AiFlowCreatorGraphOperation,
  FlowGraphDraft,
  FlowGraphEdge,
  FlowGraphNode,
} from '@shared/types/ai-flow-creator';

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const SENSITIVE_CONFIG_KEY = /(api[-_]?key|token|password|secret|authorization|connectionstring|consumersecret|clientsecret|privatekey|refreshtoken|accesstoken)/i;

function stripSensitiveConfig(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    if (SENSITIVE_CONFIG_KEY.test(key)) return [];
    if (Array.isArray(entry)) return [[key, entry.map((item) => item && typeof item === 'object' && !Array.isArray(item) ? stripSensitiveConfig(item as Record<string, unknown>) : item)]];
    if (entry && typeof entry === 'object') return [[key, stripSensitiveConfig(entry as Record<string, unknown>)]];
    return [[key, entry]];
  }));
}

export const creatorStreamRecordSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('narration'), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal('add_node'), key: z.string().min(1).max(80), nodeType: z.string().min(1).max(100), label: z.string().max(160).optional(), config: z.record(z.unknown()).default({}), position: positionSchema.optional(), field: z.string().max(200).optional() }),
  z.object({ type: z.literal('update_node'), nodeId: z.string().min(1).max(200), label: z.string().max(160).optional(), config: z.record(z.unknown()).default({}), field: z.string().max(200).optional() }),
  z.object({ type: z.literal('move_node'), nodeId: z.string().min(1).max(200), position: positionSchema }),
  z.object({ type: z.literal('remove_node'), nodeId: z.string().min(1).max(200) }),
  z.object({ type: z.literal('add_edge'), key: z.string().min(1).max(80).optional(), source: z.string().min(1).max(200), target: z.string().min(1).max(200), sourceHandle: z.string().max(200).optional(), targetHandle: z.string().max(200).optional() }),
  z.object({ type: z.literal('remove_edge'), edgeId: z.string().min(1).max(200) }),
  z.object({ type: z.literal('finish'), title: z.string().min(1).max(160), summary: z.string().min(1).max(3000), assumptions: z.array(z.string().max(1000)).max(20).default([]) }),
]);

export type CreatorStreamRecord = z.infer<typeof creatorStreamRecordSchema>;

function cloneGraph(graph: FlowGraphDraft): FlowGraphDraft {
  return structuredClone(graph);
}

export class AiFlowOperationSession {
  readonly draft: FlowGraphDraft;
  private readonly aliases = new Map<string, string>();
  private sequence = 0;

  constructor(private readonly generationId: string, graph: FlowGraphDraft) {
    this.draft = cloneGraph(graph);
    for (const node of this.draft.nodes) this.aliases.set(node.id, node.id);
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `ai_${prefix}_${this.generationId.slice(0, 8)}_${this.sequence}`;
  }

  private resolveNodeId(value: string): string {
    return this.aliases.get(value) ?? value;
  }

  apply(record: Exclude<CreatorStreamRecord, { type: 'narration' | 'finish' }>, requestedOperationId?: string): AiFlowCreatorGraphOperation {
    const operationId = requestedOperationId ?? this.nextId('op');
    if (record.type === 'add_node') {
      if (this.aliases.has(record.key) || this.draft.nodes.some((node) => node.id === record.key)) throw new Error(`Node key already exists: ${record.key}`);
      const compiled = compileAiFlowGraph({
        title: this.draft.name || 'Workflow', assumptions: [], summary: 'Incremental node', edges: [],
        nodes: [{ key: record.key, type: record.nodeType, label: record.label, config: record.config }],
      }, `${this.generationId}-${this.sequence}`);
      const node = compiled.nodes[0];
      node.id = this.nextId('node');
      node.position = record.position ?? { x: 0, y: this.draft.nodes.length * 220 };
      this.aliases.set(record.key, node.id);
      this.aliases.set(node.id, node.id);
      this.draft.nodes.push(node);
      return { type: 'add_node', operationId, node: cloneGraph({ nodes: [node], edges: [] }).nodes[0], label: record.label, field: record.field };
    }
    if (record.type === 'update_node') {
      const nodeId = this.resolveNodeId(record.nodeId);
      const index = this.draft.nodes.findIndex((node) => node.id === nodeId);
      if (index < 0) throw new Error(`Unknown node: ${record.nodeId}`);
      const current = this.draft.nodes[index];
      const definition = getFlowNodeDefinition(current.type);
      if (!definition?.generatable) throw new Error(`Node type cannot be edited by the creator: ${current.type}`);
      const safePatch = stripSensitiveConfig(record.config);
      const candidateData = { ...current.data, ...safePatch, ...(record.label ? { label: record.label } : {}) };
      const parsed = definition.dataSchema.safeParse(candidateData);
      if (!parsed.success) throw new Error(`Invalid ${definition.displayName} configuration: ${parsed.error.issues[0]?.message ?? 'validation failed'}`);
      const node: FlowGraphNode = { ...current, data: parsed.data };
      this.draft.nodes[index] = node;
      return { type: 'update_node', operationId, nodeId, patch: safePatch, node: cloneGraph({ nodes: [node], edges: [] }).nodes[0], label: record.label, field: record.field };
    }
    if (record.type === 'move_node') {
      const nodeId = this.resolveNodeId(record.nodeId);
      const index = this.draft.nodes.findIndex((node) => node.id === nodeId);
      if (index < 0) throw new Error(`Unknown node: ${record.nodeId}`);
      const node = { ...this.draft.nodes[index], position: record.position };
      this.draft.nodes[index] = node;
      return { type: 'move_node', operationId, nodeId, position: record.position, node: cloneGraph({ nodes: [node], edges: [] }).nodes[0] };
    }
    if (record.type === 'remove_node') {
      const nodeId = this.resolveNodeId(record.nodeId);
      if (!this.draft.nodes.some((node) => node.id === nodeId)) throw new Error(`Unknown node: ${record.nodeId}`);
      this.draft.nodes = this.draft.nodes.filter((node) => node.id !== nodeId);
      this.draft.edges = this.draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
      return { type: 'remove_node', operationId, nodeId };
    }
    if (record.type === 'add_edge') {
      const source = this.resolveNodeId(record.source);
      const target = this.resolveNodeId(record.target);
      if (!this.draft.nodes.some((node) => node.id === source)) throw new Error(`Unknown source node: ${record.source}`);
      if (!this.draft.nodes.some((node) => node.id === target)) throw new Error(`Unknown target node: ${record.target}`);
      const sourceNode = this.draft.nodes.find((node) => node.id === source)!;
      const targetNode = this.draft.nodes.find((node) => node.id === target)!;
      const mcpToolEdge = sourceNode.type === 'mcp_client_tool' && targetNode.type === 'ai_assistant';
      const targetHandle = mcpToolEdge
        ? 'tool-input'
        : record.targetHandle || (targetNode.type === 'ai_assistant' ? FLOW_DEFAULT_TARGET_HANDLE_ID : targetNode.type === 'translation' ? 'input' : undefined);
      const duplicate = this.draft.edges.some((edge) => edge.source === source && edge.target === target && (edge.sourceHandle ?? null) === (record.sourceHandle ?? null) && (edge.targetHandle ?? null) === (targetHandle ?? null));
      if (duplicate) throw new Error('This connection already exists');
      const edge: FlowGraphEdge = {
        id: this.nextId('edge'), source, target, animated: !mcpToolEdge, type: 'smoothstep',
        ...(record.sourceHandle ? { sourceHandle: record.sourceHandle } : {}),
        ...(targetHandle ? { targetHandle } : {}),
        ...(mcpToolEdge ? { data: { isMcpToolEdge: true }, style: { strokeDasharray: '6 4' } } : {}),
      };
      this.draft.edges.push(edge);
      return { type: 'add_edge', operationId, edge: structuredClone(edge) };
    }
    const edgeIndex = this.draft.edges.findIndex((edge) => edge.id === record.edgeId);
    if (edgeIndex < 0) throw new Error(`Unknown edge: ${record.edgeId}`);
    this.draft.edges.splice(edgeIndex, 1);
    return { type: 'remove_edge', operationId, edgeId: record.edgeId };
  }
}

/** Parses complete newline-delimited JSON records while retaining a partial final line. */
export function readCreatorStreamRecords(buffer: string): { records: CreatorStreamRecord[]; errors: string[]; remainder: string } {
  const lines = buffer.replaceAll('\r\n', '\n').split('\n');
  const remainder = lines.pop() ?? '';
  const records: CreatorStreamRecord[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('```')) continue;
    try {
      const parsed = creatorStreamRecordSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) records.push(parsed.data);
      else errors.push(parsed.error.issues[0]?.message ?? 'Invalid operation record');
    } catch {
      errors.push('Malformed operation record');
    }
  }
  return { records, errors, remainder };
}
