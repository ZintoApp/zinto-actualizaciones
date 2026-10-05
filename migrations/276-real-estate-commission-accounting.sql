BEGIN;
ALTER TABLE real_estate_commission_agreements ADD COLUMN IF NOT EXISTS expense_account_id integer;
ALTER TABLE real_estate_commission_agreements ADD COLUMN IF NOT EXISTS payable_account_id integer;
ALTER TABLE real_estate_commissions ADD COLUMN IF NOT EXISTS accounting_snapshot jsonb NOT NULL DEFAULT '{}';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='real_estate_commission_expense_account_fk') THEN
 ALTER TABLE real_estate_commission_agreements ADD CONSTRAINT real_estate_commission_expense_account_fk FOREIGN KEY(expense_account_id,company_id) REFERENCES chart_of_accounts(id,company_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='real_estate_commission_payable_account_fk') THEN
 ALTER TABLE real_estate_commission_agreements ADD CONSTRAINT real_estate_commission_payable_account_fk FOREIGN KEY(payable_account_id,company_id) REFERENCES chart_of_accounts(id,company_id);
 END IF;
END $$;
COMMIT;
