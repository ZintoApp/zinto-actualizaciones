/**
 * Single source of truth for RAG / knowledge-base defaults.
 * Import from here — do not duplicate these literals elsewhere.
 */

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large' as const;

export const EMBEDDING_MODEL_OPTIONS = [
  'text-embedding-3-large',
  'text-embedding-3-small',
] as const;

export type EmbeddingModelId = typeof EMBEDDING_MODEL_OPTIONS[number];

/** Vector stores (Pinecone / pgvector) are provisioned for 1536-dimension embeddings. */
export const EMBEDDING_DIMENSIONS = 1536;

export function normalizeEmbeddingModel(model: string | null | undefined): EmbeddingModelId {
  if (model === 'text-embedding-3-small') {
    return 'text-embedding-3-small';
  }
  return 'text-embedding-3-large';
}

export function getEmbeddingModelLabel(model: string): string {
  return normalizeEmbeddingModel(model) === 'text-embedding-3-small'
    ? 'OpenAI Embedding 3 Small (Fast)'
    : 'OpenAI Embedding 3 Large (Best quality)';
}

export const CONTEXT_TEMPLATE =
  'The knowledge base context below is the sole source of truth for answering this question.\n\n' +
  'Base your answer only on what is explicitly stated in the context. When you cite information, reference the bracketed source tags [S#] shown alongside each chunk.\n\n' +
  'Do not use prior knowledge, assumptions, or information from outside this context. Do not infer or fill in details that are not directly supported by the context.\n\n' +
  'If the context does not contain the information needed to answer the question, say clearly that you could not find that information in the knowledge base — do not invent an answer.\n\n' +
  'Only combine chunks when they explicitly contain complementary information about the same topic. Do not introduce new relationships between chunks that are not directly stated.\n\n' +
  '{context}\n\n' +
  'Answer guidelines:\n\n' +
  'Be natural and concise; write like a helpful human, not a rigid policy bot\n' +
  'Support factual claims with the relevant [S#] citations from the context\n' +
  'Prefer direct extraction or tight paraphrasing from the context\n' +
  'If multiple chunks conflict, do not resolve the conflict; report the inconsistency\n' +
  'Never add examples, explanations, or extensions that are not present in the context';

/** Greeting/courtesy expressions that should bypass knowledge-base retrieval. */
export const DEFAULT_GREETING_ACKNOWLEDGEMENT_EXPRESSIONS: string[] = [
  // English greetings, acknowledgements, and courtesy-only expressions.
  'hi', 'hello', 'hello there', 'hey', 'hey there', 'yo',
  'good morning', 'good afternoon', 'good evening', 'good night', 'how are you',
  'thanks', 'thank', 'thank you', 'many thanks', 'thx', 'appreciate it', 'much appreciated',
  'ok', 'okay', 'yes', 'no', 'yep', 'nope', 'sure', 'nice', 'great', 'cool',
  'perfect', 'awesome', 'bye', 'goodbye', 'cheers', 'welcome', 'you are welcome',
  // Spanish greetings, acknowledgements, and courtesy-only expressions.
  'hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal',
  'como estas', 'como esta', 'gracias', 'muchas gracias', 'mil gracias', 'vale',
  'listo', 'de acuerdo', 'si', 'claro', 'perfecto', 'excelente', 'genial',
  'adios', 'hasta luego', 'nos vemos', 'de nada', 'con gusto',
  '👍',
];

export const GREETING_ACKNOWLEDGEMENT_EXPRESSION_MAX_COUNT = 200;
export const GREETING_ACKNOWLEDGEMENT_EXPRESSION_MAX_LENGTH = 200;

/**
 * Normalize greeting acknowledgement expressions.
 * - `null`/`undefined`/malformed → default list
 * - valid empty array → preserved (disables greeting bypass)
 */
export function normalizeGreetingAcknowledgementExpressions(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [...DEFAULT_GREETING_ACKNOWLEDGEMENT_EXPRESSIONS];
  }
  if (!Array.isArray(value)) {
    return [...DEFAULT_GREETING_ACKNOWLEDGEMENT_EXPRESSIONS];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    if (trimmed.length > GREETING_ACKNOWLEDGEMENT_EXPRESSION_MAX_LENGTH) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
    if (normalized.length >= GREETING_ACKNOWLEDGEMENT_EXPRESSION_MAX_COUNT) break;
  }

  return normalized;
}

export type VectorDatabaseProvider = 'pinecone' | 'pgvector';

/**
 * Production-recommended RAG defaults (recall → precision → grounding).
 *
 * - Hybrid retrieval (dense + lexical) with query rewrite maximizes recall on varied phrasing.
 * - Candidate pool + dedupe + MMR diversify fused results before listwise rerank.
 * - Rerank (gpt-4o-mini, top 6) sharpens precision; confidenceThreshold gates weak turns.
 * - answerValidationEnabled stays off by default — enable when post-generation grounding checks are required.
 */
export const DEFAULT_RAG_CONFIG = {
  enabled: true,
  maxRetrievedChunks: 7,
  /** Optional dense similarity floor only; not used as a fill/rescue target. */
  similarityThreshold: 0.7,
  contextPosition: 'after_system' as const,
  contextTemplate: CONTEXT_TEMPLATE,
  greetingAcknowledgementExpressions: [...DEFAULT_GREETING_ACKNOWLEDGEMENT_EXPRESSIONS],
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  vectorDatabase: null as VectorDatabaseProvider | null,
  hybridEnabled: true,
  denseTopK: 30,
  lexicalTopK: 30,
  rrfK: 60,
  denseWeight: 1,
  lexicalWeight: 1,
  candidatePoolSize: 40,
  dedupeEnabled: true,
  dedupeSimilarity: 0.95,
  mmrEnabled: true,
  mmrLambda: 0.5,
  rerankEnabled: true,
  rerankModel: 'gpt-4o-mini',
  rerankTopN: 6,
  confidenceThreshold: 0.5,
  queryRewriteEnabled: true,
  answerValidationEnabled: false,
  hnswEfSearch: 100,
};

/** LLM listwise rerank timeout — structured-output round-trip to OpenAI. */
export const RERANK_TIMEOUT_MS = 6000;

/** LLM post-generation answer grounding validation timeout. */
export const ANSWER_VALIDATION_TIMEOUT_MS = 6000;

/** LLM query-understanding timeout — pre-retrieval structured-output call. */
export const QUERY_REWRITE_TIMEOUT_MS = 5000;

/** Max expansion queries emitted by query rewrite (excludes primary searchQuery). */
export const QUERY_REWRITE_MAX_EXPANSIONS = 2;

/** Max recent conversation turns passed to query rewrite. */
export const QUERY_REWRITE_HISTORY_TURNS = 6;

/** Max chars per candidate snippet in rerank prompt (token bound). */
export const RERANK_SNIPPET_CHARS = 600;

/** Cap listwise rerank input size (matches default candidatePoolSize). */
export const RERANK_MAX_CANDIDATES = 40;

/** pgvector `hnsw.ef_search` valid range (inclusive). */
export const HNSW_EF_SEARCH_MIN = 1;
export const HNSW_EF_SEARCH_MAX = 1000;

export function clampHnswEfSearch(value: number): number {
  return Math.min(HNSW_EF_SEARCH_MAX, Math.max(HNSW_EF_SEARCH_MIN, Math.round(value)));
}

export const RAG_CHUNK_DEFAULTS = {
  baseChunkSize: 1000,
  baseChunkOverlap: 200,
  shortDocTokenThreshold: 2000,
  longDocTokenThreshold: 50000,
  shortDocChunkSize: 400,
  shortDocChunkOverlap: 80,
  longDocChunkSize: 2000,
  longDocChunkOverlap: 400,
};

export type RagContextPosition = 'before_system' | 'after_system' | 'before_user';

export interface RagConfigShape {
  enabled: boolean;
  maxRetrievedChunks: number;
  similarityThreshold: number;
  contextPosition: RagContextPosition;
  contextTemplate: string;
  greetingAcknowledgementExpressions: string[];
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
}

/** Choose chunk size/overlap based on estimated document length. */
export function computeAdaptiveChunkParams(documentTokenCount: number): {
  chunkSize: number;
  chunkOverlap: number;
} {
  const d = RAG_CHUNK_DEFAULTS;
  if (documentTokenCount <= d.shortDocTokenThreshold) {
    return { chunkSize: d.shortDocChunkSize, chunkOverlap: d.shortDocChunkOverlap };
  }
  if (documentTokenCount >= d.longDocTokenThreshold) {
    return { chunkSize: d.longDocChunkSize, chunkOverlap: d.longDocChunkOverlap };
  }
  return { chunkSize: d.baseChunkSize, chunkOverlap: d.baseChunkOverlap };
}

/** Derive effective top-K from token budget; config maxRetrievedChunks remains the upper bound. */
export function computeEffectiveTopK(
  maxRetrievedChunks: number,
  targetContextTokens: number | undefined,
  averageChunkTokens: number | undefined
): number {
  if (!targetContextTokens || !averageChunkTokens || averageChunkTokens <= 0) {
    return maxRetrievedChunks;
  }
  const derived = Math.ceil(targetContextTokens / averageChunkTokens);
  return Math.min(maxRetrievedChunks, Math.max(1, derived));
}

export function isDefaultContextTemplate(template: string | null | undefined): boolean {
  if (!template) return true;
  return template.trim() === CONTEXT_TEMPLATE.trim();
}
