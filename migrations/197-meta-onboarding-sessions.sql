-- Short-lived Meta channel onboarding sessions (shared across server instances)

CREATE TABLE IF NOT EXISTS meta_onboarding_sessions (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  encrypted_user_access_token TEXT NOT NULL,
  discovered_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_onboarding_sessions_expires_at
  ON meta_onboarding_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_meta_onboarding_sessions_user_company
  ON meta_onboarding_sessions(user_id, company_id);

COMMENT ON TABLE meta_onboarding_sessions IS 'Short-lived Meta Instagram/Messenger onboarding sessions shared across server instances';
COMMENT ON COLUMN meta_onboarding_sessions.encrypted_user_access_token IS 'AES-encrypted Facebook user access token for connection creation';
COMMENT ON COLUMN meta_onboarding_sessions.discovered_asset_ids IS 'Page or Instagram account IDs returned during discovery';
COMMENT ON COLUMN meta_onboarding_sessions.expires_at IS 'Session expiry (typically 15 minutes from creation)';
