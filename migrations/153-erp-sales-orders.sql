-- Migration: ERP sales orders, quotations & delivery notes
-- Description: Company-scoped sales order tables and sales order permission keys

BEGIN;

CREATE TABLE IF NOT EXISTS sales_orders (
  id                 SERIAL PRIMARY KEY,
  order_number       TEXT NOT NULL,
  company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id         INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id            INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'draft',
  subtotal           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency           TEXT DEFAULT 'USD',
  notes              TEXT,
  assigned_to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  valid_until        TIMESTAMP,
  shipping_address   JSONB DEFAULT '{}'::jsonb,
  billing_address    JSONB DEFAULT '{}'::jsonb,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW(),
  CONSTRAINT sales_orders_status_check CHECK (status IN (
    'draft', 'quotation', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'
  ))
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_id ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_contact_id ON sales_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_deal_id ON sales_orders(deal_id) WHERE deal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_company_order_number ON sales_orders(company_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_id_company ON sales_orders(id, company_id);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id               SERIAL PRIMARY KEY,
  sales_order_id   INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id       INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  description      TEXT,
  quantity         NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price       NUMERIC(12, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  tax_rate         NUMERIC(5, 2) DEFAULT 0,
  line_total       NUMERIC(12, 2) NOT NULL,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id ON sales_order_items(sales_order_id);

CREATE TABLE IF NOT EXISTS delivery_notes (
  id               SERIAL PRIMARY KEY,
  sales_order_id   INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  delivery_number  TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  tracking_number  TEXT,
  carrier          TEXT,
  items            JSONB DEFAULT '[]'::jsonb,
  notes            TEXT,
  shipped_at       TIMESTAMP,
  delivered_at     TIMESTAMP,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT delivery_notes_status_check CHECK (status IN ('pending', 'shipped', 'delivered', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_order_id ON delivery_notes(sales_order_id);

UPDATE role_permissions
SET permissions = permissions || '{"view_sales_orders": true, "manage_sales_orders": true, "create_quotations": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_sales_orders": false, "manage_sales_orders": false, "create_quotations": false}'::jsonb
WHERE role = 'agent';

COMMIT;
