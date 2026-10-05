-- Add parent_invoice_id column and foreign key to invoices table
-- Created to match application schema (shared/schema.ts)
BEGIN;

-- Add column if missing
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS parent_invoice_id integer;

-- Add composite foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_parent_invoice_fk'
  ) THEN
    ALTER TABLE invoices
    ADD CONSTRAINT invoices_parent_invoice_fk
    FOREIGN KEY (parent_invoice_id, company_id)
    REFERENCES invoices(id, company_id)
    ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;

