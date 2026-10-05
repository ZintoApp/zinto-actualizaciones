CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE calendar_bookings
  ALTER COLUMN start_date_time TYPE TIMESTAMPTZ USING start_date_time AT TIME ZONE 'UTC',
  ALTER COLUMN end_date_time TYPE TIMESTAMPTZ USING end_date_time AT TIME ZONE 'UTC';

ALTER TABLE calendar_bookings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS buffer_start_date_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buffer_end_date_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS etag TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE calendar_bookings
SET
  buffer_start_date_time = COALESCE(buffer_start_date_time, start_date_time),
  buffer_end_date_time = COALESCE(buffer_end_date_time, end_date_time),
  buffer_minutes = COALESCE(buffer_minutes, 0);

ALTER TABLE calendar_bookings
  ALTER COLUMN buffer_start_date_time SET NOT NULL,
  ALTER COLUMN buffer_end_date_time SET NOT NULL,
  ALTER COLUMN buffer_minutes SET NOT NULL;

DROP INDEX IF EXISTS idx_calendar_bookings_unique_slot;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_bookings_idempotency_key
ON calendar_bookings(idempotency_key)
WHERE idempotency_key IS NOT NULL;

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
        tstzrange(buffer_start_date_time, buffer_end_date_time, '[)') WITH &&
      )
      WHERE (status IN ('pending', 'confirmed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_slot_locks (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_type TEXT NOT NULL,
  start_date_time TIMESTAMPTZ NOT NULL,
  end_date_time TIMESTAMPTZ NOT NULL,
  lock_token UUID NOT NULL,
  acquired_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_slot_locks_lock_token
ON calendar_slot_locks(lock_token);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_slot_locks_no_overlap'
  ) THEN
    ALTER TABLE calendar_slot_locks
      ADD CONSTRAINT calendar_slot_locks_no_overlap
      EXCLUDE USING gist (
        user_id WITH =,
        company_id WITH =,
        calendar_type WITH =,
        tstzrange(start_date_time, end_date_time, '[)') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_slot_locks_range
ON calendar_slot_locks(user_id, company_id, calendar_type, start_date_time, end_date_time, expires_at);

CREATE TABLE IF NOT EXISTS calendar_audit_log (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  result JSONB,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_audit_log_lookup
ON calendar_audit_log(company_id, user_id, action, created_at DESC);
