BEGIN;

ALTER TABLE dental_clinical_notes
  ADD COLUMN IF NOT EXISTS treatment_plan_id INTEGER,
  ADD COLUMN IF NOT EXISTS treatment_plan_title_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE dental_clinical_notes
  DROP CONSTRAINT IF EXISTS dental_clinical_notes_contact_company_fk;
ALTER TABLE dental_clinical_notes
  ADD CONSTRAINT dental_clinical_notes_contact_company_fk
  FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE RESTRICT;

ALTER TABLE dental_clinical_notes
  DROP CONSTRAINT IF EXISTS dental_clinical_notes_treatment_plan_fk;
ALTER TABLE dental_clinical_notes
  ADD CONSTRAINT dental_clinical_notes_treatment_plan_fk
  FOREIGN KEY (treatment_plan_id) REFERENCES dental_treatment_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dental_clinical_notes_company_contact_voided_idx
  ON dental_clinical_notes(company_id, contact_id, voided_at, created_at DESC);

CREATE TABLE IF NOT EXISTS dental_clinical_note_revisions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  note_id INTEGER NOT NULL REFERENCES dental_clinical_notes(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'amend', 'void')),
  note_type TEXT NOT NULL,
  body TEXT NOT NULL,
  tooth_refs JSONB,
  treatment_plan_id INTEGER,
  treatment_plan_title_snapshot TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  acted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT dental_clinical_note_revisions_note_revision_unique UNIQUE (note_id, revision_number)
);

CREATE INDEX IF NOT EXISTS dental_clinical_note_revisions_company_note_idx
  ON dental_clinical_note_revisions(company_id, note_id, revision_number);

INSERT INTO dental_clinical_note_revisions (
  company_id, note_id, revision_number, action, note_type, body, tooth_refs,
  treatment_plan_id, treatment_plan_title_snapshot, is_private, acted_by, acted_at
)
SELECT
  n.company_id, n.id, 1, 'create', n.note_type, n.body, n.tooth_refs,
  n.treatment_plan_id, n.treatment_plan_title_snapshot, n.is_private, n.created_by,
  COALESCE(n.created_at, NOW())
FROM dental_clinical_notes n
ON CONFLICT (note_id, revision_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS dental_clinical_note_templates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty_id TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dental_clinical_note_templates_company_active_idx
  ON dental_clinical_note_templates(company_id, is_active, specialty_id, name);

CREATE TABLE IF NOT EXISTS dental_clinical_events (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  event_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  snapshot JSONB,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT dental_clinical_events_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT dental_clinical_events_company_event_key_unique UNIQUE (company_id, event_key)
);

CREATE INDEX IF NOT EXISTS dental_clinical_events_company_contact_occurred_idx
  ON dental_clinical_events(company_id, contact_id, occurred_at DESC);

COMMIT;
