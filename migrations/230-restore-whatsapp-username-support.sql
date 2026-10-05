-- Restore WhatsApp username / LID / BSUID identity support dropped in migration 228.
-- Every statement is idempotent so this is a safe no-op where columns already exist.

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_username TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_bsuid TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_username_updated_at TIMESTAMP;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS original_contact_method TEXT;

-- Username format: lowercase letters, digits, underscore, period (3-35 enforced in app).
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS chk_whatsapp_username_format;
ALTER TABLE contacts ADD CONSTRAINT chk_whatsapp_username_format
  CHECK (whatsapp_username IS NULL OR whatsapp_username ~ '^[a-z0-9_.]+$');

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS chk_original_contact_method;
ALTER TABLE conversations ADD CONSTRAINT chk_original_contact_method
  CHECK (original_contact_method IS NULL OR original_contact_method IN ('phone', 'username'));

CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_username
  ON contacts (whatsapp_username) WHERE whatsapp_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_lid
  ON contacts (whatsapp_lid) WHERE whatsapp_lid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_bsuid
  ON contacts (whatsapp_bsuid) WHERE whatsapp_bsuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_company_username
  ON contacts (company_id, whatsapp_username) WHERE whatsapp_username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_username_per_company
  ON contacts (company_id, lower(whatsapp_username))
  WHERE whatsapp_username IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_conversations_original_contact_method
  ON conversations (original_contact_method) WHERE original_contact_method IS NOT NULL;

COMMIT;
