
export { DocumentUpload } from './DocumentUpload';
export { DocumentList } from './DocumentList';
export { RAGConfiguration } from './RAGConfiguration';
export { KnowledgeBaseTester } from './KnowledgeBaseTester';
export { ProcessorStatus } from './ProcessorStatus';


export interface KnowledgeBaseDocument {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  processingError?: string;
  processingDurationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RAGConfig {
  id?: number;
  enabled: boolean;
  maxRetrievedChunks: number;
  similarityThreshold: number;
  embeddingModel: string;
  contextPosition: 'before_system' | 'after_system' | 'before_user';
  contextTemplate: string;
  greetingAcknowledgementExpressions?: string[];
}

export interface SearchResult {
  content: string;
  similarity: number;
  document: {
    id: number;
    filename: string;
    originalName: string;
  };
  chunk: {
    index: number;
    tokenCount: number;
  };
}

export interface TestResult {
  originalPrompt: string;
  enhancedPrompt: string;
  contextUsed: string[];
  stats: {
    chunksRetrieved: number;
    chunksUsed: number;
    averageSimilarity: number;
    retrievalDurationMs: number;
  };
}
