BEGIN;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_display_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS last_whatsapp_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_whatsapp_sync_connection_id INTEGER REFERENCES channel_connections(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS whatsapp_contact_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'completed_with_errors', 'failed')),
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_sync_runs_one_active_company
  ON whatsapp_contact_sync_runs (company_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS whatsapp_contact_sync_runs_company_latest
  ON whatsapp_contact_sync_runs (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_contact_sync_items (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES whatsapp_contact_sync_runs(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  connection_id INTEGER REFERENCES channel_connections(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'updated', 'unchanged', 'skipped', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claim_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  skip_reason TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (run_id, contact_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_contact_sync_items_pending
  ON whatsapp_contact_sync_items (connection_id, available_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS whatsapp_contact_sync_items_run
  ON whatsapp_contact_sync_items (run_id, status);

COMMENT ON TABLE whatsapp_contact_sync_runs IS
  'Durable company-wide WhatsApp contact synchronization runs';
COMMENT ON TABLE whatsapp_contact_sync_items IS
  'Per-contact work and outcome records for WhatsApp contact synchronization';

COMMIT;
