BEGIN;

CREATE TABLE IF NOT EXISTS custom_field_attachments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_field_attachments_owner_type_check CHECK (owner_type IN ('contact', 'deal')),
  CONSTRAINT custom_field_attachments_exactly_one_owner CHECK (
    (owner_type = 'contact' AND contact_id IS NOT NULL AND deal_id IS NULL)
    OR
    (owner_type = 'deal' AND deal_id IS NOT NULL AND contact_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS custom_field_attachments_company_contact_idx
  ON custom_field_attachments(company_id, contact_id);

CREATE INDEX IF NOT EXISTS custom_field_attachments_company_deal_idx
  ON custom_field_attachments(company_id, deal_id);

COMMIT;
