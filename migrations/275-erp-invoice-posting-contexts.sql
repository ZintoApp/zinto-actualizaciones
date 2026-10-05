-- Shared invoice posting extension for domain receivables with deferred/liability treatment.
BEGIN;
CREATE TABLE IF NOT EXISTS erp_invoice_posting_contexts (
  invoice_id integer PRIMARY KEY,
  company_id integer NOT NULL,
  net_account_id integer NOT NULL,
  treatment text NOT NULL CHECK(treatment IN('revenue','owner_funds','deposit','advance','expense')),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(invoice_id,company_id) REFERENCES invoices(id,company_id),
  FOREIGN KEY(net_account_id,company_id) REFERENCES chart_of_accounts(id,company_id)
);
COMMIT;
