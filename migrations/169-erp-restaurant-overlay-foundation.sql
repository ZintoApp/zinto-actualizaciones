BEGIN;

CREATE TABLE IF NOT EXISTS restaurant_sections (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_sections_id_company_unique ON restaurant_sections(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_sections_company_code_unique ON restaurant_sections(company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_sections_company_name_unique ON restaurant_sections(company_id, name);
CREATE INDEX IF NOT EXISTS restaurant_sections_company_idx ON restaurant_sections(company_id);
CREATE INDEX IF NOT EXISTS restaurant_sections_company_active_sort_idx ON restaurant_sections(company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  section_id INTEGER,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_tables_section_company_fk
    FOREIGN KEY (section_id, company_id) REFERENCES restaurant_sections(id, company_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_id_company_unique ON restaurant_tables(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_company_code_unique ON restaurant_tables(company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_company_label_unique ON restaurant_tables(company_id, label);
CREATE INDEX IF NOT EXISTS restaurant_tables_company_idx ON restaurant_tables(company_id);
CREATE INDEX IF NOT EXISTS restaurant_tables_company_section_idx ON restaurant_tables(company_id, section_id);
CREATE INDEX IF NOT EXISTS restaurant_tables_company_active_sort_idx ON restaurant_tables(company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS restaurant_kitchen_stations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_kitchen_stations_warehouse_company_fk
    FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_stations_id_company_unique ON restaurant_kitchen_stations(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_stations_company_code_unique ON restaurant_kitchen_stations(company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_stations_company_name_unique ON restaurant_kitchen_stations(company_id, name);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_stations_company_idx ON restaurant_kitchen_stations(company_id);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_stations_company_active_sort_idx ON restaurant_kitchen_stations(company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS restaurant_reservations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER,
  table_id INTEGER,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'seated', 'completed', 'cancelled', 'no_show')),
  reservation_at TIMESTAMP NOT NULL,
  expected_duration_minutes INTEGER,
  guest_count INTEGER NOT NULL DEFAULT 1,
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_email TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  seated_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_reservations_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE SET NULL,
  CONSTRAINT restaurant_reservations_table_company_fk
    FOREIGN KEY (table_id, company_id) REFERENCES restaurant_tables(id, company_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_reservations_id_company_unique ON restaurant_reservations(id, company_id);
CREATE INDEX IF NOT EXISTS restaurant_reservations_company_idx ON restaurant_reservations(company_id);
CREATE INDEX IF NOT EXISTS restaurant_reservations_company_status_idx ON restaurant_reservations(company_id, status);
CREATE INDEX IF NOT EXISTS restaurant_reservations_company_time_idx ON restaurant_reservations(company_id, reservation_at);
CREATE INDEX IF NOT EXISTS restaurant_reservations_company_table_idx ON restaurant_reservations(company_id, table_id);

CREATE TABLE IF NOT EXISTS restaurant_waitlist_entries (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER,
  target_table_id INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'seated', 'left')),
  guest_count INTEGER NOT NULL DEFAULT 1,
  quoted_wait_minutes INTEGER,
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_email TEXT,
  notes TEXT,
  notified_at TIMESTAMP,
  seated_at TIMESTAMP,
  left_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_waitlist_entries_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE SET NULL,
  CONSTRAINT restaurant_waitlist_entries_target_table_company_fk
    FOREIGN KEY (target_table_id, company_id) REFERENCES restaurant_tables(id, company_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_waitlist_entries_id_company_unique ON restaurant_waitlist_entries(id, company_id);
CREATE INDEX IF NOT EXISTS restaurant_waitlist_entries_company_idx ON restaurant_waitlist_entries(company_id);
CREATE INDEX IF NOT EXISTS restaurant_waitlist_entries_company_status_idx ON restaurant_waitlist_entries(company_id, status);
CREATE INDEX IF NOT EXISTS restaurant_waitlist_entries_company_created_idx ON restaurant_waitlist_entries(company_id, created_at);
CREATE INDEX IF NOT EXISTS restaurant_waitlist_entries_company_target_table_idx ON restaurant_waitlist_entries(company_id, target_table_id);

CREATE TABLE IF NOT EXISTS restaurant_table_qr_tokens (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_table_qr_tokens_table_company_fk
    FOREIGN KEY (table_id, company_id) REFERENCES restaurant_tables(id, company_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_table_qr_tokens_id_company_unique ON restaurant_table_qr_tokens(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_table_qr_tokens_company_table_unique ON restaurant_table_qr_tokens(company_id, table_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_table_qr_tokens_token_unique ON restaurant_table_qr_tokens(token);
CREATE INDEX IF NOT EXISTS restaurant_table_qr_tokens_company_idx ON restaurant_table_qr_tokens(company_id);
CREATE INDEX IF NOT EXISTS restaurant_table_qr_tokens_company_token_active_idx ON restaurant_table_qr_tokens(company_id, token, is_active);

CREATE TABLE IF NOT EXISTS restaurant_order_contexts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sales_order_id INTEGER NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'dine_in' CHECK (service_type IN ('dine_in', 'takeaway', 'delivery')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'in_preparation', 'ready', 'completed', 'cancelled')),
  table_id INTEGER,
  reservation_id INTEGER,
  qr_token_id INTEGER,
  warehouse_id INTEGER,
  guest_count INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_order_contexts_sales_order_company_fk
    FOREIGN KEY (sales_order_id, company_id) REFERENCES sales_orders(id, company_id) ON DELETE CASCADE,
  CONSTRAINT restaurant_order_contexts_table_company_fk
    FOREIGN KEY (table_id, company_id) REFERENCES restaurant_tables(id, company_id) ON DELETE SET NULL,
  CONSTRAINT restaurant_order_contexts_reservation_company_fk
    FOREIGN KEY (reservation_id, company_id) REFERENCES restaurant_reservations(id, company_id) ON DELETE SET NULL,
  CONSTRAINT restaurant_order_contexts_qr_token_company_fk
    FOREIGN KEY (qr_token_id, company_id) REFERENCES restaurant_table_qr_tokens(id, company_id) ON DELETE SET NULL,
  CONSTRAINT restaurant_order_contexts_warehouse_company_fk
    FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_order_contexts_id_company_unique ON restaurant_order_contexts(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_order_contexts_company_sales_order_unique ON restaurant_order_contexts(company_id, sales_order_id);
CREATE INDEX IF NOT EXISTS restaurant_order_contexts_company_idx ON restaurant_order_contexts(company_id);
CREATE INDEX IF NOT EXISTS restaurant_order_contexts_company_status_idx ON restaurant_order_contexts(company_id, status);
CREATE INDEX IF NOT EXISTS restaurant_order_contexts_company_service_type_idx ON restaurant_order_contexts(company_id, service_type);
CREATE INDEX IF NOT EXISTS restaurant_order_contexts_company_table_idx ON restaurant_order_contexts(company_id, table_id);

CREATE TABLE IF NOT EXISTS restaurant_kitchen_tickets (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_context_id INTEGER NOT NULL,
  station_id INTEGER NOT NULL,
  ticket_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'ready', 'served', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'rush', 'fire')),
  fired_at TIMESTAMP,
  ready_at TIMESTAMP,
  served_at TIMESTAMP,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_kitchen_tickets_order_context_company_fk
    FOREIGN KEY (order_context_id, company_id) REFERENCES restaurant_order_contexts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT restaurant_kitchen_tickets_station_company_fk
    FOREIGN KEY (station_id, company_id) REFERENCES restaurant_kitchen_stations(id, company_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_tickets_id_company_unique ON restaurant_kitchen_tickets(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_tickets_company_ticket_number_unique ON restaurant_kitchen_tickets(company_id, ticket_number);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_tickets_active_order_station_unique
  ON restaurant_kitchen_tickets(company_id, order_context_id, station_id)
  WHERE status IN ('queued', 'in_progress', 'ready');
CREATE INDEX IF NOT EXISTS restaurant_kitchen_tickets_company_idx ON restaurant_kitchen_tickets(company_id);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_tickets_company_status_idx ON restaurant_kitchen_tickets(company_id, status);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_tickets_company_station_status_idx ON restaurant_kitchen_tickets(company_id, station_id, status);

CREATE TABLE IF NOT EXISTS restaurant_kitchen_ticket_items (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL,
  sales_order_item_id INTEGER NOT NULL REFERENCES sales_order_items(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'ready', 'served', 'cancelled')),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_kitchen_ticket_items_ticket_company_fk
    FOREIGN KEY (ticket_id, company_id) REFERENCES restaurant_kitchen_tickets(id, company_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_ticket_items_id_company_unique ON restaurant_kitchen_ticket_items(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_kitchen_ticket_items_ticket_line_unique ON restaurant_kitchen_ticket_items(ticket_id, sales_order_item_id);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_ticket_items_company_idx ON restaurant_kitchen_ticket_items(company_id);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_ticket_items_company_status_idx ON restaurant_kitchen_ticket_items(company_id, status);
CREATE INDEX IF NOT EXISTS restaurant_kitchen_ticket_items_company_ticket_idx ON restaurant_kitchen_ticket_items(company_id, ticket_id);

CREATE TABLE IF NOT EXISTS restaurant_delivery_dispatches (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_context_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled')),
  assigned_to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  driver_name TEXT,
  driver_phone TEXT,
  provider TEXT,
  provider_reference TEXT,
  provider_payload JSONB DEFAULT '{}'::jsonb,
  assigned_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT restaurant_delivery_dispatches_order_context_company_fk
    FOREIGN KEY (order_context_id, company_id) REFERENCES restaurant_order_contexts(id, company_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_delivery_dispatches_id_company_unique ON restaurant_delivery_dispatches(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_delivery_dispatches_company_order_context_unique ON restaurant_delivery_dispatches(company_id, order_context_id);
CREATE INDEX IF NOT EXISTS restaurant_delivery_dispatches_company_idx ON restaurant_delivery_dispatches(company_id);
CREATE INDEX IF NOT EXISTS restaurant_delivery_dispatches_company_status_idx ON restaurant_delivery_dispatches(company_id, status);
CREATE INDEX IF NOT EXISTS restaurant_delivery_dispatches_company_assignee_idx ON restaurant_delivery_dispatches(company_id, assigned_to_user_id);

COMMIT;
