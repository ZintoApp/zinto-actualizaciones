BEGIN;
ALTER TABLE real_estate_asset_cost_sources ALTER COLUMN allocation_start TYPE numeric(18,6), ALTER COLUMN allocated_amount TYPE numeric(18,6);
COMMIT;
