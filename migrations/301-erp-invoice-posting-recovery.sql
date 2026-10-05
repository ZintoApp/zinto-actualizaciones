BEGIN;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS posting_recovery_history jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
