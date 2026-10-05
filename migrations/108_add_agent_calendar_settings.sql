CREATE TABLE IF NOT EXISTS agent_calendar_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_type TEXT NOT NULL DEFAULT 'google',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  business_hours_start TEXT DEFAULT '09:00',
  business_hours_end TEXT DEFAULT '17:00',
  advanced_settings JSONB,
  timezone TEXT DEFAULT 'UTC',
  buffer_minutes INTEGER DEFAULT 0,
  schedule_mode TEXT NOT NULL DEFAULT 'simple',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

