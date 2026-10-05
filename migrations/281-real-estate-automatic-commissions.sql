BEGIN;
ALTER TABLE real_estate_commission_agreements ADD COLUMN IF NOT EXISTS automatic_accrual boolean NOT NULL DEFAULT false;
ALTER TABLE real_estate_commission_agreements ADD COLUMN IF NOT EXISTS automatic_actor_id integer;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='real_estate_commission_automatic_actor_fk') THEN
 ALTER TABLE real_estate_commission_agreements ADD CONSTRAINT real_estate_commission_automatic_actor_fk FOREIGN KEY(automatic_actor_id,company_id) REFERENCES users(id,company_id);
 END IF;
END $$;
COMMIT;
