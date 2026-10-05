BEGIN;

ALTER TABLE contact_appointments
  ADD COLUMN IF NOT EXISTS calendar_color TEXT;

COMMIT;
