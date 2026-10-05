BEGIN;
ALTER TABLE erp_invoice_noncash_settlements ALTER COLUMN amount TYPE numeric(16,6), ALTER COLUMN base_amount TYPE numeric(18,6);
COMMIT;
