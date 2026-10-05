-- ERP payment gateways: invoice payment tokens and checkout session tracking

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_payment_token_unique
  ON invoices (payment_token)
  WHERE payment_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS erp_invoice_checkout_sessions (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  external_session_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS erp_invoice_checkout_sessions_invoice_idx
  ON erp_invoice_checkout_sessions (invoice_id);

CREATE INDEX IF NOT EXISTS erp_invoice_checkout_sessions_external_idx
  ON erp_invoice_checkout_sessions (company_id, external_session_id)
  WHERE external_session_id IS NOT NULL;
