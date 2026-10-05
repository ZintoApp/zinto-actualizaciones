BEGIN;
ALTER TABLE erp_invoice_noncash_settlements ADD COLUMN IF NOT EXISTS original_allocation_id integer;
ALTER TABLE erp_invoice_noncash_settlements ADD COLUMN IF NOT EXISTS reason text;
CREATE UNIQUE INDEX IF NOT EXISTS erp_noncash_id_company_key ON erp_invoice_noncash_settlements(id,company_id);
ALTER TABLE erp_invoice_noncash_settlements ADD CONSTRAINT erp_noncash_original_tenant_fk FOREIGN KEY(original_allocation_id,company_id) REFERENCES erp_invoice_noncash_settlements(id,company_id);
ALTER TABLE erp_invoice_noncash_settlements DROP CONSTRAINT IF EXISTS erp_invoice_noncash_settlements_amount_check;
ALTER TABLE erp_invoice_noncash_settlements DROP CONSTRAINT IF EXISTS erp_invoice_noncash_settlements_base_amount_check;
ALTER TABLE erp_invoice_noncash_settlements DROP CONSTRAINT IF EXISTS erp_invoice_noncash_settlements_base_check;
ALTER TABLE erp_invoice_noncash_settlements ADD CONSTRAINT erp_noncash_signed_correction_check CHECK(
 (original_allocation_id IS NULL AND amount>0 AND base_amount>=0) OR
 (original_allocation_id IS NOT NULL AND original_allocation_id<>id AND (amount<>0 OR base_amount<>0) AND length(trim(reason))>0));
COMMIT;
