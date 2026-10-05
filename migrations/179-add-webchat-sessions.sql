CREATE TABLE IF NOT EXISTS webchat_sessions (
  session_id text PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id integer NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webchat_sessions_company_contact
  ON webchat_sessions(company_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_webchat_sessions_connection
  ON webchat_sessions(connection_id);
