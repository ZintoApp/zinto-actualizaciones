-- Migration: Set default RAG similarity threshold to 0.70
-- Description: Align knowledge_base_configs default with shared/rag-defaults.ts

ALTER TABLE knowledge_base_configs
  ALTER COLUMN similarity_threshold SET DEFAULT 0.7;

UPDATE knowledge_base_configs
SET similarity_threshold = 0.7
WHERE similarity_threshold = 0;
