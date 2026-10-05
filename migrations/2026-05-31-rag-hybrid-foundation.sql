-- Migration: RAG hybrid retrieval foundation (lexical tsvector + pipeline tunables)
-- Date: 2026-05-31
-- Adds content_tsv for lexical search and hybrid pipeline config columns on knowledge_base_configs.

ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content,''))) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_content_tsv
ON knowledge_base_chunks USING GIN (content_tsv);

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS hybrid_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS dense_top_k INTEGER NOT NULL DEFAULT 30;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS lexical_top_k INTEGER NOT NULL DEFAULT 30;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS rrf_k INTEGER NOT NULL DEFAULT 60;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS dense_weight REAL NOT NULL DEFAULT 1;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS lexical_weight REAL NOT NULL DEFAULT 1;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS candidate_pool_size INTEGER NOT NULL DEFAULT 40;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS dedupe_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS dedupe_similarity REAL NOT NULL DEFAULT 0.95;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS mmr_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS mmr_lambda REAL NOT NULL DEFAULT 0.5;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS rerank_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS rerank_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS rerank_top_n INTEGER NOT NULL DEFAULT 6;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS confidence_threshold REAL NOT NULL DEFAULT 0.5;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS query_rewrite_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS hnsw_ef_search INTEGER NOT NULL DEFAULT 100;

SELECT 'rag hybrid foundation migration complete' AS status;
