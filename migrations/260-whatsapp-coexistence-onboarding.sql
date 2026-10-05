ALTER TABLE meta_onboarding_sessions ADD COLUMN IF NOT EXISTS whatsapp_state jsonb;

CREATE TABLE IF NOT EXISTS whatsapp_coexistence_jobs (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  connection_id integer NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS whatsapp_coexistence_jobs_pending
  ON whatsapp_coexistence_jobs (available_at, id) WHERE status = 'pending';
COMMENT ON TABLE whatsapp_coexistence_jobs IS 'Durable verified Coexistence webhooks; workers serialize each connection with a PostgreSQL advisory lock';
