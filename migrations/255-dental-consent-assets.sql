-- Image bytes stay behind tenant-authorized API routes, never public static uploads.
CREATE TABLE IF NOT EXISTS dental_consent_assets (
  id UUID PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  content BYTEA NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dental_consent_assets_company_idx ON dental_consent_assets(company_id);
