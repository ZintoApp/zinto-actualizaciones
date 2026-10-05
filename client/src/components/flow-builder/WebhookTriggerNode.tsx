import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Trash2, Copy, RefreshCw, Eye, EyeOff, Plus, X, CheckCircle, Loader2, ChevronDown, ChevronUp, ChevronRight, List, Info, HelpCircle, AlertCircle, Globe, User, Filter, Settings, Play } from 'lucide-react';
import { useFlowContext } from '@/pages/flow-builder';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NumberInput } from '@/components/ui/number-input';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import {
  ContactMappingStrategy,
  FilterOperator,
  FilterCondition,
  ResponseMode,
  type ContactMappingConfig,
  type ResponseConfig
} from '@shared/types/webhook-trigger';
import { WEBHOOK_RESPONSE_TEMPLATES, WEBHOOK_SAMPLE_PAYLOADS } from '@shared/constants/webhook-response-templates';
import { evaluateFilters } from '@/utils/webhook-filter-evaluator';
import { WebhookLogsModal } from './WebhookLogsModal';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const WEBHOOK_ICON_URL = APP_ICONS.webhookTrigger;
const CUSTOM_PATH_REGEX = /^[a-zA-Z0-9_-]+$/;

interface WebhookTriggerNodeProps {
  id: string;
  data: {
    webhookToken?: string;
    customPath?: string;
    useCustomPath?: boolean;
    contactMapping?: ContactMappingConfig;
    filterConditions?: FilterCondition[];
    responseConfig?: Partial<ResponseConfig>;
    onDeleteNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

function generateToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const FILTER_OPERATOR_OPTIONS: { value: FilterOperator; label: string }[] = [
  { value: FilterOperator.EQUALS, label: 'Equals' },
  { value: FilterOperator.NOT_EQUALS, label: 'Not equals' },
  { value: FilterOperator.CONTAINS, label: 'Contains' },
  { value: FilterOperator.NOT_CONTAINS, label: 'Does not contain' },
  { value: FilterOperator.STARTS_WITH, label: 'Starts with' },
  { value: FilterOperator.ENDS_WITH, label: 'Ends with' },
  { value: FilterOperator.GREATER_THAN, label: 'Greater than' },
  { value: FilterOperator.LESS_THAN, label: 'Less than' },
  { value: FilterOperator.EXISTS, label: 'Exists' },
  { value: FilterOperator.NOT_EXISTS, label: 'Does not exist' },
  { value: FilterOperator.IN, label: 'In' },
  { value: FilterOperator.NOT_IN, label: 'Not in' }
];

const STRING_OPERATORS = [
  FilterOperator.EQUALS,
  FilterOperator.NOT_EQUALS,
  FilterOperator.CONTAINS,
  FilterOperator.NOT_CONTAINS,
  FilterOperator.STARTS_WITH,
  FilterOperator.ENDS_WITH
];

const VALUE_LESS_OPERATORS = [FilterOperator.EXISTS, FilterOperator.NOT_EXISTS];

const STATUS_CODE_OPTIONS = [
  { value: 200, label: '200 OK' },
  { value: 201, label: '201 Created' },
  { value: 202, label: '202 Accepted' },
  { value: 204, label: '204 No Content' },
  { value: 400, label: '400 Bad Request' },
  { value: 404, label: '404 Not Found' },
  { value: 500, label: '500 Internal Server Error' }
];

const RESPONSE_VARIABLE_HINT = '{{webhook.requestId}}, {{webhook.payload.*}}, {{flow.id}}, {{flow.name}}, {{contact.name}}, {{contact.email}}, {{contact.phone}}, {{execution.status}}, {{execution.duration}}, {{current.timestamp}}';

export function WebhookTriggerNode({ id, data, isConnectable }: WebhookTriggerNodeProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setNodes, getNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId: rawFlowId } = useFlowContext();
  // Ensure flowId is always a valid number or undefined, never NaN
  const flowId = useMemo(() => {
    if (rawFlowId == null) return undefined;
    const num = typeof rawFlowId === 'number' ? rawFlowId : Number(rawFlowId);
    return isNaN(num) || num <= 0 ? undefined : num;
  }, [rawFlowId]);

  const [isExpanded, setIsExpanded] = useState(false);
  useCollapseOnAutoArrange(setIsExpanded);
  const [webhookToken, setWebhookToken] = useState(data.webhookToken || generateToken());
  const [customPath, setCustomPath] = useState(data.customPath || '');
  const [useCustomPath, setUseCustomPath] = useState(data.useCustomPath || false);
  const [contactMappingStrategy, setContactMappingStrategy] = useState<ContactMappingStrategy>(
    data.contactMapping?.strategy ?? ContactMappingStrategy.SYSTEM
  );
  const [extractField, setExtractField] = useState(data.contactMapping?.extractField || '');
  const [createNameField, setCreateNameField] = useState(
    data.contactMapping?.createFields?.nameField || ''
  );
  const [createEmailField, setCreateEmailField] = useState(
    data.contactMapping?.createFields?.emailField || ''
  );
  const [createPhoneField, setCreatePhoneField] = useState(
    data.contactMapping?.createFields?.phoneField || ''
  );
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>(
    data.filterConditions ?? []
  );
  const [responseStatusCode, setResponseStatusCode] = useState(
    data.responseConfig?.statusCode ?? 200
  );
  const [responseBodyTemplate, setResponseBodyTemplate] = useState(
    data.responseConfig?.bodyTemplate ?? '{"success": true, "flowId": "{{flow.id}}"}'
  );
  const [responseMode, setResponseMode] = useState<ResponseMode>(
    data.responseConfig?.mode ?? ResponseMode.ASYNC
  );
  const [responseTimeout, setResponseTimeout] = useState(() => {
    const timeout = data.responseConfig?.timeout;
    if (typeof timeout === 'number' && !isNaN(timeout) && timeout > 0) {
      const seconds = timeout / 1000;
      return isNaN(seconds) || seconds <= 0 ? 30 : seconds;
    }
    return 30;
  });
  const [responseHeaders, setResponseHeaders] = useState<Array<{ key: string; value: string }>>(() => {
    const h = data.responseConfig?.headers;
    if (h && typeof h === 'object') {
      return Object.entries(h).map(([k, v]) => ({ key: k, value: String(v) }));
    }
    return [{ key: 'Content-Type', value: 'application/json' }];
  });
  const [responseConfigExpanded, setResponseConfigExpanded] = useState(false);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customPathError, setCustomPathError] = useState('');
  const [samplePayload, setSamplePayload] = useState('{"event_type": "order.created"}');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    filterResults?: { passed: boolean; evaluatedConditions: Array<{ condition: FilterCondition; result: boolean; actualValue?: unknown; reason?: string }> };
    contactResolution?: string;
    contactPreview?: { strategy: string; extracted?: string };
    response?: unknown;
    httpResponse?: { statusCode: number; body: string; headers: Record<string, string>; durationMs: number };
    error?: string;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('');
  const [testSectionExpanded, setTestSectionExpanded] = useState(true);
  const [howToTestExpanded, setHowToTestExpanded] = useState(false);
  const [testResponseExpanded, setTestResponseExpanded] = useState(true);

  const { data: logsCountData, refetch: refetchLogsCount } = useQuery({
    queryKey: ['webhook-triggers-logs-count', flowId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/webhook-triggers/logs/count?flowId=${flowId}`);
      return res.json();
    },
    enabled: !!flowId && (logsModalOpen || true)
  });
  const logsCount = useMemo(() => {
    const count = logsCountData?.count;
    if (typeof count === 'number' && !isNaN(count) && count >= 0) {
      return count;
    }
    return 0;
  }, [logsCountData?.count]);

  const updateNodeData = useCallback(
    (updates: Record<string, unknown>) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, ...updates } };
          }
          return node;
        })
      );
    },
    [id, setNodes]
  );

  const activeUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (useCustomPath && customPath.trim() && !customPathError) {
      return `${origin}/api/webhook/trigger/${encodeURIComponent(customPath.trim())}`;
    }
    if (flowId && webhookToken && typeof flowId === 'number' && !isNaN(flowId)) {
      return `${origin}/api/webhook/trigger/${flowId}/${webhookToken}`;
    }
    return '';
  }, [useCustomPath, customPath, customPathError, flowId, webhookToken]);

  const autoGeneratedUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (flowId && webhookToken && typeof flowId === 'number' && !isNaN(flowId)) {
      return `${origin}/api/webhook/trigger/${flowId}/${webhookToken}`;
    }
    return '';
  }, [flowId, webhookToken]);

  useEffect(() => {
    if (!data.webhookToken && webhookToken) {
      updateNodeData({ webhookToken });
    }
  }, []);

  useEffect(() => {
    const pathToPersist =
      useCustomPath && customPath.trim() && !customPathError ? customPath.trim() : undefined;
    updateNodeData({
      webhookToken,
      customPath: pathToPersist,
      useCustomPath,
      contactMapping: {
        strategy: contactMappingStrategy,
        extractField: contactMappingStrategy === ContactMappingStrategy.EXTRACT ? extractField : undefined,
        createFields:
          contactMappingStrategy === ContactMappingStrategy.CREATE
            ? {
                nameField: createNameField || undefined,
                emailField: createEmailField || undefined,
                phoneField: createPhoneField || undefined
              }
            : undefined
      },
      filterConditions,
      responseConfig: {
        statusCode: responseStatusCode,
        bodyTemplate: responseBodyTemplate,
        headers: responseHeaders.length ? responseHeaders.reduce<Record<string, string>>((acc, { key, value }) => {
          if (key.trim()) acc[key.trim()] = value;
          return acc;
        }, {}) : undefined,
        mode: responseMode,
        timeout: responseMode === ResponseMode.SYNC ? responseTimeout * 1000 : undefined
      }
    });
  }, [
    webhookToken,
    customPath,
    customPathError,
    useCustomPath,
    contactMappingStrategy,
    extractField,
    createNameField,
    createEmailField,
    createPhoneField,
    filterConditions,
    responseStatusCode,
    responseBodyTemplate,
    responseMode,
    responseTimeout,
    responseHeaders,
    updateNodeData
  ]);

  const validateCustomPath = useCallback((path: string) => {
    if (!path.trim()) {
      setCustomPathError('');
      return true;
    }
    if (!CUSTOM_PATH_REGEX.test(path)) {
      setCustomPathError(t('flow_builder.webhook_path_invalid', 'Use only letters, numbers, hyphens and underscores'));
      return false;
    }
    const nodes = getNodes();
    const otherWithSame = nodes.filter(
      (n) =>
        n.id !== id &&
        n.type === 'webhookTrigger' &&
        (n.data as { customPath?: string })?.customPath === path.trim()
    );
    if (otherWithSame.length > 0) {
      setCustomPathError(t('flow_builder.webhook_path_duplicate', 'This path is already used by another webhook trigger'));
      return false;
    }
    setCustomPathError('');
    return true;
  }, [getNodes, id, t]);

  useEffect(() => {
    const timer = setTimeout(() => validateCustomPath(customPath), 500);
    return () => clearTimeout(timer);
  }, [customPath, validateCustomPath]);

  const handleCopyUrl = useCallback(() => {
    if (!activeUrl) return;
    navigator.clipboard.writeText(activeUrl).then(() => {
      setCopied(true);
      toast({
        title: t('flow_builder.webhook_url_copied', 'Webhook URL copied to clipboard'),
        duration: 2000
      });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [activeUrl, toast, t]);

  const handleRegenerateToken = useCallback(() => {
    const confirmed = window.confirm(
      t(
        'flow_builder.webhook_regenerate_confirm',
        'Regenerating the token will invalidate the current webhook URL. External systems will need to be updated. Continue?'
      )
    );
    if (confirmed) {
      const newToken = generateToken();
      setWebhookToken(newToken);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const newUrl = (flowId && typeof flowId === 'number' && !isNaN(flowId)) ? `${origin}/api/webhook/trigger/${flowId}/${newToken}` : '';
      toast({
        title: t('flow_builder.webhook_token_regenerated', 'Token regenerated'),
        description: newUrl ? t('flow_builder.webhook_new_url_ready', 'New URL is ready. Update your external systems.') : t('flow_builder.webhook_save_flow_first', 'Save the flow to get the new URL.')
      });
    }
  }, [flowId, t, toast]);

  const addFilter = useCallback(() => {
    setFilterConditions((prev) => [
      ...prev,
      { fieldPath: '', operator: FilterOperator.EQUALS, value: '' }
    ]);
    setFiltersExpanded(true);
  }, []);

  const updateFilter = useCallback((index: number, updates: Partial<FilterCondition>) => {
    setFilterConditions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilterConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const runTest = useCallback(async () => {
    let payload: unknown;
    try {
      payload = JSON.parse(samplePayload || '{}');
    } catch {
      setTestResult({ error: t('flow_builder.webhook_invalid_json', 'Invalid JSON in sample payload') });
      setShowTestResult(true);
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);
    try {
      const filterResults = evaluateFilters(payload as object, filterConditions);
      let contactResolution = 'none';
      let contactPreview: { strategy: string; extracted?: string } = { strategy: contactMappingStrategy };
      if (contactMappingStrategy === ContactMappingStrategy.EXTRACT && extractField) {
        const getNested = (obj: unknown, path: string): unknown => {
          const parts = path.split('.');
          let current: unknown = obj;
          for (const p of parts) {
            if (current == null) return undefined;
            current = (current as Record<string, unknown>)[p];
          }
          return current;
        };
        const extracted = getNested(payload, extractField);
        contactResolution = extracted != null ? 'found' : 'not_found';
        contactPreview.extracted = extracted != null ? String(extracted) : undefined;
      } else if (contactMappingStrategy === ContactMappingStrategy.CREATE) {
        contactResolution = 'create';
      }
      let httpResponse: { statusCode: number; body: string; headers: Record<string, string>; durationMs: number } | undefined;
      if (activeUrl) {
        const start = Date.now();
        try {
          const res = await fetch(activeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: typeof samplePayload === 'string' ? samplePayload : JSON.stringify(payload)
          });
          const body = await res.text();
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => { headers[k] = v; });
          httpResponse = { statusCode: res.status, body, headers, durationMs: Date.now() - start };
        } catch (fetchErr) {
          const startMs = Date.now() - start;
          httpResponse = {
            statusCode: 0,
            body: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
            headers: {},
            durationMs: startMs
          };
        }
      }
      const responseBody = responseBodyTemplate
        .replace(/\{\{flow\.id\}\}/g, String(flowId ?? ''))
        .replace(/\{\{flow\.name\}\}/g, '')
        .replace(/\{\{webhook\.requestId\}\}/g, 'test-request-id')
        .replace(/\{\{contact\.id\}\}/g, '')
        .replace(/\{\{contact\.name\}\}/g, '')
        .replace(/\{\{contact\.email\}\}/g, '')
        .replace(/\{\{contact\.phone\}\}/g, '');
      setTestResult({
        filterResults: { passed: filterResults.passed, evaluatedConditions: filterResults.evaluatedConditions },
        contactResolution,
        contactPreview,
        response: { statusCode: responseStatusCode, body: responseBody },
        httpResponse,
        error: httpResponse && httpResponse.statusCode >= 400 ? t('flow_builder.webhook_test_http_error', 'HTTP error') : undefined
      });
      if (httpResponse && httpResponse.statusCode >= 200 && httpResponse.statusCode < 300) {
        refetchLogsCount();
      }
    } catch (err: unknown) {
      setTestResult({
        error: err instanceof Error ? err.message : t('flow_builder.webhook_test_error', 'Test failed')
      });
    } finally {
      setIsTesting(false);
    }
  }, [
    samplePayload,
    filterConditions,
    contactMappingStrategy,
    extractField,
    responseBodyTemplate,
    responseStatusCode,
    flowId,
    activeUrl,
    t,
    refetchLogsCount
  ]);

  const strategyLabel =
    contactMappingStrategy === ContactMappingStrategy.EXTRACT
      ? t('flow_builder.webhook_extract_from_payload', 'Extract from Payload')
      : contactMappingStrategy === ContactMappingStrategy.CREATE
        ? t('flow_builder.webhook_create_new_contact', 'Create New Contact')
        : t('flow_builder.webhook_system_level', 'System-Level (No Contact)');

  const configurationProgress = useMemo(() => {
    let p = 0;
    if (activeUrl) p += 25;
    const hasContactMapping =
      contactMappingStrategy === ContactMappingStrategy.SYSTEM ||
      (contactMappingStrategy === ContactMappingStrategy.EXTRACT && extractField.trim()) ||
      (contactMappingStrategy === ContactMappingStrategy.CREATE && (createEmailField.trim() || createNameField.trim() || createPhoneField.trim()));
    if (hasContactMapping) p += 25;
    const hasResponseConfig = responseBodyTemplate.trim().length > 0;
    if (hasResponseConfig) p += 25;
    if (logsCount > 0 || (testResult && testResult.httpResponse)) p += 25;
    // Ensure we never return NaN
    const result = isNaN(p) ? 0 : Math.max(0, Math.min(100, p));
    return result;
  }, [activeUrl, contactMappingStrategy, extractField, createEmailField, createNameField, createPhoneField, responseBodyTemplate, logsCount, testResult]);

  return (
    <div
      className={cn(
        'node-webhook-trigger rounded-lg bg-card border border-border shadow-sm group transition-[max-width,min-width,padding] duration-200',
        isExpanded
          ? 'p-3 min-w-[440px] max-w-[560px]'
          : 'p-2 min-w-[220px] max-w-[280px]'
      )}
    >
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <TooltipProvider>
            <Tooltip>
              <Dialog>
                <DialogTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                      aria-label="Help"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <img src={WEBHOOK_ICON_URL} alt="" className="h-5 w-5" aria-hidden />
                      Webhook Trigger - Help & Documentation
                    </DialogTitle>
                    <DialogDescription>
                      Configure webhooks to receive events from external systems (Shopify, Stripe, CRM, etc.)
                    </DialogDescription>
                  </DialogHeader>
                  <WebhookHelpContent />
                </DialogContent>
              </Dialog>
              <TooltipContent>
                <p className="text-xs">{t('flow_builder.webhook_docs_tooltip', 'View webhook trigger documentation')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onDuplicateNode && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDuplicateNode(id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Duplicate node</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onDeleteNode && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.trigger_delete_node"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onDeleteNode(id)}
                    aria-label={t('flow_builder.trigger_delete_node', 'Delete node')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.trigger_delete_node', 'Delete node')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

      <div className={cn('font-medium flex items-center gap-2 flex-wrap', isExpanded ? 'mb-2' : 'mb-1.5')}>
        <img src={WEBHOOK_ICON_URL} alt="" className="h-4 w-4" aria-hidden />
        <span>{t('flow_builder.webhook_trigger_title', 'Webhook Trigger')}</span>
        {configurationProgress > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20">
                  {configurationProgress}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.webhook_config_progress', 'Configuration progress')}</p>
                <p className="text-xs text-muted-foreground">
                  {configurationProgress === 100
                    ? t('flow_builder.webhook_config_complete', 'Fully configured and ready')
                    : t('flow_builder.webhook_config_incomplete', 'Complete URL, contact mapping, response config, and test for full readiness')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="ml-auto flex items-center gap-1">
          {flowId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_view_logs"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setLogsModalOpen(true)}
                  >
                    <List className="h-3.5 w-3.5" />
                    {t('flow_builder.webhook_view_logs', 'Logs')}
                    {logsCount > 0 && (
                      <span className="bg-primary/20 text-primary rounded-full px-1.5 min-w-[18px] text-[10px]">
                        {logsCount > 99 ? '99+' : logsCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{t('flow_builder.webhook_view_logs_tooltip', 'View webhook logs')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <button data-tour="components-flow-builder-webhooktriggernode.button.common.hide"
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <EyeOff className="h-3.5 w-3.5 inline" /> : <Eye className="h-3.5 w-3.5 inline" />}
            {isExpanded ? t('common.hide', 'Hide') : t('common.edit', 'Edit')}
          </button>
        </div>
      </div>
      {flowId && (
        <WebhookLogsModal
          isOpen={logsModalOpen}
          onClose={() => { setLogsModalOpen(false); refetchLogsCount(); }}
          flowId={flowId}
        />
      )}

      {!isExpanded && (
        <div className="text-sm rounded border border-border space-y-1 p-1.5">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {activeUrl ? (
                      <CheckCircle className="h-3 w-3 text-primary" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {activeUrl ? t('flow_builder.webhook_ready', 'Ready') : t('flow_builder.webhook_setup_required', 'Setup required')}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {activeUrl
                      ? t('flow_builder.webhook_ready_tooltip', 'Webhook URL is configured and ready to receive requests')
                      : t('flow_builder.webhook_setup_required_tooltip', 'Configure webhook URL and save the flow')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-muted-foreground">•</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <img src={WEBHOOK_ICON_URL} alt="" className="h-3 w-3" aria-hidden />
                    <span className="text-xs text-muted-foreground">
                      {activeUrl ? t('flow_builder.webhook_active', 'Active') : t('flow_builder.webhook_inactive', 'Inactive')}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.webhook_url_label', 'Webhook URL')}</p>
                  <p className="text-xs font-mono truncate max-w-[200px]">{activeUrl || '—'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="font-mono text-xs truncate text-muted-foreground" title={activeUrl || undefined}>
            {flowId
              ? activeUrl || t('flow_builder.webhook_save_flow_first', 'Save flow to get URL')
              : t('flow_builder.webhook_save_flow_first', 'Save flow to get URL')}
          </div>
          <div className="flex flex-wrap gap-1 text-[10px]">
            <Badge variant="outline" className="text-[9px] px-1 py-0">
               {strategyLabel}
            </Badge>
            {filterConditions.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                ⚡ {filterConditions.length} {t('flow_builder.webhook_payload_filters', 'Payload Filters')}
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {responseMode === ResponseMode.ASYNC ? t('flow_builder.webhook_async_mode', 'Asynchronous') : t('flow_builder.webhook_sync_mode', 'Synchronous')}
            </Badge>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="mt-3 text-xs space-y-3 p-2 border rounded">
          {/* Webhook URL Section */}
          <div className={cn('space-y-2', activeUrl && 'rounded p-1.5 bg-muted/20')}>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label className="text-primary font-medium cursor-help">
                      {t('flow_builder.webhook_url_label', 'Webhook URL')}
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <p className="text-xs">{t('flow_builder.webhook_url_tooltip', 'This is the endpoint where external systems send webhook events. Copy this URL and configure it in your external platform (Shopify, Stripe, etc.).')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {activeUrl && <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />}
            </div>
            {flowId ? (
              <>
                <div className="flex items-center gap-1 mb-1">
                  <code className="flex-1 text-[10px] bg-muted px-1.5 py-0.5 rounded truncate">
                    {autoGeneratedUrl}
                  </code>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_copy_url"
                          variant="ghost"
                          size="sm"
                          className={cn('h-6 shrink-0 gap-1 transition-all', copied && 'text-green-600')}
                          onClick={handleCopyUrl}
                          disabled={!autoGeneratedUrl}
                          aria-label={t('flow_builder.webhook_copy_url', 'Copy URL')}
                        >
                          {copied ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span className="text-[10px]">{t('flow_builder.webhook_copied', 'Copied!')}</span>
                            </>
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{copied ? t('flow_builder.webhook_url_copied', 'Webhook URL copied to clipboard') : t('flow_builder.webhook_click_to_copy', 'Click to copy')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Switch
                    id="use-custom-path"
                    checked={useCustomPath}
                    onCheckedChange={setUseCustomPath}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="use-custom-path" className="font-normal cursor-help">
                          {t('flow_builder.webhook_use_custom_path', 'Use Custom Path')}
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">{t('flow_builder.webhook_custom_path_tooltip', 'Enable to use a memorable path like \'/shopify-orders\' instead of auto-generated URL. Custom paths must be unique across all flows.')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {useCustomPath && (
                  <div className="mb-2">
                    <Input data-tour="components-flow-builder-webhooktriggernode.input.customPath"
                      placeholder="my-webhook-path"
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      className={cn('font-mono text-xs', customPathError && 'border-destructive')}
                      aria-invalid={!!customPathError}
                      aria-describedby={customPathError ? 'custom-path-err' : undefined}
                    />
                    {customPathError && (
                      <p id="custom-path-err" className="text-[10px] text-destructive mt-0.5">
                        {customPathError}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {t('flow_builder.webhook_custom_path_example', 'Example: shopify-orders, stripe-payments, crm-events. Only letters, numbers, hyphens, and underscores allowed.')}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {t('flow_builder.webhook_active_url', 'Active URL')}:
                  </span>
                  <code className="flex-1 text-[10px] bg-muted px-1 py-0.5 rounded truncate" title={activeUrl}>
                    {activeUrl || '—'}
                  </code>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_regenerate_token"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={handleRegenerateToken}
                        disabled={!flowId}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {t('flow_builder.webhook_regenerate_token', 'Regenerate Token')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <p className="text-xs">{t('flow_builder.webhook_regenerate_token_tooltip', 'Generate a new security token. You\'ll need to update the webhook URL in your external system after regenerating.')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            ) : (
              <p className="text-muted-foreground text-[10px]">
                {t('flow_builder.webhook_save_flow_first', 'Save the flow to generate webhook URL')}
              </p>
            )}
          </div>

          {/* Contact Association */}
          <div
            className={cn(
              'space-y-2',
              (contactMappingStrategy === ContactMappingStrategy.SYSTEM ||
                (contactMappingStrategy === ContactMappingStrategy.EXTRACT && extractField.trim()) ||
                (contactMappingStrategy === ContactMappingStrategy.CREATE &&
                  (createEmailField.trim() || createNameField.trim() || createPhoneField.trim()))) &&
                'rounded p-1.5 bg-muted/20'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <User className="h-3.5 w-3.5 text-primary" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label className="text-primary font-medium cursor-help">
                      {t('flow_builder.webhook_contact_mapping', 'Contact Association')}
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <p className="text-xs">{t('flow_builder.webhook_contact_association_tooltip', 'Determines how to identify or create contacts when webhooks arrive. Choose based on your use case.')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {(contactMappingStrategy === ContactMappingStrategy.SYSTEM ||
                (contactMappingStrategy === ContactMappingStrategy.EXTRACT && extractField.trim()) ||
                (contactMappingStrategy === ContactMappingStrategy.CREATE &&
                  (createEmailField.trim() || createNameField.trim() || createPhoneField.trim()))) && (
                <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
              )}
            </div>
            <div className="space-y-2">
              {[
                { value: ContactMappingStrategy.EXTRACT, label: t('flow_builder.webhook_extract_from_payload', 'Extract from Payload'), tooltip: t('flow_builder.webhook_extract_tooltip', 'Extract contact identifier (email or phone) from webhook payload using a field path. Best for webhooks that include customer data.') },
                { value: ContactMappingStrategy.CREATE, label: t('flow_builder.webhook_create_new_contact', 'Create New Contact'), tooltip: t('flow_builder.webhook_create_tooltip', 'Automatically create a new contact using data from the webhook payload. Useful for lead generation or new customer webhooks.') },
                { value: ContactMappingStrategy.SYSTEM, label: t('flow_builder.webhook_system_level', 'System-Level (No Contact)'), tooltip: t('flow_builder.webhook_system_tooltip', 'Run flow without associating to a contact. Use for background tasks, notifications, or system events.') }
              ].map((opt) => (
                <TooltipProvider key={opt.value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input data-tour="components-flow-builder-webhooktriggernode.input.contact-strategy"
                          type="radio"
                          name="contact-strategy"
                          checked={contactMappingStrategy === opt.value}
                          onChange={() => setContactMappingStrategy(opt.value)}
                          className="w-3 h-3"
                        />
                        <span className="text-[11px]">{opt.label}</span>
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <p className="text-xs">{opt.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            {contactMappingStrategy === ContactMappingStrategy.EXTRACT && (
              <div className="mt-2 space-y-2">
                <Label className="text-[10px] font-medium mb-1 block">
                  {t('flow_builder.webhook_extract_field', 'Field path (e.g. customer.email, phone)')}
                </Label>
                <Input data-tour="components-flow-builder-webhooktriggernode.input.flow_builder.webhook_extract_field"
                  placeholder="customer.email"
                  value={extractField}
                  onChange={(e) => setExtractField(e.target.value)}
                  className="font-mono text-xs h-7"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('flow_builder.webhook_extract_field_help', 'Use dot notation to access nested fields. Examples: \'customer.email\', \'data.user.phone\', \'email\'')}
                </p>
              </div>
            )}
            {contactMappingStrategy === ContactMappingStrategy.CREATE && (
              <div className="mt-2 space-y-2">
                <div>
                  <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.webhook_field_name', 'Name field path')}</Label>
                  <Input data-tour="components-flow-builder-webhooktriggernode.input.flow_builder.webhook_field_name" placeholder="customer.name" value={createNameField} onChange={(e) => setCreateNameField(e.target.value)} className="font-mono text-xs h-7" />
                </div>
                <div>
                  <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.webhook_field_email', 'Email field path')}</Label>
                  <Input data-tour="components-flow-builder-webhooktriggernode.input.flow_builder.webhook_field_name" placeholder="customer.email" value={createEmailField} onChange={(e) => setCreateEmailField(e.target.value)} className="font-mono text-xs h-7" />
                </div>
                <div>
                  <Label className="text-[10px] font-medium mb-1 block">{t('flow_builder.webhook_field_phone', 'Phone field path')}</Label>
                  <Input data-tour="components-flow-builder-webhooktriggernode.input.flow_builder.webhook_field_name" placeholder="customer.phone" value={createPhoneField} onChange={(e) => setCreatePhoneField(e.target.value)} className="font-mono text-xs h-7" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t('flow_builder.webhook_create_fields_help', 'Map webhook payload fields to contact properties. Leave empty to skip that field.')}
                </p>
              </div>
            )}
            {contactMappingStrategy === ContactMappingStrategy.SYSTEM && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {t('flow_builder.webhook_system_help', 'No contact is associated; flow runs at system level.')}
              </p>
            )}
          </div>

          {/* Payload Filters */}
          <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CollapsibleTrigger asChild>
                    <button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_payload_filters"
                      type="button"
                      className="flex items-center gap-1 font-medium text-primary w-full h-6 p-1 text-[10px] justify-between hover:bg-muted/50 rounded"
                    >
                      <span className="flex items-center gap-1">
                        <Filter className="h-3.5 w-3.5 text-primary" />
                        {t('flow_builder.webhook_payload_filters', 'Payload Filters')}
                        {filterConditions.length > 0 && (
                          <span className="text-muted-foreground font-normal">({filterConditions.length})</span>
                        )}
                      </span>
                      {filtersExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </CollapsibleTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="text-xs">{t('flow_builder.webhook_filters_tooltip', 'Optional conditions to filter which webhooks trigger this flow. All conditions must match (AND logic).')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CollapsibleContent className="mt-2 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                {t('flow_builder.webhook_filters_example', 'Example: Filter by event type (\'event_type\' equals \'order.created\') or order value (\'total_price\' greater than \'100\')')}
              </p>
              {filterConditions.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">{t('flow_builder.webhook_no_filters', 'No payload filters configured')}</p>
                  <p className="text-[10px] text-muted-foreground">{t('flow_builder.webhook_no_filters_help', 'Add filters to run the flow only when the payload matches conditions')}</p>
                </div>
              )}
              {filterConditions.map((fc, index) => (
                <div key={index} className="flex flex-wrap items-start gap-1 p-1.5 border rounded bg-muted/30">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1 min-w-[80px] inline-block">
                          <Input data-tour="components-flow-builder-webhooktriggernode.input.fc.fieldPath"
                            placeholder="event_type or order.status"
                            value={fc.fieldPath}
                            onChange={(e) => updateFilter(index, { fieldPath: e.target.value })}
                            className="font-mono w-full text-xs"
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">{t('flow_builder.webhook_field_path_tooltip', 'Path to the field in webhook payload. Use dot notation for nested fields (e.g., \'order.status\', \'data.customer.tier\')')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Select
                            value={fc.operator}
                            onValueChange={(v) => updateFilter(index, { operator: v as FilterOperator })}
                          >
                            <SelectTrigger className="w-[100px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FILTER_OPERATOR_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">{t('flow_builder.webhook_operator_tooltip', 'Comparison operator. Use \'exists\' to check if field is present, \'regex\' for pattern matching.')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {!VALUE_LESS_OPERATORS.includes(fc.operator) && (
                    <Input
                      placeholder="Value"
                      value={fc.value !== undefined ? String(fc.value) : ''}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      className="w-20 text-xs"
                    />
                  )}
                  {STRING_OPERATORS.includes(fc.operator) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label className="flex items-center gap-0.5 whitespace-nowrap cursor-help">
                            <input
                              type="checkbox"
                              checked={fc.caseSensitive ?? false}
                              onChange={(e) => updateFilter(index, { caseSensitive: e.target.checked })}
                              className="w-3 h-3"
                            />
                            <span className="text-[10px]">Case</span>
                          </label>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">
                          <p className="text-xs">{t('flow_builder.webhook_case_sensitive_tooltip', 'Enable for case-sensitive string comparisons. Disable to ignore case differences.')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button data-tour="components-flow-builder-webhooktriggernode.button.common.remove"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-destructive"
                    onClick={() => removeFilter(index)}
                    aria-label={t('common.remove', 'Remove')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_add_filter" variant="outline" size="sm" className="h-7 text-xs" onClick={addFilter}>
                <Plus className="h-3 w-3 mr-1" />
                {t('flow_builder.webhook_add_filter', 'Add Filter')}
              </Button>
            </CollapsibleContent>
          </Collapsible>

          {/* Response Configuration */}
          <Collapsible open={responseConfigExpanded} onOpenChange={setResponseConfigExpanded}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CollapsibleTrigger asChild>
                    <button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_response_config"
                      type="button"
                      className="flex items-center gap-1 font-medium text-primary w-full h-6 p-1 text-[10px] justify-between hover:bg-muted/50 rounded"
                    >
                      <span className="flex items-center gap-1">
                        <Settings className="h-3.5 w-3.5 text-primary" />
                        {t('flow_builder.webhook_response_config', 'Response Configuration')}
                      </span>
                      {responseConfigExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </CollapsibleTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="text-xs">{t('flow_builder.webhook_response_config_tooltip', 'Configure what the webhook endpoint returns to the external system after receiving the webhook.')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">
                  {t('flow_builder.webhook_response_mode', 'Response Mode')}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input data-tour="components-flow-builder-webhooktriggernode.input.flow_builder.webhook_async_mode"
                          type="radio"
                          name="response-mode"
                          checked={responseMode === ResponseMode.ASYNC}
                          onChange={() => setResponseMode(ResponseMode.ASYNC)}
                          className="w-3 h-3"
                        />
                        <span className="text-[11px]">{t('flow_builder.webhook_async_mode', 'Asynchronous')}</span>
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="text-xs">{t('flow_builder.webhook_async_tooltip', 'Returns 202 Accepted immediately without waiting for flow completion. Recommended for most use cases and long-running flows.')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input data-tour="components-flow-builder-webhooktriggernode.input.flow_builder.webhook_sync_mode"
                          type="radio"
                          name="response-mode"
                          checked={responseMode === ResponseMode.SYNC}
                          onChange={() => setResponseMode(ResponseMode.SYNC)}
                          className="w-3 h-3"
                        />
                        <span className="text-[11px]">{t('flow_builder.webhook_sync_mode', 'Synchronous')}</span>
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="text-xs">{t('flow_builder.webhook_sync_tooltip', 'Waits for flow to complete (max 30s) before responding. Use when external system requires immediate confirmation (e.g., payment gateways, validation webhooks).')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {responseMode === ResponseMode.SYNC && (
                <div>
                  <Label className="text-[10px] block mb-0.5">
                    {t('flow_builder.webhook_timeout_seconds', 'Timeout (s)')}
                  </Label>
                  <NumberInput
                    value={responseTimeout}
                    onChange={setResponseTimeout}
                    min={1}
                    max={30}
                    className="text-xs h-7"
                  />
                </div>
              )}
              <div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label className="text-[10px] block mb-0.5 cursor-help">
                        {t('flow_builder.webhook_status_code', 'Status Code')}
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <p className="text-xs">{t('flow_builder.webhook_status_code_tooltip', 'HTTP status code to return. 200 = success, 202 = accepted, 400 = bad request, 404 = not found.')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Select value={String(responseStatusCode)} onValueChange={(v) => setResponseStatusCode(Number(v))}>
                  <SelectTrigger className="w-full h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_CODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label className="text-[10px] cursor-help">
                          {t('flow_builder.webhook_response_body', 'Response Body Template')}
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">{t('flow_builder.webhook_body_template_tooltip', 'Response body with variable interpolation. Use {{webhook.payload.field}} to access webhook data, {{flow.id}} for flow ID.')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Select
                    value="__template_none__"
                    onValueChange={(id) => {
                      if (id === '__template_none__') return;
                      const tpl = WEBHOOK_RESPONSE_TEMPLATES.find((t) => t.id === id);
                      if (tpl?.config) {
                        if (tpl.config.bodyTemplate != null) setResponseBodyTemplate(tpl.config.bodyTemplate);
                        if (tpl.config.statusCode != null) setResponseStatusCode(tpl.config.statusCode);
                        if (tpl.config.headers && Object.keys(tpl.config.headers).length) {
                          setResponseHeaders(Object.entries(tpl.config.headers).map(([k, v]) => ({ key: k, value: v })));
                        }
                        if (tpl.config.mode != null) setResponseMode(tpl.config.mode);
                      }
                    }}
                  >
                    <SelectTrigger data-tour="components-flow-builder-webhooktriggernode.selecttrigger.flow_builder.webhook_use_template" className="w-[140px] h-6 text-[10px] ml-auto">
                      <SelectValue placeholder={t('flow_builder.webhook_use_template', 'Use template')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__template_none__" className="text-xs">
                        {t('flow_builder.webhook_use_template', 'Use template')}
                      </SelectItem>
                      {WEBHOOK_RESPONSE_TEMPLATES.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea data-tour="components-flow-builder-webhooktriggernode.textarea.responseBodyTemplate"
                  value={responseBodyTemplate}
                  onChange={(e) => setResponseBodyTemplate(e.target.value)}
                  placeholder='{"success": true, "flowId": "{{flow.id}}"}'
                  className="font-mono text-xs min-h-[120px]"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {RESPONSE_VARIABLE_HINT}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {responseBodyTemplate.trim().startsWith('{') || responseBodyTemplate.trim().startsWith('[')
                    ? 'Format: JSON'
                    : responseBodyTemplate.trim().startsWith('<')
                      ? 'Format: XML'
                      : 'Format: Plain text'}
                </p>
                <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_preview_response"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 h-6 text-[10px]"
                  onClick={() => {
                    const sample = responseBodyTemplate
                      .replace(/\{\{flow\.id\}\}/g, String(flowId ?? ''))
                      .replace(/\{\{flow\.name\}\}/g, '')
                      .replace(/\{\{webhook\.requestId\}\}/g, 'sample-request-id')
                      .replace(/\{\{contact\.id\}\}/g, '1')
                      .replace(/\{\{contact\.name\}\}/g, 'Sample Contact')
                      .replace(/\{\{contact\.email\}\}/g, 'contact@example.com')
                      .replace(/\{\{contact\.phone\}\}/g, '+1234567890')
                      .replace(/\{\{execution\.status\}\}/g, 'completed')
                      .replace(/\{\{execution\.duration\}\}/g, '150')
                      .replace(/\{\{current\.timestamp\}\}/g, new Date().toISOString());
                    setPreviewBody(sample);
                  }}
                >
                  {t('flow_builder.webhook_preview_response', 'Preview')}
                </Button>
                {previewBody !== null && (
                  <pre className="mt-1 p-1.5 border rounded bg-muted/50 text-[10px] overflow-auto max-h-24">
                    {previewBody}
                  </pre>
                )}
              </div>
              <div>
                <Label className="text-[10px] block mb-0.5">
                  {t('flow_builder.webhook_response_headers', 'Response Headers')}
                </Label>
                <p className="text-[10px] text-muted-foreground mb-1">
                  {t('flow_builder.webhook_headers_help', 'Custom HTTP headers to include in response. Example: \'X-Request-ID\' with value \'{{webhook.requestId}}\'')}
                </p>
                {responseHeaders.map((h, idx) => (
                  <div key={idx} className="flex gap-1 mb-1">
                    <Input data-tour="components-flow-builder-webhooktriggernode.input.h.key"
                      placeholder="Header name"
                      value={h.key}
                      onChange={(e) =>
                        setResponseHeaders((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], key: e.target.value };
                          return next;
                        })
                      }
                      className="font-mono text-xs h-7 flex-1"
                    />
                    <Input data-tour="components-flow-builder-webhooktriggernode.input.h.value"
                      placeholder="Value"
                      value={h.value}
                      onChange={(e) =>
                        setResponseHeaders((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], value: e.target.value };
                          return next;
                        })
                      }
                      className="font-mono text-xs h-7 flex-1"
                    />
                    <Button data-tour="components-flow-builder-webhooktriggernode.button.common.remove"
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => setResponseHeaders((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={t('common.remove', 'Remove')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_add_header"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setResponseHeaders((prev) => [...prev, { key: '', value: '' }])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('flow_builder.webhook_add_header', 'Add Header')}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Test Webhook */}
          <Collapsible open={testSectionExpanded} onOpenChange={setTestSectionExpanded}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CollapsibleTrigger asChild>
                    <button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_test_webhook"
                      type="button"
                      className="flex items-center gap-1 font-medium text-primary w-full h-6 p-1 text-[10px] justify-between hover:bg-muted/50 rounded"
                    >
                      <span className="flex items-center gap-1">
                        <Play className="h-3.5 w-3.5 text-primary" />
                        {t('flow_builder.webhook_test_webhook', 'Test Webhook')}
                      </span>
                      {testSectionExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </CollapsibleTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="text-xs">{t('flow_builder.webhook_test_tooltip', 'Send a test webhook request to verify configuration, filters, and contact mapping before going live.')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CollapsibleContent className="mt-2 space-y-2">
              <div>
                <Label className="text-[10px] block mb-0.5">{t('flow_builder.webhook_sample_payload', 'Sample payload')}</Label>
                <p className="text-[10px] text-muted-foreground mb-0.5">
                  {t('flow_builder.webhook_sample_payload_help', 'Select a pre-built sample or paste your own JSON payload to test the webhook trigger.')}
                </p>
                <Select
                  value={selectedSampleId || '__none__'}
                  onValueChange={(id) => {
                    if (id === '__none__') return;
                    const sample = WEBHOOK_SAMPLE_PAYLOADS.find((s) => s.id === id);
                    if (sample) {
                      setSelectedSampleId(id);
                      setSamplePayload(JSON.stringify(sample.payload, null, 2));
                    }
                  }}
                >
                  <SelectTrigger data-tour="components-flow-builder-webhooktriggernode.selecttrigger.flow_builder.webhook_use_sample" className="h-7 text-xs w-full">
                    <SelectValue placeholder={t('flow_builder.webhook_use_sample', 'Use sample')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">{t('flow_builder.webhook_use_sample', 'Use sample')}</SelectItem>
                    {WEBHOOK_SAMPLE_PAYLOADS.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.name} ({s.platform})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] block mb-0.5">{t('flow_builder.webhook_payload_json', 'Payload (JSON)')}</Label>
                <Textarea data-tour="components-flow-builder-webhooktriggernode.textarea.flow_builder.webhook_sample_payload"
                  value={samplePayload}
                  onChange={(e) => setSamplePayload(e.target.value)}
                  placeholder='{"event_type": "order.created"}'
                  className="font-mono text-xs min-h-[140px]"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_send_test" variant="outline" size="sm" className="h-7 text-xs" onClick={runTest} disabled={isTesting}>
                        {isTesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        {t('flow_builder.webhook_send_test', 'Send Test Request')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <p className="text-xs">{t('flow_builder.webhook_send_test_tooltip', 'Sends the sample payload to your webhook URL and shows detailed results including filter evaluation and contact resolution.')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {showTestResult && testResult && (
                  <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_clear_test" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setTestResult(null); setShowTestResult(false); }}>
                    {t('flow_builder.webhook_clear_test', 'Clear Test Results')}
                  </Button>
                )}
              </div>
              {showTestResult && testResult && (
                <Card className="bg-muted/20">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs">{t('flow_builder.webhook_test_results', 'Test Results')}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 px-3 space-y-2 text-[10px]">
                    {testResult.error && <p className="text-destructive">{testResult.error}</p>}
                    {testResult.httpResponse && (
                      <div>
                        <p className="font-medium mb-0.5">{t('flow_builder.webhook_response', 'Response')}</p>
                        <p>
                          <span className={cn(
                            testResult.httpResponse.statusCode >= 200 && testResult.httpResponse.statusCode < 300 && 'text-green-600',
                            testResult.httpResponse.statusCode >= 400 && 'text-destructive'
                          )}>
                            {testResult.httpResponse.statusCode}
                          </span>
                          {' '}{testResult.httpResponse.durationMs} ms
                        </p>
                        <Collapsible open={testResponseExpanded} onOpenChange={setTestResponseExpanded}>
                          <CollapsibleTrigger asChild>
                            <button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_response_body" type="button" className="text-primary flex items-center gap-0.5">
                              {testResponseExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {t('flow_builder.webhook_response_body', 'Response Body')}
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-1 p-1.5 rounded bg-muted/50 overflow-auto max-h-32 whitespace-pre-wrap break-words">
                              {testResult.httpResponse.body.slice(0, 2000)}{testResult.httpResponse.body.length > 2000 ? '…' : ''}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                        {Object.keys(testResult.httpResponse.headers).length > 0 && (
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_response_headers" type="button" className="text-primary flex items-center gap-0.5 mt-0.5">
                                <ChevronDown className="h-3 w-3" /> {t('flow_builder.webhook_response_headers', 'Response Headers')}
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-1 p-1.5 rounded bg-muted/50 text-[9px] overflow-auto max-h-20">
                                {JSON.stringify(testResult.httpResponse.headers, null, 2)}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    )}
                    {testResult.filterResults && (
                      <div>
                        <p className="font-medium mb-0.5">{t('flow_builder.webhook_filter_evaluation', 'Filter Evaluation')}</p>
                        <p>
                          {testResult.filterResults.passed ? (
                            <span className="text-green-600">{t('common.passed', 'Passed')}</span>
                          ) : (
                            <span className="text-destructive">{t('common.failed', 'Failed')}</span>
                          )}
                        </p>
                        {testResult.filterResults.evaluatedConditions.map((e, i) => (
                          <div key={i} className="pl-1 border-l border-border mt-0.5">
                            <span className="font-mono">{e.condition.fieldPath}</span> {e.condition.operator} → {e.result ? t('common.passed', 'Passed') : t('common.failed', 'Failed')}
                            {e.actualValue !== undefined && <span className="text-muted-foreground"> ({String(e.actualValue)})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {testResult.contactResolution && (
                      <div>
                        <p className="font-medium mb-0.5">{t('flow_builder.webhook_contact_result', 'Contact Resolution')}</p>
                        <p>{testResult.contactResolution}</p>
                        {testResult.contactPreview?.extracted != null && (
                          <p className="text-muted-foreground">Extracted: {testResult.contactPreview.extracted}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* How to Test */}
              <Collapsible open={howToTestExpanded} onOpenChange={setHowToTestExpanded}>
                <CollapsibleTrigger asChild>
                  <button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_how_to_test"
                    type="button"
                    className="flex items-center gap-1 text-primary w-full py-1"
                  >
                    <Info className="h-3.5 w-3.5" />
                    {howToTestExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {t('flow_builder.webhook_how_to_test', 'How to Test')}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[10px] space-y-2">
                  <p className="font-medium">{t('flow_builder.webhook_how_to_test_steps', 'Steps')}:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>{t('flow_builder.webhook_how_to_test_1', 'Copy the webhook URL above')}</li>
                    <li>{t('flow_builder.webhook_how_to_test_2', 'Send a POST request with JSON body from your app or tool')}</li>
                    <li>{t('flow_builder.webhook_how_to_test_3', 'Check logs and execution in this flow')}</li>
                  </ol>
                  {(() => {
                    const url = activeUrl || '<your-webhook-url>';
                    const curlCode = `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"test"}'`;
                    const jsCode = `fetch("${activeUrl || '<url>'}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event: "test" })
});`;
                    const pythonCode = `import requests
requests.post("${activeUrl || '<url>'}", json={"event": "test"})`;
                    const phpCode = `<?php
$url = "${activeUrl || '<url>'}";
$data = ["event" => "test"];
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);
?>`;
                    const handleCopy = (text: string) => {
                      navigator.clipboard.writeText(text).then(() => {
                        toast({ title: t('flow_builder.webhook_copied', 'Copied to clipboard'), duration: 2000 });
                      });
                    };
                    return (
                      <>
                        <p className="font-medium mt-1">{t('flow_builder.webhook_curl_example', 'cURL')}:</p>
                        <div className="relative group">
                          <pre className="p-1.5 pr-8 rounded bg-muted font-mono overflow-x-auto whitespace-pre text-[9px]">
                            {curlCode}
                          </pre>
                          <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_copy_code"
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0.5 top-0.5 h-6 w-6 opacity-70 hover:opacity-100"
                            onClick={() => handleCopy(curlCode)}
                            aria-label={t('flow_builder.webhook_copy_code', 'Copy code')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="font-medium">{t('flow_builder.webhook_js_example', 'JavaScript')}:</p>
                        <div className="relative group">
                          <pre className="p-1.5 pr-8 rounded bg-muted font-mono overflow-x-auto whitespace-pre text-[9px]">
                            {jsCode}
                          </pre>
                          <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_copy_code"
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0.5 top-0.5 h-6 w-6 opacity-70 hover:opacity-100"
                            onClick={() => handleCopy(jsCode)}
                            aria-label={t('flow_builder.webhook_copy_code', 'Copy code')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="font-medium">{t('flow_builder.webhook_python_example', 'Python')}:</p>
                        <div className="relative group">
                          <pre className="p-1.5 pr-8 rounded bg-muted font-mono overflow-x-auto whitespace-pre text-[9px]">
                            {pythonCode}
                          </pre>
                          <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_copy_code"
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0.5 top-0.5 h-6 w-6 opacity-70 hover:opacity-100"
                            onClick={() => handleCopy(pythonCode)}
                            aria-label={t('flow_builder.webhook_copy_code', 'Copy code')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="font-medium">{t('flow_builder.webhook_php_example', 'PHP')}:</p>
                        <div className="relative group">
                          <pre className="p-1.5 pr-8 rounded bg-muted font-mono overflow-x-auto whitespace-pre text-[9px]">
                            {phpCode}
                          </pre>
                          <Button data-tour="components-flow-builder-webhooktriggernode.button.flow_builder.webhook_copy_code"
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0.5 top-0.5 h-6 w-6 opacity-70 hover:opacity-100"
                            onClick={() => handleCopy(phpCode)}
                            aria-label={t('flow_builder.webhook_copy_code', 'Copy code')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-muted-foreground mt-1">{t('flow_builder.webhook_debug_tips', 'Tips: Check logs, verify filters, and test contact mapping.')}</p>
                      </>
                    );
                  })()}
                </CollapsibleContent>
              </Collapsible>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

function WebhookHelpContent() {
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Webhook Trigger Overview
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              The <strong>Webhook Trigger</strong> node receives HTTP POST requests from external systems and starts your flow.
              Use it to integrate with Shopify, Stripe, CRMs, or any service that can send webhooks.
            </p>
            <p className="text-sm text-foreground">
              <strong>Key features:</strong> Unique URL per flow, optional payload filters, contact association (extract or create),
              configurable response (async/sync), and test tooling.
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            URL Configuration & Security
          </h3>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              After saving the flow, a unique webhook URL is generated. You can use the default (flow ID + token) or enable
              <strong> Custom Path</strong> for a memorable path (e.g. <code className="bg-muted px-1 rounded">shopify-orders</code>).
              Custom paths must be unique across all webhook triggers and use only letters, numbers, hyphens, and underscores.
            </p>
            <p className="text-sm text-muted-foreground">
              Use <strong>Regenerate Token</strong> if the URL is compromised. Update the new URL in your external system.
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Contact Mapping Strategies
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Extract from Payload</h4>
              <p className="text-xs text-muted-foreground">
                Use a field path (e.g. <code className="bg-muted px-1 rounded">customer.email</code>) to identify an existing contact. Best when the payload includes customer identifiers.
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Create New Contact</h4>
              <p className="text-xs text-muted-foreground">
                Map payload fields to name, email, and phone to create a new contact for each webhook. Ideal for lead gen or new signups.
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">System-Level (No Contact)</h4>
              <p className="text-xs text-muted-foreground">
                Run the flow without associating a contact. Use for background jobs, notifications, or system events.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Payload Filtering
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            Add conditions so the flow runs only when the payload matches (e.g. <code className="bg-muted px-1 rounded">event_type</code> equals <code className="bg-muted px-1 rounded">order.created</code>).
            All conditions are ANDed. Use dot notation for nested fields.
          </p>
          <div className="bg-muted rounded p-2 text-xs font-mono">
            event_type equals order.created<br />
            data.total_price greater than 100
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Response Configuration
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            <strong>Asynchronous</strong> (recommended): Returns 202 Accepted immediately; flow runs in the background.
            <strong> Synchronous</strong>: Waits for the flow to finish (with timeout) before responding—use when the caller needs the result (e.g. payment gateways).
          </p>
          <p className="text-sm text-muted-foreground">
            You can set status code, response body template (with variables like <code className="bg-muted px-1 rounded">&#123;&#123;flow.id&#125;&#125;</code>, <code className="bg-muted px-1 rounded">&#123;&#123;webhook.requestId&#125;&#125;</code>), and custom headers.
          </p>
        </section>

        <Separator />

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            Integration Examples
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Shopify</h4>
              <p className="text-xs text-muted-foreground">Order created, customer data: use Extract with <code className="bg-muted px-0.5">customer.email</code>; filter by <code className="bg-muted px-0.5">topic</code>.</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Stripe</h4>
              <p className="text-xs text-muted-foreground">Payment events: filter by <code className="bg-muted px-0.5">type</code> (e.g. <code className="bg-muted px-0.5">invoice.paid</code>); use Sync mode if you need to return a response.</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">CRM / Forms</h4>
              <p className="text-xs text-muted-foreground">New lead: use Create New Contact and map form fields to name, email, phone.</p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            Troubleshooting
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Save the flow first to get a valid webhook URL.</li>
            <li>Use the Test Webhook section to send a sample payload and verify filters and contact resolution.</li>
            <li>Check the Logs button for incoming requests and errors.</li>
            <li>Ensure the external system sends <code className="bg-muted px-0.5">Content-Type: application/json</code> for JSON payloads.</li>
          </ul>
        </section>
      </div>
    </ScrollArea>
  );
}
