CREATE TABLE IF NOT EXISTS instagram_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  app_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_states_expires_at ON instagram_oauth_states(expires_at);
