-- Migration: distinguish explicit vector_database DB values from legacy unset rows
-- Date: 2026-05-22
-- Legacy rows (null vector_database, authoritative=false) continue flow/Pinecone fallback.
-- Rows with an explicit provider in DB are treated as authoritative.

ALTER TABLE knowledge_base_configs
ADD COLUMN IF NOT EXISTS vector_database_db_authoritative BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE knowledge_base_configs
SET vector_database_db_authoritative = TRUE
WHERE vector_database IN ('pinecone', 'pgvector');

SELECT 'vector_database_db_authoritative migration complete' AS status;
