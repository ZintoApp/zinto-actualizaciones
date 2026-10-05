-- Persist adaptive chunking metadata on processed documents for dynamic top-K retrieval.
ALTER TABLE knowledge_base_documents
  ADD COLUMN IF NOT EXISTS chunk_size integer,
  ADD COLUMN IF NOT EXISTS average_chunk_tokens real;

-- Align knowledge_base_configs defaults with shared/rag-defaults.ts
ALTER TABLE knowledge_base_configs
  ALTER COLUMN max_retrieved_chunks SET DEFAULT 10,
  ALTER COLUMN similarity_threshold SET DEFAULT 0;
