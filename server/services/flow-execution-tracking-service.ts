import { IStorage } from '../storage';

export type { AIDelegationAuditPayload, AIDelegationRunSummary } from '@shared/types/flow-execution';

type RuntimeType = 'legacy' | 'session';

interface StartRunParams {
  runId: string;
  executionId: string;
  runtimeType: RuntimeType;
  sessionId?: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number;
  triggerNodeId: string;
  currentNodeId?: string | null;
  executionPath?: string[];
  status?: string;
  startedAt?: Date;
  lastActivityAt?: Date;
  contextData?: Record<string, unknown>;
}

interface UpdateRunParams {
  runId: string;
  status?: string;
  currentNodeId?: string | null;
  executionPath?: string[];
  contextData?: Record<string, unknown>;
}

interface CompleteRunParams extends UpdateRunParams {
  flowId: number;
  durationMs: number;
  errorMessage?: string;
}

interface NodeExecutionParams {
  runId: string;
  sessionId?: string;
  nodeId: string;
  nodeType: string;
  stepOrder: number;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  durationMs?: number;
  errorMessage?: string;
}

export class FlowExecutionTrackingService {
  private static instance: FlowExecutionTrackingService;

  private readonly storage: IStorage;
  private readonly runDbIds = new Map<string, number>();
  private readonly stepExecutionIds = new Map<string, number>();

  private constructor(storage: IStorage) {
    this.storage = storage;
  }

  static getInstance(storage: IStorage): FlowExecutionTrackingService {
    if (!FlowExecutionTrackingService.instance) {
      FlowExecutionTrackingService.instance = new FlowExecutionTrackingService(storage);
    }

    return FlowExecutionTrackingService.instance;
  }

  async startRun(params: StartRunParams): Promise<void> {
    const existingRun = await this.storage.getFlowExecutionByRunId(params.runId);

    if (existingRun) {
      this.runDbIds.set(params.runId, existingRun.id);
      await this.storage.updateFlowExecution(params.runId, {
        status: params.status ?? 'running',
        currentNodeId: params.currentNodeId ?? params.triggerNodeId,
        executionPath: params.executionPath,
        contextData: params.contextData
      }, 'runId');
      return;
    }

    const flowExecutionId = await this.storage.createFlowExecution({
      runId: params.runId,
      executionId: params.executionId,
      runtimeType: params.runtimeType,
      sessionId: params.sessionId,
      flowId: params.flowId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      companyId: params.companyId,
      triggerNodeId: params.triggerNodeId,
      currentNodeId: params.currentNodeId ?? params.triggerNodeId,
      executionPath: params.executionPath,
      status: params.status ?? 'running',
      startedAt: params.startedAt,
      lastActivityAt: params.lastActivityAt,
      contextData: params.contextData
    });

    this.runDbIds.set(params.runId, flowExecutionId);
  }

  async updateRun(params: UpdateRunParams): Promise<void> {
    const flowExecutionId = await this.getRunDbId(params.runId);
    if (!flowExecutionId) return;

    await this.storage.updateFlowExecution(params.runId, {
      status: params.status,
      currentNodeId: params.currentNodeId,
      executionPath: params.executionPath,
      contextData: params.contextData
    }, 'runId');
  }

  async markRunWaiting(params: UpdateRunParams): Promise<void> {
    await this.updateRun({ ...params, status: 'waiting' });
  }

  async completeRun(params: CompleteRunParams): Promise<void> {
    const flowExecutionId = await this.getRunDbId(params.runId);
    if (!flowExecutionId) return;

    const completionRate = await this.calculateCompletionRate(params.executionPath ?? [], params.flowId);
    await this.storage.updateFlowExecution(params.runId, {
      status: 'completed',
      currentNodeId: params.currentNodeId,
      executionPath: params.executionPath,
      contextData: params.contextData,
      completedAt: new Date(),
      totalDurationMs: params.durationMs,
      completionRate
    }, 'runId');

    this.clearRunCaches(params.runId);
  }

  async failRun(params: CompleteRunParams): Promise<void> {
    const flowExecutionId = await this.getRunDbId(params.runId);
    if (!flowExecutionId) return;

    const completionRate = await this.calculateCompletionRate(params.executionPath ?? [], params.flowId);
    await this.storage.updateFlowExecution(params.runId, {
      status: 'failed',
      currentNodeId: params.currentNodeId,
      executionPath: params.executionPath,
      contextData: params.contextData,
      completedAt: new Date(),
      totalDurationMs: params.durationMs,
      completionRate,
      errorMessage: params.errorMessage
    }, 'runId');

    this.clearRunCaches(params.runId);
  }

  async timeoutRun(params: CompleteRunParams): Promise<void> {
    const flowExecutionId = await this.getRunDbId(params.runId);
    if (!flowExecutionId) return;

    const completionRate = await this.calculateCompletionRate(params.executionPath ?? [], params.flowId);
    await this.storage.updateFlowExecution(params.runId, {
      status: 'timeout',
      currentNodeId: params.currentNodeId,
      executionPath: params.executionPath,
      contextData: params.contextData,
      completedAt: new Date(),
      totalDurationMs: params.durationMs,
      completionRate,
      errorMessage: params.errorMessage
    }, 'runId');

    this.clearRunCaches(params.runId);
  }

  async abandonRun(params: CompleteRunParams): Promise<void> {
    const flowExecutionId = await this.getRunDbId(params.runId);
    if (!flowExecutionId) return;

    const completionRate = await this.calculateCompletionRate(params.executionPath ?? [], params.flowId);
    await this.storage.updateFlowExecution(params.runId, {
      status: 'abandoned',
      currentNodeId: params.currentNodeId,
      executionPath: params.executionPath,
      contextData: params.contextData,
      completedAt: new Date(),
      totalDurationMs: params.durationMs,
      completionRate,
      errorMessage: params.errorMessage
    }, 'runId');

    this.clearRunCaches(params.runId);
  }

  async startNodeExecution(params: NodeExecutionParams): Promise<void> {
    const stepExecutionId = await this.getOrCreateStepExecutionId(params);
    if (!stepExecutionId) return;

    await this.storage.updateFlowStepExecution(stepExecutionId, {
      status: 'running',
      inputData: params.inputData
    });
  }

  async markNodeWaiting(params: NodeExecutionParams): Promise<void> {
    const stepExecutionId = await this.getOrCreateStepExecutionId(params, 'waiting');
    if (!stepExecutionId) return;

    await this.storage.updateFlowStepExecution(stepExecutionId, {
      status: 'waiting',
      inputData: params.inputData,
      outputData: params.outputData
    });
  }

  async completeNodeExecution(params: NodeExecutionParams): Promise<void> {
    const stepExecutionId = await this.getOrCreateStepExecutionId(params);
    if (!stepExecutionId) return;

    await this.storage.updateFlowStepExecution(stepExecutionId, {
      status: 'completed',
      completedAt: new Date(),
      durationMs: params.durationMs,
      inputData: params.inputData,
      outputData: params.outputData
    });
  }

  async skipNodeExecution(params: NodeExecutionParams): Promise<void> {
    const stepExecutionId = await this.getOrCreateStepExecutionId(params, 'skipped');
    if (!stepExecutionId) return;

    await this.storage.updateFlowStepExecution(stepExecutionId, {
      status: 'skipped',
      completedAt: new Date(),
      durationMs: params.durationMs,
      inputData: params.inputData,
      outputData: params.outputData
    });
  }

  async failNodeExecution(params: NodeExecutionParams): Promise<void> {
    const stepExecutionId = await this.getOrCreateStepExecutionId(params);
    if (!stepExecutionId) return;

    await this.storage.updateFlowStepExecution(stepExecutionId, {
      status: 'failed',
      completedAt: new Date(),
      durationMs: params.durationMs,
      inputData: params.inputData,
      outputData: params.outputData,
      errorMessage: params.errorMessage
    });
  }

  private async getRunDbId(runId: string): Promise<number | undefined> {
    const cachedId = this.runDbIds.get(runId);
    if (cachedId) return cachedId;

    const run = await this.storage.getFlowExecutionByRunId(runId);
    if (!run) return undefined;

    this.runDbIds.set(runId, run.id);
    return run.id;
  }

  private async getOrCreateStepExecutionId(params: NodeExecutionParams, initialStatus: string = 'running'): Promise<number | undefined> {
    const flowExecutionId = await this.getRunDbId(params.runId);
    if (!flowExecutionId) return undefined;

    const cacheKey = this.getStepCacheKey(params.runId, params.nodeId, params.stepOrder);
    const cachedId = this.stepExecutionIds.get(cacheKey);
    if (cachedId) return cachedId;

    const existingStep = await this.storage.getFlowStepExecutionByFlowExecutionAndNode(
      flowExecutionId,
      params.nodeId,
      params.stepOrder
    );

    if (existingStep) {
      this.stepExecutionIds.set(cacheKey, existingStep.id);
      return existingStep.id;
    }

    const stepExecutionId = await this.storage.createFlowStepExecution({
      flowExecutionId,
      sessionId: params.sessionId,
      nodeId: params.nodeId,
      nodeType: params.nodeType,
      stepOrder: params.stepOrder,
      status: initialStatus,
      inputData: params.inputData,
      outputData: params.outputData
    });

    this.stepExecutionIds.set(cacheKey, stepExecutionId);
    return stepExecutionId;
  }

  private getStepCacheKey(runId: string, nodeId: string, stepOrder: number): string {
    return `${runId}::${nodeId}::${stepOrder}`;
  }

  private clearRunCaches(runId: string): void {
    this.runDbIds.delete(runId);

    for (const key of Array.from(this.stepExecutionIds.keys())) {
      if (key.startsWith(`${runId}::`)) {
        this.stepExecutionIds.delete(key);
      }
    }
  }

  private async calculateCompletionRate(executionPath: string[], flowId: number): Promise<number> {
    try {
      const flow = await this.storage.getFlow(flowId);
      const totalNodes = Array.isArray((flow as any)?.nodes) ? (flow as any).nodes.length : 0;
      const executedNodes = executionPath.length;

      if (totalNodes === 0) return 100;
      return Math.min(100, Math.round((executedNodes / totalNodes) * 100));
    } catch (error) {
      console.error('Flow tracking: Error calculating completion rate:', error);
      return 0;
    }
  }
}