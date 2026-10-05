ALTER TABLE restaurant_order_contexts
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_order_contexts_company_qr_idempotency_unique
  ON restaurant_order_contexts (company_id, qr_token_id, idempotency_key);
