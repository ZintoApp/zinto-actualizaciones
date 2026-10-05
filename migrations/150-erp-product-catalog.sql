-- Migration: ERP product catalog (categories, products, variants, price tiers)
-- Description: Company-scoped product tables and ERP permission keys on role_permissions

BEGIN;

-- Product Categories
CREATE TABLE IF NOT EXISTS product_categories (
  id                 SERIAL PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  parent_category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  slug               TEXT,
  sort_order         INTEGER DEFAULT 0,
  is_active          BOOLEAN DEFAULT TRUE,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_company_id ON product_categories(company_id);

CREATE UNIQUE INDEX IF NOT EXISTS unique_company_category_slug ON product_categories(company_id, slug);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id    INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  sku            TEXT,
  name           TEXT NOT NULL,
  description    TEXT,
  type           TEXT NOT NULL DEFAULT 'physical',
  unit_price     NUMERIC(12, 2),
  cost_price     NUMERIC(12, 2),
  currency       TEXT DEFAULT 'USD',
  unit_of_measure TEXT DEFAULT 'unit',
  barcode        TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  images         JSONB DEFAULT '[]'::jsonb,
  custom_fields  JSONB DEFAULT '{}'::jsonb,
  tags           TEXT[],
  is_taxable     BOOLEAN DEFAULT TRUE,
  weight         NUMERIC(10, 2),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT products_type_check CHECK (type IN ('physical', 'service', 'digital')),
  CONSTRAINT products_status_check CHECK (status IN ('active', 'inactive', 'draft', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(company_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS unique_company_product_sku ON products(company_id, sku) WHERE sku IS NOT NULL;

-- Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku         TEXT,
  name        TEXT NOT NULL,
  attributes  JSONB DEFAULT '{}'::jsonb,
  unit_price  NUMERIC(12, 2),
  cost_price  NUMERIC(12, 2),
  barcode     TEXT,
  status      TEXT DEFAULT 'active',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT product_variants_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_company_id ON product_variants(company_id);

-- Product Price Tiers
CREATE TABLE IF NOT EXISTS product_price_tiers (
  id           SERIAL PRIMARY KEY,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id   INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER,
  unit_price   NUMERIC(12, 2) NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_price_tiers_product_id ON product_price_tiers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_price_tiers_company_id ON product_price_tiers(company_id);

-- Composite (id, company_id) uniqueness for tenant-safe composite foreign keys (see migration 149 pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_id_company ON product_categories(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_id_company ON products(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_id_company ON product_variants(id, company_id);

-- Update role permissions for existing companies
UPDATE role_permissions
SET permissions = permissions || '{"view_erp": true, "view_products": true, "manage_products": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_erp": false, "view_products": false, "manage_products": false}'::jsonb
WHERE role = 'agent';

COMMIT;
