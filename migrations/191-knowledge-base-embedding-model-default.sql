-- Migration: Default knowledge base embedding model to text-embedding-3-large
-- Description: Updates column defaults; existing rows keep their current model until changed

ALTER TABLE knowledge_base_configs
  ALTER COLUMN embedding_model SET DEFAULT 'text-embedding-3-large';

ALTER TABLE knowledge_base_documents
  ALTER COLUMN embedding_model SET DEFAULT 'text-embedding-3-large';

-- knowledge_base_vectors is created later in 2026-05-22-pgvector-foundation.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_base_vectors'
  ) THEN
    ALTER TABLE knowledge_base_vectors
      ALTER COLUMN embedding_model SET DEFAULT 'text-embedding-3-large';
  END IF;
END $$;
