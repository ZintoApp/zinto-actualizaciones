BEGIN;

-- Composite ON DELETE SET NULL cleared company_id along with chair_id/provider_user_id.
-- Replace with simple FKs that only null the optional reference column.
ALTER TABLE contact_appointments DROP CONSTRAINT IF EXISTS contact_appointments_provider_company_fk;
ALTER TABLE contact_appointments DROP CONSTRAINT IF EXISTS contact_appointments_chair_company_fk;

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

COMMIT;
