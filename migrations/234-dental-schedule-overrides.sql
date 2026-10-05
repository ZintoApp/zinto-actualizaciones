BEGIN;

ALTER TABLE contact_appointments
  ADD COLUMN IF NOT EXISTS schedule_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS schedule_override_kinds JSONB,
  ADD COLUMN IF NOT EXISTS schedule_overridden_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_overridden_at TIMESTAMP;

COMMIT;
