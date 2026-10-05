CREATE TABLE IF NOT EXISTS dental_reminder_batches (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  config jsonb NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','paused','cancelled','completed')),
  timezone text NOT NULL,
  next_run_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX IF NOT EXISTS dental_batch_due_idx ON dental_reminder_batches(next_run_at) WHERE state = 'active';
CREATE TABLE IF NOT EXISTS dental_reminder_batch_runs (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  batch_id integer NOT NULL,
  send_date date NOT NULL,
  appointment_date date NOT NULL,
  scheduled_for timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  timezone text NOT NULL,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, batch_id) REFERENCES dental_reminder_batches(company_id, id) ON DELETE CASCADE,
  UNIQUE (batch_id, send_date),
  UNIQUE (company_id, id)
);
CREATE TABLE IF NOT EXISTS dental_reminder_batch_deliveries (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  run_id integer NOT NULL,
  appointment_id integer NOT NULL,
  occurrence integer NOT NULL,
  scheduled_for timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','cancelled','skipped','failed','unknown')),
  attempts integer NOT NULL DEFAULT 0,
  claim_id uuid,
  lease_expires_at timestamptz,
  dispatch_started_at timestamptz,
  conversation_id integer REFERENCES conversations(id) ON DELETE SET NULL,
  channel_connection_id integer REFERENCES channel_connections(id) ON DELETE SET NULL,
  message_id text,
  last_error text,
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, run_id) REFERENCES dental_reminder_batch_runs(company_id, id) ON DELETE CASCADE,
  UNIQUE (run_id, appointment_id)
);
-- Retain appointment IDs after deletion so activity can explain skipped recipients.
CREATE INDEX IF NOT EXISTS dental_batch_delivery_due_idx ON dental_reminder_batch_deliveries(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS dental_batch_run_company_idx ON dental_reminder_batch_runs(company_id, id DESC);
CREATE INDEX IF NOT EXISTS dental_batch_delivery_run_idx ON dental_reminder_batch_deliveries(run_id, id);
