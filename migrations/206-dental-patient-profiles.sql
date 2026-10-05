BEGIN;

-- Fresh installs
CREATE TABLE IF NOT EXISTS dental_patient_profiles (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  date_of_birth DATE,
  sex TEXT,
  allergies TEXT,
  medical_history_summary TEXT,
  dental_history_summary TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  preferred_provider_user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Legacy foundation table may already exist with a different column set.
-- Additive reshape so Drizzle/Issue 02 columns are present without dropping data.
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS medical_history_summary TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS dental_history_summary TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS preferred_provider_user_id INTEGER;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dental_patient_profiles' AND column_name = 'gender'
  ) THEN
    EXECUTE $u$UPDATE dental_patient_profiles SET sex = COALESCE(sex, gender) WHERE sex IS NULL AND gender IS NOT NULL$u$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dental_patient_profiles' AND column_name = 'medical_history'
  ) THEN
    EXECUTE $u$UPDATE dental_patient_profiles
      SET medical_history_summary = COALESCE(medical_history_summary, medical_history::text)
      WHERE medical_history_summary IS NULL AND medical_history IS NOT NULL$u$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dental_patient_profiles' AND column_name = 'primary_provider_id'
  ) THEN
    EXECUTE $u$UPDATE dental_patient_profiles
      SET preferred_provider_user_id = COALESCE(preferred_provider_user_id, primary_provider_id)
      WHERE preferred_provider_user_id IS NULL AND primary_provider_id IS NOT NULL$u$;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dental_patient_profiles_id_company_unique
  ON dental_patient_profiles(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS dental_patient_profiles_company_contact_unique
  ON dental_patient_profiles(company_id, contact_id);
CREATE INDEX IF NOT EXISTS dental_patient_profiles_company_idx
  ON dental_patient_profiles(company_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dental_patient_profiles_contact_company_fk'
      AND table_name = 'dental_patient_profiles'
  ) THEN
    ALTER TABLE dental_patient_profiles
      ADD CONSTRAINT dental_patient_profiles_contact_company_fk
      FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dental_patient_profiles_preferred_provider_user_id_users_id_fk'
      AND table_name = 'dental_patient_profiles'
  ) THEN
    ALTER TABLE dental_patient_profiles
      DROP CONSTRAINT dental_patient_profiles_preferred_provider_user_id_users_id_fk;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dental_patient_profiles_provider_company_fk'
      AND table_name = 'dental_patient_profiles'
  ) THEN
    ALTER TABLE dental_patient_profiles
      ADD CONSTRAINT dental_patient_profiles_provider_company_fk
      FOREIGN KEY (preferred_provider_user_id, company_id)
      REFERENCES users(id, company_id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
