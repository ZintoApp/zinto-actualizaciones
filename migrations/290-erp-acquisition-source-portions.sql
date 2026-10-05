-- Attribution metadata only; accounting amounts and notes remain in ERP.
ALTER TABLE real_estate_asset_cost_sources ADD COLUMN IF NOT EXISTS allocation_start numeric(14,2);
ALTER TABLE real_estate_asset_cost_sources ADD COLUMN IF NOT EXISTS allocated_amount numeric(14,2);
UPDATE real_estate_asset_cost_sources s SET allocation_start=0,allocated_amount=l.debit
FROM journal_entry_lines l WHERE l.id=s.journal_line_id AND s.allocated_amount IS NULL;
ALTER TABLE real_estate_asset_cost_sources ALTER COLUMN allocation_start SET NOT NULL;
ALTER TABLE real_estate_asset_cost_sources ALTER COLUMN allocated_amount SET NOT NULL;
ALTER TABLE real_estate_asset_cost_sources DROP CONSTRAINT IF EXISTS real_estate_cost_source_portion;
ALTER TABLE real_estate_asset_cost_sources ADD CONSTRAINT real_estate_cost_source_portion CHECK(allocation_start>=0 AND allocated_amount>0);
DROP INDEX IF EXISTS real_estate_cost_source_active_line;
CREATE UNIQUE INDEX IF NOT EXISTS real_estate_cost_source_active_asset_line ON real_estate_asset_cost_sources(company_id,asset_id,journal_line_id) WHERE removed_at IS NULL;
CREATE OR REPLACE FUNCTION guard_erp_acquisition_source_portion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; journal integer; tenant integer;
BEGIN
 SELECT l.debit,j.id,j.company_id INTO total,journal,tenant FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE l.id=NEW.journal_line_id FOR UPDATE OF l;
 IF tenant IS DISTINCT FROM NEW.company_id OR journal IS DISTINCT FROM NEW.journal_entry_id OR NEW.allocation_start+NEW.allocated_amount>total THEN RAISE EXCEPTION 'Invalid ERP acquisition source portion'; END IF;
 IF TG_OP='UPDATE' AND (NEW.allocation_start IS DISTINCT FROM OLD.allocation_start OR NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount OR NEW.journal_line_id IS DISTINCT FROM OLD.journal_line_id OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN RAISE EXCEPTION 'ERP acquisition attribution is immutable; remove and relink'; END IF;
 IF NEW.removed_at IS NULL AND EXISTS(SELECT 1 FROM real_estate_asset_cost_sources s WHERE s.journal_line_id=NEW.journal_line_id AND s.id<>COALESCE(NEW.id,0) AND s.removed_at IS NULL AND s.allocation_start<NEW.allocation_start+NEW.allocated_amount AND NEW.allocation_start<s.allocation_start+s.allocated_amount) THEN RAISE EXCEPTION 'Overlapping ERP acquisition source portions'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS erp_acquisition_source_portion_write ON real_estate_asset_cost_sources;
CREATE TRIGGER erp_acquisition_source_portion_write BEFORE INSERT OR UPDATE ON real_estate_asset_cost_sources FOR EACH ROW EXECUTE FUNCTION guard_erp_acquisition_source_portion();
