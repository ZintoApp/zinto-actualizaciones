-- Migration: pgvector foundation for knowledge base vector storage
-- Date: 2026-05-22
-- Description: Enable pgvector extension, add vector database config, and create knowledge_base_vectors table

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS vector_database TEXT
CHECK (vector_database IS NULL OR vector_database IN ('pinecone', 'pgvector'));

CREATE TABLE IF NOT EXISTS knowledge_base_vectors (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES knowledge_base_documents(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES knowledge_base_chunks(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  flow_id INTEGER REFERENCES flows(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  embedding vector(1536) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, node_id, chunk_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_vectors_embedding_hnsw
ON knowledge_base_vectors USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_vectors_company_id ON knowledge_base_vectors(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_vectors_node_id ON knowledge_base_vectors(node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_vectors_document_id ON knowledge_base_vectors(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_vectors_chunk_id ON knowledge_base_vectors(chunk_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_vectors_embedding_model ON knowledge_base_vectors(embedding_model);

SELECT 'pgvector foundation migration complete' AS status;
