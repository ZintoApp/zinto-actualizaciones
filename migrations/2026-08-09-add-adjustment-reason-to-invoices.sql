-- Add adjustment_reason column to invoices table
-- Created by migration to match application schema (shared/schema.ts)
BEGIN;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS adjustment_reason text;

COMMIT;

