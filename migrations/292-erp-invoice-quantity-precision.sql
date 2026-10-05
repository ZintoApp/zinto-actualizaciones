BEGIN;
-- Preserve the existing ten integer digits while retaining quantities accepted
-- by shared ERP service billing. Existing values remain numerically unchanged.
ALTER TABLE invoice_items ALTER COLUMN quantity TYPE numeric(14,4);
COMMIT;
