'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import {
  Loader2,
  RefreshCw,
  Search,
  Eye,
  Trash2,
  History as TabIconHistory,
  ListFilter as TabIconListFilter,
  Search as TabIconSearch,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { WebhookInspectorModal } from './WebhookInspectorModal';

const LOG_STATUSES = ['received', 'filtered', 'triggered', 'failed'] as const;
const PAGE_SIZE = 20;

interface WebhookLogEntry {
  id: number;
  requestId: string;
  flowId: number | null;
  executionId: string | null;
  payload: unknown;
  payloadPreview?: string;
  status: string;
  createdAt: string;
}

interface WebhookLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowId: string | number | null;
  onViewDetails?: (requestId: string) => void;
}

export function WebhookLogsModal({
  isOpen,
  onClose,
  flowId,
  onViewDetails
}: WebhookLogsModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [inspectorRequestId, setInspectorRequestId] = useState<string | null>(null);

  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/webhook-triggers/logs?flowId=${flowIdNum}`);
      return res.json();
    },
    onSuccess: (data: { deleted?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['webhook-triggers-logs'] });
      queryClient.invalidateQueries({ queryKey: ['webhook-triggers-logs-count'] });
      toast({
        title: t('flow_builder.webhook_logs_cleared', 'Logs cleared'),
        description: t('flow_builder.webhook_logs_cleared_count', '{{count}} log(s) removed', { count: data?.deleted ?? 0 })
      });
    },
    onError: (err: Error) => {
      toast({
        title: t('flow_builder.webhook_logs_clear_failed', 'Clear failed'),
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  const handleClearLogs = () => {
    if (!flowIdNum) return;
    if (!window.confirm(t('flow_builder.webhook_logs_clear_confirm', 'Clear all webhook logs for this flow? This cannot be undone.'))) return;
    clearLogsMutation.mutate();
  };

  const flowIdNum = flowId != null ? Number(flowId) : null;
  const logsUrl =
    flowIdNum != null
      ? `/api/webhook-triggers/logs?flowId=${flowIdNum}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${statusFilter ? `&status=${statusFilter}` : ''}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`
      : '';

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['webhook-triggers-logs', flowIdNum, page, statusFilter, search.trim(), autoRefresh],
    queryFn: async () => {
      const res = await apiRequest('GET', logsUrl);
      return res.json();
    },
    enabled: isOpen && flowIdNum != null && !!logsUrl,
    refetchInterval: autoRefresh ? 5000 : false
  });

  const logs: WebhookLogEntry[] = data?.logs ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleViewDetails = (reqId: string) => {
    if (onViewDetails) {
      onViewDetails(reqId);
    } else {
      setInspectorRequestId(reqId);
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'triggered':
        return 'success';
      case 'failed':
      case 'filtered':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent data-tour="components-flow-builder-webhooklogsmodal.dialogcontent.flow_builder.webhook_logs_title" className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('flow_builder.webhook_logs_title', 'Webhook Logs')}</DialogTitle>
          </DialogHeader>
          {!flowIdNum ? (
            <p className="text-sm text-muted-foreground py-4">
              {t('flow_builder.webhook_logs_save_flow', 'Save the flow to view webhook logs.')}
            </p>
          ) : (
            <Tabs defaultValue="recent" className="flex-1 flex flex-col min-h-0">
              <TabsList>
                <TabsTrigger icon={TabIconHistory} data-tour="components-flow-builder-webhooklogsmodal.tabstrigger.recent" value="recent">{t('flow_builder.webhook_logs_recent', 'Recent Logs')}</TabsTrigger>
                <TabsTrigger icon={TabIconListFilter} data-tour="components-flow-builder-webhooklogsmodal.tabstrigger.filter" value="filter">{t('flow_builder.webhook_logs_filter', 'Filter by Status')}</TabsTrigger>
                <TabsTrigger icon={TabIconSearch} data-tour="components-flow-builder-webhooklogsmodal.tabstrigger.search" value="search">{t('flow_builder.webhook_logs_search', 'Search')}</TabsTrigger>
              </TabsList>
              <TabsContent data-tour="components-flow-builder-webhooklogsmodal.tabscontent.recent" value="recent" className="flex-1 flex flex-col min-h-0 mt-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger data-tour="components-flow-builder-webhooklogsmodal.selecttrigger.flow_builder.webhook_logs_status" className="w-[140px]">
                      <SelectValue placeholder={t('flow_builder.webhook_logs_status', 'Status')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                      {LOG_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input data-tour="components-flow-builder-webhooklogsmodal.input.flow_builder.webhook_logs_search_placeholder"
                      placeholder={t('flow_builder.webhook_logs_search_placeholder', 'Search request ID or payload')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                    <input data-tour="components-flow-builder-webhooklogsmodal.input.flow_builder.webhook_logs_auto_refresh"
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded"
                    />
                    {t('flow_builder.webhook_logs_auto_refresh', 'Auto-refresh (5s)')}
                  </label>
                  <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button data-tour="components-flow-builder-webhooklogsmodal.button.flow_builder.webhook_logs_clear"
                    variant="outline"
                    size="sm"
                    onClick={handleClearLogs}
                    disabled={clearLogsMutation.isPending || total === 0}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {clearLogsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {t('flow_builder.webhook_logs_clear', 'Clear Logs')}
                  </Button>
                </div>
                <div className="border rounded-md overflow-auto flex-1 min-h-[200px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      {t('flow_builder.webhook_logs_empty', 'No webhook logs found.')}
                    </div>
                  ) : (
                    <Table data-tour="components-flow-builder-webhooklogsmodal.table.flow_builder.webhook_logs_time">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[140px]">{t('flow_builder.webhook_logs_time', 'Time')}</TableHead>
                          <TableHead className="w-[100px]">{t('flow_builder.webhook_logs_status', 'Status')}</TableHead>
                          <TableHead>{t('flow_builder.webhook_logs_payload', 'Payload')}</TableHead>
                          <TableHead className="w-[120px]">{t('flow_builder.webhook_logs_execution', 'Execution')}</TableHead>
                          <TableHead className="w-[80px]">{t('common.actions', 'Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs max-w-[200px] truncate" title={log.payloadPreview ?? JSON.stringify(log.payload)}>
                              {log.payloadPreview ?? (typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload ?? {}).slice(0, 80))}…
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {log.executionId ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Button data-tour="components-flow-builder-webhooklogsmodal.button.flow_builder.webhook_logs_view_details"
                                variant="ghost"
                                size="sm"
                                className="h-7"
                                onClick={() => handleViewDetails(log.requestId)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                {t('flow_builder.webhook_logs_view_details', 'View')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-muted-foreground">
                      {t('flow_builder.webhook_logs_page', 'Page')} {page + 1} {t('common.of', 'of')} {totalPages} ({total} {t('flow_builder.webhook_logs_total', 'total')})
                    </span>
                    <div className="flex gap-1">
                      <Button data-tour="components-flow-builder-webhooklogsmodal.button.common.previous"
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        {t('common.previous', 'Previous')}
                      </Button>
                      <Button data-tour="components-flow-builder-webhooklogsmodal.button.common.next"
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        {t('common.next', 'Next')}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhooklogsmodal.tabscontent.filter" value="filter" className="mt-3">
                <div className="space-y-2">
                  <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger data-tour="components-flow-builder-webhooklogsmodal.selecttrigger.flow_builder.webhook_logs_filter_status" className="w-[180px]">
                      <SelectValue placeholder={t('flow_builder.webhook_logs_filter_status', 'Filter by status')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                      {LOG_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.webhook_logs_filter_help', 'Use the Recent Logs tab to see filtered results.')}
                  </p>
                </div>
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhooklogsmodal.tabscontent.search" value="search" className="mt-3">
                <div className="space-y-2">
                  <Input data-tour="components-flow-builder-webhooklogsmodal.input.flow_builder.webhook_logs_search_placeholder"
                    placeholder={t('flow_builder.webhook_logs_search_placeholder', 'Search request ID or payload')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.webhook_logs_search_help', 'Search in request ID and payload content. Use Recent Logs to see results.')}
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      {inspectorRequestId && (
        <WebhookInspectorModal
          isOpen={!!inspectorRequestId}
          onClose={() => setInspectorRequestId(null)}
          requestId={inspectorRequestId}
        />
      )}
    </>
  );
}
