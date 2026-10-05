-- Migration: ERP multi-currency registry, exchange rate history, tax rules & groups
-- Description: Currencies, rates, configurable tax; optional tax_group_id on line items; ERP settings permissions

BEGIN;

CREATE TABLE IF NOT EXISTS currencies (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  exchange_rate     NUMERIC(14, 6) NOT NULL,
  is_base_currency  BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  decimal_places    INTEGER DEFAULT 2,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_company_currency_code UNIQUE (company_id, code),
  CONSTRAINT idx_currencies_id_company UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_currency    TEXT NOT NULL,
  to_currency      TEXT NOT NULL,
  rate             NUMERIC(14, 6) NOT NULL,
  effective_date   TIMESTAMP NOT NULL,
  source           TEXT,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_rules (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  rate            NUMERIC(5, 2) NOT NULL,
  type            TEXT NOT NULL,
  region          TEXT,
  country         TEXT,
  is_default      BOOLEAN DEFAULT FALSE,
  is_compound     BOOLEAN DEFAULT FALSE,
  applies_to      TEXT NOT NULL DEFAULT 'both',
  effective_from  TIMESTAMP,
  effective_to    TIMESTAMP,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT idx_tax_rules_id_company UNIQUE (id, company_id),
  CONSTRAINT tax_rules_type_check CHECK (type IN ('VAT', 'GST', 'sales_tax', 'withholding', 'exempt')),
  CONSTRAINT tax_rules_applies_to_check CHECK (applies_to IN ('products', 'services', 'both'))
);

CREATE TABLE IF NOT EXISTS tax_groups (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_company_tax_group_name UNIQUE (company_id, name),
  CONSTRAINT idx_tax_groups_id_company UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS tax_group_rules (
  id            SERIAL PRIMARY KEY,
  tax_group_id  INTEGER NOT NULL REFERENCES tax_groups(id) ON DELETE CASCADE,
  tax_rule_id   INTEGER NOT NULL REFERENCES tax_rules(id) ON DELETE CASCADE,
  "order"       INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_tax_group_rule UNIQUE (tax_group_id, tax_rule_id)
);

CREATE INDEX IF NOT EXISTS idx_currencies_company_id ON currencies(company_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_company_id ON exchange_rate_history(company_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_lookup ON exchange_rate_history(company_id, from_currency, to_currency, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_rules_company_id ON tax_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_rules_type ON tax_rules(company_id, type);
CREATE INDEX IF NOT EXISTS idx_tax_groups_company_id ON tax_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_group_rules_group_id ON tax_group_rules(tax_group_id);

ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS tax_group_id INTEGER REFERENCES tax_groups(id) ON DELETE SET NULL;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS tax_group_id INTEGER REFERENCES tax_groups(id) ON DELETE SET NULL;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS tax_group_id INTEGER REFERENCES tax_groups(id) ON DELETE SET NULL;

UPDATE role_permissions
SET permissions = permissions || '{"view_erp_settings": true, "manage_erp_settings": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_erp_settings": false, "manage_erp_settings": false}'::jsonb
WHERE role = 'agent';

COMMIT;
