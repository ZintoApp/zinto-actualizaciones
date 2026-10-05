DROP INDEX IF EXISTS idx_calendar_bookings_idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_bookings_idempotency_key
ON calendar_bookings(user_id, company_id, calendar_type, calendar_id, idempotency_key)
WHERE idempotency_key IS NOT NULL
  AND status IN ('pending', 'confirmed');
