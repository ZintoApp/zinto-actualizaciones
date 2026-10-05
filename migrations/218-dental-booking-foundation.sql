BEGIN;

-- Local dental booking foundation: auto-add provenance on patient profiles plus the
-- hold / request lifecycle fields on the shared appointments table.
-- Additive and idempotent so it is safe on installs that already carry dental chairs,
-- appointments and patient profiles.

-- Provenance for the auto-add-patients policy. Disabling the policy may unlink only the
-- empty profiles it created itself, never manually assigned patients.
ALTER TABLE dental_patient_profiles
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT FALSE;

-- Booking lifecycle fields. booking_service_key/label snapshot the policy catalog item so
-- later catalog edits do not rewrite what was actually booked.
ALTER TABLE contact_appointments
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS booking_service_key TEXT,
  ADD COLUMN IF NOT EXISTS booking_service_label TEXT;

-- Existing rows predate local booking: they were all created by staff.
UPDATE contact_appointments SET booking_source = 'staff' WHERE booking_source IS NULL;

ALTER TABLE contact_appointments ALTER COLUMN booking_source SET DEFAULT 'staff';
ALTER TABLE contact_appointments ALTER COLUMN booking_source SET NOT NULL;

-- Expand the status CHECK with the hold / request authority states.
-- 027 created it, 207 added no_show; existing staff statuses stay accepted.
ALTER TABLE contact_appointments DROP CONSTRAINT IF EXISTS contact_appointments_status_check;
ALTER TABLE contact_appointments
  ADD CONSTRAINT contact_appointments_status_check
  CHECK (status IN (
    'scheduled',
    'confirmed',
    'completed',
    'cancelled',
    'rescheduled',
    'no_show',
    'held',
    'pending_request'
  ));

ALTER TABLE contact_appointments DROP CONSTRAINT IF EXISTS contact_appointments_booking_source_check;
ALTER TABLE contact_appointments
  ADD CONSTRAINT contact_appointments_booking_source_check
  CHECK (booking_source IN ('staff', 'ai_local'));

-- Partial: the hold expiry sweep only ever scans rows that carry an expiry.
CREATE INDEX IF NOT EXISTS contact_appointments_hold_expiry_idx
  ON contact_appointments(hold_expires_at)
  WHERE hold_expires_at IS NOT NULL;

COMMIT;
