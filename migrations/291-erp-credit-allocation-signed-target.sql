BEGIN;
ALTER TABLE erp_credit_note_allocations ADD COLUMN IF NOT EXISTS carrying_basis text NOT NULL DEFAULT 'nonnegative';
ALTER TABLE erp_credit_note_allocations DROP CONSTRAINT IF EXISTS erp_credit_note_allocations_target_base_amount_check;
ALTER TABLE erp_credit_note_allocations DROP CONSTRAINT IF EXISTS erp_credit_allocation_carrying_basis_check;
ALTER TABLE erp_credit_note_allocations ADD CONSTRAINT erp_credit_allocation_carrying_basis_check
 CHECK(carrying_basis IN('nonnegative','signed_target') AND
   (target_base_amount>=0 OR (carrying_basis='signed_target' AND length(trim(reason))>0)));
COMMIT;
