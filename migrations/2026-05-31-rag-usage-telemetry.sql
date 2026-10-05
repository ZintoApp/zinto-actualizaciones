-- Migration: RAG usage telemetry — per-stage retrieval stats and turn decisions
-- Description: Expands knowledge_base_usage with hybrid pipeline telemetry, chunk scores,
--              abstention reasons, and post-generation validation outcomes.

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS confidence REAL;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS confidence_threshold REAL;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS dense_candidate_count INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS lexical_candidate_count INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS fused_candidate_count INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS deduped_count INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS dedupe_collapsed INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS mmr_applied BOOLEAN;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS rerank_applied BOOLEAN;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS top_rerank_score REAL;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS rerank_margin REAL;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS query_rewrite_applied BOOLEAN;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS rewritten_query TEXT;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS expansion_query_count INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS query_rewrite_duration_ms INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS dense_duration_ms INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS lexical_duration_ms INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS rerank_duration_ms INTEGER;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS chunk_telemetry JSONB DEFAULT '[]';

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS abstained BOOLEAN DEFAULT FALSE;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS abstain_reason TEXT;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS answer_validated BOOLEAN DEFAULT FALSE;

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS validation_grounded BOOLEAN;

SELECT 'RAG usage telemetry migration complete' AS status;
