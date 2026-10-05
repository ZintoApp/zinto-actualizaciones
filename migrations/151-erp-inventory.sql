-- Migration: ERP inventory & stock management (warehouses, stock levels, movements, transfers)
-- Description: Company-scoped inventory tables and inventory permission keys on role_permissions

BEGIN;

-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  address      JSONB DEFAULT '{}'::jsonb,
  is_default   BOOLEAN DEFAULT FALSE,
  is_active    BOOLEAN DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_company_id ON warehouses(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_id_company ON warehouses(id, company_id);

-- Stock Levels
CREATE TABLE IF NOT EXISTS stock_levels (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id     INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reserved_qty   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reorder_point  NUMERIC(12, 2),
  reorder_qty    NUMERIC(12, 2),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_company_id ON stock_levels(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_warehouse_id ON stock_levels(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_product_id ON stock_levels(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_stock_product_variant_warehouse  ON stock_levels(product_id, COALESCE(variant_id, 0), warehouse_id);

-- Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id     INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  movement_type  TEXT NOT NULL,
  quantity       NUMERIC(12, 2) NOT NULL,
  reference_type TEXT,
  reference_id   INTEGER,
  notes          TEXT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT stock_movements_movement_type_check CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_id ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(company_id, created_at DESC);

-- Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transfer_number    TEXT,
  from_warehouse_id  INTEGER NOT NULL REFERENCES warehouses(id),
  to_warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id),
  status             TEXT NOT NULL DEFAULT 'draft',
  items              JSONB DEFAULT '[]'::jsonb,
  notes              TEXT,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW(),
  CONSTRAINT stock_transfers_status_check CHECK (status IN ('draft', 'in_transit', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_company_id ON stock_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(company_id, status);

-- Update role permissions for existing companies
UPDATE role_permissions
SET permissions = permissions || '{"view_inventory": true, "manage_inventory": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_inventory": false, "manage_inventory": false}'::jsonb
WHERE role = 'agent';

COMMIT;
