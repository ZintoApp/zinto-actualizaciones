-- Persist digits-only phone for indexable deduplication and list filters
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_digits TEXT;

UPDATE contacts
SET phone_digits = NULLIF(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), '')
WHERE phone IS NOT NULL
  AND phone NOT LIKE 'LID-%';

UPDATE contacts
SET phone_digits = NULL
WHERE phone IS NULL OR phone LIKE 'LID-%';

CREATE INDEX IF NOT EXISTS idx_contacts_company_phone_digits
ON contacts (company_id, phone_digits)
WHERE phone_digits IS NOT NULL;

ANALYZE contacts;
