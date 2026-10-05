CREATE TABLE IF NOT EXISTS bot_loop_message_reservations (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL UNIQUE,
  message_count INTEGER NOT NULL DEFAULT 1 CHECK (message_count > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'sent')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bot_loop_reservations_conversation_window
  ON bot_loop_message_reservations(company_id, conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_bot_loop_reservations_expires_at
  ON bot_loop_message_reservations(expires_at);
