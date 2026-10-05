BEGIN;

-- Legacy clinical notes use patient_profile_id (no contact_id). Rename before creating Issue 05 schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dental_clinical_notes'
      AND column_name = 'patient_profile_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dental_clinical_notes'
      AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE dental_clinical_notes RENAME TO dental_clinical_notes_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dental_clinical_notes (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  tooth_refs JSONB,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT dental_clinical_notes_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dental_clinical_notes_company_contact_created_idx
  ON dental_clinical_notes(company_id, contact_id, created_at DESC);

COMMIT;
