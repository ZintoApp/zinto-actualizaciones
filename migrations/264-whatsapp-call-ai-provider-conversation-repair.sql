-- Repair databases that applied an earlier version of migration 262 before
-- the AI provider conversation identifier was added to the calls table.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS ai_provider_conversation_id text;
