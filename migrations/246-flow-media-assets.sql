BEGIN;

CREATE TABLE IF NOT EXISTS flow_media_assets (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  variable_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT flow_media_assets_kind_check CHECK (media_kind IN ('image', 'video', 'audio', 'document')),
  CONSTRAINT flow_media_assets_variable_check CHECK (variable_name ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT flow_media_assets_size_check CHECK (file_size >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS flow_media_assets_flow_variable_unique
  ON flow_media_assets(flow_id, variable_name);
CREATE INDEX IF NOT EXISTS flow_media_assets_flow_idx ON flow_media_assets(flow_id);
CREATE INDEX IF NOT EXISTS flow_media_assets_company_idx ON flow_media_assets(company_id);

COMMIT;
