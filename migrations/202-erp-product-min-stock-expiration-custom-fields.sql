-- Migration: Product min stock, expiration date, and custom field definitions
-- Description: Adds min_stock and expiration_date to products; creates product_custom_field_definitions table

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiration_date DATE;

CREATE TABLE IF NOT EXISTS product_custom_field_definitions (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  field_key    TEXT NOT NULL,
  field_type   TEXT NOT NULL,
  options      JSONB DEFAULT '[]'::jsonb,
  is_required  BOOLEAN DEFAULT FALSE,
  default_value TEXT,
  sort_order   INTEGER DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT product_custom_field_definitions_field_type_check CHECK (field_type IN ('text', 'textarea', 'number', 'date', 'select', 'checkbox'))
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_company_custom_field_key ON product_custom_field_definitions(company_id, field_key);
CREATE INDEX IF NOT EXISTS idx_product_custom_field_definitions_company_id ON product_custom_field_definitions(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_custom_field_definitions_id_company ON product_custom_field_definitions(id, company_id);

COMMIT;
