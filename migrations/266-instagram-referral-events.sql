BEGIN;
CREATE TABLE IF NOT EXISTS instagram_referral_events (
  fingerprint TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id INTEGER NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL,
  referral JSONB NOT NULL,
  consumed_message_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instagram_referral_events_pending
  ON instagram_referral_events (company_id, connection_id, sender_id, event_at);
COMMENT ON TABLE instagram_referral_events IS 'Instagram referral correlation and seven-day delivery deduplication';
COMMIT;
