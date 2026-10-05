ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS is_menu_category boolean DEFAULT false;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS menu_sort_order integer DEFAULT 0;

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_menu_item boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_time_minutes integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS kitchen_station_id integer REFERENCES restaurant_kitchen_stations(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS combo_items jsonb DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe_ingredients jsonb DEFAULT '[]';

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS modifier_selections jsonb DEFAULT '[]';
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS special_instructions text;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tip_amount numeric(12,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_charge_amount numeric(12,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_charge_rate numeric(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS split_bill_group_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS split_bill_seat_label text;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_kitchen_station_id_restaurant_kitchen_stations_id_fk;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_kitchen_station_company_fk;
ALTER TABLE products
  ADD CONSTRAINT products_kitchen_station_company_fk
  FOREIGN KEY (kitchen_station_id, company_id)
  REFERENCES restaurant_kitchen_stations(id, company_id)
  ON DELETE SET NULL;
