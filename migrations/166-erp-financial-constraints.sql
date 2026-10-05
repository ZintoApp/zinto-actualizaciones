BEGIN;

WITH ranked_base_currencies AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM currencies
  WHERE is_base_currency = TRUE
)
UPDATE currencies
SET is_base_currency = FALSE,
    updated_at = NOW()
WHERE id IN (
  SELECT id
  FROM ranked_base_currencies
  WHERE rn > 1
);

WITH ranked_exchange_rates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, from_currency, to_currency, effective_date
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM exchange_rate_history
)
DELETE FROM exchange_rate_history
WHERE id IN (
  SELECT id
  FROM ranked_exchange_rates
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS one_base_currency_per_company
  ON currencies(company_id)
  WHERE is_base_currency = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rate_history_company_pair_effective_unique
  ON exchange_rate_history(company_id, from_currency, to_currency, effective_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fiscal_year_dates_in_order'
  ) THEN
    ALTER TABLE fiscal_years
      ADD CONSTRAINT fiscal_year_dates_in_order
      CHECK (start_date < end_date) NOT VALID;
  END IF;
END $$;

COMMIT;
