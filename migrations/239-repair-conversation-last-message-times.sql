BEGIN;

-- Older WhatsApp history imports stamped conversations with the import time.
-- Rebuild the list timestamp from the newest message already stored in each conversation.
WITH latest_message AS (
  SELECT
    conversation_id,
    MAX(COALESCE(sent_at, created_at)) AS occurred_at
  FROM messages
  GROUP BY conversation_id
)
UPDATE conversations AS conversation
SET
  last_message_at = latest_message.occurred_at,
  updated_at = NOW()
FROM latest_message
WHERE conversation.id = latest_message.conversation_id
  AND latest_message.occurred_at IS NOT NULL
  AND conversation.last_message_at IS DISTINCT FROM latest_message.occurred_at;

COMMIT;
