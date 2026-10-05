BEGIN;
ALTER TABLE real_estate_leases ADD COLUMN IF NOT EXISTS guarantor_contact_id integer;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='real_estate_lease_guarantor_company_fk') THEN
 ALTER TABLE real_estate_leases ADD CONSTRAINT real_estate_lease_guarantor_company_fk FOREIGN KEY(guarantor_contact_id,company_id) REFERENCES contacts(id,company_id);
 END IF;
END $$;
COMMIT;
