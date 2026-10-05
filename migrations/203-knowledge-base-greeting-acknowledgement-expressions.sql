-- Migration: Drop greeting_acknowledgement_expressions from knowledge_base_configs
-- Description: Greeting ACK expressions are flow-node settings (like prompts), not DB RAG config

ALTER TABLE knowledge_base_configs
  DROP COLUMN IF EXISTS greeting_acknowledgement_expressions;
