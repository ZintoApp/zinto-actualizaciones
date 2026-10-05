BEGIN;

CREATE TABLE IF NOT EXISTS electronic_invoices (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'validated', 'rejected', 'failed')),
  cufe TEXT,
  cuv TEXT,
  xml_url TEXT,
  qr_code_text TEXT,
  rips_json_url TEXT,
  errors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_invoice_electronic UNIQUE (invoice_id)
);

CREATE INDEX IF NOT EXISTS electronic_invoices_company_idx ON electronic_invoices(company_id);

COMMIT;
