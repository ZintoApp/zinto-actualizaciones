import { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import {
  Trash2,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Plus,
  X,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  List,
  HelpCircle,
  AlertCircle,
  Globe,
  User,
  Filter,
  Settings,
  Play,
} from 'lucide-react';
import { useFlowContext } from '@/pages/flow-builder';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
  type ResponseConfig,
} from '@shared/types/webhook-trigger';
import {
  MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS,
  MASTER_SHOP_DEFAULT_WEBHOOK_EVENT_IDS,
  MASTER_SHOP_DEFAULT_WEBHOOK_PRESET_IDS,
  buildMasterShopWebhookTriggerMetadata,
  getMasterShopPresetFilterRules,
  matchMasterShopWebhookPresets,
  mergeMasterShopWebhookVariableMappings,
  type MasterShopWebhookEventCategory,
  type MasterShopWebhookTriggerNodeData,
} from '@shared/types/mastershop';
import { createMasterShopDisplayLabels } from './mastershop-display-labels';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { MASTER_SHOP_FLOW_NODE_ICON_SRC } from '@/pages/flow-builder-node-catalog';

const CUSTOM_PATH_REGEX = /^[a-zA-Z0-9_-]+$/;
const WEBHOOK_TRIGGER_TYPES = new Set(['webhookTrigger', 'mastershopWebhookTrigger']);

const FILTER_OPERATOR_FALLBACKS: { value: FilterOperator; fallback: string }[] = [
  { value: FilterOperator.EQUALS, fallback: 'Equals' },
  { value: FilterOperator.NOT_EQUALS, fallback: 'Not equals' },
  { value: FilterOperator.CONTAINS, fallback: 'Contains' },
  { value: FilterOperator.NOT_CONTAINS, fallback: 'Does not contain' },
  { value: FilterOperator.STARTS_WITH, fallback: 'Starts with' },
  { value: FilterOperator.ENDS_WITH, fallback: 'Ends with' },
  { value: FilterOperator.GREATER_THAN, fallback: 'Greater than' },
  { value: FilterOperator.LESS_THAN, fallback: 'Less than' },
  { value: FilterOperator.EXISTS, fallback: 'Exists' },
  { value: FilterOperator.NOT_EXISTS, fallback: 'Does not exist' },
  { value: FilterOperator.IN, fallback: 'In' },
  { value: FilterOperator.NOT_IN, fallback: 'Not in' },
];

const STRING_OPERATORS = [
  FilterOperator.EQUALS,
  FilterOperator.NOT_EQUALS,
  FilterOperator.CONTAINS,
  FilterOperator.NOT_CONTAINS,
  FilterOperator.STARTS_WITH,
  FilterOperator.ENDS_WITH,
];

const VALUE_LESS_OPERATORS = [FilterOperator.EXISTS, FilterOperator.NOT_EXISTS];

const STATUS_CODE_OPTIONS = [
  { value: 200, label: '200 OK' },
  { value: 201, label: '201 Created' },
  { value: 202, label: '202 Accepted' },
  { value: 204, label: '204 No Content' },
  { value: 400, label: '400 Bad Request' },
  { value: 404, label: '404 Not Found' },
  { value: 500, label: '500 Internal Server Error' },
];

const MASTERSHOP_SAMPLES = WEBHOOK_SAMPLE_PAYLOADS.filter((s) => s.platform === 'Mastershop');

const MASTERSHOP_VARIABLE_TABLE: Array<{ variable: string; source: string }> = [
  { variable: 'mastershop.webhook.idOrder', source: 'id_order' },
  { variable: 'mastershop.webhook.idStatus', source: 'id_status' },
  { variable: 'mastershop.webhook.statusName', source: 'confirmation_status_name' },
  { variable: 'mastershop.webhook.paymentMethod', source: 'order_transaction.payment_method' },
  { variable: 'mastershop.webhook.customerName', source: 'customer.full_name' },
  { variable: 'mastershop.webhook.customerEmail', source: 'customer.email' },
  { variable: 'mastershop.webhook.customerPhone', source: 'customer.phone' },
  { variable: 'mastershop.webhook.trackingUrl', source: 'order_logistics.url_tracking' },
  { variable: 'mastershop.webhook.carrierStatus', source: 'carrier_status_info.carrier_status' },
  { variable: 'mastershop.webhook.noveltyDescription', source: 'carrier_novelty.description' },
];

const WEBHOOK_EVENT_CATEGORIES: MasterShopWebhookEventCategory[] = [
  'order_status',
  'carrier_status',
  'payment_specific_order_status',
];

const WEBHOOK_CATEGORY_FALLBACKS: Record<MasterShopWebhookEventCategory, string> = {
  order_status: 'Order status',
  carrier_status: 'Carrier status',
  payment_specific_order_status: 'Payment-specific order status',
};

function deriveEventIdsFromPresetIds(presetIds: string[]): number[] {
  const eventIds = new Set<number>();
  for (const preset of MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS) {
    if (presetIds.includes(preset.presetId)) {
      eventIds.add(preset.eventId);
    }
  }
  return [...eventIds];
}

function derivePresetIdsFromEventIds(eventIds: number[]): string[] {
  return MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.filter((preset) =>
    eventIds.includes(preset.eventId)
  ).map((preset) => preset.presetId);
}

/** Resolve preset/event selections together so a single-array save does not broaden on reload. */
function resolveInitialMasterShopWebhookSelections(data: MasterShopWebhookTriggerNodeData): {
  presetIds: string[];
  eventIds: number[];
} {
  const hasTopPresets = Array.isArray(data.selectedPresetIds);
  const hasTopEvents = Array.isArray(data.selectedEventIds);
  const hasMetaPresets = Array.isArray(data.metadata?.mastershopPresetIds);
  const hasMetaEvents = Array.isArray(data.metadata?.mastershopEventIds);

  if (!hasTopPresets && !hasTopEvents && !hasMetaPresets && !hasMetaEvents) {
    return {
      presetIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_PRESET_IDS],
      eventIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_EVENT_IDS],
    };
  }

  const presetIds = hasTopPresets
    ? data.selectedPresetIds
    : hasMetaPresets
      ? data.metadata!.mastershopPresetIds
      : undefined;
  const eventIds = hasTopEvents
    ? data.selectedEventIds
    : hasMetaEvents
      ? data.metadata!.mastershopEventIds
      : undefined;

  if (presetIds !== undefined && eventIds !== undefined) {
    return { presetIds: [...presetIds], eventIds: [...eventIds] };
  }

  if (presetIds !== undefined) {
    if (presetIds.length === 0) {
      return { presetIds: [], eventIds: [] };
    }
    return {
      presetIds: [...presetIds],
      eventIds: deriveEventIdsFromPresetIds(presetIds),
    };
  }

  if (eventIds !== undefined) {
    if (eventIds.length === 0) {
      return { presetIds: [], eventIds: [] };
    }
    return {
      presetIds: derivePresetIdsFromEventIds(eventIds),
      eventIds: [...eventIds],
    };
  }

  return { presetIds: [], eventIds: [] };
}

function stringRecordEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined
): boolean {
  const keysA = Object.keys(a ?? {});
  const keysB = Object.keys(b ?? {});
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => (a ?? {})[key] === (b ?? {})[key]);
}

function numberArrayEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function stringArrayEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function masterShopWebhookPersistedDataEqual(
  current: MasterShopWebhookTriggerNodeData,
  next: {
    webhookToken: string;
    customPath: string | undefined;
    useCustomPath: boolean;
    selectedPreset: 'all' | 'custom';
    selectedEventIds: number[];
    selectedPresetIds: string[];
    filterConditions: FilterCondition[];
    customVariableMappings: Record<string, string>;
    contactMapping: ContactMappingConfig;
    responseConfig: ResponseConfig;
    metadata: Record<string, unknown>;
  }
): boolean {
  const currentPath =
    current.useCustomPath && current.customPath?.trim() ? current.customPath.trim() : undefined;

  if (current.webhookToken !== next.webhookToken) return false;
  if (currentPath !== next.customPath) return false;
  if (!!current.useCustomPath !== next.useCustomPath) return false;
  if (current.selectedPreset !== next.selectedPreset) return false;
  if (!numberArrayEqual(current.selectedEventIds, next.selectedEventIds)) return false;
  if (!stringArrayEqual(current.selectedPresetIds, next.selectedPresetIds)) return false;
  if (JSON.stringify(current.filterConditions ?? []) !== JSON.stringify(next.filterConditions)) {
    return false;
  }
  if (!stringRecordEqual(current.customVariableMappings, next.customVariableMappings)) {
    return false;
  }
  if (JSON.stringify(current.contactMapping) !== JSON.stringify(next.contactMapping)) {
    return false;
  }
  if (JSON.stringify(current.responseConfig) !== JSON.stringify(next.responseConfig)) {
    return false;
  }

  const currentMeta = current.metadata ?? {};
  const nextMeta = next.metadata;
  if (!stringArrayEqual(currentMeta.mastershopPresetIds, nextMeta.mastershopPresetIds as string[])) {
    return false;
  }
  if (!numberArrayEqual(currentMeta.mastershopEventIds, nextMeta.mastershopEventIds as number[])) {
    return false;
  }
  if (
    !stringRecordEqual(
      currentMeta.customVariableMappings,
      nextMeta.customVariableMappings as Record<string, string> | undefined
    )
  ) {
    return false;
  }

  return true;
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

interface MasterShopWebhookTriggerNodeProps {
  id: string;
  data: MasterShopWebhookTriggerNodeData;
  isConnectable: boolean;
}

function MasterShopWebhookHelpContent({
  t,
}: {
  t: (key: string, fallback: string, variables?: Record<string, string | number>) => string;
}) {
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-4 text-sm">
        <section>
          <h4 className="font-semibold mb-1">
            {t('flow_builder.mastershop.webhook.help_configure_title', 'Configure Mastershop')}
          </h4>
          <p className="text-muted-foreground text-xs">
            {t(
              'flow_builder.mastershop.webhook.help_configure_body',
              'Copy the webhook URL below and paste it into your Mastershop integration settings. Mastershop will POST order events to this endpoint.'
            )}
          </p>
        </section>
        <section>
          <h4 className="font-semibold mb-1">
            {t('flow_builder.mastershop.webhook.help_presets_title', 'Event presets')}
          </h4>
          <p className="text-muted-foreground text-xs">
            {t(
              'flow_builder.mastershop.webhook.help_presets_body',
              'Select only the event presets you need. Matching uses OR logic across selected presets — the webhook passes if any selected preset matches. Do not encode preset selection as generic payload filters (those use AND).'
            )}
          </p>
        </section>
        <section>
          <h4 className="font-semibold mb-1">
            {t('flow_builder.mastershop.webhook.help_carrier_title', 'Carrier events')}
          </h4>
          <p className="text-muted-foreground text-xs">
            {t(
              'flow_builder.mastershop.webhook.help_carrier_body',
              'Carrier events often keep id_status = 6 while differing in carrier_status_info or carrier_novelty.'
            )}
          </p>
        </section>
        <section>
          <h4 className="font-semibold mb-1">
            {t('flow_builder.mastershop.webhook.help_payment_title', 'Payment-specific presets')}
          </h4>
          <p className="text-muted-foreground text-xs">
            {t(
              'flow_builder.mastershop.webhook.help_payment_body',
              'Contra Entrega and Pago Anticipado presets match order_transaction.payment_method (cod vs transfer/prepaid).'
            )}
          </p>
        </section>
        <section>
          <h4 className="font-semibold mb-1">
            {t('flow_builder.mastershop.webhook.help_variables_title', 'Variables for downstream nodes')}
          </h4>
          <p className="text-muted-foreground text-xs mb-2">
            {t(
              'flow_builder.mastershop.webhook.help_variables_body',
              'Use webhook.payload.* for raw fields and mastershop.webhook.* for mapped variables.'
            )}
          </p>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-1">
                  {t('flow_builder.mastershop.webhook.help_table_variable', 'Variable')}
                </th>
                <th className="text-left p-1">
                  {t('flow_builder.mastershop.webhook.help_table_source', 'Source field')}
                </th>
              </tr>
            </thead>
            <tbody>
              {MASTERSHOP_VARIABLE_TABLE.map((row) => (
                <tr key={row.variable} className="border-b border-border/50">
                  <td className="p-1 font-mono">{row.variable}</td>
                  <td className="p-1 font-mono text-muted-foreground">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </ScrollArea>
  );
}

export function MasterShopWebhookTriggerNode({ id, data, isConnectable }: MasterShopWebhookTriggerNodeProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => createMasterShopDisplayLabels(t), [t]);
  const filterOperatorOptions = useMemo(
    () =>
      FILTER_OPERATOR_FALLBACKS.map((opt) => ({
        value: opt.value,
        label: labels.filterOperatorLabel(opt.value, opt.fallback),
      })),
    [labels]
  );
  const presetsByCategory = useMemo(
    () =>
      WEBHOOK_EVENT_CATEGORIES.map((category) => ({
        category,
        label: labels.webhookCategoryLabel(category, WEBHOOK_CATEGORY_FALLBACKS[category]),
        presets: MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.filter((p) => p.category === category),
      })),
    [labels]
  );
  const { toast } = useToast();
  const { setNodes, getNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId: rawFlowId } = useFlowContext();

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
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>(
    () => resolveInitialMasterShopWebhookSelections(data).presetIds
  );
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>(
    () => resolveInitialMasterShopWebhookSelections(data).eventIds
  );
  const [customVariableMappings] = useState(() =>
    mergeMasterShopWebhookVariableMappings(
      data.metadata?.customVariableMappings,
      data.customVariableMappings
    )
  );
  const [contactMappingStrategy, setContactMappingStrategy] = useState<ContactMappingStrategy>(
    data.contactMapping?.strategy ?? ContactMappingStrategy.CREATE
  );
  const [extractField, setExtractField] = useState(data.contactMapping?.extractField || '');
  const [createNameField, setCreateNameField] = useState(
    data.contactMapping?.createFields?.nameField || 'customer.full_name'
  );
  const [createEmailField, setCreateEmailField] = useState(
    data.contactMapping?.createFields?.emailField || 'customer.email'
  );
  const [createPhoneField, setCreatePhoneField] = useState(
    data.contactMapping?.createFields?.phoneField || 'customer.phone'
  );
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>(data.filterConditions ?? []);
  const [responseStatusCode, setResponseStatusCode] = useState(data.responseConfig?.statusCode ?? 200);
  const [responseBodyTemplate, setResponseBodyTemplate] = useState(
    data.responseConfig?.bodyTemplate ?? '{"success": true, "received": true}'
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

  const defaultSample = MASTERSHOP_SAMPLES[0];
  const [samplePayload, setSamplePayload] = useState(
    defaultSample ? JSON.stringify(defaultSample.payload, null, 2) : '{}'
  );
  const [selectedSampleId, setSelectedSampleId] = useState(defaultSample?.id ?? '');
  const [copied, setCopied] = useState(false);
  const [customPathError, setCustomPathError] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    presetMatch?: ReturnType<typeof matchMasterShopWebhookPresets>;
    filterResults?: {
      passed: boolean;
      evaluatedConditions: Array<{
        condition: FilterCondition;
        result: boolean;
        actualValue?: unknown;
        reason?: string;
      }>;
    };
    contactResolution?: string;
    httpResponse?: { statusCode: number; body: string; headers: Record<string, string>; durationMs: number };
    error?: string;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [presetsExpanded, setPresetsExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [responseConfigExpanded, setResponseConfigExpanded] = useState(false);
  const [testSectionExpanded, setTestSectionExpanded] = useState(true);

  const { data: logsCountData, refetch: refetchLogsCount } = useQuery({
    queryKey: ['webhook-triggers-logs-count', flowId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/webhook-triggers/logs/count?flowId=${flowId}`);
      return res.json();
    },
    enabled: !!flowId,
  });
  const logsCount = useMemo(() => {
    const count = logsCountData?.count;
    return typeof count === 'number' && !isNaN(count) && count >= 0 ? count : 0;
  }, [logsCountData?.count]);

  const allPresetsSelected =
    selectedPresetIds.length >= MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.length;

  const activePresetFilterChips = useMemo(() => {
    const presets = MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.filter((p) =>
      selectedPresetIds.includes(p.presetId)
    );
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const preset of presets) {
      for (const rule of getMasterShopPresetFilterRules(preset)) {
        if (!seen.has(rule.description)) {
          seen.add(rule.description);
          chips.push(rule.description);
        }
      }
    }
    return chips;
  }, [selectedPresetIds]);

  const updateNodeData = useCallback(
    (updates: Record<string, unknown>) => {
      setNodes((nodes) =>
        nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...updates } } : node))
      );
    },
    [id, setNodes]
  );

  const syncPresetSelection = useCallback(
    (presetIds: string[], eventIds: number[]) => {
      setSelectedPresetIds(presetIds);
      setSelectedEventIds(eventIds);
    },
    []
  );

  const togglePreset = useCallback(
    (presetId: string, eventId: number, checked: boolean) => {
      let nextPresetIds: string[];
      let nextEventIds: number[];
      if (checked) {
        nextPresetIds = [...new Set([...selectedPresetIds, presetId])];
        nextEventIds = [...new Set([...selectedEventIds, eventId])];
      } else {
        nextPresetIds = selectedPresetIds.filter((p) => p !== presetId);
        nextEventIds = selectedEventIds.filter((e) => e !== eventId);
      }
      syncPresetSelection(nextPresetIds, nextEventIds);
    },
    [selectedPresetIds, selectedEventIds, syncPresetSelection]
  );

  const selectAllPresets = useCallback(() => {
    syncPresetSelection(
      MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.map((p) => p.presetId),
      MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.map((p) => p.eventId)
    );
  }, [syncPresetSelection]);

  const activeUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (useCustomPath && customPath.trim() && !customPathError) {
      return `${origin}/api/webhook/trigger/${encodeURIComponent(customPath.trim())}`;
    }
    if (flowId && webhookToken) {
      return `${origin}/api/webhook/trigger/${flowId}/${webhookToken}`;
    }
    return '';
  }, [useCustomPath, customPath, customPathError, flowId, webhookToken]);

  const autoGeneratedUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (flowId && webhookToken) {
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
    if (data.webhookToken && data.webhookToken !== webhookToken) {
      setWebhookToken(data.webhookToken);
      setUseCustomPath(data.useCustomPath ?? false);
      setCustomPath(data.customPath || '');
    }
  }, [data.webhookToken, data.useCustomPath, data.customPath]);

  useEffect(() => {
    const nodeDataForMetadata: MasterShopWebhookTriggerNodeData = {
      ...data,
      label: data.label,
      platform: data.platform,
      selectedPreset: allPresetsSelected ? 'all' : 'custom',
      selectedEventIds,
      selectedPresetIds,
      filterConditions,
      customVariableMappings,
      contactMapping: {
        strategy: contactMappingStrategy,
        extractField:
          contactMappingStrategy === ContactMappingStrategy.EXTRACT ? extractField : undefined,
        createFields:
          contactMappingStrategy === ContactMappingStrategy.CREATE
            ? {
                nameField: createNameField || undefined,
                emailField: createEmailField || undefined,
                phoneField: createPhoneField || undefined,
              }
            : undefined,
      } as ContactMappingConfig,
      responseConfig: {
        statusCode: responseStatusCode,
        bodyTemplate: responseBodyTemplate,
        headers: responseHeaders.reduce<Record<string, string>>((acc, { key, value }) => {
          if (key.trim()) acc[key.trim()] = value;
          return acc;
        }, {}),
        mode: responseMode,
        timeout: responseMode === ResponseMode.SYNC ? responseTimeout * 1000 : undefined,
      } as ResponseConfig,
      metadata: {
        mastershopPresetIds: selectedPresetIds,
        mastershopEventIds: selectedEventIds,
        integration: 'mastershop',
        nodeType: 'mastershopWebhookTrigger',
      },
    };

    const pathToPersist =
      useCustomPath && customPath.trim() && !customPathError ? customPath.trim() : undefined;

    const persistedMetadata = buildMasterShopWebhookTriggerMetadata(nodeDataForMetadata);
    const selectedPreset: 'all' | 'custom' = allPresetsSelected ? 'all' : 'custom';
    const updates = {
      webhookToken,
      customPath: pathToPersist,
      useCustomPath,
      selectedPreset,
      selectedEventIds,
      selectedPresetIds,
      filterConditions,
      customVariableMappings,
      contactMapping: nodeDataForMetadata.contactMapping,
      responseConfig: nodeDataForMetadata.responseConfig,
      metadata: persistedMetadata,
    };

    if (!masterShopWebhookPersistedDataEqual(data, updates)) {
      updateNodeData(updates);
    }
  }, [
    webhookToken,
    customPath,
    customPathError,
    useCustomPath,
    selectedPresetIds,
    selectedEventIds,
    allPresetsSelected,
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
    customVariableMappings,
    updateNodeData,
  ]);

  const validateCustomPath = useCallback(
    (path: string) => {
      if (!path.trim()) {
        setCustomPathError('');
        return true;
      }
      if (!CUSTOM_PATH_REGEX.test(path)) {
        setCustomPathError(
          t('flow_builder.webhook_path_invalid', 'Use only letters, numbers, hyphens and underscores')
        );
        return false;
      }
      const nodes = getNodes();
      const otherWithSame = nodes.filter(
        (n) =>
          n.id !== id &&
          WEBHOOK_TRIGGER_TYPES.has(n.type ?? '') &&
          (n.data as { customPath?: string })?.customPath === path.trim()
      );
      if (otherWithSame.length > 0) {
        setCustomPathError(
          t('flow_builder.webhook_path_duplicate', 'This path is already used by another webhook trigger')
        );
        return false;
      }
      setCustomPathError('');
      return true;
    },
    [getNodes, id, t]
  );

  useEffect(() => {
    const timer = setTimeout(() => validateCustomPath(customPath), 500);
    return () => clearTimeout(timer);
  }, [customPath, validateCustomPath]);

  const handleCopyUrl = useCallback(() => {
    if (!activeUrl) return;
    navigator.clipboard.writeText(activeUrl).then(() => {
      setCopied(true);
      toast({ title: t('flow_builder.webhook_url_copied', 'Webhook URL copied to clipboard'), duration: 2000 });
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
      setWebhookToken(generateToken());
      toast({ title: t('flow_builder.webhook_token_regenerated', 'Token regenerated') });
    }
  }, [t, toast]);

  const addFilter = useCallback(() => {
    setFilterConditions((prev) => [...prev, { fieldPath: '', operator: FilterOperator.EQUALS, value: '' }]);
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
      const presetMatch = matchMasterShopWebhookPresets(payload, {
        presetIds: selectedPresetIds,
        eventIds: selectedEventIds,
      });
      const filterResults = evaluateFilters(payload as object, filterConditions);
      const combinedPassed = presetMatch.passed && filterResults.passed;

      let contactResolution = 'none';
      if (contactMappingStrategy === ContactMappingStrategy.EXTRACT && extractField) {
        contactResolution = 'extract';
      } else if (contactMappingStrategy === ContactMappingStrategy.CREATE) {
        contactResolution = 'create';
      } else {
        contactResolution = 'system';
      }

      let httpResponse: { statusCode: number; body: string; headers: Record<string, string>; durationMs: number } | undefined;
      if (activeUrl && combinedPassed) {
        const start = Date.now();
        try {
          const res = await fetch(activeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: samplePayload,
          });
          const body = await res.text();
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          httpResponse = { statusCode: res.status, body, headers, durationMs: Date.now() - start };
          if (res.status >= 200 && res.status < 300) refetchLogsCount();
        } catch (fetchErr) {
          httpResponse = {
            statusCode: 0,
            body: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
            headers: {},
            durationMs: Date.now() - start,
          };
        }
      }

      setTestResult({
        presetMatch,
        filterResults: {
          passed: filterResults.passed,
          evaluatedConditions: filterResults.evaluatedConditions,
        },
        contactResolution,
        httpResponse,
        error: !combinedPassed
          ? presetMatch.failedReason ??
            t(
              'flow_builder.mastershop.webhook.test_filters_failed_reason',
              'Additional filters did not pass'
            )
          : httpResponse && httpResponse.statusCode >= 400
            ? t('flow_builder.webhook_test_http_error', 'HTTP error')
            : undefined,
      });
    } catch (err: unknown) {
      setTestResult({
        error: err instanceof Error ? err.message : t('flow_builder.webhook_test_error', 'Test failed'),
      });
    } finally {
      setIsTesting(false);
    }
  }, [
    samplePayload,
    selectedPresetIds,
    selectedEventIds,
    filterConditions,
    contactMappingStrategy,
    extractField,
    activeUrl,
    t,
    refetchLogsCount,
  ]);

  const strategyLabel =
    contactMappingStrategy === ContactMappingStrategy.EXTRACT
      ? t('flow_builder.mastershop.webhook.contact_extract', 'Extract from payload')
      : contactMappingStrategy === ContactMappingStrategy.CREATE
        ? t('flow_builder.mastershop.webhook.contact_create', 'Create new contact')
        : t('flow_builder.mastershop.webhook.contact_system', 'System-level');

  const contactMappingOptions = useMemo(
    () => [
      {
        value: ContactMappingStrategy.EXTRACT,
        label: t('flow_builder.mastershop.webhook.contact_extract', 'Extract from payload'),
      },
      {
        value: ContactMappingStrategy.CREATE,
        label: t('flow_builder.mastershop.webhook.contact_create', 'Create new contact'),
      },
      {
        value: ContactMappingStrategy.SYSTEM,
        label: t('flow_builder.mastershop.webhook.contact_system', 'System-level'),
      },
    ],
    [t]
  );

  const isReady = !!activeUrl && selectedPresetIds.length > 0;

  return (
    <div
      className={cn(
        'node-mastershop-webhook-trigger rounded-lg bg-card border border-purple-500/60 shadow-sm group transition-[max-width,min-width,padding] duration-200',
        isExpanded ? 'p-3 min-w-[440px] max-w-[580px]' : 'p-2 min-w-[220px] max-w-[300px]'
      )}
    >
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <Dialog>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10" aria-label="Help">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <DialogContent data-tour="components-flow-builder-mastershopwebhooktriggernode.dialogcontent.flow_builder.mastershop.icon_alt" className="max-w-3xl max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <img
                      src={MASTER_SHOP_FLOW_NODE_ICON_SRC}
                      alt={t('flow_builder.mastershop.icon_alt', 'Master Shop logo')}
                      className="h-5 w-5"
                    />
                    {t(
                      'flow_builder.mastershop.webhook.help_dialog_title',
                      'Master Shop Webhook Trigger — Help'
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {t(
                      'flow_builder.mastershop.webhook.help_dialog_description',
                      'Mastershop order webhooks via the shared webhook pipeline'
                    )}
                  </DialogDescription>
                </DialogHeader>
                <MasterShopWebhookHelpContent t={t} />
              </DialogContent>
            </Dialog>
            <TooltipContent>
              <p className="text-xs">
                {t('flow_builder.mastershop.webhook.help_tooltip', 'Mastershop webhook documentation')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {onDuplicateNode && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicateNode(id)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDeleteNode && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDeleteNode(id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className={cn('font-medium flex items-center gap-2 flex-wrap', isExpanded ? 'mb-2' : 'mb-1.5')}>
        <img
          src={MASTER_SHOP_FLOW_NODE_ICON_SRC}
          alt={t('flow_builder.mastershop.icon_alt', 'Master Shop logo')}
          className="h-4 w-4"
        />
        <span>
          {t(
            'flow_builder.node_types.mastershop_webhook_trigger',
            data.label || 'Master Shop Webhook Trigger'
          )}
        </span>
        <Badge variant={isReady ? 'default' : 'secondary'} className="text-[9px] px-1 py-0">
          {isReady
            ? t('flow_builder.mastershop.webhook.badge_ready', 'Ready')
            : t('flow_builder.mastershop.webhook.badge_setup', 'Setup')}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {flowId && (
            <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.mastershop.webhook.logs" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setLogsModalOpen(true)}>
              <List className="h-3.5 w-3.5" />
              {t('flow_builder.mastershop.webhook.logs', 'Logs')}
              {logsCount > 0 && (
                <span className="bg-primary/20 text-primary rounded-full px-1.5 min-w-[18px] text-[10px]">
                  {logsCount > 99 ? '99+' : logsCount}
                </span>
              )}
            </Button>
          )}
          <button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.common.hide" type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <EyeOff className="h-3.5 w-3.5 inline" /> : <Eye className="h-3.5 w-3.5 inline" />}
            {isExpanded ? t('common.hide', 'Hide') : t('common.edit', 'Edit')}
          </button>
        </div>
      </div>

      {flowId && (
        <WebhookLogsModal
          isOpen={logsModalOpen}
          onClose={() => {
            setLogsModalOpen(false);
            refetchLogsCount();
          }}
          flowId={flowId}
        />
      )}

      {!isExpanded && (
        <div className="text-sm rounded border border-border space-y-1 p-1.5">
          <div className="font-mono text-xs truncate text-muted-foreground" title={activeUrl || undefined}>
            {activeUrl ||
              t('flow_builder.mastershop.webhook.save_flow_collapsed', 'Save flow to get URL')}
          </div>
          <div className="flex flex-wrap gap-1 text-[10px]">
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {t('flow_builder.mastershop.webhook.events_badge', '{{count}} events', {
                count: selectedEventIds.length,
              })}
            </Badge>
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {responseMode === ResponseMode.ASYNC
                ? t('flow_builder.mastershop.webhook.response_async', 'Async')
                : t('flow_builder.mastershop.webhook.response_sync', 'Sync')}
            </Badge>
            {filterConditions.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {t('flow_builder.mastershop.webhook.filters_badge', '+{{count}} filters', {
                  count: filterConditions.length,
                })}
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {strategyLabel}
            </Badge>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="mt-3 text-xs space-y-3 p-2 border rounded">
          {/* Webhook URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <Label className="text-primary font-medium">
                {t('flow_builder.mastershop.webhook.webhook_url', 'Webhook URL')}
              </Label>
              {activeUrl && <CheckCircle className="h-3.5 w-3.5 text-primary" />}
            </div>
            {flowId ? (
              <>
                <div className="flex items-center gap-1">
                  <code className="flex-1 text-[10px] bg-muted px-1.5 py-0.5 rounded truncate">{autoGeneratedUrl}</code>
                  <Button variant="ghost" size="sm" className="h-6 shrink-0" onClick={handleCopyUrl} disabled={!autoGeneratedUrl}>
                    {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="ms-use-custom-path" checked={useCustomPath} onCheckedChange={setUseCustomPath} />
                  <Label htmlFor="ms-use-custom-path" className="font-normal">
                    {t('flow_builder.mastershop.webhook.use_custom_path', 'Use custom path')}
                  </Label>
                </div>
                {useCustomPath && (
                  <div>
                    <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.flow_builder.mastershop.webhook.custom_path_placeholder"
                      placeholder={t(
                        'flow_builder.mastershop.webhook.custom_path_placeholder',
                        'mastershop-orders'
                      )}
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      className={cn('font-mono text-xs', customPathError && 'border-destructive')}
                    />
                    {customPathError && <p className="text-[10px] text-destructive mt-0.5">{customPathError}</p>}
                  </div>
                )}
                <code className="block text-[10px] bg-muted px-1 py-0.5 rounded truncate">{activeUrl || '—'}</code>
                <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.mastershop.webhook.regenerate_token" variant="outline" size="sm" className="h-7 text-xs" onClick={handleRegenerateToken}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {t('flow_builder.mastershop.webhook.regenerate_token', 'Regenerate token')}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground text-[10px]">
                {t(
                  'flow_builder.mastershop.webhook.save_flow_for_url',
                  'Save the flow to generate webhook URL'
                )}
              </p>
            )}
          </div>

          <Separator />

          {/* Event presets */}
          <Collapsible open={presetsExpanded} onOpenChange={setPresetsExpanded}>
            <CollapsibleTrigger className="flex items-center gap-1 font-medium text-primary w-full text-[10px] justify-between hover:bg-muted/50 rounded p-1">
              <span>
                {t('flow_builder.mastershop.webhook.event_presets', 'Mastershop event presets ({{count}})', {
                  count: selectedEventIds.length,
                })}
              </span>
              {presetsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="flex gap-2">
                <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.mastershop.webhook.select_all" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllPresets}>
                  {t('flow_builder.mastershop.webhook.select_all', 'Select all')}
                </Button>
                <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.mastershop.webhook.clear_all"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => syncPresetSelection([], [])}
                >
                  {t('flow_builder.mastershop.webhook.clear_all', 'Clear all')}
                </Button>
              </div>
              {presetsByCategory.map(({ category, label, presets }) => (
                <div key={category} className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
                  {presets.map((preset) => (
                    <label key={preset.presetId} className="flex items-start gap-2 cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-3 h-3"
                        checked={selectedPresetIds.includes(preset.presetId)}
                        onChange={(e) => togglePreset(preset.presetId, preset.eventId, e.target.checked)}
                      />
                      <span className="text-[11px]">
                        <span className="font-medium">
                          {labels.webhookPresetLabel(preset.presetId, preset.label)}
                        </span>
                        <span className="text-muted-foreground ml-1">(#{preset.eventId})</span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {/* Preset filter chips (read-only) */}
          {activePresetFilterChips.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                {t(
                  'flow_builder.mastershop.webhook.preset_match_rules',
                  'Preset match rules (read-only)'
                )}
              </Label>
              <div className="flex flex-wrap gap-1">
                {activePresetFilterChips.slice(0, 12).map((chip) => (
                  <Badge key={chip} variant="secondary" className="text-[9px] font-normal">
                    {chip}
                  </Badge>
                ))}
                {activePresetFilterChips.length > 12 && (
                  <Badge variant="outline" className="text-[9px]">
                    {t('flow_builder.mastershop.webhook.more_rules', '+{{count}} more', {
                      count: activePresetFilterChips.length - 12,
                    })}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Additional filters */}
          <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded}>
            <CollapsibleTrigger className="flex items-center gap-1 font-medium text-primary w-full text-[10px] justify-between hover:bg-muted/50 rounded p-1">
              <span className="flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" />
                {t(
                  'flow_builder.mastershop.webhook.additional_filters',
                  'Additional filters ({{count}})',
                  { count: filterConditions.length }
                )}
              </span>
              {filtersExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                {t(
                  'flow_builder.mastershop.webhook.additional_filters_hint',
                  'Optional AND filters applied after Mastershop preset matching.'
                )}
              </p>
              {filterConditions.map((fc, index) => (
                <div key={index} className="flex flex-wrap gap-1 p-1.5 border rounded bg-muted/30">
                  <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.flow_builder.mastershop.webhook.filter_field_placeholder"
                    placeholder={t(
                      'flow_builder.mastershop.webhook.filter_field_placeholder',
                      'field.path'
                    )}
                    value={fc.fieldPath}
                    onChange={(e) => updateFilter(index, { fieldPath: e.target.value })}
                    className="font-mono flex-1 min-w-[80px] text-xs h-7"
                  />
                  <Select value={fc.operator} onValueChange={(v) => updateFilter(index, { operator: v as FilterOperator })}>
                    <SelectTrigger className="w-[100px] h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filterOperatorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!VALUE_LESS_OPERATORS.includes(fc.operator) && (
                    <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.flow_builder.mastershop.webhook.filter_value_placeholder"
                      placeholder={t(
                        'flow_builder.mastershop.webhook.filter_value_placeholder',
                        'Value'
                      )}
                      value={fc.value !== undefined ? String(fc.value) : ''}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      className="w-20 text-xs h-7"
                    />
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFilter(index)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.mastershop.webhook.add_filter" variant="outline" size="sm" className="h-7 text-xs" onClick={addFilter}>
                <Plus className="h-3 w-3 mr-1" />
                {t('flow_builder.mastershop.webhook.add_filter', 'Add filter')}
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Contact mapping */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-primary" />
              <Label className="text-primary font-medium">
                {t('flow_builder.mastershop.webhook.contact_mapping', 'Contact mapping')}
              </Label>
            </div>
            {contactMappingOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.ms-contact-strategy"
                  type="radio"
                  name="ms-contact-strategy"
                  checked={contactMappingStrategy === opt.value}
                  onChange={() => setContactMappingStrategy(opt.value)}
                  className="w-3 h-3"
                />
                <span className="text-[11px]">{opt.label}</span>
              </label>
            ))}
            {contactMappingStrategy === ContactMappingStrategy.EXTRACT && (
              <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.extractField"
                placeholder="customer.email"
                value={extractField}
                onChange={(e) => setExtractField(e.target.value)}
                className="font-mono text-xs h-7"
              />
            )}
            {contactMappingStrategy === ContactMappingStrategy.CREATE && (
              <div className="space-y-1">
                <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.createNameField" placeholder="customer.full_name" value={createNameField} onChange={(e) => setCreateNameField(e.target.value)} className="font-mono text-xs h-7" />
                <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.createEmailField" placeholder="customer.email" value={createEmailField} onChange={(e) => setCreateEmailField(e.target.value)} className="font-mono text-xs h-7" />
                <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.createPhoneField" placeholder="customer.phone" value={createPhoneField} onChange={(e) => setCreatePhoneField(e.target.value)} className="font-mono text-xs h-7" />
              </div>
            )}
          </div>

          <Separator />

          {/* Response config */}
          <Collapsible open={responseConfigExpanded} onOpenChange={setResponseConfigExpanded}>
            <CollapsibleTrigger className="flex items-center gap-1 font-medium text-primary w-full text-[10px] justify-between hover:bg-muted/50 rounded p-1">
              <span className="flex items-center gap-1">
                <Settings className="h-3.5 w-3.5" />
                {t('flow_builder.mastershop.webhook.response_config', 'Response configuration')}
              </span>
              {responseConfigExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <Select
                value={String(responseStatusCode)}
                onValueChange={(v) => setResponseStatusCode(Number(v))}
              >
                <SelectTrigger className="h-7 text-xs">
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
              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-[10px]">
                  <input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.flow_builder.mastershop.webhook.response_async"
                    type="radio"
                    checked={responseMode === ResponseMode.ASYNC}
                    onChange={() => setResponseMode(ResponseMode.ASYNC)}
                    className="w-3 h-3"
                  />
                  {t('flow_builder.mastershop.webhook.response_async', 'Async')}
                </label>
                <label className="flex items-center gap-1 text-[10px]">
                  <input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.flow_builder.mastershop.webhook.response_sync"
                    type="radio"
                    checked={responseMode === ResponseMode.SYNC}
                    onChange={() => setResponseMode(ResponseMode.SYNC)}
                    className="w-3 h-3"
                  />
                  {t('flow_builder.mastershop.webhook.response_sync', 'Sync')}
                </label>
              </div>
              {responseMode === ResponseMode.SYNC && (
                <div className="flex items-center gap-2">
                  <Label className="text-[10px]">
                    {t('flow_builder.mastershop.webhook.response_timeout', 'Timeout (s)')}
                  </Label>
                  <NumberInput value={responseTimeout} onChange={setResponseTimeout} min={1} max={120} className="h-7 w-20" />
                </div>
              )}
              <Select
                value=""
                onValueChange={(templateId) => {
                  const tmpl = WEBHOOK_RESPONSE_TEMPLATES.find((x) => x.id === templateId);
                  if (tmpl?.config.bodyTemplate) setResponseBodyTemplate(tmpl.config.bodyTemplate);
                  if (tmpl?.config.statusCode) setResponseStatusCode(tmpl.config.statusCode);
                  if (tmpl?.config.mode) setResponseMode(tmpl.config.mode);
                  if (tmpl?.config.headers && Object.keys(tmpl.config.headers).length) {
                    setResponseHeaders(
                      Object.entries(tmpl.config.headers).map(([key, value]) => ({
                        key,
                        value: String(value),
                      }))
                    );
                  }
                }}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopwebhooktriggernode.selecttrigger.flow_builder.mastershop.webhook.apply_template_placeholder" className="h-7 text-xs">
                  <SelectValue
                    placeholder={t(
                      'flow_builder.mastershop.webhook.apply_template_placeholder',
                      'Apply template…'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {WEBHOOK_RESPONSE_TEMPLATES.map((tmpl) => (
                    <SelectItem key={tmpl.id} value={tmpl.id} className="text-xs">
                      {labels.webhookResponseTemplateName(tmpl.id, tmpl.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea data-tour="components-flow-builder-mastershopwebhooktriggernode.textarea.responseBodyTemplate"
                value={responseBodyTemplate}
                onChange={(e) => setResponseBodyTemplate(e.target.value)}
                className="font-mono text-[10px] min-h-[80px]"
              />
              <div>
                <Label className="text-[10px] block mb-0.5">
                  {t('flow_builder.webhook_response_headers', 'Response Headers')}
                </Label>
                <p className="text-[10px] text-muted-foreground mb-1">
                  {t(
                    'flow_builder.webhook_headers_help',
                    "Custom HTTP headers to include in response. Example: 'X-Request-ID' with value '{{webhook.requestId}}'"
                  )}
                </p>
                {responseHeaders.map((h, idx) => (
                  <div key={idx} className="flex gap-1 mb-1">
                    <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.h.key"
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
                    <Input data-tour="components-flow-builder-mastershopwebhooktriggernode.input.flow_builder.mastershop.webhook.filter_value_placeholder"
                      placeholder={t(
                        'flow_builder.mastershop.webhook.filter_value_placeholder',
                        'Value'
                      )}
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
                    <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.common.remove"
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
                <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.webhook_add_header"
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

          <Separator />

          {/* Test webhook */}
          <Collapsible open={testSectionExpanded} onOpenChange={setTestSectionExpanded}>
            <CollapsibleTrigger className="flex items-center gap-1 font-medium text-primary w-full text-[10px] justify-between hover:bg-muted/50 rounded p-1">
              <span className="flex items-center gap-1">
                <Play className="h-3.5 w-3.5" />
                {t('flow_builder.mastershop.webhook.test_webhook', 'Test webhook')}
              </span>
              {testSectionExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <Select
                value={selectedSampleId}
                onValueChange={(sampleId) => {
                  setSelectedSampleId(sampleId);
                  const sample = MASTERSHOP_SAMPLES.find((s) => s.id === sampleId);
                  if (sample) setSamplePayload(JSON.stringify(sample.payload, null, 2));
                }}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopwebhooktriggernode.selecttrigger.flow_builder.mastershop.webhook.sample_payload_placeholder" className="h-7 text-xs">
                  <SelectValue
                    placeholder={t(
                      'flow_builder.mastershop.webhook.sample_payload_placeholder',
                      'Mastershop sample payload'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {MASTERSHOP_SAMPLES.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {labels.webhookSampleName(s.id, s.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea data-tour="components-flow-builder-mastershopwebhooktriggernode.textarea.samplePayload"
                value={samplePayload}
                onChange={(e) => setSamplePayload(e.target.value)}
                className="font-mono text-[10px] min-h-[120px]"
              />
              <Button data-tour="components-flow-builder-mastershopwebhooktriggernode.button.flow_builder.mastershop.webhook.run_test" size="sm" className="h-7 text-xs" onClick={runTest} disabled={isTesting}>
                {isTesting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                {t('flow_builder.mastershop.webhook.run_test', 'Run test')}
              </Button>
              {showTestResult && testResult && (
                <div className="rounded border p-2 space-y-1 bg-muted/20 text-[10px]">
                  {testResult.error && <p className="text-destructive">{testResult.error}</p>}
                  {testResult.presetMatch && (
                    <p>
                      {t('flow_builder.mastershop.webhook.test_presets', 'Presets:')}{' '}
                      {testResult.presetMatch.passed
                        ? t('flow_builder.mastershop.webhook.test_presets_matched', 'matched {{ids}}', {
                            ids: testResult.presetMatch.matchedPresetIds.join(', '),
                          })
                        : testResult.presetMatch.failedReason}
                    </p>
                  )}
                  {testResult.filterResults && (
                    <p>
                      {t('flow_builder.mastershop.webhook.test_filters', 'Additional filters:')}{' '}
                      {testResult.filterResults.passed
                        ? t('flow_builder.mastershop.webhook.test_filters_passed', 'passed')
                        : t('flow_builder.mastershop.webhook.test_filters_failed', 'failed')}{' '}
                      (
                      {testResult.filterResults.evaluatedConditions.filter((c) => c.result).length}/
                      {testResult.filterResults.evaluatedConditions.length})
                    </p>
                  )}
                  {testResult.httpResponse && (
                    <p>
                      {t('flow_builder.mastershop.webhook.test_http', 'HTTP {{code}} ({{ms}}ms)', {
                        code: testResult.httpResponse.statusCode,
                        ms: testResult.httpResponse.durationMs,
                      })}
                    </p>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Variables quick reference */}
          <div className="rounded border p-2 bg-muted/10">
            <p className="text-[10px] font-medium mb-1">
              {t('flow_builder.mastershop.webhook.available_variables', 'Available variables')}
            </p>
            <p className="text-[10px] text-muted-foreground mb-1">
              {t(
                'flow_builder.mastershop.webhook.variables_hint',
                'webhook.payload.* · mastershop.webhook.*'
              )}
            </p>
            <div className="max-h-24 overflow-y-auto">
              {MASTERSHOP_VARIABLE_TABLE.map((row) => (
                <div key={row.variable} className="font-mono text-[9px] text-muted-foreground">
                  {row.variable}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={standardHandleStyle} isConnectable={isConnectable} />
    </div>
  );
}
