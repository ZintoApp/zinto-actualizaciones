-- 146: Concurrency hardening (rate limits, schedulers, campaigns, billing, Stripe, restore prep)

-- 1) api_rate_limits: merge duplicates then unique bucket key
UPDATE api_rate_limits ar
SET
  request_count = agg.total_cnt,
  updated_at = NOW()
FROM (
  SELECT
    api_key_id,
    window_type,
    window_start,
    SUM(request_count)::integer AS total_cnt
  FROM api_rate_limits
  GROUP BY api_key_id, window_type, window_start
) agg
WHERE ar.api_key_id = agg.api_key_id
  AND ar.window_type = agg.window_type
  AND ar.window_start = agg.window_start;

DELETE FROM api_rate_limits a
USING api_rate_limits b
WHERE a.api_key_id = b.api_key_id
  AND a.window_type = b.window_type
  AND a.window_start = b.window_start
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS api_rate_limits_bucket_unique
  ON api_rate_limits (api_key_id, window_type, window_start);

-- 2) follow_up_schedules: processing + lease columns
ALTER TABLE follow_up_schedules DROP CONSTRAINT IF EXISTS follow_up_schedules_status_check;
ALTER TABLE follow_up_schedules ADD CONSTRAINT follow_up_schedules_status_check
  CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled', 'expired'));

ALTER TABLE follow_up_schedules
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processing_claim_id TEXT;

-- 3) scheduled_messages: lease columns for abandoned-claim retry
ALTER TABLE scheduled_messages
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processing_claim_id TEXT;

-- 4) campaign_queue: unique only for active rows (pending/processing), not terminal states
DROP INDEX IF EXISTS campaign_queue_campaign_recipient_unique;

DELETE FROM campaign_queue a
USING campaign_queue b
WHERE a.campaign_id = b.campaign_id
  AND a.recipient_id = b.recipient_id
  AND a.status IN ('pending', 'processing')
  AND b.status IN ('pending', 'processing')
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_queue_active_campaign_recipient_unique
  ON campaign_queue (campaign_id, recipient_id)
  WHERE (status IN ('pending', 'processing'));

-- 5) Billing event ordering per company
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_processed_billing_event_at TIMESTAMP;

-- 6) Stripe webhook idempotency ledger
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_company_idx ON stripe_webhook_events (company_id);

-- 7) Recurring / external payment natural key (non-null external ids).
--    Application uses ON CONFLICT ... DO UPDATE so a later success for the same invoice id updates the row.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_external_tx_unique
  ON payment_transactions (external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
