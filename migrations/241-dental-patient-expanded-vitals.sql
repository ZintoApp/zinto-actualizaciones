BEGIN;

ALTER TABLE dental_patient_vitals
  ADD COLUMN IF NOT EXISTS temperature_celsius REAL CHECK (temperature_celsius BETWEEN 30 AND 45),
  ADD COLUMN IF NOT EXISTS respiratory_rate INTEGER CHECK (respiratory_rate BETWEEN 4 AND 80),
  ADD COLUMN IF NOT EXISTS oxygen_saturation INTEGER CHECK (oxygen_saturation BETWEEN 50 AND 100),
  ADD COLUMN IF NOT EXISTS weight_kg REAL CHECK (weight_kg BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS height_cm REAL CHECK (height_cm BETWEEN 30 AND 250),
  ADD COLUMN IF NOT EXISTS pain_score INTEGER CHECK (pain_score BETWEEN 0 AND 10);

COMMIT;
