-- Migration: Knowledge base chunk metadata for structure-aware ingestion
-- Date: 2026-05-31
-- Adds nullable metadata columns on knowledge_base_chunks for new uploads only (no backfill).

ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS record_id text;

ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS section_label text;

ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS source_document_name text;

ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS language text;

ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_content_hash
ON knowledge_base_chunks (content_hash);

SELECT 'knowledge base chunk metadata structure migration complete' AS status;
