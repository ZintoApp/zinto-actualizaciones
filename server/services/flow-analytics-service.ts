import { FlowExecutionManager } from './flow-execution-manager';
import { IStorage } from '../storage';
import { FlowExecutionTrackingService } from './flow-execution-tracking-service';

/**
 * Flow Analytics Service
 * Bridges the in-memory FlowExecutionManager with database tracking for analytics
 */
export class FlowAnalyticsService {
  private static instance: FlowAnalyticsService;
  private storage: IStorage;
  private executionManager: FlowExecutionManager;
  private trackingService: FlowExecutionTrackingService;

  private constructor(storage: IStorage) {
    this.storage = storage;
    this.executionManager = FlowExecutionManager.getInstance();
    this.trackingService = FlowExecutionTrackingService.getInstance(storage);
    this.setupEventListeners();
  }

  static getInstance(storage: IStorage): FlowAnalyticsService {
    if (!FlowAnalyticsService.instance) {
      FlowAnalyticsService.instance = new FlowAnalyticsService(storage);
    }
    return FlowAnalyticsService.instance;
  }

  /**
   * Setup event listeners for flow execution events
   */
  private setupEventListeners(): void {
    this.executionManager.on('executionStarted', async (data) => {
      await this.handleExecutionStarted(data);
    });

    this.executionManager.on('executionUpdated', async (data) => {
      await this.handleExecutionUpdated(data);
    });

    this.executionManager.on('executionWaiting', async (data) => {
      await this.handleExecutionWaiting(data);
    });

    this.executionManager.on('executionResumed', async (data) => {
      await this.handleExecutionResumed(data);
    });

    this.executionManager.on('nodeStarted', async (data) => {
      await this.handleNodeStarted(data);
    });

    this.executionManager.on('executionCompleted', async (data) => {
      await this.handleExecutionCompleted(data);
    });

    this.executionManager.on('executionFailed', async (data) => {
      await this.handleExecutionFailed(data);
    });

    this.executionManager.on('nodeExecuted', async (data) => {
      await this.handleNodeExecuted(data);
    });

    
  }

  /**
   * Handle execution started event
   */
  private async handleExecutionStarted(data: {
    executionId: string;
    flowId: number;
    conversationId: number;
    contactId: number;
    currentNodeId: string;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const conversation = await this.storage.getConversation(data.conversationId);
      const companyId = conversation?.companyId || undefined;

      await this.trackingService.startRun({
        runId: data.executionId,
        executionId: data.executionId,
        runtimeType: 'legacy',
        flowId: data.flowId,
        conversationId: data.conversationId,
        contactId: data.contactId,
        companyId: companyId,
        triggerNodeId: data.currentNodeId,
        currentNodeId: data.currentNodeId,
        executionPath: [data.currentNodeId],
        status: 'running',
        contextData: {}
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error tracking execution start:', error);
    }
  }

  /**
   * Handle execution updated event
   */
  private async handleExecutionUpdated(data: {
    executionId: string;
    currentNodeId: string;
    status: string;
    nodeResult?: any;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const execution = this.executionManager.getExecution(data.executionId);
      if (!execution) return;

      await this.trackingService.updateRun({
        runId: data.executionId,
        status: data.status,
        currentNodeId: data.currentNodeId,
        executionPath: execution.executionPath,
        contextData: execution.context.getAllVariables()
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error tracking execution update:', error);
    }
  }

  /**
   * Handle execution waiting event
   */
  private async handleExecutionWaiting(data: {
    executionId: string;
    flowId: number;
    conversationId: number;
    contactId: number;
    waitingNodeId: string;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const execution = this.executionManager.getExecution(data.executionId);
      if (!execution) return;

      await this.trackingService.markRunWaiting({
        runId: data.executionId,
        currentNodeId: data.waitingNodeId,
        executionPath: execution.executionPath,
        contextData: execution.context.getAllVariables()
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error tracking execution waiting:', error);
    }
  }

  /**
   * Handle execution resumed event
   */
  private async handleExecutionResumed(data: {
    executionId: string;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const execution = this.executionManager.getExecution(data.executionId);
      if (!execution) return;

      await this.trackingService.updateRun({
        runId: data.executionId,
        status: 'running',
        currentNodeId: execution.currentNodeId,
        executionPath: execution.executionPath,
        contextData: execution.context.getAllVariables()
      });
    } catch (error) {
      console.error('Flow Analytics: Error tracking execution resume:', error);
    }
  }

  /**
   * Handle execution completed event
   */
  private async handleExecutionCompleted(data: {
    executionId: string;
    flowId: number;
    conversationId: number;
    contactId: number;
    result?: any;
    executionPath: string[];
    duration: number;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const execution = this.executionManager.getExecution(data.executionId);
      await this.trackingService.completeRun({
        runId: data.executionId,
        flowId: data.flowId,
        durationMs: data.duration,
        currentNodeId: execution?.currentNodeId ?? null,
        executionPath: data.executionPath
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error tracking execution completion:', error);
    }
  }

  /**
   * Handle execution failed event
   */
  private async handleExecutionFailed(data: {
    executionId: string;
    flowId: number;
    conversationId: number;
    contactId: number;
    error: string;
    executionPath: string[];
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const execution = this.executionManager.getExecution(data.executionId);
      const duration = execution ? 
        execution.lastActivity.getTime() - execution.startedAt.getTime() : 0;

      await this.trackingService.failRun({
        runId: data.executionId,
        flowId: data.flowId,
        durationMs: duration,
        currentNodeId: execution?.currentNodeId ?? null,
        errorMessage: data.error,
        executionPath: data.executionPath
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error tracking execution failure:', error);
    }
  }

  /**
   * Handle node started event
   */
  private async handleNodeStarted(data: {
    executionId: string;
    nodeId: string;
    nodeType: string;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      const execution = this.executionManager.getExecution(data.executionId);
      if (!execution) return;

      const stepOrder = Math.max(1, execution.executionPath.lastIndexOf(data.nodeId) + 1);
      await this.trackingService.startNodeExecution({
        runId: data.executionId,
        nodeId: data.nodeId,
        nodeType: data.nodeType,
        stepOrder,
        inputData: execution.context.getAllVariables()
      });
    } catch (error) {
      console.error('Flow Analytics: Error tracking node start:', error);
    }
  }

  /**
   * Handle node execution event
   */
  private async handleNodeExecuted(data: {
    executionId: string;
    nodeId: string;
    nodeType: string;
    stepOrder: number;
    duration: number;
    status: 'completed' | 'failed' | 'skipped';
    inputData?: any;
    outputData?: any;
    errorMessage?: string;
  }): Promise<void> {
    try {
      if (this.isSessionShadowExecution(data.executionId)) return;

      if (data.status === 'failed') {
        await this.trackingService.failNodeExecution({
          runId: data.executionId,
          nodeId: data.nodeId,
          nodeType: data.nodeType,
          stepOrder: data.stepOrder,
          durationMs: data.duration,
          inputData: data.inputData,
          outputData: data.outputData,
          errorMessage: data.errorMessage
        });
        return;
      }

      if (data.status === 'skipped') {
        await this.trackingService.skipNodeExecution({
          runId: data.executionId,
          nodeId: data.nodeId,
          nodeType: data.nodeType,
          stepOrder: data.stepOrder,
          durationMs: data.duration,
          inputData: data.inputData,
          outputData: data.outputData
        });
        return;
      }

      await this.trackingService.completeNodeExecution({
        runId: data.executionId,
        nodeId: data.nodeId,
        nodeType: data.nodeType,
        stepOrder: data.stepOrder,
        durationMs: data.duration,
        inputData: data.inputData,
        outputData: data.outputData
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error tracking node execution:', error);
    }
  }

  /**
   * Mark execution as abandoned (for cleanup purposes)
   */
  async markExecutionAbandoned(executionId: string, reason: string = 'Timeout'): Promise<void> {
    try {
      if (this.isSessionShadowExecution(executionId)) return;

      const execution = this.executionManager.getExecution(executionId);
      if (!execution) return;

      const duration = execution.lastActivity.getTime() - execution.startedAt.getTime();

      await this.trackingService.abandonRun({
        runId: executionId,
        flowId: execution.flowId,
        durationMs: duration,
        currentNodeId: execution.currentNodeId,
        executionPath: execution.executionPath,
        contextData: execution.context.getAllVariables(),
        errorMessage: reason
      });

      
    } catch (error) {
      console.error('Flow Analytics: Error marking execution as abandoned:', error);
    }
  }

  /**
   * Cleanup old execution mappings
   */
  cleanup(): void {
    
  }

  private isSessionShadowExecution(executionId: string): boolean {
    const execution = this.executionManager.getExecution(executionId);
    if (!execution) return false;

    return Boolean(
      execution.context.getVariable('sessionId') ||
      execution.context.getVariable('session.id')
    );
  }
}
