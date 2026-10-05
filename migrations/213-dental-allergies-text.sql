BEGIN;

-- Legacy dental foundation stored allergies as jsonb; Issue 02 / schema use text.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dental_patient_profiles'
      AND column_name = 'allergies'
      AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE dental_patient_profiles
      ALTER COLUMN allergies TYPE text
      USING CASE
        WHEN allergies IS NULL THEN NULL
        WHEN jsonb_typeof(allergies) = 'string' THEN allergies #>> '{}'
        ELSE allergies::text
      END;
  END IF;
END $$;

COMMIT;
