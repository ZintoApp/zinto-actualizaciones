import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { DEFAULT_RAG_CONFIG, CONTEXT_TEMPLATE, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_OPTIONS, getEmbeddingModelLabel, normalizeEmbeddingModel, normalizeGreetingAcknowledgementExpressions, type VectorDatabaseProvider } from '@shared/rag-defaults';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  RefreshCw,
  Info,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface RAGConfig {
  enabled: boolean;
  maxRetrievedChunks: number;
  similarityThreshold: number;
  embeddingModel: string;
  contextPosition: 'before_system' | 'after_system' | 'before_user';
  contextTemplate: string;
  greetingAcknowledgementExpressions: string[];
  vectorDatabase: VectorDatabaseProvider | null;
  hybridEnabled: boolean;
  denseTopK: number;
  lexicalTopK: number;
  rrfK: number;
  denseWeight: number;
  lexicalWeight: number;
  candidatePoolSize: number;
  dedupeEnabled: boolean;
  dedupeSimilarity: number;
  mmrEnabled: boolean;
  mmrLambda: number;
  rerankEnabled: boolean;
  rerankModel: string;
  rerankTopN: number;
  confidenceThreshold: number;
  queryRewriteEnabled: boolean;
  answerValidationEnabled: boolean;
  hnswEfSearch: number;
}

interface RAGConfigurationProps {
  nodeId: string;
  config: RAGConfig;
  vectorDatabase?: VectorDatabaseProvider | null;
  onConfigChange?: (config: RAGConfig) => void;
  llmProvider?: string;
  azureEmbeddingDeployments?: Array<{ id: string; name: string; underlyingModel: string }>;
}

const DEFAULT_CONFIG: RAGConfig = { ...DEFAULT_RAG_CONFIG };

function resolveVectorDatabase(
  prop: VectorDatabaseProvider | null | undefined,
  fromSaved: VectorDatabaseProvider | null | undefined
): VectorDatabaseProvider | null {
  if (prop !== undefined) {
    return prop;
  }
  if (fromSaved !== undefined && fromSaved !== null) {
    return fromSaved;
  }
  return DEFAULT_CONFIG.vectorDatabase;
}

function buildSavedConfig(
  saved: Partial<RAGConfig> | null | undefined,
  vectorDatabase?: VectorDatabaseProvider | null,
  flowGreetingAcknowledgementExpressions?: string[],
  llmProvider?: string
): RAGConfig {
  return {
    enabled: saved?.enabled ?? DEFAULT_CONFIG.enabled,
    maxRetrievedChunks: saved?.maxRetrievedChunks ?? DEFAULT_CONFIG.maxRetrievedChunks,
    similarityThreshold: saved?.similarityThreshold ?? DEFAULT_CONFIG.similarityThreshold,
  embeddingModel: saved?.embeddingModel
    ? (llmProvider === 'azure' ? saved.embeddingModel : normalizeEmbeddingModel(saved.embeddingModel))
    : (llmProvider === 'azure' ? '' : DEFAULT_CONFIG.embeddingModel),
    contextPosition: saved?.contextPosition ?? DEFAULT_CONFIG.contextPosition,
    contextTemplate: saved?.contextTemplate ?? DEFAULT_CONFIG.contextTemplate,
    // Flow-node setting (like prompts) — not loaded from knowledge_base_configs.
    greetingAcknowledgementExpressions: normalizeGreetingAcknowledgementExpressions(
      flowGreetingAcknowledgementExpressions
    ),
    vectorDatabase: resolveVectorDatabase(vectorDatabase, saved?.vectorDatabase),
    hybridEnabled: saved?.hybridEnabled ?? DEFAULT_CONFIG.hybridEnabled,
    denseTopK: saved?.denseTopK ?? DEFAULT_CONFIG.denseTopK,
    lexicalTopK: saved?.lexicalTopK ?? DEFAULT_CONFIG.lexicalTopK,
    rrfK: saved?.rrfK ?? DEFAULT_CONFIG.rrfK,
    denseWeight: saved?.denseWeight ?? DEFAULT_CONFIG.denseWeight,
    lexicalWeight: saved?.lexicalWeight ?? DEFAULT_CONFIG.lexicalWeight,
    candidatePoolSize: saved?.candidatePoolSize ?? DEFAULT_CONFIG.candidatePoolSize,
    dedupeEnabled: saved?.dedupeEnabled ?? DEFAULT_CONFIG.dedupeEnabled,
    dedupeSimilarity: saved?.dedupeSimilarity ?? DEFAULT_CONFIG.dedupeSimilarity,
    mmrEnabled: saved?.mmrEnabled ?? DEFAULT_CONFIG.mmrEnabled,
    mmrLambda: saved?.mmrLambda ?? DEFAULT_CONFIG.mmrLambda,
    rerankEnabled: saved?.rerankEnabled ?? DEFAULT_CONFIG.rerankEnabled,
    rerankModel: saved?.rerankModel ?? DEFAULT_CONFIG.rerankModel,
    rerankTopN: saved?.rerankTopN ?? DEFAULT_CONFIG.rerankTopN,
    confidenceThreshold: saved?.confidenceThreshold ?? DEFAULT_CONFIG.confidenceThreshold,
    queryRewriteEnabled: saved?.queryRewriteEnabled ?? DEFAULT_CONFIG.queryRewriteEnabled,
    answerValidationEnabled: saved?.answerValidationEnabled ?? DEFAULT_CONFIG.answerValidationEnabled,
    hnswEfSearch: saved?.hnswEfSearch ?? DEFAULT_CONFIG.hnswEfSearch,
  };
}

function ragConfigsEqual(a: RAGConfig, b: RAGConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.maxRetrievedChunks === b.maxRetrievedChunks &&
    a.similarityThreshold === b.similarityThreshold &&
    a.contextPosition === b.contextPosition &&
    a.contextTemplate === b.contextTemplate &&
    a.greetingAcknowledgementExpressions.join('\n') ===
      b.greetingAcknowledgementExpressions.join('\n') &&
    a.embeddingModel === b.embeddingModel &&
    a.vectorDatabase === b.vectorDatabase &&
    a.hybridEnabled === b.hybridEnabled &&
    a.denseTopK === b.denseTopK &&
    a.lexicalTopK === b.lexicalTopK &&
    a.rrfK === b.rrfK &&
    a.denseWeight === b.denseWeight &&
    a.lexicalWeight === b.lexicalWeight &&
    a.candidatePoolSize === b.candidatePoolSize &&
    a.dedupeEnabled === b.dedupeEnabled &&
    a.dedupeSimilarity === b.dedupeSimilarity &&
    a.mmrEnabled === b.mmrEnabled &&
    a.mmrLambda === b.mmrLambda &&
    a.rerankEnabled === b.rerankEnabled &&
    a.rerankModel === b.rerankModel &&
    a.rerankTopN === b.rerankTopN &&
    a.confidenceThreshold === b.confidenceThreshold &&
    a.queryRewriteEnabled === b.queryRewriteEnabled &&
    a.answerValidationEnabled === b.answerValidationEnabled &&
    a.hnswEfSearch === b.hnswEfSearch
  );
}

const CONTEXT_POSITION_IDS = [
  { id: 'before_system', nameKey: 'knowledge_base.config.context_position_before_system', descKey: 'knowledge_base.config.context_position_before_system_desc' },
  { id: 'after_system', nameKey: 'knowledge_base.config.context_position_after_system', descKey: 'knowledge_base.config.context_position_after_system_desc' },
  { id: 'before_user', nameKey: 'knowledge_base.config.context_position_before_user', descKey: 'knowledge_base.config.context_position_before_user_desc' }
];

export function RAGConfiguration({
  nodeId,
  config,
  vectorDatabase,
  onConfigChange,
  llmProvider,
  azureEmbeddingDeployments = [],
}: RAGConfigurationProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [greetingExpressionsDraft, setGreetingExpressionsDraft] = useState(
    config.greetingAcknowledgementExpressions.join('\n')
  );
  const [isEditingGreetingExpressions, setIsEditingGreetingExpressions] = useState(false);

  const { data: currentConfig, isLoading } = useQuery({
    queryKey: ['knowledge-base-config', nodeId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/knowledge-base/config/${nodeId}`);
      const result = await response.json();
      return {
        config: result.data as Partial<RAGConfig> | null,
        providerHealth: result.providerHealth as {
          ok: boolean;
          message?: string;
          recordedAt?: string;
        } | undefined,
      };
    }
  });

  const savedConfig = useMemo(
    () =>
      buildSavedConfig(
        currentConfig?.config,
        vectorDatabase,
        config.greetingAcknowledgementExpressions,
        llmProvider
      ),
    [currentConfig?.config, vectorDatabase, config.greetingAcknowledgementExpressions, llmProvider]
  );

  const hasChanges = !ragConfigsEqual(config, savedConfig);

  React.useEffect(() => {
    if (!isEditingGreetingExpressions) {
      setGreetingExpressionsDraft(config.greetingAcknowledgementExpressions.join('\n'));
    }
  }, [config.greetingAcknowledgementExpressions, isEditingGreetingExpressions]);

  const handleConfigChange = (updates: Partial<RAGConfig>) => {
    onConfigChange?.({
      ...config,
      ...updates,
      vectorDatabase:
        updates.vectorDatabase !== undefined
          ? updates.vectorDatabase
          : vectorDatabase !== undefined
            ? vectorDatabase
            : config.vectorDatabase,
    });
  };

  const commitGreetingExpressionsDraft = (draft: string = greetingExpressionsDraft) => {
    const normalized = normalizeGreetingAcknowledgementExpressions(
      draft
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
    setGreetingExpressionsDraft(normalized.join('\n'));
    handleConfigChange({
      greetingAcknowledgementExpressions: normalized,
    });
  };

  const handleReset = () => {
    setIsEditingGreetingExpressions(false);
    onConfigChange?.(savedConfig);
    setGreetingExpressionsDraft(savedConfig.greetingAcknowledgementExpressions.join('\n'));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t('knowledge_base.config.title', 'RAG Configuration')}
            </CardTitle>
            <CardDescription>
              {t('knowledge_base.config.description', 'Configure how the knowledge base retrieves and injects context via the AI SDK RAG runtime')}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {currentConfig?.providerHealth?.ok === false && currentConfig.providerHealth.message && (
        <CardContent className="pt-0 pb-2">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">
                {t('knowledge_base.config.provider_health_error', 'Vector database configuration issue')}
              </p>
              <p className="mt-1 text-xs">{currentConfig.providerHealth.message}</p>
            </div>
          </div>
        </CardContent>
      )}

      {isExpanded && (
        <CardContent className="space-y-6">
          {config.enabled && (
          <>
            {config.vectorDatabase && (
              <div className="space-y-2">
                <Label>
                  {t('knowledge_base.config.vector_database', 'Vector Database')}
                </Label>
                <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">
                    {config.vectorDatabase === 'pinecone'
                      ? t('knowledge_base.config.vector_database_pinecone', 'Pinecone')
                      : t('knowledge_base.config.vector_database_pgvector', 'pgvector')}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {t('knowledge_base.config.retrieval_title', 'Retrieval Settings')}
              </h3>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.max_chunks', 'Maximum Retrieved Chunks')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.max_chunks_tooltip', 
                            'Number of most relevant document chunks to retrieve for each query. More chunks provide more context but increase token usage.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.maxRetrievedChunks]}
                    onValueChange={([value]) => handleConfigChange({ maxRetrievedChunks: value })}
                    max={25}
                    min={1}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-8 text-sm font-medium">{config.maxRetrievedChunks}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.similarity_threshold', 'Similarity Threshold')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.similarity_threshold_tooltip',
                            'Minimum similarity score (0-1) for chunks to be included. Higher values return more relevant but fewer results.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.similarityThreshold]}
                    onValueChange={([value]) => handleConfigChange({ similarityThreshold: value })}
                    max={1}
                    min={0}
                    step={0.05}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm font-medium">{config.similarityThreshold.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.embedding_model', 'Embedding Model')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.embedding_model_tooltip',
                            'Choose the embedding model used for document indexing and retrieval. Both models store vectors at 1536 dimensions for vector database compatibility. Changing the model requires re-uploading existing documents.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={config.embeddingModel || undefined}
                  onValueChange={(value: string) => handleConfigChange({ embeddingModel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {llmProvider === 'azure'
                      ? (
                        <>
                          {azureEmbeddingDeployments.map((deployment) => (
                            <SelectItem key={deployment.id} value={deployment.id}>
                              <div>
                                <div className="font-medium">{deployment.name}</div>
                                <div className="text-xs text-gray-500">{deployment.underlyingModel || deployment.id}</div>
                              </div>
                            </SelectItem>
                          ))}
                          {config.embeddingModel &&
                            !azureEmbeddingDeployments.some((d) => d.id === config.embeddingModel) && (
                              <SelectItem value={config.embeddingModel}>
                                {config.embeddingModel} (saved)
                              </SelectItem>
                            )}
                        </>
                      )
                      : EMBEDDING_MODEL_OPTIONS.map((modelId) => (
                          <SelectItem key={modelId} value={modelId}>
                            <div>
                              <div className="font-medium">{getEmbeddingModelLabel(modelId)}</div>
                              <div className="text-xs text-gray-500">{modelId}</div>
                            </div>
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('knowledge_base.config.embedding_dimensions', '{{dimensions}} dimensions', {
                    dimensions: EMBEDDING_DIMENSIONS,
                  })}
                </p>
                {llmProvider === 'azure' && (
                  <p className="text-xs text-amber-700">
                    {t(
                      'knowledge_base.config.azure_embedding_warning',
                      'Use an embedding deployment (1536 dimensions). Changing this deployment requires re-indexing the knowledge base.'
                    )}
                  </p>
                )}
                {llmProvider === 'azure' && azureEmbeddingDeployments.length === 0 && !config.embeddingModel && (
                  <p className="text-xs text-destructive">
                    {t(
                      'knowledge_base.config.azure_embedding_required',
                      'No embedding deployment found. Create one in Azure OpenAI (text-embedding-3-large or equivalent, 1536 dimensions) before enabling RAG.'
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {t('knowledge_base.config.context_title', 'Context Injection')}
              </h3>

              <div className="space-y-2">
                <Label>
                  {t('knowledge_base.config.context_position', 'Context Position')}
                </Label>
                <Select
                  value={config.contextPosition}
                  onValueChange={(value: RAGConfig['contextPosition']) => handleConfigChange({ contextPosition: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTEXT_POSITION_IDS.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        <div>
                          <div className="font-medium">{t(position.nameKey, position.id === 'before_system' ? 'Before System Prompt' : position.id === 'after_system' ? 'After System Prompt (RECOMMENDED)' : 'Before User Message')}</div>
                          <div className="text-xs text-gray-500">{t(position.descKey, position.id === 'before_system' ? 'Context appears before the system prompt. Use when your system prompt is flexible.' : position.id === 'after_system' ? 'Context appears after the system prompt (RECOMMENDED). Use when your system prompt is restrictive.' : 'Context is injected before each user message. Most flexible but uses more tokens.')}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {config.contextPosition === 'before_system' && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-amber-800 dark:text-amber-200">
                      {t('knowledge_base.config.before_system_warning', 'May not work well with restrictive system prompts (e.g., "focused on scheduling"). Consider using "After System Prompt" for better results.')}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  {t('knowledge_base.config.prompt_preview', 'Prompt Structure Preview')}
                </Label>
                <div className="p-3 rounded-md bg-muted/50 border text-sm font-mono">
                  {config.contextPosition === 'before_system' && (
                    <span>[Knowledge Base Context] → [System Prompt] → [User Message]</span>
                  )}
                  {config.contextPosition === 'after_system' && (
                    <span>[System Prompt] → [Knowledge Base Context] → [User Message]</span>
                  )}
                  {config.contextPosition === 'before_user' && (
                    <span>[System Prompt] → [User Message + Knowledge Base Context]</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.context_template', 'Context Template')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.context_template_tooltip', 
                            'Template for injecting retrieved context. Use {context} placeholder where the retrieved chunks should be inserted.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  value={config.contextTemplate}
                  onChange={(e) => handleConfigChange({ contextTemplate: e.target.value })}
                  placeholder={CONTEXT_TEMPLATE}
                  rows={4}
                  className="text-sm"
                />
                {!config.contextTemplate.includes('{context}') && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertCircle className="w-4 h-4" />
                    {t('knowledge_base.config.context_placeholder_warning', 
                      'Template should include {context} placeholder'
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t(
                      'knowledge_base.config.greeting_acknowledgement_expressions',
                      'Greeting ACK Expressions'
                    )}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t(
                            'knowledge_base.config.greeting_acknowledgement_expressions_tooltip',
                            'One greeting or courtesy expression per line. Matching messages skip knowledge-base retrieval and go straight to the model. Saved with the flow (like the system prompt). Leave empty to disable greeting bypass.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  value={greetingExpressionsDraft}
                  onFocus={() => setIsEditingGreetingExpressions(true)}
                  onChange={(e) => {
                    const nextDraft = e.target.value;
                    setGreetingExpressionsDraft(nextDraft);
                    handleConfigChange({
                      greetingAcknowledgementExpressions:
                        normalizeGreetingAcknowledgementExpressions(
                          nextDraft
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean)
                        ),
                    });
                  }}
                  onBlur={() => {
                    setIsEditingGreetingExpressions(false);
                    commitGreetingExpressionsDraft();
                  }}
                  placeholder={DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions.join('\n')}
                  rows={8}
                  className="text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    'knowledge_base.config.greeting_acknowledgement_expressions_help',
                    'Examples: hola, buenas noches, thank you. Mixed messages like "hola, tiene tour a Cotopaxi" still use RAG.'
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
              >
                <h3 className="text-lg font-medium">
                  {t('knowledge_base.config.advanced_retrieval_title', 'Advanced Retrieval')}
                </h3>
                {advancedExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {advancedExpanded && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>{t('knowledge_base.config.hybrid_enabled', 'Hybrid retrieval')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('knowledge_base.config.hybrid_enabled_desc', 'Combine dense vector and lexical search')}
                      </p>
                    </div>
                    <Switch
                      checked={config.hybridEnabled}
                      onCheckedChange={(checked) => handleConfigChange({ hybridEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>{t('knowledge_base.config.query_rewrite_enabled', 'Query rewrite')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('knowledge_base.config.query_rewrite_enabled_desc', 'Expand queries with LLM understanding before search')}
                      </p>
                    </div>
                    <Switch
                      checked={config.queryRewriteEnabled}
                      onCheckedChange={(checked) => handleConfigChange({ queryRewriteEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>{t('knowledge_base.config.rerank_enabled', 'Listwise rerank')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('knowledge_base.config.rerank_enabled_desc', 'Re-score fused candidates with an LLM')}
                      </p>
                    </div>
                    <Switch
                      checked={config.rerankEnabled}
                      onCheckedChange={(checked) => handleConfigChange({ rerankEnabled: checked })}
                    />
                  </div>

                  {config.rerankEnabled && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t('knowledge_base.config.rerank_model', 'Rerank model')}</Label>
                        <Select
                          value={config.rerankModel}
                          onValueChange={(value) => handleConfigChange({ rerankModel: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('knowledge_base.config.rerank_top_n', 'Rerank top N')}</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[config.rerankTopN]}
                            onValueChange={([value]) => handleConfigChange({ rerankTopN: value })}
                            max={20}
                            min={1}
                            step={1}
                            className="flex-1"
                          />
                          <span className="w-8 text-sm font-medium">{config.rerankTopN}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{t('knowledge_base.config.confidence_threshold', 'Confidence threshold')}</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[config.confidenceThreshold]}
                        onValueChange={([value]) => handleConfigChange({ confidenceThreshold: value })}
                        max={1}
                        min={0}
                        step={0.05}
                        className="flex-1"
                      />
                      <span className="w-12 text-sm font-medium">{config.confidenceThreshold.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('knowledge_base.config.candidate_pool_size', 'Candidate pool size')}</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[config.candidatePoolSize]}
                        onValueChange={([value]) => handleConfigChange({ candidatePoolSize: value })}
                        max={100}
                        min={10}
                        step={5}
                        className="flex-1"
                      />
                      <span className="w-8 text-sm font-medium">{config.candidatePoolSize}</span>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('knowledge_base.config.dense_top_k', 'Dense top K')}</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.denseTopK]}
                          onValueChange={([value]) => handleConfigChange({ denseTopK: value })}
                          max={100}
                          min={5}
                          step={5}
                          className="flex-1"
                        />
                        <span className="w-8 text-sm font-medium">{config.denseTopK}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('knowledge_base.config.lexical_top_k', 'Lexical top K')}</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.lexicalTopK]}
                          onValueChange={([value]) => handleConfigChange({ lexicalTopK: value })}
                          max={100}
                          min={5}
                          step={5}
                          className="flex-1"
                        />
                        <span className="w-8 text-sm font-medium">{config.lexicalTopK}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>{t('knowledge_base.config.dedupe_enabled', 'Near-duplicate dedupe')}</Label>
                    </div>
                    <Switch
                      checked={config.dedupeEnabled}
                      onCheckedChange={(checked) => handleConfigChange({ dedupeEnabled: checked })}
                    />
                  </div>

                  {config.dedupeEnabled && (
                    <div className="space-y-2">
                      <Label>{t('knowledge_base.config.dedupe_similarity', 'Dedupe similarity')}</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.dedupeSimilarity]}
                          onValueChange={([value]) => handleConfigChange({ dedupeSimilarity: value })}
                          max={1}
                          min={0.5}
                          step={0.01}
                          className="flex-1"
                        />
                        <span className="w-12 text-sm font-medium">{config.dedupeSimilarity.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>{t('knowledge_base.config.mmr_enabled', 'MMR diversification')}</Label>
                    </div>
                    <Switch
                      checked={config.mmrEnabled}
                      onCheckedChange={(checked) => handleConfigChange({ mmrEnabled: checked })}
                    />
                  </div>

                  {config.mmrEnabled && (
                    <div className="space-y-2">
                      <Label>{t('knowledge_base.config.mmr_lambda', 'MMR lambda')}</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.mmrLambda]}
                          onValueChange={([value]) => handleConfigChange({ mmrLambda: value })}
                          max={1}
                          min={0}
                          step={0.05}
                          className="flex-1"
                        />
                        <span className="w-12 text-sm font-medium">{config.mmrLambda.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>{t('knowledge_base.config.answer_validation_enabled', 'Answer validation')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('knowledge_base.config.answer_validation_enabled_desc', 'Post-generation grounding check before sending the reply')}
                      </p>
                    </div>
                    <Switch
                      checked={config.answerValidationEnabled}
                      onCheckedChange={(checked) => handleConfigChange({ answerValidationEnabled: checked })}
                    />
                  </div>

                  {config.vectorDatabase === 'pgvector' && (
                    <div className="space-y-2">
                      <Label>{t('knowledge_base.config.hnsw_ef_search', 'HNSW ef_search')}</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.hnswEfSearch]}
                          onValueChange={([value]) => handleConfigChange({ hnswEfSearch: value })}
                          max={1000}
                          min={1}
                          step={10}
                          className="flex-1"
                        />
                        <span className="w-12 text-sm font-medium">{config.hnswEfSearch}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

          <div className="flex items-center justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.reset', 'Reset')}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
