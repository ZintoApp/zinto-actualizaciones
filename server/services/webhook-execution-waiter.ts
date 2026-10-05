import { FlowExecutionManager } from './flow-execution-manager';

export interface ExecutionWaitResult {
  status: 'completed' | 'failed' | 'timeout';
  result?: any;
  context?: import('./flow-execution-context').FlowExecutionContext;
  duration?: number;
  error?: string;
  message?: string;
}

/**
 * Waits for a flow execution to complete or fail, with a timeout.
 * Used by webhook sync mode to block until the flow finishes before sending the response.
 */
export async function waitForExecution(
  executionId: string,
  timeoutMs: number
): Promise<ExecutionWaitResult> {
  const manager = FlowExecutionManager.getInstance();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let cleanup: (() => void) | null = null;

  cleanup = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    manager.off('executionCompleted', onCompleted);
    manager.off('executionFailed', onFailed);
  };

  const onCompleted = (data: { executionId: string; result?: any; duration?: number }) => {
    if (data.executionId !== executionId) return;
    if (settled) return;
    settled = true;
    if (cleanup) cleanup();
    const execution = manager.getExecution(executionId);
    if (execution?.context) {
      execution.context.setExecutionResult({
        status: 'completed',
        result: data.result,
        duration: data.duration
      });
    }
    resolveExecution({ status: 'completed', result: data.result, context: execution?.context, duration: data.duration });
  };

  const onFailed = (data: { executionId: string; error: string; duration?: number }) => {
    if (data.executionId !== executionId) return;
    if (settled) return;
    settled = true;
    if (cleanup) cleanup();
    const execution = manager.getExecution(executionId);
    if (execution?.context) {
      execution.context.setExecutionResult({
        status: 'failed',
        error: data.error,
        duration: data.duration
      });
    }
    resolveExecution({ status: 'failed', context: execution?.context, duration: data.duration, error: data.error });
  };

  let resolveExecution: (value: ExecutionWaitResult) => void;
  const executionPromise = new Promise<ExecutionWaitResult>((resolve) => {
    resolveExecution = resolve;
  });

  const timeoutPromise = new Promise<ExecutionWaitResult>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (cleanup) cleanup();
      reject({ status: 'timeout' as const, message: 'Flow execution exceeded timeout' });
    }, timeoutMs);
  });

  manager.on('executionCompleted', onCompleted);
  manager.on('executionFailed', onFailed);

  try {
    const result = await Promise.race([executionPromise, timeoutPromise]);
    return result;
  } catch (err: any) {
    if (err?.status === 'timeout') {
      return { status: 'timeout', message: err.message ?? 'Flow execution exceeded timeout' };
    }
    throw err;
  }
}
