import {
  DEFAULT_RAG_CONFIG,
  normalizeEmbeddingModel,
  normalizeGreetingAcknowledgementExpressions,
  type VectorDatabaseProvider,
} from '../rag-defaults';
import {
  AI_ASSISTANT_DEFAULT_MODEL,
  AI_ASSISTANT_DEFAULT_HISTORY_LIMIT,
  AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL,
  AI_ASSISTANT_DEFAULT_PROVIDER,
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
  type ErpProductImageCaptionMode,
  type ErpProductImageMultiMatchMode,
  type ErpProductImageSendWhen,
} from './node-types';

export {
  AI_ASSISTANT_DEFAULT_MODEL,
  AI_ASSISTANT_DEFAULT_HISTORY_LIMIT,
  AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL,
  AI_ASSISTANT_DEFAULT_PROVIDER,
} from './node-types';
import { normalizeAiAssistantVariables } from '../ai-assistant-variables';
import { normalizeAiAssistantCustomFieldBindings } from '../ai-assistant-custom-fields';

export function getAiAssistantDefaultModel(provider: string | null | undefined): string {
  if (provider === 'azure') return '';
  return provider === 'openrouter'
    ? AI_ASSISTANT_OPENROUTER_DEFAULT_MODEL
    : AI_ASSISTANT_DEFAULT_MODEL;
}

function resolveVectorDatabase(
  raw: Partial<AiAssistantNodeData>
): VectorDatabaseProvider | null {
  if (raw.knowledgeBaseConfig?.vectorDatabase !== undefined) {
    return raw.knowledgeBaseConfig.vectorDatabase;
  }
  if (raw.vectorDatabase !== undefined) {
    return raw.vectorDatabase;
  }
  const legacyPineconeKey = raw.pineconeApiKey;
  if (typeof legacyPineconeKey === 'string' && legacyPineconeKey.trim() !== '') {
    return 'pinecone';
  }
  return DEFAULT_RAG_CONFIG.vectorDatabase;
}

export function normalizeElevenLabsModel(model: string | undefined): string {
  const resolved = model ?? 'eleven_multilingual_v2';
  if (resolved === 'eleven_monolingual_v1' || resolved === 'eleven_multilingual_v1') {
    return 'eleven_multilingual_v2';
  }
  return resolved;
}

/** Maps persisted empty assignment strategy to the editor display value. */
export function normalizeAssignmentStrategyForDisplay(
  value: string | undefined | null
): string {
  return value === '' || value === undefined || value === null ? 'company_default' : value;
}

/** Maps editor display value back to persisted assignment strategy. */
export function assignmentStrategyForPersistence(displayValue: string): string {
  return displayValue === 'company_default' ? '' : displayValue;
}

function normalizeErpProductImageSendWhen(
  value: unknown
): ErpProductImageSendWhen {
  if (
    typeof value === 'string' &&
    (ERP_PRODUCT_IMAGE_SEND_WHEN_VALUES as readonly string[]).includes(value)
  ) {
    return value as ErpProductImageSendWhen;
  }
  return ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT;
}

function normalizeErpProductImageMultiMatchMode(
  value: unknown
): ErpProductImageMultiMatchMode {
  if (
    typeof value === 'string' &&
    (ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_VALUES as readonly string[]).includes(value)
  ) {
    return value as ErpProductImageMultiMatchMode;
  }
  return ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT;
}

function normalizeErpProductImageCaptionMode(
  value: unknown
): ErpProductImageCaptionMode {
  if (
    typeof value === 'string' &&
    (ERP_PRODUCT_IMAGE_CAPTION_MODE_VALUES as readonly string[]).includes(value)
  ) {
    return value as ErpProductImageCaptionMode;
  }
  return ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT;
}

function normalizeErpProductImageMaxPerProduct(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT;
  return Math.min(
    ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MAX,
    Math.max(ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_MIN, Math.round(n))
  );
}

export function normalizeAiAssistantNodeData(
  raw: Partial<AiAssistantNodeData> | null | undefined,
  options?: { defaultModel?: string }
): AiAssistantNodeData {
  const input = raw ?? {};
  const provider = input.provider ?? AI_ASSISTANT_DEFAULT_PROVIDER;
  const vectorDatabase = resolveVectorDatabase(input);

  const existingKnowledgeBaseConfig = input.knowledgeBaseConfig ?? {};
  const knowledgeBaseConfig: AiAssistantKnowledgeBaseConfig = {
    ...existingKnowledgeBaseConfig,
    maxRetrievedChunks:
      existingKnowledgeBaseConfig.maxRetrievedChunks ?? DEFAULT_RAG_CONFIG.maxRetrievedChunks,
    similarityThreshold:
      existingKnowledgeBaseConfig.similarityThreshold ?? DEFAULT_RAG_CONFIG.similarityThreshold,
    contextPosition:
      existingKnowledgeBaseConfig.contextPosition ?? DEFAULT_RAG_CONFIG.contextPosition,
    contextTemplate:
      existingKnowledgeBaseConfig.contextTemplate ?? DEFAULT_RAG_CONFIG.contextTemplate,
    greetingAcknowledgementExpressions: normalizeGreetingAcknowledgementExpressions(
      existingKnowledgeBaseConfig.greetingAcknowledgementExpressions
    ),
    embeddingModel:
      input.provider === 'azure'
        ? (existingKnowledgeBaseConfig.embeddingModel || '')
        : normalizeEmbeddingModel(existingKnowledgeBaseConfig.embeddingModel),
    vectorDatabase,
    hybridEnabled:
      existingKnowledgeBaseConfig.hybridEnabled ?? DEFAULT_RAG_CONFIG.hybridEnabled,
    denseTopK:
      existingKnowledgeBaseConfig.denseTopK ?? DEFAULT_RAG_CONFIG.denseTopK,
    lexicalTopK:
      existingKnowledgeBaseConfig.lexicalTopK ?? DEFAULT_RAG_CONFIG.lexicalTopK,
    rrfK:
      existingKnowledgeBaseConfig.rrfK ?? DEFAULT_RAG_CONFIG.rrfK,
    denseWeight:
      existingKnowledgeBaseConfig.denseWeight ?? DEFAULT_RAG_CONFIG.denseWeight,
    lexicalWeight:
      existingKnowledgeBaseConfig.lexicalWeight ?? DEFAULT_RAG_CONFIG.lexicalWeight,
    candidatePoolSize:
      existingKnowledgeBaseConfig.candidatePoolSize ?? DEFAULT_RAG_CONFIG.candidatePoolSize,
    dedupeEnabled:
      existingKnowledgeBaseConfig.dedupeEnabled ?? DEFAULT_RAG_CONFIG.dedupeEnabled,
    dedupeSimilarity:
      existingKnowledgeBaseConfig.dedupeSimilarity ?? DEFAULT_RAG_CONFIG.dedupeSimilarity,
    mmrEnabled:
      existingKnowledgeBaseConfig.mmrEnabled ?? DEFAULT_RAG_CONFIG.mmrEnabled,
    mmrLambda:
      existingKnowledgeBaseConfig.mmrLambda ?? DEFAULT_RAG_CONFIG.mmrLambda,
    rerankEnabled:
      existingKnowledgeBaseConfig.rerankEnabled ?? DEFAULT_RAG_CONFIG.rerankEnabled,
    rerankModel:
      existingKnowledgeBaseConfig.rerankModel ?? DEFAULT_RAG_CONFIG.rerankModel,
    rerankTopN:
      existingKnowledgeBaseConfig.rerankTopN ?? DEFAULT_RAG_CONFIG.rerankTopN,
    confidenceThreshold:
      existingKnowledgeBaseConfig.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
    queryRewriteEnabled:
      existingKnowledgeBaseConfig.queryRewriteEnabled ?? DEFAULT_RAG_CONFIG.queryRewriteEnabled,
    answerValidationEnabled:
      existingKnowledgeBaseConfig.answerValidationEnabled ?? DEFAULT_RAG_CONFIG.answerValidationEnabled,
    hnswEfSearch:
      existingKnowledgeBaseConfig.hnswEfSearch ?? DEFAULT_RAG_CONFIG.hnswEfSearch,
  };

  return {
    ...input,
    enableTaskFollowUpMessage: input.enableTaskFollowUpMessage !== false,
    provider,
    model: input.model ?? options?.defaultModel ?? getAiAssistantDefaultModel(provider),
    credentialSource: input.credentialSource ?? 'auto',
    timezone: typeof input.timezone === 'string' ? input.timezone.trim() : '',
    historyLimit: input.historyLimit ?? AI_ASSISTANT_DEFAULT_HISTORY_LIMIT,
    aiVariables: normalizeAiAssistantVariables(input.aiVariables),
    customFieldBindings: normalizeAiAssistantCustomFieldBindings(input.customFieldBindings),
    taskGroups: input.taskGroups ?? [],
    knowledgeBaseConfig,
    vectorDatabase,
    elevenLabsModel: normalizeElevenLabsModel(input.elevenLabsModel),
    assignmentStrategy: normalizeAssignmentStrategyForDisplay(input.assignmentStrategy),
    localDentalProviderDetailsSharingEnabled:
      input.localDentalProviderDetailsSharingEnabled !== false,
    localDentalServiceDetailsSharingEnabled:
      input.localDentalServiceDetailsSharingEnabled !== false,
    localDentalSingleSlotOfferingEnabled:
      input.localDentalSingleSlotOfferingEnabled === true,
    erpCatalogPriceSharingEnabled: input.erpCatalogPriceSharingEnabled !== false,
    erpPriceInquiryResponse:
      typeof input.erpPriceInquiryResponse === 'string' && input.erpPriceInquiryResponse.trim() !== ''
        ? input.erpPriceInquiryResponse
        : ERP_PRICE_INQUIRY_RESPONSE_DEFAULT,
    erpProductImageSendWhen: normalizeErpProductImageSendWhen(input.erpProductImageSendWhen),
    erpProductImageMultiMatchMode: normalizeErpProductImageMultiMatchMode(
      input.erpProductImageMultiMatchMode
    ),
    erpProductImageMaxPerProduct: normalizeErpProductImageMaxPerProduct(
      input.erpProductImageMaxPerProduct
    ),
    erpProductImageCaptionMode: normalizeErpProductImageCaptionMode(
      input.erpProductImageCaptionMode
    ),
  };
}
