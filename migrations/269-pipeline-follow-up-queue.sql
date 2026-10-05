ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_deals_follow_up_queue
  ON deals (company_id, pipeline_id, stage_id, last_contacted_at ASC NULLS FIRST, created_at, id);
CREATE TABLE IF NOT EXISTS pipeline_contact_receipts (
  message_id integer PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contacted_at timestamptz NOT NULL
);
