-- Instagram flow replies and native echoes have explicit sender attribution.
-- Older installations only allowed user/contact, causing successful sends to fail persistence.
BEGIN;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('user', 'contact', 'bot', 'external')) NOT VALID;
COMMIT;
