import { PERMISSIONS, type Pipeline, type PipelineStage, type User } from '@shared/schema';
import {
  buildMetaAdRoutingFootprint,
  deriveFlowTriggerStageScopeFromNodes,
  formatMetaAdRoutingConflictMessage,
  isMessageTriggerNode,
  isMetaAdTriggerWithEmptyChannelScope,
  messageTriggerSupportsChannelType,
  normalizeMessageTriggerNodeData,
  type FlowTriggerStageScope,
  type MetaAdRoutingFootprint
} from '@shared/types/node-types';

export type FlowAccessRecord = {
  userId: number;
  companyId: number | null;
};

const REDACTED_SENTINEL = '***REDACTED***';

function redactMcpServerSecrets(server: any): any {
  if (!server || typeof server !== 'object') {
    return server;
  }
  const s: any = { ...server };
  if (Array.isArray(s.headers)) {
    s.headers = s.headers.map((h: any) => {
      const key = String(h?.key ?? '');
      if (/^authorization$/i.test(key) || /api[-_]?key/i.test(key)) {
        return { ...h, value: REDACTED_SENTINEL };
      }
      return h;
    });
  }
  if (s.oauth && typeof s.oauth === 'object') {
    s.oauth = { ...s.oauth };
    if (s.oauth.clientSecret != null) {
      s.oauth.clientSecret = REDACTED_SENTINEL;
    }
    if (s.oauth.refreshToken != null) {
      s.oauth.refreshToken = REDACTED_SENTINEL;
    }
    if (s.oauth.accessToken != null) {
      s.oauth.accessToken = REDACTED_SENTINEL;
    }
  }
  return s;
}

/**
 * Redact MCP OAuth tokens and sensitive headers in flow node data (for API responses only).
 */
export function redactMcpSecretsInFlowNodes(nodes: unknown): unknown[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes.map((node: any) => {
    const copy = { ...node };
    if (copy.data && typeof copy.data === 'object') {
      const data = { ...copy.data };
      const t = String(copy.type || '');
      if (t === 'mcp_client_tool' || t === 'mcpClientTool') {
        if (Array.isArray(data.servers)) {
          data.servers = data.servers.map((srv: any) => redactMcpServerSecrets(structuredClone(srv)));
        }
      }
      if (t === 'mcp_execute_tool' || t === 'mcpExecuteTool') {
        if (data.serverConfig && typeof data.serverConfig === 'object') {
          data.serverConfig = redactMcpServerSecrets(structuredClone(data.serverConfig));
        }
      }
      copy.data = data;
    }
    return copy;
  });
}

/**
 * True when the user may see full persisted MCP credentials (manage flows or super admin).
 */
export function userCanViewFullFlowMcpSecrets(
  user: User | undefined | null,
  permissions: Record<string, boolean> | undefined
): boolean {
  if (!user) {
    return false;
  }
  if (user.isSuperAdmin) {
    return true;
  }
  return permissions?.[PERMISSIONS.MANAGE_FLOWS] === true;
}

/**
 * Clone a flow object with MCP secrets redacted for read-only flow viewers (VIEW without MANAGE).
 */
export function flowDefinitionWithMcpSecretsRedactedForViewer<
  T extends { nodes?: unknown }
>(flow: T, user: User | undefined | null, permissions: Record<string, boolean> | undefined): T {
  if (userCanViewFullFlowMcpSecrets(user, permissions)) {
    return flow;
  }
  if (!Array.isArray(flow.nodes)) {
    return flow;
  }
  return {
    ...flow,
    nodes: redactMcpSecretsInFlowNodes(flow.nodes) as T extends { nodes?: infer N } ? N : unknown
  };
}

/**
 * Shared flow access: super admins; same-company; owner fallback only for legacy flows with no company.
 */
export function userCanAccessFlow(flow: FlowAccessRecord, user: User | undefined | null): boolean {
  if (!user) {
    return false;
  }
  if (user.isSuperAdmin) {
    return true;
  }
  if (user.companyId != null && flow.companyId != null && flow.companyId === user.companyId) {
    return true;
  }
  if (flow.companyId == null && flow.userId === user.id) {
    return true;
  }
  return false;
}

/**
 * Strip legacy agent-control fields from persisted flow nodes (no longer used in the product).
 * Does not redact MCP secrets — use {@link redactMcpSecretsInFlowNodes} on read-only API responses.
 */
export function normalizeFlowNodesAgentControl(nodes: unknown): unknown[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes.map((node: any) => {
    const copy = { ...node };
    if (copy.data && typeof copy.data === 'object') {
      const data = { ...copy.data };
      delete data.agentControlEnabled;
      const t = String(copy.type || '');
      if (t === 'aiAssistant' || t === 'ai_assistant' || t === 'aiAssistantNode') {
        delete data.generatedAgentControlTools;
      }
      if (isMessageTriggerNode(copy)) {
        copy.data = normalizeMessageTriggerNodeData(data);
      } else {
        copy.data = data;
      }
    }
    return copy;
  });
}

export const MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS = {
  partial: 'Message Trigger stage scope is incomplete or invalid',
  pipelineNotFound: 'Message Trigger pipeline not found',
  stageNotFound: 'Message Trigger pipeline stage not found',
  stagePipelineMismatch: 'Message Trigger pipeline stage does not belong to the selected pipeline',
  companyMismatch: 'Message Trigger pipeline stage does not belong to this company',
} as const;

export type MessageTriggerStageScopeValidationDeps = {
  getPipeline: (id: number) => Promise<Pipeline | undefined>;
  getPipelineStage: (id: number) => Promise<PipelineStage | undefined>;
  companyId?: number | null;
};

/** Returns an error message when nodes contain invalid stage scope; null when valid. */
export async function validateMessageTriggerStageScopeOnFlowNodes(
  nodes: unknown,
  deps: MessageTriggerStageScopeValidationDeps
): Promise<string | null> {
  const scope = deriveFlowTriggerStageScopeFromNodes(nodes);
  if (scope.kind === 'invalid') {
    return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.partial;
  }
  if (scope.kind !== 'stage-scoped') {
    return null;
  }

  const pipeline = await deps.getPipeline(scope.pipelineId);
  if (!pipeline) {
    return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.pipelineNotFound;
  }

  const stage = await deps.getPipelineStage(scope.stageId);
  if (!stage) {
    return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.stageNotFound;
  }

  if (stage.pipelineId !== scope.pipelineId) {
    return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.stagePipelineMismatch;
  }

  if (deps.companyId != null) {
    if (pipeline.companyId !== deps.companyId) {
      return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.companyMismatch;
    }
    if (stage.companyId !== deps.companyId) {
      return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.companyMismatch;
    }
  }

  return null;
}

/** Channel activation matrix: one active bot/flow per stage scope; no scoped/unscoped mix. */
export function validateFlowAssignmentActivationScope(
  candidateScope: FlowTriggerStageScope,
  otherScopes: FlowTriggerStageScope[]
): string | null {
  if (candidateScope.kind === 'invalid') {
    return MESSAGE_TRIGGER_STAGE_SCOPE_ERRORS.partial;
  }

  for (const otherScope of otherScopes) {
    if (otherScope.kind === 'invalid') {
      continue;
    }

    if (candidateScope.kind === 'unscoped') {
      if (otherScope.kind === 'stage-scoped') {
        return 'This unscoped flow cannot be activated while scoped stage bots are active on this channel';
      }
      continue;
    }

    if (otherScope.kind === 'unscoped') {
      return 'An unscoped catch-all flow is already active on this channel';
    }

    if (
      otherScope.pipelineId === candidateScope.pipelineId &&
      otherScope.stageId === candidateScope.stageId
    ) {
      return 'Another active flow already handles this pipeline stage on this channel';
    }
  }

  return null;
}

export type ActiveFlowScopeAssignmentValidationDeps = {
  getFlowAssignments: (channelId?: number, flowId?: number) => Promise<
    Array<{ id: number; channelId: number; flowId: number; isActive: boolean }>
  >;
  getFlow: (id: number) => Promise<{ nodes?: unknown } | undefined>;
};

/** Re-check channel assignment conflicts when an active flow's trigger scope changes. */
export async function validateActiveFlowNodesAgainstChannelAssignments(
  flowId: number,
  candidateNodes: unknown,
  deps: ActiveFlowScopeAssignmentValidationDeps
): Promise<string | null> {
  const assignments = await deps.getFlowAssignments(undefined, flowId);
  const activeAssignments = assignments.filter((assignment) => assignment.isActive);
  if (activeAssignments.length === 0) {
    return null;
  }

  const candidateScope = deriveFlowTriggerStageScopeFromNodes(candidateNodes);

  for (const assignment of activeAssignments) {
    const channelAssignments = await deps.getFlowAssignments(assignment.channelId);
    const otherScopes: FlowTriggerStageScope[] = [];

    for (const other of channelAssignments) {
      if (!other.isActive) {
        continue;
      }
      if (other.id === assignment.id) {
        continue;
      }
      const otherFlow = await deps.getFlow(other.flowId);
      if (!otherFlow) {
        continue;
      }
      otherScopes.push(deriveFlowTriggerStageScopeFromNodes(otherFlow.nodes));
    }

    const conflict = validateFlowAssignmentActivationScope(candidateScope, otherScopes);
    if (conflict) {
      return conflict;
    }
  }

  return null;
}

export const MESSAGE_TRIGGER_META_AD_ROUTING_ERRORS = {
  channelMismatch: 'Message Trigger channel type does not match the selected channel',
  emptyChannelScope: 'Meta ad routing requires at least one supported channel type',
} as const;

export type MetaAdRoutingFootprintLoader = (options: {
  companyId: number;
  excludeFlowId?: number;
  excludeAssignmentId?: number;
}) => Promise<MetaAdRoutingFootprint[]>;

export type MetaAdRoutingActivationValidationDeps = {
  loadActiveFootprints: MetaAdRoutingFootprintLoader;
};

export type ActiveFlowMetaAdRoutingValidationDeps = {
  getFlowAssignments: (channelId?: number, flowId?: number) => Promise<
    Array<{ id: number; channelId: number; flowId: number; isActive: boolean }>
  >;
  getChannel: (channelId: number) => Promise<
    { channelType: string; companyId: number | null } | undefined
  >;
  getCompanyIdForFlow: (flowId: number) => Promise<number | null | undefined>;
  loadActiveFootprints: MetaAdRoutingFootprintLoader;
};

/** Compare candidate vs other active Meta-ad footprints; null when no duplicate key overlap. */
export function findMetaAdRoutingConflict(
  candidate: MetaAdRoutingFootprint,
  others: MetaAdRoutingFootprint[],
  options?: { excludeFlowId?: number }
): string | null {
  if (candidate.kind !== 'meta_ad') {
    return null;
  }

  for (const other of others) {
    if (other.kind !== 'meta_ad') {
      continue;
    }
    if (candidate.companyId !== other.companyId) {
      continue;
    }
    if (candidate.flowId === other.flowId) {
      continue;
    }
    if (options?.excludeFlowId != null && other.flowId === options.excludeFlowId) {
      continue;
    }

    const overlappingChannels = candidate.effectiveChannelTypes.filter((channelType) =>
      other.effectiveChannelTypes.includes(channelType)
    );
    if (overlappingChannels.length === 0) {
      continue;
    }

    for (const routingKey of candidate.routingKeys) {
      if (other.routingKeys.includes(routingKey)) {
        return formatMetaAdRoutingConflictMessage(routingKey, overlappingChannels[0]);
      }
    }
  }

  return null;
}

/** Activation-time Meta-ad duplicate check for a candidate flow + channel. */
export async function validateMetaAdRoutingActivationConflict(
  candidateNodes: unknown,
  candidateFlowId: number,
  candidateChannelType: string,
  companyId: number | null | undefined,
  deps: MetaAdRoutingActivationValidationDeps,
  options?: { excludeAssignmentId?: number }
): Promise<string | null> {
  if (companyId == null) {
    return null;
  }

  const emptyScopeError = validateMetaAdTriggerEmptyChannelScope(candidateNodes);
  if (emptyScopeError) {
    return emptyScopeError;
  }

  const candidate = buildMetaAdRoutingFootprint({
    nodes: candidateNodes,
    assignedChannelType: candidateChannelType,
    companyId,
    flowId: candidateFlowId,
  });
  if (candidate.kind !== 'meta_ad') {
    return null;
  }

  const others = await deps.loadActiveFootprints({
    companyId,
    excludeFlowId: candidateFlowId,
    excludeAssignmentId: options?.excludeAssignmentId,
  });

  return findMetaAdRoutingConflict(candidate, others);
}

function getMessageTriggerNodeFromNodes(nodes: unknown): { data?: unknown } | undefined {
  if (!Array.isArray(nodes)) {
    return undefined;
  }
  return nodes.find((node) =>
    isMessageTriggerNode(node as { type?: unknown; data?: unknown })
  ) as { data?: unknown } | undefined;
}

function validateMetaAdTriggerEmptyChannelScope(nodes: unknown): string | null {
  const triggerNode = getMessageTriggerNodeFromNodes(nodes);
  if (!triggerNode?.data || typeof triggerNode.data !== 'object') {
    return null;
  }

  const triggerData = triggerNode.data as Record<string, unknown>;
  if (triggerData.enableInitialMessageOutput !== true) {
    return null;
  }

  if (isMetaAdTriggerWithEmptyChannelScope(triggerData)) {
    return MESSAGE_TRIGGER_META_AD_ROUTING_ERRORS.emptyChannelScope;
  }

  return null;
}

/** Save-time Meta-ad duplicate check when an active flow's trigger nodes change. */
export async function validateActiveFlowNodesAgainstMetaAdRoutingAssignments(
  flowId: number,
  candidateNodes: unknown,
  deps: ActiveFlowMetaAdRoutingValidationDeps
): Promise<string | null> {
  const emptyScopeError = validateMetaAdTriggerEmptyChannelScope(candidateNodes);
  if (emptyScopeError) {
    return emptyScopeError;
  }

  const assignments = await deps.getFlowAssignments(undefined, flowId);
  const activeAssignments = assignments.filter((assignment) => assignment.isActive);
  if (activeAssignments.length === 0) {
    return null;
  }

  const flowCompanyId = await deps.getCompanyIdForFlow(flowId);
  const triggerNode = getMessageTriggerNodeFromNodes(candidateNodes);

  for (const assignment of activeAssignments) {
    const channel = await deps.getChannel(assignment.channelId);
    if (!channel?.channelType) {
      continue;
    }

    if (
      triggerNode &&
      !messageTriggerSupportsChannelType(triggerNode, channel.channelType)
    ) {
      return MESSAGE_TRIGGER_META_AD_ROUTING_ERRORS.channelMismatch;
    }

    const companyId = flowCompanyId ?? channel.companyId;
    if (companyId == null) {
      continue;
    }

    const candidate = buildMetaAdRoutingFootprint({
      nodes: candidateNodes,
      assignedChannelType: channel.channelType,
      companyId,
      flowId,
    });
    if (candidate.kind !== 'meta_ad') {
      continue;
    }

    const others = await deps.loadActiveFootprints({
      companyId,
      excludeFlowId: flowId,
      excludeAssignmentId: assignment.id,
    });
    const conflict = findMetaAdRoutingConflict(candidate, others);
    if (conflict) {
      return conflict;
    }
  }

  return null;
}

export {
  deriveFlowTriggerStageScopeFromNodes,
  messageTriggerSupportsChannelType,
  type FlowTriggerStageScope,
  type MetaAdRoutingFootprint
};
