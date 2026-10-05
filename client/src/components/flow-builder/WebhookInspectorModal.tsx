'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Copy,
  RotateCcw,
  ContactRound as TabIconContactRound,
  FileJson as TabIconFileJson,
  Info as TabIconInfo,
  List as TabIconList,
  ListFilter as TabIconListFilter,
  Workflow as TabIconWorkflow,
} from 'lucide-react';

export interface WebhookInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key']);

export function WebhookInspectorModal({ isOpen, onClose, requestId }: WebhookInspectorModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['webhook-log-details', requestId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/webhook-triggers/logs/${encodeURIComponent(requestId)}/details`);
      return res.json();
    },
    enabled: isOpen && !!requestId
  });

  const replayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/webhook-triggers/logs/${encodeURIComponent(requestId)}/replay`);
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: t('flow_builder.webhook_replay_success', 'Webhook replayed'),
        description: result.executionId
          ? t('flow_builder.webhook_replay_execution_id', 'Execution ID: ') + result.executionId
          : undefined
      });
      queryClient.invalidateQueries({ queryKey: ['webhook-triggers-logs'] });
    },
    onError: (err: Error) => {
      toast({
        title: t('flow_builder.webhook_replay_error', 'Replay failed'),
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  const copyPayload = () => {
    if (!data?.payload) return;
    const str = typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload, null, 2);
    navigator.clipboard.writeText(str).then(() => {
      toast({ title: t('flow_builder.webhook_copied', 'Copied to clipboard'), duration: 2000 });
    });
  };

  const filteredHeaders = data?.headers && typeof data.headers === 'object'
    ? Object.entries(data.headers).filter(([k]) => !SENSITIVE_HEADERS.has(k.toLowerCase()))
    : [];

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-tour="components-flow-builder-webhookinspectormodal.dialogcontent.flow_builder.webhook_inspector_title" className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-row items-center justify-between gap-2">
          <DialogTitle className="truncate">
            {t('flow_builder.webhook_inspector_title', 'Webhook Request')} — {requestId}
          </DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button data-tour="components-flow-builder-webhookinspectormodal.button.flow_builder.webhook_replay"
              variant="outline"
              size="sm"
              onClick={() => replayMutation.mutate()}
              disabled={replayMutation.isPending}
            >
              {replayMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {t('flow_builder.webhook_replay', 'Replay Webhook')}
            </Button>
          </div>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-4">{t('flow_builder.webhook_inspector_not_found', 'Log not found.')}</p>
        ) : (
          <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
            <TabsList>
              <TabsTrigger icon={TabIconInfo} data-tour="components-flow-builder-webhookinspectormodal.tabstrigger.overview" value="overview">{t('flow_builder.webhook_inspector_overview', 'Overview')}</TabsTrigger>
              <TabsTrigger icon={TabIconFileJson} data-tour="components-flow-builder-webhookinspectormodal.tabstrigger.payload" value="payload">{t('flow_builder.webhook_inspector_payload', 'Payload')}</TabsTrigger>
              <TabsTrigger icon={TabIconList} data-tour="components-flow-builder-webhookinspectormodal.tabstrigger.headers" value="headers">{t('flow_builder.webhook_inspector_headers', 'Headers')}</TabsTrigger>
              <TabsTrigger icon={TabIconListFilter} data-tour="components-flow-builder-webhookinspectormodal.tabstrigger.filter" value="filter">{t('flow_builder.webhook_inspector_filter', 'Filter Evaluation')}</TabsTrigger>
              <TabsTrigger icon={TabIconContactRound} data-tour="components-flow-builder-webhookinspectormodal.tabstrigger.contact" value="contact">{t('flow_builder.webhook_inspector_contact', 'Contact Resolution')}</TabsTrigger>
              <TabsTrigger icon={TabIconWorkflow} data-tour="components-flow-builder-webhookinspectormodal.tabstrigger.execution" value="execution">{t('flow_builder.webhook_inspector_execution', 'Execution Path')}</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto mt-3 min-h-0">
              <TabsContent data-tour="components-flow-builder-webhookinspectormodal.tabscontent.overview" value="overview" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('flow_builder.webhook_inspector_overview', 'Overview')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Request ID:</span> <code className="text-xs">{data.requestId}</code></p>
                    <p><span className="text-muted-foreground">{t('flow_builder.webhook_inspector_timestamp', 'Timestamp')}:</span> {new Date(data.timestamp).toLocaleString()}</p>
                    <p><span className="text-muted-foreground">{t('flow_builder.webhook_inspector_status', 'Status')}:</span> <Badge variant={statusVariant(data.status)}>{data.status}</Badge></p>
                    {data.status === 'failed' && data.errorMessage && (
                      <p><span className="text-muted-foreground">{t('flow_builder.webhook_inspector_error_reason', 'Error')}:</span> <span className="text-destructive text-xs">{data.errorMessage}</span></p>
                    )}
                    {data.ipAddress != null && <p><span className="text-muted-foreground">IP:</span> {data.ipAddress}</p>}
                    {data.userAgent != null && <p><span className="text-muted-foreground">User-Agent:</span> <span className="text-xs break-all">{data.userAgent}</span></p>}
                    {data.responseTime != null && <p><span className="text-muted-foreground">{t('flow_builder.webhook_inspector_response_time', 'Response time')}:</span> {data.responseTime} ms</p>}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhookinspectormodal.tabscontent.payload" value="payload" className="mt-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">{t('flow_builder.webhook_inspector_payload', 'Payload')}</CardTitle>
                    <Button data-tour="components-flow-builder-webhookinspectormodal.button.common.copy" variant="outline" size="sm" onClick={copyPayload}>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      {t('common.copy', 'Copy')}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-3 rounded bg-muted/50 text-xs overflow-auto max-h-[400px] whitespace-pre-wrap break-words">
                      {typeof data.payload === 'string'
                        ? data.payload
                        : JSON.stringify(data.payload, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhookinspectormodal.tabscontent.headers" value="headers" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('flow_builder.webhook_inspector_headers', 'Headers')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 font-medium">Key</th>
                          <th className="text-left py-1 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHeaders.length === 0 ? (
                          <tr><td colSpan={2} className="text-muted-foreground py-2">{t('common.none', 'None')}</td></tr>
                        ) : (
                          filteredHeaders.map(([k, v]) => (
                            <tr key={k} className="border-b">
                              <td className="py-1 font-mono text-xs">{k}</td>
                              <td className="py-1 text-xs break-all">{String(v)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhookinspectormodal.tabscontent.filter" value="filter" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('flow_builder.webhook_inspector_filter', 'Filter Evaluation')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.filterEvaluation ? (
                      <div className="space-y-2 text-sm">
                        <p><Badge variant={data.filterEvaluation.passed ? 'success' : 'destructive'}>
                          {data.filterEvaluation.passed ? t('common.passed', 'Passed') : t('common.failed', 'Failed')}
                        </Badge></p>
                        {Array.isArray(data.filterEvaluation.evaluatedConditions) &&
                          data.filterEvaluation.evaluatedConditions.map((c: { condition: { fieldPath: string; operator: string }; result: boolean; actualValue?: unknown }, i: number) => (
                            <div key={i} className="p-2 rounded border bg-muted/20 text-xs">
                              <span className="font-mono">{c.condition.fieldPath}</span> {c.condition.operator} → {c.result ? t('common.passed', 'Passed') : t('common.failed', 'Failed')}
                              {c.actualValue !== undefined && <span className="text-muted-foreground ml-1">(value: {String(c.actualValue)})</span>}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">{t('flow_builder.webhook_inspector_no_filter', 'No filter evaluation data.')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhookinspectormodal.tabscontent.contact" value="contact" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('flow_builder.webhook_inspector_contact', 'Contact Resolution')}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {data.contactResolution ? (
                      <>
                        <p><span className="text-muted-foreground">Strategy:</span> {data.contactResolution.strategy ?? '—'}</p>
                        <p><span className="text-muted-foreground">Contact ID:</span> {data.contactResolution.contactId ?? '—'}</p>
                        <p><span className="text-muted-foreground">Contact name:</span> {data.contactResolution.contactName ?? '—'}</p>
                        <p><span className="text-muted-foreground">Conversation ID:</span> {data.contactResolution.conversationId ?? '—'}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">{t('flow_builder.webhook_inspector_no_contact', 'No contact resolution data.')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-webhookinspectormodal.tabscontent.execution" value="execution" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('flow_builder.webhook_inspector_execution', 'Execution Path')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.executionPath ? (
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(data.executionPath.status)}>{data.executionPath.status}</Badge></p>
                        {data.executionPath.errorMessage && (
                          <p className="text-destructive text-xs">{data.executionPath.errorMessage}</p>
                        )}
                        {Array.isArray(data.executionPath.executionPath) && data.executionPath.executionPath.length > 0 && (
                          <p><span className="text-muted-foreground">Path:</span> <code className="text-xs">{data.executionPath.executionPath.join(' → ')}</code></p>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">{t('flow_builder.webhook_inspector_no_execution', 'No execution path data.')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
