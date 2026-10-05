CREATE TABLE IF NOT EXISTS user_signatures (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  revision UUID NOT NULL,
  original BYTEA NOT NULL,
  original_mime TEXT NOT NULL,
  content BYTEA NOT NULL,
  settings JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE dental_consent_templates ADD COLUMN IF NOT EXISTS detail_field_ids JSONB NOT NULL DEFAULT '[]';
ALTER TABLE dental_consent_deliveries ADD COLUMN IF NOT EXISTS provider_signed BOOLEAN NOT NULL DEFAULT FALSE;
