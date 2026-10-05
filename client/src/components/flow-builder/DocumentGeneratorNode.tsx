import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import {
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { DOCUMENT_GENERATOR_FLOW_NODE_ICON_SRC } from '@/pages/flow-builder-node-catalog';
import type {
  DocumentGeneratorNodeData,
  DocumentGeneratorQuoteDesignMode,
  DocumentGeneratorResolvedType,
  DocumentGeneratorSystemPrompts,
} from '@shared/types/node-types';
import {
  DOCUMENT_GENERATOR_DOCUMENT_TYPES,
  DOCUMENT_GENERATOR_RESOLVED_TYPES,
  DOCUMENT_GENERATOR_DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_GENERATOR_DEFAULT_LANGUAGE,
  DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE,
  DOCUMENT_GENERATOR_DEFAULT_SYSTEM_PROMPTS,
  DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL,
  DOCUMENT_GENERATOR_DEFAULT_GEMINI_IMAGE_MODEL,
  DOCUMENT_GENERATOR_DEFAULT_QUOTE_DESIGN_MODE,
  DOCUMENT_GENERATOR_GEMINI_MODELS,
  DOCUMENT_GENERATOR_GEMINI_IMAGE_MODELS,
  DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS,
  DOCUMENT_GENERATOR_OUTPUT_FORMATS,
  DOCUMENT_GENERATOR_SLIDES_THEMES,
  DOCUMENT_GENERATOR_VERTEX_TEXT_MODELS,
  normalizeDocumentGeneratorSystemPrompts,
  normalizeDocumentGeneratorGeminiModel,
  normalizeDocumentGeneratorGeminiImageModel,
  normalizeDocumentGeneratorQuoteDesignMode,
  normalizeDocumentGeneratorOutputFormat,
  normalizeDocumentGeneratorSlidesThemeId,
  normalizeDocumentGeneratorVertexTextModel,
  usesDocumentGeneratorQuoteGeminiPath,
} from '@shared/document-generator-defaults';
import {
  DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION,
  DOCUMENT_GENERATOR_DEFAULT_VERTEX_IMAGEN_MODEL,
} from '@shared/document-generator-gcp';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';

interface DocumentGeneratorNodeProps {
  id: string;
  data: DocumentGeneratorNodeData;
  isConnectable: boolean;
}

const TONE_OPTIONS = ['default', 'professional', 'sales_pitch', 'educational', 'casual'] as const;
const IMAGE_TYPES = ['stock', 'ai-generated'] as const;
const LOGO_SOURCES = ['inbound', 'url', 'none', 'ask'] as const;

function normalizeInitialSystemPrompts(
  data: DocumentGeneratorNodeData
): DocumentGeneratorSystemPrompts {
  return normalizeDocumentGeneratorSystemPrompts({
    documentType: data.documentType,
    systemPrompts: data.systemPrompts,
    instructions: data.instructions,
  });
}

function areDocumentGeneratorSystemPromptsEqual(
  a: DocumentGeneratorSystemPrompts,
  b: DocumentGeneratorSystemPrompts
): boolean {
  return DOCUMENT_GENERATOR_RESOLVED_TYPES.every((type) => a[type] === b[type]);
}

function getCustomizedPromptTypes(
  prompts: DocumentGeneratorSystemPrompts
): DocumentGeneratorResolvedType[] {
  return DOCUMENT_GENERATOR_RESOLVED_TYPES.filter(
    (type) => prompts[type] !== DOCUMENT_GENERATOR_DEFAULT_SYSTEM_PROMPTS[type]
  );
}

function deriveLegacySlideCount(
  documentType: DocumentGeneratorNodeData['documentType']
): number {
  if (documentType && documentType !== 'auto') {
    return DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS[documentType];
  }
  return DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.presentation;
}

export function DocumentGeneratorNode({ id, data, isConnectable }: DocumentGeneratorNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  const [gcpProjectId, setGcpProjectId] = useState(data.gcpProjectId || '');
  const [gcpLocation, setGcpLocation] = useState(
    data.gcpLocation?.trim() || DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION
  );
  const [gcpServiceAccountJson, setGcpServiceAccountJson] = useState(
    data.gcpServiceAccountJson || ''
  );
  const [outputFormat, setOutputFormat] = useState(
    normalizeDocumentGeneratorOutputFormat(data.outputFormat)
  );
  const [slidesThemeId, setSlidesThemeId] = useState(
    normalizeDocumentGeneratorSlidesThemeId(data.slidesThemeId)
  );
  const [slidesFolderId, setSlidesFolderId] = useState(data.slidesFolderId || '');
  const [vertexTextModel, setVertexTextModel] = useState(
    normalizeDocumentGeneratorVertexTextModel(data.vertexTextModel)
  );
  const [vertexImagenModel, setVertexImagenModel] = useState(
    data.vertexImagenModel?.trim() || DOCUMENT_GENERATOR_DEFAULT_VERTEX_IMAGEN_MODEL
  );
  const [documentType, setDocumentType] = useState<DocumentGeneratorNodeData['documentType']>(
    data.documentType ?? DOCUMENT_GENERATOR_DEFAULT_DOCUMENT_TYPE
  );
  const [tone, setTone] = useState(data.tone || 'professional');
  const [verbosity, setVerbosity] = useState(data.verbosity || '');
  const [language, setLanguage] = useState(data.language ?? DOCUMENT_GENERATOR_DEFAULT_LANGUAGE);
  const [systemPrompts, setSystemPrompts] = useState<DocumentGeneratorSystemPrompts>(() =>
    normalizeInitialSystemPrompts(data)
  );
  const [promptEditorType, setPromptEditorType] =
    useState<DocumentGeneratorResolvedType>('presentation');
  const [contentTemplate, setContentTemplate] = useState(
    data.contentTemplate ?? DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE
  );
  const [useInboundAttachment, setUseInboundAttachment] = useState(
    data.useInboundAttachment ?? false
  );
  const [interactiveWizard, setInteractiveWizard] = useState(data.interactiveWizard ?? false);
  const [quoteDesignMode, setQuoteDesignMode] = useState<DocumentGeneratorQuoteDesignMode>(
    normalizeDocumentGeneratorQuoteDesignMode(data.quoteDesignMode)
  );
  const [geminiApiKey, setGeminiApiKey] = useState(data.geminiApiKey || '');
  const [geminiModel, setGeminiModel] = useState(
    normalizeDocumentGeneratorGeminiModel(data.geminiModel)
  );
  const [geminiImageModel, setGeminiImageModel] = useState(
    normalizeDocumentGeneratorGeminiImageModel(data.geminiImageModel)
  );
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle'
  );
  const [geminiTestMessage, setGeminiTestMessage] = useState('');
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [includeTableOfContents, setIncludeTableOfContents] = useState(
    data.includeTableOfContents ?? false
  );
  const [logoSource, setLogoSource] = useState<DocumentGeneratorNodeData['logoSource']>(
    data.logoSource || 'none'
  );
  const [logoUrl, setLogoUrl] = useState(data.logoUrl || '');
  const [imageType, setImageType] = useState<DocumentGeneratorNodeData['imageType']>(
    data.imageType || 'ai-generated'
  );
  const [ackMessage, setAckMessage] = useState(
    data.ackMessage || t('flow_builder.document_generator.generating_default', 'Generating your document…')
  );
  const [outputFileName, setOutputFileName] = useState(data.outputFileName || '');
  const [gcpConnectionStatus, setGcpConnectionStatus] = useState<
    DocumentGeneratorNodeData['gcpConnectionStatus']
  >(data.gcpConnectionStatus || 'idle');
  const [gcpConnectionMessage, setGcpConnectionMessage] = useState(
    data.gcpConnectionMessage || ''
  );
  const [isTestingGcp, setIsTestingGcp] = useState(false);

  const gcpProjectIdRef = useRef(gcpProjectId);
  const gcpLocationRef = useRef(gcpLocation);
  const gcpServiceAccountJsonRef = useRef(gcpServiceAccountJson);
  const gcpTestIdRef = useRef(0);
  const gcpTestAbortRef = useRef<AbortController | null>(null);

  gcpProjectIdRef.current = gcpProjectId;
  gcpLocationRef.current = gcpLocation;
  gcpServiceAccountJsonRef.current = gcpServiceAccountJson;

  const { setNodes } = useReactFlow();
  const { onDeleteNode, flowId, customVariables } = useFlowContext();

  useEffect(() => {
    if (data.gcpProjectId !== undefined) setGcpProjectId(data.gcpProjectId);
    if (data.gcpLocation !== undefined) {
      setGcpLocation(data.gcpLocation.trim() || DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION);
    }
    if (data.gcpServiceAccountJson !== undefined) {
      setGcpServiceAccountJson(data.gcpServiceAccountJson);
    }
    if (data.outputFormat !== undefined) {
      setOutputFormat(normalizeDocumentGeneratorOutputFormat(data.outputFormat));
    }
    if (data.slidesThemeId !== undefined) {
      setSlidesThemeId(normalizeDocumentGeneratorSlidesThemeId(data.slidesThemeId));
    }
    if (data.slidesFolderId !== undefined) setSlidesFolderId(data.slidesFolderId);
    if (data.vertexTextModel !== undefined) {
      setVertexTextModel(normalizeDocumentGeneratorVertexTextModel(data.vertexTextModel));
    }
    if (data.vertexImagenModel !== undefined) {
      setVertexImagenModel(
        data.vertexImagenModel.trim() || DOCUMENT_GENERATOR_DEFAULT_VERTEX_IMAGEN_MODEL
      );
    }
    if (data.documentType !== undefined) setDocumentType(data.documentType);
    if (data.tone !== undefined) setTone(data.tone);
    if (data.verbosity !== undefined) setVerbosity(data.verbosity);
    if (data.language !== undefined) setLanguage(data.language);
    const syncSystemPromptsFromData = () => {
      const next = normalizeInitialSystemPrompts(data);
      setSystemPrompts((prev) =>
        areDocumentGeneratorSystemPromptsEqual(prev, next) ? prev : next
      );
    };
    if (data.systemPrompts !== undefined || data.instructions !== undefined) {
      syncSystemPromptsFromData();
    } else if (data.documentType !== undefined) {
      syncSystemPromptsFromData();
    }
    if (data.contentTemplate !== undefined) setContentTemplate(data.contentTemplate);
    if (data.useInboundAttachment !== undefined) setUseInboundAttachment(data.useInboundAttachment);
    if (data.interactiveWizard !== undefined) setInteractiveWizard(data.interactiveWizard);
    if (data.quoteDesignMode !== undefined) {
      setQuoteDesignMode(normalizeDocumentGeneratorQuoteDesignMode(data.quoteDesignMode));
    }
    if (data.geminiApiKey !== undefined) setGeminiApiKey(data.geminiApiKey);
    if (data.geminiModel !== undefined) {
      setGeminiModel(normalizeDocumentGeneratorGeminiModel(data.geminiModel));
    }
    if (data.geminiImageModel !== undefined) {
      setGeminiImageModel(normalizeDocumentGeneratorGeminiImageModel(data.geminiImageModel));
    }
    if (data.includeTableOfContents !== undefined) setIncludeTableOfContents(data.includeTableOfContents);
    if (data.logoSource !== undefined) setLogoSource(data.logoSource);
    if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
    if (data.imageType !== undefined) setImageType(data.imageType);
    if (data.ackMessage !== undefined) setAckMessage(data.ackMessage);
    if (data.outputFileName !== undefined) setOutputFileName(data.outputFileName);
    if (data.gcpConnectionStatus !== undefined) setGcpConnectionStatus(data.gcpConnectionStatus);
    if (data.gcpConnectionMessage !== undefined) setGcpConnectionMessage(data.gcpConnectionMessage);
  }, [data]);

  const gcpCredentialsMatchTested = useCallback(
    (projectId: string, location: string, serviceAccountJson: string) => {
      return (
        gcpProjectIdRef.current.trim() === projectId &&
        (gcpLocationRef.current.trim() || DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION) === location &&
        gcpServiceAccountJsonRef.current === serviceAccountJson
      );
    },
    []
  );

  const resetGcpConnectionOnCredentialChange = useCallback(() => {
    gcpTestAbortRef.current?.abort();
    gcpTestAbortRef.current = null;
    gcpTestIdRef.current += 1;
    setIsTestingGcp(false);
    setGcpConnectionStatus((status) =>
      status === 'success' || status === 'error' || status === 'testing' ? 'idle' : status
    );
    setGcpConnectionMessage('');
  }, []);

  useEffect(() => {
    return () => {
      gcpTestAbortRef.current?.abort();
    };
  }, []);

  const updateNodeData = useCallback(
    (updates: Partial<DocumentGeneratorNodeData>) => {
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

  const legacySlideCount = useMemo(
    () => deriveLegacySlideCount(documentType),
    [documentType]
  );

  useEffect(() => {
    updateNodeData({
      gcpProjectId,
      gcpLocation,
      gcpServiceAccountJson,
      outputFormat,
      slidesThemeId,
      slidesFolderId,
      vertexTextModel,
      vertexImagenModel,
      documentType,
      slideCount: legacySlideCount,
      tone,
      verbosity,
      language,
      systemPrompts,
      contentTemplate,
      useInboundAttachment,
      interactiveWizard,
      quoteDesignMode,
      geminiApiKey,
      geminiModel,
      geminiImageModel,
      includeTableOfContents,
      logoSource,
      logoUrl,
      imageType,
      ackMessage,
      outputFileName,
      gcpConnectionStatus,
      gcpConnectionMessage,
    });
  }, [
    updateNodeData,
    gcpProjectId,
    gcpLocation,
    gcpServiceAccountJson,
    outputFormat,
    slidesThemeId,
    slidesFolderId,
    vertexTextModel,
    vertexImagenModel,
    documentType,
    legacySlideCount,
    tone,
    verbosity,
    language,
    systemPrompts,
    contentTemplate,
    useInboundAttachment,
    interactiveWizard,
    quoteDesignMode,
    geminiApiKey,
    geminiModel,
    geminiImageModel,
    includeTableOfContents,
    logoSource,
    logoUrl,
    imageType,
    ackMessage,
    outputFileName,
    gcpConnectionStatus,
    gcpConnectionMessage,
  ]);

  const testGcpConnection = useCallback(async () => {
    const projectId = gcpProjectId.trim();
    const location = gcpLocation.trim() || DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION;
    const serviceAccountJson = gcpServiceAccountJson;

    if (!projectId) {
      setGcpConnectionStatus('error');
      setGcpConnectionMessage(
        t('flow_builder.document_generator.gcp_project_id_required', 'GCP project ID is required')
      );
      return;
    }
    if (!serviceAccountJson.trim()) {
      setGcpConnectionStatus('error');
      setGcpConnectionMessage(
        t(
          'flow_builder.document_generator.gcp_service_account_required',
          'Service account JSON is required'
        )
      );
      return;
    }

    gcpTestAbortRef.current?.abort();
    const abortController = new AbortController();
    gcpTestAbortRef.current = abortController;
    const testId = ++gcpTestIdRef.current;

    const isStaleResult = () =>
      testId !== gcpTestIdRef.current ||
      !gcpCredentialsMatchTested(projectId, location, serviceAccountJson);

    setIsTestingGcp(true);
    setGcpConnectionStatus('testing');
    setGcpConnectionMessage(
      t('flow_builder.document_generator.gcp_testing_connection', 'Testing GCP connection…')
    );

    try {
      const response = await fetch('/api/document-generator/test-gcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          gcpProjectId: projectId,
          gcpLocation: location,
          gcpServiceAccountJson: serviceAccountJson,
        }),
        signal: abortController.signal,
      });
      const payload = await response.json().catch(() => ({}));

      if (isStaleResult()) return;

      if (response.ok && payload?.success) {
        setGcpConnectionStatus('success');
        setGcpConnectionMessage(
          t('flow_builder.document_generator.gcp_connection_success', 'GCP connection successful') +
            (payload.projectId ? ` (${payload.projectId})` : '')
        );
      } else {
        setGcpConnectionStatus('error');
        setGcpConnectionMessage(
          String(
            payload?.error ||
              t('flow_builder.document_generator.gcp_connection_failed', 'GCP connection failed')
          )
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      if (isStaleResult()) return;

      const message = error instanceof Error ? error.message : 'Network error';
      setGcpConnectionStatus('error');
      setGcpConnectionMessage(
        t('flow_builder.document_generator.gcp_connection_failed', 'GCP connection failed') +
          `: ${message}`
      );
    } finally {
      if (gcpTestAbortRef.current === abortController) {
        gcpTestAbortRef.current = null;
      }
      if (testId === gcpTestIdRef.current) {
        setIsTestingGcp(false);
      }
    }
  }, [gcpProjectId, gcpLocation, gcpServiceAccountJson, t, gcpCredentialsMatchTested]);

  const testGeminiConnection = useCallback(async () => {
    const key = geminiApiKey.trim();
    if (!key) {
      setGeminiTestStatus('error');
      setGeminiTestMessage(
        t(
          'flow_builder.document_generator.gemini_api_key_required',
          'Gemini API key is required'
        )
      );
      return;
    }

    setIsTestingGemini(true);
    setGeminiTestStatus('testing');
    setGeminiTestMessage(
      t('flow_builder.document_generator.gemini_testing', 'Testing Gemini connection…')
    );

    try {
      const response = await fetch('/api/document-generator/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: key, model: geminiModel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        setGeminiTestStatus('error');
        setGeminiTestMessage(
          String(
            payload?.error ||
              t('flow_builder.document_generator.gemini_test_failed', 'Gemini connection failed')
          )
        );
        return;
      }
      setGeminiTestStatus('success');
      setGeminiTestMessage(
        t('flow_builder.document_generator.gemini_test_success', 'Gemini connection successful') +
          (payload.model ? ` (${payload.model})` : '')
      );
    } catch (error) {
      setGeminiTestStatus('error');
      setGeminiTestMessage(
        error instanceof Error
          ? error.message
          : t('flow_builder.document_generator.gemini_test_failed', 'Gemini connection failed')
      );
    } finally {
      setIsTestingGemini(false);
    }
  }, [geminiApiKey, geminiModel, t]);

  const handleDelete = () => {
    if (onDeleteNode) {
      onDeleteNode(id);
    }
  };

  const isQuoteGeminiPath = usesDocumentGeneratorQuoteGeminiPath(documentType);
  const needsGcpConfig =
    documentType === 'presentation' || documentType === 'report' || documentType === 'auto';

  const hasGcpCredentials = Boolean(gcpProjectId.trim() && gcpServiceAccountJson.trim());
  const isGcpReady = gcpConnectionStatus === 'success' || hasGcpCredentials;
  const hasGeminiKey = Boolean(geminiApiKey.trim());

  const isReady =
    (!isQuoteGeminiPath || hasGeminiKey) && (!needsGcpConfig || isGcpReady);

  const documentTypeLabel = (type: string) => {
    switch (type) {
      case 'auto':
        return t('flow_builder.document_generator.auto', 'Auto');
      case 'quote':
        return t('flow_builder.document_generator.quote', 'Quote');
      case 'report':
        return t('flow_builder.document_generator.report', 'Report');
      default:
        return t('flow_builder.document_generator.presentation', 'Presentation');
    }
  };

  const enforcedCountDisplay = useMemo(() => {
    if (documentType === 'auto') {
      return t(
        'flow_builder.document_generator.auto_count_summary',
        'Auto: Presentation 10 / Quote 4 / Report 10'
      );
    }
    if (documentType) {
      return String(DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS[documentType]);
    }
    return String(DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.presentation);
  }, [documentType, t]);

  const promptsSummary = useMemo(() => {
    const customized = getCustomizedPromptTypes(systemPrompts);
    if (customized.length === 0) {
      return t('flow_builder.document_generator.prompts_default', 'Default prompts');
    }
    const typesLabel = customized.map((type) => documentTypeLabel(type)).join(', ');
    return t('flow_builder.document_generator.custom_prompt_types', 'Custom: {{types}}', {
      types: typesLabel,
    });
  }, [systemPrompts, t]);

  const activePromptType: DocumentGeneratorResolvedType =
    documentType === 'auto' ? promptEditorType : (documentType ?? 'presentation');

  const updateSystemPrompt = (type: DocumentGeneratorResolvedType, value: string) => {
    setSystemPrompts((prev) => ({ ...prev, [type]: value }));
  };

  const resetPromptToDefault = (type: DocumentGeneratorResolvedType) => {
    setSystemPrompts((prev) => ({
      ...prev,
      [type]: DOCUMENT_GENERATOR_DEFAULT_SYSTEM_PROMPTS[type],
    }));
  };

  const logoSourceLabel = (source: string) => {
    switch (source) {
      case 'inbound':
        return t('flow_builder.document_generator.logo_inbound', 'Inbound');
      case 'url':
        return t('flow_builder.document_generator.logo_url_source', 'URL');
      case 'ask':
        return t('flow_builder.document_generator.logo_ask', 'Ask client');
      default:
        return t('flow_builder.document_generator.logo_none', 'None');
    }
  };

  const outputFormatLabel = (format: string) => {
    switch (format) {
      case 'pdf':
        return t('flow_builder.document_generator.output_format_pdf', 'PDF');
      case 'pptx':
        return t('flow_builder.document_generator.output_format_pptx', 'PowerPoint (PPTX)');
      case 'google_slides_link':
        return t(
          'flow_builder.document_generator.output_format_google_slides_link',
          'Google Slides link'
        );
      case 'png_per_slide':
        return t('flow_builder.document_generator.output_format_png_per_slide', 'PNG per slide');
      default:
        return format;
    }
  };

  const toneLabel = (option: string) => {
    switch (option) {
      case 'default':
        return t('flow_builder.document_generator.tone_default', 'Default');
      case 'professional':
        return t('flow_builder.document_generator.tone_professional', 'Professional');
      case 'sales_pitch':
        return t('flow_builder.document_generator.tone_sales_pitch', 'Sales pitch');
      case 'educational':
        return t('flow_builder.document_generator.tone_educational', 'Educational');
      case 'casual':
        return t('flow_builder.document_generator.tone_casual', 'Casual');
      default:
        return option;
    }
  };

  return (
    <div
      className={cn(
        'node-document-generator p-3 rounded-lg bg-card border border-border shadow-sm group relative transition-all duration-200',
        isEditing ? 'min-w-[480px] w-[560px] max-w-[600px]' : 'min-w-[320px] max-w-[420px]'
      )}
    >
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('common.delete', 'Delete')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <img
                src={DOCUMENT_GENERATOR_FLOW_NODE_ICON_SRC}
                alt={t('flow_builder.document_generator.node_title', 'Document Generator')}
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {t(
                  'flow_builder.document_generator.node_description',
                  'Generate presentations, quotes, and reports with Google Cloud and Gemini'
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>{t('flow_builder.document_generator.node_title', 'Document Generator')}</span>

        <Badge
          variant={isReady ? 'default' : 'secondary'}
          className={cn(
            'text-[10px] px-1.5 py-0.5 ml-1',
            isReady ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
          )}
        >
          {isReady
            ? t('flow_builder.document_generator.ready', 'Ready')
            : t('flow_builder.document_generator.setup_required', 'Setup Required')}
        </Badge>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-tour="components-flow-builder-documentgeneratornode.button.common.hide"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {isEditing ? t('common.hide', 'Hide') : t('common.edit', 'Edit')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {isEditing
                  ? t('flow_builder.document_generator.hide_config', 'Hide configuration panel')
                  : t('flow_builder.document_generator.show_config', 'Show configuration panel')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="text-sm p-2 bg-card rounded border border-border">
        {!isEditing ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('flow_builder.document_generator.mode', 'Mode')}
              </span>
              <span className="font-medium">
                {documentTypeLabel(documentType ?? DOCUMENT_GENERATOR_DEFAULT_DOCUMENT_TYPE)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('flow_builder.document_generator.enforced_count', 'Enforced count')}
              </span>
              <span className="font-medium text-right max-w-[200px] truncate">
                {enforcedCountDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('flow_builder.document_generator.language', 'Language')}
              </span>
              <span className="font-medium">{language}</span>
            </div>
            {isQuoteGeminiPath && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('flow_builder.document_generator.quote_design_mode', 'Design output')}
                </span>
                <span className="font-medium">
                  {quoteDesignMode === 'image_pdf'
                    ? t(
                        'flow_builder.document_generator.quote_design_image_pdf',
                        'Image (PNG) → PDF'
                      )
                    : t(
                        'flow_builder.document_generator.quote_design_html_pdf',
                        'HTML/CSS → PDF (recommended)'
                      )}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('flow_builder.document_generator.attachment_data', 'Attachment data')}
              </span>
              <span className="font-medium">
                {useInboundAttachment ? t('common.yes', 'Yes') : t('common.no', 'No')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('flow_builder.document_generator.prompts', 'Prompts')}
              </span>
              <span className="font-medium text-right max-w-[200px] truncate">{promptsSummary}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('flow_builder.document_generator.output_format', 'Output format')}
              </span>
              <span className="font-medium">{outputFormatLabel(outputFormat)}</span>
            </div>
            {needsGcpConfig && (
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    gcpConnectionStatus === 'success'
                      ? 'bg-primary'
                      : gcpConnectionStatus === 'error'
                        ? 'bg-destructive'
                        : gcpConnectionStatus === 'testing'
                          ? 'bg-amber-500 animate-pulse'
                          : hasGcpCredentials
                            ? 'bg-amber-500'
                            : 'bg-muted-foreground'
                  )}
                />
                <span className="text-muted-foreground">
                  {gcpConnectionStatus === 'success'
                    ? t(
                        'flow_builder.document_generator.gcp_connection_success',
                        'GCP connection successful'
                      )
                    : gcpConnectionStatus === 'error'
                      ? t(
                          'flow_builder.document_generator.gcp_connection_failed',
                          'GCP connection failed'
                        )
                      : gcpConnectionStatus === 'testing'
                        ? t(
                            'flow_builder.document_generator.gcp_testing_connection',
                            'Testing GCP connection…'
                          )
                        : hasGcpCredentials
                          ? t(
                              'flow_builder.document_generator.gcp_credentials_filled',
                              'GCP credentials filled (not tested)'
                            )
                          : t(
                              'flow_builder.document_generator.gcp_not_configured',
                              'GCP not configured'
                            )}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {needsGcpConfig && (
              <div className="space-y-2 rounded-md border border-border/60 p-2">
                <Label className="text-xs font-medium">
                  {t(
                    'flow_builder.document_generator.gcp_section',
                    'Google Cloud (presentations/reports)'
                  )}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {t(
                    'flow_builder.document_generator.gcp_section_help',
                    'Vertex AI and Google Slides credentials for presentation and report generation.'
                  )}
                </p>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t('flow_builder.document_generator.gcp_project_id', 'GCP project ID')}
                  </Label>
                  <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.gcp_project_id"
                    type="text"
                    value={gcpProjectId}
                    onChange={(e) => {
                      setGcpProjectId(e.target.value);
                      resetGcpConnectionOnCredentialChange();
                    }}
                    placeholder="my-gcp-project"
                    className="text-xs h-7"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t('flow_builder.document_generator.gcp_location', 'GCP location')}
                  </Label>
                  <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.gcp_project_id"
                    type="text"
                    value={gcpLocation}
                    onChange={(e) => {
                      setGcpLocation(e.target.value);
                      resetGcpConnectionOnCredentialChange();
                    }}
                    placeholder={DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION}
                    className="text-xs h-7"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t(
                      'flow_builder.document_generator.gcp_service_account_json',
                      'Service account JSON'
                    )}
                  </Label>
                  <Textarea data-tour="components-flow-builder-documentgeneratornode.textarea.flow_builder.document_generator.gcp_service_account_placeholder"
                    value={gcpServiceAccountJson}
                    onChange={(e) => {
                      setGcpServiceAccountJson(e.target.value);
                      resetGcpConnectionOnCredentialChange();
                    }}
                    placeholder={t(
                      'flow_builder.document_generator.gcp_service_account_placeholder',
                      'Paste the full service account key JSON'
                    )}
                    className="text-xs min-h-[80px] font-mono"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Button data-tour="components-flow-builder-documentgeneratornode.button.flow_builder.document_generator.gcp_test_connection"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void testGcpConnection()}
                    disabled={isTestingGcp}
                    className="h-7 px-2 text-xs w-full"
                  >
                    {isTestingGcp ? (
                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    {t(
                      'flow_builder.document_generator.gcp_test_connection',
                      'Test GCP Connection'
                    )}
                  </Button>
                  {gcpConnectionMessage && (
                    <div
                      className={cn(
                        'text-xs flex items-center gap-1',
                        gcpConnectionStatus === 'success'
                          ? 'text-primary'
                          : gcpConnectionStatus === 'error'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      )}
                    >
                      {gcpConnectionStatus === 'success' && <CheckCircle className="h-3 w-3" />}
                      {gcpConnectionStatus === 'error' && <AlertCircle className="h-3 w-3" />}
                      {gcpConnectionMessage}
                    </div>
                  )}
                </div>
              </div>
            )}

            {needsGcpConfig && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {t('flow_builder.document_generator.output_format', 'Output format')}
                  </Label>
                  <Select
                    value={outputFormat}
                    onValueChange={(value) =>
                      setOutputFormat(normalizeDocumentGeneratorOutputFormat(value))
                    }
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_GENERATOR_OUTPUT_FORMATS.map((format) => (
                        <SelectItem key={format} value={format} className="text-xs">
                          {outputFormatLabel(format)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {t('flow_builder.document_generator.slides_theme', 'Slides theme')}
                  </Label>
                  <Select
                    value={slidesThemeId}
                    onValueChange={(value) =>
                      setSlidesThemeId(normalizeDocumentGeneratorSlidesThemeId(value))
                    }
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_GENERATOR_SLIDES_THEMES.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id} className="text-xs">
                          {theme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {t(
                      'flow_builder.document_generator.slides_folder_id',
                      'Slides folder ID (optional)'
                    )}
                  </Label>
                  <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.slides_folder_id_placeholder"
                    type="text"
                    value={slidesFolderId}
                    onChange={(e) => setSlidesFolderId(e.target.value)}
                    placeholder={t(
                      'flow_builder.document_generator.slides_folder_id_placeholder',
                      'Google Drive folder ID'
                    )}
                    className="text-xs h-7"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {t(
                      'flow_builder.document_generator.vertex_text_model',
                      'Vertex text model'
                    )}
                  </Label>
                  <Select
                    value={vertexTextModel}
                    onValueChange={(value) =>
                      setVertexTextModel(normalizeDocumentGeneratorVertexTextModel(value))
                    }
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_GENERATOR_VERTEX_TEXT_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {t('flow_builder.document_generator.image_type', 'Image Type')}
                  </Label>
                  <Select
                    value={imageType}
                    onValueChange={(value) =>
                      setImageType(value as DocumentGeneratorNodeData['imageType'])
                    }
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAGE_TYPES.map((type) => (
                        <SelectItem key={type} value={type} className="text-xs">
                          {type === 'ai-generated'
                            ? t('flow_builder.document_generator.ai_generated', 'AI-generated')
                            : t('flow_builder.document_generator.stock', 'Stock')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.document_type', 'Document Type')}
              </Label>
              <Select
                value={documentType}
                onValueChange={(value) =>
                  setDocumentType(value as DocumentGeneratorNodeData['documentType'])
                }
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_GENERATOR_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-xs">
                      {documentTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {documentType === 'auto'
                  ? t(
                      'flow_builder.document_generator.document_type_help_auto',
                      'At runtime, Presentación, Cotización, or Reporte is resolved from client input and attachments.'
                    )
                  : t(
                      'flow_builder.document_generator.document_type_help_explicit',
                      'The selected structure and fixed count are used for this document type.'
                    )}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.enforced_count', 'Enforced count')}
              </Label>
              <p className="text-xs font-medium">{enforcedCountDisplay}</p>
              <p className="text-[10px] text-muted-foreground">
                {t(
                  'flow_builder.document_generator.enforced_count_help',
                  'Counts are fixed by document type and cannot be edited here.'
                )}
              </p>
            </div>

            {isQuoteGeminiPath && (
              <div className="space-y-2 rounded-md border border-border/60 p-2">
                <Label className="text-xs font-medium">
                  {t(
                    'flow_builder.document_generator.quote_design_section',
                    'Quote design (Gemini)'
                  )}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {t(
                    'flow_builder.document_generator.quote_design_section_help',
                    'Quotes use Google Gemini (default: 3.1 Pro). Paste text or upload Excel/CSV. Gemini chooses a unique layout/style per quote from your content and logo.'
                  )}
                </p>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t(
                      'flow_builder.document_generator.quote_design_mode',
                      'Design output'
                    )}
                  </Label>
                  <Select
                    value={quoteDesignMode || DOCUMENT_GENERATOR_DEFAULT_QUOTE_DESIGN_MODE}
                    onValueChange={(value) =>
                      setQuoteDesignMode(normalizeDocumentGeneratorQuoteDesignMode(value))
                    }
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="html_pdf" className="text-xs">
                        {t(
                          'flow_builder.document_generator.quote_design_html_pdf',
                          'HTML/CSS → PDF (recommended)'
                        )}
                      </SelectItem>
                      <SelectItem value="image_pdf" className="text-xs">
                        {t(
                          'flow_builder.document_generator.quote_design_image_pdf',
                          'Image (PNG) → PDF'
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t('flow_builder.document_generator.gemini_api_key', 'Gemini API key')}
                  </Label>
                  <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.gemini_api_key_placeholder"
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value);
                      setGeminiTestStatus('idle');
                      setGeminiTestMessage('');
                    }}
                    placeholder={t(
                      'flow_builder.document_generator.gemini_api_key_placeholder',
                      'Google AI Studio API key'
                    )}
                    className="text-xs h-7"
                    autoComplete="off"
                  />
                </div>
                {quoteDesignMode === 'image_pdf' ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      {t(
                        'flow_builder.document_generator.gemini_image_model',
                        'Gemini image model'
                      )}
                    </Label>
                    <Select
                      value={geminiImageModel || DOCUMENT_GENERATOR_DEFAULT_GEMINI_IMAGE_MODEL}
                      onValueChange={(value) => {
                        setGeminiImageModel(normalizeDocumentGeneratorGeminiImageModel(value));
                        setGeminiTestStatus('idle');
                        setGeminiTestMessage('');
                      }}
                    >
                      <SelectTrigger className="text-xs h-7">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_GENERATOR_GEMINI_IMAGE_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id} className="text-xs">
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      {t('flow_builder.document_generator.gemini_model', 'Gemini model')}
                    </Label>
                    <Select
                      value={geminiModel || DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL}
                      onValueChange={(value) => {
                        setGeminiModel(normalizeDocumentGeneratorGeminiModel(value));
                        setGeminiTestStatus('idle');
                        setGeminiTestMessage('');
                      }}
                    >
                      <SelectTrigger className="text-xs h-7">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_GENERATOR_GEMINI_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id} className="text-xs">
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button data-tour="components-flow-builder-documentgeneratornode.button.flow_builder.document_generator.gemini_testing"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isTestingGemini || !geminiApiKey.trim()}
                    onClick={() => void testGeminiConnection()}
                  >
                    {isTestingGemini
                      ? t('flow_builder.document_generator.gemini_testing', 'Testing Gemini connection…')
                      : t('flow_builder.document_generator.gemini_test', 'Test Gemini')}
                  </Button>
                  {geminiTestStatus === 'success' && (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {geminiTestMessage}
                    </span>
                  )}
                  {geminiTestStatus === 'error' && (
                    <span className="text-[10px] text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {geminiTestMessage}
                    </span>
                  )}
                  {geminiTestStatus === 'testing' && (
                    <span className="text-[10px] text-muted-foreground">{geminiTestMessage}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 space-y-0.5">
                <Label className="text-xs font-medium">
                  {t(
                    'flow_builder.document_generator.interactive_wizard',
                    'Interactive quote wizard'
                  )}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {isQuoteGeminiPath
                    ? t(
                        'flow_builder.document_generator.interactive_wizard_help_quote',
                        'Ask for a logo, then let the client paste the quote, upload Excel/CSV, or answer step-by-step questions before generating.'
                      )
                    : t(
                        'flow_builder.document_generator.interactive_wizard_help',
                        'Ask the client to upload their own PDF template, then optionally collect a logo before generating with Vertex AI.'
                      )}
                </p>
              </div>
              <Switch checked={interactiveWizard} onCheckedChange={setInteractiveWizard} />
            </div>

            {interactiveWizard && !isQuoteGeminiPath && (
              <div className="space-y-2 rounded-md border border-border/60 p-2">
                <Label className="text-xs font-medium">
                  {t(
                    'flow_builder.document_generator.gemini_section',
                    'Gemini (own-template clone)'
                  )}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {t(
                    'flow_builder.document_generator.gemini_section_help',
                    'Required only when the client chooses “Upload my own template (PDF)”. Uses Google AI Studio — not OpenRouter.'
                  )}
                </p>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t('flow_builder.document_generator.gemini_api_key', 'Gemini API key')}
                  </Label>
                  <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.gemini_api_key_placeholder"
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value);
                      setGeminiTestStatus('idle');
                      setGeminiTestMessage('');
                    }}
                    placeholder={t(
                      'flow_builder.document_generator.gemini_api_key_placeholder',
                      'Google AI Studio API key'
                    )}
                    className="text-xs h-7"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    {t('flow_builder.document_generator.gemini_model', 'Gemini model')}
                  </Label>
                  <Select
                    value={geminiModel || DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL}
                    onValueChange={(value) => {
                      setGeminiModel(normalizeDocumentGeneratorGeminiModel(value));
                      setGeminiTestStatus('idle');
                      setGeminiTestMessage('');
                    }}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_GENERATOR_GEMINI_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button data-tour="components-flow-builder-documentgeneratornode.button.flow_builder.document_generator.gemini_testing"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isTestingGemini || !geminiApiKey.trim()}
                    onClick={() => void testGeminiConnection()}
                  >
                    {isTestingGemini
                      ? t('flow_builder.document_generator.gemini_testing', 'Testing Gemini connection…')
                      : t('flow_builder.document_generator.gemini_test', 'Test Gemini')}
                  </Button>
                  {geminiTestStatus === 'success' && (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {geminiTestMessage}
                    </span>
                  )}
                  {geminiTestStatus === 'error' && (
                    <span className="text-[10px] text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {geminiTestMessage}
                    </span>
                  )}
                  {geminiTestStatus === 'testing' && (
                    <span className="text-[10px] text-muted-foreground">{geminiTestMessage}</span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.tone', 'Tone')}
              </Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="text-xs h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="text-xs">
                      {toneLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.language', 'Language')}
              </Label>
              <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.gcp_project_id"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder={DOCUMENT_GENERATOR_DEFAULT_LANGUAGE}
                className="text-xs h-7"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.client_content_input', 'Client content/input')}
              </Label>
              <p className="text-[10px] text-muted-foreground mb-1">
                {t(
                  'flow_builder.document_generator.client_content_input_help',
                  'This is treated as data to process, never as system instructions.'
                )}
              </p>
              <EnhancedVariablePicker
                customVariables={customVariables}
                multiline
                flowId={flowId ?? undefined}
                value={contentTemplate}
                onChange={setContentTemplate}
                placeholder={DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE}
                className="flex-1 min-w-0"
                pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium flex-1">
                {t(
                  'flow_builder.document_generator.use_inbound_attachment',
                  'Use inbound attachment as data source'
                )}
              </Label>
              <Switch checked={useInboundAttachment} onCheckedChange={setUseInboundAttachment} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium flex-1">
                {t(
                  'flow_builder.document_generator.include_table_of_contents',
                  'Include table of contents'
                )}
              </Label>
              <Switch
                checked={includeTableOfContents}
                onCheckedChange={setIncludeTableOfContents}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.logo_source', 'Logo source')}
              </Label>
              <Select
                value={logoSource}
                onValueChange={(value) =>
                  setLogoSource(value as DocumentGeneratorNodeData['logoSource'])
                }
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_SOURCES.map((source) => (
                    <SelectItem key={source} value={source} className="text-xs">
                      {logoSourceLabel(source)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {logoSource === 'url' && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  {t('flow_builder.document_generator.logo_url', 'Logo URL')}
                </Label>
                <Input data-tour="components-flow-builder-documentgeneratornode.input.flow_builder.document_generator.logo_url"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="text-xs h-7"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.system_prompt', 'System prompt')}
              </Label>
              <p className="text-[10px] text-muted-foreground mb-1">
                {t(
                  'flow_builder.document_generator.system_prompt_help',
                  'Builder-owned instructions. Client input is processed as data, not instructions.'
                )}
              </p>
              {documentType === 'auto' && (
                <div className="space-y-1 mb-2">
                  <Label className="text-[10px] text-muted-foreground">
                    {t('flow_builder.document_generator.prompt_type', 'Prompt type')}
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={promptEditorType}
                    onValueChange={(value) => {
                      if (value) setPromptEditorType(value as DocumentGeneratorResolvedType);
                    }}
                    className="justify-start"
                  >
                    {DOCUMENT_GENERATOR_RESOLVED_TYPES.map((type) => (
                      <ToggleGroupItem
                        key={type}
                        value={type}
                        className="h-7 px-2 text-xs"
                      >
                        {documentTypeLabel(type)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              )}
              <Textarea data-tour="components-flow-builder-documentgeneratornode.textarea.flow_builder.document_generator.gcp_project_id"
                value={systemPrompts[activePromptType]}
                onChange={(e) => updateSystemPrompt(activePromptType, e.target.value)}
                className="text-xs min-h-[120px]"
              />
              <Button data-tour="components-flow-builder-documentgeneratornode.button.flow_builder.document_generator.reset_prompt_default"
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => resetPromptToDefault(activePromptType)}
              >
                {t('flow_builder.document_generator.reset_prompt_default', 'Reset to default')}
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t('flow_builder.document_generator.output_file_name', 'Output filename')}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                flowId={flowId ?? undefined}
                value={outputFileName}
                onChange={setOutputFileName}
                placeholder={t(
                  'flow_builder.document_generator.output_file_name_placeholder',
                  '{{contact.name}}-itinerary.pdf'
                )}
                className="flex-1 min-w-0"
                pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t(
                  'flow_builder.document_generator.acknowledgement_message',
                  'Acknowledgement message'
                )}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                multiline
                flowId={flowId ?? undefined}
                value={ackMessage}
                onChange={setAckMessage}
                placeholder={t(
                  'flow_builder.document_generator.generating_default',
                  'Generating your document…'
                )}
                className="flex-1 min-w-0"
                pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
