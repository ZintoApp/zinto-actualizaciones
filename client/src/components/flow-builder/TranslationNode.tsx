import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect, FC, memo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useOpenRouterModels } from '@/services/openrouter';
import { useAzureDeploymentsQuery } from '@/services/azure';
import { DEFAULT_AZURE_OPENAI_API_VERSION, pickPreferredAzureChatModel, uniqueAzureDeploymentCatalog } from '@shared/ai-providers';
import { Trash2, Copy, Settings, Eye, EyeOff, Key, Shield, Building, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AiProviderOption } from '@/components/ui/ai-provider-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { standardHandleStyle } from './StyledHandle';



interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string; supportsTools?: boolean }[];
}

const OPENAI_MODELS = [
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const FALLBACK_OPENROUTER_MODELS = [
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (via OpenRouter)' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OpenRouter)' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini (via OpenRouter)' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (via OpenRouter)' },
  { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo (via OpenRouter)' },
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

const TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
];

const getTranslationModes = (t: any) => [
  { id: 'separate', name: t('flow_builder.translation_node.separate_message', 'Separate Message'), description: t('flow_builder.translation_node.separate_desc', 'Send translation as a separate follow-up message') },
  { id: 'append', name: t('flow_builder.translation_node.append_original', 'Append to Original'), description: t('flow_builder.translation_node.append_desc', 'Add translation to the end of the original message') },
  { id: 'replace', name: t('flow_builder.translation_node.replace_original', 'Replace Original'), description: t('flow_builder.translation_node.replace_desc', 'Replace the original message with the translation') },
];

interface TranslationNodeData {
  label: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  apiKey?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  credentialSource?: 'manual' | 'company' | 'system' | 'auto';
  outputVariable?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  translationMode?: string;
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
}

interface TranslationNodeProps {
  id: string;
  data: TranslationNodeData;
  isConnectable: boolean;
}




const NodeToolbar: FC<{ onDelete: () => void; onDuplicate: () => void; }> = memo(({ onDelete, onDuplicate }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button></TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate Node')}</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('flow_builder.delete_node', 'Delete Node')}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});


const NodeHeader: FC<{ isEditing: boolean; onToggleEdit: () => void; }> = memo(({ isEditing, onToggleEdit }) => {
  const { t } = useTranslation();
  return (
    <div className="p-3 border-b border-primary/20 bg-primary/10">
      <div className="font-medium flex items-center gap-2">
        <img 
          src={APP_ICONS.translation}
          alt="Translation" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.translation', 'Translation')}</span>
        <button data-tour="components-flow-builder-translationnode.button.flow_builder.translation_node.hide" className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={onToggleEdit}>
          {isEditing ? <><EyeOff className="h-3 w-3" />{t('flow_builder.translation_node.hide', 'Hide')}</> : <><Eye className="h-3 w-3" />{t('flow_builder.translation_node.edit', 'Edit')}</>}
        </button>
      </div>
    </div>
  );
});


const TranslationNodeSummary: FC<Pick<TranslationNodeData, 'enabled' | 'sourceLanguage' | 'targetLanguage' | 'translationMode' | 'outputVariable'>> = memo(({ enabled, sourceLanguage, targetLanguage, translationMode, outputVariable }) => {
  const { t } = useTranslation();
  const sourceLanguageName = !sourceLanguage || sourceLanguage === 'auto' ? t('flow_builder.translation_node.auto_detect', 'Auto-detect') : (TRANSLATION_LANGUAGES.find(l => l.code === sourceLanguage)?.name || sourceLanguage?.toUpperCase());
  const targetLanguageName = TRANSLATION_LANGUAGES.find(l => l.code === targetLanguage)?.name || targetLanguage?.toUpperCase();
  const modeName = getTranslationModes(t).find(m => m.id === translationMode)?.name || t('flow_builder.translation_node.append_original', 'Append to Original');
  const varName = outputVariable || 'translation';
  
  return (
    <div className="text-sm p-3  rounded border border-border">
      <div className="flex items-center gap-1 mb-2">
        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{t('flow_builder.translation_node.openai_translation', 'OpenAI Translation')}</span>
        {enabled && <span className="text-xs text-muted-foreground">{targetLanguageName}</span>}
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        {enabled ? t('flow_builder.translation_node.translation_enabled', 'Translation enabled') : t('flow_builder.translation_node.translation_disabled', 'Translation disabled')}
      </div>
      {enabled && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{t('flow_builder.translation_node.source_label', 'Source:')} {sourceLanguageName}</span>
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{t('flow_builder.translation_node.target_label', 'Target:')} {targetLanguageName}</span>
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{t('flow_builder.translation_node.mode_label', 'Mode:')} {modeName}</span>
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-mono">&#123;&#123;{varName}&#125;&#125;</span>
        </div>
      )}
    </div>
  );
});


const TranslationNodeSettings: FC<{
  state: TranslationNodeData;
  setState: (updates: Partial<TranslationNodeData>) => void;
  credentialSource: 'manual' | 'company' | 'system' | 'auto';
  setCredentialSource: (value: 'manual' | 'company' | 'system' | 'auto') => void;
  companyCredentials: any[] | undefined;
  providers: Provider[];
  isLoadingModels: boolean;
  modelsError: Error | null;
  availableModels: { id: string; name: string }[];
  onProviderChange: (value: string) => void;
}> = memo(({ state, setState, credentialSource, setCredentialSource, companyCredentials, providers, isLoadingModels, modelsError, availableModels, onProviderChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { enabled, apiKey, outputVariable, sourceLanguage, targetLanguage, translationMode, provider, model, azureEndpoint, azureApiVersion } = state;

  const variableTemplate = `{{${outputVariable || 'translation'}}}`;
  const copyVariableToClipboard = useCallback(() => {
    navigator.clipboard.writeText(variableTemplate).then(() => {
      toast({ title: t('flow_builder.copied_to_clipboard', 'Copied to clipboard'), duration: 2000 });
    });
  }, [variableTemplate, toast, t]);

  // When source is set and target equals source, reset target so it's not the same (target list hides source)
  useEffect(() => {
    if (sourceLanguage && sourceLanguage !== 'auto' && targetLanguage === sourceLanguage) {
      const firstOther = TRANSLATION_LANGUAGES.find(l => l.code !== sourceLanguage);
      if (firstOther) setState({ targetLanguage: firstOther.code });
    }
  }, [sourceLanguage, targetLanguage, setState]);

  const getApiDocUrl = () => {
    switch (provider) {
      case 'openrouter': return 'https://openrouter.ai/keys';
      case 'azure': return 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI';
      default: return 'https://platform.openai.com/api-keys';
    }
  };

  const getApiKeyLabel = () => {
    switch (provider) {
      case 'openrouter': return t('flow_builder.translation_node.openrouter_api_key', 'OpenRouter API Key');
      case 'azure': return t('flow_builder.translation_node.azure_api_key', 'Azure OpenAI API Key');
      default: return t('flow_builder.translation_node.openai_api_key', 'OpenAI API Key');
    }
  };

  const getApiKeyPlaceholder = () => {
    switch (provider) {
      case 'openrouter': return t('flow_builder.translation_node.openrouter_api_key_placeholder', 'Enter your OpenRouter API key');
      case 'azure': return t('flow_builder.translation_node.azure_api_key_placeholder', 'Enter your Azure OpenAI API key');
      default: return t('flow_builder.translation_node.api_key_placeholder', 'Enter your OpenAI API key');
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-primary/10">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <img 
          src={APP_ICONS.translation}
          alt="Translation" 
          className="h-4 w-4"
        /> {t('flow_builder.translation_node.configuration', 'Translation Configuration')}
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium cursor-pointer">{t('flow_builder.translation_node.enable_translation', 'Enable Translation')}</Label>
            <p className="text-[10px] text-muted-foreground">{t('flow_builder.translation_node.enable_desc', 'Automatically translate messages using AI')}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={value => setState({ enabled: value })} />
        </div>
        {enabled && (
          <div className="pl-4 border-l-2 border-primary/20 space-y-3">

            {/* Provider + Model */}
            <div className="grid grid-cols-2 gap-2 items-start">
              <div className="flex flex-col">
                <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_provider', 'AI Provider')}</Label>
                <Select value={provider} onValueChange={onProviderChange}>
                  <SelectTrigger data-tour="components-flow-builder-translationnode.selecttrigger.flow_builder.ai_select_provider" className="text-xs h-7 mt-1">
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
                  onValueChange={value => setState({ model: value })}
                  disabled={(provider === 'openrouter' || provider === 'azure') && isLoadingModels && availableModels.length === 0}
                >
                  <SelectTrigger data-tour="components-flow-builder-translationnode.selecttrigger.flow_builder.ai_loading_models" className="text-xs h-7 mt-1">
                    <SelectValue placeholder={
                      (provider === 'openrouter' || provider === 'azure') && isLoadingModels
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
                      availableModels.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {provider === 'azure' && (
                  <Input data-tour="components-flow-builder-translationnode.input.flow_builder.ai_azure_deployment_placeholder"
                    value={model || ''}
                    onChange={(e) => setState({ model: e.target.value })}
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

            {/* Credential Source */}
            <div>
              <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                <Key className="w-3 h-3" />
                {t('flow_builder.ai_credential_source', 'Credential Source')}
              </Label>
              <Select value={credentialSource} onValueChange={(value: string) => setCredentialSource(value as 'manual' | 'company' | 'system' | 'auto')}>
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

              {credentialSource !== 'manual' && (
                <div className="mt-1 text-[9px] text-muted-foreground">
                  {credentialSource === 'auto' && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                      {companyCredentials?.find((c: any) => c.provider === provider && c.isActive)
                        ? t('flow_builder.ai_credential_company_available', 'Company credential available')
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

              {credentialSource === 'manual' && (
                <div className="mt-2 space-y-2">
                  {provider === 'azure' && (
                    <>
                      <div>
                        <Label className="text-[10px] font-medium text-foreground">Azure endpoint</Label>
                        <Input
                          value={azureEndpoint || ''}
                          onChange={(e) => setState({ azureEndpoint: e.target.value })}
                          placeholder="https://your-resource.openai.azure.com"
                          className="text-xs h-7 mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-medium text-foreground">API version</Label>
                        <Input
                          value={azureApiVersion || ''}
                          onChange={(e) => setState({ azureApiVersion: e.target.value })}
                          placeholder={DEFAULT_AZURE_OPENAI_API_VERSION}
                          className="text-xs h-7 mt-1"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-[10px] font-medium text-foreground">{getApiKeyLabel()}</Label>
                    <Input data-tour="components-flow-builder-translationnode.input.apiKey" type="password" placeholder={getApiKeyPlaceholder()} value={apiKey} onChange={e => setState({ apiKey: e.target.value })} className="text-xs h-7 mt-1" />
                    <a href={getApiDocUrl()} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline mt-1 block">{t('flow_builder.translation_node.get_api_key', 'Get your API key here')}</a>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.source_language', 'Source Language')}</Label>
              <Select
                value={sourceLanguage || 'auto'}
                onValueChange={value => {
                  const newSource = value === 'auto' ? undefined : value;
                  const updates: Partial<TranslationNodeData> = { sourceLanguage: newSource };
                  if (newSource && targetLanguage === newSource) {
                    const firstOther = TRANSLATION_LANGUAGES.find(l => l.code !== newSource);
                    if (firstOther) updates.targetLanguage = firstOther.code;
                  }
                  setState(updates);
                }}
              >
                <SelectTrigger data-tour="components-flow-builder-translationnode.selecttrigger.flow_builder.translation_node.select_language" className="text-xs h-7 mt-1"><SelectValue placeholder={t('flow_builder.translation_node.select_language', 'Select language...')} /></SelectTrigger>
                <SelectContent className="max-h-48">
                  <SelectItem value="auto">{t('flow_builder.translation_node.auto_detect', 'Auto-detect')}</SelectItem>
                  {TRANSLATION_LANGUAGES.map(lang => <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground mt-0.5">{t('flow_builder.translation_node.source_language_help', 'Language of the incoming message; use Auto-detect to detect automatically')}</p>
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.target_language', 'Target Language')}</Label>
              <Select
                value={targetLanguage}
                onValueChange={value => setState({ targetLanguage: value })}
              >
                <SelectTrigger data-tour="components-flow-builder-translationnode.selecttrigger.flow_builder.translation_node.select_language" className="text-xs h-7 mt-1"><SelectValue placeholder={t('flow_builder.translation_node.select_language', 'Select language...')} /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {TRANSLATION_LANGUAGES.filter(lang => !sourceLanguage || sourceLanguage === 'auto' || lang.code !== sourceLanguage).map(lang => (
                    <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.translation_mode', 'Translation Mode')}</Label>
              <Select value={translationMode} onValueChange={value => setState({ translationMode: value })}>
                <SelectTrigger data-tour="components-flow-builder-translationnode.selecttrigger.flow_builder.translation_node.select_mode" className="text-xs h-7 mt-1"><SelectValue placeholder={t('flow_builder.translation_node.select_mode', 'Select mode...')} /></SelectTrigger>
                <SelectContent>
                  {getTranslationModes(t).map(mode => <SelectItem key={mode.id} value={mode.id}><div className="flex flex-col"><span className="font-medium">{mode.name}</span><span className="text-[10px] text-muted-foreground">{mode.description}</span></div></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.output_variable', 'Output variable')}</Label>
              <Input data-tour="components-flow-builder-translationnode.input.flow_builder.ai_provider"
                type="text"
                placeholder="translation"
                value={outputVariable ?? ''}
                onChange={e => setState({ outputVariable: e.target.value.trim() || undefined })}
                className="text-xs h-7 mt-1 font-mono"
              />
              <p className="text-[9px] text-muted-foreground mt-1">
                {t('flow_builder.translation_node.output_variable_help', 'Use {{variable}} in subsequent nodes to send the translation result with the contact.')}
                <button data-tour="components-flow-builder-translationnode.button.flow_builder.translation_node.click_to_copy"
                  type="button"
                  onClick={copyVariableToClipboard}
                  className="block mt-0.5 font-mono text-left cursor-pointer hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-ring rounded px-0.5 -ml-0.5 transition-opacity"
                  title={t('flow_builder.translation_node.click_to_copy', 'Click to copy')}
                >
                  {outputVariable ? (
                    <span className="text-primary">&#123;&#123;{outputVariable}&#125;&#125;</span>
                  ) : (
                    <span className="text-muted-foreground">&#123;&#123;translation&#125;&#125;</span>
                  )}
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});



export function TranslationNode({ id, data, isConnectable }: TranslationNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [credentialSource, setCredentialSource] = useState<'manual' | 'company' | 'system' | 'auto'>(data.credentialSource || 'auto');
  const [nodeState, setNodeState] = useState<TranslationNodeData>({
    label: data.label,
    enabled: data.enabled ?? true,
    provider: data.provider || 'openai',
    model: data.model || 'gpt-4o-mini',
    apiKey: data.apiKey || '',
    azureEndpoint: data.azureEndpoint || '',
    azureApiVersion: data.azureApiVersion || DEFAULT_AZURE_OPENAI_API_VERSION,
    credentialSource: data.credentialSource || 'auto',
    outputVariable: data.outputVariable ?? 'translation',
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage || 'en',
    translationMode: data.translationMode || 'append',
  });

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const { providers, isLoading: isLoadingModels, error: modelsError } = useAIProviders();
  const catalogModels = providers.find(p => p.id === (nodeState.provider || 'openai'))?.models || [];
  const availableModels = catalogModels.some((entry) => entry.id === nodeState.model) || !nodeState.model
    ? catalogModels
    : [{ id: nodeState.model as string, name: `${nodeState.model} (saved)` }, ...catalogModels];

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
    staleTime: 5 * 60 * 1000,
  });

  const updateNodeData = useCallback((updates: Partial<TranslationNodeData>) => {
    setNodes(nodes => nodes.map(node =>
      node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
    ));
  }, [id, setNodes]);

  useEffect(() => {
    updateNodeData(nodeState);
  }, [nodeState, updateNodeData]);

  const handleStateChange = (updates: Partial<TranslationNodeData>) => {
    setNodeState(prevState => ({ ...prevState, ...updates }));
  };

  const handleCredentialSourceChange = (value: 'manual' | 'company' | 'system' | 'auto') => {
    setCredentialSource(value);
    handleStateChange({ credentialSource: value });
  };

  const handleProviderChange = (value: string) => {
    const newProvider = providers.find(p => p.id === value);
    const nextModel = value === 'azure'
      ? pickPreferredAzureChatModel(newProvider?.models ?? [])
      : (newProvider?.models[0]?.id || '');
    handleStateChange({ provider: value, model: nextModel });
  };
  
  const handleDelete = () => onDeleteNode?.(id);
  const handleDuplicate = () => onDuplicateNode?.(id);

  return (
    <div className="node-translation rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group relative">
      <NodeToolbar onDelete={handleDelete} onDuplicate={handleDuplicate} />
      <NodeHeader isEditing={isEditing} onToggleEdit={() => setIsEditing(!isEditing)} />
      
      <div className="p-3 space-y-3">
        <TranslationNodeSummary {...nodeState} />
        {isEditing && (
            <TranslationNodeSettings
              state={nodeState}
              setState={handleStateChange}
              credentialSource={credentialSource}
              setCredentialSource={handleCredentialSourceChange}
              companyCredentials={companyCredentials}
              providers={providers}
              isLoadingModels={isLoadingModels}
              modelsError={modelsError}
              availableModels={availableModels}
              onProviderChange={handleProviderChange}
            />
        )}
      </div>

      {/* Left = input (from trigger only); Right = output only when Separate Message mode (direct child so React Flow can connect) */}
      <Handle type="target" position={Position.Left} id="input" style={{ ...standardHandleStyle, left: -8 }} isConnectable={isConnectable} />

      {nodeState.translationMode === 'separate' && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ ...standardHandleStyle, right: -8 }}
          isConnectable={isConnectable}
        />
      )}
    </div>
  );
}