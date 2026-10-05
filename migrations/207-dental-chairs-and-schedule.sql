BEGIN;

-- Chairs / operatories
CREATE TABLE IF NOT EXISTS dental_chairs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dental_chairs_id_company_unique
  ON dental_chairs(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS dental_chairs_company_code_unique
  ON dental_chairs(company_id, code);
CREATE INDEX IF NOT EXISTS dental_chairs_company_idx
  ON dental_chairs(company_id);

-- Extend contact_appointments for dental schedule
ALTER TABLE contact_appointments
  ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS chair_id INTEGER,
  ADD COLUMN IF NOT EXISTS is_recall BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recall_due_at TIMESTAMP;

-- Backfill company_id from contacts
UPDATE contact_appointments ca
SET company_id = c.company_id
FROM contacts c
WHERE ca.contact_id = c.id
  AND ca.company_id IS NULL;

-- Expand status CHECK to include no_show
ALTER TABLE contact_appointments DROP CONSTRAINT IF EXISTS contact_appointments_status_check;
ALTER TABLE contact_appointments
  ADD CONSTRAINT contact_appointments_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'));

-- Simple FKs: SET NULL only on the optional reference column (not company_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contact_appointments_provider_user_id_fk'
      AND table_name = 'contact_appointments'
  ) THEN
    ALTER TABLE contact_appointments
      ADD CONSTRAINT contact_appointments_provider_user_id_fk
      FOREIGN KEY (provider_user_id) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contact_appointments_chair_id_fk'
      AND table_name = 'contact_appointments'
  ) THEN
    ALTER TABLE contact_appointments
      ADD CONSTRAINT contact_appointments_chair_id_fk
      FOREIGN KEY (chair_id) REFERENCES dental_chairs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contact_appointments_company_scheduled_idx
  ON contact_appointments(company_id, scheduled_at);
CREATE INDEX IF NOT EXISTS contact_appointments_provider_idx
  ON contact_appointments(provider_user_id);
CREATE INDEX IF NOT EXISTS contact_appointments_chair_idx
  ON contact_appointments(chair_id);

COMMIT;
