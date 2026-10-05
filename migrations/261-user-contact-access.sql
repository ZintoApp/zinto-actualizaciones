-- Deploy before the application version that reads explicit contact access grants.
CREATE TABLE IF NOT EXISTS user_contact_access (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id integer NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grant_reason text NOT NULL DEFAULT 'manual_add',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_contact_access_company_contact_user UNIQUE (company_id, contact_id, user_id)
);
CREATE INDEX IF NOT EXISTS user_contact_access_user_company ON user_contact_access (user_id, company_id);
CREATE INDEX IF NOT EXISTS user_contact_access_contact ON user_contact_access (contact_id);

-- Repair only blank phones. Do not infer ownership or change existing valid numbers.
UPDATE contacts SET phone = NULL, phone_digits = NULL
WHERE phone IS NOT NULL AND btrim(phone, E' \t\n\r') = '';
