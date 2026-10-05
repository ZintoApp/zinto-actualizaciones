BEGIN;
CREATE TABLE IF NOT EXISTS erp_invoice_noncash_settlements (
 id serial PRIMARY KEY,
 company_id integer NOT NULL REFERENCES companies(id),
 invoice_id integer NOT NULL,
 source_type text NOT NULL,
 source_id integer NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>0),
 base_amount numeric(14,2) NOT NULL CHECK(base_amount>=0),
 journal_entry_id integer NOT NULL,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN('posted','reversed')),
 reversal_journal_entry_id integer,
 created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,source_type,source_id,invoice_id,journal_entry_id),
 FOREIGN KEY(invoice_id,company_id) REFERENCES invoices(id,company_id),
 FOREIGN KEY(journal_entry_id,company_id) REFERENCES journal_entries(id,company_id),
 FOREIGN KEY(reversal_journal_entry_id,company_id) REFERENCES journal_entries(id,company_id)
);
CREATE INDEX IF NOT EXISTS erp_invoice_noncash_settlements_invoice_idx ON erp_invoice_noncash_settlements(company_id,invoice_id);
CREATE INDEX IF NOT EXISTS erp_invoice_noncash_settlements_source_idx ON erp_invoice_noncash_settlements(company_id,source_type,source_id);
COMMIT;
