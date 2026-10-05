-- Tokens are created lazily; existing tickets and queue responses remain unchanged.
ALTER TABLE dental_queue_turns ADD COLUMN IF NOT EXISTS digital_token text;
CREATE UNIQUE INDEX IF NOT EXISTS dental_queue_digital_token
  ON dental_queue_turns(digital_token) WHERE digital_token IS NOT NULL;
