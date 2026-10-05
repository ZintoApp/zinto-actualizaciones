-- Migration: node embeddings for AI flow assistant RAG
-- Date: 2026-06-24
-- Description: Create node_embeddings table for semantic node type retrieval

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS node_embeddings (
  id SERIAL PRIMARY KEY,
  node_type VARCHAR NOT NULL UNIQUE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_embeddings_embedding_hnsw
ON node_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_node_embeddings_node_type ON node_embeddings(node_type);

SELECT 'node embeddings migration complete' AS status;
