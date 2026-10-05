BEGIN;
CREATE TABLE IF NOT EXISTS erp_credit_note_allocations (
 id serial PRIMARY KEY,
 company_id integer NOT NULL REFERENCES companies(id),
 credit_note_id integer NOT NULL,
 target_invoice_id integer NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>0),
 source_base_amount numeric(14,2) NOT NULL CHECK(source_base_amount>=0),
 target_base_amount numeric(14,2) NOT NULL CHECK(target_base_amount>=0),
 reference text NOT NULL,
 reason text NOT NULL,
 journal_entry_id integer NOT NULL,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN('posted','reversed')),
 reversal_journal_entry_id integer,
 created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,reference),
 FOREIGN KEY(credit_note_id,company_id) REFERENCES invoices(id,company_id),
 FOREIGN KEY(target_invoice_id,company_id) REFERENCES invoices(id,company_id),
 FOREIGN KEY(journal_entry_id,company_id) REFERENCES journal_entries(id,company_id),
 FOREIGN KEY(reversal_journal_entry_id,company_id) REFERENCES journal_entries(id,company_id),
 CHECK(credit_note_id<>target_invoice_id)
);
CREATE INDEX IF NOT EXISTS erp_credit_note_allocations_source_idx ON erp_credit_note_allocations(company_id,credit_note_id);
CREATE INDEX IF NOT EXISTS erp_credit_note_allocations_target_idx ON erp_credit_note_allocations(company_id,target_invoice_id);
COMMIT;
