'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  GitBranch,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Timer,
  Trash2,
  Workflow,
  XCircle,
  Braces as TabIconBraces,
  Database as TabIconDatabase,
  History as TabIconHistory,
  Info as TabIconInfo,
  LogIn as TabIconLogIn,
  LogOut as TabIconLogOut,
} from 'lucide-react';
import type { DurableFlowExecutionDetailResponse, DurableFlowExecutionSummary } from '@shared/types/flow-execution';
import {
  filterExecutionHistoryRuns,
  formatExecutionData,
  formatExecutionDuration,
  formatExecutionPath,
  getExecutionHistoryStatusLabel,
  getExecutionHistoryStatusVariant,
  getExecutionStepStats,
  getNextSelectedRunId,
  getNextSelectedStepId,
  type ExecutionHistoryRunFilter
} from './execution-history-utils';

interface ExecutionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowId: string | number | null;
}

const RUN_LIMIT = 20;

export function ExecutionHistoryModal({ isOpen, onClose, flowId }: ExecutionHistoryModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [runFilter, setRunFilter] = useState<ExecutionHistoryRunFilter>('all');
  const [activeTab, setActiveTab] = useState('timeline');
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const flowIdNum = flowId != null ? Number(flowId) : null;

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      if (flowIdNum == null) {
        throw new Error('Flow ID is required');
      }

      const res = await apiRequest('DELETE', `/api/flows/${flowIdNum}/executions`);
      return res.json() as Promise<{ deleted?: number }>;
    },
    onSuccess: (data) => {
      setIsClearDialogOpen(false);
      setSelectedRunId(null);
      setSelectedStepId(null);
      setActiveTab('timeline');
      queryClient.invalidateQueries({ queryKey: ['flow-execution-history', flowIdNum, RUN_LIMIT] });
      queryClient.removeQueries({ queryKey: ['flow-execution-history-detail', flowIdNum] });
      toast({
        title: t('flow_builder.execution_history_cleared', 'Execution history cleared'),
        description: t('flow_builder.execution_history_cleared_count', '{{count}} run(s) removed', { count: data?.deleted ?? 0 })
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('flow_builder.execution_history_clear_failed', 'Clear failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const runsQuery = useQuery({
    queryKey: ['flow-execution-history', flowIdNum, RUN_LIMIT],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/flows/${flowIdNum}/executions?limit=${RUN_LIMIT}`);
      return res.json() as Promise<{ executions: DurableFlowExecutionSummary[] }>;
    },
    enabled: isOpen && flowIdNum != null
  });

  const runs = runsQuery.data?.executions ?? [];
  const filteredRuns = useMemo(() => filterExecutionHistoryRuns(runs, runFilter), [runs, runFilter]);

  const runCounts = useMemo(() => ({
    all: runs.length,
    failed: runs.filter((run) => run.status === 'failed').length,
    waiting: runs.filter((run) => run.status === 'waiting').length,
    running: runs.filter((run) => run.status === 'running').length,
    completed: runs.filter((run) => run.status === 'completed').length
  }), [runs]);

  useEffect(() => {
    const nextSelectedRunId = getNextSelectedRunId(isOpen, filteredRuns, selectedRunId);
    if (nextSelectedRunId !== selectedRunId) {
      setSelectedRunId(nextSelectedRunId);
      setActiveTab('timeline');
    }
  }, [filteredRuns, isOpen, selectedRunId]);

  const detailQuery = useQuery({
    queryKey: ['flow-execution-history-detail', flowIdNum, selectedRunId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/flows/${flowIdNum}/executions/${encodeURIComponent(selectedRunId!)}`);
      return res.json() as Promise<DurableFlowExecutionDetailResponse>;
    },
    enabled: isOpen && flowIdNum != null && !!selectedRunId
  });

  useEffect(() => {
    const nextSelectedStepId = getNextSelectedStepId(detailQuery.data?.steps ?? [], selectedStepId);
    if (nextSelectedStepId !== selectedStepId) {
      setSelectedStepId(nextSelectedStepId);
    }
  }, [detailQuery.data?.steps, selectedStepId]);

  const selectedPath = useMemo(() => {
    return formatExecutionPath(detailQuery.data?.run.executionPath);
  }, [detailQuery.data?.run.executionPath]);

  const selectedStep = useMemo(() => {
    return detailQuery.data?.steps.find((step) => step.id === selectedStepId) ?? null;
  }, [detailQuery.data?.steps, selectedStepId]);

  const stepStats = useMemo(() => getExecutionStepStats(detailQuery.data?.steps ?? []), [detailQuery.data?.steps]);

  const handleRefresh = () => {
    runsQuery.refetch();
    if (selectedRunId) {
      detailQuery.refetch();
    }
  };

  const formatTimestamp = (value?: string | Date | null) => value ? new Date(value).toLocaleString() : '—';

  const getStatusDotClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500';
      case 'failed':
      case 'abandoned':
      case 'timeout':
        return 'bg-rose-500';
      case 'waiting':
        return 'bg-amber-500';
      default:
        return 'bg-sky-500';
    }
  };

  const getStatusIcon = (status: string, className = 'h-4 w-4') => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={cn(className, 'text-emerald-500')} />;
      case 'failed':
        return <XCircle className={cn(className, 'text-rose-500')} />;
      case 'abandoned':
        return <Ban className={cn(className, 'text-rose-500')} />;
      case 'timeout':
        return <AlertCircle className={cn(className, 'text-rose-500')} />;
      case 'waiting':
        return <PauseCircle className={cn(className, 'text-amber-500')} />;
      case 'skipped':
        return <CircleDashed className={cn(className, 'text-muted-foreground')} />;
      default:
        return <PlayCircle className={cn(className, 'text-sky-500')} />;
    }
  };

  const getStatusPanelClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-emerald-200/70 bg-emerald-500/[0.04]';
      case 'failed':
      case 'abandoned':
      case 'timeout':
        return 'border-rose-200/70 bg-rose-500/[0.04]';
      case 'waiting':
        return 'border-amber-200/70 bg-amber-500/[0.04]';
      default:
        return 'border-sky-200/70 bg-sky-500/[0.04]';
    }
  };

  const filterOptions: Array<{ key: ExecutionHistoryRunFilter; label: string; count: number }> = [
    { key: 'all', label: t('common.all', 'All'), count: runCounts.all },
    { key: 'failed', label: t('common.failed', 'Failed'), count: runCounts.failed },
    { key: 'waiting', label: t('common.waiting', 'Waiting'), count: runCounts.waiting },
    { key: 'running', label: t('common.running', 'Running'), count: runCounts.running },
    { key: 'completed', label: t('common.completed', 'Completed'), count: runCounts.completed }
  ];

  const renderJsonPanel = (title: string, value: unknown) => (
    <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm xl:min-h-0">
      <div className="shrink-0 border-b bg-muted/20 px-3 py-2.5 sm:px-4 sm:py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      </div>
      <ScrollArea type="always" className="min-h-0 flex-1 max-h-[50vh] lg:max-h-none">
        <pre className="min-h-full bg-muted/10 p-3 font-mono text-[11px] leading-5 text-foreground whitespace-pre-wrap break-words sm:p-4 sm:text-[12px]">{formatExecutionData(value)}</pre>
      </ScrollArea>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-tour="components-flow-builder-executionhistorymodal.dialogcontent.flow_builder.execution_history_title"
        className="h-[100dvh] max-h-[100dvh] max-w-[100vw] rounded-none sm:h-[96vh] sm:max-h-[96vh] sm:max-w-[96vw] sm:rounded-lg xl:max-w-[1400px]"
        contentNoScroll
      >
        <div className="-m-6 mb-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:overflow-hidden">
          <DialogHeader className="border-b bg-muted/20 px-4 py-3 pr-14 text-left sm:px-6 sm:py-4 sm:pr-16">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-base sm:text-lg">{t('flow_builder.execution_history_title', 'Execution History')}</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {t('flow_builder.execution_history_subtitle', 'Inspect durable runs, node-by-node progress, and captured execution data.')}
                </p>
              </div>
              {flowIdNum != null && (
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <Button data-tour="components-flow-builder-executionhistorymodal.button.common.refresh"
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 px-0 sm:w-auto sm:px-3"
                    onClick={handleRefresh}
                    disabled={runsQuery.isFetching || detailQuery.isFetching || clearHistoryMutation.isPending}
                    aria-label={t('common.refresh', 'Refresh')}
                    title={t('common.refresh', 'Refresh')}
                  >
                    {(runsQuery.isFetching || detailQuery.isFetching)
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RefreshCw className="h-4 w-4" />}
                    <span className="sr-only sm:not-sr-only">
                      {t('common.refresh', 'Refresh')}
                    </span>
                  </Button>
                  <Button data-tour="components-flow-builder-executionhistorymodal.button.flow_builder.execution_history_clear_button"
                    variant="destructive"
                    size="sm"
                    className="h-9 w-9 px-0 sm:w-auto sm:px-3"
                    onClick={() => setIsClearDialogOpen(true)}
                    disabled={runsQuery.isLoading || runs.length === 0 || clearHistoryMutation.isPending}
                    aria-label={t('flow_builder.execution_history_clear_button', 'Clear history')}
                    title={t('flow_builder.execution_history_clear_button', 'Clear history')}
                  >
                    {clearHistoryMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                    <span className="sr-only sm:not-sr-only">
                      {t('flow_builder.execution_history_clear_button', 'Clear history')}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          {!flowIdNum ? (
            <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
              <div className="max-w-md space-y-2 text-center">
                <Workflow className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="text-lg font-semibold">{t('flow_builder.execution_history_save_flow_title', 'Save this flow first')}</h3>
                <p className="text-sm text-muted-foreground">{t('flow_builder.execution_history_save_flow', 'Save the flow to view durable execution history.')}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
              <aside className="flex w-full min-w-0 flex-col border-b bg-muted/10 lg:w-[356px] lg:min-w-[356px] lg:border-b-0 lg:border-r">
                <div className="space-y-3 border-b px-4 py-4 sm:space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t('flow_builder.execution_history_recent_runs', 'Recent executions')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.execution_history_recent_runs_subtitle', 'Pick a run to inspect node-level history.')}</p>
                    </div>
                    <Badge variant="outline">{runs.length}</Badge>
                  </div>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                    {filterOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setRunFilter(option.key)}
                        className={cn(
                          'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          runFilter === option.key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span>{option.label}</span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{option.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <ScrollArea type="always" className="min-h-0 flex-1 lg:overscroll-contain">
                  <div className="space-y-3 p-4">
                    {runsQuery.isLoading ? (
                      Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="space-y-3 rounded-xl border bg-background p-4">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      ))
                    ) : runsQuery.error ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{t('common.error', 'Error')}</AlertTitle>
                        <AlertDescription>{(runsQuery.error as Error).message}</AlertDescription>
                      </Alert>
                    ) : filteredRuns.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
                        {runs.length === 0
                          ? t('flow_builder.execution_history_empty', 'No durable executions found for this flow yet.')
                          : t('flow_builder.execution_history_empty_filter', 'No executions match the current filter.')}
                      </div>
                    ) : (
                      filteredRuns.map((run) => (
                        <button
                          key={run.runId}
                          type="button"
                          onClick={() => setSelectedRunId(run.runId)}
                          className={cn(
                            'group relative w-full overflow-hidden rounded-[22px] border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm sm:p-4',
                            selectedRunId === run.runId
                              ? `${getStatusPanelClass(run.status)} border-primary shadow-sm`
                              : 'border-border/70'
                          )}
                        >
                          <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-muted/30 to-transparent opacity-80" />
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(run.status, 'h-4 w-4')}
                                <span className="truncate text-sm font-semibold leading-none">
                                  {getExecutionHistoryStatusLabel(run.status)}
                                </span>
                              </div>
                              <p className="mt-2 truncate text-xs text-muted-foreground">{formatTimestamp(run.startedAt)}</p>
                            </div>
                            <Badge variant="outline" className="relative z-[1] capitalize">{run.runtimeType}</Badge>
                          </div>

                          <div className="relative z-[1] mt-4 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full border bg-background/80 px-2.5 py-1 font-medium">
                              {formatExecutionDuration(run.totalDurationMs)}
                            </span>
                            <span className="inline-flex max-w-full truncate rounded-full border bg-background/80 px-2.5 py-1 font-medium">
                              run/{run.runId}
                            </span>
                          </div>

                          <div className="relative z-[1] mt-4 space-y-3 text-xs">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('flow_builder.execution_history_trigger', 'Trigger')}</p>
                              <div className="mt-1 flex items-center gap-2 rounded-xl border bg-background/70 px-3 py-2">
                                <span className={cn('h-2 w-2 rounded-full', getStatusDotClass(run.status))} />
                                <p className="truncate font-mono text-[11px]">{run.triggerNodeId}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('flow_builder.execution_history_current_node', 'Current Node')}</p>
                              <div className="mt-1 flex items-center gap-2 rounded-xl border bg-background/70 px-3 py-2">
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                <p className="truncate font-mono text-[11px]">{run.currentNodeId ?? '—'}</p>
                              </div>
                            </div>
                          </div>

                          {run.errorMessage && (
                            <div className="relative z-[1] mt-3 rounded-xl border border-rose-200/80 bg-rose-500/[0.05] px-3 py-2">
                              <p className="line-clamp-2 text-xs text-destructive">{run.errorMessage}</p>
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </aside>

              <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background lg:overflow-hidden">
                {!selectedRunId ? (
                  <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
                    <div className="max-w-md space-y-2 text-center">
                      <GitBranch className="mx-auto h-10 w-10 text-muted-foreground" />
                      <h3 className="text-lg font-semibold">{t('flow_builder.execution_history_select_run_title', 'Select an execution')}</h3>
                      <p className="text-sm text-muted-foreground">{t('flow_builder.execution_history_select_run', 'Choose a run from the left panel to inspect its status, timeline, and captured data.')}</p>
                    </div>
                  </div>
                ) : detailQuery.isLoading ? (
                  <div className="space-y-6 p-4 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
                    </div>
                    <Skeleton className="h-10 w-full max-w-[18rem]" />
                    <Skeleton className="h-[420px] rounded-2xl" />
                  </div>
                ) : detailQuery.error ? (
                  <div className="p-4 sm:p-6">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>{t('common.error', 'Error')}</AlertTitle>
                      <AlertDescription>{(detailQuery.error as Error).message}</AlertDescription>
                    </Alert>
                  </div>
                ) : detailQuery.data ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <div className="shrink-0 border-b bg-gradient-to-b from-background via-background to-muted/20 px-4 py-3 sm:px-6 sm:py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-background shadow-sm">
                              {getStatusIcon(detailQuery.data.run.status, 'h-4.5 w-4.5')}
                            </span>
                            <Badge variant={getExecutionHistoryStatusVariant(detailQuery.data.run.status)}>
                              {getExecutionHistoryStatusLabel(detailQuery.data.run.status)}
                            </Badge>
                            <Badge variant="outline" className="capitalize">{detailQuery.data.run.runtimeType}</Badge>
                            {detailQuery.data.run.sessionId && <Badge variant="secondary">session-backed</Badge>}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold tracking-tight sm:text-xl">{t('flow_builder.execution_history_run_details', 'Execution run')}</h3>
                            <p className="mt-1 break-all text-sm text-muted-foreground">
                              {formatTimestamp(detailQuery.data.run.startedAt)}
                              {' · '}
                              {t('flow_builder.execution_history_run_details_subtitle', 'Run ID {{runId}}', { runId: detailQuery.data.run.runId })}
                            </p>
                          </div>
                        </div>
                        <div className="grid w-full gap-1.5 rounded-2xl border bg-background/80 px-3 py-2.5 text-left text-xs text-muted-foreground shadow-sm sm:w-auto sm:text-right sm:text-sm">
                          <span>{t('flow_builder.execution_history_started', 'Started')}: {formatTimestamp(detailQuery.data.run.startedAt)}</span>
                          <span>{t('flow_builder.execution_history_completed', 'Completed')}: {formatTimestamp(detailQuery.data.run.completedAt)}</span>
                          <span>{t('flow_builder.execution_history_last_activity', 'Last activity')}: {formatTimestamp(detailQuery.data.run.lastActivityAt)}</span>
                        </div>
                      </div>

                      {detailQuery.data.run.errorMessage && (
                        <Alert variant="destructive" className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>{t('common.error', 'Error')}</AlertTitle>
                          <AlertDescription>{detailQuery.data.run.errorMessage}</AlertDescription>
                        </Alert>
                      )}

                      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-3.5">
                          <div className="flex items-center gap-2 text-sm font-medium"><Timer className="h-4 w-4 text-muted-foreground" />{t('flow_builder.execution_history_duration', 'Duration')}</div>
                          <p className="mt-2 text-lg font-semibold sm:text-xl">{formatExecutionDuration(detailQuery.data.run.totalDurationMs)}</p>
                        </div>
                        <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-3.5">
                          <div className="flex items-center gap-2 text-sm font-medium"><Workflow className="h-4 w-4 text-muted-foreground" />{t('flow_builder.execution_history_steps', 'Node History')}</div>
                          <p className="mt-2 text-lg font-semibold sm:text-xl">{stepStats.total}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{stepStats.completed} success · {stepStats.failed} failed · {stepStats.waiting} waiting</p>
                        </div>
                        <div className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm sm:p-3.5">
                          <div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />{t('flow_builder.execution_history_trigger', 'Trigger')}</div>
                          <p className="mt-2 break-all font-mono text-sm">{detailQuery.data.run.triggerNodeId}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{detailQuery.data.run.currentNodeId ?? '—'}</p>
                        </div>
                        <div className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm sm:p-3.5">
                          <div className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4 text-muted-foreground" />{t('flow_builder.execution_history_runtime', 'Runtime')}</div>
                          <p className="mt-2 text-lg font-semibold capitalize sm:text-xl">{detailQuery.data.run.runtimeType}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">execution/{detailQuery.data.run.executionId}</p>
                        </div>
                      </div>
                    </div>

                    <Tabs
                      value={activeTab}
                      onValueChange={(value) => {
                        setActiveTab(value);
                        requestAnimationFrame(() => {
                          tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                        });
                      }}
                      className="flex min-h-0 flex-col"
                    >
                      <div ref={tabsRef} className="shrink-0 border-b px-4 py-2 sm:px-6 sm:py-2.5">
                        <TabsList>
                          <TabsTrigger icon={TabIconHistory} data-tour="components-flow-builder-executionhistorymodal.tabstrigger.timeline" value="timeline">{t('flow_builder.execution_history_timeline', 'Timeline')}</TabsTrigger>
                          <TabsTrigger icon={TabIconDatabase} data-tour="components-flow-builder-executionhistorymodal.tabstrigger.run" value="run">{t('flow_builder.execution_history_run_tab', 'Run data')}</TabsTrigger>
                          <TabsTrigger icon={TabIconBraces} data-tour="components-flow-builder-executionhistorymodal.tabstrigger.context" value="context">{t('flow_builder.execution_history_context_tab', 'Context')}</TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent data-tour="components-flow-builder-executionhistorymodal.tabscontent.timeline" value="timeline" className="mt-0 flex flex-col px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-5">
                        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:items-start">
                          <div className="flex min-h-[280px] flex-col overflow-hidden rounded-[24px] border bg-card shadow-sm xl:min-h-[320px]">
                            <div className="shrink-0 border-b bg-muted/20 px-3 py-3 sm:px-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{t('flow_builder.execution_history_timeline', 'Timeline')}</p>
                                  <p className="text-xs text-muted-foreground">{t('flow_builder.execution_history_timeline_subtitle', 'Inspect execution in the order durable step records were written.')}</p>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px]">
                                  <span className="rounded-full bg-emerald-500/[0.08] px-2.5 py-1 text-emerald-700">{stepStats.completed} success</span>
                                  <span className="rounded-full bg-rose-500/[0.08] px-2.5 py-1 text-rose-700">{stepStats.failed} failed</span>
                                  <span className="rounded-full bg-amber-500/[0.08] px-2.5 py-1 text-amber-700">{stepStats.waiting} waiting</span>
                                </div>
                              </div>
                            </div>
                            <ScrollArea type="always" className="min-h-0 flex-1">
                            <div className="space-y-2 p-2.5 sm:p-3">
                              {detailQuery.data.steps.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                  {t('flow_builder.execution_history_no_steps', 'No node execution records were captured for this run.')}
                                </div>
                              ) : (
                                detailQuery.data.steps.map((step, index) => (
                                  <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => setSelectedStepId(step.id)}
                                    className={cn(
                                      'group relative w-full rounded-xl border p-2.5 text-left transition hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm sm:p-3',
                                      selectedStepId === step.id
                                        ? `${getStatusPanelClass(step.status)} border-primary shadow-sm`
                                        : 'bg-background'
                                    )}
                                  >
                                    {index < detailQuery.data.steps.length - 1 && (
                                      <span className="absolute left-[22px] top-[44px] h-[calc(100%-22px)] w-px bg-border" />
                                    )}
                                    <div className="flex items-start gap-2">
                                      <div className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-background text-[10px] font-semibold shadow-sm">
                                        <span>{step.stepOrder}</span>
                                        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background', getStatusDotClass(step.status))} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              {getStatusIcon(step.status, 'h-3.5 w-3.5')}
                                              <p className="truncate text-xs font-semibold">{step.nodeType}</p>
                                            </div>
                                            <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{step.nodeId}</p>
                                          </div>
                                          <Badge variant={getExecutionHistoryStatusVariant(step.status)} className="text-[10px] px-1.5 py-0">
                                            {getExecutionHistoryStatusLabel(step.status)}
                                          </Badge>
                                        </div>
                                        <div className="mt-2 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                                          <div>
                                            <p>{t('flow_builder.execution_history_started', 'Started')}</p>
                                            <p className="mt-0.5 text-foreground">{formatTimestamp(step.startedAt)}</p>
                                          </div>
                                          <div>
                                            <p>{t('flow_builder.execution_history_duration', 'Duration')}</p>
                                            <p className="mt-0.5 text-foreground">{formatExecutionDuration(step.durationMs)}</p>
                                          </div>
                                          <div>
                                            <p>{t('flow_builder.execution_history_step', 'Step')}</p>
                                            <p className="mt-0.5 text-foreground">#{step.stepOrder}</p>
                                          </div>
                                        </div>
                                        {(step.errorMessage || step.retryCount != null || step.maxRetries != null) && (
                                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                            {step.errorMessage && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-destructive">{t('common.error', 'Error')}</span>}
                                            {step.retryCount != null && <span className="rounded-full bg-muted px-1.5 py-0.5">retry {step.retryCount}</span>}
                                            {step.maxRetries != null && <span className="rounded-full bg-muted px-1.5 py-0.5">max {step.maxRetries}</span>}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                            </ScrollArea>
                          </div>

                          <div className="flex min-h-[280px] flex-col overflow-hidden rounded-[24px] border bg-card shadow-sm xl:min-h-[320px]">
                            <div className="shrink-0 border-b bg-muted/20 px-3 py-3 sm:px-4">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">{t('flow_builder.execution_history_step_details', 'Node details')}</p>
                                  <p className="text-xs text-muted-foreground">{t('flow_builder.execution_history_step_details_subtitle', 'Inspect the selected node execution just like a workflow debugger.')}</p>
                                </div>
                                {selectedStep ? getStatusIcon(selectedStep.status, 'h-4 w-4') : <Workflow className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </div>

                            {selectedStep ? (
                              <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
                                <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                  <div className="px-3 py-3 sm:px-4 sm:py-4">
                                    <div className="flex items-start gap-3">
                                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/30 shadow-sm">
                                        {getStatusIcon(selectedStep.status, 'h-5 w-5')}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="truncate text-sm font-semibold sm:text-base">{selectedStep.nodeType}</p>
                                          <Badge variant={getExecutionHistoryStatusVariant(selectedStep.status)}>
                                            {getExecutionHistoryStatusLabel(selectedStep.status)}
                                          </Badge>
                                          <Badge variant="outline">step #{selectedStep.stepOrder}</Badge>
                                        </div>
                                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{selectedStep.nodeId}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="border-t px-3 py-3 sm:px-4">
                                    <TabsList>
                                      <TabsTrigger icon={TabIconInfo} data-tour="components-flow-builder-executionhistorymodal.tabstrigger.overview" value="overview">{t('common.overview', 'Overview')}</TabsTrigger>
                                      <TabsTrigger icon={TabIconLogIn} data-tour="components-flow-builder-executionhistorymodal.tabstrigger.input" value="input">{t('common.input', 'Input')}</TabsTrigger>
                                      <TabsTrigger icon={TabIconLogOut} data-tour="components-flow-builder-executionhistorymodal.tabstrigger.output" value="output">{t('common.output', 'Output')}</TabsTrigger>
                                    </TabsList>
                                  </div>
                                </div>

                                <TabsContent data-tour="components-flow-builder-executionhistorymodal.tabscontent.overview" value="overview" className="mt-0 flex min-h-0 flex-1 flex-col">
                                  <ScrollArea type="always" className="min-h-0 flex-1">
                                    <div className="space-y-4 p-3 text-sm sm:p-4">
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-2xl border bg-muted/10 p-3">
                                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t('flow_builder.execution_history_started', 'Started')}</p>
                                          <p className="mt-2 text-sm font-medium">{formatTimestamp(selectedStep.startedAt)}</p>
                                        </div>
                                        <div className="rounded-2xl border bg-muted/10 p-3">
                                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t('flow_builder.execution_history_duration', 'Duration')}</p>
                                          <p className="mt-2 text-sm font-medium">{formatExecutionDuration(selectedStep.durationMs)}</p>
                                        </div>
                                      </div>
                                      <Separator />
                                      <div className="grid gap-3 text-sm">
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                          <span className="text-muted-foreground">{t('flow_builder.execution_history_started', 'Started')}</span>
                                          <span className="text-right">{formatTimestamp(selectedStep.startedAt)}</span>
                                        </div>
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                          <span className="text-muted-foreground">{t('flow_builder.execution_history_completed', 'Completed')}</span>
                                          <span className="text-right">{formatTimestamp(selectedStep.completedAt)}</span>
                                        </div>
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                          <span className="text-muted-foreground">{t('flow_builder.execution_history_duration', 'Duration')}</span>
                                          <span className="text-right">{formatExecutionDuration(selectedStep.durationMs)}</span>
                                        </div>
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                          <span className="text-muted-foreground">Retries</span>
                                          <span className="text-right">{selectedStep.retryCount ?? 0}/{selectedStep.maxRetries ?? 0}</span>
                                        </div>
                                      </div>
                                      {selectedStep.errorMessage && (
                                        <Alert variant="destructive">
                                          <AlertCircle className="h-4 w-4" />
                                          <AlertTitle>{t('common.error', 'Error')}</AlertTitle>
                                          <AlertDescription>{selectedStep.errorMessage}</AlertDescription>
                                        </Alert>
                                      )}
                                    </div>
                                  </ScrollArea>
                                </TabsContent>

                                <TabsContent data-tour="components-flow-builder-executionhistorymodal.tabscontent.input" value="input" className="mt-0 flex min-h-0 flex-1 flex-col">
                                  {renderJsonPanel(t('common.input', 'Input'), selectedStep.inputData)}
                                </TabsContent>

                                <TabsContent data-tour="components-flow-builder-executionhistorymodal.tabscontent.output" value="output" className="mt-0 flex min-h-0 flex-1 flex-col">
                                  {renderJsonPanel(t('common.output', 'Output'), selectedStep.outputData)}
                                </TabsContent>
                              </Tabs>
                            ) : (
                              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                                {t('flow_builder.execution_history_select_step', 'Select a node execution from the timeline to inspect its data.')}
                              </div>
                            )}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent data-tour="components-flow-builder-executionhistorymodal.tabscontent.run" value="run" className="mt-0 flex flex-col px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-5">
                        <div className="grid gap-4 xl:grid-cols-2">
                          <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
                            <div>
                              <p className="text-sm font-medium">{t('flow_builder.execution_history_identifiers', 'Identifiers')}</p>
                              <p className="text-xs text-muted-foreground">{t('flow_builder.execution_history_identifiers_subtitle', 'Useful durable references for support and debugging.')}</p>
                            </div>
                            <div className="grid gap-3 text-sm">
                              <div><span className="text-muted-foreground">Run ID:</span> <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{detailQuery.data.run.runId}</code></div>
                              <div><span className="text-muted-foreground">Execution ID:</span> <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{detailQuery.data.run.executionId}</code></div>
                              <div><span className="text-muted-foreground">Session ID:</span> <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{detailQuery.data.run.sessionId ?? '—'}</code></div>
                              <div><span className="text-muted-foreground">Conversation ID:</span> {detailQuery.data.run.conversationId}</div>
                              <div><span className="text-muted-foreground">Contact ID:</span> {detailQuery.data.run.contactId}</div>
                            </div>
                            {selectedPath && (
                              <div className="rounded-xl border bg-muted/10 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('flow_builder.execution_history_path', 'Execution path')}</p>
                                <p className="mt-2 break-words font-mono text-xs">{selectedPath}</p>
                              </div>
                            )}
                          </div>

                          {renderJsonPanel(t('flow_builder.execution_history_context_snapshot', 'Execution path + context snapshot'), {
                            executionPath: detailQuery.data.run.executionPath,
                            currentNodeId: detailQuery.data.run.currentNodeId,
                            status: detailQuery.data.run.status,
                            runtimeType: detailQuery.data.run.runtimeType
                          })}
                        </div>
                      </TabsContent>

                      <TabsContent data-tour="components-flow-builder-executionhistorymodal.tabscontent.context" value="context" className="mt-0 flex flex-col px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-5">
                        {renderJsonPanel(t('flow_builder.execution_history_context_tab', 'Context'), detailQuery.data.run.contextData)}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : null}
              </main>
            </div>
          )}
        </div>
      </DialogContent>

      <DeleteConfirmDialog
        open={isClearDialogOpen}
        onOpenChange={setIsClearDialogOpen}
        onConfirm={() => clearHistoryMutation.mutate()}
        title={t('flow_builder.execution_history_clear_title', 'Clear execution history')}
        description={t('flow_builder.execution_history_clear_description', 'This will permanently remove all saved execution history for this flow. This action cannot be undone.')}
        confirmText={t('flow_builder.execution_history_clear_confirm', 'Clear history')}
        isLoading={clearHistoryMutation.isPending}
        variant="destructive"
      />
    </Dialog>
  );
}