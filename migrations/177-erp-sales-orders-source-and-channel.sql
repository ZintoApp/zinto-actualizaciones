ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS flow_id integer REFERENCES flows(id) ON DELETE SET NULL;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS channel_connection_id integer REFERENCES channel_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_source ON sales_orders (company_id, source);
