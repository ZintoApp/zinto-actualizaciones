-- Migration: enforce company-scoped variant SKU uniqueness
-- Description: prevent duplicate sellable variant SKUs per company while allowing null SKUs

BEGIN;

DO $$
DECLARE
  duplicate_pair_count integer;
  duplicate_samples text;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_pair_count
  FROM (
    SELECT company_id, sku
    FROM product_variants
    WHERE sku IS NOT NULL
    GROUP BY company_id, sku
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_pair_count > 0 THEN
    SELECT string_agg(
      format('company_id=%s, sku=%s, duplicates=%s', company_id, sku, duplicate_count),
      E'\n'
      ORDER BY company_id, sku
    )
    INTO duplicate_samples
    FROM (
      SELECT company_id, sku, COUNT(*)::int AS duplicate_count
      FROM product_variants
      WHERE sku IS NOT NULL
      GROUP BY company_id, sku
      HAVING COUNT(*) > 1
      ORDER BY company_id, sku
      LIMIT 20
    ) sample_rows;

    RAISE EXCEPTION
      'Cannot create unique index unique_company_product_variant_sku: found % duplicate (company_id, sku) pairs. Resolve duplicates before migration. Sample rows:%',
      duplicate_pair_count,
      E'\n' || COALESCE(duplicate_samples, '(none)');
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS unique_company_product_variant_sku
  ON product_variants(company_id, sku)
  WHERE sku IS NOT NULL;

COMMIT;
