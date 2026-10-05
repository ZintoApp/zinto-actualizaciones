import { APP_ICONS } from '@/assets/icons';
import React, { useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowExecution } from '../../hooks/useFlowExecution';

type NodeExecutionStatus = 'pending' | 'executing' | 'executed' | 'waiting' | 'failed' | 'skipped';

interface ExecutionOverlayProps {
  status: NodeExecutionStatus;
  children: React.ReactNode;
  className?: string;
}

/**
 * Execution Overlay Component
 * Provides Make.com-style visual feedback for node execution
 */
export const ExecutionOverlay: React.FC<ExecutionOverlayProps> = ({
  status,
  children,
  className = ''
}) => {
  const shimmerId = useId().replace(/:/g, '');
  const isExecuting = status === 'executing';
  const isWaiting = status === 'waiting';
  const isExecuted = status === 'executed';
  const isFailed = status === 'failed';

  const badgeStatus: Exclude<NodeExecutionStatus, 'pending' | 'skipped'> | null =
    status === 'executing' || status === 'waiting' || status === 'executed' || status === 'failed'
      ? status
      : null;

  const tone = isExecuting
    ? {
        header: 'from-sky-500/18 via-sky-400/9 to-transparent',
        accent: 'bg-sky-500',
        border: 'border-sky-400/80',
        ring: 'shadow-[0_0_0_1px_rgba(14,165,233,0.16),0_1px_0_rgba(14,165,233,0.08)]',
        surface: 'bg-sky-500/[0.035]'
      }
    : isWaiting
      ? {
          header: 'from-amber-500/16 via-amber-400/8 to-transparent',
          accent: 'bg-amber-500',
          border: 'border-amber-400/80',
          ring: 'shadow-[0_0_0_1px_rgba(245,158,11,0.14),0_1px_0_rgba(245,158,11,0.06)]',
          surface: 'bg-amber-500/[0.03]'
        }
      : isExecuted
        ? {
            header: 'from-emerald-500/12 via-emerald-400/6 to-transparent',
            accent: 'bg-emerald-500',
            border: 'border-emerald-300/80',
            ring: 'shadow-[0_0_0_1px_rgba(16,185,129,0.10)]',
            surface: 'bg-emerald-500/[0.02]'
          }
        : {
            header: 'from-rose-500/12 via-rose-400/6 to-transparent',
            accent: 'bg-rose-500',
            border: 'border-rose-300/80',
            ring: 'shadow-[0_0_0_1px_rgba(244,63,94,0.12)]',
            surface: 'bg-rose-500/[0.02]'
          };

  return (
    <div className={`relative inline-block align-top ${className}`}>
      {children}
      
      <AnimatePresence>
        {badgeStatus && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none"
          >
            <div className={`absolute inset-0 rounded-lg ${tone.surface}`} />
            <div className={`absolute left-px right-px top-px h-10 rounded-t-lg bg-gradient-to-b ${tone.header}`} />
            <div className="absolute left-px right-px top-px h-px rounded-t-lg bg-white/60 dark:bg-white/10" />

            {(isExecuting || isWaiting) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`exec-shimmer-${shimmerId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                      <stop offset="25%" stopColor="rgba(255,255,255,0.25)" />
                      <stop offset="50%" stopColor="rgba(255,255,255,0.95)" />
                      <stop offset="75%" stopColor="rgba(255,255,255,0.25)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  <motion.rect
                    x="1.2"
                    y="1.2"
                    width="97.6"
                    height="97.6"
                    rx="9"
                    ry="9"
                    fill="none"
                    stroke={`url(#exec-shimmer-${shimmerId})`}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray="18 82"
                    animate={{ strokeDashoffset: [0, -100] }}
                    transition={{
                      duration: isWaiting ? 2.8 : 1.8,
                      repeat: Infinity,
                      ease: 'linear'
                    }}
                  />
                </svg>
              </motion.div>
            )}

            <div className="absolute right-2 top-2">
              <ExecutionStatusBadge status={badgeStatus} />
            </div>

            {(isExecuting || isWaiting || isExecuted || isFailed) && (
              <div className={`absolute inset-0 rounded-lg border ${tone.border} ${tone.ring}`} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ExecutionStatusBadgeProps {
  status: 'executing' | 'executed' | 'waiting' | 'failed';
  className?: string;
}

/**
 * Execution Status Badge Component
 * Shows the current execution status of a node
 */
export const ExecutionStatusBadge: React.FC<ExecutionStatusBadgeProps> = ({
  status,
  className = ''
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'executing':
        return {
          badge: 'border-sky-200/80 bg-background/90 text-sky-900 shadow-[0_1px_2px_rgba(2,132,199,0.06),0_6px_18px_rgba(2,132,199,0.04)] dark:border-sky-400/60 dark:bg-sky-500/15 dark:text-sky-200 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
          dot: 'bg-sky-500',
          showDot: false,
          text: 'Running',
          icon: (
            <img
              src={APP_ICONS.executionRunning}
              alt=""
              className="w-3 h-3 object-contain"
            />
          )
        };
      case 'executed':
        return {
          badge: 'border-emerald-200/80 bg-background/90 text-emerald-900 shadow-[0_1px_2px_rgba(5,150,105,0.05),0_6px_18px_rgba(5,150,105,0.03)] dark:border-emerald-400/60 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
          dot: 'bg-emerald-500',
          showDot: false,
          text: 'Done',
          icon: (
            <img
              src={APP_ICONS.executionSuccess}
              alt=""
              className="w-4 h-4 object-contain"
            />
          )
        };
      case 'waiting':
        return {
          badge: 'border-amber-200/80 bg-background/90 text-amber-900 shadow-[0_1px_2px_rgba(217,119,6,0.05),0_6px_18px_rgba(217,119,6,0.03)] dark:border-amber-400/60 dark:bg-amber-500/15 dark:text-amber-200 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
          dot: 'bg-amber-500',
          showDot: false,
          text: 'Waiting',
          icon: (
            <img
              src={APP_ICONS.wait}
              alt=""
              className="w-3 h-3 object-contain"
            />
          )
        };
      case 'failed':
        return {
          badge: 'border-rose-200/80 bg-background/90 text-rose-900 shadow-[0_1px_2px_rgba(225,29,72,0.05),0_6px_18px_rgba(225,29,72,0.03)] dark:border-rose-400/60 dark:bg-rose-500/15 dark:text-rose-200 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
          dot: 'bg-rose-500',
          showDot: true,
          text: 'Failed',
          icon: (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  
  if (!config) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold tracking-tight backdrop-blur-md ${config.badge} ${className}`}
    >
      <span className={`relative flex items-center justify-center ${config.showDot !== false ? 'h-2.5 w-2.5' : 'h-6 w-6'}`}>
        {config.icon}
        {config.showDot !== false && (
          <span className={`relative h-2.5 w-2.5 rounded-full ring-2 ring-background/80 ${config.dot}`} />
        )}
      </span>
      <span>{config.text}</span>
    </motion.div>
  );
};

interface ExecutionProgressProps {
  flowId: number;
  className?: string;
}

/**
 * Execution Progress Component
 * Shows overall execution progress for a flow
 */
export const ExecutionProgress: React.FC<ExecutionProgressProps> = ({
  flowId,
  className = ''
}) => {
  const { getFlowExecutions, getExecutionStats } = useFlowExecution(flowId);
  
  const executions = getFlowExecutions(flowId);
  const stats = getExecutionStats();
  
  if (executions.length === 0) {
    return null;
  }

  return (
    <div className={`bg-card border border-border rounded-lg p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Flow Execution Status</h3>
      
      <div className="space-y-2">
        {executions.map((execution) => (
          <div key={execution.executionId} className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ExecutionStatusBadge status={execution.status === 'running' ? 'executing' : execution.status === 'completed' ? 'executed' : execution.status} />
              <span className="text-sm text-gray-600">
                Execution {execution.executionId.slice(-8)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {execution.executionPath.length} nodes executed
            </div>
          </div>
        ))}
      </div>
      
      {stats.total > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Total: {stats.total}</span>
            <span>Running: {stats.running}</span>
            <span>Waiting: {stats.waiting}</span>
            <span>Completed: {stats.completed}</span>
            {stats.failed > 0 && <span className="text-red-500">Failed: {stats.failed}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionOverlay;
