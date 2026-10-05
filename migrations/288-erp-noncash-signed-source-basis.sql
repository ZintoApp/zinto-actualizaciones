BEGIN;
ALTER TABLE erp_invoice_noncash_settlements ADD COLUMN IF NOT EXISTS carrying_basis text NOT NULL DEFAULT 'nonnegative';
ALTER TABLE erp_invoice_noncash_settlements DROP CONSTRAINT IF EXISTS erp_noncash_signed_correction_check;
ALTER TABLE erp_invoice_noncash_settlements DROP CONSTRAINT IF EXISTS erp_noncash_carrying_basis_check;
ALTER TABLE erp_invoice_noncash_settlements ADD CONSTRAINT erp_noncash_carrying_basis_check CHECK(carrying_basis IN('nonnegative','signed_source'));
ALTER TABLE erp_invoice_noncash_settlements ADD CONSTRAINT erp_noncash_signed_correction_check CHECK(
 (original_allocation_id IS NULL AND amount>0 AND (base_amount>=0 OR (carrying_basis='signed_source' AND reason IS NOT NULL AND length(trim(reason))>0))) OR
 (original_allocation_id IS NOT NULL AND original_allocation_id<>id AND (amount<>0 OR base_amount<>0) AND reason IS NOT NULL AND length(trim(reason))>0));
COMMIT;
