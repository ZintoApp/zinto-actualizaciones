import type { VectorDatabaseProvider } from '../../shared/rag-defaults';

export type VectorStoreProvider = VectorDatabaseProvider;

export interface VectorStoreMetadata {
  companyId: number;
  nodeId: string;
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  documentName: string;
  mimeType: string;
  startPosition: number;
  endPosition: number;
  createdAt: string;
  recordId?: string;
  sectionLabel?: string;
  sourceDocumentName?: string;
  language?: string;
  contentHash?: string;
}

export interface VectorStoreRecord {
  id: string;
  values: number[];
  metadata: VectorStoreMetadata;
  embeddingModel: string;
}

export interface VectorSearchOptions {
  companyId: number;
  nodeId: string;
  queryEmbedding: number[];
  topK: number;
  similarityThreshold?: number;
  documentIds?: number[];
  namespaceOverride?: string;
  embeddingModel?: string;
  efSearch?: number;
}

export interface VectorSearchMatch {
  id: string;
  score: number;
  metadata: VectorStoreMetadata;
}

export interface VectorStore {
  ensureStorage(companyId: number, nodeId: string): Promise<void>;
  upsertVectors(companyId: number, nodeId: string, vectors: VectorStoreRecord[]): Promise<void>;
  queryVectors(options: VectorSearchOptions): Promise<VectorSearchMatch[]>;
  fetchVectorsByChunkIds(
    companyId: number,
    nodeId: string,
    chunkIds: number[],
    embeddingModel: string
  ): Promise<Map<number, number[]>>;
  deleteVectors(companyId: number, nodeId: string, vectorIds: string[]): Promise<void>;
  deleteDocumentVectors(companyId: number, nodeId: string, documentId: number): Promise<void>;
  deleteNodeVectors(companyId: number, nodeId: string): Promise<void>;
}
