import { EventEmitter } from 'events';
import { FlowExecutionContext } from './flow-execution-context';

/**
 * Flow Execution Manager
 * Manages active flow executions, state tracking, and real-time updates
 */
export class FlowExecutionManager extends EventEmitter {
  private static instance: FlowExecutionManager;
  private activeExecutions: Map<string, FlowExecutionState> = new Map();
  private executionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly EXECUTION_TIMEOUT = 30 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private readonly EXECUTION_TTL_MS = 24 * 60 * 60 * 1000;

  private constructor() {
    super();
    this.startPeriodicCleanup();
  }

  static getInstance(): FlowExecutionManager {
    if (!FlowExecutionManager.instance) {
      FlowExecutionManager.instance = new FlowExecutionManager();
    }
    return FlowExecutionManager.instance;
  }

  /**
   * Start a new flow execution
   */
  startExecution(
    flowId: number,
    conversationId: number,
    contactId: number,
    triggerNodeId: string,
    initialData?: any,
    companyId?: number
  ): string {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const execution: FlowExecutionState = {
      id: executionId,
      flowId,
      conversationId,
      contactId,
      companyId,
      currentNodeId: triggerNodeId,
      status: 'running',
      startedAt: new Date(),
      lastActivity: new Date(),
      context: new FlowExecutionContext(initialData),
      executionPath: [triggerNodeId],
      waitingForInput: false,
      lastNodeResult: null
    };

    execution.context.setVariable('execution.id', executionId);

    this.activeExecutions.set(executionId, execution);
    this.setExecutionTimeout(executionId);

    this.emit('executionStarted', {
      executionId,
      flowId,
      conversationId,
      contactId,
      companyId,
      currentNodeId: triggerNodeId
    });

    
    return executionId;
  }

  /**
   * Update execution state when moving to next node
   */
  updateExecution(
    executionId: string,
    currentNodeId: string,
    status: 'running' | 'waiting' | 'completed' | 'failed' = 'running',
    nodeResult?: any
  ): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      
      return;
    }

    execution.currentNodeId = currentNodeId;
    execution.status = status;
    execution.lastActivity = new Date();
    execution.lastNodeResult = nodeResult;

    if (!execution.executionPath.includes(currentNodeId)) {
      execution.executionPath.push(currentNodeId);
    }

    this.setExecutionTimeout(executionId);

    this.emit('executionUpdated', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      currentNodeId,
      status,
      executionPath: execution.executionPath
    });

    
  }

  /**
   * Mark execution as waiting for user input
   */
  setWaitingForInput(executionId: string, waitingNodeId: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    execution.status = 'waiting';
    execution.waitingForInput = true;
    execution.currentNodeId = waitingNodeId;
    execution.lastActivity = new Date();

    this.emit('executionWaiting', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      waitingNodeId
    });

    
  }

  /**
   * Resume execution after user input
   */
  resumeExecution(executionId: string, userInput: any): boolean {
    const execution = this.activeExecutions.get(executionId);
    if (!execution || !execution.waitingForInput) {
      return false;
    }

    execution.waitingForInput = false;
    execution.status = 'running';
    execution.lastActivity = new Date();
    execution.context.setVariable('userInput', userInput);

    this.emit('executionResumed', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      userInput
    });

    
    return true;
  }

  /**
   * Complete flow execution
   */
  completeExecution(executionId: string, result?: any): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    execution.status = 'completed';
    execution.waitingForInput = false;
    execution.lastActivity = new Date();

    this.clearExecutionTimeout(executionId);

    this.emit('executionCompleted', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      result,
      executionPath: execution.executionPath,
      duration: execution.lastActivity.getTime() - execution.startedAt.getTime()
    });

    setTimeout(() => {
      this.activeExecutions.delete(executionId);
    }, 5 * 60 * 1000);

    
  }

  /**
   * Fail flow execution
   */
  failExecution(executionId: string, error: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    execution.status = 'failed';
    execution.waitingForInput = false;
    execution.lastActivity = new Date();

    this.clearExecutionTimeout(executionId);

    this.emit('executionFailed', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      error,
      executionPath: execution.executionPath,
      duration: execution.lastActivity.getTime() - execution.startedAt.getTime()
    });

    console.error(`Flow execution failed: ${executionId} - ${error}`);

    // Delay delete so sync webhook waiter can read execution context for response building
    setTimeout(() => {
      this.activeExecutions.delete(executionId);
    }, 5000);
  }

  /**
   * Emit node start event for real-time node indicators
   */
  emitNodeStarting(executionId: string, nodeId: string, nodeType: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    this.emit('nodeStarted', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      nodeId,
      nodeType,
      status: 'executing',
      timestamp: new Date()
    });
  }

  /**
   * Track node execution for analytics
   */
  trackNodeExecution(
    executionId: string,
    nodeId: string,
    nodeType: string,
    duration: number,
    status: 'completed' | 'failed' | 'skipped' = 'completed',
    inputData?: any,
    outputData?: any,
    errorMessage?: string
  ): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const stepOrder = execution.executionPath.indexOf(nodeId) + 1;

    this.emit('nodeExecuted', {
      executionId,
      flowId: execution.flowId,
      conversationId: execution.conversationId,
      contactId: execution.contactId,
      companyId: execution.companyId,
      nodeId,
      nodeType,
      stepOrder,
      duration,
      status,
      inputData,
      outputData,
      errorMessage,
      timestamp: new Date()
    });

    
  }

  /**
   * Get execution state
   */
  getExecution(executionId: string): FlowExecutionState | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Get active executions for a conversation
   */
  getExecutionsForConversation(conversationId: number): FlowExecutionState[] {
    return Array.from(this.activeExecutions.values())
      .filter(exec => exec.conversationId === conversationId);
  }

  /**
   * Get waiting executions for a conversation (for user input)
   */
  getWaitingExecutionsForConversation(conversationId: number): FlowExecutionState[] {
    return this.getExecutionsForConversation(conversationId)
      .filter(exec => exec.waitingForInput);
  }

  /**
   * Set execution timeout
   */
  private setExecutionTimeout(executionId: string): void {
    this.clearExecutionTimeout(executionId);

    const timeout = setTimeout(() => {
      this.failExecution(executionId, 'Execution timeout');
    }, this.EXECUTION_TIMEOUT);

    this.executionTimeouts.set(executionId, timeout);
  }

  /**
   * Clear execution timeout
   */
  private clearExecutionTimeout(executionId: string): void {
    const timeout = this.executionTimeouts.get(executionId);
    if (timeout) {
      clearTimeout(timeout);
      this.executionTimeouts.delete(executionId);
    }
  }

  /**
   * Start periodic cleanup process
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    
  }

  /**
   * Stop periodic cleanup process
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      
    }
  }

  /**
   * Cleanup old executions
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    let staleCount = 0;

    Array.from(this.activeExecutions.entries()).forEach(([executionId, execution]) => {
      const age = now - execution.lastActivity.getTime();
      const totalAge = now - execution.startedAt.getTime();

      const shouldCleanupCompleted = (execution.status === 'completed' || execution.status === 'failed')
        && age > (60 * 60 * 1000); // 1 hour for completed/failed

      const shouldCleanupOld = totalAge > this.EXECUTION_TTL_MS; // 24 hours total


      const shouldCleanupStale = execution.status === 'running' && age > (2 * 60 * 60 * 1000);

      if (shouldCleanupCompleted || shouldCleanupOld) {
        this.clearExecutionTimeout(executionId);
        this.activeExecutions.delete(executionId);
        cleanedCount++;
      } else if (shouldCleanupStale) {

        this.failExecution(executionId, 'Execution timed out due to inactivity');
        staleCount++;
      }
    });

    const totalCleaned = cleanedCount + staleCount;
    if (totalCleaned > 0) {

    }
  }

  /**
   * Shutdown the execution manager
   */
  shutdown(): void {
    this.stopPeriodicCleanup();

    this.executionTimeouts.forEach(timeout => clearTimeout(timeout));
    this.executionTimeouts.clear();

    this.activeExecutions.clear();

    
  }
}

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
  context: FlowExecutionContext;
  executionPath: string[];
  waitingForInput: boolean;
  lastNodeResult: any;
}
