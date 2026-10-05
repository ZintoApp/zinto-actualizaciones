BEGIN;

CREATE TABLE IF NOT EXISTS dental_chart_snapshots (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  numbering_system TEXT NOT NULL DEFAULT 'FDI',
  payload JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT dental_chart_snapshots_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS dental_chart_snapshots_company_contact_version_unique
  ON dental_chart_snapshots(company_id, contact_id, version);
CREATE INDEX IF NOT EXISTS dental_chart_snapshots_company_contact_created_idx
  ON dental_chart_snapshots(company_id, contact_id, created_at DESC);

COMMIT;
