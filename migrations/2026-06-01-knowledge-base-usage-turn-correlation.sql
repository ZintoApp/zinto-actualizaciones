-- Migration: Correlate knowledge_base_usage rows within a single assistant turn
-- Description: Adds turn_correlation_id so eager prime and follow-up retrieve_knowledge_base
--              calls from the same turn can be grouped in diagnostics.

ALTER TABLE knowledge_base_usage
  ADD COLUMN IF NOT EXISTS turn_correlation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_usage_turn_correlation_id
  ON knowledge_base_usage(turn_correlation_id)
  WHERE turn_correlation_id IS NOT NULL;

SELECT 'Knowledge base usage turn correlation migration complete' AS status;
