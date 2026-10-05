BEGIN;
CREATE TABLE IF NOT EXISTS erp_credit_note_refunds (
 id serial PRIMARY KEY,
 company_id integer NOT NULL REFERENCES companies(id),
 credit_note_id integer NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>0),
 cash_account_id integer NOT NULL,
 reference text NOT NULL,
 reason text NOT NULL,
 journal_entry_id integer NOT NULL,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN('posted','reversed')),
 reversal_journal_entry_id integer,
 created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,reference),
 FOREIGN KEY(credit_note_id,company_id) REFERENCES invoices(id,company_id),
 FOREIGN KEY(cash_account_id,company_id) REFERENCES chart_of_accounts(id,company_id),
 FOREIGN KEY(journal_entry_id) REFERENCES journal_entries(id),
 FOREIGN KEY(reversal_journal_entry_id) REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS erp_credit_note_refunds_note_idx ON erp_credit_note_refunds(company_id,credit_note_id);
COMMIT;
