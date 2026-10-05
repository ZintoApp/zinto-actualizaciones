-- Ensure transfer numbers stay unique per company.
UPDATE stock_transfers
SET transfer_number = CONCAT('TRF-LEGACY-', id)
WHERE transfer_number IS NULL OR BTRIM(transfer_number) = '';

ALTER TABLE stock_transfers
  ALTER COLUMN transfer_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_company_transfer_number
  ON stock_transfers(company_id, transfer_number);
