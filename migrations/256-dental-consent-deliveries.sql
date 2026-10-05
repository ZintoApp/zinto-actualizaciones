-- Previewing remains stateless. Only explicit sends retain a PDF and delivery outcomes.
CREATE TABLE IF NOT EXISTS dental_consent_deliveries (
  id UUID NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  request_hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  content BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',
  parts JSONB NOT NULL,
  copy_status TEXT NOT NULL DEFAULT 'none',
  document_id INTEGER REFERENCES contact_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, id)
);
CREATE INDEX IF NOT EXISTS dental_consent_deliveries_contact_idx ON dental_consent_deliveries(company_id, contact_id);
