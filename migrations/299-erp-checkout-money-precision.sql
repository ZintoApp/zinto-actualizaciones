BEGIN;
ALTER TABLE erp_invoice_checkout_sessions ALTER COLUMN amount TYPE numeric(16,6);
COMMIT;
