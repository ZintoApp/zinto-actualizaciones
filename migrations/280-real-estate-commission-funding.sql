BEGIN;
ALTER TABLE real_estate_commissions ALTER COLUMN invoice_payment_id DROP NOT NULL;
ALTER TABLE real_estate_commissions ADD COLUMN IF NOT EXISTS credit_allocation_id integer;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='erp_credit_note_allocations_id_company_key') THEN
 ALTER TABLE erp_credit_note_allocations ADD CONSTRAINT erp_credit_note_allocations_id_company_key UNIQUE(id,company_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='real_estate_commissions_allocation_fk') THEN
 ALTER TABLE real_estate_commissions ADD CONSTRAINT real_estate_commissions_allocation_fk FOREIGN KEY(credit_allocation_id,company_id) REFERENCES erp_credit_note_allocations(id,company_id);
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS real_estate_commissions_agreement_allocation_key ON real_estate_commissions(agreement_id,credit_allocation_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='real_estate_commissions_funding_check') THEN
 ALTER TABLE real_estate_commissions ADD CONSTRAINT real_estate_commissions_funding_check CHECK((invoice_payment_id IS NOT NULL)::int+(credit_allocation_id IS NOT NULL)::int=1);
 END IF;
END $$;
CREATE OR REPLACE VIEW real_estate_commission_funding AS
 SELECT 'receipt'::text funding_type,p.id funding_id,p.company_id,p.invoice_id,p.amount,p.payment_date funding_date,j.id journal_entry_id,j.status posting_status,'posted'::text funding_status
 FROM invoice_payments p LEFT JOIN LATERAL(SELECT id,status FROM journal_entries WHERE company_id=p.company_id AND reference_type IN('payment','invoice_payment') AND reference_id=p.id ORDER BY id DESC LIMIT 1) j ON true
 UNION ALL
 SELECT 'credit_allocation',a.id,a.company_id,a.target_invoice_id,a.amount,j.date,j.id,j.status,a.status
 FROM erp_credit_note_allocations a JOIN journal_entries j ON j.id=a.journal_entry_id AND j.company_id=a.company_id;
COMMIT;
