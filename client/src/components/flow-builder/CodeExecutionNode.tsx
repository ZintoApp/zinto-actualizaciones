import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import {
  Trash2, Copy, Settings, Play, Loader2, Eye, EyeOff, Check, HelpCircle, X, Code, Network,
  AlertCircle, CheckCircle, Variable, Globe, Clock, Shield, Sparkles, Send, RotateCcw, User, Bot,
  Key, Building, AlertTriangle, RefreshCw, ChevronDown
} from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AiProviderOption } from '@/components/ui/ai-provider-icon';
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, dialogCloseButtonClassName } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useOpenRouterModels } from '@/services/openrouter';
import { useAzureDeploymentsQuery } from '@/services/azure';
import { DEFAULT_AZURE_OPENAI_API_VERSION, pickPreferredAzureChatModel, uniqueAzureDeploymentCatalog } from '@shared/ai-providers';
import { cn } from '@/lib/utils';

interface CodeExecutionNodeProps {
  id: string;
  data: {
    label: string;
    code?: string;
    timeout?: number; // ms
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

type CredentialSource = 'manual' | 'company' | 'system' | 'auto';

interface CodeGeneratorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

const OPENAI_MODELS = [
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro' },
  { id: 'gpt-5.1', name: 'GPT-5.1' },
  { id: 'gpt-5-chat', name: 'GPT-5 Chat' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const FALLBACK_OPENROUTER_MODELS = [
  { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex (via OpenRouter)' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4 (via OpenRouter)' },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1 (via OpenRouter)' },
  { id: 'openai/gpt-5-chat', name: 'GPT-5 Chat (via OpenRouter)' },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (via OpenRouter)' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OpenRouter)' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini (via OpenRouter)' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (via OpenRouter)' },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1 (via OpenRouter)' },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo (via OpenRouter)' },
];

function useAIProviders(): { providers: Provider[]; isLoading: boolean; error: Error | null } {
  const openRouterQuery = useQuery(useOpenRouterModels());
  const azureQuery = useAzureDeploymentsQuery(true);

  const azureModels = uniqueAzureDeploymentCatalog(azureQuery.data ?? [])
    .filter((item) => item.kind === 'chat')
    .map((item) => ({
      id: item.id,
      name: item.underlyingModel && item.underlyingModel !== item.id
        ? `${item.name} (${item.underlyingModel})`
        : item.name,
    }));

  const providers: Provider[] = [
    { id: 'openai', name: 'OpenAI', models: OPENAI_MODELS },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      models: openRouterQuery.data
        ? openRouterQuery.data.map(model => ({ id: model.id, name: model.name }))
        : FALLBACK_OPENROUTER_MODELS,
    },
    {
      id: 'azure',
      name: 'Azure OpenAI',
      models: azureModels,
    },
  ];

  return {
    providers,
    isLoading: openRouterQuery.isLoading || azureQuery.isLoading,
    error: (openRouterQuery.error || azureQuery.error) as Error | null,
  };
}

interface CodeGeneratorModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentCode: string;
  readonly conversationHistory: CodeGeneratorMessage[];
  readonly onHistoryChange: (history: CodeGeneratorMessage[]) => void;
  readonly onInsertCode: (text: string, mode: 'replace' | 'append') => void;
}

function CodeGeneratorModal({
  open,
  onOpenChange,
  currentCode,
  conversationHistory,
  onHistoryChange,
  onInsertCode,
}: CodeGeneratorModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [insertingMessageId, setInsertingMessageId] = useState<string | null>(null);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-5.3-codex');
  const [credentialSource, setCredentialSource] = useState<CredentialSource>('auto');
  const [apiKey, setApiKey] = useState('');
  const [azureEndpoint, setAzureEndpoint] = useState('');
  const [azureApiVersion, setAzureApiVersion] = useState(DEFAULT_AZURE_OPENAI_API_VERSION);
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { providers, isLoading: isLoadingModels, error: modelsError } = useAIProviders();
  const catalogModels = providers.find(p => p.id === provider)?.models || [];
  const availableModels = catalogModels.some((entry) => entry.id === model) || !model
    ? catalogModels
    : [{ id: model, name: `${model} (saved)` }, ...catalogModels];

  const { data: companyCredentials } = useQuery({
    queryKey: ['company-ai-credentials'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials');
      const result = await response.json();
      return result.data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

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

  const handleProviderChange = (nextProvider: string) => {
    setProvider(nextProvider);
    const nextModels = providers.find(p => p.id === nextProvider)?.models || [];
    const nextModel = nextProvider === 'azure'
      ? pickPreferredAzureChatModel(nextModels)
      : (nextModels[0]?.id || (nextProvider === 'openrouter' ? 'openai/gpt-5.3-codex' : 'gpt-5.3-codex'));
    setModel(nextModel);
  };

  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    if (credentialSource === 'manual' && !apiKey.trim()) {
      toast({
        variant: 'destructive',
        title: t('flow_builder.ai_code_gen_toast_error', 'Failed to generate code'),
        description: t('flow_builder.ai_manual_key_required', 'Manual API key is required'),
      });
      return;
    }
    if (provider === 'azure' && credentialSource === 'manual' && !azureEndpoint.trim()) {
      toast({
        variant: 'destructive',
        title: t('flow_builder.ai_code_gen_toast_error', 'Failed to generate code'),
        description: t('flow_builder.ai_azure_endpoint_required', 'Azure endpoint is required'),
      });
      return;
    }

    const userMessage: CodeGeneratorMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    const prev = conversationHistory;
    const historyForApi = prev.map(({ role, content }) => ({ role, content }));

    onHistoryChange([...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/ai-assist/generate-code', {
        message: trimmed,
        conversationHistory: historyForApi,
        provider,
        model,
        credentialSource,
        currentCode: currentCode || '',
        ...(credentialSource === 'manual' ? { apiKey } : {}),
        ...(provider === 'azure' && credentialSource === 'manual'
          ? { azureEndpoint, azureApiVersion }
          : {}),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }
      const messageText = typeof data.message === 'string' ? data.message : '';
      const assistantMessage: CodeGeneratorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: messageText,
      };
      onHistoryChange([...prev, userMessage, assistantMessage]);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : t('flow_builder.ai_code_gen_unknown_error', 'Unknown error');
      toast({
        variant: 'destructive',
        title: t('flow_builder.ai_code_gen_toast_error', 'Failed to generate code'),
        description: detail,
      });
      const errAssistant: CodeGeneratorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        isError: true,
        content: t('flow_builder.ai_code_gen_error_content', '**Error:** {{details}}', {
          details: detail,
        }),
      };
      onHistoryChange([...prev, userMessage, errAssistant]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-flow-builder-codeexecutionnode.dialogcontent.flow_builder.ai_code_gen_title"
        contentNoScroll
        className="max-w-2xl h-[85vh] gap-0 overflow-hidden border-emerald-500/15 bg-gradient-to-b from-background to-emerald-500/[0.03] shadow-xl sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 space-y-0 border-border/60 pb-3 pt-1">
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
                  {t('flow_builder.ai_code_gen_title', 'Generate Code with AI')}
                </DialogTitle>
                {conversationHistory.length > 0 && (
                  <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_prompt_gen_clear"
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
                  'flow_builder.ai_code_gen_description',
                  'Describe what the sandbox script should do, or ask to fix/refactor the current code.'
                )}
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/5 text-[10px] font-normal text-foreground"
                >
                  {t('flow_builder.ai_prompt_gen_using_model', 'Using {{provider}} · {{model}}', {
                    provider: providerLabel,
                    model,
                  })}
                </Badge>
                {currentCode.trim() ? (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {t('flow_builder.ai_code_gen_has_current', 'Current code included')}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <Collapsible
            open={aiSettingsOpen}
            onOpenChange={setAiSettingsOpen}
            className="mt-3 rounded-lg border border-border/70 bg-background/70"
          >
            <CollapsibleTrigger asChild>
              <button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_provider_settings"
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/40 rounded-lg"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground">
                      {t('flow_builder.ai_provider_settings', 'AI Provider Settings')}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {providerLabel} · {model} · {credentialSource}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    aiSettingsOpen && 'rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 border-t border-border/60 px-2.5 pb-2.5 pt-2">
            <div className="grid grid-cols-2 gap-2 items-start">
              <div className="flex flex-col">
                <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_provider', 'AI Provider')}</Label>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger data-tour="components-flow-builder-codeexecutionnode.selecttrigger.flow_builder.ai_select_provider" className="text-xs h-7 mt-1">
                    <SelectValue placeholder={t('flow_builder.ai_select_provider', 'Select provider')} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <AiProviderOption provider={p.id} label={p.name} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <Label className="text-[10px] font-medium text-foreground flex items-center gap-1 min-h-[14px]">
                  {t('flow_builder.ai_model', 'Model')}
                  {(provider === 'openrouter' || provider === 'azure') && isLoadingModels && (
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                  )}
                </Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={(provider === 'openrouter' || provider === 'azure') && isLoadingModels && availableModels.length === 0}
                >
                  <SelectTrigger data-tour="components-flow-builder-codeexecutionnode.selecttrigger.flow_builder.ai_loading_models" className="text-xs h-7 mt-1">
                    <SelectValue placeholder={
                      (provider === 'openrouter' || provider === 'azure') && isLoadingModels
                        ? t('flow_builder.ai_loading_models', 'Loading models...')
                        : t('flow_builder.ai_select_model', 'Select model')
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.length === 0 ? (
                      <SelectItem value="no-models" disabled>
                        {t('flow_builder.ai_no_models', 'No models available')}
                      </SelectItem>
                    ) : (
                      availableModels.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {provider === 'azure' && (
                  <Input data-tour="components-flow-builder-codeexecutionnode.input.flow_builder.ai_azure_deployment_placeholder"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={t('flow_builder.ai_azure_deployment_placeholder', 'Or type an Azure deployment name')}
                    className="text-xs h-7 mt-1"
                  />
                )}
                {provider === 'openrouter' && modelsError && (
                  <p className="text-[9px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
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
              <Select
                value={credentialSource}
                onValueChange={(value: string) => setCredentialSource(value as CredentialSource)}
              >
                <SelectTrigger className="text-xs h-7 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_auto', 'Auto (Company → System → Environment)')}</span>
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

              {credentialSource !== 'manual' && (
                <div className="mt-1 text-[9px] text-muted-foreground">
                  {companyCredentials?.find((c: any) => c.provider === provider && c.isActive) ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                      {t('flow_builder.ai_credential_company_available', 'Company credential available')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                      {t('flow_builder.ai_credential_fallback', 'Will use system/environment fallback')}
                    </span>
                  )}
                </div>
              )}

              {credentialSource === 'manual' && (
                <div className="mt-1.5 space-y-2">
                  {provider === 'azure' && (
                    <>
                      <Input data-tour="components-flow-builder-codeexecutionnode.input.azureEndpoint"
                        value={azureEndpoint}
                        onChange={(e) => setAzureEndpoint(e.target.value)}
                        placeholder="https://your-resource.openai.azure.com"
                        className="text-xs h-7"
                      />
                      <Input data-tour="components-flow-builder-codeexecutionnode.input.azureApiVersion"
                        value={azureApiVersion}
                        onChange={(e) => setAzureApiVersion(e.target.value)}
                        placeholder={DEFAULT_AZURE_OPENAI_API_VERSION}
                        className="text-xs h-7"
                      />
                    </>
                  )}
                  <div className="relative">
                    <Input data-tour="components-flow-builder-codeexecutionnode.input.flow_builder.ai_api_key_placeholder"
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={t('flow_builder.ai_api_key_placeholder', 'Enter API key')}
                      className="text-xs h-7 pr-8"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowApiKey(v => !v)}
                    >
                      {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
            </CollapsibleContent>
          </Collapsible>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-4 pr-3 pt-1">
            {conversationHistory.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-10 text-center dark:bg-emerald-950/20">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
                  <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {t('flow_builder.ai_code_gen_empty_title', 'Describe the script you need')}
                </p>
                <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
                  {t(
                    'flow_builder.ai_code_gen_empty',
                    'Example: structure debtor fields into variables.json_respuesta, or fix the current code.'
                  )}
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
                      if (isUser) return <User className="h-4 w-4 text-white" />;
                      if (isErr) return <AlertCircle className="h-4 w-4 text-white" />;
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
                          'whitespace-pre-wrap break-words leading-relaxed font-mono text-xs',
                          isUser && 'text-white font-sans text-sm',
                          !isUser && isErr && 'text-red-900 dark:text-red-100 font-sans text-sm',
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
                            <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_prompt_gen_replace"
                              type="button"
                              size="sm"
                              className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                              onClick={() => {
                                onInsertCode(msg.content, 'replace');
                                setInsertingMessageId(null);
                                onOpenChange(false);
                              }}
                            >
                              {t('flow_builder.ai_prompt_gen_replace', 'Replace')}
                            </Button>
                            <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_prompt_gen_append"
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                onInsertCode(msg.content, 'append');
                                setInsertingMessageId(null);
                                onOpenChange(false);
                              }}
                            >
                              {t('flow_builder.ai_prompt_gen_append', 'Append')}
                            </Button>
                            <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_prompt_gen_cancel"
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
                          <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_code_gen_insert"
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-emerald-500/35 bg-emerald-500/5 text-xs hover:bg-emerald-500/12"
                            onClick={() => setInsertingMessageId(msg.id)}
                          >
                            <Sparkles className="mr-1.5 h-3 w-3" />
                            {t('flow_builder.ai_code_gen_insert', 'Insert Code')}
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
                    {t('flow_builder.ai_code_gen_generating', 'Generating code…')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.ai_prompt_gen_generating_hint', 'This may take a few seconds')}
                  </p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="rounded-xl border border-border/80 bg-background/80 p-2 shadow-inner backdrop-blur-sm dark:bg-background/60">
          <Textarea data-tour="components-flow-builder-codeexecutionnode.textarea.flow_builder.ai_code_gen_placeholder"
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
              'flow_builder.ai_code_gen_placeholder',
              'Describe the code, or ask to fix/refactor the current editor contents…'
            )}
            className="min-h-[76px] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60"
            disabled={isLoading}
          />
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
            <p className="text-[10px] text-muted-foreground">
              {t('flow_builder.ai_prompt_gen_shortcut_hint', 'Ctrl+Enter to send')}
            </p>
            <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_prompt_gen_send_aria"
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

const TEMPLATES = {
  api: `const response = await fetch('https://api.example.com/data');
const data = await response.json();
variables.result = data;`,
  conditional: `if (variables.score > 80) {
  variables.result = "Pass";
} else {
  variables.result = "Fail";
}`,
  trycatch: `try {
  const res = await fetch('https://api.example.com/user');
  const user = await res.json();
  variables.user = user;
} catch (err) {
  variables.error = 'Failed to fetch user data';
}`,
  json: `try {
  const respuestaLimpia = {
    entidad: variables.ENTIDAD || "",
    deudor: variables.Nombre_Deudor || "",
    contrato: variables.Contrato || "",
    producto: variables.Producto || "",
    tipo_producto: variables.Tipo_producto || "",
    valor_a_cobrar: parseFloat(variables.Valor_a_cobrar) || 0,
    dias_mora: parseInt(variables.dias_mora) || 0,
    direccion: variables.Direccion || "",
    barrio: variables.Barrio || "",
    ciudad: variables.Ciudad || ""
  };

  variables.json_respuesta = respuestaLimpia;
} catch (error) {
  variables.error = "Error al estructurar el JSON: " + error.message;
}`,
  wikipedia: `const query = variables.query || "Pakistan";

const url = \`https://en.wikipedia.org/api/rest_v1/page/summary/\${encodeURIComponent(query)}\`;

const response = await fetch(url);
if (!response.ok) {
  throw new Error(\`Wikipedia API error: \${response.status}\`);
}

const data = await response.json();

variables.wiki_summary = data.extract || "Sorry, I couldn't find info on that.";`
};

export function CodeExecutionNode({ id, data, isConnectable }: CodeExecutionNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [code, setCode] = useState<string>(data.code || '');
  const [timeout, setTimeoutMs] = useState<number>(typeof data.timeout === 'number' ? data.timeout : 5000);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; result?: any; variables?: any } | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeGeneratorOpen, setCodeGeneratorOpen] = useState(false);
  const [codeGenHistory, setCodeGenHistory] = useState<CodeGeneratorMessage[]>([]);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId } = useFlowContext();

  const updateNodeData = useCallback((updates: any) => {
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
  }, [id, setNodes]);

  useEffect(() => {
    updateNodeData({ code, timeout });
  }, [updateNodeData, code, timeout]);

  const applyTemplate = (templateKey: keyof typeof TEMPLATES) => {
    setCode(TEMPLATES[templateKey]);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const runLocalLint = () => {
    if (!code.trim()) {
      setTestResult({ success: false, error: t('flow_builder.code_execution.code_empty', 'Code is empty') });
      return false;
    }
    setTestResult(null);
    return true;
  };

  const testExecution = async () => {
    if (!runLocalLint()) return;
    setIsTesting(true);
    try {
      const res = await fetch('/api/flows/test-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, timeout, flowId: flowId ?? undefined, variables: {} })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({ success: false, error: data.error || `HTTP ${res.status}` });
      } else {
        setTestResult({ success: true, result: data.result, variables: data.variables });
      }
    } catch (e: any) {
      setTestResult({ success: false, error: e?.message || t('flow_builder.code_execution.unknown_error', 'Unknown error') });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className={cn(
      "node-code-execution rounded-lg bg-card border border-border shadow-sm group relative transition-all duration-200",
      isEditing ? "min-w-[560px] w-[620px] max-w-[720px]" : "max-w-[380px]"
    )}>
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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

      <div className="p-3 border-b bg-muted/60">
        <div className="font-medium flex items-center gap-2">
          <img 
            src={APP_ICONS.codeExecution}
            alt={t('flow_builder.code_execution.alt', 'Code Execution')}
            className="h-4 w-4"
          />
          <span>{t('flow_builder.code_execution', 'Code Execution')}</span>
          <div className="ml-auto flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogPrimitive.Portal>
                      <DialogPrimitive.Content
                        className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
                      >
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Code className="h-5 w-5 text-primary" />
                            {t('flow_builder.code_execution.help_title', 'Code Execution Node - Help & Documentation')}
                          </DialogTitle>
                          <DialogDescription>
                            {t('flow_builder.code_execution.help_description', 'Learn how to execute custom JavaScript code in your flows')}
                          </DialogDescription>
                        </DialogHeader>
                        <CodeExecutionHelpContent />
                        <DialogPrimitive.Close className={dialogCloseButtonClassName}>
                          <X className="h-4 w-4" />
                          <span className="sr-only">{t('flow_builder.code_execution.close', 'Close')}</span>
                        </DialogPrimitive.Close>
                      </DialogPrimitive.Content>
                    </DialogPrimitive.Portal>
                  </Dialog>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.code_execution.help_docs', 'Help & Documentation')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.hide"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? (
                <>
                  <EyeOff className="h-3 w-3" />
                  {t('flow_builder.hide', 'Hide')}
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" />
                  {t('flow_builder.edit', 'Edit')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className={`${isEditing ? 'max-h-[780px]' : 'max-h-[220px]'} overflow-y-auto custom-scrollbar`}>
        <div className="p-3 space-y-3">
          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate">
                {t('flow_builder.code_execution.async_summary', 'Async JavaScript • variables + fetch available')}
              </span>
            </div>
            <div className="mt-2 text-xs text-primary font-medium">
              {t('flow_builder.code_execution.output_label', 'Output:')}{' '}
              <code 
                className="bg-primary/10 px-1 rounded cursor-pointer hover:bg-primary/20 transition-colors"
                onClick={() => copyToClipboard('{{code_execution_output}}')}
                title={t('flow_builder.code_execution.copy_output_title', 'Click to copy {{code_execution_output}}')}
              >
                code_execution_output
              </code>
              {copied && (
                <span className="ml-2 text-primary flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {t('flow_builder.code_execution.copied', 'Copied!')}
                </span>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="text-xs space-y-3 border rounded p-2 ">
              <div>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <Label className="font-medium">{t('flow_builder.code_execution.code_label', 'Code')}</Label>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.ai_generate_with_ai"
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2 border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                      onClick={() => setCodeGeneratorOpen(true)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {t('flow_builder.ai_generate_with_ai', 'Generate with AI')}
                    </Button>
                    <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.code_execution.template_api" size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('api')}>
                      {t('flow_builder.code_execution.template_api', 'API')}
                    </Button>
                    <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.code_execution.template_conditional" size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('conditional')}>
                      {t('flow_builder.code_execution.template_conditional', 'If/Else')}
                    </Button>
                    <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.code_execution.template_trycatch" size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('trycatch')}>
                      {t('flow_builder.code_execution.template_trycatch', 'Try/Catch')}
                    </Button>
                    <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.code_execution.template_json" size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('json')}>
                      {t('flow_builder.code_execution.template_json', 'JSON')}
                    </Button>
                    <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.code_execution.template_wikipedia" size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('wikipedia')}>
                      {t('flow_builder.code_execution.template_wikipedia', 'Wikipedia')}
                    </Button>
                  </div>
                </div>
                <Textarea data-tour="components-flow-builder-codeexecutionnode.textarea.flow_builder.code_execution.code_placeholder"
                  placeholder={t(
                    'flow_builder.code_execution.code_placeholder',
                    "// You can use 'variables' and 'fetch' here.\n// Example: variables.order = 'invoice_number'"
                  )}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-xs min-h-[280px] resize-y font-mono"
                />
                <div className="mt-2">
                  <Label className="block mb-1 font-medium">
                    {t('flow_builder.code_execution.timeout_label', 'Timeout (ms)')}
                  </Label>
                  <Input data-tour="components-flow-builder-codeexecutionnode.input.flow_builder.code_execution.code_label"
                    type="number"
                    min={100}
                    max={30000}
                    step={100}
                    value={timeout}
                    onChange={(e) => setTimeoutMs(Math.max(100, Math.min(30000, Number(e.target.value) || 0)))}
                    className="text-xs h-7 w-32"
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {t(
                    'flow_builder.code_execution.sandbox_hint',
                    'Runs in a secure sandbox with async/await. Use variables to pass data downstream.'
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button data-tour="components-flow-builder-codeexecutionnode.button.flow_builder.code_execution.test_aria"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={testExecution}
                  disabled={isTesting || !code.trim()}
                  aria-label={t('flow_builder.code_execution.test_aria', 'Test code')}
                >
                  {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                </Button>
                {testResult && (
                  <span className={`text-[10px] ${testResult.success ? 'text-primary' : 'text-destructive'}`}>
                    {testResult.success
                      ? t('flow_builder.code_execution.success', 'Success')
                      : (testResult.error || t('flow_builder.code_execution.error', 'Error'))}
                  </span>
                )}
              </div>
              {testResult?.success && (
                <div className="mt-2 text-[10px] bg-muted border p-2 rounded font-mono max-h-40 overflow-y-auto">
                  {testResult.result != null && (
                    <>
                      <div className="mb-1 text-xs font-medium">
                        {t('flow_builder.code_execution.result', 'Result')}
                      </div>
                      <pre className="whitespace-pre-wrap">{JSON.stringify(testResult.result, null, 2)}</pre>
                    </>
                  )}
                  <div className={`${testResult.result != null ? 'mt-2 ' : ''}mb-1 text-xs font-medium`}>
                    {t('flow_builder.code_execution.variables', 'Variables')}
                  </div>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(testResult.variables, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      <CodeGeneratorModal
        open={codeGeneratorOpen}
        onOpenChange={setCodeGeneratorOpen}
        currentCode={code}
        conversationHistory={codeGenHistory}
        onHistoryChange={setCodeGenHistory}
        onInsertCode={(text, mode) => {
          if (mode === 'replace') {
            setCode(text);
            updateNodeData({ code: text });
          } else {
            setCode((prev) => {
              const next = prev.trim() ? `${prev}\n\n${text}` : text;
              updateNodeData({ code: next });
              return next;
            });
          }
        }}
      />
    </div>
  );
}

function CodeExecutionHelpContent() {
  const { t } = useTranslation();

  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            {t('flow_builder.code_execution.help.overview_title', 'Node Overview')}
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p
              className="text-sm text-foreground mb-2"
              dangerouslySetInnerHTML={{
                __html: t(
                  'flow_builder.code_execution.help.overview_p1',
                  'The <strong>Code Execution Node</strong> allows you to run custom JavaScript code within your flows. It provides a secure sandbox environment where you can execute complex logic, make API calls, and manipulate data using modern JavaScript features like async/await.'
                ),
              }}
            />
            <p
              className="text-sm text-foreground"
              dangerouslySetInnerHTML={{
                __html: t(
                  'flow_builder.code_execution.help.overview_p2',
                  '<strong>Key Benefits:</strong> Custom business logic, API integrations, data transformation, conditional processing, and dynamic content generation.'
                ),
              }}
            />
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            {t('flow_builder.code_execution.help.apis_title', 'Available APIs & Variables')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Variable className="h-3 w-3" />
                {t('flow_builder.code_execution.help.variables_title', 'Variables Object')}
              </h4>
              <p
                className="text-xs text-muted-foreground mb-2"
                dangerouslySetInnerHTML={{
                  __html: t(
                    'flow_builder.code_execution.help.variables_desc',
                    'Access and modify flow variables using the <code>variables</code> object.'
                  ),
                }}
              />
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>{t('flow_builder.code_execution.help.variables_reading', 'Reading:')}</strong> const name = variables.user_name;</div>
                <div><strong>{t('flow_builder.code_execution.help.variables_writing', 'Writing:')}</strong> variables.result = "Hello World";</div>
                <div><strong>{t('flow_builder.code_execution.help.variables_updating', 'Updating:')}</strong> variables.counter = (variables.counter || 0) + 1;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Globe className="h-3 w-3" />
                {t('flow_builder.code_execution.help.fetch_title', 'Fetch API')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('flow_builder.code_execution.help.fetch_desc', 'Make HTTP requests to external APIs using the standard fetch API.')}
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>{t('flow_builder.code_execution.help.fetch_get', 'GET Request:')}</strong></div>
                <div>const response = await fetch('https://api.example.com/data');</div>
                <div>const data = await response.json();</div>
                <div><strong>{t('flow_builder.code_execution.help.fetch_post', 'POST Request:')}</strong></div>
                <div>const response = await fetch('https://api.example.com/data', &#123;</div>
                <div>  method: 'POST',</div>
                <div>  headers: &#123; 'Content-Type': 'application/json' &#125;,</div>
                <div>  body: JSON.stringify(&#123; key: 'value' &#125;)</div>
                <div>&#125;);</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {t('flow_builder.code_execution.help.security_title', 'Security & Sandbox')}
          </h3>
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">
                ✅ {t('flow_builder.code_execution.help.allowed_title', "What's Allowed")}
              </h4>
              <ul className="text-xs text-primary space-y-1">
                <li>• {t('flow_builder.code_execution.help.allowed_1', 'Standard JavaScript (ES6+) features')}</li>
                <li>• {t('flow_builder.code_execution.help.allowed_2', 'Async/await for asynchronous operations')}</li>
                <li>• {t('flow_builder.code_execution.help.allowed_3', 'HTTP requests via fetch API')}</li>
                <li>• {t('flow_builder.code_execution.help.allowed_4', 'JSON parsing and manipulation')}</li>
                <li>• {t('flow_builder.code_execution.help.allowed_5', 'String, array, and object operations')}</li>
                <li>• {t('flow_builder.code_execution.help.allowed_6', 'Mathematical calculations')}</li>
              </ul>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-destructive">
                ❌ {t('flow_builder.code_execution.help.restricted_title', "What's Restricted")}
              </h4>
              <ul className="text-xs text-destructive space-y-1">
                <li>• {t('flow_builder.code_execution.help.restricted_1', 'File system access')}</li>
                <li>• {t('flow_builder.code_execution.help.restricted_2', 'Network access beyond fetch')}</li>
                <li>• {t('flow_builder.code_execution.help.restricted_3', 'Process manipulation')}</li>
                <li>• {t('flow_builder.code_execution.help.restricted_4', 'Environment variables')}</li>
                <li>• {t('flow_builder.code_execution.help.restricted_5', 'Node.js specific modules')}</li>
                <li>• {t('flow_builder.code_execution.help.restricted_6', 'eval() and similar functions')}</li>
              </ul>
            </div>
          </div>
        </section>

        <Separator />

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Variable className="h-4 w-4 text-primary" />
            {t('flow_builder.code_execution.help.output_title', 'Output System')}
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">
                {t('flow_builder.code_execution.help.output_how_title', 'How Output Works')}
              </h4>
              <p
                className="text-xs text-foreground mb-2"
                dangerouslySetInnerHTML={{
                  __html: t(
                    'flow_builder.code_execution.help.output_how_desc',
                    'All variables you create in your code are automatically saved and made available to other nodes through the <code>code_execution_output</code> variable.'
                  ),
                }}
              />
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div><strong>{t('flow_builder.code_execution.help.output_in_node', 'In Code Execution Node:')}</strong></div>
                <div>variables.wiki_summary = "Pakistan is a country...";</div>
                <div>variables.user_score = 95;</div>
                <br/>
                <div><strong>{t('flow_builder.code_execution.help.output_in_next', 'In Next Node (Message):')}</strong></div>
                <div>Summary: &#123;&#123;code_execution_output.wiki_summary&#125;&#125;</div>
                <div>Score: &#123;&#123;code_execution_output.user_score&#125;&#125;</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            {t('flow_builder.code_execution.help.config_title', 'Configuration Options')}
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <Clock className="h-3 w-3 text-primary" />
                {t('flow_builder.code_execution.help.timeout_title', 'Execution Timeout')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t(
                  'flow_builder.code_execution.help.timeout_desc',
                  'Set the maximum execution time in milliseconds (100ms - 30,000ms). Code that runs longer will be automatically terminated.'
                )}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-primary" />
                {t('flow_builder.code_execution.help.test_title', 'Test Code Feature')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t(
                  'flow_builder.code_execution.help.test_desc',
                  'Use the Test button to execute your code in a safe environment and see the results before deploying to your flow.'
                )}
              </p>
            </div>
          </div>
        </section>

        <Separator />

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            {t('flow_builder.code_execution.help.templates_title', 'Code Templates')}
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-primary/10">
              <h4 className="font-medium text-sm mb-2">
                {t('flow_builder.code_execution.help.template_api_title', 'API Call Template')}
              </h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>const response = await fetch('https://api.example.com/data');</div>
                <div>const data = await response.json();</div>
                <div>variables.result = data;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-primary/10">
              <h4 className="font-medium text-sm mb-2">
                {t('flow_builder.code_execution.help.template_conditional_title', 'Conditional Logic Template')}
              </h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>if (variables.score &gt; 80) &#123;</div>
                <div>  variables.result = "Pass";</div>
                <div>&#125; else &#123;</div>
                <div>  variables.result = "Fail";</div>
                <div>&#125;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-secondary/10">
              <h4 className="font-medium text-sm mb-2">
                {t('flow_builder.code_execution.help.template_error_title', 'Error Handling Template')}
              </h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>try &#123;</div>
                <div>  const res = await fetch('https://api.example.com/user');</div>
                <div>  const user = await res.json();</div>
                <div>  variables.user = user;</div>
                <div>&#125; catch (err) &#123;</div>
                <div>  variables.error = 'Failed to fetch user data';</div>
                <div>&#125;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-primary/10">
              <h4 className="font-medium text-sm mb-2">
                {t('flow_builder.code_execution.help.template_wiki_title', 'Wikipedia API Template')}
              </h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>const query = variables.query || "Pakistan";</div>
                <div>const url = `https://en.wikipedia.org/api/rest_v1/page/summary/$&#123;encodeURIComponent(query)&#125;`;</div>
                <div>const response = await fetch(url);</div>
                <div>if (!response.ok) &#123;</div>
                <div>  throw new Error(`Wikipedia API error: $&#123;response.status&#125;`);</div>
                <div>&#125;</div>
                <div>const data = await response.json();</div>
                <div>variables.wiki_summary = data.extract || "Sorry, I couldn't find info on that.";</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            {t('flow_builder.code_execution.help.best_practices_title', 'Best Practices & Tips')}
          </h3>
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">
                ✅ {t('flow_builder.code_execution.help.dos_title', "Do's")}
              </h4>
              <ul className="text-xs text-primary space-y-1">
                <li>• {t('flow_builder.code_execution.help.dos_1', 'Use descriptive variable names (user_data, api_response, processed_result)')}</li>
                <li>• {t('flow_builder.code_execution.help.dos_2', 'Always handle errors with try/catch blocks')}</li>
                <li>• {t('flow_builder.code_execution.help.dos_3', 'Test your code using the Test button before deploying')}</li>
                <li>• {t('flow_builder.code_execution.help.dos_4', 'Use appropriate timeouts for API calls')}</li>
                <li>• {t('flow_builder.code_execution.help.dos_5', 'Validate API responses before using the data')}</li>
                <li>• {t('flow_builder.code_execution.help.dos_6', 'Use async/await for cleaner asynchronous code')}</li>
              </ul>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-destructive">
                ❌ {t('flow_builder.code_execution.help.donts_title', "Don'ts")}
              </h4>
              <ul className="text-xs text-destructive space-y-1">
                <li>• {t('flow_builder.code_execution.help.donts_1', "Don't write infinite loops or blocking code")}</li>
                <li>• {t('flow_builder.code_execution.help.donts_2', "Don't make synchronous calls that could timeout")}</li>
                <li>• {t('flow_builder.code_execution.help.donts_3', "Don't store sensitive data in variables")}</li>
                <li>• {t('flow_builder.code_execution.help.donts_4', "Don't make too many API calls in a single execution")}</li>
                <li>• {t('flow_builder.code_execution.help.donts_5', "Don't ignore error handling")}</li>
              </ul>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">
                💡 {t('flow_builder.code_execution.help.tips_title', 'Pro Tips')}
              </h4>
              <ul className="text-xs text-primary space-y-1">
                <li>• {t('flow_builder.code_execution.help.tips_1', 'Use the Test button to debug your code before deploying')}</li>
                <li>• {t('flow_builder.code_execution.help.tips_2', 'Click on "code_execution_output" to copy {{code_execution_output}}')}</li>
                <li>• {t('flow_builder.code_execution.help.tips_3', 'Use templates as starting points for common scenarios')}</li>
                <li>• {t('flow_builder.code_execution.help.tips_4', 'Check the console logs for debugging information')}</li>
                <li>• {t('flow_builder.code_execution.help.tips_5', 'Use the Variables tab to see all available flow variables')}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

export default CodeExecutionNode;


