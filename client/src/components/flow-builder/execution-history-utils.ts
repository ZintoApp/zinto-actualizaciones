export type ExecutionHistoryBadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'outline';
export type ExecutionHistoryRunFilter = 'all' | 'running' | 'waiting' | 'completed' | 'failed' | 'abandoned' | 'timeout';

export type ExecutionHistoryStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'abandoned' | 'timeout' | 'skipped';

export function getExecutionHistoryStatusVariant(status: string): ExecutionHistoryBadgeVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'abandoned':
    case 'timeout':
      return 'destructive';
    case 'waiting':
    case 'skipped':
      return 'secondary';
    default:
      return 'default';
  }
}

export function getExecutionHistoryStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Success';
    case 'failed':
      return 'Error';
    case 'waiting':
      return 'Waiting';
    case 'timeout':
      return 'Timed out';
    case 'abandoned':
      return 'Abandoned';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Running';
  }
}

export function filterExecutionHistoryRuns<T extends { status: string }>(
  runs: T[],
  filter: ExecutionHistoryRunFilter
): T[] {
  if (filter === 'all') {
    return runs;
  }

  return runs.filter((run) => run.status === filter);
}

export function getNextSelectedRunId(
  isOpen: boolean,
  runs: Array<{ runId: string }>,
  selectedRunId: string | null
): string | null {
  if (!isOpen || runs.length === 0) {
    return null;
  }

  if (!selectedRunId || !runs.some((run) => run.runId === selectedRunId)) {
    return runs[0].runId;
  }

  return selectedRunId;
}

export function getNextSelectedStepId(
  steps: Array<{ id: number; status: string }>,
  selectedStepId: number | null
): number | null {
  if (steps.length === 0) {
    return null;
  }

  if (selectedStepId != null && steps.some((step) => step.id === selectedStepId)) {
    return selectedStepId;
  }

  return (
    steps.find((step) => step.status === 'failed')?.id ??
    steps.find((step) => step.status === 'waiting')?.id ??
    steps.find((step) => step.status === 'running')?.id ??
    steps[0].id
  );
}

export function getExecutionStepStats(steps: Array<{ status: string }>) {
  return steps.reduce(
    (acc, step) => {
      acc.total += 1;
      if (step.status === 'completed') acc.completed += 1;
      if (step.status === 'failed') acc.failed += 1;
      if (step.status === 'waiting') acc.waiting += 1;
      if (step.status === 'running') acc.running += 1;
      if (step.status === 'skipped') acc.skipped += 1;
      return acc;
    },
    { total: 0, completed: 0, failed: 0, waiting: 0, running: 0, skipped: 0 }
  );
}

export function formatExecutionDuration(value?: number | null): string {
  if (value == null) {
    return '—';
  }

  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

export function formatExecutionPath(path?: unknown): string | null {
  return Array.isArray(path) ? path.join(' → ') : null;
}

export function formatExecutionData(value?: unknown): string {
  if (value == null) {
    return '—';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}