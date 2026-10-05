BEGIN;

ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS contact_sync_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE channel_connections
SET contact_sync_enabled = false
WHERE contact_sync_enabled IS NULL OR history_sync_enabled IS NOT TRUE;

COMMENT ON COLUMN channel_connections.contact_sync_enabled IS
  'Import contacts exposed by Baileys during the initial WhatsApp synchronization';

COMMIT;
