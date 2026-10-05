-- Company-defined custom roles for team members.
-- Built-in admin/agent remain in user_role enum; custom roles are agent-tier
-- members that inherit (or snapshot) permissions from company_custom_roles.

BEGIN;

CREATE TABLE IF NOT EXISTS company_custom_roles (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT company_custom_roles_company_name_unique UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_company_custom_roles_company_id
  ON company_custom_roles (company_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_role_id INTEGER REFERENCES company_custom_roles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_users_custom_role_id
  ON users (custom_role_id) WHERE custom_role_id IS NOT NULL;

COMMIT;
