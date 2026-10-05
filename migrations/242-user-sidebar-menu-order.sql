-- Per-user ordering for the company sidebar's top-level application menu.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sidebar_menu_order JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
