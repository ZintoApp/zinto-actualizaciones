BEGIN;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS correction_history jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
