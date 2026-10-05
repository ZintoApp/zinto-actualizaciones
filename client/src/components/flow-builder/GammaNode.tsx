import { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { CheckCircle, AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { GAMMA_FLOW_NODE_ICON_SRC } from '@/pages/flow-builder-node-catalog';
import type {
  GammaNodeData,
  GammaLogoPlacementMode,
  GammaLogoHeaderPosition,
  GammaLogoHeaderSize,
  GammaAssistantDocumentType,
  GammaAssistantSystemPrompts,
} from '@shared/types/node-types';
import { normalizeGammaAssistantSystemPrompts } from '@shared/gamma-assistant-defaults';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { standardHandleStyle } from './StyledHandle';
import { NodeToolbar } from './NodeToolbar';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';

interface GammaNodeProps {
  id: string;
  data: GammaNodeData;
  isConnectable: boolean;
}

interface GammaTheme {
  id: string;
  name: string;
}

interface GammaFolder {
  id: string;
  name: string;
}

export function GammaNode({ id, data, isConnectable }: GammaNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  // Credentials
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    data.connectionStatus || 'idle'
  );
  const [connectionMessage, setConnectionMessage] = useState(data.connectionMessage || '');
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Generation Settings
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [includeConversation, setIncludeConversation] = useState(data.includeConversation ?? false);
  const [generationType, setGenerationType] = useState<'presentation' | 'document'>(data.generationType || 'presentation');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'pptx' | 'png'>(data.exportFormat || 'pdf');
  const [textMode, setTextMode] = useState<'generate' | 'condense' | 'preserve'>(data.textMode || 'generate');

  // Advanced Settings
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [themeId, setThemeId] = useState(data.themeId || '');
  const [folderId, setFolderId] = useState(data.folderId || '');
  const [cardCount, setCardCount] = useState(data.cardCount?.toString() || '');
  const [tone, setTone] = useState(data.tone || '');
  const [language, setLanguage] = useState(data.language || 'es');
  const [outputFileName, setOutputFileName] = useState(data.outputFileName || '');

  // Theme/Folder Loading
  const [themes, setThemes] = useState<GammaTheme[]>([]);
  const [folders, setFolders] = useState<GammaFolder[]>([]);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [folderError, setFolderError] = useState('');
  const hasLoadedThemesRef = useRef(false);
  const hasLoadedFoldersRef = useRef(false);
  const lastApiKeyRef = useRef(apiKey);

  // Message Settings
  const [ackMessage, setAckMessage] = useState(
    data.ackMessage ||
      '✅ ¡Perfecto! Ya tengo la información.\n⏳ Creando tu documento… tarda entre 1 a 3 minutitos no tardamos.'
  );

  // Gemini Assistant
  const [useGeminiAssistant, setUseGeminiAssistant] = useState(data.useGeminiAssistant ?? false);
  const [geminiApiKey, setGeminiApiKey] = useState(data.geminiApiKey || '');
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState(data.geminiModel || 'gemini-2.5-flash');
  const [systemPrompts, setSystemPrompts] = useState<GammaAssistantSystemPrompts>(() =>
    normalizeGammaAssistantSystemPrompts(data)
  );
  const [editingPromptType, setEditingPromptType] = useState<GammaAssistantDocumentType>('report');
  const [customLogoUrl, setCustomLogoUrl] = useState(data.customLogoUrl || '');
  const [appBaseUrl, setAppBaseUrl] = useState(data.appBaseUrl || '');
  const [assistantHistoryLimit, setAssistantHistoryLimit] = useState(data.assistantHistoryLimit ?? 10);

  // Logo settings (Gamma headerFooter API + optional logo prompt)
  const [logoPlacementMode, setLogoPlacementMode] = useState<GammaLogoPlacementMode>(
    data.logoPlacementMode || 'prompt'
  );
  const [logoHeaderPosition, setLogoHeaderPosition] = useState<GammaLogoHeaderPosition>(
    data.logoHeaderPosition || 'topLeft'
  );
  const [logoHeaderSize, setLogoHeaderSize] = useState<GammaLogoHeaderSize>(
    data.logoHeaderSize || 'md'
  );
  const [logoHideFromFirstCard, setLogoHideFromFirstCard] = useState(
    data.logoHideFromFirstCard ?? false
  );
  const [logoHideFromLastCard, setLogoHideFromLastCard] = useState(
    data.logoHideFromLastCard ?? false
  );
  const [logoPrompt, setLogoPrompt] = useState(
    data.logoPrompt ||
      `Company logo image URL: {{logoUrl}}
Place this exact logo image ONLY on the first card/page AND the last card/page.
Do NOT place the logo on any middle cards/pages.
Position: top-left corner on those cards.
Size: medium and clearly recognizable — approximately 15–18% of the card/page width.
Never a tiny icon; never so large that it dominates the content or covers more than about 20% of the card.
Maintain the original aspect ratio. Never crop, stretch, distort, modify, or recreate the logo.
Do not use the logo as a large centered cover/hero image.
Apply this consistently regardless of the original logo dimensions or document type.
Leave clear space in the top-left on the first and last cards so the logo does not overlap titles.`
  );
  const [isLogoSettingsOpen, setIsLogoSettingsOpen] = useState(false);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, flowId, customVariables, onDuplicateNode } = useFlowContext();

  // Capture window location origin as appBaseUrl during flow creation
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.origin && !appBaseUrl) {
      setAppBaseUrl(window.location.origin);
    }
  }, [appBaseUrl]);

  // Reset connection status when API key changes
  useEffect(() => {
    if (lastApiKeyRef.current !== apiKey) {
      lastApiKeyRef.current = apiKey;
      setConnectionStatus('idle');
      setConnectionMessage('');
      hasLoadedThemesRef.current = false;
      hasLoadedFoldersRef.current = false;
      setThemes([]);
      setFolders([]);
    }
  }, [apiKey]);

  const updateNodeData = useCallback(
    (updates: Partial<GammaNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...updates,
                },
              }
            : node
        )
      );
    },
    [id, setNodes]
  );

  useEffect(() => {
    updateNodeData({
      apiKey,
      prompt,
      includeConversation,
      generationType,
      exportFormat,
      textMode,
      themeId,
      folderId,
      cardCount: cardCount ? parseInt(cardCount, 10) : undefined,
      tone,
      language,
      outputFileName,
      ackMessage,
      connectionStatus,
      connectionMessage,
      // Gemini Assistant
      useGeminiAssistant,
      geminiApiKey,
      geminiModel,
      systemPrompts,
      customLogoUrl,
      appBaseUrl,
      assistantHistoryLimit,
      logoPlacementMode,
      logoHeaderPosition,
      logoHeaderSize,
      logoHideFromFirstCard,
      logoHideFromLastCard,
      logoPrompt,
    });
  }, [
    updateNodeData,
    apiKey,
    prompt,
    includeConversation,
    generationType,
    exportFormat,
    textMode,
    themeId,
    folderId,
    cardCount,
    tone,
    language,
    outputFileName,
    ackMessage,
    connectionStatus,
    connectionMessage,
    useGeminiAssistant,
    geminiApiKey,
    geminiModel,
    systemPrompts,
    customLogoUrl,
    appBaseUrl,
    assistantHistoryLimit,
    logoPlacementMode,
    logoHeaderPosition,
    logoHeaderSize,
    logoHideFromFirstCard,
    logoHideFromLastCard,
    logoPrompt,
  ]);

  const testConnection = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      setConnectionStatus('error');
      setConnectionMessage(
        t('flow_builder.gamma.api_key_required', 'API key is required')
      );
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('testing');
    setConnectionMessage(
      t('flow_builder.gamma.testing_connection', 'Testing connection…')
    );

    try {
      const response = await fetch('/api/gamma/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gammaApiKey: key }),
      });

      if (response.ok) {
        setConnectionStatus('success');
        setConnectionMessage(
          t('flow_builder.gamma.connection_success', 'Connection successful')
        );
      } else {
        const error = await response.text().catch(() => 'Connection failed');
        setConnectionStatus('error');
        setConnectionMessage(error || t('flow_builder.gamma.connection_failed', 'Invalid API key'));
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(
        t('flow_builder.gamma.connection_error', 'Network error')
      );
    } finally {
      setIsTestingConnection(false);
    }
  }, [apiKey, t]);

  const loadThemes = useCallback(async (force = false) => {
    const key = apiKey.trim();
    if (!key || (hasLoadedThemesRef.current && !force)) return;

    setIsLoadingThemes(true);
    setThemeError('');

    try {
      const response = await fetch('/api/gamma/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gammaApiKey: key, force }),
      });

      if (response.ok) {
        const data = await response.json();
        let fetchedThemes = data.themes || [];
        if (fetchedThemes && typeof fetchedThemes === 'object' && !Array.isArray(fetchedThemes)) {
          if (Array.isArray(fetchedThemes.data)) {
            fetchedThemes = fetchedThemes.data;
          }
        }
        setThemes(fetchedThemes);
        hasLoadedThemesRef.current = true;
      } else {
        setThemes([]);
        setThemeError(t('flow_builder.gamma.theme_load_error', 'Failed to load themes. Check API key.'));
      }
    } catch (error) {
      setThemes([]);
      setThemeError(t('flow_builder.gamma.theme_load_error', 'Failed to load themes. Check API key.'));
    } finally {
      setIsLoadingThemes(false);
    }
  }, [apiKey, t]);

  const loadFolders = useCallback(async (force = false) => {
    const key = apiKey.trim();
    if (!key || (hasLoadedFoldersRef.current && !force)) return;

    setIsLoadingFolders(true);
    setFolderError('');

    try {
      const response = await fetch('/api/gamma/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gammaApiKey: key, force }),
      });

      if (response.ok) {
        const data = await response.json();
        let fetchedFolders = data.folders || [];
        if (fetchedFolders && typeof fetchedFolders === 'object' && !Array.isArray(fetchedFolders)) {
          if (Array.isArray(fetchedFolders.data)) {
            fetchedFolders = fetchedFolders.data;
          }
        }
        setFolders(fetchedFolders);
        hasLoadedFoldersRef.current = true;
      } else {
        setFolders([]);
        setFolderError(t('flow_builder.gamma.folder_load_error', 'Failed to load folders. Check API key.'));
      }
    } catch (error) {
      setFolders([]);
      setFolderError(t('flow_builder.gamma.folder_load_error', 'Failed to load folders. Check API key.'));
    } finally {
      setIsLoadingFolders(false);
    }
  }, [apiKey, t]);

  const handleAdvancedOpenChange = useCallback((open: boolean) => {
    setIsAdvancedOpen(open);
    if (open && apiKey.trim()) {
      loadThemes();
      loadFolders();
    }
  }, [apiKey, loadThemes, loadFolders]);

  if (!isEditing) {
    return (
      <div className="node-gamma p-3 rounded-lg bg-card border border-border shadow-sm relative group max-w-[350px]">
        <NodeToolbar
          id={id}
          onDuplicate={onDuplicateNode}
          onDelete={onDeleteNode}
        />
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          style={standardHandleStyle}
        />
        <div className="font-medium flex items-center gap-2 mb-2">
          <img 
            src={GAMMA_FLOW_NODE_ICON_SRC} 
            alt="Gamma" 
            className="h-4 w-4"
          />
          <span>{t('flow_builder.node_types.gamma', 'Gamma')}</span>
          <button data-tour="components-flow-builder-gammanode.button.common.edit"
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setIsEditing(true)}
          >
            {t('common.edit', 'Edit')}
          </button>
        </div>
        <div className="text-sm text-muted-foreground">
          {prompt ? (
            <div className="line-clamp-2">{prompt}</div>
          ) : (
            <div className="italic">{t('flow_builder.gamma.no_prompt', 'No prompt configured')}</div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          style={standardHandleStyle}
        />
      </div>
    );
  }

  const themesArray = Array.isArray(themes) ? themes : [];
  const systemThemes = themesArray.filter((t: any) => !(t.isCustom || t.is_custom || t.custom || t.type === 'custom'));
  const customThemes = themesArray.filter((t: any) => !!(t.isCustom || t.is_custom || t.custom || t.type === 'custom'));
  const foldersArray = Array.isArray(folders) ? folders : [];

  return (
    <div className="node-gamma p-4 rounded-lg bg-card border border-border shadow-lg relative group min-w-[450px] w-[550px] max-w-[600px]">
      <NodeToolbar
        id={id}
        onDuplicate={onDuplicateNode}
        onDelete={onDeleteNode}
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />

      <div className="font-medium flex items-center gap-2 mb-4">
        <img 
          src={GAMMA_FLOW_NODE_ICON_SRC} 
          alt="Gamma" 
          className="h-5 w-5"
        />
        <span>{t('flow_builder.node_types.gamma', 'Gamma')}</span>
        <button data-tour="components-flow-builder-gammanode.button.common.done"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(false)}
        >
          {t('common.done', 'Done')}
        </button>
      </div>

      <div className="space-y-4">
        {/* Credentials Section */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t('flow_builder.gamma.credentials', 'Credentials')}
          </Label>
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="gamma-api-key" className="text-xs">
                  {t('flow_builder.gamma.api_key', 'API Key')}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
              <Input data-tour="components-flow-builder-gammanode.input.gamma-api-key"
                id="gamma-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-gamma-..."
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {t('flow_builder.gamma.api_key_help', 'Get your API key from gamma.app/settings/api (Pro+ required)')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button data-tour="components-flow-builder-gammanode.button.flow_builder.gamma.testing"
                type="button"
                size="sm"
                onClick={testConnection}
                disabled={isTestingConnection || !apiKey.trim()}
                className="h-8"
              >
                {isTestingConnection
                  ? t('flow_builder.gamma.testing', 'Testing…')
                  : t('flow_builder.gamma.test_connection', 'Test Connection')}
              </Button>
              {connectionStatus === 'success' && (
                <div className="flex items-center gap-1 text-green-600 text-xs">
                  <CheckCircle className="h-3 w-3" />
                  <span>{connectionMessage}</span>
                </div>
              )}
              {connectionStatus === 'error' && (
                <div className="flex items-center gap-1 text-red-600 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  <span>{connectionMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Generation Settings Section */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t('flow_builder.gamma.generation_settings', 'Generation Settings')}
          </Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/50">
              <div className="space-y-0.5">
                <Label htmlFor="gamma-use-gemini" className="text-xs font-semibold cursor-pointer">
                  {t('flow_builder.gamma.use_gemini_assistant', 'Use Gemini Intelligent Assistant')}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {t('flow_builder.gamma.use_gemini_assistant_desc', 'Interacts with the user, processes documents, and generates optimized prompts.')}
                </p>
              </div>
              <Switch
                id="gamma-use-gemini"
                checked={useGeminiAssistant}
                onCheckedChange={setUseGeminiAssistant}
              />
            </div>

            {useGeminiAssistant ? (
              <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="gamma-gemini-key" className="text-xs font-semibold">
                      {t('flow_builder.gamma.gemini_key', 'Gemini API Key')}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setShowGeminiApiKey(!showGeminiApiKey)}
                    >
                      {showGeminiApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                  <Input data-tour="components-flow-builder-gammanode.input.gamma-gemini-key"
                    id="gamma-gemini-key"
                    type={showGeminiApiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="font-mono text-xs bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="gamma-gemini-model" className="text-xs font-semibold">
                    {t('flow_builder.gamma.gemini_model', 'Gemini Model')}
                  </Label>
                  <Select value={geminiModel} onValueChange={setGeminiModel}>
                    <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-gemini-model" id="gamma-gemini-model" className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-3.1-pro-preview">Gemini 3.1 Pro (recommended)</SelectItem>
                      <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                      <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                      <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</SelectItem>
                      <SelectItem value="gemini-3.5-flash">Gemini 3.5 Flash (thinking)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="gamma-gemini-history-limit" className="text-xs font-semibold">
                    {t('flow_builder.gamma.gemini_history_limit', 'Conversation History Limit (turns)')}
                  </Label>
                  <Input data-tour="components-flow-builder-gammanode.input.gamma-gemini-history-limit"
                    id="gamma-gemini-history-limit"
                    type="number"
                    value={assistantHistoryLimit}
                    onChange={(e) => setAssistantHistoryLimit(parseInt(e.target.value, 10) || 10)}
                    placeholder="10"
                    className="h-8 text-xs bg-background"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Number of conversation turns (user + assistant) to retain in context.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    {t('flow_builder.gamma.gemini_system_prompts', 'System Prompts by Document Type')}
                  </Label>
                  <Select
                    value={editingPromptType}
                    onValueChange={(v) => setEditingPromptType(v as GammaAssistantDocumentType)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="presentation">
                        {t('flow_builder.gamma.prompt_type_presentation', 'Presentation')}
                      </SelectItem>
                      <SelectItem value="report">
                        {t('flow_builder.gamma.prompt_type_report', 'Report')}
                      </SelectItem>
                      <SelectItem value="quote">
                        {t('flow_builder.gamma.prompt_type_quote', 'Quote')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea data-tour="components-flow-builder-gammanode.textarea.gamma-gemini-system"
                    id="gamma-gemini-system"
                    value={systemPrompts[editingPromptType]}
                    onChange={(e) =>
                      setSystemPrompts((prev) => ({
                        ...prev,
                        [editingPromptType]: e.target.value,
                      }))
                    }
                    placeholder="Enter instructions for this document type..."
                    className="min-h-[140px] text-xs font-sans bg-background"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    {t(
                      'flow_builder.gamma.gemini_system_prompts_help',
                      'Each type has a full editable prompt. The assistant soft-locks the type from the user’s Presentación / Reporte / Cotización choice. Technical rules (logo JSON, WhatsApp formatting) are still appended at runtime.'
                    )}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="gamma-custom-logo" className="text-xs font-semibold">
                    {t('flow_builder.gamma.custom_logo_url', 'Custom Logo URL')}
                  </Label>
                  <Input data-tour="components-flow-builder-gammanode.input.gamma-custom-logo"
                    id="gamma-custom-logo"
                    value={customLogoUrl}
                    onChange={(e) => setCustomLogoUrl(e.target.value)}
                    placeholder="https://yourdomain.com/logo.png"
                    className="h-8 text-xs bg-background"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Fallback logo URL when the contact does not upload one. Placement is controlled in Logo Settings.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="gamma-prompt" className="text-xs">
                  {t('flow_builder.gamma.prompt', 'Prompt')}
                </Label>
                <EnhancedVariablePicker
                  flowId={flowId ?? undefined}
                  customVariables={customVariables}
                  value={prompt}
                  onChange={setPrompt}
                  placeholder={t('flow_builder.gamma.prompt_placeholder', 'Generate a presentation about...')}
                  className="min-h-[80px]"
                  multiline
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="gamma-include-conversation"
                checked={includeConversation}
                onCheckedChange={setIncludeConversation}
              />
              <Label htmlFor="gamma-include-conversation" className="text-xs cursor-pointer">
                {t('flow_builder.gamma.include_conversation', 'Include recent conversation (last 10 messages)')}
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="gamma-format" className="text-xs">
                  {t('flow_builder.gamma.format', 'Format')}
                </Label>
                <Select value={generationType} onValueChange={(v) => setGenerationType(v as 'presentation' | 'document')}>
                  <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-format" id="gamma-format" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presentation">
                      {t('flow_builder.gamma.format_presentation', 'Presentation')}
                    </SelectItem>
                    <SelectItem value="document">
                      {t('flow_builder.gamma.format_document', 'Document')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="gamma-export-as" className="text-xs">
                  {t('flow_builder.gamma.export_as', 'Export As')}
                </Label>
                <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as 'pdf' | 'pptx' | 'png')}>
                  <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-export-as" id="gamma-export-as" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="pptx">PPTX</SelectItem>
                    <SelectItem value="png">PNG (per card)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="gamma-text-mode" className="text-xs">
                  {t('flow_builder.gamma.text_mode', 'Text Mode')}
                </Label>
                <Select value={textMode} onValueChange={(v) => setTextMode(v as 'generate' | 'condense' | 'preserve')}>
                  <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-text-mode" id="gamma-text-mode" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generate">
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-full h-full block">
                              {t('flow_builder.gamma.text_mode_generate', 'Generate (from prompt)')}
                            </span>
                          </TooltipTrigger>
                          <TooltipPortal>
                            <TooltipContent side="right" className="max-w-[280px] z-[10000]">
                              {t('flow_builder.gamma.text_mode_generate_desc', 'Creates a new presentation or document from scratch based on your freeform instructions and variables.')}
                            </TooltipContent>
                          </TooltipPortal>
                        </Tooltip>
                      </TooltipProvider>
                    </SelectItem>

                    <SelectItem value="condense">
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-full h-full block">
                              {t('flow_builder.gamma.text_mode_condense', 'Condense (summarize text)')}
                            </span>
                          </TooltipTrigger>
                          <TooltipPortal>
                            <TooltipContent side="right" className="max-w-[280px] z-[10000]">
                              {t('flow_builder.gamma.text_mode_condense_desc', 'Condenses and summarizes long input text into a concise, structured presentation or document.')}
                            </TooltipContent>
                          </TooltipPortal>
                        </Tooltip>
                      </TooltipProvider>
                    </SelectItem>

                    <SelectItem value="preserve">
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-full h-full block">
                              {t('flow_builder.gamma.text_mode_preserve', 'Preserve (use raw text)')}
                            </span>
                          </TooltipTrigger>
                          <TooltipPortal>
                            <TooltipContent side="right" className="max-w-[280px] z-[10000]">
                              {t('flow_builder.gamma.text_mode_preserve_desc', 'Directly preserves and maps your input text to slides or sections without editing or restructuring it.')}
                            </TooltipContent>
                          </TooltipPortal>
                        </Tooltip>
                      </TooltipProvider>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Logo Settings Section */}
        <Collapsible open={isLogoSettingsOpen} onOpenChange={setIsLogoSettingsOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold w-full hover:underline">
            <ChevronDown className={`h-4 w-4 transition-transform ${isLogoSettingsOpen ? 'rotate-180' : ''}`} />
            {t('flow_builder.gamma.logo_settings', 'Logo Settings')}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              {t(
                'flow_builder.gamma.logo_settings_help',
                'Control how uploaded/configured logos are placed. Header mode uses the Gamma API (all cards, with optional hide first/last). Prompt mode is for cases the API cannot express (e.g. first + last only).'
              )}
            </p>

            <div className="space-y-1">
              <Label htmlFor="gamma-logo-mode" className="text-xs">
                {t('flow_builder.gamma.logo_placement_mode', 'Placement Mode')}
              </Label>
              <Select
                value={logoPlacementMode}
                onValueChange={(v) => setLogoPlacementMode(v as GammaLogoPlacementMode)}
              >
                <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-logo-mode" id="gamma-logo-mode" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prompt">
                    {t('flow_builder.gamma.logo_mode_prompt', 'Prompt only (flexible, e.g. first + last)')}
                  </SelectItem>
                  <SelectItem value="header">
                    {t('flow_builder.gamma.logo_mode_header', 'Header API (all cards)')}
                  </SelectItem>
                  <SelectItem value="both">
                    {t('flow_builder.gamma.logo_mode_both', 'Header API + Logo Prompt')}
                  </SelectItem>
                  <SelectItem value="none">
                    {t('flow_builder.gamma.logo_mode_none', 'Disabled')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(logoPlacementMode === 'header' || logoPlacementMode === 'both') && (
              <div className="space-y-2 p-2 rounded border border-border/50 bg-muted/20">
                <Label className="text-xs font-semibold">
                  {t('flow_builder.gamma.logo_header_api', 'Header / Footer API')}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="gamma-logo-position" className="text-xs">
                      {t('flow_builder.gamma.logo_position', 'Position')}
                    </Label>
                    <Select
                      value={logoHeaderPosition}
                      onValueChange={(v) => setLogoHeaderPosition(v as GammaLogoHeaderPosition)}
                    >
                      <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-logo-position" id="gamma-logo-position" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="topLeft">Top Left</SelectItem>
                        <SelectItem value="topCenter">Top Center</SelectItem>
                        <SelectItem value="topRight">Top Right</SelectItem>
                        <SelectItem value="bottomLeft">Bottom Left</SelectItem>
                        <SelectItem value="bottomCenter">Bottom Center</SelectItem>
                        <SelectItem value="bottomRight">Bottom Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gamma-logo-size" className="text-xs">
                      {t('flow_builder.gamma.logo_size', 'Size')}
                    </Label>
                    <Select
                      value={logoHeaderSize}
                      onValueChange={(v) => setLogoHeaderSize(v as GammaLogoHeaderSize)}
                    >
                      <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.gamma-logo-size" id="gamma-logo-size" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sm">sm (small)</SelectItem>
                        <SelectItem value="md">md (medium)</SelectItem>
                        <SelectItem value="lg">lg (large)</SelectItem>
                        <SelectItem value="xl">xl (extra large)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="gamma-logo-hide-first"
                    checked={logoHideFromFirstCard}
                    onCheckedChange={setLogoHideFromFirstCard}
                  />
                  <Label htmlFor="gamma-logo-hide-first" className="text-xs cursor-pointer">
                    {t('flow_builder.gamma.logo_hide_first', 'Hide from first card')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="gamma-logo-hide-last"
                    checked={logoHideFromLastCard}
                    onCheckedChange={setLogoHideFromLastCard}
                  />
                  <Label htmlFor="gamma-logo-hide-last" className="text-xs cursor-pointer">
                    {t('flow_builder.gamma.logo_hide_last', 'Hide from last card')}
                  </Label>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  {t(
                    'flow_builder.gamma.logo_header_api_note',
                    'Note: Gamma’s API can hide the header logo from the first/last card, but cannot show it only on first + last.'
                  )}
                </p>
              </div>
            )}

            {(logoPlacementMode === 'prompt' || logoPlacementMode === 'both') && (
              <div className="space-y-1">
                <Label htmlFor="gamma-logo-prompt" className="text-xs font-semibold">
                  {t('flow_builder.gamma.logo_prompt', 'Logo Prompt')}
                </Label>
                <Textarea data-tour="components-flow-builder-gammanode.textarea.gamma-logo-prompt"
                  id="gamma-logo-prompt"
                  value={logoPrompt}
                  onChange={(e) => setLogoPrompt(e.target.value)}
                  placeholder="Instructions for Gamma about the logo… Use {{logoUrl}} for the logo URL."
                  className="min-h-[120px] text-xs font-sans bg-background"
                />
                <p className="text-[9px] text-muted-foreground">
                  {t(
                    'flow_builder.gamma.logo_prompt_help',
                    'Sent as additionalInstructions to Gamma. Use {{logoUrl}} where the public logo URL should be inserted. Useful for first+last-only placement and size guidance the header API cannot express.'
                  )}
                </p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Advanced Settings Section */}
        <Collapsible open={isAdvancedOpen} onOpenChange={handleAdvancedOpenChange}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold w-full hover:underline">
            <ChevronDown className={`h-4 w-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
            {t('flow_builder.gamma.advanced_settings', 'Advanced Settings')}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gamma-theme" className="text-xs">
                    {t('flow_builder.gamma.theme', 'Theme')}
                  </Label>
                  {apiKey.trim() && (
                    <button data-tour="components-flow-builder-gammanode.button.flow_builder.gamma.refresh_themes"
                      type="button"
                      onClick={() => loadThemes(true)}
                      disabled={isLoadingThemes}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors animate-none"
                      title={t('flow_builder.gamma.refresh_themes', 'Refresh themes')}
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingThemes ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
                {isLoadingThemes ? (
                  <div className="text-xs text-muted-foreground py-1">
                    {t('flow_builder.gamma.loading_themes', 'Loading themes…')}
                  </div>
                ) : themeError ? (
                  <div className="text-xs text-red-600 py-1">{themeError}</div>
                ) : (
                  <Select value={themeId || "default"} onValueChange={(v) => setThemeId(v === "default" ? "" : v)}>
                    <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.flow_builder.gamma.select_theme" id="gamma-theme" className="h-8 text-xs">
                      <SelectValue placeholder={t('flow_builder.gamma.select_theme', 'Select theme...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {t('flow_builder.gamma.default_theme', 'Default')}
                      </SelectItem>
                      {customThemes.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {t('flow_builder.gamma.custom_themes', 'My Custom Themes')}
                          </SelectLabel>
                          {customThemes.map((theme) => (
                            <SelectItem key={theme.id} value={theme.id}>
                              {theme.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {systemThemes.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {t('flow_builder.gamma.system_themes', 'System Themes')}
                          </SelectLabel>
                          {systemThemes.map((theme) => (
                            <SelectItem key={theme.id} value={theme.id}>
                              {theme.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {customThemes.length === 0 && systemThemes.length === 0 && themesArray.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          {theme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gamma-folder" className="text-xs">
                    {t('flow_builder.gamma.folder', 'Folder')}
                  </Label>
                  {apiKey.trim() && (
                    <button data-tour="components-flow-builder-gammanode.button.flow_builder.gamma.refresh_folders"
                      type="button"
                      onClick={() => loadFolders(true)}
                      disabled={isLoadingFolders}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors animate-none"
                      title={t('flow_builder.gamma.refresh_folders', 'Refresh folders')}
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingFolders ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
                {isLoadingFolders ? (
                  <div className="text-xs text-muted-foreground py-1">
                    {t('flow_builder.gamma.loading_folders', 'Loading folders…')}
                  </div>
                ) : folderError ? (
                  <div className="text-xs text-red-600 py-1">{folderError}</div>
                ) : (
                  <Select value={folderId || "none"} onValueChange={(v) => setFolderId(v === "none" ? "" : v)}>
                    <SelectTrigger data-tour="components-flow-builder-gammanode.selecttrigger.flow_builder.gamma.select_folder" id="gamma-folder" className="h-8 text-xs">
                      <SelectValue placeholder={t('flow_builder.gamma.select_folder', 'Select folder...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t('flow_builder.gamma.no_folder', 'None')}
                      </SelectItem>
                      {foldersArray.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="gamma-num-cards" className="text-xs">
                  {t('flow_builder.gamma.num_cards', 'Number of Cards')}
                </Label>
                <Input data-tour="components-flow-builder-gammanode.input.flow_builder.gamma.num_cards_placeholder"
                  id="gamma-num-cards"
                  type="number"
                  value={cardCount}
                  onChange={(e) => setCardCount(e.target.value)}
                  placeholder={t('flow_builder.gamma.num_cards_placeholder', 'Auto')}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gamma-tone" className="text-xs">
                  {t('flow_builder.gamma.tone', 'Tone')}
                </Label>
                <Input data-tour="components-flow-builder-gammanode.input.flow_builder.gamma.tone_placeholder"
                  id="gamma-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder={t('flow_builder.gamma.tone_placeholder', 'Professional, casual...')}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="gamma-language" className="text-xs">
                  {t('flow_builder.gamma.language', 'Language')}
                </Label>
                <Input data-tour="components-flow-builder-gammanode.input.flow_builder.gamma.language_placeholder"
                  id="gamma-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder={t('flow_builder.gamma.language_placeholder', 'es')}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gamma-output-filename" className="text-xs">
                  {t('flow_builder.gamma.output_filename', 'Output Filename')}
                </Label>
                <Input data-tour="components-flow-builder-gammanode.input.gamma-output-filename"
                  id="gamma-output-filename"
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  placeholder="Random Spanish name (auto)"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Message Settings Section */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {t('flow_builder.gamma.message_settings', 'Message Settings')}
          </Label>
          <div className="space-y-1">
            <Label htmlFor="gamma-ack-message" className="text-xs">
              {t('flow_builder.gamma.ack_message', 'Acknowledgment Message')}
            </Label>
            <EnhancedVariablePicker
              flowId={flowId ?? undefined}
              customVariables={customVariables}
              value={ackMessage}
              onChange={setAckMessage}
              placeholder="✅ ¡Perfecto! Ya tengo la información.\n⏳ Creando tu documento…"
            />
            <p className="text-[10px] text-muted-foreground">
              {t('flow_builder.gamma.ack_message_help', 'Sent to contact while generation is in progress (1-3 minutes typical)')}
            </p>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />
    </div>
  );
}