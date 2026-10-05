-- Repair partial 262-whatsapp-business-calling.sql application
CREATE TABLE IF NOT EXISTS whatsapp_call_asset_jobs (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  call_id integer NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  media_id text NOT NULL,
  download_url text NOT NULL,
  mime_type text,
  sha256 text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_call_asset_jobs_call_asset_unique UNIQUE(call_id, asset_type, media_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_call_asset_jobs_due_idx ON whatsapp_call_asset_jobs(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS whatsapp_call_agent_presence (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_call_agent_presence_company_user_unique UNIQUE(company_id, user_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_call_agent_presence_company_seen_idx ON whatsapp_call_agent_presence(company_id, last_seen_at);
