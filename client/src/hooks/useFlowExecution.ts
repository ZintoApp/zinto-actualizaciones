import { useState, useEffect, useCallback } from 'react';
import useSocket from './useSocket';

type FlowExecutionStatus = 'running' | 'waiting' | 'completed' | 'failed';
type NodeExecutionStatus = 'pending' | 'executing' | 'executed' | 'waiting' | 'failed' | 'skipped';

interface FlowExecutionState {
  executionId: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number;
  currentNodeId: string | null;
  status: FlowExecutionStatus;
  executionPath: string[];
}

interface FlowExecutionEventData extends FlowExecutionState {
  waitingNodeId?: string;
}

interface FlowNodeExecutionEventData {
  executionId?: string;
  sessionId?: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId?: number;
  nodeId: string;
  nodeType: string;
  status: Exclude<NodeExecutionStatus, 'pending'>;
  duration?: number;
  error?: string;
}

type FlowExecutionEventType =
  | 'flowExecutionStarted'
  | 'flowExecutionUpdated'
  | 'flowExecutionWaiting'
  | 'flowExecutionCompleted'
  | 'flowExecutionFailed'
  | 'flowExecutionResumed';

type FlowNodeExecutionEventType =
  | 'flowNodeExecutionStarted'
  | 'flowNodeExecutionWaiting'
  | 'flowNodeExecutionCompleted'
  | 'flowNodeExecutionFailed'
  | 'flowNodeExecutionSkipped';

type FlowExecutionEvent = {
  type: FlowExecutionEventType;
  data: FlowExecutionEventData;
};

type FlowNodeExecutionEvent = {
  type: FlowNodeExecutionEventType;
  data: FlowNodeExecutionEventData;
};

type ExecutionEvent = FlowExecutionEvent | FlowNodeExecutionEvent;

interface NodeRuntimeState {
  activeRuns: Map<string, number>;
  waitingRuns: Map<string, number>;
  lastTerminalStatus?: Extract<NodeExecutionStatus, 'executed' | 'failed' | 'skipped'>;
  terminalEventAt?: number;
}

const FLOW_EXECUTION_EVENT_TYPES: FlowExecutionEventType[] = [
  'flowExecutionStarted',
  'flowExecutionUpdated',
  'flowExecutionWaiting',
  'flowExecutionCompleted',
  'flowExecutionFailed',
  'flowExecutionResumed'
];

const NODE_EXECUTION_EVENT_TYPES: FlowNodeExecutionEventType[] = [
  'flowNodeExecutionStarted',
  'flowNodeExecutionWaiting',
  'flowNodeExecutionCompleted',
  'flowNodeExecutionFailed',
  'flowNodeExecutionSkipped'
];

const TERMINAL_STATUS_TTL_MS = 5000;
const STALE_NODE_TIMEOUT_MS = 60000;

const cloneNodeRuntimeState = (state?: NodeRuntimeState): NodeRuntimeState => ({
  activeRuns: new Map(state?.activeRuns ?? []),
  waitingRuns: new Map(state?.waitingRuns ?? []),
  lastTerminalStatus: state?.lastTerminalStatus,
  terminalEventAt: state?.terminalEventAt
});

const getRunId = (data: FlowNodeExecutionEventData): string => {
  return data.executionId ?? data.sessionId ?? `${data.flowId}:${data.conversationId}:${data.contactId}:${data.nodeId}`;
};

const getTerminalNodeStatus = (type: FlowNodeExecutionEventType): Extract<NodeExecutionStatus, 'executed' | 'failed' | 'skipped'> => {
  switch (type) {
    case 'flowNodeExecutionFailed':
      return 'failed';
    case 'flowNodeExecutionSkipped':
      return 'skipped';
    default:
      return 'executed';
  }
};

export function useFlowExecution(flowId?: number) {
  const [activeExecutions, setActiveExecutions] = useState<Map<string, FlowExecutionState>>(new Map());
  const [nodeRuntimeStates, setNodeRuntimeStates] = useState<Map<string, NodeRuntimeState>>(new Map());
  const [executionHistory, setExecutionHistory] = useState<ExecutionEvent[]>([]);
  const { isConnected, onMessage } = useSocket('/ws');

  const recordHistory = useCallback((event: ExecutionEvent) => {
    setExecutionHistory((prev) => [...prev.slice(-49), event]);
  }, []);

  const handleFlowExecutionEvent = useCallback((event: FlowExecutionEvent) => {
    const { type, data } = event;

    if (flowId && data.flowId !== flowId) {
      return;
    }

    setActiveExecutions((prev) => {
      const updated = new Map(prev);
      const previousState = updated.get(data.executionId);
      const derivedStatus: FlowExecutionStatus =
        type === 'flowExecutionCompleted'
          ? 'completed'
          : type === 'flowExecutionFailed'
            ? 'failed'
            : type === 'flowExecutionWaiting'
              ? 'waiting'
              : 'running';

      const nextState: FlowExecutionState = {
        executionId: data.executionId,
        flowId: data.flowId,
        conversationId: data.conversationId,
        contactId: data.contactId,
        companyId: data.companyId,
        currentNodeId: data.currentNodeId ?? data.waitingNodeId ?? previousState?.currentNodeId ?? null,
        status: data.status ?? derivedStatus,
        executionPath: data.executionPath ?? previousState?.executionPath ?? []
      };

      switch (type) {
        case 'flowExecutionStarted':
        case 'flowExecutionUpdated':
        case 'flowExecutionWaiting':
        case 'flowExecutionResumed':
          updated.set(data.executionId, nextState);
          break;
        case 'flowExecutionCompleted':
        case 'flowExecutionFailed':
          updated.set(data.executionId, nextState);
          window.setTimeout(() => {
            setActiveExecutions((current) => {
              const next = new Map(current);
              next.delete(data.executionId);
              return next;
            });
          }, TERMINAL_STATUS_TTL_MS);
          break;
      }

      return updated;
    });

    recordHistory(event);
  }, [flowId, recordHistory]);

  const handleNodeExecutionEvent = useCallback((event: FlowNodeExecutionEvent) => {
    const { type, data } = event;

    if (flowId && data.flowId !== flowId) {
      return;
    }

    const runId = getRunId(data);
    const now = Date.now();

    setNodeRuntimeStates((prev) => {
      const updated = new Map(prev);
      const current = cloneNodeRuntimeState(updated.get(data.nodeId));

      switch (type) {
        case 'flowNodeExecutionStarted':
          current.activeRuns.set(runId, now);
          current.waitingRuns.delete(runId);
          break;
        case 'flowNodeExecutionWaiting':
          current.activeRuns.delete(runId);
          current.waitingRuns.set(runId, now);
          break;
        case 'flowNodeExecutionCompleted':
        case 'flowNodeExecutionFailed':
        case 'flowNodeExecutionSkipped':
          current.activeRuns.delete(runId);
          current.waitingRuns.delete(runId);
          current.lastTerminalStatus = getTerminalNodeStatus(type);
          current.terminalEventAt = now;
          break;
      }

      updated.set(data.nodeId, current);
      return updated;
    });

    recordHistory(event);
  }, [flowId, recordHistory]);

  useEffect(() => {
    const unsubscribers = [
      ...FLOW_EXECUTION_EVENT_TYPES.map((eventType) =>
        onMessage(eventType, (event: any) => handleFlowExecutionEvent(event as FlowExecutionEvent))
      ),
      ...NODE_EXECUTION_EVENT_TYPES.map((eventType) =>
        onMessage(eventType, (event: any) => handleNodeExecutionEvent(event as FlowNodeExecutionEvent))
      )
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [onMessage, handleFlowExecutionEvent, handleNodeExecutionEvent]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();

      setNodeRuntimeStates((prev) => {
        let changed = false;
        const updated = new Map<string, NodeRuntimeState>();

        prev.forEach((state, nodeId) => {
          const nextState = cloneNodeRuntimeState(state);

          nextState.activeRuns.forEach((timestamp, runId) => {
            if (now - timestamp > STALE_NODE_TIMEOUT_MS) {
              nextState.activeRuns.delete(runId);
              changed = true;
            }
          });

          nextState.waitingRuns.forEach((timestamp, runId) => {
            if (now - timestamp > STALE_NODE_TIMEOUT_MS) {
              nextState.waitingRuns.delete(runId);
              changed = true;
            }
          });

          if (nextState.terminalEventAt && now - nextState.terminalEventAt > TERMINAL_STATUS_TTL_MS) {
            nextState.lastTerminalStatus = undefined;
            nextState.terminalEventAt = undefined;
            changed = true;
          }

          if (nextState.activeRuns.size > 0 || nextState.waitingRuns.size > 0 || nextState.lastTerminalStatus) {
            updated.set(nodeId, nextState);
          } else {
            changed = true;
          }
        });

        return changed ? updated : prev;
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const getFlowExecutions = useCallback((targetFlowId: number) => {
    return Array.from(activeExecutions.values()).filter((execution) => execution.flowId === targetFlowId);
  }, [activeExecutions]);

  const getConversationExecutions = useCallback((conversationId: number) => {
    return Array.from(activeExecutions.values()).filter((execution) => execution.conversationId === conversationId);
  }, [activeExecutions]);

  const getNodeExecutionStatus = useCallback((nodeId: string): NodeExecutionStatus => {
    const state = nodeRuntimeStates.get(nodeId);

    if (!state) {
      return 'pending';
    }

    if (state.activeRuns.size > 0) {
      return 'executing';
    }

    if (state.waitingRuns.size > 0) {
      return 'waiting';
    }

    if (state.lastTerminalStatus && state.terminalEventAt && Date.now() - state.terminalEventAt <= TERMINAL_STATUS_TTL_MS) {
      return state.lastTerminalStatus;
    }

    return 'pending';
  }, [nodeRuntimeStates]);

  const isNodeExecuting = useCallback((nodeId: string) => {
    return getNodeExecutionStatus(nodeId) === 'executing';
  }, [getNodeExecutionStatus]);

  const wasNodeExecuted = useCallback((nodeId: string) => {
    const status = getNodeExecutionStatus(nodeId);
    return status === 'executed' || status === 'waiting' || status === 'executing';
  }, [getNodeExecutionStatus]);

  const getAllActiveExecutions = useCallback(() => {
    return Array.from(activeExecutions.values());
  }, [activeExecutions]);

  const getExecutionStats = useCallback(() => {
    const executions = Array.from(activeExecutions.values());
    return {
      total: executions.length,
      running: executions.filter((execution) => execution.status === 'running').length,
      waiting: executions.filter((execution) => execution.status === 'waiting').length,
      completed: executions.filter((execution) => execution.status === 'completed').length,
      failed: executions.filter((execution) => execution.status === 'failed').length
    };
  }, [activeExecutions]);

  const clearExecutionHistory = useCallback(() => {
    setExecutionHistory([]);
  }, []);

  const clearAllExecutions = useCallback(() => {
    setActiveExecutions(new Map());
    setNodeRuntimeStates(new Map());
    setExecutionHistory([]);
  }, []);

  return {
    isConnected,
    activeExecutions: getAllActiveExecutions(),
    currentlyExecutingNode: null,
    executionHistory,
    getFlowExecutions,
    getConversationExecutions,
    isNodeExecuting,
    wasNodeExecuted,
    getNodeExecutionStatus,
    getExecutionStats,
    clearExecutionHistory,
    clearAllExecutions
  };
}

export default useFlowExecution;
