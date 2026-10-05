CREATE TABLE IF NOT EXISTS contact_bot_suppressions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  suppressed_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_bot_suppressions_company_contact_unique UNIQUE (company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_bot_suppressions_company_contact
  ON contact_bot_suppressions(company_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_bot_suppressions_until
  ON contact_bot_suppressions(suppressed_until);
