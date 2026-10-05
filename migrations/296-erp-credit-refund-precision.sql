BEGIN;
ALTER TABLE erp_credit_note_refunds ALTER COLUMN amount TYPE numeric(16,6);
COMMIT;
