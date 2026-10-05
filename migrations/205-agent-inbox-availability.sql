CREATE TABLE IF NOT EXISTS agent_inbox_availability_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_schedule_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_on_duty BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_mode TEXT NOT NULL DEFAULT 'simple',
  business_hours_start TEXT DEFAULT '09:00',
  business_hours_end TEXT DEFAULT '17:00',
  advanced_settings JSONB,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_inbox_availability_company
  ON agent_inbox_availability_settings(company_id);
