BEGIN;
DROP VIEW IF EXISTS real_estate_commission_funding;
-- Preserve twelve integer digits while retaining shared ERP minor units.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS transaction_decimal_places integer NOT NULL DEFAULT 2 CHECK(transaction_decimal_places BETWEEN 0 AND 6);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS base_decimal_places integer NOT NULL DEFAULT 2 CHECK(base_decimal_places BETWEEN 0 AND 6);
ALTER TABLE journal_entry_lines
 ALTER COLUMN debit TYPE numeric(18,6), ALTER COLUMN credit TYPE numeric(18,6),
 ALTER COLUMN debit_base TYPE numeric(18,6), ALTER COLUMN credit_base TYPE numeric(18,6);
ALTER TABLE chart_of_accounts ALTER COLUMN balance TYPE numeric(18,6);
ALTER TABLE accounts_receivable ALTER COLUMN amount TYPE numeric(18,6), ALTER COLUMN paid_amount TYPE numeric(18,6);
ALTER TABLE accounts_payable ALTER COLUMN amount TYPE numeric(18,6), ALTER COLUMN paid_amount TYPE numeric(18,6);
ALTER TABLE invoice_payments ALTER COLUMN amount TYPE numeric(16,6);
CREATE OR REPLACE VIEW real_estate_commission_funding AS
 SELECT 'receipt'::text funding_type,p.id funding_id,p.company_id,p.invoice_id,p.amount,p.payment_date funding_date,j.id journal_entry_id,j.status posting_status,'posted'::text funding_status
 FROM invoice_payments p LEFT JOIN LATERAL(SELECT id,status FROM journal_entries WHERE company_id=p.company_id AND reference_type IN('payment','invoice_payment') AND reference_id=p.id ORDER BY id DESC LIMIT 1) j ON true
 UNION ALL
 SELECT 'credit_allocation',a.id,a.company_id,a.target_invoice_id,a.amount,j.date,j.id,j.status,a.status
 FROM erp_credit_note_allocations a JOIN journal_entries j ON j.id=a.journal_entry_id AND j.company_id=a.company_id;
COMMIT;
