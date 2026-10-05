-- Migration: Add user permission mode and fixed custom-permissions snapshot columns.
-- Preserves existing users.permissions as legacy inherited overlay; does not auto-convert.
-- Does not modify role_permissions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'user_permission_mode'
  ) THEN
    CREATE TYPE user_permission_mode AS ENUM ('inherit', 'custom');
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permission_mode user_permission_mode NOT NULL DEFAULT 'inherit';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE users
SET permission_mode = 'inherit'
WHERE permission_mode IS DISTINCT FROM 'inherit';
