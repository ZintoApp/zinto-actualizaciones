CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE calendar_bookings
  ADD COLUMN IF NOT EXISTS calendar_id TEXT NOT NULL DEFAULT 'primary';

UPDATE calendar_bookings
SET calendar_id = 'primary'
WHERE calendar_id IS NULL OR calendar_id = '';

ALTER TABLE calendar_bookings
  ALTER COLUMN calendar_id SET DEFAULT 'primary',
  ALTER COLUMN calendar_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE calendar_bookings
    DROP CONSTRAINT IF EXISTS calendar_bookings_no_overlap;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_bookings_no_overlap'
  ) THEN
    ALTER TABLE calendar_bookings
      ADD CONSTRAINT calendar_bookings_no_overlap
      EXCLUDE USING gist (
        user_id WITH =,
        company_id WITH =,
        calendar_type WITH =,
        calendar_id WITH =,
        tstzrange(buffer_start_date_time, buffer_end_date_time, '[)') WITH &&
      )
      WHERE (status IN ('pending', 'confirmed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_bookings_calendar_scope_range
ON calendar_bookings(user_id, company_id, calendar_type, calendar_id, start_date_time, end_date_time);
