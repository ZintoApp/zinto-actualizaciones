import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useOpenRouterModels, type ProcessedModel } from '@/services/openrouter';
import { useAzureDeploymentsQuery } from '@/services/azure';
import { DEFAULT_AZURE_OPENAI_API_VERSION, getOpenAiModelCapabilities, pickPreferredAzureChatModel, uniqueAzureDeploymentCatalog } from '@shared/ai-providers';
import { Trash2, Info, Settings, RefreshCw, Plus, ChevronDown, ChevronRight, GripVertical, Eye, EyeOff, Clock, Calendar as CalendarIcon, CheckCircle, AlertCircle, AlertTriangle, LogOut, ExternalLink, Key, Building, Shield, BookOpen, Target, HelpCircle, X, Lightbulb, GitBranch, Sparkles, WandSparkles, Mic, RotateCcw, User, Users, Send, Loader2, Bot, Layers, Pencil, ImageIcon, Package } from 'lucide-react';
import { AiProviderIcon, AiProviderOption } from '@/components/ui/ai-provider-icon';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { DEFAULT_RAG_CONFIG, normalizeEmbeddingModel, type VectorDatabaseProvider } from '@shared/rag-defaults';
import {
  AI_ASSISTANT_PROMPT_TEMPLATES,
  isAiAssistantPromptTemplateId,
  type AiAssistantPromptTemplateId,
} from '@shared/ai-assistant-prompt-templates';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, dialogCloseButtonClassName, DialogContent } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Slider } from "@/components/ui/slider";
import { TimezoneSelector } from "@/components/ui/TimezoneSelector";
import { mcpToolInputHandleStyle, calendarBookingCompletedSourceHandleStyle, standardHandleStyle } from './StyledHandle';
import {
  AI_CALENDAR_BOOKING_COMPLETED_HANDLE_ID,
  AI_TOOL_INPUT_HANDLE_ID,
  AI_VARIABLES_COMPLETE_HANDLE_ID,
  FLOW_DEFAULT_TARGET_HANDLE_ID,
} from './flowHandleIds';
import { EnhancedVariablePicker, type EnhancedVariablePickerHandle } from './EnhancedVariablePicker';
import {
  BASE_VARIABLE_VALUE_SET,
  getFlowNodeVariablesFromNodes,
  getFlowVariableNamesExcludingNode,
  useFlowVariables,
} from '@/hooks/useFlowVariables';
import { useGoogleCalendarAuth } from '@/hooks/useGoogleCalendarAuth';
import { googleCalendarAuth, type GoogleCalendarListItem } from '@/services/googleCalendarAuth';
import { useZohoCalendarAuth } from '@/hooks/useZohoCalendarAuth';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { DocumentList } from "@/components/knowledge-base/DocumentList";
import { RAGConfiguration, type RAGConfig } from "@/components/knowledge-base/RAGConfiguration";
import { WeeklyScheduleEditor } from './WeeklyScheduleEditor';
import { CalendarOfferingReminderSettings } from './CalendarOfferingReminderSettings';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type {
  DaySchedule,
  CalendarAdvancedSettings,
  CalendarOfferingSettings,
  CalendarReminderSettings,
} from '@shared/types/calendar-types';
import type { MCPToolDiscoverySummary } from '@shared/types/mcp';
import {
  ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
  ERP_PRODUCT_IMAGE_CAPTION_MODE_VALUES,
  ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
  ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MAX,
  ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MIN,
  ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
  ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_VALUES,
  ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
  ERP_PRODUCT_IMAGE_SEND_WHEN_VALUES,
  ERP_PRICE_INQUIRY_RESPONSE_DEFAULT,
  type AiAssistantKnowledgeBaseConfig,
  type AiAssistantNodeData,
  type AiAssistantCustomFieldBinding,
  type AiAssistantCustomFieldMode,
  type AiAssistantTaskDefinition,
  type AiAssistantTaskGroup,
  type ErpProductImageCaptionMode,
  type ErpProductImageMultiMatchMode,
  type ErpProductImageSendWhen,
} from '@shared/types/node-types';

const [
  ERP_SEND_WHEN_SINGLE_PRODUCT_RECOMMENDATION,
  ERP_SEND_WHEN_PRODUCT_SEARCH_RESULTS,
  ERP_SEND_WHEN_EXPLICIT_REQUEST_ONLY,
  ERP_SEND_WHEN_MENU_CATALOG_REPLIES,
] = ERP_PRODUCT_IMAGE_SEND_WHEN_VALUES;

const [
  ERP_MULTI_MATCH_FIRST_MATCH_ONLY,
  ERP_MULTI_MATCH_UP_TO_THREE,
  ERP_MULTI_MATCH_EVERY_MATCH,
  ERP_MULTI_MATCH_TEXT_ONLY,
] = ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_VALUES;

const [
  ERP_CAPTION_MODE_FIRST_ONLY,
  ERP_CAPTION_MODE_EVERY_IMAGE,
  ERP_CAPTION_MODE_NONE,
] = ERP_PRODUCT_IMAGE_CAPTION_MODE_VALUES;
import {
  assignmentStrategyForPersistence,
  AI_ASSISTANT_DEFAULT_MODEL,
  AI_ASSISTANT_DEFAULT_HISTORY_LIMIT,
  AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL,
  normalizeAiAssistantNodeData,
  normalizeAssignmentStrategyForDisplay,
  normalizeElevenLabsModel,
} from '@shared/types/normalize-ai-assistant-node-data';
import {
  extractAiAssistantPlaceholderNames,
  syncAiAssistantVariables,
} from '@shared/ai-assistant-variables';
import type { AiAssistantVariableDefinition } from '@shared/types/node-types';
import { customFieldVariablePath } from '@shared/ai-assistant-custom-fields';
import { getPromptPlaceholderRanges } from '@shared/prompt-placeholder-navigation';
import { DEFAULT_WEEKLY_SCHEDULE, createDefaultScheduleFromHours, createDefaultOfferingSettings, createDefaultReminderSettings } from '@shared/types/calendar-types';
interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string; underlyingModel?: string; supportsTools?: boolean; supportsImage?: boolean }[];
}

type CompanyCustomField = {
  id: number;
  entity: 'contact' | 'deal';
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  required?: boolean;
};

function PromptPlaceholderNavigationButton({
  enabled,
  label,
  tooltip,
  unavailableTooltip,
  onNavigate,
  className,
  children,
}: {
  enabled: boolean;
  label: string;
  tooltip: string;
  unavailableTooltip: string;
  onNavigate: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-disabled={!enabled}
            tabIndex={enabled ? 0 : -1}
            onClick={enabled ? onNavigate : undefined}
            className={cn(
              'rounded-sm text-left outline-none transition-colors',
              enabled
                ? 'cursor-pointer hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1'
                : 'cursor-default',
              className,
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{enabled ? tooltip : unavailableTooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const CUSTOM_OPENAI_MODEL_VALUE = '__custom_openai_model__';

/** OpenAI chat models with AI SDK tool support (valid model IDs only) */
const OPENAI_MODELS = [
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', supportsTools: true, supportsImage: true },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', supportsTools: true, supportsImage: true },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', supportsTools: true, supportsImage: true },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', supportsTools: true, supportsImage: true },
  { id: 'gpt-5.4', name: 'GPT-5.4', supportsTools: true, supportsImage: true },
  { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', supportsTools: true, supportsImage: true },
  { id: 'gpt-5.1', name: 'GPT-5.1', supportsTools: true, supportsImage: true },
  { id: 'gpt-5-chat', name: 'GPT-5 Chat', supportsTools: true, supportsImage: true },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', supportsTools: true, supportsImage: true },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', supportsTools: true, supportsImage: true },
  { id: 'gpt-4o', name: 'GPT-4o', supportsTools: true, supportsImage: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsTools: true, supportsImage: true },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', supportsTools: true, supportsImage: true },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', supportsTools: true, supportsImage: false }
];

const RAG_PREFERRED_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  azure: 'gpt-5-mini',
};

/** OpenRouter fallback when /api/openrouter/models is unavailable; valid tool-capable models only */
const FALLBACK_OPENROUTER_MODELS = [
  { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4 (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1 (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-5-chat', name: 'GPT-5 Chat (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (via OpenRouter)', supportsTools: true, supportsImage: true },
  { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo (via OpenRouter)', supportsTools: true, supportsImage: false },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B (via OpenRouter)', supportsTools: true, supportsImage: false },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1 (via OpenRouter)', supportsTools: true, supportsImage: false },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast (xAI)', supportsTools: true, supportsImage: true },
  { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast (xAI)', supportsTools: true, supportsImage: true },
  { id: 'x-ai/grok-4', name: 'Grok 4 (xAI)', supportsTools: true, supportsImage: true },
  { id: 'x-ai/grok-3-mini', name: 'Grok 3 Mini (xAI)', supportsTools: true, supportsImage: false },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo (via OpenRouter)', supportsTools: true, supportsImage: false }
];

/**
 * Hook to get AI providers with dynamic OpenRouter models
 */
function useAIProviders(): {
  providers: Provider[];
  isLoading: boolean;
  error: Error | null;
  azureEmbeddingDeployments: Array<{ id: string; name: string; underlyingModel: string }>;
} {
  const openRouterQuery = useQuery(useOpenRouterModels());
  const azureQuery = useAzureDeploymentsQuery(true);

  const azureModels = uniqueAzureDeploymentCatalog(azureQuery.data ?? [])
    .filter((item) => item.kind === 'chat')
    .map((item) => ({
      id: item.id,
      name: item.underlyingModel && item.underlyingModel !== item.id
        ? `${item.name} (${item.underlyingModel})`
        : item.name,
      underlyingModel: item.underlyingModel,
      supportsTools: item.supportsTools,
      supportsImage: item.supportsImage,
    }));

  const azureEmbeddingDeployments = uniqueAzureDeploymentCatalog(azureQuery.data ?? [])
    .filter((item) => item.kind === 'embedding')
    .map((item) => ({
      id: item.id,
      name: item.underlyingModel && item.underlyingModel !== item.id
        ? `${item.name} (${item.underlyingModel})`
        : item.name,
      underlyingModel: item.underlyingModel || item.id,
    }));

  const providers: Provider[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      models: OPENAI_MODELS
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      models: openRouterQuery.data
        ? openRouterQuery.data.map(model => ({
            id: model.id,
            name: model.name,
            supportsTools: model.supportsTools,
            supportsImage: model.supportsImage
          }))
        : FALLBACK_OPENROUTER_MODELS
    },
    {
      id: 'azure',
      name: 'Azure OpenAI',
      models: azureModels
    }
  ];

  return {
    providers,
    isLoading: openRouterQuery.isLoading || azureQuery.isLoading,
    error: (openRouterQuery.error || azureQuery.error) as Error | null,
    azureEmbeddingDeployments,
  };
}

function pickPreferredAiAssistantAzureChatModel(models: Provider['models']): string {
  const lunaDeployment = models.find((entry) =>
    entry.id.toLowerCase() === AI_ASSISTANT_DEFAULT_MODEL ||
    entry.underlyingModel?.toLowerCase() === AI_ASSISTANT_DEFAULT_MODEL
  );
  return lunaDeployment?.id ?? pickPreferredAzureChatModel(models);
}

/** Droppable id for tasks with no group (or stale group id). */
const TASK_GROUP_DROPPABLE_UNGROUPED = 'task-group-ungrouped';

function taskBucketDroppableId(bucketKey: string): string {
  return bucketKey === 'ungrouped' ? TASK_GROUP_DROPPABLE_UNGROUPED : `task-group-${bucketKey}`;
}

function droppableIdToTaskBucketKey(droppableId: string): string {
  if (droppableId === TASK_GROUP_DROPPABLE_UNGROUPED) return 'ungrouped';
  if (droppableId.startsWith('task-group-')) return droppableId.slice('task-group-'.length);
  return 'ungrouped';
}

const TASK_SELECT_UNGROUPED_VALUE = '__task_ungrouped__';

function taskBelongsToBucket(
  task: TaskDefinition,
  bucketKey: string,
  taskGroups: TaskGroup[]
): boolean {
  const valid = new Set(taskGroups.map((g) => g.id));
  if (bucketKey === 'ungrouped') {
    return !task.groupId || !valid.has(task.groupId);
  }
  return task.groupId === bucketKey;
}

interface BucketEntry {
  key: string;
  ids: string[];
}

function getTaskBucketStructure(tasks: TaskDefinition[], taskGroups: TaskGroup[]): BucketEntry[] {
  const keys: string[] = [...taskGroups.map((g) => g.id), 'ungrouped'];
  return keys.map((key) => ({
    key,
    ids: tasks.filter((t) => taskBelongsToBucket(t, key, taskGroups)).map((t) => t.id),
  }));
}

function normalizeBookableAgentUserIds(value: unknown): number[] {
  let rawValues: unknown[] = [];
  if (Array.isArray(value)) {
    rawValues = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed = JSON.parse(value);
      rawValues = Array.isArray(parsed) ? parsed : [];
    } catch {
      rawValues = [];
    }
  }
  const ids = rawValues
    .map((id) => {
      if (typeof id === 'number') return id;
      if (typeof id === 'string' && id.trim() !== '') return Number.parseInt(id, 10);
      return Number.NaN;
    })
    .filter((id) => Number.isInteger(id) && id > 0);

  return Array.from(new Set(ids));
}

function rebuildTasksFromBuckets(
  bucketIds: Map<string, string[]>,
  bucketOrder: BucketEntry[],
  tasks: TaskDefinition[],
  movedTaskId: string,
  newGroupId: string | null
): TaskDefinition[] {
  const idToTask = new Map(tasks.map((t) => [t.id, { ...t }]));
  const moved = idToTask.get(movedTaskId);
  if (moved) moved.groupId = newGroupId;
  const out: TaskDefinition[] = [];
  for (const { key } of bucketOrder) {
    for (const taskId of bucketIds.get(key) ?? []) {
      const task = idToTask.get(taskId);
      if (task) out.push(task);
    }
  }
  return out;
}

type TaskGroup = AiAssistantTaskGroup;
type TaskDefinition = AiAssistantTaskDefinition;

interface TaskConfigurationCardProps {
  task: TaskDefinition;
  index: number;
  tasks: TaskDefinition[];
  taskGroups: TaskGroup[];
  onUpdate: (updates: Partial<TaskDefinition>) => void;
  onRemove: () => void;
  t: (key: string, fallback?: string, params?: Record<string, unknown>) => string;
  dragHandleProps?: any;
}

function TaskExecutionHelpContent() {
  const { t } = useTranslation();

  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Section 1: Feature Overview */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_overview_title', 'What is Task Execution?')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              {t('flow_builder.ai_task_execution_help_overview_content', 'Task execution enables AI SDK tools, allowing the assistant to trigger specific actions and route conversations to different flow paths based on user intent.')}
            </p>
            <p className="text-sm text-foreground">
              {t('flow_builder.ai_task_execution_help_overview_benefits', 'Key benefits: dynamic routing, automated actions, context-aware responses, and integration with external systems.')}
            </p>
          </div>
        </section>

        {/* Section 2: When to Use Task Execution */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_usecases_title', 'Use Cases')}
          </h3>
          <div className="space-y-2">
            <ul className="text-sm text-foreground list-disc list-inside space-y-1">
              <li>{t('flow_builder.ai_task_execution_help_usecase_1', 'Sharing documents/brochures when users request specific information')}</li>
              <li>{t('flow_builder.ai_task_execution_help_usecase_2', 'Booking appointments or scheduling callbacks')}</li>
              <li>{t('flow_builder.ai_task_execution_help_usecase_3', 'Collecting structured data through conversational forms')}</li>
              <li>{t('flow_builder.ai_task_execution_help_usecase_4', 'Routing to different flow paths based on user intent')}</li>
              <li>{t('flow_builder.ai_task_execution_help_usecase_5', 'Triggering external API calls or webhooks')}</li>
            </ul>
          </div>
        </section>

        {/* Section 3: Task Configuration Fields */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_config_title', 'Configuration Fields')}
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.ai_task_execution_help_field_task_name', 'Task Name')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_task_execution_help_field_task_name_desc', 'User-friendly name for identification')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.ai_task_execution_help_field_function_name', 'Function Name')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_task_execution_help_field_function_name_desc', 'Technical identifier (lowercase, underscores only) exposed as an AI SDK tool')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.ai_task_execution_help_field_ai_description', 'AI Function Description')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_task_execution_help_field_ai_description_desc', 'Critical field - detailed instructions for when the assistant should call this tool. Emphasize specificity to prevent false triggers.')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.ai_task_execution_help_field_output_handle', 'Output Handle ID')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_task_execution_help_field_output_handle_desc', 'Unique identifier for the flow connection point')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">{t('flow_builder.ai_task_execution_help_field_enabled', 'Enabled Toggle')}</h4>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_task_execution_help_field_enabled_desc', 'Activate/deactivate without deleting')}</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 4: Best Practices */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_best_practices_title', 'Best Practices')}
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_task_execution_help_best_practice_1', 'Use specific trigger phrases in AI Function Description (e.g., "ONLY call when user explicitly requests...")')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_task_execution_help_best_practice_2', 'Keep function names descriptive but concise')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_task_execution_help_best_practice_3', 'Test tasks thoroughly to avoid false triggers')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_task_execution_help_best_practice_4', 'Use output handles to create clear flow paths')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_task_execution_help_best_practice_5', 'Disable unused tasks instead of deleting them')}</p>
            </div>
          </div>
        </section>

        {/* Section 5: Practical Examples */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_examples_title', 'Examples')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_task_execution_help_example_1_title', 'Example 1: Document sharing task')}</h4>
              <div className="space-y-2 text-xs">
                <div><strong>{t('flow_builder.ai_task_execution_help_example_function', 'Function')}:</strong> share_brochure</div>
                <div><strong>{t('flow_builder.ai_task_execution_help_example_description', 'Description')}:</strong> {t('flow_builder.ai_task_execution_help_example_1_desc', 'Call when user asks for product information or brochure')}</div>
              </div>
            </div>
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_task_execution_help_example_2_title', 'Example 2: Appointment booking task')}</h4>
              <div className="space-y-2 text-xs">
                <div><strong>{t('flow_builder.ai_task_execution_help_example_function', 'Function')}:</strong> book_appointment</div>
                <div><strong>{t('flow_builder.ai_task_execution_help_example_description', 'Description')}:</strong> {t('flow_builder.ai_task_execution_help_example_2_desc', 'Call when user wants to schedule a meeting or appointment')}</div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 6: Flow Integration */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_flow_title', 'Flow Routing')}
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-foreground mb-2">
                {t('flow_builder.ai_task_execution_help_flow_content', 'Each enabled task creates a dynamic output handle. Connect output handles to different flow nodes. The assistant automatically routes to the appropriate path when the tool is called.')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function ErpAutomationHelpContent() {
  const { t } = useTranslation();

  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_erp_help_overview_title', 'ERP Automation')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              {t(
                'flow_builder.ai_erp_help_overview_content',
                'When enabled, the AI can use shared catalog, order, invoice, and notification tools plus the capabilities available in the active ERP mode.'
              )}
            </p>
            <p className="text-sm text-foreground">
              {t(
                'flow_builder.ai_erp_help_overview_benefits',
                'Everything is scoped to the contact in this chat—no manual IDs for customers. Use defaults below for order confirmations and invoice messages when the AI does not pass custom text.'
              )}
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_task_execution_help_usecases_title', 'Use Cases')}
          </h3>
          <ul className="text-sm text-foreground list-disc list-inside space-y-1">
            <li>{t('flow_builder.ai_erp_help_usecase_1', 'Search the catalog and create or update orders and invoices')}</li>
            <li>{t('flow_builder.ai_erp_help_usecase_2', 'Manage this contact’s Restaurant reservations, waitlist, and delivery status')}</li>
            <li>{t('flow_builder.ai_erp_help_usecase_3', 'Manage Dental bookings and request staff review of treatment-plan decisions')}</li>
            <li>{t('flow_builder.ai_erp_help_usecase_4', 'Keep customer and patient access scoped to the current conversation contact')}</li>
          </ul>
        </section>
      </div>
    </ScrollArea>
  );
}

function AudioTagsHelpContent() {
  const { t } = useTranslation();

  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Section 1: Feature Overview */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_audio_tags_help_overview_title', 'What are Audio Tags?')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              {t('flow_builder.ai_audio_tags_help_overview_content', 'Audio tags are square-bracketed commands embedded in text that control voice expression and emotion. They allow you to add excitement, whispers, laughter, and other emotional cues directly in the AI response text.')}
            </p>
            <p className="text-sm text-foreground">
              {t('flow_builder.ai_audio_tags_help_overview_v3', 'These are v3-specific capabilities. Effectiveness varies by voice—test tags with your chosen ElevenLabs voice for best results.')}
            </p>
          </div>
        </section>

        {/* Section 2: Tag Categories */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_audio_tags_help_categories_title', 'Audio Tag Categories')}
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_category_emotions', 'Emotions')}</h4>
              <code className="text-xs block bg-muted px-2 py-1 rounded">[excited] [sad] [angry] [happily] [sorrowful]</code>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_category_delivery', 'Delivery Direction')}</h4>
              <code className="text-xs block bg-muted px-2 py-1 rounded">[whispers] [shouts] [x accent]</code>
              <p className="text-xs text-muted-foreground mt-1">{t('flow_builder.ai_audio_tags_help_category_delivery_desc', 'Volume and energy control')}</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_category_reactions', 'Human Reactions')}</h4>
              <code className="text-xs block bg-muted px-2 py-1 rounded">[laughs] [clears throat] [sighs] [gasps]</code>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_category_sfx', 'Sound Effects')}</h4>
              <code className="text-xs block bg-muted px-2 py-1 rounded">[gunshot] [clapping] [explosion] [door slam]</code>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_category_pacing', 'Pacing & Rhythm')}</h4>
              <code className="text-xs block bg-muted px-2 py-1 rounded">[pause] [rushed] [stammers] [drawn out]</code>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 3: Combining Tags */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_audio_tags_help_advanced_title', 'Advanced Techniques')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              {t('flow_builder.ai_audio_tags_help_advanced_content', 'Combine tags for nuanced performances. Use comma-separated tags within brackets for layered emotional delivery.')}
            </p>
            <p className="text-sm text-foreground mb-2">
              <strong>{t('flow_builder.ai_audio_tags_help_advanced_example', 'Example')}:</strong> <code className="bg-muted px-1 rounded">[excited, whispers]</code> {t('flow_builder.ai_audio_tags_help_advanced_example_desc', 'creates enthusiastic whispering—perfect for sharing a secret with excitement.')}
            </p>
            <p className="text-sm text-foreground">
              {t('flow_builder.ai_audio_tags_help_advanced_combinations', 'Other effective combinations: [sad, whispers] for somber intimacy, [angry, shouts] for intense emphasis.')}
            </p>
          </div>
        </section>

        {/* Section 4: Best Practices */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_audio_tags_help_best_practices_title', 'Best Practices')}
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_audio_tags_help_best_practice_1', 'Use prompts longer than 250 characters for consistency')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_audio_tags_help_best_practice_2', 'Test tags with your chosen voice—effectiveness varies by voice')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_audio_tags_help_best_practice_3', 'Combine tags for nuanced emotional delivery')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_audio_tags_help_best_practice_4', 'Place tags at natural speech boundaries')}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_audio_tags_help_best_practice_5', "Don't overuse tags—maintain natural flow")}</p>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900">
              <p className="text-sm text-foreground">{t('flow_builder.ai_audio_tags_help_best_practice_6', 'Use the Audio Tags Instructions field to guide the AI on when and how to use tags')}</p>
            </div>
          </div>
        </section>

        {/* Section 5: Practical Examples */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_audio_tags_help_examples_title', 'Examples')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_example_1_title', 'Example 1: Customer service')}</h4>
              <p className="text-xs text-foreground mb-1"><code className="bg-muted px-1 rounded">[friendly, professional]</code></p>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_audio_tags_help_example_1_desc', 'Warm, approachable tone for support interactions')}</p>
            </div>
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_example_2_title', 'Example 2: Storytelling')}</h4>
              <p className="text-xs text-foreground mb-1"><code className="bg-muted px-1 rounded">[whispers]</code> ... <code className="bg-muted px-1 rounded">[excited]</code> ... <code className="bg-muted px-1 rounded">[pause]</code></p>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_audio_tags_help_example_2_desc', 'Build tension with whispers, peak with excitement, pause for dramatic effect')}</p>
            </div>
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_example_3_title', 'Example 3: Educational content')}</h4>
              <p className="text-xs text-foreground mb-1"><code className="bg-muted px-1 rounded">[clear, enthusiastic]</code></p>
              <p className="text-xs text-muted-foreground">{t('flow_builder.ai_audio_tags_help_example_3_desc', 'Engaging delivery for tutorials and explanations')}</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 6: Integration Tips */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            {t('flow_builder.ai_audio_tags_help_integration_title', 'Integration with AI Assistant')}
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-foreground mb-2">
                {t('flow_builder.ai_audio_tags_help_integration_content', 'The Audio Tags Instructions field guides the AI on when and how to embed audio tags in its responses. Write clear, specific instructions for best results.')}
              </p>
              <p className="text-sm text-foreground mb-2">
                {t('flow_builder.ai_audio_tags_help_integration_example_label', 'Example instruction')}:
              </p>
              <p className="text-sm text-foreground bg-muted/50 p-3 rounded border">
                {t('flow_builder.ai_audio_tags_help_integration_example', 'Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points')}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">{t('flow_builder.ai_audio_tags_help_flow_title', 'Data Flow')}</h4>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`User → AI Assistant → ElevenLabs v3 → User
(Generates response with tags) (Processes tags for expression)`}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

// Helper function to convert task name to snake_case function name
const generateFunctionName = (taskName: string): string => {
  return taskName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
};

// Helper function to generate unique function name by checking for duplicates
const generateUniqueFunctionName = (
  taskName: string,
  tasks: TaskDefinition[],
  currentTaskId?: string
): string => {
  const baseName = generateFunctionName(taskName);
  if (!baseName) return 'task';
  
  // Check if base name already exists in other tasks
  const existingNames = tasks
    .filter(task => task.id !== currentTaskId)
    .map(task => task.functionDefinition.name);
  
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  
  // Find a unique name by appending _1, _2, etc.
  let counter = 1;
  let uniqueName = `${baseName}_${counter}`;
  while (existingNames.includes(uniqueName)) {
    counter++;
    uniqueName = `${baseName}_${counter}`;
  }
  
  return uniqueName;
};

function TaskConfigurationCard({ task, index, tasks, taskGroups, onUpdate, onRemove, t, dragHandleProps }: TaskConfigurationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const validGroupIds = new Set(taskGroups.map((g) => g.id));
  const groupSelectValue =
    task.groupId && validGroupIds.has(task.groupId) ? task.groupId : TASK_SELECT_UNGROUPED_VALUE;

  return (
    <div className={`group border rounded-lg p-3 transition-all duration-200 ${
      task.enabled
        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
        : 'border-border bg-muted/50 hover:bg-muted'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            {...dragHandleProps}
            className={cn(
              (dragHandleProps as { className?: string } | undefined)?.className,
              'flex items-center gap-1 cursor-grab nodrag nopan'
            )}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium leading-tight break-words">
                {task.name || t('flow_builder.ai_task_fallback', 'Task {{n}}', { n: index + 1 })}
              </span>
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                task.enabled
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {task.enabled ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                {task.enabled ? t('flow_builder.ai_task_active', 'Active') : t('flow_builder.ai_task_inactive', 'Inactive')}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Switch
            checked={task.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
            className="scale-75"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 pl-4 border-l-2 border-emerald-200">
          <div>
            <Label className="text-[10px] font-medium text-foreground">
              {t('flow_builder.ai_task_group_label', 'Group')}
            </Label>
            <Select
              value={groupSelectValue}
              onValueChange={(value) =>
                onUpdate({ groupId: value === TASK_SELECT_UNGROUPED_VALUE ? null : value })
              }
            >
              <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_task_group_placeholder" className="text-xs h-7 mt-1">
                <SelectValue placeholder={t('flow_builder.ai_task_group_placeholder', 'Select group')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TASK_SELECT_UNGROUPED_VALUE}>
                  {t('flow_builder.ai_task_group_ungrouped', 'Ungrouped')}
                </SelectItem>
                {taskGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name || g.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_task_name_label', 'Task Name')}</Label>
              <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_task_name_placeholder"
                value={task.name}
                onChange={(e) => {
                  const newName = e.target.value;
                  const generatedFunctionName = generateUniqueFunctionName(newName, tasks, task.id);
                  onUpdate({ 
                    name: newName,
                    functionDefinition: {
                      ...task.functionDefinition,
                      name: generatedFunctionName || task.functionDefinition.name
                    }
                  });
                }}
                className="text-xs h-7 mt-1"
                placeholder={t('flow_builder.ai_task_name_placeholder', 'e.g., Share Product Brochure')}
              />
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_function_name_label', 'Function Name')}</Label>
              <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_function_name_placeholder"
                value={task.functionDefinition.name}
                readOnly
                className="text-xs h-7 mt-1 bg-muted cursor-not-allowed"
                placeholder={t('flow_builder.ai_function_name_placeholder', 'e.g., share_document')}
              />
              <p className="text-[9px] text-muted-foreground mt-1">
                {t('flow_builder.ai_function_name_auto_generated', 'Auto-generated from task name')}
              </p>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-medium text-foreground">
              {t('flow_builder.ai_function_description_label', 'AI Function Description')} <span className="text-red-500 dark:text-red-400">*</span>
            </Label>
            <Textarea data-tour="components-flow-builder-aiassistantnode.textarea.flow_builder.ai_function_description_placeholder"
              value={task.functionDefinition.description}
              onChange={(e) => onUpdate({
                functionDefinition: {
                  ...task.functionDefinition,
                  description: e.target.value
                }
              })}
              className="text-xs min-h-[120px] resize-none mt-1"
              placeholder={t('flow_builder.ai_function_description_placeholder', 'Detailed instructions for the AI model about when to call this function. Be specific about user intent requirements.')}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              {t('flow_builder.ai_function_description_tip', '💡 Tip: Use phrases like "ONLY call when user explicitly requests..." to prevent false triggers')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface AIAssistantNodeProps {
  id: string;
  data: AiAssistantNodeData;
  isConnectable: boolean;
}

interface PromptGeneratorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** When true, message is an error bubble (avoids locale-specific content detection). */
  isError?: boolean;
}

interface PromptGeneratorModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly provider: string;
  readonly model: string;
  readonly credentialSource: string;
  readonly apiKey: string;
  readonly azureEndpoint?: string;
  readonly azureApiVersion?: string;
  readonly conversationHistory: PromptGeneratorMessage[];
  readonly onHistoryChange: (history: PromptGeneratorMessage[]) => void;
  readonly onInsertPrompt: (text: string, mode: 'replace' | 'append') => void;
}

function PromptGeneratorModal({
  open,
  onOpenChange,
  provider,
  model,
  credentialSource,
  apiKey,
  azureEndpoint,
  azureApiVersion,
  conversationHistory,
  onHistoryChange,
  onInsertPrompt
}: PromptGeneratorModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [insertingMessageId, setInsertingMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const providerLabel = provider
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, isLoading]);

  useEffect(() => {
    if (open) {
      const id = globalThis.setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
    setInsertingMessageId(null);
    return undefined;
  }, [open]);

  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: PromptGeneratorMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed
    };
    const prev = conversationHistory;
    const historyForApi = prev.map(({ role, content }) => ({ role, content }));

    onHistoryChange([...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/ai-assist/generate-system-prompt', {
        message: trimmed,
        conversationHistory: historyForApi,
        provider,
        model,
        credentialSource,
        ...(credentialSource === 'manual' ? { apiKey } : {}),
        ...(provider === 'azure' && credentialSource === 'manual'
          ? { azureEndpoint, azureApiVersion }
          : {}),
      });
      const data = await response.json();
      const messageText = typeof data.message === 'string' ? data.message : '';
      const assistantMessage: PromptGeneratorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: messageText
      };
      onHistoryChange([...prev, userMessage, assistantMessage]);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : t('flow_builder.ai_prompt_gen_unknown_error', 'Unknown error');
      toast({
        variant: 'destructive',
        title: t('flow_builder.ai_prompt_gen_toast_error', 'Failed to generate system prompt'),
        description: detail
      });
      const errAssistant: PromptGeneratorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        isError: true,
        content: t(
          'flow_builder.ai_prompt_gen_error_content',
          '**Error:** {{details}}',
          { details: detail }
        )
      };
      onHistoryChange([...prev, userMessage, errAssistant]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-flow-builder-aiassistantnode.dialogcontent.flow_builder.ai_prompt_gen_title"
        contentNoScroll
        className="max-w-2xl h-[80vh] gap-0 overflow-hidden border-emerald-500/15 bg-gradient-to-b from-background to-emerald-500/[0.03] shadow-xl sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 space-y-0 border-border/60  pb-4 pt-1">
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-teal-500/10 shadow-sm dark:from-emerald-500/20 dark:to-teal-950/40"
              aria-hidden
            >
              <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <DialogTitle className="text-left text-base font-semibold leading-snug sm:text-lg">
                  {t('flow_builder.ai_prompt_gen_title', 'Generate System Prompt with AI')}
                </DialogTitle>
                {conversationHistory.length > 0 && (
                  <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_gen_clear"
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => onHistoryChange([])}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {t('flow_builder.ai_prompt_gen_clear', 'Clear chat')}
                  </Button>
                )}
              </div>
              <DialogDescription className="text-left text-xs leading-relaxed sm:text-sm">
                {t(
                  'flow_builder.ai_prompt_gen_description',
                  'Describe your business and the AI will generate a system prompt for the assistant.'
                )}
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/5 text-[10px] font-normal text-foreground"
                >
                  {t('flow_builder.ai_prompt_gen_using_model', 'Using {{provider}} · {{model}}', {
                    provider: providerLabel,
                    model
                  })}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-4 pr-3 pt-1">
            {conversationHistory.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-10 text-center dark:bg-emerald-950/20">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
                  <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {t('flow_builder.ai_prompt_gen_empty_title', 'Tell us about your use case')}
                </p>
                <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
                  {t('flow_builder.ai_prompt_gen_empty', 'Describe your business to get started')}
                </p>
              </div>
            )}

            {conversationHistory.map((msg) => {
              const isUser = msg.role === 'user';
              const isErr = msg.role === 'assistant' && msg.isError === true;

              return (
                <div
                  key={msg.id}
                  className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10',
                      isUser && 'bg-gradient-to-br from-blue-600 to-indigo-700',
                      !isUser && isErr && 'bg-gradient-to-br from-red-500 to-rose-600',
                      !isUser && !isErr && 'bg-gradient-to-br from-emerald-600 to-teal-700'
                    )}
                  >
                    {(() => {
                      if (isUser) {
                        return <User className="h-4 w-4 text-white" />;
                      }
                      if (isErr) {
                        return <AlertCircle className="h-4 w-4 text-white" />;
                      }
                      return <Bot className="h-4 w-4 text-white" />;
                    })()}
                  </div>
                  <div className={cn('min-w-0 max-w-[min(100%,28rem)] flex-1', isUser && 'flex flex-col items-end')}>
                    <div
                      className={cn(
                        'inline-block max-w-full rounded-2xl px-3.5 py-2.5 text-left text-sm shadow-sm',
                        isUser &&
                          'bg-gradient-to-br from-blue-600 to-indigo-700 text-white ring-1 ring-blue-500/30',
                        !isUser &&
                          isErr &&
                          'border border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100',
                        !isUser &&
                          !isErr &&
                          'border border-emerald-500/20 bg-emerald-500/[0.07] text-foreground dark:border-emerald-500/25 dark:bg-emerald-950/35'
                      )}
                    >
                      <div
                        className={cn(
                          'whitespace-pre-wrap break-words leading-relaxed',
                          isUser && 'text-white',
                          !isUser && isErr && 'text-red-900 dark:text-red-100',
                          !isUser && !isErr && 'text-foreground'
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>

                    {msg.role === 'assistant' && !isErr && (
                      <div className="mt-2 flex flex-wrap gap-2 justify-start">
                        {insertingMessageId === msg.id ? (
                          <>
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_gen_replace"
                              type="button"
                              size="sm"
                              className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                              onClick={() => {
                                onInsertPrompt(msg.content, 'replace');
                                setInsertingMessageId(null);
                                onOpenChange(false);
                              }}
                            >
                              {t('flow_builder.ai_prompt_gen_replace', 'Replace')}
                            </Button>
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_gen_append"
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                onInsertPrompt(msg.content, 'append');
                                setInsertingMessageId(null);
                                onOpenChange(false);
                              }}
                            >
                              {t('flow_builder.ai_prompt_gen_append', 'Append')}
                            </Button>
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_gen_cancel"
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setInsertingMessageId(null)}
                            >
                              {t('flow_builder.ai_prompt_gen_cancel', 'Cancel')}
                            </Button>
                          </>
                        ) : (
                          <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_gen_insert"
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-emerald-500/35 bg-emerald-500/5 text-xs hover:bg-emerald-500/12"
                            onClick={() => setInsertingMessageId(msg.id)}
                          >
                            <Sparkles className="mr-1.5 h-3 w-3" />
                            {t('flow_builder.ai_prompt_gen_insert', 'Insert Prompt')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start gap-3 rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 dark:bg-emerald-950/30">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {t('flow_builder.ai_prompt_gen_generating', 'Generating…')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'flow_builder.ai_prompt_gen_generating_hint',
                      'This may take a few seconds'
                    )}
                  </p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

          <div className="rounded-xl border border-border/80 bg-background/80 p-2 shadow-inner backdrop-blur-sm dark:bg-background/60">
            <Textarea data-tour="components-flow-builder-aiassistantnode.textarea.flow_builder.ai_prompt_gen_placeholder"
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={t(
                'flow_builder.ai_prompt_gen_placeholder',
                'Describe your business, tone, and goals…'
              )}
              className="min-h-[76px] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60"
              disabled={isLoading}
            />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
              <p className="text-[10px] text-muted-foreground">
                {t(
                  'flow_builder.ai_prompt_gen_shortcut_hint',
                  'Ctrl+Enter to send'
                )}
              </p>
              <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_gen_send_aria"
                type="button"
                size="sm"
                className="h-8 gap-1.5 bg-emerald-600 px-3 text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                onClick={() => void sendMessage()}
                disabled={isLoading || !inputValue.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                {t('flow_builder.ai_prompt_gen_send_aria', 'Send')}
              </Button>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
}

export function AIAssistantNode({ id, data, isConnectable }: AIAssistantNodeProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { businessType: erpBusinessType, isDental: isDentalErp } = useErpBusinessType();
  const { providers: AI_PROVIDERS, isLoading: isLoadingModels, error: modelsError, azureEmbeddingDeployments } = useAIProviders();
  const normalizedData = useMemo(() => normalizeAiAssistantNodeData(data), [data]);
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [provider, setProvider] = useState(normalizedData.provider ?? 'openai');
  const [model, setModel] = useState(normalizedData.model ?? AI_ASSISTANT_DEFAULT_MODEL);
  const initialModelWasMissingRef = useRef(typeof data.model !== 'string' || data.model.trim() === '');
  const [apiKey, setApiKey] = useState(normalizedData.apiKey || '');
  const [azureEndpoint, setAzureEndpoint] = useState(normalizedData.azureEndpoint || '');
  const [azureApiVersion, setAzureApiVersion] = useState(normalizedData.azureApiVersion || DEFAULT_AZURE_OPENAI_API_VERSION);
  const [credentialSource, setCredentialSource] = useState(normalizedData.credentialSource || 'auto');
  const [language, setLanguage] = useState(normalizedData.language || 'en');
  const [assistantTimezone, setAssistantTimezone] = useState(normalizedData.timezone || '');
  const [prompt, setPrompt] = useState(normalizedData.prompt || t('flow_builder.ai_default_system_prompt', 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.'));
  const [isEnhancingSystemPrompt, setIsEnhancingSystemPrompt] = useState(false);
  const [originalSystemPrompt, setOriginalSystemPrompt] = useState<string | null>(null);
  const systemPromptEnhancementAbortRef = useRef<AbortController | null>(null);
  const systemPromptPickerRef = useRef<EnhancedVariablePickerHandle>(null);
  const navigateToPromptPlaceholder = useCallback((variableName: string) => {
    systemPromptPickerRef.current?.focusPlaceholder(variableName);
  }, []);
  const [aiVariables, setAiVariables] = useState<AiAssistantVariableDefinition[]>(
    normalizedData.aiVariables ?? []
  );
  const [customFieldBindings, setCustomFieldBindings] = useState<AiAssistantCustomFieldBinding[]>(
    normalizedData.customFieldBindings ?? []
  );
  const { data: contactCustomFields = [] } = useQuery<CompanyCustomField[]>({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => (await apiRequest('GET', '/api/company/custom-fields?entity=contact')).json(),
    staleTime: 60_000,
  });
  const { data: dealCustomFields = [] } = useQuery<CompanyCustomField[]>({
    queryKey: ['/api/company/custom-fields', 'deal'],
    queryFn: async () => (await apiRequest('GET', '/api/company/custom-fields?entity=deal')).json(),
    staleTime: 60_000,
  });
  const { data: companyTimezoneSetting } = useQuery<{ defaultTimezone: string }>({
    queryKey: ['/api/company-settings/default-timezone'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company-settings/default-timezone');
      if (!response.ok) throw new Error('Failed to load company timezone');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const companyTimezone = companyTimezoneSetting?.defaultTimezone || 'UTC';
  const companyCustomFields = useMemo(
    () => [...contactCustomFields, ...dealCustomFields],
    [contactCustomFields, dealCustomFields],
  );
  const customFieldEntityLabel = useCallback((entity: 'contact' | 'deal') => entity === 'contact'
    ? t('flow_builder.condition_domains.contact', 'Contact')
    : t('flow_builder.condition_domains.deal', 'Deal'), [t]);
  const customFieldModeLabel = useCallback((mode: AiAssistantCustomFieldMode) => {
    if (mode === 'read') return t('flow_builder.ai_custom_field_read', 'Read');
    if (mode === 'write') return t('flow_builder.ai_custom_field_write', 'Populate');
    return t('flow_builder.ai_custom_field_read_write', 'Read & populate');
  }, [t]);
  const customFieldTypeLabel = useCallback((fieldType?: string) => {
    const typeTranslations: Record<string, [string, string]> = {
      text: ['settings.custom_fields.types.text', 'Text'],
      number: ['settings.custom_fields.types.number', 'Number'],
      select: ['settings.custom_fields.types.select', 'Single Select'],
      multi_select: ['settings.custom_fields.types.multi_select', 'Multi Select'],
      date: ['settings.custom_fields.types.date', 'Date'],
      boolean: ['settings.custom_fields.types.boolean', 'Yes/No'],
      file_select: ['settings.custom_fields.types.file_select', 'File Select'],
    };
    if (!fieldType) return undefined;
    const translation = typeTranslations[fieldType];
    return translation ? t(translation[0], translation[1]) : fieldType;
  }, [t]);
  const customFieldPickerVariables = useMemo(() => customFieldBindings.map((binding) => {
    const field = companyCustomFields.find((candidate) => candidate.id === binding.customFieldId && candidate.entity === binding.entity);
    return {
      value: customFieldVariablePath(binding.entity, binding.fieldName),
      label: `${customFieldEntityLabel(binding.entity)} · ${field?.fieldLabel ?? binding.fieldName}`,
      description: t('flow_builder.ai_custom_field_configured_description', 'Configured custom field ({{mode}})', {
        mode: customFieldModeLabel(binding.mode),
      }),
      icon: null,
      category: 'custom' as const,
      dataType: customFieldTypeLabel(field?.fieldType),
    };
  }), [companyCustomFields, customFieldBindings, customFieldEntityLabel, customFieldModeLabel, customFieldTypeLabel, t]);
  const [enableHistory, setEnableHistory] = useState(normalizedData.enableHistory !== undefined ? normalizedData.enableHistory : true);
  const [historyLimit, setHistoryLimit] = useState(
    normalizedData.historyLimit ?? AI_ASSISTANT_DEFAULT_HISTORY_LIMIT
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(normalizedData.maxOutputTokens || 1500);


  const [enableTextToSpeech, setEnableTextToSpeech] = useState(normalizedData.enableTextToSpeech || false);
  const [enableVoiceProcessing, setEnableVoiceProcessing] = useState<boolean | undefined>(
    normalizedData.enableVoiceProcessing
  );
  const [ttsProvider, setTtsProvider] = useState(normalizedData.ttsProvider || 'openai');
  const [ttsVoice, setTtsVoice] = useState(normalizedData.ttsVoice || 'alloy');
  const [voiceResponseMode, setVoiceResponseMode] = useState(normalizedData.voiceResponseMode || 'voice_only');
  const [enableImage, setEnableImage] = useState(normalizedData.enableImage === true);
  const [imageModelPromptOpen, setImageModelPromptOpen] = useState(false);
  const [maxAudioDuration, setMaxAudioDuration] = useState(normalizedData.maxAudioDuration || 30);


  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(normalizedData.elevenLabsApiKey || '');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(normalizedData.elevenLabsVoiceId || 'JaagUurP1dmW3WscoJ79');
  const [elevenLabsCustomVoiceId, setElevenLabsCustomVoiceId] = useState(normalizedData.elevenLabsCustomVoiceId || '');
  const [elevenLabsModel, setElevenLabsModel] = useState(normalizedData.elevenLabsModel || 'eleven_multilingual_v2');
  const [elevenLabsStability, setElevenLabsStability] = useState(normalizedData.elevenLabsStability ?? 0.5);
  const [elevenLabsSimilarityBoost, setElevenLabsSimilarityBoost] = useState(normalizedData.elevenLabsSimilarityBoost ?? 0.75);
  const [elevenLabsStyle, setElevenLabsStyle] = useState(normalizedData.elevenLabsStyle ?? 0.0);
  const [elevenLabsUseSpeakerBoost, setElevenLabsUseSpeakerBoost] = useState(normalizedData.elevenLabsUseSpeakerBoost ?? true);
  const [elevenLabsPromptInfluence, setElevenLabsPromptInfluence] = useState(normalizedData.elevenLabsPromptInfluence ?? 0.5);
  const [elevenLabsEnableAudioTags, setElevenLabsEnableAudioTags] = useState(normalizedData.elevenLabsEnableAudioTags ?? false);
  const [elevenLabsAudioTagsInstructions, setElevenLabsAudioTagsInstructions] = useState(normalizedData.elevenLabsAudioTagsInstructions ?? 'Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points');

  const [enableSessionTakeover, setEnableSessionTakeover] = useState(normalizedData.enableSessionTakeover !== undefined ? normalizedData.enableSessionTakeover : true);
  const [stopKeyword, setStopKeyword] = useState(normalizedData.stopKeyword || 'stop');
  const [exitOutputHandle, setExitOutputHandle] = useState(normalizedData.exitOutputHandle || 'ai-stopped');
  const [enableTaskExecution, setEnableTaskExecution] = useState(normalizedData.enableTaskExecution || false);
  const [enableTaskFollowUpMessage, setEnableTaskFollowUpMessage] = useState(
    normalizedData.enableTaskFollowUpMessage !== false
  );
  const [tasks, setTasks] = useState<TaskDefinition[]>(normalizedData.tasks || []);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>(normalizedData.taskGroups ?? []);
  const [taskGroupsEditorOpen, setTaskGroupsEditorOpen] = useState(false);
  const [taskGroupSectionsOpen, setTaskGroupSectionsOpen] = useState<Record<string, boolean>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [handleKey, setHandleKey] = useState(0); // Force re-render of handles
  const [isAddingTask, setIsAddingTask] = useState(false); // Prevent rapid clicking

  const [appliedSystemPromptTemplate, setAppliedSystemPromptTemplate] = useState<string>('none');
  const [pendingSystemPromptTemplate, setPendingSystemPromptTemplate] = useState<AiAssistantPromptTemplateId | null>(null);
  const [systemPromptTemplateConfirmOpen, setSystemPromptTemplateConfirmOpen] = useState(false);


  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(normalizedData.knowledgeBaseEnabled === true); // Default disabled
  const [knowledgeBaseConfig, setKnowledgeBaseConfig] = useState<AiAssistantKnowledgeBaseConfig>(
    () =>
      normalizedData.knowledgeBaseConfig ?? {
        maxRetrievedChunks: DEFAULT_RAG_CONFIG.maxRetrievedChunks,
        similarityThreshold: DEFAULT_RAG_CONFIG.similarityThreshold,
        contextPosition: DEFAULT_RAG_CONFIG.contextPosition,
        contextTemplate: DEFAULT_RAG_CONFIG.contextTemplate,
        greetingAcknowledgementExpressions:
          DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions,
        embeddingModel: DEFAULT_RAG_CONFIG.embeddingModel,
        vectorDatabase: DEFAULT_RAG_CONFIG.vectorDatabase,
      }
  );

  const ragConfig = useMemo<RAGConfig>(() => ({
    enabled: knowledgeBaseEnabled,
    maxRetrievedChunks: knowledgeBaseConfig.maxRetrievedChunks ?? DEFAULT_RAG_CONFIG.maxRetrievedChunks,
    similarityThreshold: knowledgeBaseConfig.similarityThreshold ?? DEFAULT_RAG_CONFIG.similarityThreshold,
    embeddingModel: provider === 'azure'
      ? (knowledgeBaseConfig.embeddingModel || '')
      : normalizeEmbeddingModel(knowledgeBaseConfig.embeddingModel),
    contextPosition: knowledgeBaseConfig.contextPosition ?? DEFAULT_RAG_CONFIG.contextPosition,
    contextTemplate: knowledgeBaseConfig.contextTemplate ?? DEFAULT_RAG_CONFIG.contextTemplate,
    greetingAcknowledgementExpressions:
      knowledgeBaseConfig.greetingAcknowledgementExpressions ??
      DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions,
    vectorDatabase: knowledgeBaseConfig.vectorDatabase ?? DEFAULT_RAG_CONFIG.vectorDatabase,
    hybridEnabled: knowledgeBaseConfig.hybridEnabled ?? DEFAULT_RAG_CONFIG.hybridEnabled,
    denseTopK: knowledgeBaseConfig.denseTopK ?? DEFAULT_RAG_CONFIG.denseTopK,
    lexicalTopK: knowledgeBaseConfig.lexicalTopK ?? DEFAULT_RAG_CONFIG.lexicalTopK,
    rrfK: knowledgeBaseConfig.rrfK ?? DEFAULT_RAG_CONFIG.rrfK,
    denseWeight: knowledgeBaseConfig.denseWeight ?? DEFAULT_RAG_CONFIG.denseWeight,
    lexicalWeight: knowledgeBaseConfig.lexicalWeight ?? DEFAULT_RAG_CONFIG.lexicalWeight,
    candidatePoolSize: knowledgeBaseConfig.candidatePoolSize ?? DEFAULT_RAG_CONFIG.candidatePoolSize,
    dedupeEnabled: knowledgeBaseConfig.dedupeEnabled ?? DEFAULT_RAG_CONFIG.dedupeEnabled,
    dedupeSimilarity: knowledgeBaseConfig.dedupeSimilarity ?? DEFAULT_RAG_CONFIG.dedupeSimilarity,
    mmrEnabled: knowledgeBaseConfig.mmrEnabled ?? DEFAULT_RAG_CONFIG.mmrEnabled,
    mmrLambda: knowledgeBaseConfig.mmrLambda ?? DEFAULT_RAG_CONFIG.mmrLambda,
    rerankEnabled: knowledgeBaseConfig.rerankEnabled ?? DEFAULT_RAG_CONFIG.rerankEnabled,
    rerankModel: knowledgeBaseConfig.rerankModel ?? DEFAULT_RAG_CONFIG.rerankModel,
    rerankTopN: knowledgeBaseConfig.rerankTopN ?? DEFAULT_RAG_CONFIG.rerankTopN,
    confidenceThreshold: knowledgeBaseConfig.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
    queryRewriteEnabled: knowledgeBaseConfig.queryRewriteEnabled ?? DEFAULT_RAG_CONFIG.queryRewriteEnabled,
    answerValidationEnabled: knowledgeBaseConfig.answerValidationEnabled ?? DEFAULT_RAG_CONFIG.answerValidationEnabled,
    hnswEfSearch: knowledgeBaseConfig.hnswEfSearch ?? DEFAULT_RAG_CONFIG.hnswEfSearch,
  }), [knowledgeBaseEnabled, knowledgeBaseConfig, provider]);


  const [pineconeApiKey, setPineconeApiKey] = useState(normalizedData.pineconeApiKey || '');
  const [pineconeEnvironment, setPineconeEnvironment] = useState(normalizedData.pineconeEnvironment || 'us-east-1');
  const [pineconeIndexName, setPineconeIndexName] = useState(normalizedData.pineconeIndexName || '');
  const [showPineconeApiKey, setShowPineconeApiKey] = useState(false);

  const [enableGoogleCalendar, setEnableGoogleCalendar] = useState(normalizedData.enableGoogleCalendar || false);
  const [enableLocalDentalBooking, setEnableLocalDentalBooking] = useState<boolean>(
    normalizedData.enableLocalDentalBooking === true,
  );
  const [localDentalProviderDetailsSharingEnabled, setLocalDentalProviderDetailsSharingEnabled] = useState(
    normalizedData.localDentalProviderDetailsSharingEnabled !== false,
  );
  const [localDentalServiceDetailsSharingEnabled, setLocalDentalServiceDetailsSharingEnabled] = useState(
    normalizedData.localDentalServiceDetailsSharingEnabled !== false,
  );
  const [localDentalSingleSlotOfferingEnabled, setLocalDentalSingleSlotOfferingEnabled] = useState(
    normalizedData.localDentalSingleSlotOfferingEnabled === true,
  );
  const [googleCalendarId, setGoogleCalendarId] = useState<string>(normalizedData.googleCalendarId || 'primary');
  const [calendarBusinessHours, setCalendarBusinessHours] = useState(normalizedData.calendarBusinessHours || { start: '09:00', end: '17:00' });
  const [calendarDefaultDuration, setCalendarDefaultDuration] = useState(normalizedData.calendarDefaultDuration || 60);
  const [calendarBufferMinutes, setCalendarBufferMinutes] = useState(normalizedData.calendarBufferMinutes || 0);
  const [calendarTimeZone, setCalendarTimeZone] = useState(normalizedData.calendarTimeZone || '');
  
  // Advanced Calendar Settings for Google Calendar
  const [calendarAdvancedMode, setCalendarAdvancedMode] = useState(normalizedData.calendarAdvancedMode !== undefined ? normalizedData.calendarAdvancedMode : true);
  const [calendarWeeklySchedule, setCalendarWeeklySchedule] = useState<DaySchedule[]>(() => {
    if (normalizedData.calendarAdvancedSettings?.weeklySchedule) {
      const loadedSchedule = normalizedData.calendarAdvancedSettings.weeklySchedule;
      const loadedOffDays = normalizedData.calendarAdvancedSettings?.offDays || [];
      // Normalize: ensure days in offDays have enabled=false
      return loadedSchedule.map((day: DaySchedule) => ({
        ...day,
        enabled: loadedOffDays.includes(day.dayIndex) ? false : day.enabled
      }));
    }
    return createDefaultScheduleFromHours(
      normalizedData.calendarBusinessHours?.start ?? '09:00',
      normalizedData.calendarBusinessHours?.end ?? '17:00'
    );
  });
  const [calendarOffDays, setCalendarOffDays] = useState<number[]>(() => {
    if (normalizedData.calendarAdvancedSettings?.offDays) {
      return normalizedData.calendarAdvancedSettings.offDays;
    }
    return [0, 6]; // Default: Sunday and Saturday off
  });
  const [calendarOfferingSettings, setCalendarOfferingSettings] = useState<CalendarOfferingSettings>(
    () => normalizedData.calendarOfferingSettings ?? createDefaultOfferingSettings()
  );
  const [calendarReminderSettings, setCalendarReminderSettings] = useState<CalendarReminderSettings>(
    () => ({ ...createDefaultReminderSettings(), ...(normalizedData.calendarReminderSettings || {}) })
  );

  const [calendarAssignmentStrategy, setCalendarAssignmentStrategy] = useState(
    () => normalizedData.assignmentStrategy ?? 'company_default'
  );
  const [calendarTargetAgentUserId, setCalendarTargetAgentUserId] = useState(normalizedData.targetAgentUserId ?? null);
  const [bookableAgentUserIds, setBookableAgentUserIds] = useState<number[]>(() =>
    normalizeBookableAgentUserIds(normalizedData.bookableAgentUserIds)
  );

  const [enableZohoCalendar, setEnableZohoCalendar] = useState(normalizedData.enableZohoCalendar || false);
  const [zohoCalendarBusinessHours, setZohoCalendarBusinessHours] = useState(normalizedData.zohoCalendarBusinessHours || { start: '09:00', end: '17:00' });
  const [zohoCalendarDefaultDuration, setZohoCalendarDefaultDuration] = useState(normalizedData.zohoCalendarDefaultDuration || 60);
  const [zohoCalendarTimeZone, setZohoCalendarTimeZone] = useState(normalizedData.zohoCalendarTimeZone || '');
  
  const [enableErp, setEnableErp] = useState(normalizedData.enableErp ?? false);
  const [erpCatalogPriceSharingEnabled, setErpCatalogPriceSharingEnabled] = useState(
    normalizedData.erpCatalogPriceSharingEnabled !== false
  );
  const [erpPriceInquiryResponse, setErpPriceInquiryResponse] = useState(
    normalizedData.erpPriceInquiryResponse || ERP_PRICE_INQUIRY_RESPONSE_DEFAULT
  );
  const [erpMessageTemplate, setErpMessageTemplate] = useState(
    typeof normalizedData.erpMessageTemplate === 'string' ? normalizedData.erpMessageTemplate : ''
  );
  const [erpIncludePdfLink, setErpIncludePdfLink] = useState(!!normalizedData.erpIncludePdfLink);
  const [erpProductImageSendWhen, setErpProductImageSendWhen] = useState<ErpProductImageSendWhen>(
    normalizedData.erpProductImageSendWhen ?? ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT
  );
  const [erpProductImageMultiMatchMode, setErpProductImageMultiMatchMode] =
    useState<ErpProductImageMultiMatchMode>(
      normalizedData.erpProductImageMultiMatchMode ?? ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT
    );
  const [erpProductImageMaxPerProduct, setErpProductImageMaxPerProduct] = useState<number>(
    normalizedData.erpProductImageMaxPerProduct ?? ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT
  );
  const [erpProductImageCaptionMode, setErpProductImageCaptionMode] =
    useState<ErpProductImageCaptionMode>(
      normalizedData.erpProductImageCaptionMode ?? ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT
    );
  const [erpProductImagesOpen, setErpProductImagesOpen] = useState(false);

  // Advanced Calendar Settings for Zoho Calendar
  const [zohoCalendarAdvancedMode, setZohoCalendarAdvancedMode] = useState(normalizedData.zohoCalendarAdvancedMode !== undefined ? normalizedData.zohoCalendarAdvancedMode : true);
  const [zohoCalendarWeeklySchedule, setZohoCalendarWeeklySchedule] = useState<DaySchedule[]>(() => {
    if (normalizedData.zohoCalendarAdvancedSettings?.weeklySchedule) {
      const loadedSchedule = normalizedData.zohoCalendarAdvancedSettings.weeklySchedule;
      const loadedOffDays = normalizedData.zohoCalendarAdvancedSettings?.offDays || [];
      // Normalize: ensure days in offDays have enabled=false
      return loadedSchedule.map((day: DaySchedule) => ({
        ...day,
        enabled: loadedOffDays.includes(day.dayIndex) ? false : day.enabled
      }));
    }
    return createDefaultScheduleFromHours(
      normalizedData.zohoCalendarBusinessHours?.start ?? '09:00',
      normalizedData.zohoCalendarBusinessHours?.end ?? '17:00'
    );
  });
  const [zohoCalendarOffDays, setZohoCalendarOffDays] = useState<number[]>(() => {
    if (normalizedData.zohoCalendarAdvancedSettings?.offDays) {
      return normalizedData.zohoCalendarAdvancedSettings.offDays;
    }
    return [0, 6]; // Default: Sunday and Saturday off
  });
  const [zohoCalendarOfferingSettings, setZohoCalendarOfferingSettings] = useState<CalendarOfferingSettings>(
    () => normalizedData.zohoCalendarOfferingSettings ?? createDefaultOfferingSettings()
  );
  const [zohoCalendarReminderSettings, setZohoCalendarReminderSettings] = useState<CalendarReminderSettings>(
    () => ({ ...createDefaultReminderSettings(), ...(normalizedData.zohoCalendarReminderSettings || {}) })
  );



  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const incomingEdges = useEdges();
  const nodes = useNodes();
  const mcpConnectionInfo = useMemo(() => {
    const edges = incomingEdges.filter(
      (e) => e.target === id && e.targetHandle === AI_TOOL_INPUT_HANDLE_ID
    );
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    let nodeCount = 0;
    let callableSum = 0;
    let hasDiscovery = false;
    const seenMcpSources = new Set<string>();
    for (const e of edges) {
      const n = byId.get(e.source);
      if (!n || n.type !== 'mcp_client_tool') continue;
      if (seenMcpSources.has(e.source)) continue;
      seenMcpSources.add(e.source);
      nodeCount += 1;
      const d = n.data as {
        servers?: Array<{ id: string }>;
        mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary>;
      };
      const discMap = d.mcpToolDiscoveryByServerId;
      if (!discMap) continue;
      for (const s of d.servers ?? []) {
        const summary = discMap[s.id];
        if (summary?.lastRefreshStatus === 'ok') {
          hasDiscovery = true;
          const exportable =
            summary.exportableToolCountAtRefresh !== undefined
              ? summary.exportableToolCountAtRefresh
              : summary.exposedToolCountAtRefresh ?? 0;
          callableSum += exportable;
        }
      }
    }
    return { nodeCount, callableSum, hasDiscovery };
  }, [incomingEdges, id, nodes]);
  const { onDeleteNode, flowId, customVariables } = useFlowContext();
  const canvasOutputVariables = useMemo(() => getFlowNodeVariablesFromNodes(nodes), [nodes]);
  const { variables } = useFlowVariables(
    flowId ?? undefined,
    customVariables,
    [...canvasOutputVariables, ...customFieldPickerVariables],
  );

  const persistVectorDatabaseSelection = useCallback(async (provider: VectorDatabaseProvider) => {
    try {
      const response = await apiRequest('PUT', `/api/knowledge-base/config/${id}`, {
        enabled: knowledgeBaseEnabled,
        vectorDatabase: provider,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Failed to save vector database selection');
      }
    } catch (error) {
      toast({
        title: t('flow_builder.ai_vector_database_save_error', 'Failed to save vector database'),
        description: error instanceof Error ? error.message : t('common.unknown_error', 'Unknown error'),
        variant: 'destructive',
      });
    }
  }, [id, knowledgeBaseEnabled, t, toast]);

  const knownReadNames = useMemo(() => {
    const names = new Set<string>(BASE_VARIABLE_VALUE_SET);
    for (const name of getFlowVariableNamesExcludingNode(variables, id)) {
      names.add(name);
    }
    return names;
  }, [variables, id]);

  const { referencedAiVars, referencedCustomVars, referencedReadVars, unknownPlaceholders } = useMemo(() => {
    const unique = extractAiAssistantPlaceholderNames(prompt);
    const configuredCustomFieldPaths = new Set(customFieldPickerVariables.map((variable) => variable.value));
    const customNames = new Set((customVariables ?? []).map((v) => v.name));
    const aiVariablesByName = new Map(aiVariables.map((variable) => [variable.name, variable]));
    const referencedAiVars = unique.flatMap((name) => {
      const variable = aiVariablesByName.get(name);
      return variable ? [variable] : [];
    });
    const referencedCustomVars = unique.filter(
      (name) => !aiVariablesByName.has(name) && customNames.has(name)
    );
    const referencedReadVars = unique.filter(
      (name) => !aiVariablesByName.has(name) && !customNames.has(name) &&
        !configuredCustomFieldPaths.has(name) && knownReadNames.has(name)
    );
    const unknownPlaceholders = unique.filter(
      (name) => !aiVariablesByName.has(name) && !customNames.has(name) && !knownReadNames.has(name)
    );
    return { referencedAiVars, referencedCustomVars, referencedReadVars, unknownPlaceholders };
  }, [prompt, aiVariables, customVariables, knownReadNames, customFieldPickerVariables]);

  const activeWritableVarNames = useMemo(
    () => [...referencedCustomVars, ...referencedAiVars.map((variable) => variable.name)],
    [referencedAiVars, referencedCustomVars]
  );
  const completionVarNames = useMemo(
    () => [
      ...referencedCustomVars,
      ...referencedAiVars.filter((variable) => variable.required).map((variable) => variable.name),
    ],
    [referencedAiVars, referencedCustomVars]
  );

  useEffect(() => {
    const legacyCustomNames = new Set((customVariables ?? []).map((variable) => variable.name));
    setAiVariables((current) => {
      const next = syncAiAssistantVariables({
        prompt,
        current,
        knownReadNames,
        legacyCustomNames,
      });
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [prompt, knownReadNames, customVariables]);

  const {
    isConnected: isGoogleCalendarConnected,
    isLoadingStatus: isLoadingGoogleCalendarStatus,
    isAuthenticating: isGoogleCalendarAuthenticating,
    authenticate: authenticateGoogleCalendar,
    disconnect: disconnectGoogleCalendar,
    refetchStatus: refetchGoogleCalendarStatus
  } = useGoogleCalendarAuth();

  const {
    data: googleCalendarList,
    isFetching: isFetchingGoogleCalendars,
    isError: isGoogleCalendarListError
  } = useQuery({
    queryKey: ['google-calendar-list', calendarAssignmentStrategy, calendarAssignmentStrategy === 'agent_pick' ? calendarTargetAgentUserId : null],
    queryFn: () => googleCalendarAuth.listCalendars({
      assignmentStrategy: calendarAssignmentStrategy,
      targetAgentUserId: calendarAssignmentStrategy === 'agent_pick' ? calendarTargetAgentUserId : null
    }),
    staleTime: 5 * 60 * 1000,
    enabled: enableGoogleCalendar && isGoogleCalendarConnected && calendarAssignmentStrategy !== 'round_robin' && calendarAssignmentStrategy !== 'first_available' && calendarAssignmentStrategy !== 'customer_selected'
  });

  const googleCalendars = useMemo<GoogleCalendarListItem[]>(
    () => googleCalendarList?.calendars || [],
    [googleCalendarList]
  );
  const hasAutoSelectedGoogleCalendarRef = useRef(normalizedData.googleCalendarId !== undefined);

  useEffect(() => {
    if (
      enableGoogleCalendar &&
      (calendarAssignmentStrategy === 'round_robin' || calendarAssignmentStrategy === 'first_available' || calendarAssignmentStrategy === 'customer_selected') &&
      googleCalendarId !== 'primary'
    ) {
      setGoogleCalendarId('primary');
    }
  }, [calendarAssignmentStrategy, enableGoogleCalendar, googleCalendarId]);

  useEffect(() => {
    if (
      !enableGoogleCalendar ||
      !isGoogleCalendarConnected ||
      googleCalendars.length === 0 ||
      calendarAssignmentStrategy === 'round_robin' ||
      calendarAssignmentStrategy === 'first_available' ||
      calendarAssignmentStrategy === 'customer_selected'
    ) {
      return;
    }

    const primaryCalendar = googleCalendars.find((calendar) => calendar.primary);
    const fallbackCalendarId = primaryCalendar?.id || 'primary';
    const selectedExists = googleCalendars.some((calendar) => calendar.id === googleCalendarId);

    if (normalizedData.googleCalendarId === undefined && !hasAutoSelectedGoogleCalendarRef.current) {
      if (googleCalendarId !== fallbackCalendarId) {
        setGoogleCalendarId(fallbackCalendarId);
      }
      hasAutoSelectedGoogleCalendarRef.current = true;
      return;
    }

    if (!selectedExists) {
      setGoogleCalendarId(fallbackCalendarId);
    }
  }, [calendarAssignmentStrategy, normalizedData, enableGoogleCalendar, googleCalendarId, googleCalendars, isGoogleCalendarConnected]);


  const {
    isConnected: isZohoCalendarConnected,
    isLoadingStatus: isLoadingZohoCalendarStatus,
    isAuthenticating: isZohoCalendarAuthenticating,
    authenticate: authenticateZohoCalendar,
    disconnect: disconnectZohoCalendar,
    refetchStatus: refetchZohoCalendarStatus
  } = useZohoCalendarAuth();


  const {
    data: agentsWithCalendars = [],
    isLoading: isLoadingAgentsData,
    isError: isAgentsDataError,
    isSuccess: isAgentsDataSuccess
  } = useQuery({
    queryKey: ['ai-assistant-agents-calendar-status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/agents/calendar-status');
      const result = await response.json();
      const roster = Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.agents)
          ? result.agents
          : Array.isArray(result)
            ? result
            : [];
      const merged = [...roster];
      if (result?.currentUser) {
        const currentUserId = Number(result.currentUser.userId);
        if (Number.isInteger(currentUserId) && currentUserId > 0 && !merged.some((agent: any) => Number(agent?.userId) === currentUserId)) {
          merged.push(result.currentUser);
        }
      }
      return merged;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: enableGoogleCalendar && (calendarAssignmentStrategy === 'agent_pick' || calendarAssignmentStrategy === 'customer_selected')
  });

  const connectedAgents = useMemo(
    () => (Array.isArray(agentsWithCalendars) ? agentsWithCalendars : [])
      .filter((a: { isCalendarConnected?: boolean }) => !!a.isCalendarConnected),
    [agentsWithCalendars]
  );

  useEffect(() => {
    if (
      calendarAssignmentStrategy !== 'customer_selected' ||
      !enableGoogleCalendar ||
      !isAgentsDataSuccess
    ) return;

    const connectedIds = new Set(
      connectedAgents
        .map((agent: any) => Number(agent.userId))
        .filter((id: number) => Number.isInteger(id) && id > 0)
    );
    const cleanedIds = bookableAgentUserIds.filter((id) => connectedIds.has(id));

    if (
      cleanedIds.length !== bookableAgentUserIds.length ||
      cleanedIds.some((id, index) => id !== bookableAgentUserIds[index])
    ) {
      setBookableAgentUserIds(cleanedIds);
    }
  }, [bookableAgentUserIds, calendarAssignmentStrategy, connectedAgents, enableGoogleCalendar, isAgentsDataSuccess]);

  const { data: companyCredentials } = useQuery({
    queryKey: ['company-ai-credentials'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/company/ai-credentials');
        const result = await response.json();
        return result.data || [];
      } catch (error) {
        console.error('Failed to fetch company AI credentials:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: aiPreferences } = useQuery({
    queryKey: ['company-ai-preferences'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/company/ai-credentials/preferences');
        const result = await response.json();
        return result.data || { credentialPreference: 'auto', fallbackEnabled: true };
      } catch (error) {
        console.error('Failed to fetch AI preferences:', error);
        return { credentialPreference: 'auto', fallbackEnabled: true };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: systemOpenRouterAvailable } = useQuery({
    queryKey: ['company-ai-credentials-availability', 'openrouter', 'system'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/company/ai-credentials/availability?provider=openrouter&preference=system');
        const result = await response.json();
        return result.data?.available ?? false;
      } catch (error) {
        console.error('Failed to check system OpenRouter credential availability:', error);
        return false;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: provider === 'openrouter' && credentialSource === 'system',
  });

  const { data: availableLanguages } = useQuery({
    queryKey: ['available-languages'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/languages');
        const result = await response.json();
        return result || [];
      } catch (error) {
        console.error('Failed to fetch languages:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });



  const isUpdatingRef = React.useRef(false);

  useEffect(() => {

    if (isUpdatingRef.current) return;

    const incoming = normalizeAiAssistantNodeData(data);

    if (incoming.provider !== undefined && incoming.provider !== provider) setProvider(incoming.provider);
    if (incoming.model !== undefined && incoming.model !== model) setModel(incoming.model);
    if (incoming.apiKey !== undefined && incoming.apiKey !== apiKey) setApiKey(incoming.apiKey);
    if (incoming.azureEndpoint !== undefined && incoming.azureEndpoint !== azureEndpoint) setAzureEndpoint(incoming.azureEndpoint);
    if (incoming.azureApiVersion !== undefined && incoming.azureApiVersion !== azureApiVersion) setAzureApiVersion(incoming.azureApiVersion);
    if (incoming.credentialSource !== undefined && incoming.credentialSource !== credentialSource) setCredentialSource(incoming.credentialSource);
    if (incoming.language !== undefined && incoming.language !== language) setLanguage(incoming.language);
    if ((incoming.timezone || '') !== assistantTimezone) setAssistantTimezone(incoming.timezone || '');
    if (incoming.prompt !== undefined && incoming.prompt !== prompt) {
      setOriginalSystemPrompt(null);
      setPrompt(incoming.prompt);
    }
    if (
      incoming.aiVariables !== undefined &&
      JSON.stringify(incoming.aiVariables) !== JSON.stringify(aiVariables)
    ) {
      setAiVariables(incoming.aiVariables);
    }
    if (
      incoming.customFieldBindings !== undefined &&
      JSON.stringify(incoming.customFieldBindings) !== JSON.stringify(customFieldBindings)
    ) {
      setCustomFieldBindings(incoming.customFieldBindings);
    }
    if (incoming.enableHistory !== undefined) setEnableHistory(incoming.enableHistory);
    if (incoming.historyLimit !== undefined) setHistoryLimit(incoming.historyLimit);
    if (incoming.enableTextToSpeech !== undefined) setEnableTextToSpeech(incoming.enableTextToSpeech);
    if (incoming.enableVoiceProcessing !== undefined) setEnableVoiceProcessing(incoming.enableVoiceProcessing);
    if (incoming.ttsProvider !== undefined) setTtsProvider(incoming.ttsProvider);
    if (incoming.ttsVoice !== undefined) setTtsVoice(incoming.ttsVoice);
    if (incoming.voiceResponseMode !== undefined) setVoiceResponseMode(incoming.voiceResponseMode);
    if (incoming.enableImage !== undefined) setEnableImage(incoming.enableImage);
    if (incoming.maxAudioDuration !== undefined) setMaxAudioDuration(incoming.maxAudioDuration);
    if (incoming.enableSessionTakeover !== undefined) setEnableSessionTakeover(incoming.enableSessionTakeover);
    if (incoming.stopKeyword !== undefined) setStopKeyword(incoming.stopKeyword);
    if (incoming.exitOutputHandle !== undefined) setExitOutputHandle(incoming.exitOutputHandle);
    if (incoming.enableTaskExecution !== undefined) setEnableTaskExecution(incoming.enableTaskExecution);
    if (incoming.enableTaskFollowUpMessage !== undefined) {
      setEnableTaskFollowUpMessage(incoming.enableTaskFollowUpMessage);
    }
    if (incoming.tasks !== undefined) setTasks(incoming.tasks);
    if (incoming.taskGroups !== undefined) setTaskGroups(incoming.taskGroups);
    if (incoming.enableGoogleCalendar !== undefined) setEnableGoogleCalendar(incoming.enableGoogleCalendar);
    if (incoming.enableLocalDentalBooking !== undefined) {
      setEnableLocalDentalBooking(incoming.enableLocalDentalBooking === true);
    }
    if (incoming.localDentalProviderDetailsSharingEnabled !== undefined) {
      setLocalDentalProviderDetailsSharingEnabled(incoming.localDentalProviderDetailsSharingEnabled !== false);
    }
    if (incoming.localDentalServiceDetailsSharingEnabled !== undefined) {
      setLocalDentalServiceDetailsSharingEnabled(incoming.localDentalServiceDetailsSharingEnabled !== false);
    }
    if (incoming.localDentalSingleSlotOfferingEnabled !== undefined) {
      setLocalDentalSingleSlotOfferingEnabled(incoming.localDentalSingleSlotOfferingEnabled === true);
    }
    if (incoming.googleCalendarId !== undefined) setGoogleCalendarId(incoming.googleCalendarId);
    if (incoming.calendarBusinessHours !== undefined) setCalendarBusinessHours(incoming.calendarBusinessHours);
    if (incoming.calendarDefaultDuration !== undefined) setCalendarDefaultDuration(incoming.calendarDefaultDuration);
    if (incoming.calendarBufferMinutes !== undefined) setCalendarBufferMinutes(incoming.calendarBufferMinutes);
    if (incoming.calendarTimeZone !== undefined) setCalendarTimeZone(incoming.calendarTimeZone);
    if (incoming.calendarAdvancedMode !== undefined) {
      setCalendarAdvancedMode(incoming.calendarAdvancedMode);
    } else {
      // Default to true if not set
      setCalendarAdvancedMode(true);
    }
    if (incoming.calendarAdvancedSettings?.weeklySchedule) {
      setCalendarWeeklySchedule(incoming.calendarAdvancedSettings.weeklySchedule);
    }
    if (incoming.calendarAdvancedSettings?.offDays) {
      setCalendarOffDays(incoming.calendarAdvancedSettings.offDays);
    }
    if (incoming.calendarOfferingSettings !== undefined) {
      setCalendarOfferingSettings(incoming.calendarOfferingSettings ?? createDefaultOfferingSettings());
    }
    if (incoming.calendarReminderSettings !== undefined) {
      setCalendarReminderSettings({
        ...createDefaultReminderSettings(),
        ...(incoming.calendarReminderSettings || {}),
      });
    }
    if (incoming.assignmentStrategy !== undefined) {
      setCalendarAssignmentStrategy(incoming.assignmentStrategy);
    }
    if (incoming.targetAgentUserId !== undefined) setCalendarTargetAgentUserId(incoming.targetAgentUserId);
    if (incoming.bookableAgentUserIds !== undefined) {
      setBookableAgentUserIds(normalizeBookableAgentUserIds(incoming.bookableAgentUserIds));
    }

    if (incoming.enableZohoCalendar !== undefined) setEnableZohoCalendar(incoming.enableZohoCalendar);
    if (incoming.zohoCalendarBusinessHours !== undefined) setZohoCalendarBusinessHours(incoming.zohoCalendarBusinessHours);
    if (incoming.zohoCalendarDefaultDuration !== undefined) setZohoCalendarDefaultDuration(incoming.zohoCalendarDefaultDuration);
    if (incoming.zohoCalendarTimeZone !== undefined) setZohoCalendarTimeZone(incoming.zohoCalendarTimeZone);
    if (incoming.zohoCalendarAdvancedMode !== undefined) {
      setZohoCalendarAdvancedMode(incoming.zohoCalendarAdvancedMode);
    } else {
      // Default to true if not set
      setZohoCalendarAdvancedMode(true);
    }
    if (incoming.zohoCalendarAdvancedSettings?.weeklySchedule) {
      setZohoCalendarWeeklySchedule(incoming.zohoCalendarAdvancedSettings.weeklySchedule);
    }
    if (incoming.zohoCalendarAdvancedSettings?.offDays) {
      setZohoCalendarOffDays(incoming.zohoCalendarAdvancedSettings.offDays);
    }
    if (incoming.zohoCalendarOfferingSettings !== undefined) {
      setZohoCalendarOfferingSettings(
        incoming.zohoCalendarOfferingSettings ?? createDefaultOfferingSettings()
      );
    }
    if (incoming.zohoCalendarReminderSettings !== undefined) {
      setZohoCalendarReminderSettings({
        ...createDefaultReminderSettings(),
        ...(incoming.zohoCalendarReminderSettings || {}),
      });
    }
    if (incoming.enableErp !== undefined) setEnableErp(incoming.enableErp);
    if (incoming.erpCatalogPriceSharingEnabled !== undefined) {
      setErpCatalogPriceSharingEnabled(incoming.erpCatalogPriceSharingEnabled);
    }
    if (incoming.erpPriceInquiryResponse !== undefined) {
      setErpPriceInquiryResponse(incoming.erpPriceInquiryResponse || ERP_PRICE_INQUIRY_RESPONSE_DEFAULT);
    }
    const persistedStrategy = normalizeAssignmentStrategyForDisplay(data.assignmentStrategy);
    if (persistedStrategy === 'customer_selected' && !incoming.enableErp) {
      setEnableErp(true);
    }
    if (incoming.erpMessageTemplate !== undefined) {
      setErpMessageTemplate(
        typeof incoming.erpMessageTemplate === 'string' ? incoming.erpMessageTemplate : ''
      );
    }
    if (incoming.erpIncludePdfLink !== undefined) setErpIncludePdfLink(!!incoming.erpIncludePdfLink);
    if (incoming.erpProductImageSendWhen !== undefined) {
      setErpProductImageSendWhen(incoming.erpProductImageSendWhen);
    }
    if (incoming.erpProductImageMultiMatchMode !== undefined) {
      setErpProductImageMultiMatchMode(incoming.erpProductImageMultiMatchMode);
    }
    if (incoming.erpProductImageMaxPerProduct !== undefined) {
      setErpProductImageMaxPerProduct(incoming.erpProductImageMaxPerProduct);
    }
    if (incoming.erpProductImageCaptionMode !== undefined) {
      setErpProductImageCaptionMode(incoming.erpProductImageCaptionMode);
    }
    if (incoming.elevenLabsApiKey !== undefined) setElevenLabsApiKey(incoming.elevenLabsApiKey);
    if (incoming.elevenLabsVoiceId !== undefined) setElevenLabsVoiceId(incoming.elevenLabsVoiceId);
    if (incoming.elevenLabsCustomVoiceId !== undefined) setElevenLabsCustomVoiceId(incoming.elevenLabsCustomVoiceId);
    if (data.elevenLabsModel !== undefined) {
      setElevenLabsModel(normalizeElevenLabsModel(data.elevenLabsModel));
    }
    if (incoming.elevenLabsStability !== undefined) setElevenLabsStability(incoming.elevenLabsStability);
    if (incoming.elevenLabsSimilarityBoost !== undefined) setElevenLabsSimilarityBoost(incoming.elevenLabsSimilarityBoost);
    if (incoming.elevenLabsStyle !== undefined) setElevenLabsStyle(incoming.elevenLabsStyle);
    if (incoming.elevenLabsUseSpeakerBoost !== undefined) setElevenLabsUseSpeakerBoost(incoming.elevenLabsUseSpeakerBoost);
    if (incoming.elevenLabsPromptInfluence !== undefined) setElevenLabsPromptInfluence(incoming.elevenLabsPromptInfluence);
    if (incoming.elevenLabsEnableAudioTags !== undefined) setElevenLabsEnableAudioTags(incoming.elevenLabsEnableAudioTags);
    if (incoming.elevenLabsAudioTagsInstructions !== undefined) setElevenLabsAudioTagsInstructions(incoming.elevenLabsAudioTagsInstructions);
    if (incoming.knowledgeBaseEnabled !== undefined) setKnowledgeBaseEnabled(incoming.knowledgeBaseEnabled === true);
    if (incoming.knowledgeBaseConfig !== undefined || incoming.vectorDatabase !== undefined) {
      setKnowledgeBaseConfig((prev) => ({
        ...prev,
        ...(incoming.knowledgeBaseConfig ?? {}),
        vectorDatabase:
          incoming.knowledgeBaseConfig?.vectorDatabase !== undefined
            ? incoming.knowledgeBaseConfig.vectorDatabase
            : incoming.vectorDatabase !== undefined
              ? incoming.vectorDatabase
              : prev.vectorDatabase,
      }));
    }
    if (incoming.pineconeApiKey !== undefined) setPineconeApiKey(incoming.pineconeApiKey);
    if (incoming.pineconeEnvironment !== undefined) setPineconeEnvironment(incoming.pineconeEnvironment);
    if (incoming.pineconeIndexName !== undefined) setPineconeIndexName(incoming.pineconeIndexName);
  }, [data]);


  useEffect(() => {
    const currentDefaultPrompt = t('flow_builder.ai_default_system_prompt', 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.');

    const enDefault = 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.';
    const esDefault = 'Eres un asistente útil. Responde las preguntas de los usuarios de manera concisa y precisa. Solo realiza acciones específicas cuando el usuario las solicite explícitamente.';
    const arDefault = 'أنت مساعد مفيد. أجب على أسئلة المستخدمين بإيجاز ودقة. قم فقط بإجراءات محددة عندما يطلبها المستخدم صراحة.';
    
    if (prompt === enDefault || prompt === esDefault || prompt === arDefault || prompt === currentDefaultPrompt) {
      const newDefaultPrompt = t('flow_builder.ai_default_system_prompt', 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.');
      if (newDefaultPrompt !== prompt) {
        setOriginalSystemPrompt(null);
        setPrompt(newDefaultPrompt);
      }
    }
  }, [language, t]);

  const handleCancelSystemPromptTemplate = useCallback(() => {
    setPendingSystemPromptTemplate(null);
    setSystemPromptTemplateConfirmOpen(false);
  }, []);

  const handleConfirmSystemPromptTemplate = useCallback(() => {
    if (!pendingSystemPromptTemplate) {
      setSystemPromptTemplateConfirmOpen(false);
      return;
    }

    const template = AI_ASSISTANT_PROMPT_TEMPLATES.find((item) => item.id === pendingSystemPromptTemplate);
    if (template) {
      setOriginalSystemPrompt(null);
      setPrompt(t(template.contentKey));
      setAppliedSystemPromptTemplate(pendingSystemPromptTemplate);
    }

    setPendingSystemPromptTemplate(null);
    setSystemPromptTemplateConfirmOpen(false);
  }, [pendingSystemPromptTemplate, t]);

  const handleSystemPromptTemplateSelect = useCallback((value: string) => {
    if (value === 'none') {
      setAppliedSystemPromptTemplate('none');
      return;
    }

    if (!isAiAssistantPromptTemplateId(value) || value === appliedSystemPromptTemplate) {
      return;
    }

    setPendingSystemPromptTemplate(value);
    setSystemPromptTemplateConfirmOpen(true);
  }, [appliedSystemPromptTemplate]);

  const pendingSystemPromptTemplateLabel = pendingSystemPromptTemplate
    ? AI_ASSISTANT_PROMPT_TEMPLATES.find((item) => item.id === pendingSystemPromptTemplate)
    : null;

  const TTS_PROVIDERS = [
    { id: 'openai', name: t('flow_builder.ai_tts_openai_name', 'OpenAI'), description: t('flow_builder.ai_tts_openai_description', 'OpenAI TTS with Whisper STT') },
    { id: 'elevenlabs', name: t('flow_builder.ai_tts_elevenlabs_name', 'ElevenLabs'), description: t('flow_builder.ai_tts_elevenlabs_description', 'ElevenLabs TTS with OpenAI Whisper STT') }
  ];


  const OPENAI_TTS_VOICES = [
    { id: 'alloy', name: 'Alloy (Neutral)' },
    { id: 'echo', name: 'Echo (Male)' },
    { id: 'fable', name: 'Fable (British Male)' },
    { id: 'onyx', name: 'Onyx (Deep Male)' },
    { id: 'nova', name: 'Nova (Female)' },
    { id: 'shimmer', name: 'Shimmer (Soft Female)' }
  ];


  const ELEVENLABS_VOICES = [
    { id: 'JaagUurP1dmW3WscoJ79', name: 'Dahlia' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Deep Male)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Warm Female)' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Strong Male)' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Young Female)' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Casual Male)' },
    { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya (Professional Female)' },
    { id: 'custom', name: '🎯 Custom Voice ID' }
  ];


  /** Per https://elevenlabs.io/docs/overview/models — v1 monolingual/multilingual models are deprecated (use Multilingual v2). */
  const ELEVENLABS_MODELS = [
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (recommended)' },
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (deprecated — prefer Flash v2.5 per ElevenLabs)' },
    { id: 'eleven_flash_v2_5', name: 'Flash v2.5 (ultra fast)' }
  ];


  const isV3Model = useCallback((modelId: string) => {
    return modelId.includes('v3') || modelId.includes('turbo_v2_5') || modelId.includes('flash_v2_5');
  }, []);

  // Task Templates
  const TASK_TEMPLATES = [
    {
      id: 'share_video',
      name: 'Share Video',
      description: '',
      functionDescription: 'Only execute this function when the user clearly asks for a video. If the video is not specified, ask which video they want. Do not trigger on general discussion about videos. Execute only after confirmation.',
      parameters: {
        type: 'object',
        properties: {
          video_type: {
            type: 'string',
            description: 'Type of video requested (tutorial, demo, promotional, etc.)'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request for the video'
          }
        },
        required: ['video_type', 'user_request']
      }
    },
    {
      id: 'share_audio',
      name: 'Share Audio',
      description: '',
      functionDescription: 'Execute this function only when the user explicitly requests an audio file or voice note. If the type of audio is unclear, ask a follow-up question. Do not assume intent.',
      parameters: {
        type: 'object',
        properties: {
          audio_type: {
            type: 'string',
            description: 'Type of audio requested (podcast, music, voice note, etc.)'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request for the audio'
          }
        },
        required: ['audio_type', 'user_request']
      }
    },
    {
      id: 'share_image',
      name: 'Share Image',
      description: '',
      functionDescription: 'Trigger this function only when the user asks for an image, screenshot, or picture. If multiple images are available, ask the user to choose. Proceed only after confirmation.',
      parameters: {
        type: 'object',
        properties: {
          image_type: {
            type: 'string',
            description: 'Type of image requested (screenshot, photo, diagram, etc.)'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request for the image'
          }
        },
        required: ['image_type', 'user_request']
      }
    },
    {
      id: 'share_document',
      name: 'Share Document',
      description: '',
      functionDescription: 'Execute this function only when the user requests a document, brochure, or file. If the document is not clearly specified, ask for clarification. Do not guess.',
      parameters: {
        type: 'object',
        properties: {
          document_type: {
            type: 'string',
            description: 'Type of document requested (brochure, manual, catalog, etc.)'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request for the document'
          }
        },
        required: ['document_type', 'user_request']
      }
    },
    {
      id: 'trigger_webhook',
      name: 'Trigger Webhook',
      description: '',
      functionDescription: 'Execute this function only when a clear action is requested that requires backend processing. Confirm critical actions before triggering the webhook. Never trigger automatically on vague messages.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to be performed'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request'
          },
          additional_data: {
            type: 'object',
            description: 'Any additional data needed for the webhook'
          }
        },
        required: ['action', 'user_request']
      }
    },
    {
      id: 'book_appointment',
      name: 'Book Appointment',
      description: '',
      functionDescription: 'Execute this function when the user clearly asks to schedule or book something. Collect required details like date and time first. Confirm before final execution.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date for the appointment in YYYY-MM-DD format'
          },
          time: {
            type: 'string',
            description: 'Time for the appointment in HH:MM format'
          },
          purpose: {
            type: 'string',
            description: 'Purpose or reason for the appointment'
          }
        },
        required: ['date', 'time']
      }
    },
    {
      id: 'capture_lead',
      name: 'Capture Lead Information',
      description: '',
      functionDescription: 'Trigger this function when the user provides contact details like name, email, or phone number. If information is incomplete, ask for missing fields. Do not execute with partial data.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Lead\'s full name'
          },
          email: {
            type: 'string',
            description: 'Lead\'s email address'
          },
          phone: {
            type: 'string',
            description: 'Lead\'s phone number'
          },
          company: {
            type: 'string',
            description: 'Lead\'s company name (optional)'
          }
        },
        required: ['name', 'email']
      }
    },
    {
      id: 'send_pricing',
      name: 'Send Pricing Details',
      description: '',
      functionDescription: 'Execute this function when the user asks for pricing, plans, or packages. If multiple plans exist, ask which one they are interested in. Send only relevant information.',
      parameters: {
        type: 'object',
        properties: {
          plan_type: {
            type: 'string',
            description: 'Type of plan or package requested'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request for pricing'
          }
        },
        required: ['plan_type', 'user_request']
      }
    },
    {
      id: 'send_product_info',
      name: 'Send Product Information',
      description: '',
      functionDescription: 'Trigger this function when the user asks about a specific product. If the product is not clear, ask for clarification. Avoid sending generic data.',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'Name of the product requested'
          },
          user_request: {
            type: 'string',
            description: 'The user\'s original request about the product'
          }
        },
        required: ['product_name', 'user_request']
      }
    },
    {
      id: 'escalate_to_human',
      name: 'Escalate to Human Agent',
      description: '',
      functionDescription: 'Execute this function when the user requests human support or shows frustration. Confirm if they want to talk to a human before escalation.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Reason for escalation'
          },
          user_message: {
            type: 'string',
            description: 'The user\'s message that triggered escalation'
          }
        },
        required: ['reason']
      }
    },
    {
      id: 'follow_up_reminder',
      name: 'Follow-Up Reminder',
      description: '',
      functionDescription: 'Trigger this function when the user agrees to be contacted later. Confirm the preferred time before scheduling the reminder.',
      parameters: {
        type: 'object',
        properties: {
          reminder_date: {
            type: 'string',
            description: 'Date for the reminder in YYYY-MM-DD format'
          },
          reminder_time: {
            type: 'string',
            description: 'Time for the reminder in HH:MM format'
          },
          reminder_topic: {
            type: 'string',
            description: 'Topic or reason for the follow-up'
          }
        },
        required: ['reminder_date', 'reminder_time']
      }
    }
  ];

  const VOICE_RESPONSE_MODES = [
    {
      id: 'always',
      name: t('flow_builder.ai_voice_mode_always', 'Always'),
      description: t('flow_builder.ai_voice_mode_always_description', 'Generate voice responses for all messages (text and voice)')
    },
    {
      id: 'voice_only',
      name: t('flow_builder.ai_voice_mode_voice_only', 'Voice-to-Voice Only'),
      description: t('flow_builder.ai_voice_only_description', 'Only generate voice responses when user sends a voice message')
    },
    {
      id: 'never',
      name: t('flow_builder.ai_voice_mode_never', 'Never'),
      description: t('flow_builder.ai_voice_mode_never_description', 'Disable voice responses (text only)')
    }
  ];


  const addTask = useCallback(() => {
    if (isAddingTask) {
      return;
    }

    setIsAddingTask(true);


    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const taskId = `task_${timestamp}_${randomSuffix}`;

    const defaultTaskName = t('flow_builder.ai_share_document_name', 'Share Document');
    
    setTasks(prevTasks => {
      const newTask: TaskDefinition = {
        id: taskId,
        name: defaultTaskName,
        description: t('flow_builder.ai_share_document_task_description', 'When user requests a document, brochure, or file to be shared'),
        functionDefinition: {
          name: generateUniqueFunctionName(defaultTaskName, prevTasks) || 'share_document',
          description: t('flow_builder.ai_share_document_desc', 'Share a document or file with the user when they request it'),
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: t('flow_builder.ai_function_param_document_type', 'Type of document requested (brochure, manual, catalog, etc.)')
              },
              user_request: {
                type: 'string',
                description: t('flow_builder.ai_function_param_user_request', 'The user\'s original request for the document')
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: taskId,
        enabled: true
      };

      return [...prevTasks, newTask];
    });


    setTimeout(() => {
      setHandleKey(prev => prev + 1);
      setIsAddingTask(false);
    }, 100);
  }, [isAddingTask, t]);

  const updateTask = useCallback((taskId: string, updates: Partial<TaskDefinition>) => {
    setTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      );


      if (updates.enabled !== undefined || updates.outputHandle !== undefined) {
        setTimeout(() => {
          setHandleKey(prev => prev + 1);
        }, 100);
      }

      return updatedTasks;
    });
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prevTasks => {
      const updatedTasks = prevTasks.filter(task => task.id !== taskId);



      setTimeout(() => {
        setHandleKey(prev => prev + 1);
      }, 100);
      return updatedTasks;
    });
  }, []);

  const getCalendarFunctions = useCallback(() => {
    if (!enableGoogleCalendar || !isGoogleCalendarConnected) return [];

    return [
      {
        id: `calendar_book_appointment_${Date.now()}`,
        name: t('flow_builder.ai_book_appointment_name', 'Book Appointment'),
        description: t('flow_builder.ai_book_appointment_desc', 'Book a new appointment in Google Calendar'),
        functionDefinition: {
          name: 'book_appointment',
          description: t('flow_builder.ai_function_book_appointment', 'Create a new calendar event/appointment in Google Calendar. Use this when the user wants to schedule a meeting or appointment. The system automatically prevents double bookings by checking for conflicts against confirmed bookings (with buffer time) and Google Calendar busy times. Times use the AI Assistant timezone, which inherits the company timezone unless explicitly overridden.'),
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: t('flow_builder.ai_function_param_title', 'Title/summary of the appointment')
              },
              description: {
                type: 'string',
                description: t('flow_builder.ai_function_param_description', 'Detailed description of the appointment')
              },
              start_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_start_datetime', 'Start date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              end_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_end_datetime', 'End date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              time_zone: {
                type: 'string',
                description: 'Legacy field. The AI Assistant timezone is authoritative for patient-facing booking dates and times.'
              },
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', description: 'Attendee email address' },
                    displayName: { type: 'string', description: 'Attendee display name (optional)' }
                  },
                  required: ['email']
                },
                description: 'Array of attendee objects with email and optional displayName (optional)'
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: t('flow_builder.ai_function_param_attendee_emails', 'Email addresses of attendees (optional, legacy format)')
              },
              location: {
                type: 'string',
                description: t('flow_builder.ai_function_param_location', 'Location of the appointment (optional)')
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send email notifications to attendees. Defaults to true.',
                default: true
              },
              organizer_email: {
                type: 'string',
                description: 'Email of the event organizer (optional, defaults to calendar owner)'
              }
            },
            required: ['title', 'start_datetime', 'end_datetime']
          }
        },
        outputHandle: `calendar_book_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_check_availability_${Date.now()}`,
        name: 'Check Availability',
        description: 'Check available time slots in Google Calendar',
        functionDefinition: {
          name: 'check_availability',
          description: 'Check available time slots in Google Calendar for scheduling appointments. Slots are shown in the AI Assistant timezone and checked against existing bookings in real time.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check availability for (YYYY-MM-DD format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: calendarDefaultDuration
              },
              start_time: {
                type: 'string',
                description: 'Earliest time to consider (HH:MM format, optional)',
                default: calendarBusinessHours.start
              },
              end_time: {
                type: 'string',
                description: 'Latest time to consider (HH:MM format, optional)',
                default: calendarBusinessHours.end
              }
            },
            required: ['date']
          }
        },
        outputHandle: `calendar_availability_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_list_events_${Date.now()}`,
        name: 'List Events',
        description: 'List existing events from Google Calendar',
        functionDefinition: {
          name: 'list_calendar_events',
          description: 'Retrieve existing calendar events from Google Calendar for a specific date range. Use this to check what appointments are already scheduled.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Start date for the range (YYYY-MM-DD format)'
              },
              end_date: {
                type: 'string',
                description: 'End date for the range (YYYY-MM-DD format)'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of events to return',
                default: 10
              }
            },
            required: ['start_date', 'end_date']
          }
        },
        outputHandle: `calendar_list_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_update_event_${Date.now()}`,
        name: 'Update Event',
        description: 'Update an existing event in Google Calendar',
        functionDefinition: {
          name: 'update_calendar_event',
          description: 'Modify an existing calendar event in Google Calendar. Use this to change appointment details like time, title, or attendees.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to update'
              },
              title: {
                type: 'string',
                description: 'New title/summary of the appointment (optional)'
              },
              description: {
                type: 'string',
                description: 'New description of the appointment (optional)'
              },
              start_datetime: {
                type: 'string',
                description: 'New start date and time in ISO format (optional)'
              },
              end_datetime: {
                type: 'string',
                description: 'New end date and time in ISO format (optional)'
              },
              time_zone: {
                type: 'string',
                description: 'Legacy field. The AI Assistant timezone is authoritative for patient-facing booking dates and times.'
              },
              location: {
                type: 'string',
                description: 'New location of the appointment (optional)'
              },
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', description: 'Attendee email address' },
                    displayName: { type: 'string', description: 'Attendee display name (optional)' }
                  },
                  required: ['email']
                },
                description: 'Array of attendee objects with email and optional displayName (optional)'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send email notifications to attendees about the update. Defaults to true.',
                default: true
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: `calendar_update_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_cancel_event_${Date.now()}`,
        name: 'Cancel Event',
        description: 'Cancel/delete an event from Google Calendar',
        functionDefinition: {
          name: 'cancel_calendar_event',
          description: 'Cancel or delete a calendar event from Google Calendar. Use this to remove appointments that are no longer needed. You can provide either the event_link (preferred), event_id, OR the date/time/email to find and cancel the event. IMPORTANT: The event_link is the primary identifier - it is the link provided to the user when the appointment was booked. The handler can derive the event ID from the provided link.',
          parameters: {
            type: 'object',
            properties: {
              event_link: {
                type: 'string',
                description: 'The Google Calendar event link provided when the appointment was booked. This is the preferred method for cancellation as it is the most reliable. Example: https://www.google.com/calendar/event?eid=abc123'
              },
              event_id: {
                type: 'string',
                description: 'ID of the event to cancel/delete. If not provided, event_link or date and time must be provided to find the event.'
              },
              date: {
                type: 'string',
                description: 'Date of the appointment to cancel. MUST be in YYYY-MM-DD format (e.g., "2025-11-10"). Convert user input like "10/11/2025", "November 10", or "tomorrow" to this format before calling. Required if event_id or event_link is not provided.'
              },
              time: {
                type: 'string',
                description: 'Time of the appointment to cancel. MUST be in HH:MM format using 24-hour notation (e.g., "16:15" for 4:15 PM). Convert user input like "4:15 PM", "4:15 pm", or "16:15" to this format before calling. Required if event_id or event_link is not provided.'
              },
              attendee_email: {
                type: 'string',
                description: 'Email address of the attendee to help identify the correct event when using date/time lookup'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send cancellation notifications to attendees',
                default: true
              }
            },
            required: []
          }
        },
        outputHandle: `calendar_cancel_${Date.now()}`,
        enabled: true
      }
    ];
  }, [enableGoogleCalendar, isGoogleCalendarConnected, calendarDefaultDuration, calendarBusinessHours]);


  const getZohoCalendarFunctions = useCallback(() => {
    if (!enableZohoCalendar || !isZohoCalendarConnected) {
      return [];
    }

    return [
      {
        id: `zoho_calendar_book_appointment_${Date.now()}`,
        name: t('flow_builder.ai_zoho_book_appointment_name', 'Book Zoho Appointment'),
        description: t('flow_builder.ai_zoho_book_appointment_desc', 'Book a new appointment in Zoho Calendar'),
        functionDefinition: {
          name: 'zoho_book_appointment',
          description: t('flow_builder.ai_function_zoho_book_appointment', 'Create a new calendar event/appointment in Zoho Calendar. Use this when the user wants to schedule a meeting or appointment.'),
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: t('flow_builder.ai_function_param_title', 'Title/summary of the appointment')
              },
              description: {
                type: 'string',
                description: t('flow_builder.ai_function_param_description', 'Detailed description of the appointment')
              },
              start_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_start_datetime', 'Start date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              end_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_end_datetime', 'End date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: t('flow_builder.ai_function_param_attendee_emails', 'Email addresses of attendees (optional)')
              },
              location: {
                type: 'string',
                description: t('flow_builder.ai_function_param_location', 'Location of the appointment (optional)')
              }
            },
            required: ['title', 'start_datetime', 'end_datetime']
          }
        },
        outputHandle: `zoho_calendar_book_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_check_availability_${Date.now()}`,
        name: 'Check Zoho Availability',
        description: 'Check available time slots in Zoho Calendar',
        functionDefinition: {
          name: 'zoho_check_availability',
          description: 'Check available time slots in Zoho Calendar for scheduling appointments. Use this to find free time slots before booking.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check availability for (YYYY-MM-DD format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: zohoCalendarDefaultDuration
              },
              start_time: {
                type: 'string',
                description: 'Earliest time to consider (HH:MM format, optional)',
                default: zohoCalendarBusinessHours.start
              },
              end_time: {
                type: 'string',
                description: 'Latest time to consider (HH:MM format, optional)',
                default: zohoCalendarBusinessHours.end
              }
            },
            required: ['date']
          }
        },
        outputHandle: `zoho_calendar_availability_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_list_events_${Date.now()}`,
        name: 'List Zoho Events',
        description: 'List existing events from Zoho Calendar',
        functionDefinition: {
          name: 'zoho_list_calendar_events',
          description: 'Retrieve existing calendar events from Zoho Calendar for a specific date range. Use this to check what appointments are already scheduled.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Start date for the range (YYYY-MM-DD format)'
              },
              end_date: {
                type: 'string',
                description: 'End date for the range (YYYY-MM-DD format)'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of events to return',
                default: 10
              }
            },
            required: ['start_date', 'end_date']
          }
        },
        outputHandle: `zoho_calendar_list_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_update_event_${Date.now()}`,
        name: 'Update Zoho Event',
        description: 'Update an existing event in Zoho Calendar',
        functionDefinition: {
          name: 'zoho_update_calendar_event',
          description: 'Modify an existing calendar event in Zoho Calendar. Use this to change appointment details like time, title, or attendees.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to update'
              },
              title: {
                type: 'string',
                description: 'New title/summary of the appointment (optional)'
              },
              description: {
                type: 'string',
                description: 'New description of the appointment (optional)'
              },
              start_datetime: {
                type: 'string',
                description: 'New start date and time in ISO format (optional)'
              },
              end_datetime: {
                type: 'string',
                description: 'New end date and time in ISO format (optional)'
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'New attendee email addresses (optional)'
              },
              location: {
                type: 'string',
                description: 'New location of the appointment (optional)'
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: `zoho_calendar_update_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_cancel_event_${Date.now()}`,
        name: 'Cancel Zoho Event',
        description: 'Cancel/delete an event from Zoho Calendar',
        functionDefinition: {
          name: 'zoho_cancel_calendar_event',
          description: 'Cancel or delete a calendar event from Zoho Calendar. Use this to remove appointments that are no longer needed.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to cancel/delete'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send cancellation notifications to attendees',
                default: true
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: `zoho_calendar_cancel_${Date.now()}`,
        enabled: true
      }
    ];
  }, [enableZohoCalendar, isZohoCalendarConnected, zohoCalendarDefaultDuration, zohoCalendarBusinessHours]);















  const addTaskFromTemplate = useCallback((template: any) => {
    if (isAddingTask) {
      return;
    }

    setIsAddingTask(true);

    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const taskId = `task_${timestamp}_${randomSuffix}`;

    setTasks(prevTasks => {
      const uniqueFunctionName = generateUniqueFunctionName(template.name, prevTasks);
      
      const newTask: TaskDefinition = {
        id: taskId,
        name: template.name,
        description: template.description || '',
        functionDefinition: {
          name: uniqueFunctionName,
          description: template.functionDescription,
          parameters: template.parameters || {
            type: 'object',
            properties: {},
            required: []
          }
        },
        outputHandle: taskId,
        enabled: true
      };

      return [...prevTasks, newTask];
    });

    setTimeout(() => {
      setHandleKey(prev => prev + 1);
      setIsAddingTask(false);
    }, 100);
  }, [isAddingTask]);

  const currentProvider = AI_PROVIDERS.find(p => p.id === provider);
  const catalogModels = currentProvider?.models || [];
  const uniqueCatalogModels = catalogModels.filter(
    (entry, index) => catalogModels.findIndex((item) => item.id === entry.id) === index
  );
  const isCustomOpenAiModel = provider === 'openai' && !OPENAI_MODELS.some((entry) => entry.id === model);
  const modelSelectValue = isCustomOpenAiModel ? CUSTOM_OPENAI_MODEL_VALUE : model;
  const availableModels = provider === 'openai' || uniqueCatalogModels.some((entry) => entry.id === model) || !model
    ? uniqueCatalogModels
    : [{ id: model, name: `${model} (saved)`, supportsTools: true, supportsImage: true }, ...uniqueCatalogModels];
  const selectedModelInfo = availableModels.find((entry) => entry.id === model);
  const selectedModelSupportsImage = selectedModelInfo?.supportsImage === true ||
    (provider === 'openai' && getOpenAiModelCapabilities(model)?.supportsImage === true);
  const pickPreferredImageModel = useCallback((models: Provider['models']) => {
    const preferredIds = [AI_ASSISTANT_DEFAULT_MODEL, AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL];
    for (const preferredId of preferredIds) {
      const preferredModel = models.find((entry) => entry.id === preferredId && entry.supportsImage === true);
      if (preferredModel) {
        return preferredModel;
      }
    }
    return models.find((entry) => entry.supportsImage === true);
  }, []);
  const currentProviderImageModel = pickPreferredImageModel(availableModels);

  useEffect(() => {
    if (enableImage && !selectedModelSupportsImage) {
      setEnableImage(false);
    }
  }, [enableImage, selectedModelSupportsImage]);

  useEffect(() => {
    if (
      provider !== 'azure' ||
      !initialModelWasMissingRef.current ||
      availableModels.length === 0
    ) {
      return;
    }
    const nextModelId = pickPreferredAiAssistantAzureChatModel(availableModels);
    if (nextModelId) {
      setModel(nextModelId);
      initialModelWasMissingRef.current = false;
    }
  }, [provider, availableModels]);

  const updateNodeData = useCallback((updates: any) => {

    isUpdatingRef.current = true;
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );

    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [id, setNodes]);

  useEffect(() => () => systemPromptEnhancementAbortRef.current?.abort(), []);

  useEffect(() => {
    if (isEditing) return;
    systemPromptEnhancementAbortRef.current?.abort();
    systemPromptEnhancementAbortRef.current = null;
    setIsEnhancingSystemPrompt(false);
    setOriginalSystemPrompt(null);
  }, [isEditing]);

  const enhanceSystemPrompt = async () => {
    const original = prompt;
    const trimmed = original.trim();
    if (!trimmed || isEnhancingSystemPrompt) return;
    if (credentialSource === 'manual' && !apiKey.trim()) {
      toast({
        variant: 'destructive',
        title: t('flow_builder.ai_prompt_enhance_error_title', 'Unable to enhance prompt'),
        description: t('flow_builder.ai_prompt_enhance_manual_key', 'Enter a manual API key or choose another credential source.'),
      });
      return;
    }

    const controller = new AbortController();
    systemPromptEnhancementAbortRef.current?.abort();
    systemPromptEnhancementAbortRef.current = controller;
    setOriginalSystemPrompt(null);
    setIsEnhancingSystemPrompt(true);
    try {
      const response = await fetch('/api/ai-assist/enhance-system-prompt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: trimmed,
          provider,
          model,
          credentialSource,
          ...(credentialSource === 'manual' ? { apiKey } : {}),
          ...(provider === 'azure' && credentialSource === 'manual'
            ? { azureEndpoint, azureApiVersion }
            : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      const enhanced = typeof result.message === 'string' ? result.message.trim() : '';
      if (!response.ok || !enhanced) {
        const errorKey = result.code === 'NO_AI_CREDENTIALS'
          ? 'flow_builder.ai_prompt_enhance_credentials_error'
          : result.code === 'INVALID_REQUEST'
            ? 'flow_builder.ai_prompt_enhance_invalid_request'
            : 'flow_builder.ai_prompt_enhance_error_description';
        const fallback = result.code === 'NO_AI_CREDENTIALS'
          ? 'No valid AI credentials are available for the selected provider.'
          : result.code === 'INVALID_REQUEST'
            ? 'The system prompt enhancement request is invalid.'
            : 'The system prompt could not be enhanced.';
        throw new Error(t(errorKey, fallback));
      }
      setOriginalSystemPrompt(original);
      setPrompt(enhanced);
      updateNodeData({ prompt: enhanced });
    } catch (error) {
      if (!controller.signal.aborted) {
        toast({
          variant: 'destructive',
          title: t('flow_builder.ai_prompt_enhance_error_title', 'Unable to enhance prompt'),
          description: error instanceof Error ? error.message : t('flow_builder.ai_prompt_enhance_error_description', 'The system prompt could not be enhanced.'),
        });
      }
    } finally {
      if (systemPromptEnhancementAbortRef.current === controller) {
        systemPromptEnhancementAbortRef.current = null;
        setIsEnhancingSystemPrompt(false);
      }
    }
  };

  const undoSystemPromptEnhancement = () => {
    if (originalSystemPrompt === null) return;
    const original = originalSystemPrompt;
    setOriginalSystemPrompt(null);
    setPrompt(original);
    updateNodeData({ prompt: original });
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateNodeData({ aiVariables });
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [aiVariables, updateNodeData]);

  useEffect(() => {
    const timeoutId = setTimeout(() => updateNodeData({ customFieldBindings }), 150);
    return () => clearTimeout(timeoutId);
  }, [customFieldBindings, updateNodeData]);

  const handleTaskDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;

      const srcKey = droppableIdToTaskBucketKey(result.source.droppableId);
      const dstKey = droppableIdToTaskBucketKey(result.destination.droppableId);
      const movedId = result.draggableId;
      const srcIdx = result.source.index;
      const dstIdx = result.destination.index;

      if (srcKey === dstKey && srcIdx === dstIdx) return;

      const structure = getTaskBucketStructure(tasks, taskGroups);
      const map = new Map(structure.map((b) => [b.key, [...b.ids]]));

      if (srcKey === dstKey) {
        const list = map.get(srcKey)!;
        if (list[srcIdx] !== movedId) return;
        const reordered = Array.from(list);
        const [removed] = reordered.splice(srcIdx, 1);
        reordered.splice(dstIdx, 0, removed);
        map.set(srcKey, reordered);
        const newGroupId = srcKey === 'ungrouped' ? null : srcKey;
        setTasks(rebuildTasksFromBuckets(map, structure, tasks, movedId, newGroupId));
      } else {
        const srcList = map.get(srcKey)!;
        const dstList = map.get(dstKey)!;
        if (srcList[srcIdx] !== movedId) return;
        srcList.splice(srcIdx, 1);
        dstList.splice(dstIdx, 0, movedId);
        const newGroupId = dstKey === 'ungrouped' ? null : dstKey;
        setTasks(rebuildTasksFromBuckets(map, structure, tasks, movedId, newGroupId));
      }

      setTimeout(() => {
        updateNodeInternals(id);
        setHandleKey((prev) => prev + 1);
      }, 100);
    },
    [tasks, taskGroups, id, updateNodeInternals]
  );

  const addTaskGroup = useCallback(() => {
    const newId = `tg_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    setTaskGroups((prev) => [
      ...prev,
      { id: newId, name: t('flow_builder.ai_task_group_new_name', 'New group') }
    ]);
  }, [t]);

  const updateTaskGroupName = useCallback((groupId: string, name: string) => {
    setTaskGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }, []);

  const removeTaskGroup = useCallback(
    (groupId: string) => {
      const count = tasks.filter((task) => task.groupId === groupId).length;
      if (count > 0) {
        const ok = window.confirm(
          t(
            'flow_builder.ai_task_group_delete_confirm',
            'This group has {{count}} task(s). Delete the group and move those tasks to Ungrouped?',
            { count }
          )
        );
        if (!ok) return;
      }
      setTaskGroups((prev) => prev.filter((g) => g.id !== groupId));
      setTasks((prev) =>
        prev.map((task) => (task.groupId === groupId ? { ...task, groupId: null } : task))
      );
    },
    [tasks, t]
  );

  const isTaskGroupSectionOpen = useCallback(
    (sectionKey: string) => taskGroupSectionsOpen[sectionKey] !== false,
    [taskGroupSectionsOpen]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateNodeData({ tasks });
    }, 50); // Small debounce to batch rapid task changes

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, tasks]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateNodeData({ taskGroups });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, taskGroups]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const calendarFunctions = getCalendarFunctions();
      updateNodeData({ calendarFunctions });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, getCalendarFunctions]);


  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const zohoCalendarFunctions = getZohoCalendarFunctions();
      updateNodeData({ zohoCalendarFunctions });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, getZohoCalendarFunctions]);

  useEffect(() => {

      if (isUpdatingRef.current) return;
      
      updateNodeData({
        provider,
        model,
        apiKey,
        azureEndpoint,
        azureApiVersion,
        credentialSource,

        language: language,
        timezone: assistantTimezone,
        prompt,
        enableHistory,
        historyLimit,
        maxOutputTokens,
        enableTextToSpeech,
        ...(enableVoiceProcessing !== undefined ? { enableVoiceProcessing } : {}),
        ttsProvider,
        ttsVoice,
        voiceResponseMode,
        enableImage,
        maxAudioDuration,
        enableSessionTakeover,
        stopKeyword,
        exitOutputHandle,
        enableTaskExecution,
        enableTaskFollowUpMessage,
        enableGoogleCalendar,
        enableLocalDentalBooking,
        localDentalProviderDetailsSharingEnabled,
        localDentalServiceDetailsSharingEnabled,
        localDentalSingleSlotOfferingEnabled,
        googleCalendarId,
        calendarBusinessHours,
        calendarDefaultDuration,
        calendarBufferMinutes,
        calendarTimeZone,
        calendarAdvancedMode,
        calendarAdvancedSettings: {
          weeklySchedule: calendarWeeklySchedule,
          offDays: calendarOffDays
        },
        calendarOfferingSettings,
        calendarReminderSettings,
        calendarFunctions: getCalendarFunctions(),
        assignmentStrategy: assignmentStrategyForPersistence(calendarAssignmentStrategy),
        targetAgentUserId: calendarTargetAgentUserId,
        bookableAgentUserIds,

        enableZohoCalendar,
        zohoCalendarBusinessHours,
        zohoCalendarDefaultDuration,
        zohoCalendarTimeZone,
        zohoCalendarAdvancedMode,
        zohoCalendarAdvancedSettings: {
          weeklySchedule: zohoCalendarWeeklySchedule,
          offDays: zohoCalendarOffDays
        },
        zohoCalendarOfferingSettings,
        zohoCalendarReminderSettings,
      zohoCalendarFunctions: getZohoCalendarFunctions(),

      enableErp,
      erpCatalogPriceSharingEnabled,
      erpPriceInquiryResponse:
        erpPriceInquiryResponse.trim() || ERP_PRICE_INQUIRY_RESPONSE_DEFAULT,
      erpMessageTemplate,
      erpIncludePdfLink,
      erpProductImageSendWhen,
      erpProductImageMultiMatchMode,
      erpProductImageMaxPerProduct,
      erpProductImageCaptionMode,

      knowledgeBaseEnabled,
      knowledgeBaseConfig,
      vectorDatabase: knowledgeBaseConfig.vectorDatabase,

      pineconeApiKey,
      pineconeEnvironment,
      pineconeIndexName,

      elevenLabsApiKey,
      elevenLabsVoiceId,
      elevenLabsCustomVoiceId,
      elevenLabsModel,
      elevenLabsStability,
      elevenLabsSimilarityBoost,
      elevenLabsStyle,
      elevenLabsUseSpeakerBoost,
      elevenLabsPromptInfluence,
      elevenLabsEnableAudioTags,
      elevenLabsAudioTagsInstructions
    });
  }, [
    updateNodeData,
    provider,
    model,
    apiKey,
    azureEndpoint,
    azureApiVersion,
    credentialSource,

    assistantTimezone,
    prompt,
    enableHistory,
    historyLimit,
    maxOutputTokens,
    enableTextToSpeech,
    enableVoiceProcessing,
    ttsProvider,
    ttsVoice,
    voiceResponseMode,
    enableImage,
    maxAudioDuration,
    enableSessionTakeover,
    stopKeyword,
    exitOutputHandle,
    enableTaskExecution,
    enableTaskFollowUpMessage,
    enableGoogleCalendar,
    enableLocalDentalBooking,
    localDentalProviderDetailsSharingEnabled,
    localDentalServiceDetailsSharingEnabled,
    localDentalSingleSlotOfferingEnabled,
    googleCalendarId,
    calendarBusinessHours,
    calendarDefaultDuration,
    calendarBufferMinutes,
    calendarTimeZone,
    calendarAdvancedMode,
    calendarWeeklySchedule,
    calendarOffDays,
    calendarOfferingSettings,
    calendarReminderSettings,
    calendarAssignmentStrategy,
    calendarTargetAgentUserId,
    bookableAgentUserIds,
    getCalendarFunctions,
    enableZohoCalendar,
    zohoCalendarBusinessHours,
    zohoCalendarDefaultDuration,
    zohoCalendarTimeZone,
    zohoCalendarAdvancedMode,
    zohoCalendarWeeklySchedule,
    zohoCalendarOffDays,
    zohoCalendarOfferingSettings,
    zohoCalendarReminderSettings,
    getZohoCalendarFunctions,
    enableErp,
    erpCatalogPriceSharingEnabled,
    erpPriceInquiryResponse,
    erpMessageTemplate,
    erpIncludePdfLink,
    erpProductImageSendWhen,
    erpProductImageMultiMatchMode,
    erpProductImageMaxPerProduct,
    erpProductImageCaptionMode,
    knowledgeBaseEnabled,
    knowledgeBaseConfig,
    pineconeApiKey,
    pineconeEnvironment,
    pineconeIndexName,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    elevenLabsCustomVoiceId,
    elevenLabsModel,
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsUseSpeakerBoost,
    elevenLabsPromptInfluence,
    elevenLabsEnableAudioTags,
    elevenLabsAudioTagsInstructions
  ]);


  useEffect(() => {
    if (handleKey > 0) {

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                _handleKey: handleKey // Internal key to trigger re-render
              }
            };
          }
          return node;
        })
      );
    }
  }, [handleKey, id, setNodes]);

  const handleProviderChange = (value: string) => {
    setProvider(value);
    if (value === 'openrouter') {
      setEnableTextToSpeech(false);
    }
    const newProvider = AI_PROVIDERS.find(p => p.id === value);
    if (value === 'azure') {
      if (!newProvider || newProvider.models.length === 0) {
        setModel('');
        initialModelWasMissingRef.current = true;
        if (enableImage) {
          setEnableImage(false);
          setImageModelPromptOpen(true);
        }
        return;
      }
      const nextModelId = pickPreferredAiAssistantAzureChatModel(newProvider?.models ?? []);
      const nextModel = newProvider?.models.find((entry) => entry.id === nextModelId);
      setModel(nextModelId);
      initialModelWasMissingRef.current = false;
      const nextModelSupportsImage = nextModel?.supportsImage !== false;
      if (enableImage && !nextModelSupportsImage) {
        setEnableImage(false);
        setImageModelPromptOpen(true);
      }
      return;
    }
    const preferredModelId = value === 'openrouter'
      ? AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL
      : AI_ASSISTANT_DEFAULT_MODEL;
    const nextModel = newProvider?.models.find((entry) => entry.id === preferredModelId);
    setModel(preferredModelId);
    initialModelWasMissingRef.current = false;
    const nextModelSupportsImage = nextModel?.supportsImage === true;
    if (enableImage && !nextModelSupportsImage) {
      setEnableImage(false);
      setImageModelPromptOpen(true);
    }
  };

  const handleModelChange = (value: string) => {
    if (provider === 'openai' && value === CUSTOM_OPENAI_MODEL_VALUE) {
      setModel('');
      if (enableImage) {
        setEnableImage(false);
        setImageModelPromptOpen(true);
      }
      return;
    }
    const nextModel = availableModels.find((entry) => entry.id === value);
    const nextModelSupportsImage = nextModel?.supportsImage === true;
    setModel(value);
    if (enableImage && !nextModelSupportsImage) {
      setEnableImage(false);
      setImageModelPromptOpen(true);
    }
  };

  const handleCustomOpenAiModelChange = (value: string) => {
    setModel(value.trim().slice(0, 200));
  };

  const handleKnowledgeBaseEnabledChange = useCallback((enabled: boolean) => {
    setKnowledgeBaseEnabled(enabled);
    if (!enabled) {
      return;
    }

    if (provider === 'azure') {
      const current = availableModels.find((entry) => entry.id === model);
      const preferredId = pickPreferredAzureChatModel(availableModels);
      const targetModel = current || availableModels.find((entry) => entry.id === preferredId) || availableModels[0];
      if (targetModel && targetModel.id !== model) {
        setModel(targetModel.id);
      }
      return;
    }

    const preferredModelId = RAG_PREFERRED_MODEL_BY_PROVIDER[provider] ?? 'gpt-4o';
    let targetModel = availableModels.find((entry) => entry.id === preferredModelId);

    if (!targetModel) {
      const openAiProvider = AI_PROVIDERS.find((entry) => entry.id === 'openai');
      targetModel = openAiProvider?.models.find((entry) => entry.id === 'gpt-4o');
      if (targetModel) {
        setProvider('openai');
      }
    }

    if (!targetModel) {
      return;
    }

    setModel(targetModel.id);
    if (enableImage && !targetModel.supportsImage) {
      setEnableImage(false);
    }
  }, [provider, model, availableModels, enableImage, AI_PROVIDERS]);

  const handleImageToggle = (checked: boolean) => {
    if (!checked) {
      setEnableImage(false);
      return;
    }

    if (!selectedModelSupportsImage) {
      setEnableImage(false);
      setImageModelPromptOpen(true);
      return;
    }

    setEnableImage(true);
  };

  const handleSttToggle = (checked: boolean) => {
    setEnableVoiceProcessing(checked);
  };

  const handleTtsToggle = (checked: boolean) => {
    if (provider === 'openrouter' && checked) {
      return;
    }
    setEnableTextToSpeech(checked);
  };

  const autoSelectImageSupportedModel = () => {
    if (currentProviderImageModel) {
      setModel(currentProviderImageModel.id);
      setEnableImage(true);
      setImageModelPromptOpen(false);
      toast({
        title: t('flow_builder.ai_image_model_auto_selected_title', 'Image-compatible model selected'),
        description: t('flow_builder.ai_image_model_auto_selected_desc', 'Enabled image understanding with {{model}}.', {
          model: currentProviderImageModel.name
        })
      });
      return;
    }

    const providerWithImageModel = AI_PROVIDERS.find((providerEntry) =>
      Boolean(pickPreferredImageModel(providerEntry.models))
    );

    const fallbackImageModel = providerWithImageModel
      ? pickPreferredImageModel(providerWithImageModel.models)
      : undefined;
    if (!providerWithImageModel || !fallbackImageModel) {
      toast({
        title: t('flow_builder.ai_image_model_none_available_title', 'No image-compatible model found'),
        description: t('flow_builder.ai_image_model_none_available_desc', 'No configured provider currently has a model that supports image input.'),
        variant: 'destructive'
      });
      return;
    }

    setProvider(providerWithImageModel.id);
    setModel(fallbackImageModel.id);
    setEnableImage(true);
    setImageModelPromptOpen(false);
    toast({
      title: t('flow_builder.ai_image_model_auto_selected_title', 'Image-compatible model selected'),
      description: t('flow_builder.ai_image_model_auto_selected_cross_provider_desc', 'Switched to {{provider}} · {{model}} for image understanding.', {
        provider: providerWithImageModel.name,
        model: fallbackImageModel.name
      })
    });
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setOriginalSystemPrompt(null);
    setPrompt(e.target.value);
  };

  const getApiDocUrl = (): string => {
    switch (provider) {
      case 'openai':
        return 'https://platform.openai.com/api-keys';
      case 'openrouter':
        return 'https://openrouter.ai/keys';
      case 'azure':
        return 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI';
      default:
        return '#';
    }
  };

  const getProviderDisplayName = (): string => {
    return AI_PROVIDERS.find(p => p.id === provider)?.name || t('flow_builder.ai_provider_fallback', 'AI Provider');
  };

  const getProviderIcon = () => (
    <AiProviderIcon provider={provider} size={16} className={provider === 'openai' ? 'h-4 w-4 shrink-0 text-emerald-600' : 'h-4 w-4 shrink-0'} />
  );

  const handleInteractivePointerCapture = (event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const interactive = target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
    if (!interactive) return;
    event.stopPropagation();
  };

  /** Percent positions use % of full node height; short summary cards need extra min-height so handles do not overlap. */
  const collapsedOutputHandlesMinHeightPx = useMemo(() => {
    if (isEditing || !enableTaskExecution) return undefined;
    const manualEnabled = tasks.filter((task) => task.enabled);
    const totalHandles = manualEnabled.length + (enableSessionTakeover ? 1 : 0);
    if (totalHandles <= 1) return undefined;
    const spacingPercent = Math.min(15, 60 / Math.max(totalHandles, 1));
    const minGapPx = 18;
    return Math.ceil((minGapPx * 100) / spacingPercent);
  }, [isEditing, enableTaskExecution, tasks, enableSessionTakeover]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      updateNodeInternals(id);
    });
    return () => cancelAnimationFrame(raf);
  }, [id, collapsedOutputHandlesMinHeightPx, completionVarNames.length, updateNodeInternals]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    enableGoogleCalendar,
    isGoogleCalendarConnected,
    mcpConnectionInfo.nodeCount,
    mcpConnectionInfo.callableSum,
    id,
    updateNodeInternals,
  ]);

  return (
    <div
      className={`node-ai-assistant rounded-lg bg-card border border-emerald-200 dark:border-emerald-900 shadow-sm group relative ${isEditing ? 'min-w-[420px] max-w-[550px]' : 'min-w-[260px] max-w-[360px]'}`}
      style={collapsedOutputHandlesMinHeightPx != null ? { minHeight: collapsedOutputHandlesMinHeightPx } : undefined}
      onPointerDownCapture={handleInteractivePointerCapture}
      onMouseDownCapture={handleInteractivePointerCapture}
    >
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Fixed Header */}
      <div className="p-3 border-b border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-900/10">
        <div className="font-medium flex items-center gap-2">
          {getProviderIcon()}
          <span>{t('flow_builder.ai_assistant', 'AI Assistant')}</span>
         <button data-tour="components-flow-builder-aiassistantnode.button.common.hide"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {t('common.hide', 'Hide')}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t('common.edit', 'Edit')}
                  </>
                )}
              </button>
        </div>
      </div>

      {/* Content without scrollbar interference */}
      <div>
        <div className="p-3 space-y-3">

          {/* Configuration Summary */}
          <div className={`text-sm rounded border border-border ${isEditing ? 'p-3' : 'p-2'}`}>
            <div className="flex items-center gap-1 mb-1">
              <Settings className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{getProviderDisplayName()}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {availableModels.find(m => m.id === model)?.name || model}
              </span>
            </div>

            <div className="text-xs text-muted-foreground mb-1 line-clamp-2">
              {(() => {
                const maxLength = isEditing ? 80 : 50;
                if (prompt.length > maxLength) {
                  return prompt.substring(0, maxLength) + '...';
                }
                return prompt;
              })()}
            </div>

            <div className="flex flex-wrap gap-1">
              {enableHistory && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_history', 'History:')} {historyLimit}
                </span>
              )}
              {enableTaskExecution && tasks.filter(task => task.enabled).length > 0 && (
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_tasks', 'Tasks:')} {tasks.filter(task => task.enabled).length}
                </span>
              )}
              {activeWritableVarNames.length > 0 && (
                <span className="text-[10px] bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                  Vars: {activeWritableVarNames.length}
                </span>
              )}
              {enableTextToSpeech && (
                <span className="text-[10px] bg-pink-100 dark:bg-pink-900/20 text-pink-800 dark:text-pink-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_tts', 'TTS:')} {VOICE_RESPONSE_MODES.find(m => m.id === voiceResponseMode)?.name || t('flow_builder.ai_voice_mode_always', 'Always')}
                </span>
              )}
              {(enableVoiceProcessing ?? provider === 'openai') && (
                <span className="text-[10px] bg-violet-100 dark:bg-violet-900/20 text-violet-800 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_stt', 'STT')}
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                enableImage
                  ? (selectedModelSupportsImage
                    ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
                    : 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400')
                  : 'bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
              }`}>
                {enableImage
                  ? (selectedModelSupportsImage
                    ? t('flow_builder.ai_image_summary_raw_analysis', 'Image: Raw + analysis')
                    : t('flow_builder.ai_image_summary_analysis_only', 'Image: Analysis only'))
                  : t('flow_builder.ai_image_summary_off', 'Image: Off')}
              </span>
              {enableTextToSpeech && maxAudioDuration && maxAudioDuration < 30 && (
                <span className="text-[10px] bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_audio', 'Audio:')} {t('flow_builder.ai_summary_audio_max', '{{duration}}s max', { duration: maxAudioDuration })}
                </span>
              )}
              {!!(maxOutputTokens && maxOutputTokens < 500) && (
                <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_max_tokens', 'Tokens:')} {maxOutputTokens}
                </span>
              )}
              {knowledgeBaseEnabled && (
                <span className="text-[10px] bg-lime-100 dark:bg-lime-900/20 text-lime-800 dark:text-lime-400 px-1.5 py-0.5 rounded-full">
                  {knowledgeBaseConfig.vectorDatabase
                    ? t('flow_builder.ai_summary_rag_with_db', 'RAG: {{db}}', {
                        db: knowledgeBaseConfig.vectorDatabase === 'pinecone' ? 'Pinecone' : 'pgvector',
                      })
                    : t('flow_builder.ai_summary_rag', 'RAG: On')}
                </span>
              )}
              {!isEditing && mcpConnectionInfo.nodeCount > 0 && (
                <span className="text-[10px] bg-teal-100 dark:bg-teal-900/25 text-teal-800 dark:text-teal-300 px-1.5 py-0.5 rounded-full">
                  {mcpConnectionInfo.hasDiscovery
                    ? t('flow_builder.ai.mcp_nodes_and_tools', 'MCP: {{nodes}} node(s), {{tools}} callable tool(s)', {
                        nodes: mcpConnectionInfo.nodeCount,
                        tools: mcpConnectionInfo.callableSum,
                      })
                    : t('flow_builder.ai.mcp_nodes_connected', 'MCP: {{nodes}} node(s) connected', {
                        nodes: mcpConnectionInfo.nodeCount,
                      })}
                </span>
              )}

            </div>
          </div>

          {isEditing && (
            <>
              {/* AI Configuration Section */}
              <div className="border rounded-lg p-3 ">
                <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {t('flow_builder.ai_configuration', 'AI Configuration')}
                </h3>
                <p className="text-[10px] text-muted-foreground mb-3">
                  {t('flow_builder.ai_configuration_runtime_help', 'Chat provider and model selection for the AI SDK runtime and tool layer.')}
                </p>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 items-start">
                    <div className="flex flex-col">
                      <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_provider', 'AI Provider')}</Label>
                      <Select value={provider} onValueChange={handleProviderChange} disabled={isEnhancingSystemPrompt}>
                        <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_select_provider" className="text-xs h-7 mt-1">
                          <SelectValue placeholder={t('flow_builder.ai_select_provider', 'Select provider')} />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_PROVIDERS.map((providerOption) => (
                            <SelectItem key={providerOption.id} value={providerOption.id}>
                              <AiProviderOption provider={providerOption.id} label={providerOption.name} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col">
                      <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 min-h-[14px]">
                        {t('flow_builder.ai_model', 'Model')}
                        {(provider === 'openrouter' || provider === 'azure') && isLoadingModels && (
                          <RefreshCw className="w-3 h-3 animate-spin text-blue-500 dark:text-blue-400" />
                        )}
                      </Label>
                      <Select value={modelSelectValue} onValueChange={handleModelChange} disabled={isEnhancingSystemPrompt || ((provider === 'openrouter' || provider === 'azure') && isLoadingModels && availableModels.length === 0)}>
                        <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_loading_models" className="text-xs h-7 mt-1">
                          <SelectValue placeholder={
                            provider === 'openrouter' && isLoadingModels
                              ? t('flow_builder.ai_loading_models', 'Loading models...')
                              : t('flow_builder.ai_select_model', 'Select model')
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.length === 0 ? (
                            <SelectItem value="no-models" disabled>
                              {(provider === 'openrouter' || provider === 'azure') && isLoadingModels
                                ? t('flow_builder.ai_loading_models', 'Loading models...')
                                : t('flow_builder.ai_no_models', 'No models available')
                              }
                            </SelectItem>
                          ) : (
                            availableModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{model.name}</span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                          {provider === 'openai' && (
                            <SelectItem value={CUSTOM_OPENAI_MODEL_VALUE}>
                              {t('flow_builder.ai_custom_model', 'Custom model')}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {provider === 'openai' && isCustomOpenAiModel && (
                        <div className="mt-1">
                          <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_custom_model_placeholder"
                            disabled={isEnhancingSystemPrompt}
                            value={model}
                            onChange={(e) => handleCustomOpenAiModelChange(e.target.value)}
                            placeholder={t('flow_builder.ai_custom_model_placeholder', 'Enter an OpenAI model ID')}
                            maxLength={200}
                            required
                            aria-label={t('flow_builder.ai_custom_model', 'Custom model')}
                            aria-invalid={!model}
                            className={cn('text-xs h-7', !model && 'border-destructive')}
                          />
                          <p className={cn('mt-1 text-[9px]', model ? 'text-muted-foreground' : 'text-destructive')}>
                            {model
                              ? t('flow_builder.ai_custom_model_help', 'The model ID will be sent to OpenAI exactly as entered.')
                              : t('flow_builder.ai_custom_model_required', 'Enter a model ID.')}
                          </p>
                        </div>
                      )}
                      {provider === 'azure' && (
                        <div className="mt-1">
                          <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_azure_deployment_placeholder"
                            disabled={isEnhancingSystemPrompt}
                            value={model}
                            onChange={(e) => handleModelChange(e.target.value)}
                            placeholder={t('flow_builder.ai_azure_deployment_placeholder', 'Or type an Azure deployment name')}
                            className="text-xs h-7"
                          />
                        </div>
                      )}
                      {provider === 'openrouter' && modelsError && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {t('flow_builder.ai_models_fallback', 'Using fallback models due to API error')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                      <Key className="w-3 h-3" />
                      {t('flow_builder.ai_credential_source', 'Credential Source')}
                    </Label>
                    <Select value={credentialSource} disabled={isEnhancingSystemPrompt} onValueChange={(value: string) => setCredentialSource(value as 'manual' | 'company' | 'system' | 'auto')}>
                      <SelectTrigger className="text-xs h-7 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_auto', 'Auto (Company → System → Manual)')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="company">
                          <div className="flex items-center gap-2">
                            <Building className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_company', 'Company Credentials')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="system">
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_system', 'System Credentials')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="manual">
                          <div className="flex items-center gap-2">
                            <Key className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_manual', 'Manual API Key')}</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Show credential status */}
                    {credentialSource !== 'manual' && (
                      <div className="mt-1 text-[9px] text-muted-foreground">
                        {credentialSource === 'auto' && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                            {companyCredentials?.find((c: any) => c.provider === provider && c.isActive)
                              ? t('flow_builder.ai_credential_company_available', 'Company credential available')
                              : provider === 'azure'
                                ? t('flow_builder.ai_credential_azure_required', 'Requires a company or system Azure credential')
                                : t('flow_builder.ai_credential_fallback', 'Will use system/environment fallback')
                            }
                          </span>
                        )}
                        {credentialSource === 'company' && (
                          <span className="flex items-center gap-1">
                            {companyCredentials?.find((c: any) => c.provider === provider && c.isActive) ? (
                              <>
                                <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                {t('flow_builder.ai_credential_company_configured', 'Company credential configured')}
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-2.5 h-2.5 text-yellow-500" />
                                {t('flow_builder.ai_credential_company_missing', 'No company credential for this provider')}
                              </>
                            )}
                          </span>
                        )}
                        {credentialSource === 'system' && (
                          <span className="flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5 text-blue-500" />
                            {t('flow_builder.ai_credential_system_configured', 'Using system credentials')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {credentialSource === 'manual' && (
                    <div className="space-y-2">
                      {provider === 'azure' && (
                        <>
                          <div>
                            <Label className="text-[10px] font-medium text-foreground">Azure endpoint</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.azureEndpoint"
                              disabled={isEnhancingSystemPrompt}
                              value={azureEndpoint}
                              onChange={(e) => setAzureEndpoint(e.target.value)}
                              placeholder="https://your-resource.openai.azure.com"
                              className="text-xs h-7 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] font-medium text-foreground">API version</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.azureApiVersion"
                              disabled={isEnhancingSystemPrompt}
                              value={azureApiVersion}
                              onChange={(e) => setAzureApiVersion(e.target.value)}
                              placeholder={DEFAULT_AZURE_OPENAI_API_VERSION}
                              className="text-xs h-7 mt-1"
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_api_key', 'API Key')}</Label>
                        <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_api_key_placeholder"
                          disabled={isEnhancingSystemPrompt}
                          type="password"
                          placeholder={t('flow_builder.ai_api_key_placeholder', 'Enter your {{provider}} API key', { provider: getProviderDisplayName() })}
                          value={apiKey}
                          onChange={handleApiKeyChange}
                          className="text-xs h-7 mt-1"
                        />
                        <div className="mt-1">
                          <a
                            href={getApiDocUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            {t('flow_builder.ai_get_api_key', 'Get your API key here')}
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Language Selection */}
                  <div>
                    <Label className="text-[10px] font-medium text-foreground">
                      {t('flow_builder.ai_language_label', 'Response Language')}
                    </Label>
                    <Select 
                      value={language} 
                      onValueChange={(value) => {
                        isUpdatingRef.current = true;
                        setLanguage(value);

                        updateNodeData({ language: value });
                      }}
                    >
                      <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_language_placeholder" className="text-xs h-7 mt-1">
                        <SelectValue placeholder={t('flow_builder.ai_language_placeholder', 'Select language...')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t('flow_builder.ai_language_auto_detect', 'Auto Detect (use contact language)')}</SelectItem>
                        {availableLanguages && availableLanguages.length > 0 ? (
                          availableLanguages
                            .filter((lang: any) => lang.isActive !== false)
                            .map((lang: any) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                <div className="flex items-center gap-2">
                                  {lang.flagIcon && <span>{lang.flagIcon}</span>}
                                  <span>{lang.name}</span>
                                  {lang.nativeName !== lang.name && (
                                    <span className="text-muted-foreground">({lang.nativeName})</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                        ) : (
                          <SelectItem value="en">{t('flow_builder.ai_language_english', 'English')}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {t('flow_builder.ai_language_description', 'Select the language the AI assistant should use for responses')}
                    </p>
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-foreground">
                      {t('flow_builder.ai_timezone', 'Assistant timezone')}
                    </Label>
                    <TimezoneSelector
                      value={assistantTimezone}
                      onChange={setAssistantTimezone}
                      includeCompanyDefault
                      companyDefaultTimezone={companyTimezone}
                      className="text-xs h-7 mt-1 w-full"
                    />
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {t(
                        'flow_builder.ai_timezone_description',
                        'Controls the server-based current date and time used by the assistant and all booking tools. Choose Company timezone to inherit General Settings.',
                      )}
                    </p>
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-foreground">
                      {t('flow_builder.ai_prompt_template_label', 'Prompt Template')}
                    </Label>
                    <Select
                      value={appliedSystemPromptTemplate}
                      disabled={isEnhancingSystemPrompt}
                      onValueChange={handleSystemPromptTemplateSelect}
                    >
                      <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_prompt_template_placeholder" className="text-xs h-7 mt-1">
                        <SelectValue placeholder={t('flow_builder.ai_prompt_template_placeholder', 'Select a template...')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t('flow_builder.ai_prompt_template_none', 'None (keep current prompt)')}
                        </SelectItem>
                        {AI_ASSISTANT_PROMPT_TEMPLATES.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {t(template.labelKey, template.id === 'rag' ? 'RAG (Knowledge Base)' : 'Calendar Booking')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {t('flow_builder.ai_prompt_template_description', 'Apply a starter system prompt for common assistant setups')}
                    </p>
                  </div>

                  <AlertDialog
                    open={systemPromptTemplateConfirmOpen}
                    onOpenChange={(open) => {
                      if (!open) {
                        handleCancelSystemPromptTemplate();
                      }
                    }}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('flow_builder.ai_prompt_template_confirm_title', 'Replace system prompt?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t(
                            'flow_builder.ai_prompt_template_confirm_description',
                            'Applying the "{{template}}" template will replace your current system prompt. Do you want to continue?',
                            {
                              template: pendingSystemPromptTemplateLabel
                                ? t(
                                    pendingSystemPromptTemplateLabel.labelKey,
                                    pendingSystemPromptTemplateLabel.id === 'rag'
                                      ? 'RAG (Knowledge Base)'
                                      : 'Calendar Booking'
                                  )
                                : '',
                            }
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancelSystemPromptTemplate}>
                          {t('common.cancel', 'Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmSystemPromptTemplate}>
                          {t('flow_builder.ai_prompt_template_confirm_replace', 'Replace prompt')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_system_prompt', 'System Prompt')}</Label>
                      <div className="mr-10 flex items-center gap-1">
                        {originalSystemPrompt !== null && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_enhance_undo" type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={undoSystemPromptEnhancement} aria-label={t('flow_builder.ai_prompt_enhance_undo', 'Undo prompt enhancement')}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('flow_builder.ai_prompt_enhance_undo', 'Undo prompt enhancement')}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_prompt_enhance_action" type="button" variant="outline" size="icon" className="h-7 w-7" disabled={!prompt.trim() || isEnhancingSystemPrompt} onClick={() => void enhanceSystemPrompt()} aria-label={t('flow_builder.ai_prompt_enhance_action', 'Enhance prompt')}>
                                {isEnhancingSystemPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('flow_builder.ai_prompt_enhance_action', 'Enhance prompt')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <EnhancedVariablePicker
                      ref={systemPromptPickerRef}
                      placeholder={t('flow_builder.ai_prompt_placeholder', 'Enter instructions for the AI')}
                      value={prompt}
                      onChange={(val) => { setOriginalSystemPrompt(null); setPrompt(val); }}
                      className="text-xs min-h-[200px] resize-none mt-1"
                      flowId={flowId ?? undefined}
                      customVariables={customVariables}
                      additionalVariables={customFieldPickerVariables}
                      disabled={isEnhancingSystemPrompt}
                      multiline={true}
                      highlightPlaceholders={true}
                      wrapInBraces={true}
                      pickerButtonPlacement="header"
                    />
                    <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
                      {t(
                        'flow_builder.ai_variable_inference_help',
                        'Unknown prompt placeholders are automatically created as text outputs for this assistant.'
                      )}
                    </p>
                    {referencedReadVars.length > 0 && (
                      <Collapsible defaultOpen className="group mt-2">
                        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-left text-[10px] font-medium text-foreground hover:bg-muted/60">
                          {t('flow_builder.ai_variable_read_label', 'AI will read these variables')}
                          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 flex flex-wrap gap-1.5">
                          {referencedReadVars.map((name) => (
                            <PromptPlaceholderNavigationButton
                              key={`read-${name}`}
                              enabled={true}
                              label={t('flow_builder.ai_placeholder_go_to_aria', 'Go to {{name}} in the system prompt', { name })}
                              tooltip={t('flow_builder.ai_placeholder_go_to', 'Go to placeholder in system prompt')}
                              unavailableTooltip={t('flow_builder.ai_placeholder_not_in_prompt', 'Placeholder is not present in the system prompt')}
                              onNavigate={() => navigateToPromptPlaceholder(name)}
                            >
                              <Badge
                                variant="secondary"
                                className="gap-1 border border-blue-500/35 bg-blue-500/10 text-blue-800 dark:text-blue-200"
                              >
                                {`{{${name}}}`}
                              </Badge>
                            </PromptPlaceholderNavigationButton>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {(referencedCustomVars.length > 0 || referencedAiVars.length > 0 || unknownPlaceholders.length > 0) && (
                      <Collapsible defaultOpen className="group mt-2">
                        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-left text-[10px] font-medium text-foreground hover:bg-muted/60">
                          {t('flow_builder.ai_variable_extraction_label', 'AI will populate these variables')}
                          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="custom-scrollbar ai-variable-list-scrollbar nodrag nowheel mt-2 max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1">
                          {referencedAiVars.map((variable) => (
                            <div
                              key={`ai-var-${variable.id}`}
                              className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5"
                            >
                              <PromptPlaceholderNavigationButton
                                enabled={true}
                                label={t('flow_builder.ai_placeholder_go_to_aria', 'Go to {{name}} in the system prompt', { name: variable.name })}
                                tooltip={t('flow_builder.ai_placeholder_go_to', 'Go to placeholder in system prompt')}
                                unavailableTooltip={t('flow_builder.ai_placeholder_not_in_prompt', 'Placeholder is not present in the system prompt')}
                                onNavigate={() => navigateToPromptPlaceholder(variable.name)}
                                className="min-w-0 px-1 py-0.5"
                              >
                                <div className="truncate text-[10px] font-medium text-emerald-900 dark:text-emerald-100">
                                  {`{{${variable.name}}}`}
                                </div>
                                <div className="text-[9px] text-muted-foreground">
                                  {t('flow_builder.ai_variable_auto_created', 'Automatically created by this AI Assistant')}
                                </div>
                              </PromptPlaceholderNavigationButton>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Label className="text-[9px] text-muted-foreground">
                                  {variable.required
                                    ? t('flow_builder.ai_variable_required', 'Required')
                                    : t('flow_builder.ai_variable_optional', 'Optional')}
                                </Label>
                                <Switch
                                  checked={variable.required}
                                  onCheckedChange={(required) =>
                                    setAiVariables((current) =>
                                      current.map((entry) =>
                                        entry.id === variable.id ? { ...entry, required } : entry
                                      )
                                    )
                                  }
                                  aria-label={t(
                                    'flow_builder.ai_variable_required_toggle',
                                    'Require {{name}} before variables are complete',
                                    { name: variable.name }
                                  )}
                                  className="scale-75"
                                />
                              </div>
                            </div>
                          ))}
                          {referencedCustomVars.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                          {referencedCustomVars.map((name) => (
                            <PromptPlaceholderNavigationButton
                              key={`ref-${name}`}
                              enabled={true}
                              label={t('flow_builder.ai_placeholder_go_to_aria', 'Go to {{name}} in the system prompt', { name })}
                              tooltip={t('flow_builder.ai_placeholder_go_to', 'Go to placeholder in system prompt')}
                              unavailableTooltip={t('flow_builder.ai_placeholder_not_in_prompt', 'Placeholder is not present in the system prompt')}
                              onNavigate={() => navigateToPromptPlaceholder(name)}
                            >
                              <Badge
                                variant="secondary"
                                className="gap-1 border border-emerald-500/35 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                              >
                                {`{{${name}}}`}
                              </Badge>
                            </PromptPlaceholderNavigationButton>
                          ))}
                            </div>
                          )}
                          {unknownPlaceholders.map((name) => (
                            <PromptPlaceholderNavigationButton
                              key={`pending-${name}`}
                              enabled={true}
                              label={t('flow_builder.ai_placeholder_go_to_aria', 'Go to {{name}} in the system prompt', { name })}
                              tooltip={t('flow_builder.ai_placeholder_go_to', 'Go to placeholder in system prompt')}
                              unavailableTooltip={t('flow_builder.ai_placeholder_not_in_prompt', 'Placeholder is not present in the system prompt')}
                              onNavigate={() => navigateToPromptPlaceholder(name)}
                            >
                              <Badge
                                variant="outline"
                                className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                              >
                                {`{{${name}}}`}
                                <span className="text-[9px] text-muted-foreground">
                                  {t('flow_builder.ai_variable_creating', 'Creating…')}
                                </span>
                              </Badge>
                            </PromptPlaceholderNavigationButton>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    <div className="mt-3 rounded-md border border-border p-2.5">
                      <div className="mb-2">
                        <Label className="text-[10px] font-medium">
                          {t('flow_builder.ai_custom_fields', 'Contact and deal custom fields')}
                        </Label>
                        <p className="text-[9px] text-muted-foreground">
                          {t('flow_builder.ai_custom_fields_help', 'Choose exactly which stored fields the assistant may read or populate.')}
                        </p>
                      </div>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          const [entity, idText] = value.split(':');
                          const field = companyCustomFields.find((candidate) => candidate.entity === entity && candidate.id === Number(idText));
                          if (!field) return;
                          setCustomFieldBindings((current) => [...current, {
                            id: `ai_custom_field_${field.entity}_${field.id}`,
                            customFieldId: field.id,
                            entity: field.entity,
                            fieldName: field.fieldName,
                            mode: 'read_write',
                            required: false,
                          }]);
                        }}
                      >
                        <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_custom_fields_add" className="h-8 text-[10px]">
                          <SelectValue placeholder={t('flow_builder.ai_custom_fields_add', 'Add a custom field')} />
                        </SelectTrigger>
                        <SelectContent>
                          {companyCustomFields
                            .filter((field) => !customFieldBindings.some((binding) => binding.entity === field.entity && binding.customFieldId === field.id))
                            .map((field) => (
                              <SelectItem key={`${field.entity}:${field.id}`} value={`${field.entity}:${field.id}`}>
                                {customFieldEntityLabel(field.entity)} · {field.fieldLabel} ({customFieldTypeLabel(field.fieldType)})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {customFieldBindings.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {customFieldBindings.map((binding) => {
                            const field = companyCustomFields.find((candidate) => candidate.entity === binding.entity && candidate.id === binding.customFieldId);
                            const writable = binding.mode === 'write' || binding.mode === 'read_write';
                            const placeholderPath = customFieldVariablePath(binding.entity, binding.fieldName);
                            const placeholderPresent = getPromptPlaceholderRanges(prompt, placeholderPath).length > 0;
                            return (
                              <div key={binding.id} className={cn('rounded-md border p-2', field ? 'border-border' : 'border-destructive/50')}>
                                <div className="flex items-center gap-2">
                                  <PromptPlaceholderNavigationButton
                                    enabled={placeholderPresent}
                                    label={t('flow_builder.ai_placeholder_go_to_aria', 'Go to {{name}} in the system prompt', { name: placeholderPath })}
                                    tooltip={t('flow_builder.ai_placeholder_go_to', 'Go to placeholder in system prompt')}
                                    unavailableTooltip={t('flow_builder.ai_placeholder_not_in_prompt', 'Placeholder is not present in the system prompt')}
                                    onNavigate={() => navigateToPromptPlaceholder(placeholderPath)}
                                    className="min-w-0 flex-1 px-1 py-0.5"
                                  >
                                    <div className="truncate text-[10px] font-medium">
                                      {customFieldEntityLabel(binding.entity)} · {field?.fieldLabel ?? binding.fieldName}
                                    </div>
                                    <div className="truncate font-mono text-[9px] text-muted-foreground">
                                      {`{{${placeholderPath}}}`}
                                      {!field ? ` · ${t('flow_builder.ai_custom_field_missing', 'field no longer exists')}` : ` · ${customFieldTypeLabel(field.fieldType)}`}
                                    </div>
                                  </PromptPlaceholderNavigationButton>
                                  <Select
                                    value={binding.mode}
                                    onValueChange={(mode: AiAssistantCustomFieldMode) => setCustomFieldBindings((current) =>
                                      current.map((entry) => entry.id === binding.id
                                        ? { ...entry, mode, required: mode === 'read' ? false : entry.required }
                                        : entry)
                                    )}
                                  >
                                    <SelectTrigger className="h-7 w-28 text-[9px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="read">{t('flow_builder.ai_custom_field_read', 'Read')}</SelectItem>
                                      <SelectItem value="write">{t('flow_builder.ai_custom_field_write', 'Populate')}</SelectItem>
                                      <SelectItem value="read_write">{t('flow_builder.ai_custom_field_read_write', 'Read & populate')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_custom_field_remove"
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label={t('flow_builder.ai_custom_field_remove', 'Remove custom field {{name}}', {
                                      name: field?.fieldLabel ?? binding.fieldName,
                                    })}
                                    onClick={() => setCustomFieldBindings((current) => current.filter((entry) => entry.id !== binding.id))}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                {writable && (
                                  <div className="mt-1.5 flex items-center justify-between">
                                    <Label className="text-[9px] text-muted-foreground">
                                      {t('flow_builder.ai_custom_field_completion', 'Required for Variables Complete')}
                                    </Label>
                                    <Switch className="scale-75" checked={binding.required} onCheckedChange={(required) =>
                                      setCustomFieldBindings((current) => current.map((entry) => entry.id === binding.id ? { ...entry, required } : entry))
                                    } />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversation Section */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  {t('flow_builder.ai_conversation', 'Conversation')}
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium cursor-pointer">
                      {t('flow_builder.ai_enable_history', 'Conversation History')}
                    </Label>
                    <Switch
                      checked={enableHistory}
                      onCheckedChange={setEnableHistory}
                    />
                  </div>

                  {enableHistory && (
                    <div className="pl-4 border-l-2 border-blue-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-medium text-foreground">
                          {t('flow_builder.ai_history_limit', 'Message Limit')}
                        </Label>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-xs"
                            onClick={() => setHistoryLimit(Math.max(1, historyLimit - 1))}
                            disabled={historyLimit <= 1}
                          >-</Button>
                          <span className="text-xs w-6 text-center font-medium">{historyLimit}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-xs"
                            onClick={() => setHistoryLimit(Math.min(200, historyLimit + 1))}
                            disabled={historyLimit >= 200}
                          >+</Button>
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {t('flow_builder.ai_history_help', 'Previous messages to include for context')}
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label className="text-[10px] font-medium text-foreground cursor-help">
                              {t('flow_builder.ai_max_output_tokens', 'Max Output Tokens')}
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs max-w-xs">
                              {t('flow_builder.ai_max_output_tokens_tooltip', 'Lower output limits shorten AI replies and reduce TTS audio duration when text-to-speech is enabled.')}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 text-xs"
                          onClick={() => setMaxOutputTokens(Math.max(50, maxOutputTokens - 50))}
                          disabled={maxOutputTokens <= 50}
                        >-</Button>
                        <span className="text-xs w-10 text-center font-medium">{maxOutputTokens}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 text-xs"
                          onClick={() => setMaxOutputTokens(Math.min(4096, maxOutputTokens + 50))}
                          disabled={maxOutputTokens >= 4096}
                        >+</Button>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {t('flow_builder.ai_max_output_tokens_help', 'Limits the AI response length. Lower values produce shorter responses, which also reduces TTS audio duration.')}
                    </p>
                  </div>


                </div>
              </div>



                {/* Session Takeover Section */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    {t('flow_builder.ai_session_takeover', 'Session Takeover')}
                  </h3>
                  <Switch
                    checked={enableSessionTakeover}
                    onCheckedChange={setEnableSessionTakeover}
                  />
                </div>

                {enableSessionTakeover && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-foreground">
                        {t('flow_builder.ai_stop_keyword', 'Stop Keyword')}
                      </Label>
                      <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_stop_keyword_placeholder"
                        placeholder={t('flow_builder.ai_stop_keyword_placeholder', 'e.g., stop, end, agent')}
                        value={stopKeyword}
                        onChange={(e) => setStopKeyword(e.target.value)}
                        className="text-xs h-7 mt-1"
                      />
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {t('flow_builder.ai_stop_keyword_help', 'User can type this keyword to end the AI session')}
                      </p>
                    </div>



                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">
                        {t('flow_builder.ai_session_takeover_tip', '💡 Tip: When enabled, the AI will handle all subsequent messages until the stop keyword is received or the session is manually ended.')}
                      </p>
                    </div>
                  </div>
                )}

                {!enableSessionTakeover && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_session_takeover_disabled_help', 'Enable session takeover to allow AI to handle continuous conversation without restarting the flow')}
                  </p>
                )}
              </div>

              {/* Voice Processing Section - Available for OpenAI and other providers */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    {t('flow_builder.ai_image_understanding', 'Image Understanding')}
                  </h3>
                  <Switch
                    checked={enableImage && selectedModelSupportsImage}
                    onCheckedChange={handleImageToggle}
                  />
                </div>
                {(!enableImage || !selectedModelSupportsImage) && (
                  <p className="text-[10px] text-muted-foreground">
                    {enableImage
                      ? t('flow_builder.ai_image_analysis_only_help', 'Selected model does not support image input; assistant uses cached image analysis text only.')
                      : t('flow_builder.ai_image_disabled_help', 'Image understanding is disabled for this assistant node.')}
                  </p>
                )}
                <AlertDialog open={imageModelPromptOpen} onOpenChange={setImageModelPromptOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('flow_builder.ai_image_dialog_title', 'Selected model does not support images')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('flow_builder.ai_image_dialog_desc', 'Choose a model with image input support to enable Image Understanding.')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('flow_builder.ai_image_dialog_cancel', 'I will choose manually')}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={autoSelectImageSupportedModel}>
                        {t('flow_builder.ai_image_dialog_auto_select', 'Auto select supported model')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      {t('flow_builder.ai_voice_processing', 'Voice Processing')}
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label htmlFor="enable-stt" className="text-xs font-medium">
                          {t('flow_builder.ai_stt', 'Speech-to-Text (STT)')}
                        </Label>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {provider === 'openrouter'
                            ? t('flow_builder.ai_stt_openrouter_help', 'Transcribe inbound voice messages using OpenAI Whisper (requires OpenAI credentials).')
                            : t('flow_builder.ai_stt_openai_help', 'Transcribe inbound voice messages using OpenAI Whisper.')}
                        </p>
                      </div>
                      <Switch
                        id="enable-stt"
                        checked={enableVoiceProcessing ?? (provider === 'openai')}
                        onCheckedChange={handleSttToggle}
                        className="scale-75"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label htmlFor="enable-tts" className="text-xs font-medium">
                          {t('flow_builder.ai_tts', 'Text-to-Speech (TTS)')}
                        </Label>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {provider === 'openrouter'
                            ? t('flow_builder.ai_tts_openrouter_unavailable', 'TTS is not available when OpenRouter is the chat provider. Switch to OpenAI to enable voice replies.')
                            : t('flow_builder.ai_tts_help', 'Convert AI responses to voice messages')}
                        </p>
                      </div>
                      <Switch
                        id="enable-tts"
                        checked={enableTextToSpeech}
                        onCheckedChange={handleTtsToggle}
                        disabled={provider === 'openrouter'}
                        className="scale-75"
                      />
                    </div>

                  {enableTextToSpeech ? (
                    <div className="space-y-4">
                        {/* Voice Provider Configuration */}
                        <div className="space-y-3 p-3 bg-card rounded-lg border border-blue-200 dark:border-blue-900">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <h4 className="text-xs font-semibold text-foreground">{t('flow_builder.ai_voice_provider_config', 'Voice Provider Configuration')}</h4>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="tts-provider" className="text-xs">
                              {t('flow_builder.ai_tts_provider', 'TTS Provider')}
                            </Label>
                            <Select value={ttsProvider} onValueChange={setTtsProvider}>
                              <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_tts_provider_placeholder" id="tts-provider" className="text-xs h-7 mt-1">
                                <SelectValue placeholder={t('flow_builder.ai_tts_provider_placeholder', 'Select TTS provider...')} />
                              </SelectTrigger>
                              <SelectContent>
                                {TTS_PROVIDERS.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{p.name}</span>
                                      <span className="text-[10px] text-muted-foreground">{p.description}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                              {t('flow_builder.ai_tts_provider_help', 'Choose your text-to-speech provider')}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="voice-selection" className="text-xs">
                              {t('flow_builder.ai_voice_selection', 'Voice Selection')}
                            </Label>
                          <Select
                            value={ttsProvider === 'elevenlabs' ? (elevenLabsCustomVoiceId ? 'custom' : elevenLabsVoiceId) : ttsVoice}
                            onValueChange={(value) => {
                              if (ttsProvider === 'elevenlabs') {
                                if (value === 'custom') {
                                  setElevenLabsVoiceId('custom');
                                } else {
                                  setElevenLabsVoiceId(value);
                                  setElevenLabsCustomVoiceId('');
                                }
                              } else {
                                setTtsVoice(value);
                              }
                            }}
                          >
                            <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_voice_selection_placeholder" id="voice-selection" className="text-xs h-7 mt-1">
                              <SelectValue placeholder={t('flow_builder.ai_voice_selection_placeholder', 'Select voice...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {(ttsProvider === 'elevenlabs' ? ELEVENLABS_VOICES : OPENAI_TTS_VOICES).map((voice) => (
                                <SelectItem key={voice.id} value={voice.id}>
                                  {voice.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground">
                            {t('flow_builder.ai_voice_selection_help', 'Choose the voice for AI audio responses')}
                          </p>
                        </div>

                        {/* Custom Voice ID Input - Only for ElevenLabs */}
                        {ttsProvider === 'elevenlabs' && (elevenLabsVoiceId === 'custom' || elevenLabsCustomVoiceId) && (
                          <div className="space-y-2 p-3 bg-muted/50 dark:bg-muted/30 rounded-lg border border-border">
                            <Label htmlFor="custom-voice-id" className="text-xs">
                              {t('flow_builder.ai_custom_voice_id', 'Custom Voice ID')}
                            </Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_custom_voice_id_placeholder"
                              id="custom-voice-id"
                              type="text"
                              value={elevenLabsCustomVoiceId}
                              onChange={(e) => {
                                const value = e.target.value.trim();
                                setElevenLabsCustomVoiceId(value);
                                if (value) {
                                  setElevenLabsVoiceId('custom');
                                } else if (elevenLabsVoiceId === 'custom') {
                                  setElevenLabsVoiceId('JaagUurP1dmW3WscoJ79');
                                }
                              }}
                              placeholder={t('flow_builder.ai_custom_voice_id_placeholder', 'Paste your ElevenLabs voice ID here...')}
                              className="text-xs h-7 font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              {t('flow_builder.ai_custom_voice_id_help', 'Enter a custom voice ID from your ElevenLabs account (e.g., "pNInz6obpgDQGcFmaJgB")')}
                            </p>
                            {elevenLabsCustomVoiceId && elevenLabsCustomVoiceId.length > 0 && elevenLabsCustomVoiceId.length < 20 && (
                              <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded text-[10px] text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <span>{t('flow_builder.ai_voice_id_warning', '⚠️ Voice ID seems short. ElevenLabs voice IDs are typically 20+ characters long.')}</span>
                              </div>
                            )}
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md">
                              <p className="text-[10px] text-blue-700 dark:text-blue-400">
                                {t('flow_builder.ai_voice_id_tip', '💡 Tip: You can find voice IDs in your ElevenLabs dashboard under "Voices" → Click on a voice → Copy the Voice ID')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                        {/* ElevenLabs Specific Configuration */}
                        {ttsProvider === 'elevenlabs' && (
                          <div className="space-y-3 p-3 bg-card rounded-lg border border-blue-200 dark:border-blue-900">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <h4 className="text-xs font-semibold text-foreground">{t('flow_builder.ai_elevenlabs_config', 'ElevenLabs Configuration')}</h4>
                              </div>
                              <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_reset_to_default"
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setElevenLabsVoiceId('JaagUurP1dmW3WscoJ79');
                                  setElevenLabsCustomVoiceId('');
                                  setElevenLabsModel('eleven_multilingual_v2');
                                  setElevenLabsStability(0.5);
                                  setElevenLabsSimilarityBoost(0.75);
                                  setElevenLabsStyle(0);
                                  setElevenLabsUseSpeakerBoost(true);
                                  setElevenLabsPromptInfluence(0.5);
                                  setElevenLabsEnableAudioTags(false);
                                  setElevenLabsAudioTagsInstructions('Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points');
                                }}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                {t('flow_builder.ai_reset_to_default', 'Reset to Default')}
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="elevenlabs-api-key" className="text-xs">
                                {t('flow_builder.ai_elevenlabs_api_key', 'ElevenLabs API Key')} <span className="text-red-500 dark:text-red-400">*</span>
                              </Label>
                              <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_elevenlabs_api_key_placeholder"
                                id="elevenlabs-api-key"
                                type="password"
                                value={elevenLabsApiKey}
                                onChange={(e) => setElevenLabsApiKey(e.target.value)}
                                placeholder={t('flow_builder.ai_elevenlabs_api_key_placeholder', 'Enter ElevenLabs API key...')}
                                className="text-xs h-7"
                              />
                              <p className="text-[10px] text-muted-foreground">
                                {t('flow_builder.ai_elevenlabs_required', 'Required for ElevenLabs TTS')}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="elevenlabs-model" className="text-xs">
                                {t('flow_builder.ai_elevenlabs_model', 'Model')}
                              </Label>
                              <Select value={elevenLabsModel} onValueChange={setElevenLabsModel}>
                                <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_elevenlabs_select_model" id="elevenlabs-model" className="text-xs h-7">
                                  <SelectValue placeholder={t('flow_builder.ai_elevenlabs_select_model', 'Select model...')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {ELEVENLABS_MODELS.map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                      {model.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {(language === 'auto' || language !== 'en') &&
                              (elevenLabsModel === 'eleven_monolingual_v1' ||
                                elevenLabsModel === 'eleven_multilingual_v1') && (
                              <Alert className="py-2 border-amber-500/40 bg-amber-50/80 dark:bg-amber-950/40">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                                <AlertDescription className="text-xs text-amber-900 dark:text-amber-100">
                                  {t(
                                    'flow_builder.ai_elevenlabs_deprecated_v1_warning',
                                    'ElevenLabs v1 TTS models are deprecated. Save the node to migrate to Eleven Multilingual v2 (see ElevenLabs models documentation).'
                                  )}
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs">
                                  {t('flow_builder.ai_elevenlabs_stability', 'Stability')}
                                </Label>
                                <div className="flex items-center gap-4">
                                  <Slider
                                    value={[elevenLabsStability]}
                                    onValueChange={([value]) => setElevenLabsStability(value)}
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    className="flex-1"
                                  />
                                  <span className="w-10 text-xs font-medium text-muted-foreground tabular-nums">{elevenLabsStability.toFixed(1)}</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">
                                  {t('flow_builder.ai_elevenlabs_similarity', 'Similarity')}
                                </Label>
                                <div className="flex items-center gap-4">
                                  <Slider
                                    value={[elevenLabsSimilarityBoost]}
                                    onValueChange={([value]) => setElevenLabsSimilarityBoost(value)}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    className="flex-1"
                                  />
                                  <span className="w-10 text-xs font-medium text-muted-foreground tabular-nums">{elevenLabsSimilarityBoost.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <Label className="text-xs">
                                {t('flow_builder.ai_elevenlabs_speaker_boost', 'Speaker Boost')}
                              </Label>
                              <Switch
                                checked={elevenLabsUseSpeakerBoost}
                                onCheckedChange={setElevenLabsUseSpeakerBoost}
                              />
                            </div>

                            {/* v3-Specific Settings */}
                            {isV3Model(elevenLabsModel) && (
                              <div className="space-y-3 pt-3 border-t border-border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="h-3 w-3 text-primary" />
                                    <Label className="text-xs font-semibold">
                                      {t('flow_builder.ai_elevenlabs_v3_features', 'v3 Advanced Features')}
                                    </Label>
                                  </div>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <Dialog>
                                        <DialogTrigger asChild>
                                          <TooltipTrigger asChild>
                                            <button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_audio_tags_help_tooltip"
                                              type="button"
                                              className="h-3 w-3 text-muted-foreground cursor-help hover:text-foreground transition-colors"
                                              aria-label={t('flow_builder.ai_audio_tags_help_tooltip', 'Audio Tags Help & Documentation')}
                                            >
                                              <HelpCircle className="h-3 w-3" />
                                            </button>
                                          </TooltipTrigger>
                                        </DialogTrigger>
                                        <DialogPrimitive.Portal>
                                          <DialogPrimitive.Content
                                            className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
                                          >
                                            <DialogHeader>
                                              <DialogTitle className="flex items-center gap-2">
                                                <Sparkles className="h-5 w-5 text-primary" />
                                                {t('flow_builder.ai_audio_tags_help_dialog_title', 'ElevenLabs v3 Audio Tags - Help & Documentation')}
                                              </DialogTitle>
                                              <DialogDescription>
                                                {t('flow_builder.ai_audio_tags_help_dialog_subtitle', 'Learn how to use audio tags for expressive and emotional voice control')}
                                              </DialogDescription>
                                            </DialogHeader>
                                            <AudioTagsHelpContent />
                                            <DialogPrimitive.Close className={dialogCloseButtonClassName}>
                                              <X className="h-4 w-4" />
                                              <span className="sr-only">{t('common.close', 'Close')}</span>
                                            </DialogPrimitive.Close>
                                          </DialogPrimitive.Content>
                                        </DialogPrimitive.Portal>
                                      </Dialog>
                                      <TooltipContent side="top">
                                        <p className="text-xs">{t('flow_builder.ai_audio_tags_help_tooltip', 'Audio Tags Help & Documentation')}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs">
                                    {t('flow_builder.ai_elevenlabs_prompt_influence', 'Prompt Influence')}
                                  </Label>
                                  <div className="flex items-center gap-4">
                                    <Slider
                                      value={[elevenLabsPromptInfluence]}
                                      onValueChange={([value]) => setElevenLabsPromptInfluence(value)}
                                      min={0}
                                      max={1}
                                      step={0.1}
                                      className="flex-1"
                                    />
                                    <span className="w-10 text-xs font-medium text-muted-foreground tabular-nums">{elevenLabsPromptInfluence.toFixed(1)}</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    {t('flow_builder.ai_elevenlabs_prompt_influence_help', 'Controls how much the text prompt influences voice expression (0 = minimal, 1 = maximum)')}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <Label className="text-xs">
                                      {t('flow_builder.ai_elevenlabs_audio_tags', 'Enable Audio Tags')}
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {t('flow_builder.ai_elevenlabs_audio_tags_help', 'Use tags like [excited], [whispers], [laughs] for emotional control')}
                                    </p>
                                  </div>
                                  <Switch
                                    checked={elevenLabsEnableAudioTags}
                                    onCheckedChange={setElevenLabsEnableAudioTags}
                                  />
                                </div>

                                {elevenLabsEnableAudioTags && (
                                  <div className="space-y-2">
                                    <Label className="text-xs">
                                      {t('flow_builder.ai_elevenlabs_audio_tags_instructions', 'Audio Tags Instructions')}
                                    </Label>
                                    <Textarea data-tour="components-flow-builder-aiassistantnode.textarea.flow_builder.ai_elevenlabs_audio_tags_placeholder_detailed"
                                      value={elevenLabsAudioTagsInstructions}
                                      onChange={(e) => setElevenLabsAudioTagsInstructions(e.target.value)}
                                      placeholder={t('flow_builder.ai_elevenlabs_audio_tags_placeholder_detailed', 'Use [excited] when discussing features, [whispers] for confidential info, [pause] before key points...')}
                                      className="text-xs min-h-[60px]"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                      {t('flow_builder.ai_elevenlabs_audio_tags_instructions_help', 'Custom instructions for when and how to use audio tags in responses')}
                                    </p>
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400">
                                      {t('flow_builder.ai_elevenlabs_audio_tags_help_reference', 'Click the help icon above for comprehensive audio tags documentation and examples')}
                                    </p>
                                  </div>
                                )}

                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md">
                                  <p className="text-[10px] text-blue-700 dark:text-blue-400">
                                    <strong>{t('flow_builder.ai_elevenlabs_v3_tip_label', '💡 v3 Tips:')}</strong>
                                    {' '}
                                    {t('flow_builder.ai_elevenlabs_v3_tip', 'Use prompts longer than 250 characters for best consistency. Combine tags for nuanced performances: [excited, whispers] for enthusiastic whispering.')}
                                  </p>
                                  <p className="text-[10px] text-blue-700 dark:text-blue-400 mt-1">
                                    {t('flow_builder.ai_elevenlabs_v3_tip_help_reference', '📚 Click the help icon for complete audio tags documentation, examples, and best practices')}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="voice-response-mode" className="text-xs">
                            {t('flow_builder.ai_voice_response_mode', 'Voice Response Mode')}
                          </Label>
                          <Select value={voiceResponseMode} onValueChange={setVoiceResponseMode}>
                            <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_voice_response_mode_placeholder" id="voice-response-mode" className="text-xs h-7">
                              <SelectValue placeholder={t('flow_builder.ai_voice_response_mode_placeholder', 'Select mode...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {VOICE_RESPONSE_MODES.map((mode) => (
                                <SelectItem key={mode.id} value={mode.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{mode.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{mode.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground">
                            {VOICE_RESPONSE_MODES.find(m => m.id === voiceResponseMode)?.description}
                          </p>
                        </div>

                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md">
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">
                        <strong>{t('flow_builder.ai_voice_processing_label', 'Voice Processing:')}</strong>
                        {ttsProvider === 'elevenlabs' ? (
                          <span> {t('flow_builder.ai_voice_processing_elevenlabs', 'Speech-to-Text uses OpenAI Whisper, Text-to-Speech uses ElevenLabs API')}</span>
                        ) : (
                          <span> {t('flow_builder.ai_voice_processing_openai', 'Speech-to-Text and Text-to-Speech both use OpenAI APIs')}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  ) : (
                    <div className="space-y-2">
                      {!enableTextToSpeech && provider !== 'openrouter' && (
                        <p className="text-[10px] text-blue-600 dark:text-blue-400">
                          💡 {t('flow_builder.ai_tts_enable_hint', 'Enable the toggle above to configure text-to-speech and voice response settings')}
                        </p>
                      )}
                    </div>
                  )}
                  </div>
                </div>





              {/* Audio Processing Limits Section */}
              {enableTextToSpeech && (
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('flow_builder.ai_audio_limits', 'Audio Processing Limits')}
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="max-audio-duration" className="text-xs">
                      {t('flow_builder.ai_max_audio_duration', 'Maximum Audio Duration (seconds)')}
                    </Label>
                    <NumberInput
                      id="max-audio-duration"
                      min={1}
                      max={30}
                      value={maxAudioDuration}
                      onChange={setMaxAudioDuration}
                      fallbackValue={10}
                      className="text-xs h-7"
                      placeholder={t('flow_builder.ai_max_audio_duration_placeholder', '30')}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.ai_max_audio_duration_help', 'Audio messages longer than this limit will not be transcribed or generate TTS responses to save API costs')}
                    </p>
                    {maxAudioDuration > 30 && (
                      <p className="text-[10px] text-red-600 dark:text-red-400">
                        {t('flow_builder.ai_max_duration_exceeded', 'Maximum allowed duration is 30 seconds')}
                      </p>
                    )}
                    {maxAudioDuration < 1 && (
                      <p className="text-[10px] text-red-600 dark:text-red-400">
                        {t('flow_builder.ai_min_duration_error', 'Minimum duration is 1 second')}
                      </p>
                    )}
                  </div>

                  <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-md">
                      <p className="text-[10px] text-yellow-700 dark:text-yellow-400">
                        {t('flow_builder.ai_cost_optimization_tip', '💰 Cost Optimization: Limiting audio duration prevents expensive API calls for long voice messages. Users will receive a text response asking them to send shorter messages.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            

              {/* Task Execution Section */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {t('flow_builder.ai_task_execution', 'Task Execution')}
                    <TooltipProvider>
                      <Tooltip>
                        <Dialog>
                          <DialogTrigger asChild>
                            <TooltipTrigger asChild>
                              <button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_task_execution_help_tooltip"
                                type="button"
                                className="h-3 w-3 text-muted-foreground cursor-help hover:text-foreground transition-colors"
                                aria-label={t('flow_builder.ai_task_execution_help_tooltip', 'Help & Documentation')}
                              >
                                <HelpCircle className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                          </DialogTrigger>
                          <DialogPrimitive.Portal>
                            <DialogPrimitive.Content
                              className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
                            >
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <RefreshCw className="h-5 w-5 text-primary" />
                                  {t('flow_builder.ai_task_execution_help_title', 'Task Execution - Help & Documentation')}
                                </DialogTitle>
                                <DialogDescription>
                                  {t('flow_builder.ai_task_execution_help_subtitle', 'Learn how to use AI SDK tools and dynamic flow routing')}
                                </DialogDescription>
                              </DialogHeader>
                              <TaskExecutionHelpContent />
                              <DialogPrimitive.Close className={dialogCloseButtonClassName}>
                                <X className="h-4 w-4" />
                                <span className="sr-only">{t('common.close', 'Close')}</span>
                              </DialogPrimitive.Close>
                            </DialogPrimitive.Content>
                          </DialogPrimitive.Portal>
                        </Dialog>
                        <TooltipContent side="top">
                          <p className="text-xs">{t('flow_builder.ai_task_execution_help_tooltip', 'Help & Documentation')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h3>
                  <Switch
                    checked={enableTaskExecution}
                    onCheckedChange={setEnableTaskExecution}
                  />
                </div>

                {enableTaskExecution && (
                  <div className="space-y-6">
                    <div className="space-y-2 rounded-md border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs font-medium text-foreground">
                          {t('flow_builder.ai_task_follow_up_message', 'AI follow-up message')}
                        </Label>
                        <Switch
                          checked={enableTaskFollowUpMessage}
                          onCheckedChange={setEnableTaskFollowUpMessage}
                          className="scale-75"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {t(
                          'flow_builder.ai_task_follow_up_message_help',
                          'When enabled, the assistant sends one follow-up message after task branches finish. When disabled, task output is sent and control returns silently to the AI Assistant.'
                        )}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-foreground">
                          {t('flow_builder.ai_tasks', 'Configured Tasks')} ({tasks.length})
                        </Label>
                        <div className="flex items-center gap-1">
                          <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_add_task"
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addTask}
                            disabled={isAddingTask}
                            className="h-7 px-2 text-xs"
                          >
                            {isAddingTask ? (
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3 mr-1" />
                            )}
                            {t('flow_builder.ai_add_task', 'Add New Task')}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-foreground">
                          {t('flow_builder.ai_task_templates', 'Task Templates')}
                        </Label>
                        <Select
                          value={selectedTemplate}
                          onValueChange={(value) => {
                            if (value) {
                              const template = TASK_TEMPLATES.find(t => t.id === value);
                              if (template) {
                                addTaskFromTemplate(template);
                                setSelectedTemplate(''); // Reset after selection
                              }
                            }
                          }}
                        >
                          <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_select_template" className="text-xs h-7">
                            <SelectValue placeholder={t('flow_builder.ai_select_template', 'Select a template...')} />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_TEMPLATES.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {t('flow_builder.ai_task_templates_help', 'Select a template to quickly create a pre-configured task')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5 min-w-0">
                          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {t('flow_builder.ai_task_groups_title', 'Task groups')}
                          </span>
                          {taskGroups.length > 0 ? (
                            <Badge variant="outline" className="shrink-0 text-[10px] font-normal tabular-nums">
                              {taskGroups.length}
                            </Badge>
                          ) : null}
                        </Label>
                        <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_task_groups_manage"
                          type="button"
                          variant={taskGroupsEditorOpen ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => setTaskGroupsEditorOpen((open) => !open)}
                          aria-expanded={taskGroupsEditorOpen}
                          aria-label={t(
                            'flow_builder.ai_task_groups_manage',
                            'Manage task groups'
                          )}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {taskGroupsEditorOpen ? (
                        <div className="space-y-2 pt-1 border-t border-border/60">
                          <div className="flex justify-end">
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_task_group_add"
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs shrink-0"
                              onClick={addTaskGroup}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {t('flow_builder.ai_task_group_add', 'Add group')}
                            </Button>
                          </div>
                          {taskGroups.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground">
                              {t(
                                'flow_builder.ai_task_groups_empty_hint',
                                'Create groups to organize tasks in the list below. Tasks stay in Ungrouped until you assign them.'
                              )}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {taskGroups.map((g) => (
                                <div key={g.id} className="flex items-center gap-2">
                                  <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_task_group_rename_placeholder"
                                    value={g.name}
                                    onChange={(e) => updateTaskGroupName(g.id, e.target.value)}
                                    className="text-xs h-7 flex-1"
                                    placeholder={t(
                                      'flow_builder.ai_task_group_rename_placeholder',
                                      'Group name'
                                    )}
                                  />
                                  <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_task_group_delete"
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                                    onClick={() => removeTaskGroup(g.id)}
                                    aria-label={t('flow_builder.ai_task_group_delete', 'Delete group')}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {tasks.length === 0 ? (
                      <div className="text-center py-4 border-2 border-dashed border-border rounded-lg">
                        <div className="text-xs text-muted-foreground mb-2">
                          {t('flow_builder.ai_no_tasks_configured', 'No tasks configured')}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {t('flow_builder.ai_no_tasks_help', 'Add tasks to enable AI SDK tools and flow routing')}
                        </p>
                      </div>
                    ) : (
                      <DragDropContext onDragEnd={handleTaskDragEnd}>
                        <div className="space-y-3">
                          {taskGroups.map((group) => {
                            const bucketTasks = tasks.filter((tk) =>
                              taskBelongsToBucket(tk, group.id, taskGroups)
                            );
                            const droppableId = taskBucketDroppableId(group.id);
                            const sectionKey = `g-${group.id}`;
                            return (
                              <Collapsible
                                key={group.id}
                                open={isTaskGroupSectionOpen(sectionKey)}
                                onOpenChange={(open) =>
                                  setTaskGroupSectionsOpen((s) => ({ ...s, [sectionKey]: open }))
                                }
                              >
                                <CollapsibleTrigger
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted/50 nodrag nopan"
                                >
                                  {isTaskGroupSectionOpen(sectionKey) ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="truncate">{group.name}</span>
                                  <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] tabular-nums">
                                    {bucketTasks.length}
                                  </Badge>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 space-y-2">
                                  <Droppable droppableId={droppableId}>
                                    {(provided) => (
                                      <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={cn(
                                          'space-y-2 rounded-md min-h-[12px]',
                                          bucketTasks.length === 0 && 'border border-dashed border-border p-2'
                                        )}
                                      >
                                        {bucketTasks.length === 0 ? (
                                          <p className="text-[10px] text-muted-foreground text-center py-1 nodrag nopan">
                                            {t(
                                              'flow_builder.ai_task_group_bucket_empty',
                                              'No tasks in this group. Drag tasks here or assign a group in the task settings.'
                                            )}
                                          </p>
                                        ) : null}
                                        {bucketTasks.map((task, index) => {
                                          const displayIndex = tasks.findIndex((x) => x.id === task.id);
                                          return (
                                            <Draggable key={task.id} draggableId={task.id} index={index}>
                                              {(provided, snapshot) => {
                                                const draggableContent = (
                                                  <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={cn(
                                                      (provided.draggableProps as { className?: string })
                                                        .className,
                                                      snapshot.isDragging
                                                        ? 'shadow-lg z-[10000] opacity-100 bg-card rounded-lg border border-emerald-200 dark:border-emerald-900'
                                                        : '',
                                                      'nodrag nopan'
                                                    )}
                                                  >
                                                    <TaskConfigurationCard
                                                      task={task}
                                                      index={displayIndex >= 0 ? displayIndex : index}
                                                      tasks={tasks}
                                                      taskGroups={taskGroups}
                                                      onUpdate={(updates) => updateTask(task.id, updates)}
                                                      onRemove={() => removeTask(task.id)}
                                                      t={t}
                                                      dragHandleProps={provided.dragHandleProps}
                                                    />
                                                  </div>
                                                );
                                                return snapshot.isDragging
                                                  ? createPortal(draggableContent, document.body)
                                                  : draggableContent;
                                              }}
                                            </Draggable>
                                          );
                                        })}
                                        {provided.placeholder}
                                      </div>
                                    )}
                                  </Droppable>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })}

                          {(() => {
                            const ungroupedTasks = tasks.filter((tk) =>
                              taskBelongsToBucket(tk, 'ungrouped', taskGroups)
                            );
                            const sectionKey = 'ungrouped';
                            return (
                              <Collapsible
                                open={isTaskGroupSectionOpen(sectionKey)}
                                onOpenChange={(open) =>
                                  setTaskGroupSectionsOpen((s) => ({ ...s, [sectionKey]: open }))
                                }
                              >
                                <CollapsibleTrigger
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted/50 nodrag nopan"
                                >
                                  {isTaskGroupSectionOpen(sectionKey) ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  {t('flow_builder.ai_task_group_ungrouped_section', 'Ungrouped')}
                                  <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] tabular-nums">
                                    {ungroupedTasks.length}
                                  </Badge>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 space-y-2">
                                  <Droppable droppableId={TASK_GROUP_DROPPABLE_UNGROUPED}>
                                    {(provided) => (
                                      <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-2 rounded-md min-h-[12px]"
                                      >
                                        {ungroupedTasks.map((task, index) => {
                                          const displayIndex = tasks.findIndex((x) => x.id === task.id);
                                          return (
                                            <Draggable key={task.id} draggableId={task.id} index={index}>
                                              {(provided, snapshot) => {
                                                const draggableContent = (
                                                  <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={cn(
                                                      (provided.draggableProps as { className?: string })
                                                        .className,
                                                      snapshot.isDragging
                                                        ? 'shadow-lg z-[10000] opacity-100 bg-card rounded-lg border border-emerald-200 dark:border-emerald-900'
                                                        : '',
                                                      'nodrag nopan'
                                                    )}
                                                  >
                                                    <TaskConfigurationCard
                                                      task={task}
                                                      index={displayIndex >= 0 ? displayIndex : index}
                                                      tasks={tasks}
                                                      taskGroups={taskGroups}
                                                      onUpdate={(updates) => updateTask(task.id, updates)}
                                                      onRemove={() => removeTask(task.id)}
                                                      t={t}
                                                      dragHandleProps={provided.dragHandleProps}
                                                    />
                                                  </div>
                                                );
                                                return snapshot.isDragging
                                                  ? createPortal(draggableContent, document.body)
                                                  : draggableContent;
                                              }}
                                            </Draggable>
                                          );
                                        })}
                                        {provided.placeholder}
                                      </div>
                                    )}
                                  </Droppable>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })()}
                        </div>
                      </DragDropContext>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">
                        {t('flow_builder.ai_tasks_tip', 'Tip: Each active task creates an output handle for flow routing. Use specific descriptions to prevent false triggers.')}
                      </p>
                    </div>
                  </div>
                )}

                {!enableTaskExecution && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_task_execution_disabled_help', 'Enable task execution to allow AI SDK tools and advanced flow routing')}
                  </p>
                )}
              </div>

              {/* Google Calendar Integration Section */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {t('flow_builder.ai_google_calendar_integration', 'Google Calendar')}
                  </h3>
                  <Switch
                    checked={enableGoogleCalendar}
                    onCheckedChange={(checked) => {
                      setEnableGoogleCalendar(checked);
                      if (checked) {
                        setEnableLocalDentalBooking(false);
                      }
                    }}
                  />
                </div>

                {enableGoogleCalendar && (
                  <div className="space-y-4">
                    {/* Authentication Status */}
                    <div className="bg-card rounded-md p-3 border">
                      {isLoadingGoogleCalendarStatus ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {t('flow_builder.ai_checking_connection', 'Checking connection...')}
                        </div>
                      ) : isGoogleCalendarConnected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle className="h-4 w-4" />
                            {t('flow_builder.ai_google_calendar_connected', 'Google Calendar connected')}
                          </div>
                          <div className="flex gap-2">
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_switching"
                              onClick={authenticateGoogleCalendar}
                              disabled={isGoogleCalendarAuthenticating}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                            >
                              {isGoogleCalendarAuthenticating ? (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                  {t('flow_builder.ai_switching', 'Switching...')}
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  {t('flow_builder.ai_switch_account', 'Switch Account')}
                                </>
                              )}
                            </Button>
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_disconnect"
                              onClick={disconnectGoogleCalendar}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <LogOut className="mr-1 h-3 w-3" />
                              {t('flow_builder.ai_disconnect', 'Disconnect')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                            <AlertCircle className="h-4 w-4" />
                            {t('flow_builder.ai_google_calendar_not_connected', 'Authentication required')}
                          </div>
                          <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_connecting"
                            onClick={authenticateGoogleCalendar}
                            disabled={isGoogleCalendarAuthenticating}
                            size="sm"
                            className="text-xs h-7 bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
                          >
                            {isGoogleCalendarAuthenticating ? (
                              <>
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                {t('flow_builder.ai_connecting', 'Connecting...')}
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-1 h-3 w-3" />
                                {t('flow_builder.ai_connect_google_calendar', 'Connect Google Calendar')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    {isGoogleCalendarConnected && (
                      <div className="bg-card rounded-md p-3 border space-y-2">
                        <div>
                          <Label className="text-xs font-medium">{t('flow_builder.ai_select_calendar', 'Select Calendar')}</Label>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {t('flow_builder.ai_select_calendar_help', 'Choose which calendar from your connected Google account the AI should use for booking and availability checks.')}
                          </p>
                        </div>

                        {calendarAssignmentStrategy === 'round_robin' || calendarAssignmentStrategy === 'first_available' || calendarAssignmentStrategy === 'customer_selected' ? (
                          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                            <AlertCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                              {calendarAssignmentStrategy === 'customer_selected'
                                ? t('flow_builder.ai_select_calendar_customer_selected_primary', 'Customer-selected booking uses each selected team member\'s primary Google Calendar.')
                                : t('flow_builder.ai_select_calendar_dynamic_primary', 'Round-robin and first-available assignment use each selected agent\'s primary Google calendar.')}
                            </AlertDescription>
                          </Alert>
                        ) : isFetchingGoogleCalendars ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted rounded">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t('flow_builder.ai_select_calendar_loading', 'Loading calendars...')}
                          </div>
                        ) : isGoogleCalendarListError || googleCalendarList?.success === false ? (
                          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                            <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                              {t('flow_builder.ai_select_calendar_empty', 'No writable calendars found in this Google account.')}
                            </AlertDescription>
                          </Alert>
                        ) : googleCalendars.length === 0 ? (
                          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                            <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                              {t('flow_builder.ai_select_calendar_empty', 'No writable calendars found in this Google account.')}
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Select
                            value={googleCalendarId}
                            onValueChange={(value) => setGoogleCalendarId(value)}
                          >
                            <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_select_calendar" className="text-xs h-7">
                              <SelectValue placeholder={t('flow_builder.ai_select_calendar', 'Select Calendar')} />
                            </SelectTrigger>
                            <SelectContent>
                              {googleCalendars.map((calendar) => (
                                <SelectItem key={calendar.id} value={calendar.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2 w-2 rounded-full border border-border"
                                      style={{ backgroundColor: calendar.backgroundColor || '#4285F4' }}
                                    />
                                    <span>
                                      {calendar.summary}
                                      {calendar.primary ? ` (${t('flow_builder.ai_select_calendar_primary_badge', 'Primary')})` : ''}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    {/* Booking Assignment Strategy Section */}
                    {isGoogleCalendarConnected && (
                      <div className="bg-card rounded-md p-3 border space-y-3">
                        <div>
                          <Label className="text-xs font-medium">{t('flow_builder.ai_booking_assignment', 'Booking Assignment Strategy')}</Label>
                          <Select
                            value={calendarAssignmentStrategy}
                            onValueChange={(value) => {
                              setCalendarAssignmentStrategy(value);
                              if (value === 'customer_selected') {
                                setEnableErp(true);
                                setCalendarTargetAgentUserId(null);
                                setGoogleCalendarId('primary');
                              } else if (value === 'agent_pick') {
                                setBookableAgentUserIds([]);
                              } else {
                                setCalendarTargetAgentUserId(null);
                                setBookableAgentUserIds([]);
                                if (value === 'round_robin' || value === 'first_available') {
                                  setGoogleCalendarId('primary');
                                }
                              }
                            }}
                          >
                            <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_select_strategy" className="text-xs h-7 mt-1">
                              <SelectValue placeholder={t('flow_builder.ai_select_strategy', 'Select strategy...')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="company_default">
                                <div className="flex items-center gap-2">
                                  <span>{t('flow_builder.ai_strategy_company_default', 'Company Default')}</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="agent_pick">
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3" />
                                  <span>{t('flow_builder.ai_strategy_agent_pick', 'Agent Pick')}</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="customer_selected">
                                <div className="flex items-center gap-2">
                                  <Users className="h-3 w-3" />
                                  <span>{t('flow_builder.ai_strategy_customer_selected', 'Customer Selected')}</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="round_robin">
                                <div className="flex items-center gap-2">
                                  <RefreshCw className="h-3 w-3" />
                                  <span>{t('flow_builder.ai_strategy_round_robin', 'Round-Robin')}</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="first_available">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3 w-3" />
                                  <span>{t('flow_builder.ai_strategy_first_available', 'First Available')}</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {(() => {
                              switch (calendarAssignmentStrategy) {
                                case 'agent_pick':
                                  return t('flow_builder.ai_strategy_agent_pick_help', 'Select a specific agent to book appointments on their calendar');
                                case 'customer_selected':
                                  return t('flow_builder.ai_strategy_customer_selected_help', 'Customers choose from the configured roster before availability is checked');
                                case 'round_robin':
                                  return t('flow_builder.ai_strategy_round_robin_help', 'Automatically rotate through connected agents for each booking');
                                case 'first_available':
                                  return t('flow_builder.ai_strategy_first_available_help', 'Book with the agent who has the earliest available slot');
                                default:
                                  return t('flow_builder.ai_strategy_company_default_help', 'Use the company admin\'s calendar');
                              }
                            })()}
                          </p>
                          {calendarAssignmentStrategy === 'customer_selected' ? (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {t(
                                'flow_builder.ai_customer_selected_erp_coupled',
                                'ERP Automation is required for customer-selected booking and is turned on automatically when you choose this strategy.'
                              )}
                            </p>
                          ) : null}
                        </div>

                        {calendarAssignmentStrategy === 'agent_pick' && (
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_select_agent', 'Select Agent')}</Label>
                            {(() => {
                              if (isLoadingAgentsData) {
                                return (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    {t('flow_builder.ai_loading_agents', 'Loading agents...')}
                                  </div>
                                );
                              }
                              if (isAgentsDataError) {
                                return (
                                  <Alert className="mt-1 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                    <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                                      {t('flow_builder.ai_agents_load_failed', 'Could not load connected agents. Existing selections are preserved; try again after access is restored.')}
                                    </AlertDescription>
                                  </Alert>
                                );
                              }
                              if (connectedAgents.length > 0) {
                                return (
                                  <Select
                                    value={calendarTargetAgentUserId?.toString() || ''}
                                    onValueChange={(value) => setCalendarTargetAgentUserId(value ? Number.parseInt(value) : null)}
                                  >
                                    <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_select_agent_placeholder" className="text-xs h-7 mt-1">
                                      <SelectValue placeholder={t('flow_builder.ai_select_agent_placeholder', 'Choose an agent...')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {connectedAgents.map((agent: any) => (
                                        <SelectItem key={agent.userId} value={agent.userId.toString()}>
                                          <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <span>{agent.fullName || agent.email}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }
                              return (
                                <Alert className="mt-1 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                  <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                                    {t('flow_builder.ai_no_agents_connected', 'No agents have connected their Google Calendar yet. Agents can connect in their "My Calendar" settings.')}
                                  </AlertDescription>
                                </Alert>
                              );
                            })()}
                          </div>
                        )}

                        {calendarAssignmentStrategy === 'customer_selected' && (
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs font-medium">{t('flow_builder.ai_bookable_team_members', 'Bookable Team Members')}</Label>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {t('flow_builder.ai_bookable_team_members_help', 'Choose which connected team members customers can select before availability is checked.')}
                              </p>
                            </div>
                            {(() => {
                              if (isLoadingAgentsData) {
                                return (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    {t('flow_builder.ai_loading_agents', 'Loading agents...')}
                                  </div>
                                );
                              }
                              if (isAgentsDataError) {
                                return (
                                  <Alert className="mt-1 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                    <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                                      {t('flow_builder.ai_agents_load_failed', 'Could not load connected agents. Existing selections are preserved; try again after access is restored.')}
                                    </AlertDescription>
                                  </Alert>
                                );
                              }
                              if (connectedAgents.length > 0) {
                                return (
                                  <>
                                    <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 pr-1">
                                      <div className="space-y-1 p-2">
                                        {connectedAgents.map((agent: any) => {
                                          const agentUserId = Number(agent.userId);
                                          const isSelected = bookableAgentUserIds.includes(agentUserId);

                                          return (
                                            <label
                                              key={agent.userId}
                                              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-background"
                                            >
                                              <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => {
                                                  setBookableAgentUserIds((currentIds) => {
                                                    if (checked) {
                                                      return normalizeBookableAgentUserIds([...currentIds, agentUserId]);
                                                    }
                                                    return currentIds.filter((id) => id !== agentUserId);
                                                  });
                                                }}
                                              />
                                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <div className="h-2 w-2 shrink-0 rounded-full bg-green-500"></div>
                                                <span className="truncate">{agent.fullName || agent.email}</span>
                                              </div>
                                              {isSelected && (
                                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                                  {t('flow_builder.ai_selected', 'Selected')}
                                                </Badge>
                                              )}
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    {bookableAgentUserIds.length === 0 && (
                                      <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                        <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                                          {t('flow_builder.ai_bookable_team_members_required', 'Select at least one team member for customer-selected booking.')}
                                        </AlertDescription>
                                      </Alert>
                                    )}
                                  </>
                                );
                              }
                              return (
                                <Alert className="mt-1 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                  <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                                    {t('flow_builder.ai_no_agents_connected', 'No agents have connected their Google Calendar yet. Agents can connect in their "My Calendar" settings.')}
                                  </AlertDescription>
                                </Alert>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Calendar Functions Status */}
                    {isGoogleCalendarConnected && (
                      <div className="bg-card rounded-md p-3 border mb-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
                          <CheckCircle className="h-4 w-4" />
                          {t('flow_builder.ai_google_calendar_functions_available', 'Calendar Functions Available')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('flow_builder.ai_calendar_features_available', 'The AI can now: book appointments, check availability, list events, update events, and cancel events.')}
                          <br />
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{t('flow_builder.ai_calendar_system_prompt_note', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}</span>
                        </div>
                      </div>
                    )}

                    {/* Calendar Configuration */}
                    {isGoogleCalendarConnected && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_start', 'Business Hours Start')}</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_business_hours_start"
                              type="time"
                              value={calendarBusinessHours.start}
                              onChange={(e) => setCalendarBusinessHours((prev: any) => ({ ...prev, start: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_end', 'Business Hours End')}</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_business_hours_start"
                              type="time"
                              value={calendarBusinessHours.end}
                              onChange={(e) => setCalendarBusinessHours((prev: any) => ({ ...prev, end: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_appointment_duration', 'Appointment Duration (minutes)')}</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_appointment_duration"
                              type="number"
                              min="15"
                              max="480"
                              step="15"
                              value={calendarDefaultDuration}
                              onChange={(e) => setCalendarDefaultDuration(Number.parseInt(e.target.value) || 60)}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium flex items-center gap-1">
                              {t('flow_builder.ai_buffer_minutes', 'Buffer between meetings (minutes)')}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <p className="text-xs">
                                      Buffer time prevents back-to-back bookings by adding spacing before and after each appointment.
                                      This allows for overrun/setup time between meetings. Recommended: 0 for no buffer, 15-30 minutes for typical use cases.
                                      Buffer time is automatically applied when checking availability and creating bookings.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_appointment_duration"
                              type="number"
                              min="0"
                              max="120"
                              step="5"
                              value={calendarBufferMinutes}
                              onChange={(e) => setCalendarBufferMinutes(parseInt(e.target.value) || 0)}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        {/* Advanced Settings Section */}
                        <div className="border-t pt-3 mt-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-foreground">{t('flow_builder.ai_advanced_settings', 'Advanced Settings')}</h4>
                            <Switch
                              checked={calendarAdvancedMode}
                              onCheckedChange={setCalendarAdvancedMode}
                            />
                          </div>
                          
                          {calendarAdvancedMode ? (
                            <div className="space-y-3">
                              <p className="text-[10px] text-muted-foreground">
                                {t('flow_builder.ai_configure_day_schedule_help', 'Configure day-specific working hours, mark off-days, and add breaks. Off-days won\'t show any available slots.')}
                              </p>
                              <WeeklyScheduleEditor
                                schedule={calendarWeeklySchedule}
                                offDays={calendarOffDays}
                                onScheduleChange={setCalendarWeeklySchedule}
                                onOffDaysChange={setCalendarOffDays}
                                disabled={!isGoogleCalendarConnected}
                              />
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground">
                              {t('flow_builder.ai_using_simple_hours', 'Using simple hours: {{start}} - {{end}} for all days', { start: calendarBusinessHours.start, end: calendarBusinessHours.end })}
                            </div>
                          )}
                          <CalendarOfferingReminderSettings
                            offering={calendarOfferingSettings}
                            reminder={calendarReminderSettings}
                            onOfferingChange={setCalendarOfferingSettings}
                            onReminderChange={setCalendarReminderSettings}
                            disabled={!isGoogleCalendarConnected}
                          />
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {!enableGoogleCalendar && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_google_calendar_disabled_help', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}
                  </p>
                )}
              </div>

              {/* Zoho Calendar Integration Section */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {t('flow_builder.ai_zoho_calendar_integration', 'Zoho Calendar')}
                  </h3>
                  <Switch
                    checked={enableZohoCalendar}
                    onCheckedChange={setEnableZohoCalendar}
                  />
                </div>

                {enableZohoCalendar && (
                  <div className="space-y-4">
                    {/* Authentication Status */}
                    <div className="bg-card rounded-md p-3 border">
                      {isLoadingZohoCalendarStatus ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {t('flow_builder.ai_checking_connection', 'Checking connection...')}
                        </div>
                      ) : isZohoCalendarConnected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle className="h-4 w-4" />
                            {t('flow_builder.ai_zoho_calendar_connected', 'Zoho Calendar connected')}
                          </div>
                          <div className="flex gap-2">
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_switch_account"
                              onClick={authenticateZohoCalendar}
                              disabled={isZohoCalendarAuthenticating}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700"
                              title={t('flow_builder.ai_switch_account', 'Connect a different Zoho account')}
                            >
                              {isZohoCalendarAuthenticating ? (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                  {t('flow_builder.ai_switching', 'Switching...')}
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  {t('flow_builder.ai_switch_account', 'Switch Account')}
                                </>
                              )}
                            </Button>
                            <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_disconnect"
                              onClick={disconnectZohoCalendar}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <LogOut className="mr-1 h-3 w-3" />
                              {t('flow_builder.ai_disconnect', 'Disconnect')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                            <AlertCircle className="h-4 w-4" />
                            {t('flow_builder.ai_zoho_calendar_not_connected', 'Authentication required')}
                          </div>
                          <Button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_connecting"
                            onClick={authenticateZohoCalendar}
                            disabled={isZohoCalendarAuthenticating}
                            size="sm"
                            className="text-xs h-7 bg-orange-600 dark:bg-orange-500 hover:bg-orange-700 dark:hover:bg-orange-600"
                          >
                            {isZohoCalendarAuthenticating ? (
                              <>
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                {t('flow_builder.ai_connecting', 'Connecting...')}
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-1 h-3 w-3" />
                                {t('flow_builder.ai_connect_zoho_calendar', 'Connect Zoho Calendar')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Calendar Functions Status */}
                    {isZohoCalendarConnected && (
                      <div className="bg-card rounded-md p-3 border mb-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
                          <CheckCircle className="h-4 w-4" />
                          {t('flow_builder.ai_zoho_calendar_functions_available', 'Zoho Calendar Functions Available')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('flow_builder.ai_zoho_calendar_features_available', 'The AI can now: book appointments, check availability, list events, update events, and cancel events in Zoho Calendar.')}
                          <br />
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{t('flow_builder.ai_calendar_system_prompt_note', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}</span>
                        </div>
                      </div>
                    )}

                    {/* Calendar Configuration */}
                    {isZohoCalendarConnected && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_start', 'Business Hours Start')}</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_business_hours_start"
                              type="time"
                              value={zohoCalendarBusinessHours.start}
                              onChange={(e) => setZohoCalendarBusinessHours((prev: any) => ({ ...prev, start: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_end', 'Business Hours End')}</Label>
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_business_hours_start"
                              type="time"
                              value={zohoCalendarBusinessHours.end}
                              onChange={(e) => setZohoCalendarBusinessHours((prev: any) => ({ ...prev, end: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_appointment_duration', 'Appointment Duration (minutes)')}</Label>
                            <NumberInput
                              min={15}
                              max={480}
                              step={15}
                              value={zohoCalendarDefaultDuration}
                              onChange={setZohoCalendarDefaultDuration}
                              fallbackValue={60}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        {/* Advanced Settings Section */}
                        <div className="border-t pt-3 mt-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-foreground">{t('flow_builder.ai_advanced_settings', 'Advanced Settings')}</h4>
                            <Switch
                              checked={zohoCalendarAdvancedMode}
                              onCheckedChange={setZohoCalendarAdvancedMode}
                            />
                          </div>
                          
                          {zohoCalendarAdvancedMode ? (
                            <div className="space-y-3">
                              <p className="text-[10px] text-muted-foreground">
                                {t('flow_builder.ai_configure_day_schedule_help', 'Configure day-specific working hours, mark off-days, and add breaks. Off-days won\'t show any available slots.')}
                              </p>
                              <WeeklyScheduleEditor
                                schedule={zohoCalendarWeeklySchedule}
                                offDays={zohoCalendarOffDays}
                                onScheduleChange={setZohoCalendarWeeklySchedule}
                                onOffDaysChange={setZohoCalendarOffDays}
                                disabled={!isZohoCalendarConnected}
                              />
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground">
                              {t('flow_builder.ai_using_simple_hours', 'Using simple hours: {{start}} - {{end}} for all days', { start: zohoCalendarBusinessHours.start, end: zohoCalendarBusinessHours.end })}
                            </div>
                          )}
                          <CalendarOfferingReminderSettings
                            offering={zohoCalendarOfferingSettings}
                            reminder={zohoCalendarReminderSettings}
                            onOfferingChange={setZohoCalendarOfferingSettings}
                            onReminderChange={setZohoCalendarReminderSettings}
                            disabled={!isZohoCalendarConnected}
                          />
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {!enableZohoCalendar && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_zoho_calendar_disabled_help', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}
                  </p>
                )}
              </div>

              {/* Mode-aware ERP automation (AI tools) */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {t('flow_builder.ai_erp_integration', 'ERP Automation')}
                    <Badge variant="outline" className="text-[9px] font-normal capitalize">
                      {t(`flow_builder.erp.mode_${erpBusinessType}`, erpBusinessType)}
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <Dialog>
                          <DialogTrigger asChild>
                            <TooltipTrigger asChild>
                              <button data-tour="components-flow-builder-aiassistantnode.button.flow_builder.ai_task_execution_help_tooltip"
                                type="button"
                                className="h-3 w-3 text-muted-foreground cursor-help hover:text-foreground transition-colors"
                                aria-label={t('flow_builder.ai_task_execution_help_tooltip', 'Help & Documentation')}
                              >
                                <HelpCircle className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                          </DialogTrigger>
                          <DialogPrimitive.Portal>
                            <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out sm:rounded-lg overflow-hidden">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Package className="h-4 w-4" />
                                  {t('flow_builder.ai_erp_help_overview_title', 'ERP Automation')}
                                </DialogTitle>
                                <DialogDescription>
                                  {t(
                                    'flow_builder.ai_erp_help_subtitle',
                                    'ERP tools run for the current conversation contact only.'
                                  )}
                                </DialogDescription>
                              </DialogHeader>
                              <ErpAutomationHelpContent />
                              <DialogPrimitive.Close className={dialogCloseButtonClassName}>
                                <X className="h-4 w-4" />
                                <span className="sr-only">{t('common.close', 'Close')}</span>
                              </DialogPrimitive.Close>
                            </DialogPrimitive.Content>
                          </DialogPrimitive.Portal>
                        </Dialog>
                        <TooltipContent side="top">
                          <p className="text-xs">{t('flow_builder.ai_task_execution_help_tooltip', 'Help & Documentation')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h3>
                  <Switch
                    checked={enableErp}
                    onCheckedChange={(checked) => {
                      if (!checked && calendarAssignmentStrategy === 'customer_selected') {
                        setCalendarAssignmentStrategy('company_default');
                      }
                      if (!checked) {
                        setEnableLocalDentalBooking(false);
                      }
                      setEnableErp(checked);
                    }}
                  />
                </div>

                {enableErp && (
                  <div className="space-y-4">
                    <div className="bg-card rounded-md p-3 border text-xs text-muted-foreground space-y-1">
                      <p>
                        {t(
                          'flow_builder.ai_erp_capabilities_hint',
                          'The AI can place and fetch orders, generate and send invoices, update order status, and search products—all for the contact in this conversation only.'
                        )}
                      </p>
                    </div>

                    <div className="rounded-md border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`${id}-erp-catalog-price-sharing`}
                            className="text-xs font-medium"
                          >
                            {t(
                              'flow_builder.erp.catalog_price_sharing_label',
                              'Share product and service prices'
                            )}
                          </Label>
                          <p className="text-[10px] text-muted-foreground">
                            {t(
                              'flow_builder.erp.catalog_price_sharing_hint',
                              'When disabled, the assistant withholds catalog prices and uses the response below for price questions. Existing order, invoice, and payment amounts can still be shared.'
                            )}
                          </p>
                        </div>
                        <Switch
                          id={`${id}-erp-catalog-price-sharing`}
                          checked={erpCatalogPriceSharingEnabled}
                          onCheckedChange={setErpCatalogPriceSharingEnabled}
                        />
                      </div>

                      {!erpCatalogPriceSharingEnabled && (
                        <div className="space-y-2">
                          <Label htmlFor={`${id}-erp-price-inquiry-response`} className="text-xs">
                            {t(
                              'flow_builder.erp.price_inquiry_response_label',
                              'Price inquiry response'
                            )}
                          </Label>
                          <Textarea data-tour="components-flow-builder-aiassistantnode.textarea.erpPriceInquiryResponse"
                            id={`${id}-erp-price-inquiry-response`}
                            value={erpPriceInquiryResponse}
                            onChange={(event) => setErpPriceInquiryResponse(event.target.value)}
                            placeholder={ERP_PRICE_INQUIRY_RESPONSE_DEFAULT}
                            className="min-h-[84px] text-xs resize-y nodrag nopan"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {t(
                              'flow_builder.erp.price_inquiry_response_hint',
                              'The assistant preserves this meaning but translates and phrases it naturally in the conversation language.'
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {isDentalErp && (
                      <div className="rounded-md border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <Label htmlFor={`${id}-local-dental-booking`} className="text-xs font-medium flex items-center gap-2">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {t('flow_builder.ai_local_dental_booking', 'Local Dental Booking')}
                            </Label>
                            <p className="text-[10px] text-muted-foreground">
                              {t(
                                'flow_builder.ai_local_dental_booking_help',
                                'Uses the clinic schedule and existing Dental booking policy. It is mutually exclusive with Google Calendar on this node.',
                              )}
                            </p>
                          </div>
                          <Switch
                            id={`${id}-local-dental-booking`}
                            checked={enableLocalDentalBooking}
                            onCheckedChange={(checked) => {
                              setEnableLocalDentalBooking(checked);
                              if (checked) {
                                setEnableGoogleCalendar(false);
                              }
                            }}
                          />
                        </div>
                        {enableLocalDentalBooking && (
                          <div className="space-y-3 border-t pt-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="space-y-1">
                                <Label htmlFor={`${id}-local-dental-provider-sharing`} className="text-xs font-medium">
                                  {t('flow_builder.ai_local_dental_provider_sharing', 'Share provider details')}
                                </Label>
                                <p className="text-[10px] text-muted-foreground">
                                  {t('flow_builder.ai_local_dental_provider_sharing_help', 'When disabled, the assistant selects an eligible provider privately and never reveals provider details.')}
                                </p>
                              </div>
                              <Switch
                                id={`${id}-local-dental-provider-sharing`}
                                checked={localDentalProviderDetailsSharingEnabled}
                                onCheckedChange={setLocalDentalProviderDetailsSharingEnabled}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <div className="space-y-1">
                                <Label htmlFor={`${id}-local-dental-service-sharing`} className="text-xs font-medium">
                                  {t('flow_builder.ai_local_dental_service_sharing', 'Share service details')}
                                </Label>
                                <p className="text-[10px] text-muted-foreground">
                                  {t('flow_builder.ai_local_dental_service_sharing_help', 'When disabled, the assistant matches the patient’s needs privately instead of listing the service catalog.')}
                                </p>
                              </div>
                              <Switch
                                id={`${id}-local-dental-service-sharing`}
                                checked={localDentalServiceDetailsSharingEnabled}
                                onCheckedChange={setLocalDentalServiceDetailsSharingEnabled}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <div className="space-y-1">
                                <Label htmlFor={`${id}-local-dental-single-slot`} className="text-xs font-medium">
                                  {t('flow_builder.ai_local_dental_single_slot', 'Offer one appointment time at a time')}
                                </Label>
                                <p className="text-[10px] text-muted-foreground">
                                  {t('flow_builder.ai_local_dental_single_slot_help', 'Offer the best available time first, then the next option when the patient asks for another.')}
                                </p>
                              </div>
                              <Switch
                                id={`${id}-local-dental-single-slot`}
                                checked={localDentalSingleSlotOfferingEnabled}
                                onCheckedChange={setLocalDentalSingleSlotOfferingEnabled}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch id="ai-erp-pdf" checked={erpIncludePdfLink} onCheckedChange={setErpIncludePdfLink} />
                      <Label htmlFor="ai-erp-pdf" className="text-xs">
                        {t(
                          'flow_builder.erp.include_pdf_link_label',
                          'Send invoice as PDF attachment when supported (falls back to link)'
                        )}
                      </Label>
                    </div>

                    <Collapsible
                      open={erpProductImagesOpen}
                      onOpenChange={setErpProductImagesOpen}
                      className="rounded-md border"
                    >
                      <CollapsibleTrigger
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 nodrag nopan"
                      >
                        {erpProductImagesOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-semibold text-foreground">
                            {t('flow_builder.erp.product_images_section_label', 'Product images')}
                          </div>
                          {!erpProductImagesOpen && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {t(
                                'flow_builder.erp.product_images_collapsed_summary',
                                'When, products, max images, and captions'
                              )}
                            </p>
                          )}
                        </div>
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t px-3 py-3 space-y-4">
                      <p className="text-[10px] text-muted-foreground">
                        {t(
                          'flow_builder.erp.product_images_section_hint',
                          'Each selected product sends all of its uploaded photos (up to the cap). Telegram sends an album when there are 2+ images; WhatsApp and other channels send images one by one.'
                        )}
                      </p>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {t('flow_builder.erp.product_image_send_when_label', '1. When')}
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          {t(
                            'flow_builder.erp.product_image_send_when_hint',
                            'When the assistant may automatically attach product photos after a product search.'
                          )}
                        </p>
                        <RadioGroup
                          value={erpProductImageSendWhen}
                          onValueChange={(value) => setErpProductImageSendWhen(value as ErpProductImageSendWhen)}
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_SEND_WHEN_SINGLE_PRODUCT_RECOMMENDATION}
                              id={`${id}-erp-image-when-single`}
                            />
                            <Label htmlFor={`${id}-erp-image-when-single`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_send_when_single',
                                'Single product recommendation'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_SEND_WHEN_PRODUCT_SEARCH_RESULTS}
                              id={`${id}-erp-image-when-search`}
                            />
                            <Label htmlFor={`${id}-erp-image-when-search`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_send_when_search',
                                'Product search results'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_SEND_WHEN_EXPLICIT_REQUEST_ONLY}
                              id={`${id}-erp-image-when-explicit`}
                            />
                            <Label htmlFor={`${id}-erp-image-when-explicit`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_send_when_explicit',
                                'Explicit image or photo request only'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_SEND_WHEN_MENU_CATALOG_REPLIES}
                              id={`${id}-erp-image-when-menu`}
                            />
                            <Label htmlFor={`${id}-erp-image-when-menu`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_send_when_menu',
                                'Menu or catalog-style replies'
                              )}
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {t(
                            'flow_builder.erp.product_image_multi_match_label',
                            '2. Products'
                          )}
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          {t(
                            'flow_builder.erp.product_image_multi_match_hint',
                            'When several products match a search, how many products should receive images.'
                          )}
                        </p>
                        <RadioGroup
                          value={erpProductImageMultiMatchMode}
                          onValueChange={(value) =>
                            setErpProductImageMultiMatchMode(value as ErpProductImageMultiMatchMode)
                          }
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_MULTI_MATCH_FIRST_MATCH_ONLY}
                              id={`${id}-erp-image-multi-first`}
                            />
                            <Label htmlFor={`${id}-erp-image-multi-first`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_multi_match_first',
                                'First matched product only'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_MULTI_MATCH_UP_TO_THREE}
                              id={`${id}-erp-image-multi-three`}
                            />
                            <Label htmlFor={`${id}-erp-image-multi-three`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_multi_match_three',
                                'Up to 3 products'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_MULTI_MATCH_EVERY_MATCH}
                              id={`${id}-erp-image-multi-every`}
                            />
                            <Label htmlFor={`${id}-erp-image-multi-every`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_multi_match_every',
                                'Every matched product'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_MULTI_MATCH_TEXT_ONLY}
                              id={`${id}-erp-image-multi-text`}
                            />
                            <Label htmlFor={`${id}-erp-image-multi-text`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_multi_match_text_only',
                                'Keep multi-match replies text-only'
                              )}
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${id}-erp-image-max-per-product`} className="text-xs font-medium">
                          {t(
                            'flow_builder.erp.product_image_max_per_product_label',
                            '3. Images per product'
                          )}
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          {t(
                            'flow_builder.erp.product_image_max_per_product_hint',
                            'Maximum number of uploaded photos to send for each selected product.'
                          )}
                        </p>
                        <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.erp.product_image_send_when_label"
                          id={`${id}-erp-image-max-per-product`}
                          type="number"
                          min={ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MIN}
                          max={ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MAX}
                          value={erpProductImageMaxPerProduct}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) {
                              setErpProductImageMaxPerProduct(ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT);
                              return;
                            }
                            setErpProductImageMaxPerProduct(
                              Math.min(
                                ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MAX,
                                Math.max(ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MIN, Math.round(n))
                              )
                            );
                          }}
                          className="h-8 w-24 text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {t('flow_builder.erp.product_image_caption_mode_label', '4. Captions')}
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          {t(
                            'flow_builder.erp.product_image_caption_mode_hint',
                            'Where to place the product name and description on media messages.'
                          )}
                        </p>
                        <RadioGroup
                          value={erpProductImageCaptionMode}
                          onValueChange={(value) =>
                            setErpProductImageCaptionMode(value as ErpProductImageCaptionMode)
                          }
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_CAPTION_MODE_FIRST_ONLY}
                              id={`${id}-erp-image-caption-first`}
                            />
                            <Label htmlFor={`${id}-erp-image-caption-first`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_caption_mode_first',
                                'First image / album only'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_CAPTION_MODE_EVERY_IMAGE}
                              id={`${id}-erp-image-caption-every`}
                            />
                            <Label htmlFor={`${id}-erp-image-caption-every`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_caption_mode_every',
                                'Every image'
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={ERP_CAPTION_MODE_NONE}
                              id={`${id}-erp-image-caption-none`}
                            />
                            <Label htmlFor={`${id}-erp-image-caption-none`} className="text-xs">
                              {t(
                                'flow_builder.erp.product_image_caption_mode_none',
                                'No media captions (rely on AI text)'
                              )}
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}

                {!enableErp && (
                  <p className="text-[10px] text-muted-foreground">
                    {t(
                      'flow_builder.ai_erp_disabled_help',
                      'Enable mode-aware ERP tools for this contact during the conversation.'
                    )}
                  </p>
                )}
              </div>

              {/* Knowledge Base Configuration */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    {t('flow_builder.ai_knowledge_base', 'Knowledge Base')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t('flow_builder.ai_rag_enhancement', 'RAG Enhancement')}</span>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={knowledgeBaseEnabled}
                        onCheckedChange={handleKnowledgeBaseEnabledChange}
                        className="scale-75"
                      />
                    </div>
                  </div>
                </div>

                {knowledgeBaseEnabled ? (
                  <div className="space-y-4">
                    {/* Embedding provider credential warning */}
                    {provider === 'openrouter' && (
                      (credentialSource === 'manual' && !apiKey) ||
                      ((credentialSource === 'company' || credentialSource === 'auto') && !companyCredentials?.find((c: any) => c.provider === 'openrouter' && c.isActive)) ||
                      (credentialSource === 'system' && systemOpenRouterAvailable === false)
                    ) && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded text-[10px] text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>
                          {t('flow_builder.ai_knowledge_base_openrouter_warning', 'OpenRouter is selected but no OpenRouter credentials are configured. Configure OpenRouter in AI settings above, or switch to OpenAI as an alternative for embeddings.')}
                        </span>
                      </div>
                    )}

                    {/* Vector Database Provider Selector */}
                    <div className="space-y-2">
                      <Label htmlFor="vector-database" className="text-xs">
                        {t('flow_builder.ai_vector_database', 'Vector Database')}
                      </Label>
                      <Select
                        value={knowledgeBaseConfig.vectorDatabase ?? ''}
                        onValueChange={(value: VectorDatabaseProvider) => {
                          setKnowledgeBaseConfig((prev) => ({ ...prev, vectorDatabase: value }));
                          void persistVectorDatabaseSelection(value);
                        }}
                      >
                        <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_vector_database_placeholder" id="vector-database" className="text-xs">
                          <SelectValue placeholder={t('flow_builder.ai_vector_database_placeholder', 'Choose Pinecone or pgvector')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pinecone">{t('flow_builder.ai_vector_database_pinecone', 'Pinecone')}</SelectItem>
                          <SelectItem value="pgvector">{t('flow_builder.ai_vector_database_pgvector', 'pgvector')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {!knowledgeBaseConfig.vectorDatabase && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded text-[10px] text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>
                          {t(
                            'flow_builder.ai_vector_database_required',
                            'Choose a vector database before uploading documents or configuring RAG settings.'
                          )}
                        </span>
                      </div>
                    )}

                    {/* Pinecone Credentials */}
                    {knowledgeBaseConfig.vectorDatabase === 'pinecone' && (
                      <div className="space-y-3 p-3 bg-card rounded-lg border border-blue-200 dark:border-blue-900">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <h4 className="text-xs font-semibold text-foreground">{t('flow_builder.ai_pinecone_config', 'Pinecone Configuration')}</h4>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="pinecone-api-key" className="text-xs">
                            {t('flow_builder.ai_pinecone_api_key', 'Pinecone API Key')} <span className="text-red-500 dark:text-red-400">*</span>
                          </Label>
                          <div className="relative">
                            <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_pinecone_api_key_placeholder"
                              id="pinecone-api-key"
                              type={showPineconeApiKey ? "text" : "password"}
                              value={pineconeApiKey}
                              onChange={(e) => setPineconeApiKey(e.target.value)}
                              placeholder={t('flow_builder.ai_pinecone_api_key_placeholder', 'pc-xxxxxxxxxxxxxxxxxxxxxxxx')}
                              className="text-xs pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPineconeApiKey(!showPineconeApiKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showPineconeApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {t('flow_builder.ai_pinecone_get_key', 'Get your API key from')} <a href="https://app.pinecone.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{t('flow_builder.ai_pinecone_console', 'Pinecone Console')}</a>
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="pinecone-environment" className="text-xs">
                            {t('flow_builder.ai_pinecone_environment_region', 'Environment/Region')}
                          </Label>
                          <Select value={pineconeEnvironment} onValueChange={setPineconeEnvironment}>
                            <SelectTrigger data-tour="components-flow-builder-aiassistantnode.selecttrigger.flow_builder.ai_pinecone_select_region" id="pinecone-environment" className="text-xs">
                              <SelectValue placeholder={t('flow_builder.ai_pinecone_select_region', 'Select region')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="us-east-1">{t('flow_builder.ai_pinecone_region_us_east', 'US East (N. Virginia)')}</SelectItem>
                              <SelectItem value="us-west-2">{t('flow_builder.ai_pinecone_region_us_west', 'US West (Oregon)')}</SelectItem>
                              <SelectItem value="eu-west-1">{t('flow_builder.ai_pinecone_region_eu_west', 'EU West (Ireland)')}</SelectItem>
                              <SelectItem value="ap-southeast-1">{t('flow_builder.ai_pinecone_region_ap_southeast', 'Asia Pacific (Singapore)')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="pinecone-index-name" className="text-xs">
                            {t('flow_builder.ai_pinecone_index_name', 'Index Name')}
                          </Label>
                          <Input data-tour="components-flow-builder-aiassistantnode.input.flow_builder.ai_pinecone_index_placeholder"
                            id="pinecone-index-name"
                            type="text"
                            value={pineconeIndexName}
                            onChange={(e) => setPineconeIndexName(e.target.value)}
                            placeholder={t('flow_builder.ai_pinecone_index_placeholder', 'my-knowledge-base (optional)')}
                            className="text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {t('flow_builder.ai_pinecone_index_optional', 'Optional. If not provided, a default index name will be generated. The index will be created automatically if it doesn\'t exist.')}
                          </p>
                        </div>

                        {!pineconeApiKey && (
                          <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>{t('flow_builder.ai_pinecone_key_required', 'Pinecone API Key is required for Knowledge Base to work')}</span>
                          </div>
                        )}
                      </div>
                    )}

                   

                    {/* Document List with Upload Button */}
                    {knowledgeBaseConfig.vectorDatabase && (
                      <>
                        <div className="space-y-2">
                          <DocumentList
                            nodeId={id}
                            showNodeFilter={false}
                          />
                        </div>

                        {/* RAG Configuration */}
                        <div className="space-y-2">
                          <RAGConfiguration
                            nodeId={id}
                            config={ragConfig}
                            vectorDatabase={knowledgeBaseConfig.vectorDatabase}
                            llmProvider={provider}
                            azureEmbeddingDeployments={azureEmbeddingDeployments}
                            onConfigChange={(nextConfig) => {
                              setKnowledgeBaseConfig((prev) => ({
                                ...prev,
                                maxRetrievedChunks: nextConfig.maxRetrievedChunks,
                                similarityThreshold: nextConfig.similarityThreshold,
                                contextPosition: nextConfig.contextPosition,
                                contextTemplate: nextConfig.contextTemplate,
                                greetingAcknowledgementExpressions:
                                  nextConfig.greetingAcknowledgementExpressions,
                                embeddingModel: nextConfig.embeddingModel,
                                vectorDatabase: nextConfig.vectorDatabase ?? prev.vectorDatabase,
                                hybridEnabled: nextConfig.hybridEnabled,
                                denseTopK: nextConfig.denseTopK,
                                lexicalTopK: nextConfig.lexicalTopK,
                                rrfK: nextConfig.rrfK,
                                denseWeight: nextConfig.denseWeight,
                                lexicalWeight: nextConfig.lexicalWeight,
                                candidatePoolSize: nextConfig.candidatePoolSize,
                                dedupeEnabled: nextConfig.dedupeEnabled,
                                dedupeSimilarity: nextConfig.dedupeSimilarity,
                                mmrEnabled: nextConfig.mmrEnabled,
                                mmrLambda: nextConfig.mmrLambda,
                                rerankEnabled: nextConfig.rerankEnabled,
                                rerankModel: nextConfig.rerankModel,
                                rerankTopN: nextConfig.rerankTopN,
                                confidenceThreshold: nextConfig.confidenceThreshold,
                                queryRewriteEnabled: nextConfig.queryRewriteEnabled,
                                hnswEfSearch: nextConfig.hnswEfSearch,
                                answerValidationEnabled: nextConfig.answerValidationEnabled,
                              }));
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.ai_knowledge_base_disabled_help', 'Enable knowledge base to enhance AI SDK responses with document-based RAG context')}
                    </p>
                    <p className="text-[10px] text-blue-600">
                      💡 {t('flow_builder.ai_knowledge_base_setup_hint', 'To get started: Enable the toggle above, then choose a vector database (Pinecone or pgvector)')}
                    </p>
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="pointer-events-auto">
              <Handle
                type="target"
                position={Position.Bottom}
                id={AI_TOOL_INPUT_HANDLE_ID}
                style={mcpToolInputHandleStyle}
                isConnectable={isConnectable}
                key={`handle-tool-input-${handleKey}`}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs max-w-[240px]">
              {t('flow_builder.ai.connect_mcp_tools', 'Connect MCP Client Tool nodes here')}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {enableGoogleCalendar && isGoogleCalendarConnected && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="pointer-events-auto">
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={AI_CALENDAR_BOOKING_COMPLETED_HANDLE_ID}
                  style={calendarBookingCompletedSourceHandleStyle}
                  isConnectable={isConnectable}
                  key={`handle-calendar-booking-${handleKey}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="max-w-[240px]">
                <p className="text-xs font-medium text-sky-600">
                  {t('flow_builder.ai_booking_completed_handle_label', 'Booking Completed')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t(
                    'flow_builder.ai_booking_completed_handle_tooltip',
                    'Triggered after booking is successfully completed'
                  )}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <Handle
        type="target"
        position={Position.Left}
        id={FLOW_DEFAULT_TARGET_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />



      {/* Task output handles (manual tasks) */}
      {enableTaskExecution &&
        (() => {
          const manualEnabled = tasks.filter((task) => task.enabled);
          const totalHandles = manualEnabled.length + (enableSessionTakeover ? 1 : 0);
          const spacing = Math.min(15, 60 / Math.max(totalHandles, 1));
          const startPosition = 30;

          return (
            <>
              {manualEnabled.map((task, index) => (
                <div
                  key={`${task.id}-${handleKey}`}
                  className="absolute right-0 flex items-center pointer-events-none"
                  style={{ top: `${startPosition + index * spacing}%` }}
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="pointer-events-auto">
                          <Handle
                            type="source"
                            position={Position.Right}
                            id={task.outputHandle}
                            style={standardHandleStyle}
                            isConnectable={isConnectable}
                            key={`handle-${task.outputHandle}-${handleKey}`}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                            onMouseMove={(e) => {
                              e.stopPropagation();
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <div className="max-w-[250px]">
                          <p className="text-xs font-medium text-blue-600">{task.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-1 italic">
                            {t('flow_builder.ai_function_label', 'Function:')} {task.functionDefinition.name}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
            </>
          );
        })()}

      {completionVarNames.length > 0 && (
        <div
          className="absolute right-0 flex items-center pointer-events-none"
          style={{ top: '85%' }}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="pointer-events-auto">
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={AI_VARIABLES_COMPLETE_HANDLE_ID}
                    style={{ ...standardHandleStyle, backgroundColor: '#8b5cf6' }}
                    isConnectable={isConnectable}
                    key={`handle-variables-complete-${handleKey}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseMove={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="max-w-[250px]">
                  <p className="text-xs font-medium text-purple-600">Variables Complete</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {t('flow_builder.ai_variables_complete_description', 'Triggered once all required variables in the prompt are filled')}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    {t('flow_builder.ai_variables_complete_watching', 'Watching: {{variables}}', {
                      variables: completionVarNames.map((name) => `{{${name}}}`).join(', '),
                    })}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Session Takeover Exit Handle */}
      {/* {enableSessionTakeover && (
        <div
          className="absolute right-0 flex items-center pointer-events-none"
          style={{
            top: enableTaskExecution && tasks.filter(t => t.enabled).length > 0
              ? `${30 + (tasks.filter(t => t.enabled).length * Math.min(15, 60 / Math.max(tasks.filter(t => t.enabled).length + 1, 1)))}%`
              : '70%'
          }}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="pointer-events-auto">
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={exitOutputHandle}
                    style={{...standardHandleStyle, backgroundColor: '#f97316'}}
                    isConnectable={isConnectable}
                    key={`handle-${exitOutputHandle}-${handleKey}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseMove={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="max-w-[250px]">
                  <p className="text-xs font-medium text-orange-600">Session Exit</p>
                  <p className="text-xs text-muted-foreground mt-1">Triggered when AI session ends</p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    Stop keyword: "{stopKeyword || 'stop'}"
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )} */}

    </div>
  );
}
