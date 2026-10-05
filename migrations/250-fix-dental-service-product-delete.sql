-- Preserve dental treatment history when a catalog service is removed.
-- The former composite SET NULL foreign key also tried to clear company_id,
-- which is required and caused product deletion to fail.
ALTER TABLE dental_treatment_procedures
  DROP CONSTRAINT IF EXISTS dental_treatment_procedures_product_company_fk;

ALTER TABLE dental_treatment_procedures
  ADD CONSTRAINT dental_treatment_procedures_product_company_fk
  FOREIGN KEY (product_id)
  REFERENCES products(id)
  ON DELETE SET NULL;
