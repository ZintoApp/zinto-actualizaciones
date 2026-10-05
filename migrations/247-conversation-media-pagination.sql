CREATE INDEX IF NOT EXISTS idx_conversation_media_page
ON messages (conversation_id, (COALESCE(created_at, sent_at, '1970-01-01'::timestamp)) DESC, id DESC)
WHERE type IN ('image', 'video', 'sticker', 'document', 'audio', 'voice') AND anonymized_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_attachment_page
ON messages (conversation_id, (COALESCE(created_at, sent_at, '1970-01-01'::timestamp)) DESC, id DESC)
WHERE anonymized_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_attachment_message_media
ON email_attachments (message_id, id DESC);
