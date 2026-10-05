-- Align stock_levels uniqueness with COALESCE(variant_id, 0) so base-product rows are unique
-- and ON CONFLICT in application code can target the same index as migration 151.

BEGIN;

ALTER TABLE stock_levels DROP CONSTRAINT IF EXISTS unique_stock_product_variant_warehouse;

DROP INDEX IF EXISTS unique_stock_product_variant_warehouse;

CREATE UNIQUE INDEX IF NOT EXISTS unique_stock_product_variant_warehouse
  ON stock_levels (product_id, COALESCE(variant_id, 0), warehouse_id);

COMMIT;
