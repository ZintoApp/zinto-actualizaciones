ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider_call_id text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_provider_conversation_id text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_by_user_id integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcription_requested boolean;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_provider text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS whatsapp_recording_id text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS whatsapp_transcript_id text;

UPDATE calls
SET provider = CASE
  WHEN provider IS NOT NULL THEN provider
  WHEN twilio_call_sid IS NOT NULL THEN 'twilio'
  ELSE provider
END;

CREATE TABLE IF NOT EXISTS whatsapp_call_sessions (
  id bigserial PRIMARY KEY,
  call_id integer NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  meta_call_id text NOT NULL,
  state text NOT NULL,
  claimed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  encrypted_offer_sdp text,
  encrypted_answer_sdp text,
  signaling_expires_at timestamptz,
  routing_stage text,
  stage_expires_at timestamptz,
  timeline_message_id integer REFERENCES messages(id) ON DELETE SET NULL,
  provider_conversation_id text,
  last_webhook_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_call_sessions_call_unique UNIQUE (call_id),
  CONSTRAINT whatsapp_call_sessions_meta_call_unique UNIQUE (meta_call_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_call_sessions_company_state_idx ON whatsapp_call_sessions(company_id, state);
CREATE INDEX IF NOT EXISTS whatsapp_call_sessions_provider_conversation_idx ON whatsapp_call_sessions(provider_conversation_id) WHERE provider_conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_call_permissions (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  contact_id integer NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  wa_id text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  permission_type text,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_requested_at timestamptz,
  request_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_call_permissions_channel_contact_unique UNIQUE(channel_id, contact_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_call_permissions_company_status_idx ON whatsapp_call_permissions(company_id, status);

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

CREATE TABLE IF NOT EXISTS call_events (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_id integer NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_events_company_cursor_idx ON call_events(company_id, id);
CREATE INDEX IF NOT EXISTS call_events_call_cursor_idx ON call_events(call_id, id);
