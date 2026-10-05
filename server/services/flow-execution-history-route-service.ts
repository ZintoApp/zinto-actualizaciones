import type { IStorage } from '../storage';
import { canAccessFlowExecutionHistory, normalizeFlowExecutionHistoryLimit } from './flow-execution-history-utils';

type ExecutionHistoryUser = { id?: number | null; companyId?: number | null } | null | undefined;

export async function buildListFlowExecutionHistoryResponse(
  storage: Pick<IStorage, 'getFlow' | 'listFlowExecutionHistory'>,
  params: { flowIdParam: unknown; limitParam: unknown; user: ExecutionHistoryUser }
): Promise<{ status: number; body: unknown }> {
  const flowId = parseInt(String(params.flowIdParam), 10);
  const requestedLimit = params.limitParam != null ? parseInt(String(params.limitParam), 10) : 20;
  const limit = normalizeFlowExecutionHistoryLimit(requestedLimit);

  if (!flowId || isNaN(flowId)) {
    return { status: 400, body: { message: 'Invalid flow ID' } };
  }

  const flow = await storage.getFlow(flowId);
  if (!flow) {
    return { status: 404, body: { message: 'Flow not found' } };
  }

  if (!canAccessFlowExecutionHistory(flow, params.user)) {
    return { status: 403, body: { message: 'You do not have permission to view this flow execution history' } };
  }

  const executions = await storage.listFlowExecutionHistory(flowId, limit);
  return { status: 200, body: { executions, meta: { limit } } };
}

export async function buildFlowExecutionHistoryDetailResponse(
  storage: Pick<IStorage, 'getFlow' | 'getFlowExecutionHistoryDetail'>,
  params: { flowIdParam: unknown; runIdParam: unknown; user: ExecutionHistoryUser }
): Promise<{ status: number; body: unknown }> {
  const flowId = parseInt(String(params.flowIdParam), 10);
  const runId = String(params.runIdParam ?? '');

  if (!flowId || isNaN(flowId)) {
    return { status: 400, body: { message: 'Invalid flow ID' } };
  }

  if (!runId) {
    return { status: 400, body: { message: 'Run ID is required' } };
  }

  const flow = await storage.getFlow(flowId);
  if (!flow) {
    return { status: 404, body: { message: 'Flow not found' } };
  }

  if (!canAccessFlowExecutionHistory(flow, params.user)) {
    return { status: 403, body: { message: 'You do not have permission to view this flow execution history' } };
  }

  const detail = await storage.getFlowExecutionHistoryDetail(flowId, runId);
  if (!detail) {
    return { status: 404, body: { message: 'Flow execution not found' } };
  }

  return { status: 200, body: detail };
}

export async function buildClearFlowExecutionHistoryResponse(
  storage: Pick<IStorage, 'getFlow' | 'clearFlowExecutionHistory'>,
  params: { flowIdParam: unknown; user: ExecutionHistoryUser }
): Promise<{ status: number; body: unknown }> {
  const flowId = parseInt(String(params.flowIdParam), 10);

  if (!flowId || isNaN(flowId)) {
    return { status: 400, body: { message: 'Invalid flow ID' } };
  }

  const flow = await storage.getFlow(flowId);
  if (!flow) {
    return { status: 404, body: { message: 'Flow not found' } };
  }

  if (!canAccessFlowExecutionHistory(flow, params.user)) {
    return { status: 403, body: { message: 'You do not have permission to clear this flow execution history' } };
  }

  const deleted = await storage.clearFlowExecutionHistory(flowId);
  return { status: 200, body: { deleted, message: 'Execution history cleared' } };
}