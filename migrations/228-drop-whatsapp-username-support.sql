-- Drop WhatsApp username / LID / BSUID identity support.
-- Safe if migration 226 (or the earlier ad-hoc 225) never ran.

BEGIN;

DROP INDEX IF EXISTS idx_conversations_original_contact_method;
DROP INDEX IF EXISTS idx_contacts_unique_username_per_company;
DROP INDEX IF EXISTS idx_contacts_company_username;
DROP INDEX IF EXISTS idx_contacts_whatsapp_bsuid;
DROP INDEX IF EXISTS idx_contacts_whatsapp_lid;
DROP INDEX IF EXISTS idx_contacts_whatsapp_username;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS chk_original_contact_method;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS chk_whatsapp_username_format;

ALTER TABLE conversations DROP COLUMN IF EXISTS original_contact_method;
ALTER TABLE contacts DROP COLUMN IF EXISTS whatsapp_username_updated_at;
ALTER TABLE contacts DROP COLUMN IF EXISTS whatsapp_bsuid;
ALTER TABLE contacts DROP COLUMN IF EXISTS whatsapp_lid;
ALTER TABLE contacts DROP COLUMN IF EXISTS whatsapp_username;

COMMIT;
