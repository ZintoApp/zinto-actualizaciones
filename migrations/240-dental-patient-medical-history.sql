BEGIN;

ALTER TABLE dental_patient_profiles
  ADD COLUMN IF NOT EXISTS medical_history_details JSONB NOT NULL
  DEFAULT '{"version":1,"conditions":{"diabetes":{"status":"unknown","details":""},"hypertension":{"status":"unknown","details":""},"heartDisease":{"status":"unknown","details":""},"bleedingDisorder":{"status":"unknown","details":""},"pregnancy":{"status":"unknown","details":""},"majorSurgeryHospitalization":{"status":"unknown","details":""}},"smoking":{"status":"unknown","details":""}}'::jsonb;

CREATE TABLE IF NOT EXISTS dental_patient_vitals (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  systolic INTEGER NOT NULL CHECK (systolic BETWEEN 40 AND 300),
  diastolic INTEGER NOT NULL CHECK (diastolic BETWEEN 20 AND 200),
  pulse INTEGER CHECK (pulse BETWEEN 20 AND 250),
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT dental_patient_vitals_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS dental_patient_vitals_id_company_unique
  ON dental_patient_vitals(id, company_id);
CREATE INDEX IF NOT EXISTS dental_patient_vitals_company_contact_recorded_idx
  ON dental_patient_vitals(company_id, contact_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS dental_patient_infectious_tests (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('hiv', 'hepatitis_b', 'hepatitis_c')),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('positive', 'negative', 'unknown', 'declined')),
  test_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT dental_patient_infectious_tests_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS dental_patient_infectious_tests_id_company_unique
  ON dental_patient_infectious_tests(id, company_id);
CREATE INDEX IF NOT EXISTS dental_patient_infectious_tests_company_contact_date_idx
  ON dental_patient_infectious_tests(company_id, contact_id, test_date DESC, created_at DESC);

COMMIT;
