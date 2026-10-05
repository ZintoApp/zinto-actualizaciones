-- Migration: ERP suppliers, supplier products, purchase orders, goods receipts
-- Description: Procurement tables and permission keys

BEGIN;

CREATE TABLE IF NOT EXISTS suppliers (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  address      JSONB DEFAULT '{}'::jsonb,
  tax_id       TEXT,
  payment_terms TEXT,
  currency     TEXT DEFAULT 'USD',
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  rating       INTEGER,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT suppliers_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_id_company ON suppliers(id, company_id);

CREATE TABLE IF NOT EXISTS supplier_products (
  id SERIAL PRIMARY KEY,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_sku   TEXT,
  supplier_price NUMERIC(12, 2),
  lead_time_days INTEGER,
  min_order_qty  INTEGER,
  is_preferred   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_supplier_product UNIQUE (supplier_id, product_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     SERIAL PRIMARY KEY,
  order_number           TEXT NOT NULL,
  company_id             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id            INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'draft',
  subtotal               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency               TEXT DEFAULT 'USD',
  expected_delivery_date TIMESTAMP,
  notes                  TEXT,
  created_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW(),
  CONSTRAINT purchase_orders_status_check CHECK (status IN (
    'draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'
  ))
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_company_po_number ON purchase_orders(company_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_id_company ON purchase_orders(id, company_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                 SERIAL PRIMARY KEY,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id         INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id         INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  description        TEXT,
  quantity           NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_cost          NUMERIC(12, 2) NOT NULL,
  received_qty       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  line_total         NUMERIC(12, 2) NOT NULL,
  sort_order         INTEGER DEFAULT 0,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order_id ON purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id                  SERIAL PRIMARY KEY,
  purchase_order_id   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id        INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  receipt_number      TEXT,
  received_date       TIMESTAMP DEFAULT NOW(),
  items               JSONB DEFAULT '[]'::jsonb,
  notes               TEXT,
  received_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_po_id ON goods_receipts(purchase_order_id);

UPDATE role_permissions
SET permissions = permissions || '{"view_suppliers": true, "manage_suppliers": true, "view_purchase_orders": true, "manage_purchase_orders": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_suppliers": false, "manage_suppliers": false, "view_purchase_orders": false, "manage_purchase_orders": false}'::jsonb
WHERE role = 'agent';

COMMIT;
