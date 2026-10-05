-- AI-powered Flow Builder Creator: persistent history/audit and versioned node RAG chunks (migration 233).

CREATE TABLE IF NOT EXISTS ai_flow_creator_threads (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL UNIQUE REFERENCES flows(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT,
  model TEXT,
  credential_source TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_flow_creator_threads_company
  ON ai_flow_creator_threads(company_id);

CREATE TABLE IF NOT EXISTS ai_flow_creator_messages (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES ai_flow_creator_threads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generation_id UUID,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  kind TEXT NOT NULL DEFAULT 'message',
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_flow_creator_messages_thread_created
  ON ai_flow_creator_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_flow_creator_messages_generation
  ON ai_flow_creator_messages(generation_id);

CREATE TABLE IF NOT EXISTS ai_flow_creator_revisions (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES ai_flow_creator_threads(id) ON DELETE CASCADE,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generation_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'applied_with_manual_edits')),
  summary TEXT NOT NULL,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  setup_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_graph_hash TEXT NOT NULL,
  generated_graph_hash TEXT NOT NULL,
  accepted_graph_hash TEXT NOT NULL,
  saved_graph_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_flow_creator_revisions_flow_created
  ON ai_flow_creator_revisions(flow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_flow_creator_revisions_company
  ON ai_flow_creator_revisions(company_id);

ALTER TABLE node_embeddings ADD COLUMN IF NOT EXISTS chunk_key VARCHAR NOT NULL DEFAULT 'overview';
ALTER TABLE node_embeddings ADD COLUMN IF NOT EXISTS content_hash VARCHAR NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'node_embeddings_node_type_key') THEN
    ALTER TABLE node_embeddings DROP CONSTRAINT node_embeddings_node_type_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'node_embeddings_node_type_unique') THEN
    ALTER TABLE node_embeddings DROP CONSTRAINT node_embeddings_node_type_unique;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS node_embeddings_node_type_chunk_key_unique
  ON node_embeddings(node_type, chunk_key);
