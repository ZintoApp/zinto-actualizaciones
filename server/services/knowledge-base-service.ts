import { db } from '../db';
import {
  knowledgeBaseDocuments,
  knowledgeBaseChunks,
  knowledgeBaseConfigs,
  knowledgeBaseDocumentNodes,
  knowledgeBaseUsage,
  flows,
  type KnowledgeBaseDocument,
  type KnowledgeBaseChunk,
  type KnowledgeBaseConfig,
  type InsertKnowledgeBaseDocument,
  type InsertKnowledgeBaseConfig,
  type InsertKnowledgeBaseUsage
} from '../../shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { embedMany, tool, jsonSchema, generateText, Output, type Tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TextDocumentProcessor } from './document-processors/text-processor';
import { detectDocumentFormat } from './document-processors/document-format';
import { chunkDocument, estimateTokens as sharedEstimateTokens } from './document-processors/structure-aware-chunker';
import { aiCredentialsService, azureConnectionFromCredentialSource } from './ai-credentials-service';
import { createAzureAiSdkProvider } from './azure-openai';
import {
  classifyAzureDeployment,
  isCompatibleAzureEmbeddingModel,
  type AzureConnectionConfig,
} from '@shared/ai-providers';
import { pineconeService } from './pinecone-service';
import { pgVectorService } from './pgvector-service';
import { lexicalSearchChunks } from './lexical-search';
import {
  applyMmr,
  computeConfidence,
  cosineSimilarity,
  dedupeNearDuplicates,
} from './rag-precision';
import type { VectorStore, VectorStoreRecord } from './vector-store';
import {
  getCachedNodeCredentialConfig,
  setCachedNodeCredentialConfig,
  getCachedNodeKbSettings,
  setCachedNodeKbSettings,
  invalidateNodeCredentialCache,
  setNodeKbProviderHealth,
  getNodeKbProviderHealth,
} from './node-config-cache';
import {
  CONTEXT_TEMPLATE,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_RAG_CONFIG,
  EMBEDDING_DIMENSIONS,
  RAG_CHUNK_DEFAULTS,
  clampHnswEfSearch,
  computeAdaptiveChunkParams,
  isDefaultContextTemplate,
  normalizeEmbeddingModel,
  QUERY_REWRITE_MAX_EXPANSIONS,
  QUERY_REWRITE_TIMEOUT_MS,
  RERANK_MAX_CANDIDATES,
  RERANK_SNIPPET_CHARS,
  RERANK_TIMEOUT_MS,
  ANSWER_VALIDATION_TIMEOUT_MS,
  type VectorDatabaseProvider,
} from '../../shared/rag-defaults';

interface DocumentChunk {
  content: string;
  index: number;
  startPosition: number;
  endPosition: number;
  tokenCount: number;
  recordId?: string;
  sectionLabel?: string;
  language?: string;
  contentHash?: string;
}

interface RetrievalResult {
  chunk: KnowledgeBaseChunk;
  similarity: number;
  document: KnowledgeBaseDocument;
  fusedScore?: number;
  denseScore?: number;
  lexicalScore?: number;
  denseRank?: number;
  lexicalRank?: number;
  rerankScore?: number;
  rerankRank?: number;
  mmrScore?: number;
}

interface RankedChunkMatch {
  chunkId: number;
  score: number;
}

interface FusedChunkMatch {
  chunkId: number;
  fusedScore: number;
  denseScore?: number;
  lexicalScore?: number;
  denseRank?: number;
  lexicalRank?: number;
}

const KB_CONTEXT_SEPARATOR = '\n\n---\n\n';

function formatChunkForContext(result: RetrievalResult, ordinal: number): string {
  const source = result.chunk.sourceDocumentName ?? result.document.originalName ?? 'Unknown source';
  const metaParts: string[] = [];
  if (result.chunk.recordId) {
    metaParts.push(`recordId: ${result.chunk.recordId}`);
  }
  if (result.chunk.sectionLabel) {
    metaParts.push(`sectionLabel: ${result.chunk.sectionLabel}`);
  }
  const metaSuffix = metaParts.length > 0 ? ` (${metaParts.join(', ')})` : '';
  return `[S${ordinal}] ${source}${metaSuffix}\n${result.chunk.content}`;
}

function reciprocalRankFusion(
  denseMatches: RankedChunkMatch[],
  lexicalMatches: RankedChunkMatch[],
  opts: { rrfK: number; denseWeight: number; lexicalWeight: number }
): FusedChunkMatch[] {
  const { rrfK, denseWeight, lexicalWeight } = opts;
  const fused = new Map<number, FusedChunkMatch>();

  denseMatches.forEach((match, index) => {
    const rank = index + 1;
    const contribution = denseWeight / (rrfK + rank);
    const existing = fused.get(match.chunkId);
    if (existing) {
      existing.fusedScore += contribution;
      existing.denseScore = match.score;
      existing.denseRank = rank;
    } else {
      fused.set(match.chunkId, {
        chunkId: match.chunkId,
        fusedScore: contribution,
        denseScore: match.score,
        denseRank: rank,
      });
    }
  });

  lexicalMatches.forEach((match, index) => {
    const rank = index + 1;
    const contribution = lexicalWeight / (rrfK + rank);
    const existing = fused.get(match.chunkId);
    if (existing) {
      existing.fusedScore += contribution;
      existing.lexicalScore = match.score;
      existing.lexicalRank = rank;
    } else {
      fused.set(match.chunkId, {
        chunkId: match.chunkId,
        fusedScore: contribution,
        lexicalScore: match.score,
        lexicalRank: rank,
      });
    }
  });

  return [...fused.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

function mergeFusedAcrossQueries(perQueryFused: FusedChunkMatch[][]): FusedChunkMatch[] {
  if (perQueryFused.length === 0) {
    return [];
  }
  if (perQueryFused.length === 1) {
    return perQueryFused[0];
  }

  const merged = new Map<number, FusedChunkMatch>();
  for (const fusedList of perQueryFused) {
    for (const entry of fusedList) {
      const existing = merged.get(entry.chunkId);
      if (existing) {
        existing.fusedScore += entry.fusedScore;
        if (entry.denseScore !== undefined) {
          existing.denseScore =
            existing.denseScore !== undefined
              ? Math.max(existing.denseScore, entry.denseScore)
              : entry.denseScore;
        }
        if (entry.lexicalScore !== undefined) {
          existing.lexicalScore =
            existing.lexicalScore !== undefined
              ? Math.max(existing.lexicalScore, entry.lexicalScore)
              : entry.lexicalScore;
        }
        if (entry.denseRank !== undefined) {
          existing.denseRank =
            existing.denseRank !== undefined
              ? Math.min(existing.denseRank, entry.denseRank)
              : entry.denseRank;
        }
        if (entry.lexicalRank !== undefined) {
          existing.lexicalRank =
            existing.lexicalRank !== undefined
              ? Math.min(existing.lexicalRank, entry.lexicalRank)
              : entry.lexicalRank;
        }
      } else {
        merged.set(entry.chunkId, { ...entry });
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

function uniqueNonEmpty(strings: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of strings) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export const KNOWLEDGE_BASE_RETRIEVAL_TOOL_NAME = 'retrieve_knowledge_base';

export interface ContextEnhancementResult {
  enhancedPrompt: string;
  contextUsed: string[];
  /** When contextPosition is 'before_user', contains formatted context to inject before the current user turn only */
  userMessageContext?: string;
  /** Template-wrapped KB context for model-facing tool payloads (single copy). */
  modelContext?: string;
  retrievalStats: {
    chunksRetrieved: number;
    chunksUsed: number;
    averageSimilarity: number;
    retrievalDurationMs: number;
    confidence: number;
    confidenceThreshold: number;
    precisionStats: RagPrecisionStats;
  };
  /** Set when RAG was explicitly disabled due to vector provider setup failure */
  providerSetupError?: string;
  ragDisabledForTurn?: boolean;
}

export type EffectiveRagConfig = {
  enabled: boolean;
  maxRetrievedChunks: number;
  similarityThreshold: number;
  contextPosition: 'before_system' | 'after_system' | 'before_user';
  contextTemplate: string;
  embeddingModel: string;
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
  source: 'db' | 'flow' | 'default';
};

export interface KnowledgeBaseRetrievalToolOptions {
  companyId: number;
  nodeId: string;
  maxContextTokens?: number;
  turnBudgetTracker?: KnowledgeBaseTurnBudgetTracker;
  historyText?: string;
  /** When set, skips per-call resolveEffectiveRagConfig on the hot retrieval path. */
  effectiveRagConfig?: EffectiveRagConfig;
  /** Shared id linking prime and follow-up retrieval usage rows within one assistant turn. */
  turnCorrelationId?: string;
}

export interface KnowledgeBaseTurnBudgetTracker {
  isExhausted(): boolean;
  recordContextTokens(tokens: number): void;
}

export function createKnowledgeBaseTurnBudgetTracker(cap: number): KnowledgeBaseTurnBudgetTracker {
  let cumulativeTokens = 0;
  return {
    isExhausted: () => cumulativeTokens >= cap,
    recordContextTokens(tokens: number) {
      cumulativeTokens += tokens;
    },
  };
}

export interface KnowledgeBaseRetrievalToolExecuteResult {
  ok: boolean;
  chunksRetrieved: number;
  chunksUsed: number;
  averageSimilarity: number;
  contextUsed: string[];
  formattedContext: string;
  enhancedPrompt?: string;
  userMessageContext?: string;
  /** Template-wrapped context suitable for a single model-facing tool payload field. */
  modelContext?: string;
  confidence?: number;
  confidenceThreshold?: number;
  precisionStats?: RagPrecisionStats;
  error?: string;
  usageId?: number;
}

/** Slim tool payload returned to the model — avoids duplicating prompt injection fields. */
export interface KnowledgeBaseRetrievalToolModelResult {
  ok: boolean;
  chunksRetrieved: number;
  chunksUsed: number;
  averageSimilarity: number;
  context?: string;
  budgetExhausted?: boolean;
  error?: string;
}

export function formatKnowledgeBaseToolResultForModel(
  result: KnowledgeBaseRetrievalToolExecuteResult
): KnowledgeBaseRetrievalToolModelResult {
  const modelResult: KnowledgeBaseRetrievalToolModelResult = {
    ok: result.ok,
    chunksRetrieved: result.chunksRetrieved,
    chunksUsed: result.chunksUsed,
    averageSimilarity: result.averageSimilarity,
  };
  if (result.error) {
    modelResult.error = result.error;
  }
  if (result.modelContext) {
    modelResult.context = result.modelContext;
  }
  return modelResult;
}

export interface KnowledgeBaseRetrievalToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: {
      query: {
        type: 'string';
        description: string;
      };
    };
    required: ['query'];
  };
}

type EmbeddingProviderName = 'openai' | 'openrouter' | 'azure';
type OpenAiSdkProvider = ReturnType<typeof createOpenAI> | ReturnType<typeof createAzure>;

/** AI SDK embedding runtime resolved per company/node credential context. */
interface RagEmbeddingRuntime {
  provider: OpenAiSdkProvider;
  providerName: EmbeddingProviderName;
  modelId: string;
  embeddingModel: string;
}

/** AI SDK chat runtime for listwise reranking. */
interface RagRerankRuntime {
  provider: OpenAiSdkProvider;
  providerName: EmbeddingProviderName;
  modelId: string;
}

export interface RagPrecisionStats {
  candidateCount: number;
  dedupedCount: number;
  dedupeCollapsed: number;
  mmrApplied: boolean;
  rerankApplied: boolean;
  rerankDurationMs: number;
  topRerankScore: number;
  rerankMargin: number;
}

interface RagQueryUnderstanding {
  searchQuery: string;
  expansionQueries: string[];
}

const ZERO_RAG_STAGE_TELEMETRY = {
  denseCandidateCount: 0,
  lexicalCandidateCount: 0,
  fusedCandidateCount: 0,
  denseDurationMs: 0,
  lexicalDurationMs: 0,
} as const;

function buildChunkTelemetry(results: RetrievalResult[]): Array<{
  chunkId: number;
  denseScore?: number;
  lexicalScore?: number;
  fusedScore?: number;
  rerankScore?: number;
  denseRank?: number;
  lexicalRank?: number;
  mmrScore?: number;
}> {
  return results.map(r => ({
    chunkId: r.chunk.id,
    denseScore: r.denseScore,
    lexicalScore: r.lexicalScore,
    fusedScore: r.fusedScore,
    rerankScore: r.rerankScore,
    denseRank: r.denseRank,
    lexicalRank: r.lexicalRank,
    mmrScore: r.mmrScore,
  }));
}

function buildUsageTelemetryFromOutcome(
  outcome: RagRetrievalRuntimeResult,
  results: RetrievalResult[],
  base: Pick<
    InsertKnowledgeBaseUsage,
    | 'companyId'
    | 'nodeId'
    | 'queryText'
    | 'queryEmbedding'
    | 'chunksRetrieved'
    | 'chunksUsed'
    | 'similarityScores'
    | 'retrievalDurationMs'
    | 'embeddingDurationMs'
    | 'contextInjected'
    | 'contextLength'
    | 'turnCorrelationId'
  >
): InsertKnowledgeBaseUsage {
  const ps = outcome.precisionStats;
  return {
    ...base,
    confidence: outcome.confidence,
    confidenceThreshold: outcome.confidenceThreshold,
    denseCandidateCount: outcome.denseCandidateCount,
    lexicalCandidateCount: outcome.lexicalCandidateCount,
    fusedCandidateCount: outcome.fusedCandidateCount,
    dedupedCount: ps.dedupedCount,
    dedupeCollapsed: ps.dedupeCollapsed,
    mmrApplied: ps.mmrApplied,
    rerankApplied: ps.rerankApplied,
    topRerankScore: ps.topRerankScore,
    rerankMargin: ps.rerankMargin,
    queryRewriteApplied: outcome.queryRewriteApplied,
    rewrittenQuery: outcome.rewrittenQuery,
    expansionQueryCount: outcome.expansionQueryCount,
    queryRewriteDurationMs: outcome.queryRewriteDurationMs,
    denseDurationMs: outcome.denseDurationMs,
    lexicalDurationMs: outcome.lexicalDurationMs,
    rerankDurationMs: ps.rerankDurationMs,
    chunkTelemetry: buildChunkTelemetry(results),
  };
}

const ZERO_PRECISION_STATS: RagPrecisionStats = {
  candidateCount: 0,
  dedupedCount: 0,
  dedupeCollapsed: 0,
  mmrApplied: false,
  rerankApplied: false,
  rerankDurationMs: 0,
  topRerankScore: 0,
  rerankMargin: 0,
};

/** Internal RAG retrieval request — not exposed through assistant functionCalls. */
interface RagRetrievalRuntimeRequest {
  companyId: number;
  nodeId: string;
  query: string;
  historyText?: string;
  effectiveRagConfig?: EffectiveRagConfig;
}

/** Internal RAG retrieval outcome consumed by retrieveContext and enhancePromptWithContext pre-injection. */
interface RagRetrievalRuntimeResult {
  results: RetrievalResult[];
  queryEmbedding: number[];
  embeddingDurationMs: number;
  retrievalDurationMs: number;
  confidence: number;
  confidenceThreshold: number;
  precisionStats: RagPrecisionStats;
  queryRewriteApplied?: boolean;
  rewrittenQuery?: string;
  expansionQueryCount?: number;
  queryRewriteDurationMs?: number;
  denseCandidateCount: number;
  lexicalCandidateCount: number;
  fusedCandidateCount: number;
  denseDurationMs: number;
  lexicalDurationMs: number;
}

export interface KnowledgeBaseDocumentDeleteResult {
  vectorCleanupWarnings: string[];
}

const NO_EXTRACTABLE_TEXT_ERROR =
  'No extractable text was found in this document. Scanned or image-only PDFs require OCR.';

interface FlowNodeKnowledgeBaseSettings {
  knowledgeBaseEnabled?: boolean;
  knowledgeBaseConfig?: {
    maxRetrievedChunks?: number;
    similarityThreshold?: number;
    contextPosition?: 'before_system' | 'after_system' | 'before_user';
    contextTemplate?: string;
    embeddingModel?: string;
    vectorDatabase?: VectorDatabaseProvider | null;
    hybridEnabled?: boolean;
    denseTopK?: number;
    lexicalTopK?: number;
    rrfK?: number;
    denseWeight?: number;
    lexicalWeight?: number;
    candidatePoolSize?: number;
    dedupeEnabled?: boolean;
    dedupeSimilarity?: number;
    mmrEnabled?: boolean;
    mmrLambda?: number;
    rerankEnabled?: boolean;
    rerankModel?: string;
    rerankTopN?: number;
    confidenceThreshold?: number;
    queryRewriteEnabled?: boolean;
    answerValidationEnabled?: boolean;
    hnswEfSearch?: number;
  };
  topLevelVectorDatabase?: VectorDatabaseProvider | null;
  hasLegacyPinecone?: boolean;
}

/**
 * Knowledge Base Service
 * Handles document processing, embedding generation, and RAG retrieval
 */
export class KnowledgeBaseService {
  constructor() {

  }

  private normalizeVectorDatabaseProvider(value: unknown): VectorDatabaseProvider | null {
    if (value === 'pinecone' || value === 'pgvector') {
      return value;
    }
    return null;
  }

  private hasLegacyPineconeConfig(nodeData: Record<string, unknown>): boolean {
    const apiKey = nodeData.pineconeApiKey;
    return typeof apiKey === 'string' && apiKey.trim().length > 0;
  }

  private getMissingProviderErrorMessage(): string {
    return 'No vector database selected. Choose Pinecone or pgvector in the AI Assistant node Knowledge Base settings.';
  }

  /**
   * Throws when Knowledge Base is enabled but no vector database provider is selected.
   */
  private async requireConfiguredVectorDatabase(companyId: number, nodeId: string): Promise<void> {
    const config = await this.resolveEffectiveRagConfig(companyId, nodeId);
    if (!config.enabled) {
      return;
    }
    if (config.vectorDatabase === null) {
      throw new Error(this.getMissingProviderErrorMessage());
    }
  }

  private async requireConfiguredVectorDatabaseForNodes(
    companyId: number,
    nodeIds: string[]
  ): Promise<void> {
    const uniqueNodeIds = [...new Set(nodeIds.filter(id => id.length > 0))];
    for (const nodeId of uniqueNodeIds) {
      await this.requireConfiguredVectorDatabase(companyId, nodeId);
    }
  }

  private resolveVectorDatabase(params: {
    dbVectorDatabase?: VectorDatabaseProvider | null;
    dbVectorDatabaseAuthoritative?: boolean;
    flowSettings?: FlowNodeKnowledgeBaseSettings | null;
  }): VectorDatabaseProvider | null {
    if (params.dbVectorDatabaseAuthoritative) {
      return this.normalizeVectorDatabaseProvider(params.dbVectorDatabase);
    }

    const fromDb = this.normalizeVectorDatabaseProvider(params.dbVectorDatabase);
    if (fromDb) {
      return fromDb;
    }

    const flowKbConfig = params.flowSettings?.knowledgeBaseConfig;
    const fromFlowKb = this.normalizeVectorDatabaseProvider(flowKbConfig?.vectorDatabase);
    if (fromFlowKb) {
      return fromFlowKb;
    }

    const fromTopLevel = this.normalizeVectorDatabaseProvider(params.flowSettings?.topLevelVectorDatabase);
    if (fromTopLevel) {
      return fromTopLevel;
    }

    if (params.flowSettings?.hasLegacyPinecone) {
      return 'pinecone';
    }

    return null;
  }

  private isProviderSetupError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message;
    return (
      message.includes('Choose Pinecone or pgvector') ||
      message.includes('No vector database selected') ||
      message.includes('Pinecone API Key') ||
      message.includes('pgvector') ||
      message.includes('knowledge_base_vectors') ||
      message.includes('vector extension')
    );
  }

  private parseFlowNodes(flowNodes: unknown): Array<{ id?: string; type?: string; data?: Record<string, unknown> }> | undefined {
    if (!flowNodes) {
      return undefined;
    }

    if (typeof flowNodes === 'string') {
      try {
        const parsed = JSON.parse(flowNodes);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }

    return Array.isArray(flowNodes) ? flowNodes : undefined;
  }

  /**
   * Create AI SDK OpenAI provider for embeddings (OpenRouter uses baseURL override).
   */
  private createEmbeddingProvider(
    provider: EmbeddingProviderName,
    apiKey: string,
    azure?: AzureConnectionConfig | null
  ): OpenAiSdkProvider {
    if (provider === 'azure') {
      if (!azure) {
        throw new Error('Azure OpenAI endpoint is required for embeddings. Configure Azure credentials in AI settings.');
      }
      return createAzureAiSdkProvider(azure);
    }
    if (provider === 'openrouter') {
      return createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://bothive.pro',
          'X-Title': 'BotHive'
        }
      });
    }
    return createOpenAI({ apiKey });
  }

  /**
   * Get embedding model id for the given provider (OpenRouter uses openai/ prefix).
   */
  private getEmbeddingModelId(provider: EmbeddingProviderName, embeddingModel: string): string {
    if (provider === 'azure') {
      return embeddingModel;
    }
    const normalized = normalizeEmbeddingModel(embeddingModel);
    return provider === 'openrouter' ? `openai/${normalized}` : normalized;
  }

  private getEmbeddingProviderOptions(
    embeddingModel: string,
    providerName?: EmbeddingProviderName
  ): { openai: { dimensions: number } } | undefined {
    if (providerName === 'azure') {
      return { openai: { dimensions: EMBEDDING_DIMENSIONS } };
    }
    if (normalizeEmbeddingModel(embeddingModel) === 'text-embedding-3-large') {
      return { openai: { dimensions: EMBEDDING_DIMENSIONS } };
    }
    return undefined;
  }

  /**
   * Get chat model id for the given provider (OpenRouter uses openai/ prefix when id has no slash).
   */
  private getChatModelId(provider: EmbeddingProviderName, model: string): string {
    if (provider === 'openrouter' && !model.includes('/')) {
      return `openai/${model}`;
    }
    return model;
  }

  private toEmbeddingProviderName(provider: string | null | undefined): EmbeddingProviderName {
    if (provider === 'openrouter' || provider === 'azure') {
      return provider;
    }
    return 'openai';
  }

  /**
   * Resolve OpenAI SDK provider credentials for a company/node (shared by embedding and rerank).
   */
  private async resolveOpenAiProviderCredentials(
    companyId: number,
    nodeId: string
  ): Promise<{ provider: OpenAiSdkProvider; providerName: EmbeddingProviderName }> {
    try {
      if (nodeId === 'fallback' || !nodeId) {
        const prefs = await aiCredentialsService.getCompanyPreferences(companyId);
        const preferred = this.toEmbeddingProviderName(prefs?.defaultProvider);
        const preferredCredential = await aiCredentialsService.getCredentialForCompany(companyId, preferred);
        if (preferred === 'azure') {
          const azure = azureConnectionFromCredentialSource(preferredCredential);
          if (!azure) {
            throw new Error('Azure OpenAI credentials are not configured. Add an Azure credential in AI settings, including an embedding-capable deployment for knowledge base.');
          }
          return {
            provider: this.createEmbeddingProvider('azure', azure.apiKey, azure),
            providerName: 'azure',
          };
        }
        if (preferredCredential) {
          return {
            provider: this.createEmbeddingProvider(preferred, preferredCredential.apiKey),
            providerName: preferred,
          };
        }
        const credentialSource = await aiCredentialsService.getCredentialForCompany(companyId, 'openai');
        if (!credentialSource) {
          const openrouterCredential = await aiCredentialsService.getCredentialForCompany(companyId, 'openrouter');
          if (!openrouterCredential) {
            throw new Error('No AI provider credentials configured. Please configure OpenAI, OpenRouter, or Azure credentials in the AI settings.');
          }
          return {
            provider: this.createEmbeddingProvider('openrouter', openrouterCredential.apiKey),
            providerName: 'openrouter',
          };
        }
        return {
          provider: this.createEmbeddingProvider('openai', credentialSource.apiKey),
          providerName: 'openai',
        };
      }

      const nodeConfig = await this.getNodeCredentialConfig(companyId, nodeId);
      const providerName = this.toEmbeddingProviderName(nodeConfig?.provider);

      if (providerName === 'azure') {
        if (nodeConfig?.credentialSource === 'manual' && nodeConfig.apiKey) {
          if (!nodeConfig.azureEndpoint) {
            throw new Error('Azure OpenAI endpoint is required on the node when using a manual Azure key for knowledge base embeddings.');
          }
          const azure: AzureConnectionConfig = {
            apiKey: nodeConfig.apiKey,
            endpoint: nodeConfig.azureEndpoint,
            apiVersion: nodeConfig.azureApiVersion || '2024-10-21',
          };
          return {
            provider: this.createEmbeddingProvider('azure', azure.apiKey, azure),
            providerName: 'azure',
          };
        }
        const credentialSource = await aiCredentialsService.getCredentialWithPreference(
          companyId,
          'azure',
          (nodeConfig?.credentialSource || 'auto') as 'company' | 'system' | 'auto'
        );
        const azure = azureConnectionFromCredentialSource(credentialSource);
        if (!azure) {
          throw new Error('Azure OpenAI credentials are not configured. Knowledge base embeddings cannot fall back to OpenAI because that would mix vector spaces.');
        }
        return {
          provider: this.createEmbeddingProvider('azure', azure.apiKey, azure),
          providerName: 'azure',
        };
      }

      if (nodeConfig && nodeConfig.credentialSource === 'manual' && nodeConfig.apiKey) {
        return {
          provider: this.createEmbeddingProvider(providerName, nodeConfig.apiKey),
          providerName,
        };
      }

      if (providerName === 'openrouter') {
        const credentialSource = await aiCredentialsService.getCredentialForCompany(companyId, 'openrouter');
        if (!credentialSource) {
          const openaiCredential = await aiCredentialsService.getCredentialForCompany(companyId, 'openai');
          if (!openaiCredential) {
            throw new Error('OpenRouter API key not configured. Please set up OpenRouter credentials in the AI settings or configure an OpenAI key for embeddings.');
          }
          return {
            provider: this.createEmbeddingProvider('openai', openaiCredential.apiKey),
            providerName: 'openai',
          };
        }
        return {
          provider: this.createEmbeddingProvider(providerName, credentialSource.apiKey),
          providerName,
        };
      }

      const credentialPreference = nodeConfig?.credentialSource || 'auto';
      const credentialSource = await aiCredentialsService.getCredentialWithPreference(
        companyId,
        'openai',
        credentialPreference as 'company' | 'system' | 'auto'
      );

      if (!credentialSource) {
        throw new Error('No OpenAI API key configured. Please configure OpenAI credentials in the AI settings or set a manual API key in the AI Assistant node.');
      }

      return {
        provider: this.createEmbeddingProvider('openai', credentialSource.apiKey),
        providerName: 'openai',
      };
    } catch (error) {
      console.error('Failed to get AI provider credentials:', error);
      if (error instanceof Error && (
        error.message.includes('OpenRouter') ||
        error.message.includes('Azure') ||
        error.message.includes('No OpenAI') ||
        error.message.includes('No AI provider')
      )) {
        throw error;
      }
      throw new Error('No AI provider credentials configured. Please configure OpenAI, OpenRouter, or Azure credentials in the AI settings.');
    }
  }

  /**
   * Resolve AI SDK embedding runtime for a company/node.
   * Supports both OpenAI and OpenRouter providers for embedding generation.
   */
  private async resolveEmbeddingRuntime(companyId: number, nodeId: string): Promise<RagEmbeddingRuntime> {
    const ragConfig = await this.resolveEffectiveRagConfig(companyId, nodeId);
    const { provider, providerName } = await this.resolveOpenAiProviderCredentials(companyId, nodeId);
    const embeddingModel = providerName === 'azure'
      ? (ragConfig.embeddingModel || '')
      : normalizeEmbeddingModel(ragConfig.embeddingModel);
    if (providerName === 'azure' && !embeddingModel) {
      throw new Error('No Azure embedding deployment selected. Pick an embedding deployment in the knowledge base settings.');
    }
    if (providerName === 'azure') {
      const kind = classifyAzureDeployment(embeddingModel);
      if (kind === 'other') {
        throw new Error('The selected Azure deployment is not an embedding model. Choose a text-embedding deployment (1536 dimensions).');
      }
      if (kind === 'embedding' && !isCompatibleAzureEmbeddingModel(embeddingModel)) {
        throw new Error('Azure embedding deployments must be text-embedding-3-large, text-embedding-3-small, or text-embedding-ada-002 so vectors stay at 1536 dimensions.');
      }
    }

    return {
      provider,
      providerName,
      modelId: this.getEmbeddingModelId(providerName, embeddingModel),
      embeddingModel,
    };
  }

  /**
   * Resolve AI SDK chat runtime for listwise reranking.
   */
  private async resolveRerankRuntime(
    companyId: number,
    nodeId: string,
    rerankModel: string
  ): Promise<RagRerankRuntime> {
    const { provider, providerName } = await this.resolveOpenAiProviderCredentials(companyId, nodeId);
    return {
      provider,
      providerName,
      modelId: this.getChatModelId(providerName, rerankModel),
    };
  }

  /**
   * AI SDK batch query embedding primitive for multi-query RAG retrieval.
   */
  private async ragGenerateQueryEmbeddings(
    runtime: RagEmbeddingRuntime,
    queries: string[]
  ): Promise<number[][]> {
    if (queries.length === 0) {
      return [];
    }
    const providerOptions = this.getEmbeddingProviderOptions(runtime.embeddingModel, runtime.providerName);
    const { embeddings } = await embedMany({
      model: runtime.provider.embedding(runtime.modelId),
      values: queries,
      ...(providerOptions ? { providerOptions } : {}),
    });
    return embeddings;
  }

  /**
   * AI SDK batch document embedding primitive for knowledge-base ingestion.
   */
  private async ragGenerateDocumentEmbeddings(
    runtime: RagEmbeddingRuntime,
    chunks: DocumentChunk[]
  ): Promise<(DocumentChunk & { embedding: number[] })[]> {
    const batchSize = 100;
    const results: (DocumentChunk & { embedding: number[] })[] = [];
    console.log(
      `[Knowledge Base] Generating embeddings using provider: ${runtime.providerName}, model: ${runtime.modelId}`
    );

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const providerOptions = this.getEmbeddingProviderOptions(runtime.embeddingModel, runtime.providerName);
      const { embeddings } = await embedMany({
        model: runtime.provider.embedding(runtime.modelId),
        values: batch.map(chunk => chunk.content),
        ...(providerOptions ? { providerOptions } : {}),
      });

      batch.forEach((chunk, index) => {
        results.push({
          ...chunk,
          embedding: embeddings[index],
        });
      });
    }

    return results;
  }

  /**
   * Listwise LLM rerank of candidate chunks. Returns null on error/timeout (caller keeps MMR order).
   */
  private async rerankCandidatesWithLlm(
    runtime: RagRerankRuntime,
    query: string,
    candidates: RetrievalResult[]
  ): Promise<RetrievalResult[] | null> {
    const capped = candidates.slice(0, RERANK_MAX_CANDIDATES);
    if (capped.length === 0) {
      return [];
    }

    const candidateLines = capped
      .map((candidate, index) => {
        const snippet = candidate.chunk.content.slice(0, RERANK_SNIPPET_CHARS);
        return `[S${index + 1}] id=${candidate.chunk.id}: ${snippet}`;
      })
      .join('\n');

    const rerankSchema = z.object({
      ranking: z.array(z.object({ id: z.number(), score: z.number() })),
    });

    try {
      const { output: object } = await generateText({
        model: runtime.provider(runtime.modelId),
        output: Output.object({ schema: rerankSchema }),
        abortSignal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
        maxRetries: 0,
        prompt:
          'You are a relevance reranker. Score each candidate snippet between 0 and 1 by relevance to the query. ' +
          'Rank irrelevant candidates low. Return a ranking entry for every candidate id listed below.\n\n' +
          `Query: ${query}\n\nCandidates:\n${candidateLines}`,
      });

      if (!object) {
        return null;
      }

      const byId = new Map(capped.map(candidate => [candidate.chunk.id, candidate]));
      const ordered: RetrievalResult[] = [];
      const seen = new Set<number>();

      object.ranking.forEach((entry, rank) => {
        const candidate = byId.get(entry.id);
        if (candidate && !seen.has(entry.id)) {
          seen.add(entry.id);
          ordered.push({
            ...candidate,
            rerankScore: entry.score,
            rerankRank: rank + 1,
          });
        }
      });

      for (const candidate of capped) {
        if (!seen.has(candidate.chunk.id)) {
          ordered.push({
            ...candidate,
            rerankScore: 0,
            rerankRank: ordered.length + 1,
          });
        }
      }

      return ordered;
    } catch (error) {
      console.error('Rerank LLM failed:', error);
      return null;
    }
  }

  /**
   * Post-generation grounding check: verify every factual claim in the answer is supported by context chunks.
   * Returns null on error/timeout (fail-open); only explicit grounded:false should trigger downgrade.
   */
  async validateAnswerGrounding(
    companyId: number,
    nodeId: string,
    answer: string,
    contextChunks: string[],
    options?: { effectiveRagConfig?: EffectiveRagConfig }
  ): Promise<{ grounded: boolean; unsupportedClaims?: string[] } | null> {
    if (!answer.trim() || contextChunks.length === 0) {
      return null;
    }

    const config =
      options?.effectiveRagConfig ??
      (await this.resolveEffectiveRagConfig(companyId, nodeId));
    const validationSchema = z.object({
      grounded: z.boolean(),
      unsupportedClaims: z.array(z.string()).optional(),
    });

    const contextBlock = contextChunks
      .map((chunk, index) => `[S${index + 1}] ${chunk}`)
      .join('\n\n');

    try {
      const runtime = await this.resolveRerankRuntime(companyId, nodeId, config.rerankModel);
      const { output: object } = await generateText({
        model: runtime.provider(runtime.modelId),
        output: Output.object({ schema: validationSchema }),
        abortSignal: AbortSignal.timeout(ANSWER_VALIDATION_TIMEOUT_MS),
        maxRetries: 0,
        prompt:
          'You are a grounding validator. Given the knowledge base context chunks and an assistant answer, ' +
          'determine whether EVERY factual claim in the answer is directly supported by the context chunks. ' +
          'Paraphrasing is acceptable if meaning is preserved. Return grounded:false if any claim lacks support.\n\n' +
          `Context:\n${contextBlock}\n\nAssistant answer:\n${answer}`,
      });

      if (!object) {
        return null;
      }

      return object;
    } catch (error) {
      console.error('Answer grounding validation failed:', error);
      return null;
    }
  }

  /**
   * LLM query understanding: rewrite coreferences and optionally expand queries.
   * Returns null on error/timeout (caller falls back to raw query).
   */
  private async rewriteQueryWithLlm(
    runtime: RagRerankRuntime,
    rawQuery: string,
    historyText: string | undefined
  ): Promise<RagQueryUnderstanding | null> {
    const rewriteSchema = z.object({
      searchQuery: z.string(),
      expansionQueries: z.array(z.string()),
    });

    const historySection = historyText?.trim()
      ? `\n\nRecent conversation:\n${historyText}`
      : '';

    try {
      const { output: object } = await generateText({
        model: runtime.provider(runtime.modelId),
        output: Output.object({ schema: rewriteSchema }),
        abortSignal: AbortSignal.timeout(QUERY_REWRITE_TIMEOUT_MS),
        maxRetries: 0,
        prompt:
          'You are a query understanding assistant for a knowledge-base search system. ' +
          'Rewrite the user\'s latest message into a single standalone search query suitable for semantic and lexical retrieval. ' +
          'Resolve pronouns and references using the conversation history when provided. ' +
          'Preserve entities, numbers, dates, and key terms. ' +
          `Optionally provide up to ${QUERY_REWRITE_MAX_EXPANSIONS} alternative phrasings ` +
          '(including a translation to a likely knowledge-base language for multilingual content). ' +
          'Do NOT answer the question — output search queries only.\n\n' +
          `Latest user message: ${rawQuery}${historySection}`,
      });

      if (!object?.searchQuery?.trim()) {
        return null;
      }

      return {
        searchQuery: object.searchQuery.trim(),
        expansionQueries: object.expansionQueries
          .map(q => q.trim())
          .filter(q => q.length > 0)
          .slice(0, QUERY_REWRITE_MAX_EXPANSIONS),
      };
    } catch (error) {
      console.error('Query rewrite LLM failed:', error);
      return null;
    }
  }

  /**
   * Precision stage: dedupe → MMR → LLM rerank → confidence, trimming to rerankTopN.
   */
  private async runPrecisionPipeline(
    companyId: number,
    nodeId: string,
    query: string,
    queryEmbedding: number[],
    candidates: RetrievalResult[],
    config: {
      embeddingModel: string;
      dedupeEnabled: boolean;
      dedupeSimilarity: number;
      mmrEnabled: boolean;
      mmrLambda: number;
      rerankEnabled: boolean;
      rerankModel: string;
      rerankTopN: number;
    }
  ): Promise<{ results: RetrievalResult[]; confidence: number; precisionStats: RagPrecisionStats }> {
    const candidateCount = candidates.length;
    if (candidateCount === 0) {
      return { results: [], confidence: 0, precisionStats: { ...ZERO_PRECISION_STATS } };
    }

    let working = candidates;

    const chunkIds = candidates.map(candidate => candidate.chunk.id);
    const embeddingModel = normalizeEmbeddingModel(config.embeddingModel);
    let embeddingsByChunkId = new Map<number, number[]>();
    try {
      const vectorStore = await this.resolveVectorStore(companyId, nodeId);
      embeddingsByChunkId = await vectorStore.fetchVectorsByChunkIds(
        companyId,
        nodeId,
        chunkIds,
        embeddingModel
      );
    } catch (error) {
      console.error('Failed to fetch candidate embeddings for precision pipeline:', error);
    }

    let dedupeCollapsed = 0;
    if (config.dedupeEnabled) {
      const dedupeInput = working.map(candidate => ({
        chunkId: candidate.chunk.id,
        contentHash: candidate.chunk.contentHash,
      }));
      const { kept, collapsedCount } = dedupeNearDuplicates(
        dedupeInput,
        embeddingsByChunkId,
        config.dedupeSimilarity
      );
      dedupeCollapsed = collapsedCount;
      const byChunkId = new Map(working.map(candidate => [candidate.chunk.id, candidate]));
      working = kept
        .map(entry => byChunkId.get(entry.chunkId))
        .filter((candidate): candidate is RetrievalResult => candidate !== undefined);
    }

    const dedupedCount = working.length;
    let mmrApplied = false;
    if (config.mmrEnabled && working.length >= 2) {
      const mmrInput = working.map(candidate => ({
        chunkId: candidate.chunk.id,
        contentHash: candidate.chunk.contentHash,
      }));
      const mmrResult = applyMmr(mmrInput, embeddingsByChunkId, queryEmbedding, config.mmrLambda);
      const mmrScores = new Map(mmrResult.map(entry => [entry.chunkId, entry.mmrScore]));
      const byChunkId = new Map(working.map(candidate => [candidate.chunk.id, candidate]));
      working = mmrResult.reduce<RetrievalResult[]>((acc, entry) => {
        const candidate = byChunkId.get(entry.chunkId);
        if (candidate) {
          acc.push({ ...candidate, mmrScore: mmrScores.get(entry.chunkId) });
        }
        return acc;
      }, []);
      mmrApplied = true;
    }

    let rerankApplied = false;
    let rerankDurationMs = 0;
    let topRerankScore = 0;
    let rerankMargin = 0;

    if (config.rerankEnabled && working.length > 0) {
      const rerankStart = Date.now();
      try {
        const runtime = await this.resolveRerankRuntime(companyId, nodeId, config.rerankModel);
        const reranked = await this.rerankCandidatesWithLlm(runtime, query, working);
        rerankDurationMs = Date.now() - rerankStart;
        if (reranked) {
          rerankApplied = true;
          topRerankScore = reranked[0]?.rerankScore ?? 0;
          rerankMargin =
            reranked.length >= 2
              ? (reranked[0]?.rerankScore ?? 0) - (reranked[1]?.rerankScore ?? 0)
              : topRerankScore;
          working = reranked;
        }
      } catch (error) {
        rerankDurationMs = Date.now() - rerankStart;
        console.error('Precision pipeline rerank stage failed:', error);
      }
    }

    const trimmed = working.slice(0, config.rerankTopN);

    let topDenseCosine: number | undefined;
    for (const result of trimmed) {
      if (result.denseScore !== undefined) {
        topDenseCosine =
          topDenseCosine === undefined
            ? result.denseScore
            : Math.max(topDenseCosine, result.denseScore);
      }
    }
    if (topDenseCosine === undefined && trimmed.length > 0) {
      const topEmbedding = embeddingsByChunkId.get(trimmed[0].chunk.id);
      if (topEmbedding) {
        topDenseCosine = cosineSimilarity(queryEmbedding, topEmbedding);
      }
    }

    const confidence = computeConfidence({
      reranked: rerankApplied,
      topRerankScore: rerankApplied ? topRerankScore : undefined,
      secondRerankScore:
        rerankApplied && trimmed.length >= 2 ? trimmed[1].rerankScore : undefined,
      topDenseScore: topDenseCosine,
    });

    return {
      results: trimmed,
      confidence,
      precisionStats: {
        candidateCount,
        dedupedCount,
        dedupeCollapsed,
        mmrApplied,
        rerankApplied,
        rerankDurationMs,
        topRerankScore,
        rerankMargin,
      },
    };
  }

  /**
   * Internal RAG retrieval runtime: embed query, search vector store, hydrate chunks.
   * Used by retrieveContext(), the AI SDK retrieval tool, and enhancePromptWithContext().
   */
  private async executeRagRetrieval(
    request: RagRetrievalRuntimeRequest
  ): Promise<RagRetrievalRuntimeResult> {
    const startTime = Date.now();
    const { companyId, nodeId, query } = request;

    const config =
      request.effectiveRagConfig ??
      (await this.resolveEffectiveRagConfig(companyId, nodeId));
    if (!config.enabled) {
      return {
        results: [],
        queryEmbedding: [],
        embeddingDurationMs: 0,
        retrievalDurationMs: 0,
        confidence: 0,
        confidenceThreshold: config.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
        precisionStats: { ...ZERO_PRECISION_STATS },
        ...ZERO_RAG_STAGE_TELEMETRY,
      };
    }

    await this.requireConfiguredVectorDatabase(companyId, nodeId);

    const associatedDocs = await db.select({
      documentId: knowledgeBaseDocumentNodes.documentId,
      averageChunkTokens: knowledgeBaseDocuments.averageChunkTokens,
    })
      .from(knowledgeBaseDocumentNodes)
      .innerJoin(
        knowledgeBaseDocuments,
        eq(knowledgeBaseDocuments.id, knowledgeBaseDocumentNodes.documentId)
      )
      .where(and(
        eq(knowledgeBaseDocumentNodes.companyId, companyId),
        eq(knowledgeBaseDocumentNodes.nodeId, nodeId)
      ));

    if (associatedDocs.length === 0) {
      return {
        results: [],
        queryEmbedding: [],
        embeddingDurationMs: 0,
        retrievalDurationMs: Date.now() - startTime,
        confidence: 0,
        confidenceThreshold: config.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
        precisionStats: { ...ZERO_PRECISION_STATS },
        ...ZERO_RAG_STAGE_TELEMETRY,
      };
    }

    let queryRewriteApplied = false;
    let rewrittenQuery: string | undefined;
    let expansionQueryCount = 0;
    let queryRewriteDurationMs = 0;
    let queries: string[] = [query];

    if (config.queryRewriteEnabled && query.trim()) {
      const rewriteStart = Date.now();
      try {
        const rerankRuntime = await this.resolveRerankRuntime(companyId, nodeId, config.rerankModel);
        const understanding = await this.rewriteQueryWithLlm(rerankRuntime, query, request.historyText);
        queryRewriteDurationMs = Date.now() - rewriteStart;
        if (understanding) {
          queryRewriteApplied = true;
          rewrittenQuery = understanding.searchQuery;
          const expanded = uniqueNonEmpty([
            understanding.searchQuery,
            ...understanding.expansionQueries,
          ]).slice(0, 1 + QUERY_REWRITE_MAX_EXPANSIONS);
          queries = expanded.length > 0 ? expanded : [query];
          expansionQueryCount = Math.max(0, queries.length - 1);
        }
      } catch (error) {
        queryRewriteDurationMs = Date.now() - rewriteStart;
        console.error('Query rewrite failed:', error);
      }
    }

    const embeddingStart = Date.now();
    const embeddingRuntime = await this.resolveEmbeddingRuntime(companyId, nodeId);
    const embeddings = await this.ragGenerateQueryEmbeddings(embeddingRuntime, queries);
    const queryEmbedding = embeddings[0] ?? [];
    const embeddingDurationMs = Date.now() - embeddingStart;

    const documentIds = associatedDocs.map(doc => doc.documentId);

    const {
      hybridEnabled,
      denseTopK,
      lexicalTopK,
      rrfK,
      denseWeight,
      lexicalWeight,
      candidatePoolSize,
    } = config;
    const threshold = config.similarityThreshold ?? DEFAULT_RAG_CONFIG.similarityThreshold;
    const embeddingModel = normalizeEmbeddingModel(config.embeddingModel);
    const hnswEfSearch = config.hnswEfSearch ?? DEFAULT_RAG_CONFIG.hnswEfSearch;

    let denseCandidateCount = 0;
    let lexicalCandidateCount = 0;
    let denseDurationMs = 0;
    let lexicalDurationMs = 0;

    const perQueryResults = await Promise.all(
      queries.map(async (q, i) => {
        const qEmbedding = embeddings[i];
        if (!qEmbedding) {
          return null;
        }

        const denseStart = Date.now();
        const denseMatches = await this.performDenseMatch(
          companyId,
          nodeId,
          qEmbedding,
          documentIds,
          denseTopK,
          threshold,
          embeddingModel,
          hnswEfSearch
        );
        const denseElapsed = Date.now() - denseStart;

        let lexicalMatches: Awaited<ReturnType<typeof lexicalSearchChunks>>;
        let lexicalElapsed = 0;
        if (hybridEnabled) {
          const lexicalStart = Date.now();
          lexicalMatches = await lexicalSearchChunks({ companyId, documentIds, query: q, topK: lexicalTopK });
          lexicalElapsed = Date.now() - lexicalStart;
        } else {
          lexicalMatches = [];
        }

        if (i === 0) {
          denseCandidateCount = denseMatches.length;
          lexicalCandidateCount = lexicalMatches.length;
          denseDurationMs = denseElapsed;
          lexicalDurationMs = lexicalElapsed;
        }

        if (denseMatches.length === 0 && lexicalMatches.length === 0) {
          return null;
        }

        const fused: FusedChunkMatch[] = hybridEnabled
          ? reciprocalRankFusion(denseMatches, lexicalMatches, { rrfK, denseWeight, lexicalWeight })
          : denseMatches.map(match => ({
              chunkId: match.chunkId,
              fusedScore: match.score,
              denseScore: match.score,
            }));

        return fused;
      })
    );

    const perQueryFused = perQueryResults.filter((f): f is FusedChunkMatch[] => f !== null);

    if (perQueryFused.length === 0) {
      return {
        results: [],
        queryEmbedding,
        embeddingDurationMs,
        retrievalDurationMs: Date.now() - startTime,
        confidence: 0,
        confidenceThreshold: config.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
        precisionStats: { ...ZERO_PRECISION_STATS },
        queryRewriteApplied,
        rewrittenQuery,
        expansionQueryCount,
        queryRewriteDurationMs,
        denseCandidateCount,
        lexicalCandidateCount,
        fusedCandidateCount: 0,
        denseDurationMs,
        lexicalDurationMs,
      };
    }

    const fusedEntries = mergeFusedAcrossQueries(perQueryFused).slice(0, candidatePoolSize);
    const fusedCandidateCount = fusedEntries.length;
    const fusedIds = fusedEntries.map(entry => entry.chunkId);

    const hydratedRows = await db.select({
      chunk: knowledgeBaseChunks,
      document: knowledgeBaseDocuments,
    })
      .from(knowledgeBaseChunks)
      .innerJoin(
        knowledgeBaseDocuments,
        eq(knowledgeBaseChunks.documentId, knowledgeBaseDocuments.id)
      )
      .where(inArray(knowledgeBaseChunks.id, fusedIds));

    const rowByChunkId = new Map(hydratedRows.map(row => [row.chunk.id, row]));
    const documentIdSet = new Set(documentIds);

    const results: RetrievalResult[] = [];
    for (const entry of fusedEntries) {
      const row = rowByChunkId.get(entry.chunkId);
      if (!row || !documentIdSet.has(row.document.id)) {
        continue;
      }
      results.push({
        chunk: row.chunk,
        document: row.document,
        // similarity is the fused rank score (RRF in hybrid mode, cosine in dense-only); use denseScore for cosine.
        similarity: entry.fusedScore,
        fusedScore: entry.fusedScore,
        denseScore: entry.denseScore,
        lexicalScore: entry.lexicalScore,
        denseRank: entry.denseRank,
        lexicalRank: entry.lexicalRank,
      });
    }

    const precisionOutcome = await this.runPrecisionPipeline(
      companyId,
      nodeId,
      queries[0],
      queryEmbedding,
      results,
      {
        embeddingModel: config.embeddingModel,
        dedupeEnabled: config.dedupeEnabled,
        dedupeSimilarity: config.dedupeSimilarity,
        mmrEnabled: config.mmrEnabled,
        mmrLambda: config.mmrLambda,
        rerankEnabled: config.rerankEnabled,
        rerankModel: config.rerankModel,
        rerankTopN: config.rerankTopN,
      }
    );

    return {
      results: precisionOutcome.results,
      queryEmbedding,
      embeddingDurationMs,
      retrievalDurationMs: Date.now() - startTime,
      confidence: precisionOutcome.confidence,
      confidenceThreshold: config.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
      precisionStats: precisionOutcome.precisionStats,
      queryRewriteApplied,
      rewrittenQuery,
      expansionQueryCount,
      queryRewriteDurationMs,
      denseCandidateCount,
      lexicalCandidateCount,
      fusedCandidateCount,
      denseDurationMs,
      lexicalDurationMs,
    };
  }

  /**
   * Get node credential configuration from flow data
   */
  private async getNodeCredentialConfig(companyId: number, nodeId: string): Promise<{
    credentialSource?: 'manual' | 'company' | 'system' | 'auto';
    apiKey?: string;
    provider?: string;
    azureEndpoint?: string;
    azureApiVersion?: string;
  } | null> {
    try {
      const cached = getCachedNodeCredentialConfig<{
        credentialSource?: 'manual' | 'company' | 'system' | 'auto';
        apiKey?: string;
        provider?: string;
        azureEndpoint?: string;
        azureApiVersion?: string;
      } | null>(companyId, nodeId);
      if (cached !== undefined) {
        return cached;
      }

      const companyFlows = await db.select()
        .from(flows)
        .where(eq(flows.companyId, companyId));

      for (const flow of companyFlows) {
        const nodes = flow.nodes as any[];
        const node = nodes?.find((n: any) => n.id === nodeId);

        if (node && node.data) {
          const config = {
            credentialSource: node.data.credentialSource,
            apiKey: node.data.apiKey,
            provider: node.data.provider || 'openai',
            azureEndpoint: node.data.azureEndpoint,
            azureApiVersion: node.data.azureApiVersion,
          };
          setCachedNodeCredentialConfig(companyId, nodeId, config);
          return config;
        }
      }

      setCachedNodeCredentialConfig(companyId, nodeId, null);
      return null;
    } catch (error) {
      console.error('Failed to get node credential config:', error);
      return null;
    }
  }

  /**
   * Validate that the selected vector database is configured and ready for a node.
   * No-op when Knowledge Base is disabled for the node.
   */
  async validateVectorDatabaseForNode(companyId: number, nodeId: string): Promise<void> {
    const config = await this.resolveEffectiveRagConfig(companyId, nodeId);
    if (!config.enabled) {
      return;
    }
    if (config.vectorDatabase === null) {
      throw new Error(this.getMissingProviderErrorMessage());
    }
    const vectorStore = await this.resolveVectorStore(companyId, nodeId);
    await vectorStore.ensureStorage(companyId, nodeId);
    setNodeKbProviderHealth(companyId, nodeId, { ok: true });
  }

  /**
   * Resolve all node IDs associated with a document for vector store operations.
   */
  private async resolveDocumentNodeIds(
    companyId: number,
    documentId: number,
    fallbackNodeId?: string | null
  ): Promise<string[]> {
    const associatedNodes = await db.select({ nodeId: knowledgeBaseDocumentNodes.nodeId })
      .from(knowledgeBaseDocumentNodes)
      .where(and(
        eq(knowledgeBaseDocumentNodes.documentId, documentId),
        eq(knowledgeBaseDocumentNodes.companyId, companyId)
      ));

    if (associatedNodes.length > 0) {
      return [...new Set(associatedNodes.map(n => n.nodeId))];
    }

    return [fallbackNodeId || 'fallback'];
  }

  /**
   * Delete document vectors from every associated node's vector store (best-effort).
   */
  async deleteDocumentVectorsForAllNodes(
    companyId: number,
    documentId: number,
    fallbackNodeId?: string | null
  ): Promise<string[]> {
    const warnings: string[] = [];
    const nodeIds = await this.resolveDocumentNodeIds(companyId, documentId, fallbackNodeId);

    try {
      await pgVectorService.deleteDocumentVectorsForCompany(companyId, documentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`pgvector cleanup failed: ${message}`);
      console.error(
        `[Knowledge Base] pgvector cleanup failed for document ${documentId}:`,
        message
      );
    }

    for (const nodeId of nodeIds) {
      try {
        await pineconeService.deleteDocumentVectors(companyId, nodeId, documentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Pinecone cleanup failed for node ${nodeId}: ${message}`);
        console.error(
          `[Knowledge Base] Pinecone cleanup failed for document ${documentId} on node ${nodeId}:`,
          message
        );
      }
    }

    return warnings;
  }

  /**
   * Delete a knowledge-base document after authorization checks.
   * Vector cleanup is best-effort and never blocks the DB row delete.
   */
  async deleteDocument(companyId: number, documentId: number): Promise<KnowledgeBaseDocumentDeleteResult> {
    const [document] = await db.select()
      .from(knowledgeBaseDocuments)
      .where(and(
        eq(knowledgeBaseDocuments.id, documentId),
        eq(knowledgeBaseDocuments.companyId, companyId)
      ));

    if (!document) {
      throw new Error('Document not found');
    }

    const vectorCleanupWarnings = await this.deleteDocumentVectorsForAllNodes(
      companyId,
      documentId,
      document.nodeId
    );

    await db.delete(knowledgeBaseDocuments)
      .where(and(
        eq(knowledgeBaseDocuments.id, documentId),
        eq(knowledgeBaseDocuments.companyId, companyId)
      ));

    return { vectorCleanupWarnings };
  }

  /**
   * Process uploaded document: extract text, chunk, and generate embeddings
   */
  async processDocument(documentId: number): Promise<void> {
    const startTime = Date.now();
    
    try {

      await db.update(knowledgeBaseDocuments)
        .set({ status: 'processing' })
        .where(eq(knowledgeBaseDocuments.id, documentId));


      const [document] = await db.select()
        .from(knowledgeBaseDocuments)
        .where(eq(knowledgeBaseDocuments.id, documentId));

      if (!document) {
        throw new Error('Document not found');
      }


      const extractedText = await this.extractTextFromFile(document.filePath, document.mimeType);

      if (!extractedText.trim()) {
        throw new Error(NO_EXTRACTABLE_TEXT_ERROR);
      }

      const documentTokenCount = this.estimateTokens(extractedText);
      const { chunkSize } = computeAdaptiveChunkParams(documentTokenCount);
      const format = detectDocumentFormat(document.mimeType, document.originalName);
      const chunks = chunkDocument({
        text: extractedText,
        format,
        documentName: document.originalName,
        maxChunkTokens: chunkSize,
        maxRecordTokens: RAG_CHUNK_DEFAULTS.baseChunkSize,
      });

      if (chunks.length === 0) {
        throw new Error(NO_EXTRACTABLE_TEXT_ERROR);
      }

      const averageChunkTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0) / chunks.length;


      const nodeIdsForValidation = await this.resolveDocumentNodeIds(
        document.companyId,
        documentId,
        document.nodeId
      );
      for (const validationNodeId of nodeIdsForValidation) {
        await this.validateVectorDatabaseForNode(document.companyId, validationNodeId);
      }

      const nodeId = document.nodeId || 'fallback';
      const effectiveConfig = await this.resolveEffectiveRagConfig(document.companyId, nodeId);
      const embeddingModel = normalizeEmbeddingModel(effectiveConfig.embeddingModel);
      const chunksWithEmbeddings = await this.generateEmbeddings(document.companyId, nodeId, chunks);
      

      await this.storeChunks(documentId, chunksWithEmbeddings);
      

      const processingDuration = Date.now() - startTime;
      await db.update(knowledgeBaseDocuments)
        .set({ 
          status: 'completed',
          extractedText,
          chunkCount: chunks.length,
          chunkSize,
          averageChunkTokens,
          embeddingModel,
          processingDurationMs: processingDuration
        })
        .where(eq(knowledgeBaseDocuments.id, documentId));

    } catch (error) {
      console.error('Error processing document:', error);
      

      await db.update(knowledgeBaseDocuments)
        .set({ 
          status: 'failed',
          processingError: error instanceof Error ? error.message : 'Unknown error',
          processingDurationMs: Date.now() - startTime
        })
        .where(eq(knowledgeBaseDocuments.id, documentId));
      
      throw error;
    }
  }

  /**
   * Extract text from various file formats
   */
  private async extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
    const fullPath = path.resolve(filePath);


    await TextDocumentProcessor.validateFile(fullPath, mimeType);


    return TextDocumentProcessor.extractText(fullPath, mimeType);
  }



  /**
   * Estimate token count using the shared structure-aware estimator.
   */
  private estimateTokens(text: string): number {
    return sharedEstimateTokens(text);
  }

  private capRetrievedContext(
    retrievalResults: RetrievalResult[],
    contextTemplate: string,
    maxContextTokens?: number
  ): {
    contextText: string;
    contextUsed: string[];
    retrievalResultsUsed: RetrievalResult[];
  } {
    if (!maxContextTokens || maxContextTokens <= 0) {
      const contextUsed = retrievalResults.map((result, index) =>
        formatChunkForContext(result, index + 1)
      );
      return {
        contextText: contextUsed.join(KB_CONTEXT_SEPARATOR),
        contextUsed,
        retrievalResultsUsed: [...retrievalResults],
      };
    }

    const templateOverheadTokens = this.estimateTokens(contextTemplate.replace('{context}', ''));
    const contentBudgetTokens = Math.max(0, maxContextTokens - templateOverheadTokens);
    if (contentBudgetTokens <= 0) {
      return {
        contextText: '',
        contextUsed: [],
        retrievalResultsUsed: [],
      };
    }

    let usedTokens = 0;
    const contextUsed: string[] = [];
    const retrievalResultsUsed: RetrievalResult[] = [];
    let ordinal = 0;

    for (const result of retrievalResults) {
      const nextOrdinal = ordinal + 1;
      const formatted = formatChunkForContext(result, nextOrdinal);
      const separatorTokens =
        contextUsed.length > 0 ? this.estimateTokens(KB_CONTEXT_SEPARATOR) : 0;
      const entryTokens = this.estimateTokens(formatted);
      const projectedTokens = usedTokens + separatorTokens + entryTokens;

      if (projectedTokens <= contentBudgetTokens) {
        if (separatorTokens > 0) {
          usedTokens += separatorTokens;
        }
        usedTokens += entryTokens;
        ordinal = nextOrdinal;
        contextUsed.push(formatted);
        retrievalResultsUsed.push(result);
      } else if (contextUsed.length === 0) {
        // Always emit the top-ranked chunk whole; downstream prompt assembly may trim.
        ordinal = nextOrdinal;
        contextUsed.push(formatted);
        retrievalResultsUsed.push(result);
        break;
      } else {
        break;
      }
    }

    return {
      contextText: contextUsed.join(KB_CONTEXT_SEPARATOR),
      contextUsed,
      retrievalResultsUsed,
    };
  }

  /**
   * Generate embeddings for chunks using AI SDK embedMany (OpenAI or OpenRouter).
   */
  private async generateEmbeddings(companyId: number, nodeId: string, chunks: DocumentChunk[]): Promise<(DocumentChunk & { embedding: number[] })[]> {
    const runtime = await this.resolveEmbeddingRuntime(companyId, nodeId);
    return this.ragGenerateDocumentEmbeddings(runtime, chunks);
  }

  /**
   * Resolve the vector store adapter for a node based on effective vector database selection.
   */
  private async resolveVectorStore(companyId: number, nodeId: string): Promise<VectorStore> {
    const effectiveConfig = await this.resolveEffectiveRagConfig(companyId, nodeId);
    const vectorDatabase = effectiveConfig.vectorDatabase;

    if (vectorDatabase === 'pgvector') {
      return pgVectorService;
    }
    if (vectorDatabase === 'pinecone') {
      return pineconeService;
    }

    throw new Error(this.getMissingProviderErrorMessage());
  }

  /**
   * Store chunks with embeddings in the configured vector store.
   * Uses nodeIds from knowledge_base_document_nodes so vectors are stored in the same
   * scope that retrieval queries (avoids document.nodeId/fallback mismatch).
   */
  private async storeChunks(documentId: number, chunks: (DocumentChunk & { embedding: number[] })[]): Promise<void> {
    if (chunks.length === 0) {
      throw new Error(NO_EXTRACTABLE_TEXT_ERROR);
    }

    const [document] = await db.select()
      .from(knowledgeBaseDocuments)
      .where(eq(knowledgeBaseDocuments.id, documentId));

    if (!document) {
      throw new Error('Document not found');
    }

    const nodeIdsToStore = await this.resolveDocumentNodeIds(
      document.companyId,
      documentId,
      document.nodeId
    );

    const chunkRecords = chunks.map(chunk => ({
      documentId,
      content: chunk.content,
      chunkIndex: chunk.index,
      tokenCount: chunk.tokenCount,
      embedding: null,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
      ...(chunk.recordId ? { recordId: chunk.recordId } : {}),
      ...(chunk.sectionLabel ? { sectionLabel: chunk.sectionLabel } : {}),
      sourceDocumentName: document.originalName,
      ...(chunk.language ? { language: chunk.language } : {}),
      ...(chunk.contentHash ? { contentHash: chunk.contentHash } : {}),
    }));

    const insertedChunks = await db.insert(knowledgeBaseChunks)
      .values(chunkRecords)
      .returning();

    const primaryNodeId = nodeIdsToStore[0] || document.nodeId || 'fallback';
    const effectiveConfig = await this.resolveEffectiveRagConfig(document.companyId, primaryNodeId);
    const storageEmbeddingModel = normalizeEmbeddingModel(effectiveConfig.embeddingModel);
    const nodeIdsWithVectors: string[] = [];

    try {
      for (const nodeId of nodeIdsToStore) {
        const vectorStore = await this.resolveVectorStore(document.companyId, nodeId);
        await vectorStore.ensureStorage(document.companyId, nodeId);

        const vectors: VectorStoreRecord[] = insertedChunks.map((dbChunk, index) => {
          const chunk = chunks[index];
          const metadata: VectorStoreRecord['metadata'] = {
            companyId: document.companyId,
            nodeId,
            documentId,
            chunkId: dbChunk.id,
            chunkIndex: dbChunk.chunkIndex,
            content: dbChunk.content,
            tokenCount: dbChunk.tokenCount || 0,
            documentName: document.originalName,
            mimeType: document.mimeType,
            startPosition: dbChunk.startPosition || 0,
            endPosition: dbChunk.endPosition || 0,
            createdAt: new Date().toISOString(),
          };
          if (chunk.recordId) metadata.recordId = chunk.recordId;
          if (chunk.sectionLabel) metadata.sectionLabel = chunk.sectionLabel;
          if (document.originalName) metadata.sourceDocumentName = document.originalName;
          if (chunk.language) metadata.language = chunk.language;
          if (chunk.contentHash) metadata.contentHash = chunk.contentHash;

          return {
            id: `chunk-${dbChunk.id}`,
            values: chunk.embedding,
            embeddingModel: storageEmbeddingModel,
            metadata,
          };
        });

        await vectorStore.upsertVectors(document.companyId, nodeId, vectors);
        nodeIdsWithVectors.push(nodeId);
      }
    } catch (error) {
      await db.delete(knowledgeBaseChunks)
        .where(eq(knowledgeBaseChunks.documentId, documentId));

      for (const nodeId of nodeIdsWithVectors) {
        try {
          await this.deleteDocumentVectors(document.companyId, nodeId, documentId);
        } catch (cleanupError) {
          console.error(
            `[Knowledge Base] Failed to clean up vectors for document ${documentId} on node ${nodeId}:`,
            cleanupError
          );
        }
      }

      throw error;
    }
  }

  /**
   * Delete document vectors from the configured vector store
   */
  async deleteDocumentVectors(companyId: number, nodeId: string, documentId: number): Promise<void> {
    try {
      const vectorStore = await this.resolveVectorStore(companyId, nodeId);
      await vectorStore.deleteDocumentVectors(companyId, nodeId, documentId);
    } catch (error) {
      console.error('Error deleting document vectors:', error);
      throw error;
    }
  }

  /**
   * Retrieve relevant context for a query using vector similarity.
   * Delegates to the internal AI SDK RAG retrieval runtime.
   * effectiveTopK is derived from maxContextTokens and document average chunk size when provided.
   */
  async retrieveContext(
    companyId: number,
    nodeId: string,
    query: string,
    options?: { maxContextTokens?: number; maxResultsOverride?: number; historyText?: string }
  ): Promise<RetrievalResult[]> {
    const startTime = Date.now();

    try {
      const config = await this.resolveEffectiveRagConfig(companyId, nodeId);
      if (!config.enabled) {
        return [];
      }

      const outcome = await this.executeRagRetrieval({
        companyId,
        nodeId,
        query,
        historyText: options?.historyText,
      });

      let results = outcome.results;
      if (options?.maxResultsOverride != null && options.maxResultsOverride > 0) {
        results = results.slice(0, options.maxResultsOverride);
      }

      await this.trackUsage(
        buildUsageTelemetryFromOutcome(outcome, results, {
          companyId,
          nodeId,
          queryText: query,
          queryEmbedding: JSON.stringify(outcome.queryEmbedding),
          chunksRetrieved: results.length,
          chunksUsed: results.length,
          similarityScores: results.map(r => r.similarity),
          retrievalDurationMs: Date.now() - startTime,
          embeddingDurationMs: outcome.embeddingDurationMs,
          contextInjected: results.length > 0,
          contextLength: results.reduce((sum, r) => sum + r.chunk.content.length, 0),
        })
      );

      return results;

    } catch (error) {
      console.error('Error retrieving context:', error);
      if (this.isProviderSetupError(error)) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Dense vector search returning ranked chunk ids and scores (no hydration).
   */
  private async performDenseMatch(
    companyId: number,
    nodeId: string,
    queryEmbedding: number[],
    documentIds: number[],
    topK: number,
    similarityThreshold: number,
    embeddingModel: string,
    hnswEfSearch?: number
  ): Promise<RankedChunkMatch[]> {
    const vectorStore = await this.resolveVectorStore(companyId, nodeId);
    const searchResults = await vectorStore.queryVectors({
      companyId,
      nodeId,
      queryEmbedding,
      topK,
      similarityThreshold,
      documentIds,
      embeddingModel: normalizeEmbeddingModel(embeddingModel),
      efSearch: hnswEfSearch,
    });

    return searchResults.map(result => ({
      chunkId: parseInt(result.id.replace('chunk-', ''), 10),
      score: result.score,
    }));
  }

  /**
   * Track knowledge base usage
   */
  private async trackUsage(usage: InsertKnowledgeBaseUsage): Promise<number | undefined> {
    try {
      const [row] = await db.insert(knowledgeBaseUsage).values(usage).returning({ id: knowledgeBaseUsage.id });
      return row?.id;
    } catch (error) {
      console.error('Error tracking knowledge base usage:', error);
      return undefined;
    }
  }

  /**
   * Update a usage row with post-retrieval turn decisions (abstain / validation).
   */
  async recordTurnDecision(
    usageId: number | undefined,
    decision: {
      abstained?: boolean;
      abstainReason?: string;
      answerValidated?: boolean;
      validationGrounded?: boolean | null;
    }
  ): Promise<void> {
    if (usageId == null) {
      return;
    }
    try {
      await db
        .update(knowledgeBaseUsage)
        .set({
          ...(decision.abstained !== undefined ? { abstained: decision.abstained } : {}),
          ...(decision.abstainReason !== undefined ? { abstainReason: decision.abstainReason } : {}),
          ...(decision.answerValidated !== undefined ? { answerValidated: decision.answerValidated } : {}),
          ...(decision.validationGrounded !== undefined
            ? { validationGrounded: decision.validationGrounded }
            : {}),
        })
        .where(eq(knowledgeBaseUsage.id, usageId));
    } catch (error) {
      console.error('Error recording turn decision:', error);
    }
  }

  /**
   * Build the OpenAI-compatible function definition for the knowledge-base retrieval AI SDK tool.
   */
  buildKnowledgeBaseRetrievalToolDefinition(): KnowledgeBaseRetrievalToolDefinition {
    return {
      name: KNOWLEDGE_BASE_RETRIEVAL_TOOL_NAME,
      description:
        'Search the knowledge base for document chunks relevant to a user question. ' +
        'Call this before answering when the user asks about uploaded documents, policies, or domain-specific facts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The user question or search phrase to retrieve relevant knowledge-base chunks for.',
          },
        },
        required: ['query'],
      },
    };
  }

  /**
   * Format raw retrieval results into prompt context using node template and position settings.
   * Shared by enhancePromptWithContext (pre-injection API) and the AI SDK retrieval tool runtime.
   */
  async formatRetrievalResultsForPrompt(
    companyId: number,
    nodeId: string,
    systemPrompt: string,
    retrievalResults: RetrievalResult[],
    options?: {
      maxContextTokens?: number;
      confidence?: number;
      confidenceThreshold?: number;
      precisionStats?: RagPrecisionStats;
      retrievalDurationMs?: number;
    }
  ): Promise<ContextEnhancementResult> {
    const startTime = Date.now();
    const effectiveConfig = await this.resolveEffectiveRagConfig(companyId, nodeId);
    const emptyPrecisionStats = { ...ZERO_PRECISION_STATS };
    const baseRetrievalStats = {
      confidence: options?.confidence ?? 0,
      confidenceThreshold: options?.confidenceThreshold ?? effectiveConfig.confidenceThreshold,
      precisionStats: options?.precisionStats ?? emptyPrecisionStats,
      retrievalDurationMs: options?.retrievalDurationMs ?? Date.now() - startTime,
    };

    if (retrievalResults.length === 0) {
      return {
        enhancedPrompt: systemPrompt,
        contextUsed: [],
        retrievalStats: {
          chunksRetrieved: 0,
          chunksUsed: 0,
          averageSimilarity: 0,
          ...baseRetrievalStats,
        },
      };
    }

    const userCustomizedTemplate = !isDefaultContextTemplate(effectiveConfig.contextTemplate);
    const contextTemplate = !userCustomizedTemplate
      ? CONTEXT_TEMPLATE
      : effectiveConfig.contextTemplate;
    const contextPosition = effectiveConfig.contextPosition;
    const {
      contextText,
      contextUsed,
      retrievalResultsUsed,
    } = this.capRetrievedContext(retrievalResults, contextTemplate, options?.maxContextTokens);

    if (contextUsed.length === 0) {
      return {
        enhancedPrompt: systemPrompt,
        contextUsed: [],
        retrievalStats: {
          chunksRetrieved: retrievalResults.length,
          chunksUsed: 0,
          averageSimilarity: 0,
          ...baseRetrievalStats,
        },
      };
    }

    const { enhancedPrompt, userMessageContext } = this.injectContext(
      systemPrompt,
      contextText,
      contextTemplate,
      contextPosition
    );
    const modelContext = contextTemplate.replace('{context}', contextText);

    const optimalPosition = this.detectOptimalContextPosition(systemPrompt);
    if (contextPosition !== optimalPosition) {
      console.warn(
        `[Knowledge Base] Context position '${contextPosition}' may be suboptimal. Recommended: '${optimalPosition}' for this system prompt.`
      );
    }

    const averageSimilarity =
      retrievalResultsUsed.reduce((sum, result) => sum + result.similarity, 0) /
      retrievalResultsUsed.length;

    return {
      enhancedPrompt,
      contextUsed,
      userMessageContext,
      modelContext,
      retrievalStats: {
        chunksRetrieved: retrievalResults.length,
        chunksUsed: retrievalResultsUsed.length,
        averageSimilarity,
        ...baseRetrievalStats,
      },
    };
  }

  /**
   * Create an AI SDK retrieval tool that delegates to retrieveContext() and normalizes chunks
   * through the same template/position rules as enhancePromptWithContext().
   */
  createKnowledgeBaseRetrievalTool(
    options: KnowledgeBaseRetrievalToolOptions,
    hooks?: {
      onRetrievalComplete?: (result: KnowledgeBaseRetrievalToolExecuteResult) => void;
      /** Base system prompt without KB injection — used when formatting model-facing tool results. */
      resolveBaseSystemPrompt?: () => string;
    }
  ): Tool {
    const definition = this.buildKnowledgeBaseRetrievalToolDefinition();
    return tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.parameters),
      execute: async (input: unknown) => {
        const args =
          input && typeof input === 'object' && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) {
          const emptyResult: KnowledgeBaseRetrievalToolExecuteResult = {
            ok: false,
            chunksRetrieved: 0,
            chunksUsed: 0,
            averageSimilarity: 0,
            contextUsed: [],
            formattedContext: '',
            error: 'missing_query',
          };
          hooks?.onRetrievalComplete?.(emptyResult);
          return formatKnowledgeBaseToolResultForModel(emptyResult);
        }

        if (options.turnBudgetTracker?.isExhausted()) {
          const budgetResult: KnowledgeBaseRetrievalToolExecuteResult = {
            ok: false,
            chunksRetrieved: 0,
            chunksUsed: 0,
            averageSimilarity: 0,
            contextUsed: [],
            formattedContext: '',
            error: 'knowledge_base_turn_budget_exhausted',
          };
          hooks?.onRetrievalComplete?.(budgetResult);
          return {
            ...formatKnowledgeBaseToolResultForModel(budgetResult),
            budgetExhausted: true,
          };
        }

        try {
          const outcome = await this.executeRagRetrieval({
            companyId: options.companyId,
            nodeId: options.nodeId,
            query,
            historyText: options.historyText,
            effectiveRagConfig: options.effectiveRagConfig,
          });

          const usageId = await this.trackUsage(
            buildUsageTelemetryFromOutcome(outcome, outcome.results, {
              companyId: options.companyId,
              nodeId: options.nodeId,
              queryText: query,
              queryEmbedding: JSON.stringify(outcome.queryEmbedding),
              chunksRetrieved: outcome.results.length,
              chunksUsed: outcome.results.length,
              similarityScores: outcome.results.map(r => r.similarity),
              retrievalDurationMs: outcome.retrievalDurationMs,
              embeddingDurationMs: outcome.embeddingDurationMs,
              contextInjected: outcome.results.length > 0,
              contextLength: outcome.results.reduce((sum, r) => sum + r.chunk.content.length, 0),
              turnCorrelationId: options.turnCorrelationId,
            })
          );

          const retrievalResults = outcome.results;
          const baseSystemPrompt = hooks?.resolveBaseSystemPrompt?.() ?? '';
          const formatted = await this.formatRetrievalResultsForPrompt(
            options.companyId,
            options.nodeId,
            baseSystemPrompt,
            retrievalResults,
            {
              maxContextTokens: options.maxContextTokens,
              confidence: outcome.confidence,
              confidenceThreshold: outcome.confidenceThreshold,
              precisionStats: outcome.precisionStats,
              retrievalDurationMs: outcome.retrievalDurationMs,
            }
          );

          const formattedContext = formatted.contextUsed.join(KB_CONTEXT_SEPARATOR);
          const result: KnowledgeBaseRetrievalToolExecuteResult = {
            ok: formatted.contextUsed.length > 0,
            chunksRetrieved: formatted.retrievalStats.chunksRetrieved,
            chunksUsed: formatted.retrievalStats.chunksUsed,
            averageSimilarity: formatted.retrievalStats.averageSimilarity,
            contextUsed: formatted.contextUsed,
            formattedContext,
            enhancedPrompt: formatted.enhancedPrompt,
            userMessageContext: formatted.userMessageContext,
            modelContext: formatted.modelContext,
            confidence: formatted.retrievalStats.confidence,
            confidenceThreshold: outcome.confidenceThreshold,
            precisionStats: formatted.retrievalStats.precisionStats,
            usageId,
          };
          options.turnBudgetTracker?.recordContextTokens(
            Math.ceil((result.modelContext?.length ?? formattedContext.length) / 4)
          );
          hooks?.onRetrievalComplete?.(result);
          return formatKnowledgeBaseToolResultForModel(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const failure: KnowledgeBaseRetrievalToolExecuteResult = {
            ok: false,
            chunksRetrieved: 0,
            chunksUsed: 0,
            averageSimilarity: 0,
            contextUsed: [],
            formattedContext: '',
            error: message,
          };
          hooks?.onRetrievalComplete?.(failure);
          return formatKnowledgeBaseToolResultForModel(failure);
        }
      },
    });
  }

  /**
   * Enhance system prompt with retrieved context.
   *
   * Canonical RAG assembly boundary: retrieval runs through retrieveContext(),
   * then formatRetrievalResultsForPrompt() applies template/position injection.
   * The AI SDK agent runtime registers createKnowledgeBaseRetrievalTool() for the same primitive.
   *
   * Template selection: when retrieval returns chunks, the strict KB-only CONTEXT_TEMPLATE
   * is used by default so answers stay grounded. Only a user-customized contextTemplate
   * (stored config differs from CONTEXT_TEMPLATE) is honored instead. Position heuristics
   * remain in detectOptimalContextPosition for advisory logging only.
   */
  async enhancePromptWithContext(
    companyId: number,
    nodeId: string,
    systemPrompt: string,
    userQuery: string,
    options?: {
      maxContextTokens?: number;
      historyText?: string;
    }
  ): Promise<ContextEnhancementResult> {
    const startTime = Date.now();

    try {

      const effectiveConfig = await this.resolveEffectiveRagConfig(companyId, nodeId);

      if (!effectiveConfig.enabled) {
        return {
          enhancedPrompt: systemPrompt,
          contextUsed: [],
          retrievalStats: {
            chunksRetrieved: 0,
            chunksUsed: 0,
            averageSimilarity: 0,
            retrievalDurationMs: 0,
            confidence: 0,
            confidenceThreshold: effectiveConfig.confidenceThreshold,
            precisionStats: { ...ZERO_PRECISION_STATS },
          }
        };
      }


      const outcome = await this.executeRagRetrieval({
        companyId,
        nodeId,
        query: userQuery,
        historyText: options?.historyText,
      });

      await this.trackUsage(
        buildUsageTelemetryFromOutcome(outcome, outcome.results, {
          companyId,
          nodeId,
          queryText: userQuery,
          queryEmbedding: JSON.stringify(outcome.queryEmbedding),
          chunksRetrieved: outcome.results.length,
          chunksUsed: outcome.results.length,
          similarityScores: outcome.results.map(r => r.similarity),
          retrievalDurationMs: outcome.retrievalDurationMs,
          embeddingDurationMs: outcome.embeddingDurationMs,
          contextInjected: outcome.results.length > 0,
          contextLength: outcome.results.reduce((sum, r) => sum + r.chunk.content.length, 0),
        })
      );

      return this.formatRetrievalResultsForPrompt(
        companyId,
        nodeId,
        systemPrompt,
        outcome.results,
        {
          ...options,
          confidence: outcome.confidence,
          confidenceThreshold: outcome.confidenceThreshold,
          precisionStats: outcome.precisionStats,
          retrievalDurationMs: outcome.retrievalDurationMs,
        }
      );

    } catch (error) {
      console.error('Error enhancing prompt with context:', error);
      if (this.isProviderSetupError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        setNodeKbProviderHealth(companyId, nodeId, { ok: false, message });
        throw error;
      }
      return {
        enhancedPrompt: systemPrompt,
        contextUsed: [],
        retrievalStats: {
          chunksRetrieved: 0,
          chunksUsed: 0,
          averageSimilarity: 0,
          retrievalDurationMs: Date.now() - startTime,
          confidence: 0,
          confidenceThreshold: DEFAULT_RAG_CONFIG.confidenceThreshold,
          precisionStats: { ...ZERO_PRECISION_STATS },
        }
      };
    }
  }

  getProviderHealth(companyId: number, nodeId: string) {
    return getNodeKbProviderHealth(companyId, nodeId);
  }

  /**
   * Inject context into prompt based on position configuration.
   * For 'before_user', returns systemPrompt unchanged and userMessageContext for injection before the current user turn only.
   */
  private injectContext(
    systemPrompt: string,
    contextText: string,
    contextTemplate: string,
    contextPosition: 'before_system' | 'after_system' | 'before_user'
  ): { enhancedPrompt: string; userMessageContext?: string } {
    const formattedContext = contextTemplate.replace('{context}', contextText);

    switch (contextPosition) {
      case 'before_system':
        return { enhancedPrompt: `${formattedContext}\n\n${systemPrompt}` };

      case 'after_system':
        return { enhancedPrompt: `${systemPrompt}\n\n${formattedContext}` };

      case 'before_user':
        return {
          enhancedPrompt: systemPrompt,
          userMessageContext: formattedContext
        };

      default:
        return { enhancedPrompt: `${formattedContext}\n\n${systemPrompt}` };
    }
  }

  /**
   * Analyze system prompt and recommend optimal context position.
   * Use 'after_system' when system prompt contains restrictive language.
   */
  private detectOptimalContextPosition(systemPrompt: string): 'before_system' | 'after_system' | 'before_user' {
    const restrictivePhrases = [
      'focused on',
      'only for',
      'limited to',
      "don't have access",
      'do not have access',
      'cannot access',
      'as an assistant focused',
      'as a scheduling',
      'as a calendar'
    ];
    const lowerPrompt = systemPrompt.toLowerCase();
    const hasRestrictiveLanguage = restrictivePhrases.some(phrase => lowerPrompt.includes(phrase));
    return hasRestrictiveLanguage ? 'after_system' : 'before_system';
  }

  /**
   * Read knowledge-base settings stored on the flow node (saved with the flow).
   */
  private async getNodeFlowKnowledgeBaseSettings(companyId: number, nodeId: string): Promise<FlowNodeKnowledgeBaseSettings | null> {
    try {
      const cached = getCachedNodeKbSettings<FlowNodeKnowledgeBaseSettings | null>(companyId, nodeId);
      if (cached !== undefined) {
        return cached;
      }

      const companyFlows = await db.select()
        .from(flows)
        .where(eq(flows.companyId, companyId));

      for (const flow of companyFlows) {
        const nodes = this.parseFlowNodes(flow.nodes);
        const node = nodes?.find((n) => n.id === nodeId);
        if (node?.data) {
          const nodeData = node.data;
          const flowKbConfig = nodeData.knowledgeBaseConfig;
          const flowKbRecord = flowKbConfig && typeof flowKbConfig === 'object'
            ? (flowKbConfig as Record<string, unknown>)
            : null;
          const settings: FlowNodeKnowledgeBaseSettings = {
            knowledgeBaseEnabled: nodeData.knowledgeBaseEnabled === true
              ? true
              : nodeData.knowledgeBaseEnabled === false
                ? false
                : undefined,
            knowledgeBaseConfig: flowKbRecord
              ? {
                  maxRetrievedChunks: typeof flowKbRecord.maxRetrievedChunks === 'number'
                    ? flowKbRecord.maxRetrievedChunks
                    : undefined,
                  similarityThreshold: typeof flowKbRecord.similarityThreshold === 'number'
                    ? flowKbRecord.similarityThreshold
                    : undefined,
                  contextPosition: flowKbRecord.contextPosition as
                    'before_system' | 'after_system' | 'before_user' | undefined,
                  contextTemplate: typeof flowKbRecord.contextTemplate === 'string'
                    ? flowKbRecord.contextTemplate
                    : undefined,
                  embeddingModel: typeof flowKbRecord.embeddingModel === 'string'
                    ? flowKbRecord.embeddingModel
                    : undefined,
                  vectorDatabase: this.normalizeVectorDatabaseProvider(flowKbRecord.vectorDatabase),
                  hybridEnabled: flowKbRecord.hybridEnabled === true
                    ? true
                    : flowKbRecord.hybridEnabled === false
                      ? false
                      : undefined,
                  denseTopK: typeof flowKbRecord.denseTopK === 'number'
                    ? flowKbRecord.denseTopK
                    : undefined,
                  lexicalTopK: typeof flowKbRecord.lexicalTopK === 'number'
                    ? flowKbRecord.lexicalTopK
                    : undefined,
                  rrfK: typeof flowKbRecord.rrfK === 'number'
                    ? flowKbRecord.rrfK
                    : undefined,
                  denseWeight: typeof flowKbRecord.denseWeight === 'number'
                    ? flowKbRecord.denseWeight
                    : undefined,
                  lexicalWeight: typeof flowKbRecord.lexicalWeight === 'number'
                    ? flowKbRecord.lexicalWeight
                    : undefined,
                  candidatePoolSize: typeof flowKbRecord.candidatePoolSize === 'number'
                    ? flowKbRecord.candidatePoolSize
                    : undefined,
                  dedupeEnabled: flowKbRecord.dedupeEnabled === true
                    ? true
                    : flowKbRecord.dedupeEnabled === false
                      ? false
                      : undefined,
                  dedupeSimilarity: typeof flowKbRecord.dedupeSimilarity === 'number'
                    ? flowKbRecord.dedupeSimilarity
                    : undefined,
                  mmrEnabled: flowKbRecord.mmrEnabled === true
                    ? true
                    : flowKbRecord.mmrEnabled === false
                      ? false
                      : undefined,
                  mmrLambda: typeof flowKbRecord.mmrLambda === 'number'
                    ? flowKbRecord.mmrLambda
                    : undefined,
                  rerankEnabled: flowKbRecord.rerankEnabled === true
                    ? true
                    : flowKbRecord.rerankEnabled === false
                      ? false
                      : undefined,
                  rerankModel: typeof flowKbRecord.rerankModel === 'string'
                    ? flowKbRecord.rerankModel
                    : undefined,
                  rerankTopN: typeof flowKbRecord.rerankTopN === 'number'
                    ? flowKbRecord.rerankTopN
                    : undefined,
                  confidenceThreshold: typeof flowKbRecord.confidenceThreshold === 'number'
                    ? flowKbRecord.confidenceThreshold
                    : undefined,
                  queryRewriteEnabled: flowKbRecord.queryRewriteEnabled === true
                    ? true
                    : flowKbRecord.queryRewriteEnabled === false
                      ? false
                      : undefined,
                  answerValidationEnabled: flowKbRecord.answerValidationEnabled === true
                    ? true
                    : flowKbRecord.answerValidationEnabled === false
                      ? false
                      : undefined,
                  hnswEfSearch: typeof flowKbRecord.hnswEfSearch === 'number'
                    ? clampHnswEfSearch(flowKbRecord.hnswEfSearch)
                    : undefined,
                }
              : undefined,
            topLevelVectorDatabase: this.normalizeVectorDatabaseProvider(nodeData.vectorDatabase),
            hasLegacyPinecone: this.hasLegacyPineconeConfig(nodeData),
          };
          setCachedNodeKbSettings(companyId, nodeId, settings);
          return settings;
        }
      }

      setCachedNodeKbSettings(companyId, nodeId, null);
      return null;
    } catch (error) {
      console.error('Failed to get node flow KB settings:', error);
      return null;
    }
  }

  /**
   * Resolve effective RAG config: DB row when saved, otherwise flow node settings + defaults.
   */
  async resolveEffectiveRagConfig(companyId: number, nodeId: string): Promise<EffectiveRagConfig> {
    const flowSettings = await this.getNodeFlowKnowledgeBaseSettings(companyId, nodeId);
    const dbConfig = await this.getNodeConfig(companyId, nodeId);
    const flowKbConfig = flowSettings?.knowledgeBaseConfig ?? {};

    if (dbConfig) {
      return {
        enabled: dbConfig.enabled ?? DEFAULT_RAG_CONFIG.enabled,
        maxRetrievedChunks: dbConfig.maxRetrievedChunks ?? DEFAULT_RAG_CONFIG.maxRetrievedChunks,
        similarityThreshold: dbConfig.similarityThreshold ?? DEFAULT_RAG_CONFIG.similarityThreshold,
        contextPosition: (dbConfig.contextPosition ?? DEFAULT_RAG_CONFIG.contextPosition) as 'before_system' | 'after_system' | 'before_user',
        contextTemplate: dbConfig.contextTemplate ?? CONTEXT_TEMPLATE,
        embeddingModel: normalizeEmbeddingModel(dbConfig.embeddingModel ?? DEFAULT_RAG_CONFIG.embeddingModel),
        vectorDatabase: this.resolveVectorDatabase({
          dbVectorDatabase: dbConfig.vectorDatabase as VectorDatabaseProvider | null | undefined,
          dbVectorDatabaseAuthoritative: dbConfig.vectorDatabaseDbAuthoritative === true,
          flowSettings,
        }),
        hybridEnabled: dbConfig.hybridEnabled ?? DEFAULT_RAG_CONFIG.hybridEnabled,
        denseTopK: dbConfig.denseTopK ?? DEFAULT_RAG_CONFIG.denseTopK,
        lexicalTopK: dbConfig.lexicalTopK ?? DEFAULT_RAG_CONFIG.lexicalTopK,
        rrfK: dbConfig.rrfK ?? DEFAULT_RAG_CONFIG.rrfK,
        denseWeight: dbConfig.denseWeight ?? DEFAULT_RAG_CONFIG.denseWeight,
        lexicalWeight: dbConfig.lexicalWeight ?? DEFAULT_RAG_CONFIG.lexicalWeight,
        candidatePoolSize: dbConfig.candidatePoolSize ?? DEFAULT_RAG_CONFIG.candidatePoolSize,
        dedupeEnabled: dbConfig.dedupeEnabled ?? DEFAULT_RAG_CONFIG.dedupeEnabled,
        dedupeSimilarity: dbConfig.dedupeSimilarity ?? DEFAULT_RAG_CONFIG.dedupeSimilarity,
        mmrEnabled: dbConfig.mmrEnabled ?? DEFAULT_RAG_CONFIG.mmrEnabled,
        mmrLambda: dbConfig.mmrLambda ?? DEFAULT_RAG_CONFIG.mmrLambda,
        rerankEnabled: dbConfig.rerankEnabled ?? DEFAULT_RAG_CONFIG.rerankEnabled,
        rerankModel: dbConfig.rerankModel ?? DEFAULT_RAG_CONFIG.rerankModel,
        rerankTopN: dbConfig.rerankTopN ?? DEFAULT_RAG_CONFIG.rerankTopN,
        confidenceThreshold: dbConfig.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
        queryRewriteEnabled: dbConfig.queryRewriteEnabled ?? DEFAULT_RAG_CONFIG.queryRewriteEnabled,
        answerValidationEnabled: dbConfig.answerValidationEnabled ?? DEFAULT_RAG_CONFIG.answerValidationEnabled,
        hnswEfSearch: dbConfig.hnswEfSearch ?? DEFAULT_RAG_CONFIG.hnswEfSearch,
        source: 'db',
      };
    }

    const enabled = await this.resolveKnowledgeBaseEnabled(
      companyId,
      nodeId,
      flowSettings?.knowledgeBaseEnabled
    );

    return {
      enabled,
      maxRetrievedChunks: flowKbConfig.maxRetrievedChunks ?? DEFAULT_RAG_CONFIG.maxRetrievedChunks,
      similarityThreshold: flowKbConfig.similarityThreshold ?? DEFAULT_RAG_CONFIG.similarityThreshold,
      contextPosition: flowKbConfig.contextPosition ?? DEFAULT_RAG_CONFIG.contextPosition,
      contextTemplate: flowKbConfig.contextTemplate ?? CONTEXT_TEMPLATE,
      embeddingModel: normalizeEmbeddingModel(flowKbConfig.embeddingModel ?? DEFAULT_RAG_CONFIG.embeddingModel),
      vectorDatabase: this.resolveVectorDatabase({ flowSettings }),
      hybridEnabled: flowKbConfig.hybridEnabled ?? DEFAULT_RAG_CONFIG.hybridEnabled,
      denseTopK: flowKbConfig.denseTopK ?? DEFAULT_RAG_CONFIG.denseTopK,
      lexicalTopK: flowKbConfig.lexicalTopK ?? DEFAULT_RAG_CONFIG.lexicalTopK,
      rrfK: flowKbConfig.rrfK ?? DEFAULT_RAG_CONFIG.rrfK,
      denseWeight: flowKbConfig.denseWeight ?? DEFAULT_RAG_CONFIG.denseWeight,
      lexicalWeight: flowKbConfig.lexicalWeight ?? DEFAULT_RAG_CONFIG.lexicalWeight,
      candidatePoolSize: flowKbConfig.candidatePoolSize ?? DEFAULT_RAG_CONFIG.candidatePoolSize,
      dedupeEnabled: flowKbConfig.dedupeEnabled ?? DEFAULT_RAG_CONFIG.dedupeEnabled,
      dedupeSimilarity: flowKbConfig.dedupeSimilarity ?? DEFAULT_RAG_CONFIG.dedupeSimilarity,
      mmrEnabled: flowKbConfig.mmrEnabled ?? DEFAULT_RAG_CONFIG.mmrEnabled,
      mmrLambda: flowKbConfig.mmrLambda ?? DEFAULT_RAG_CONFIG.mmrLambda,
      rerankEnabled: flowKbConfig.rerankEnabled ?? DEFAULT_RAG_CONFIG.rerankEnabled,
      rerankModel: flowKbConfig.rerankModel ?? DEFAULT_RAG_CONFIG.rerankModel,
      rerankTopN: flowKbConfig.rerankTopN ?? DEFAULT_RAG_CONFIG.rerankTopN,
      confidenceThreshold: flowKbConfig.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
      queryRewriteEnabled: flowKbConfig.queryRewriteEnabled ?? DEFAULT_RAG_CONFIG.queryRewriteEnabled,
      answerValidationEnabled: flowKbConfig.answerValidationEnabled ?? DEFAULT_RAG_CONFIG.answerValidationEnabled,
      hnswEfSearch: typeof flowKbConfig.hnswEfSearch === 'number'
        ? clampHnswEfSearch(flowKbConfig.hnswEfSearch)
        : DEFAULT_RAG_CONFIG.hnswEfSearch,
      source: flowSettings ? 'flow' : 'default',
    };
  }

  /**
   * Get knowledge base configuration for a node
   */
  async getNodeConfig(companyId: number, nodeId: string): Promise<KnowledgeBaseConfig | null> {
    const [config] = await db.select()
      .from(knowledgeBaseConfigs)
      .where(and(
        eq(knowledgeBaseConfigs.companyId, companyId),
        eq(knowledgeBaseConfigs.nodeId, nodeId)
      ));

    return config || null;
  }

  /**
   * Create or update knowledge base configuration
   */
  async upsertNodeConfig(
    config: InsertKnowledgeBaseConfig,
    options?: { vectorDatabaseExplicit?: boolean }
  ): Promise<KnowledgeBaseConfig> {
    const vectorDatabaseExplicit = options?.vectorDatabaseExplicit === true;

    const [existingConfig] = await db.select()
      .from(knowledgeBaseConfigs)
      .where(and(
        eq(knowledgeBaseConfigs.companyId, config.companyId),
        eq(knowledgeBaseConfigs.nodeId, config.nodeId)
      ));

    let savedConfig: KnowledgeBaseConfig;

    if (existingConfig) {
      const updatePayload: Partial<InsertKnowledgeBaseConfig> & {
        updatedAt: Date;
        vectorDatabaseDbAuthoritative?: boolean;
      } = {
        ...config,
        updatedAt: new Date(),
      };
      if (config.vectorDatabase === undefined) {
        delete updatePayload.vectorDatabase;
      } else if (vectorDatabaseExplicit) {
        updatePayload.vectorDatabaseDbAuthoritative = true;
      } else {
        delete updatePayload.vectorDatabaseDbAuthoritative;
      }
      const [updated] = await db.update(knowledgeBaseConfigs)
        .set(updatePayload)
        .where(eq(knowledgeBaseConfigs.id, existingConfig.id))
        .returning();
      savedConfig = updated;
    } else {
      const [created] = await db.insert(knowledgeBaseConfigs)
        .values({
          companyId: config.companyId,
          nodeId: config.nodeId,
          flowId: config.flowId,
          enabled: config.enabled ?? DEFAULT_RAG_CONFIG.enabled,
          maxRetrievedChunks: config.maxRetrievedChunks ?? DEFAULT_RAG_CONFIG.maxRetrievedChunks,
          similarityThreshold: config.similarityThreshold ?? DEFAULT_RAG_CONFIG.similarityThreshold,
          embeddingModel: normalizeEmbeddingModel(config.embeddingModel ?? DEFAULT_RAG_CONFIG.embeddingModel),
          contextPosition: config.contextPosition ?? DEFAULT_RAG_CONFIG.contextPosition,
          contextTemplate: config.contextTemplate ?? CONTEXT_TEMPLATE,
          vectorDatabase: config.vectorDatabase !== undefined
            ? config.vectorDatabase
            : DEFAULT_RAG_CONFIG.vectorDatabase,
          vectorDatabaseDbAuthoritative: vectorDatabaseExplicit && config.vectorDatabase !== undefined,
          hybridEnabled: config.hybridEnabled ?? DEFAULT_RAG_CONFIG.hybridEnabled,
          denseTopK: config.denseTopK ?? DEFAULT_RAG_CONFIG.denseTopK,
          lexicalTopK: config.lexicalTopK ?? DEFAULT_RAG_CONFIG.lexicalTopK,
          rrfK: config.rrfK ?? DEFAULT_RAG_CONFIG.rrfK,
          denseWeight: config.denseWeight ?? DEFAULT_RAG_CONFIG.denseWeight,
          lexicalWeight: config.lexicalWeight ?? DEFAULT_RAG_CONFIG.lexicalWeight,
          candidatePoolSize: config.candidatePoolSize ?? DEFAULT_RAG_CONFIG.candidatePoolSize,
          dedupeEnabled: config.dedupeEnabled ?? DEFAULT_RAG_CONFIG.dedupeEnabled,
          dedupeSimilarity: config.dedupeSimilarity ?? DEFAULT_RAG_CONFIG.dedupeSimilarity,
          mmrEnabled: config.mmrEnabled ?? DEFAULT_RAG_CONFIG.mmrEnabled,
          mmrLambda: config.mmrLambda ?? DEFAULT_RAG_CONFIG.mmrLambda,
          rerankEnabled: config.rerankEnabled ?? DEFAULT_RAG_CONFIG.rerankEnabled,
          rerankModel: config.rerankModel ?? DEFAULT_RAG_CONFIG.rerankModel,
          rerankTopN: config.rerankTopN ?? DEFAULT_RAG_CONFIG.rerankTopN,
          confidenceThreshold: config.confidenceThreshold ?? DEFAULT_RAG_CONFIG.confidenceThreshold,
          queryRewriteEnabled: config.queryRewriteEnabled ?? DEFAULT_RAG_CONFIG.queryRewriteEnabled,
          answerValidationEnabled: config.answerValidationEnabled ?? DEFAULT_RAG_CONFIG.answerValidationEnabled,
          hnswEfSearch: config.hnswEfSearch ?? DEFAULT_RAG_CONFIG.hnswEfSearch,
        })
        .returning();
      savedConfig = created;
    }

    invalidateNodeCredentialCache(config.companyId, config.nodeId);

    return savedConfig;
  }

  /**
   * Persist knowledge-base RAG settings from saved flow nodes into knowledge_base_configs.
   * Called when a flow is saved so runtime DB config stays aligned with flow node data.
   */
  async syncKnowledgeBaseConfigsFromFlow(
    companyId: number,
    flowId: number,
    nodes: unknown
  ): Promise<void> {
    const parsedNodes = this.parseFlowNodes(nodes);
    if (!parsedNodes) {
      return;
    }

    for (const node of parsedNodes) {
      if (node.type !== 'ai_assistant' || !node.id) {
        continue;
      }

      const nodeData = node.data;
      if (!nodeData || typeof nodeData !== 'object') {
        continue;
      }

      const flowKbConfig =
        nodeData.knowledgeBaseConfig && typeof nodeData.knowledgeBaseConfig === 'object'
          ? (nodeData.knowledgeBaseConfig as Record<string, unknown>)
          : undefined;
      const knowledgeBaseEnabled = nodeData.knowledgeBaseEnabled === true;
      const vectorDatabase = this.normalizeVectorDatabaseProvider(
        flowKbConfig?.vectorDatabase ?? nodeData.vectorDatabase
      );

      if (!knowledgeBaseEnabled && !vectorDatabase && !flowKbConfig) {
        continue;
      }

      await this.upsertNodeConfig(
        {
          companyId,
          nodeId: node.id,
          flowId,
          enabled: knowledgeBaseEnabled,
          maxRetrievedChunks:
            typeof flowKbConfig?.maxRetrievedChunks === 'number'
              ? flowKbConfig.maxRetrievedChunks
              : undefined,
          similarityThreshold:
            typeof flowKbConfig?.similarityThreshold === 'number'
              ? flowKbConfig.similarityThreshold
              : undefined,
          contextPosition:
            flowKbConfig?.contextPosition === 'before_system'
            || flowKbConfig?.contextPosition === 'after_system'
            || flowKbConfig?.contextPosition === 'before_user'
              ? flowKbConfig.contextPosition
              : undefined,
          contextTemplate:
            typeof flowKbConfig?.contextTemplate === 'string'
              ? flowKbConfig.contextTemplate
              : undefined,
          embeddingModel:
            typeof flowKbConfig?.embeddingModel === 'string'
              ? normalizeEmbeddingModel(flowKbConfig.embeddingModel)
              : DEFAULT_RAG_CONFIG.embeddingModel,
          vectorDatabase,
          hybridEnabled:
            flowKbConfig?.hybridEnabled === true
              ? true
              : flowKbConfig?.hybridEnabled === false
                ? false
                : undefined,
          denseTopK:
            typeof flowKbConfig?.denseTopK === 'number'
              ? flowKbConfig.denseTopK
              : undefined,
          lexicalTopK:
            typeof flowKbConfig?.lexicalTopK === 'number'
              ? flowKbConfig.lexicalTopK
              : undefined,
          rrfK:
            typeof flowKbConfig?.rrfK === 'number'
              ? flowKbConfig.rrfK
              : undefined,
          denseWeight:
            typeof flowKbConfig?.denseWeight === 'number'
              ? flowKbConfig.denseWeight
              : undefined,
          lexicalWeight:
            typeof flowKbConfig?.lexicalWeight === 'number'
              ? flowKbConfig.lexicalWeight
              : undefined,
          candidatePoolSize:
            typeof flowKbConfig?.candidatePoolSize === 'number'
              ? flowKbConfig.candidatePoolSize
              : undefined,
          dedupeEnabled:
            flowKbConfig?.dedupeEnabled === true
              ? true
              : flowKbConfig?.dedupeEnabled === false
                ? false
                : undefined,
          dedupeSimilarity:
            typeof flowKbConfig?.dedupeSimilarity === 'number'
              ? flowKbConfig.dedupeSimilarity
              : undefined,
          mmrEnabled:
            flowKbConfig?.mmrEnabled === true
              ? true
              : flowKbConfig?.mmrEnabled === false
                ? false
                : undefined,
          mmrLambda:
            typeof flowKbConfig?.mmrLambda === 'number'
              ? flowKbConfig.mmrLambda
              : undefined,
          rerankEnabled:
            flowKbConfig?.rerankEnabled === true
              ? true
              : flowKbConfig?.rerankEnabled === false
                ? false
                : undefined,
          rerankModel:
            typeof flowKbConfig?.rerankModel === 'string'
              ? flowKbConfig.rerankModel
              : undefined,
          rerankTopN:
            typeof flowKbConfig?.rerankTopN === 'number'
              ? flowKbConfig.rerankTopN
              : undefined,
          confidenceThreshold:
            typeof flowKbConfig?.confidenceThreshold === 'number'
              ? flowKbConfig.confidenceThreshold
              : undefined,
          queryRewriteEnabled:
            flowKbConfig?.queryRewriteEnabled === true
              ? true
              : flowKbConfig?.queryRewriteEnabled === false
                ? false
                : undefined,
          answerValidationEnabled:
            flowKbConfig?.answerValidationEnabled === true
              ? true
              : flowKbConfig?.answerValidationEnabled === false
                ? false
                : undefined,
          hnswEfSearch:
            typeof flowKbConfig?.hnswEfSearch === 'number'
              ? clampHnswEfSearch(flowKbConfig.hnswEfSearch)
              : undefined,
        },
        {
          vectorDatabaseExplicit: vectorDatabase !== null,
        }
      );

      invalidateNodeCredentialCache(companyId, node.id);
    }
  }

  /**
   * Associate document with AI Assistant node
   */
  async associateDocumentWithNode(
    documentId: number,
    companyId: number,
    nodeId: string,
    flowId?: number
  ): Promise<void> {
    await db.insert(knowledgeBaseDocumentNodes)
      .values({
        documentId,
        companyId,
        nodeId,
        flowId
      })
      .onConflictDoNothing();

    const existingConfig = await this.getNodeConfig(companyId, nodeId);
    if (!existingConfig) {
      const flowSettings = await this.getNodeFlowKnowledgeBaseSettings(companyId, nodeId);
      const flowKbConfig = flowSettings?.knowledgeBaseConfig ?? {};
      const vectorDatabase = this.resolveVectorDatabase({ flowSettings });
      await this.upsertNodeConfig({
        companyId,
        nodeId,
        flowId,
        enabled: true,
        maxRetrievedChunks: flowKbConfig.maxRetrievedChunks,
        similarityThreshold: flowKbConfig.similarityThreshold,
        contextPosition: flowKbConfig.contextPosition,
        contextTemplate: flowKbConfig.contextTemplate,
        ...(vectorDatabase ? { vectorDatabase } : {}),
      }, { vectorDatabaseExplicit: false });
    }
  }

  /**
   * Resolve whether knowledge-base enhancement should run for a node.
   * Explicit false always disables. Missing/undefined flags default to enabled;
   * attached documents auto-enable only when the flag is undefined.
   */
  async resolveKnowledgeBaseEnabled(
    companyId: number,
    nodeId: string,
    knowledgeBaseEnabled?: boolean
  ): Promise<boolean> {
    if (knowledgeBaseEnabled === false) {
      return false;
    }
    if (knowledgeBaseEnabled === true) {
      return true;
    }
    const docs = await this.getNodeDocuments(companyId, nodeId);
    return docs.length > 0;
  }

  /**
   * Get documents associated with a node
   */
  async getNodeDocuments(companyId: number, nodeId: string): Promise<KnowledgeBaseDocument[]> {
    const results = await db.select({ document: knowledgeBaseDocuments })
      .from(knowledgeBaseDocuments)
      .innerJoin(
        knowledgeBaseDocumentNodes,
        eq(knowledgeBaseDocuments.id, knowledgeBaseDocumentNodes.documentId)
      )
      .where(and(
        eq(knowledgeBaseDocumentNodes.companyId, companyId),
        eq(knowledgeBaseDocumentNodes.nodeId, nodeId)
      ));

    return results.map(r => r.document);
  }

  /**
   * Get chunks for a document (for export/download)
   */
  async getDocumentChunks(companyId: number, documentId: number): Promise<Array<{
    id: number;
    chunkIndex: number;
    content: string;
    tokenCount: number | null;
    startPosition: number | null;
    endPosition: number | null;
    recordId: string | null;
    sectionLabel: string | null;
  }>> {
    const [document] = await db.select()
      .from(knowledgeBaseDocuments)
      .where(and(
        eq(knowledgeBaseDocuments.id, documentId),
        eq(knowledgeBaseDocuments.companyId, companyId)
      ));

    if (!document) {
      throw new Error('Document not found');
    }

    const chunks = await db.select({
      id: knowledgeBaseChunks.id,
      chunkIndex: knowledgeBaseChunks.chunkIndex,
      content: knowledgeBaseChunks.content,
      tokenCount: knowledgeBaseChunks.tokenCount,
      startPosition: knowledgeBaseChunks.startPosition,
      endPosition: knowledgeBaseChunks.endPosition,
      recordId: knowledgeBaseChunks.recordId,
      sectionLabel: knowledgeBaseChunks.sectionLabel,
    })
      .from(knowledgeBaseChunks)
      .where(eq(knowledgeBaseChunks.documentId, documentId))
      .orderBy(knowledgeBaseChunks.chunkIndex);

    return chunks;
  }
}


let knowledgeBaseServiceInstance: KnowledgeBaseService | null = null;

export function isKnowledgeBaseProviderSetupError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return (
    message.includes('Choose Pinecone or pgvector') ||
    message.includes('No vector database selected') ||
    message.includes('Pinecone API Key') ||
    message.includes('pgvector') ||
    message.includes('knowledge_base_vectors') ||
    message.includes('vector extension')
  );
}

export function recordKnowledgeBaseProviderSetupFailure(
  companyId: number,
  nodeId: string,
  error: unknown
): string {
  const message = error instanceof Error ? error.message : String(error);
  setNodeKbProviderHealth(companyId, nodeId, { ok: false, message });
  console.error('[Knowledge Base] RAG disabled for turn — provider setup error', JSON.stringify({
    companyId,
    nodeId,
    errorType: 'provider_setup',
    message,
    ragDisabledForTurn: true,
  }));
  return message;
}

export function getKnowledgeBaseService(): KnowledgeBaseService {
  if (!knowledgeBaseServiceInstance) {
    knowledgeBaseServiceInstance = new KnowledgeBaseService();
  }
  return knowledgeBaseServiceInstance;
}

export default {
  KNOWLEDGE_BASE_RETRIEVAL_TOOL_NAME,
  createKnowledgeBaseTurnBudgetTracker,
  formatKnowledgeBaseToolResultForModel,
  buildKnowledgeBaseRetrievalToolDefinition: () =>
    getKnowledgeBaseService().buildKnowledgeBaseRetrievalToolDefinition(),
  createKnowledgeBaseRetrievalTool: (
    options: KnowledgeBaseRetrievalToolOptions,
    hooks?: {
      onRetrievalComplete?: (result: KnowledgeBaseRetrievalToolExecuteResult) => void;
      resolveBaseSystemPrompt?: () => string;
    }
  ) => getKnowledgeBaseService().createKnowledgeBaseRetrievalTool(options, hooks),
  formatRetrievalResultsForPrompt: (
    companyId: number,
    nodeId: string,
    systemPrompt: string,
    retrievalResults: Array<{
      chunk: { content: string };
      similarity: number;
      document: unknown;
    }>,
    options?: {
      maxContextTokens?: number;
    }
  ) =>
    getKnowledgeBaseService().formatRetrievalResultsForPrompt(
      companyId,
      nodeId,
      systemPrompt,
      retrievalResults as RetrievalResult[],
      options
    ),
  processDocument: (documentId: number) => getKnowledgeBaseService().processDocument(documentId),
  retrieveContext: (
    companyId: number,
    nodeId: string,
    query: string,
    options?: { maxContextTokens?: number; maxResultsOverride?: number; historyText?: string }
  ) =>
    getKnowledgeBaseService().retrieveContext(companyId, nodeId, query, options),
  enhancePromptWithContext: (
    companyId: number,
    nodeId: string,
    systemPrompt: string,
    userQuery: string,
    options?: {
      maxContextTokens?: number;
      historyText?: string;
    }
  ) =>
    getKnowledgeBaseService().enhancePromptWithContext(companyId, nodeId, systemPrompt, userQuery, options),
  getNodeConfig: (companyId: number, nodeId: string) =>
    getKnowledgeBaseService().getNodeConfig(companyId, nodeId),
  upsertNodeConfig: (config: any, options?: { vectorDatabaseExplicit?: boolean }) =>
    getKnowledgeBaseService().upsertNodeConfig(config, options),
  associateDocumentWithNode: (documentId: number, companyId: number, nodeId: string, flowId?: number) =>
    getKnowledgeBaseService().associateDocumentWithNode(documentId, companyId, nodeId, flowId),
  getNodeDocuments: (companyId: number, nodeId: string) =>
    getKnowledgeBaseService().getNodeDocuments(companyId, nodeId),
  resolveKnowledgeBaseEnabled: (companyId: number, nodeId: string, knowledgeBaseEnabled?: boolean) =>
    getKnowledgeBaseService().resolveKnowledgeBaseEnabled(companyId, nodeId, knowledgeBaseEnabled),
  getDocumentChunks: (companyId: number, documentId: number) =>
    getKnowledgeBaseService().getDocumentChunks(companyId, documentId),
  deleteDocumentVectors: (companyId: number, nodeId: string, documentId: number) =>
    getKnowledgeBaseService().deleteDocumentVectors(companyId, nodeId, documentId),
  validateVectorDatabaseForNode: (companyId: number, nodeId: string) =>
    getKnowledgeBaseService().validateVectorDatabaseForNode(companyId, nodeId),
  deleteDocumentVectorsForAllNodes: (
    companyId: number,
    documentId: number,
    fallbackNodeId?: string | null
  ) =>
    getKnowledgeBaseService().deleteDocumentVectorsForAllNodes(companyId, documentId, fallbackNodeId),
  deleteDocument: (companyId: number, documentId: number) =>
    getKnowledgeBaseService().deleteDocument(companyId, documentId),
  getProviderHealth: (companyId: number, nodeId: string) =>
    getKnowledgeBaseService().getProviderHealth(companyId, nodeId),
  syncKnowledgeBaseConfigsFromFlow: (companyId: number, flowId: number, nodes: unknown) =>
    getKnowledgeBaseService().syncKnowledgeBaseConfigsFromFlow(companyId, flowId, nodes),
};
