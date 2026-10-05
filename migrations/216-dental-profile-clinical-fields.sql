BEGIN;

-- Patient detail redesign: additional structured clinical fields on the
-- dental patient profile. Additive and idempotent so it is safe on installs
-- that already have partial column sets.
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS current_medications TEXT;
ALTER TABLE dental_patient_profiles ADD COLUMN IF NOT EXISTS previous_dental_treatments TEXT;

COMMIT;
