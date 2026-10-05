-- Real Estate domain records reference existing CRM and ERP masters.
BEGIN;
CREATE TABLE IF NOT EXISTS real_estate_taxonomy (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('property_type','feature','tag')), name text NOT NULL,
  color text, sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  UNIQUE (id,company_id), UNIQUE (company_id,kind,name)
);
CREATE TABLE IF NOT EXISTS real_estate_projects (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL, code text NOT NULL, description text, location text,
  developer_contact_id integer, status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','construction','completed','archived')),
  handover_date date, images jsonb NOT NULL DEFAULT '[]', custom_fields jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1, created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,company_id), UNIQUE (company_id,code),
  FOREIGN KEY (developer_contact_id,company_id) REFERENCES contacts(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_buildings (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id integer NOT NULL, name text NOT NULL, code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0, UNIQUE(id,company_id), UNIQUE(project_id,code),
  FOREIGN KEY (project_id,company_id) REFERENCES real_estate_projects(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_floors (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  building_id integer NOT NULL, name text NOT NULL, level integer NOT NULL,
  UNIQUE(id,company_id), UNIQUE(building_id,level),
  FOREIGN KEY (building_id,company_id) REFERENCES real_estate_buildings(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_assets (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('property','unit')), code text NOT NULL, name text NOT NULL,
  project_id integer, building_id integer, floor_id integer, property_type_id integer,
  location text, address text, description text, bedrooms integer, bathrooms integer,
  area numeric(12,2), area_measure text NOT NULL DEFAULT 'sq_ft' CHECK(area_measure IN('sq_ft','sq_m')),
  ownership_mode text NOT NULL DEFAULT 'company_owned' CHECK(ownership_mode IN('company_owned','managed')),
  status text NOT NULL DEFAULT 'available' CHECK(status IN('available','occupied','rented','reserved','sold','blocked','archived')),
  listing_purpose text NOT NULL DEFAULT 'rent' CHECK(listing_purpose IN('rent','sale','both')),
  sale_price numeric(18,6), rental_price numeric(18,6), currency text NOT NULL,
  assigned_agent_id integer REFERENCES users(id), images jsonb NOT NULL DEFAULT '[]',
  custom_fields jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
  created_by integer REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,company_id), UNIQUE(company_id,code),
  CHECK ((kind='property' AND project_id IS NULL AND building_id IS NULL AND floor_id IS NULL)
    OR (kind='unit' AND project_id IS NOT NULL AND building_id IS NOT NULL AND floor_id IS NOT NULL)),
  CHECK (sale_price IS NULL OR sale_price>=0), CHECK(rental_price IS NULL OR rental_price>=0),
  FOREIGN KEY(project_id,company_id) REFERENCES real_estate_projects(id,company_id),
  FOREIGN KEY(building_id,company_id) REFERENCES real_estate_buildings(id,company_id),
  FOREIGN KEY(floor_id,company_id) REFERENCES real_estate_floors(id,company_id),
  FOREIGN KEY(property_type_id,company_id) REFERENCES real_estate_taxonomy(id,company_id)
);
CREATE INDEX IF NOT EXISTS real_estate_assets_company_kind_status_idx ON real_estate_assets(company_id,kind,status);
CREATE INDEX IF NOT EXISTS real_estate_assets_company_updated_idx ON real_estate_assets(company_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS real_estate_asset_tags (
  company_id integer NOT NULL, asset_id integer NOT NULL, taxonomy_id integer NOT NULL,
  PRIMARY KEY(asset_id,taxonomy_id), FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
  FOREIGN KEY(taxonomy_id,company_id) REFERENCES real_estate_taxonomy(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_contact_roles (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id integer NOT NULL, role text NOT NULL CHECK(role IN('owner','tenant','buyer','seller','guarantor','developer')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id), UNIQUE(company_id,contact_id,role),
  FOREIGN KEY(contact_id,company_id) REFERENCES contacts(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_ownership_versions (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer NOT NULL,
  effective_from date NOT NULL, effective_to date, created_by integer REFERENCES users(id),
  UNIQUE(id,company_id), CHECK(effective_to IS NULL OR effective_to>=effective_from),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_ownership_shares (
  company_id integer NOT NULL, ownership_version_id integer NOT NULL, contact_id integer NOT NULL,
  percentage numeric(7,4) NOT NULL CHECK(percentage>0 AND percentage<=100),
  PRIMARY KEY(ownership_version_id,contact_id),
  FOREIGN KEY(ownership_version_id,company_id) REFERENCES real_estate_ownership_versions(id,company_id),
  FOREIGN KEY(contact_id,company_id) REFERENCES contacts(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_leases (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer NOT NULL, tenant_contact_id integer NOT NULL,
  name text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','expired','terminated','archived')),
  start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>=start_date),
  currency text NOT NULL, rent_amount numeric(18,6) NOT NULL CHECK(rent_amount>=0),
  deposit_amount numeric(18,6) NOT NULL DEFAULT 0 CHECK(deposit_amount>=0), due_day integer NOT NULL DEFAULT 1 CHECK(due_day BETWEEN 1 AND 31),
  terms jsonb NOT NULL DEFAULT '{}', custom_fields jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1, created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
  FOREIGN KEY(tenant_contact_id,company_id) REFERENCES contacts(id,company_id)
);
CREATE INDEX IF NOT EXISTS real_estate_leases_company_asset_dates_idx ON real_estate_leases(company_id,asset_id,start_date,end_date);
CREATE TABLE IF NOT EXISTS real_estate_appointments (
  appointment_id integer PRIMARY KEY REFERENCES contact_appointments(id), company_id integer NOT NULL,
  asset_id integer, agent_user_id integer NOT NULL REFERENCES users(id),
  appointment_type text NOT NULL CHECK(appointment_type IN('viewing','consultation','signing','inspection','handover')),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id)
);
CREATE INDEX IF NOT EXISTS real_estate_appointments_company_agent_idx ON real_estate_appointments(company_id,agent_user_id);
CREATE TABLE IF NOT EXISTS real_estate_maintenance (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer NOT NULL,
  title text NOT NULL, description text, priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'new' CHECK(status IN('new','assigned','in_progress','completed','cancelled')),
  assigned_user_id integer REFERENCES users(id), supplier_id integer,
  custom_fields jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
  created_by integer REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,company_id), FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_inspections (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer NOT NULL, title text NOT NULL,
  scheduled_at timestamptz, inspector_user_id integer REFERENCES users(id),
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','in_progress','completed','cancelled')),
  checklist jsonb NOT NULL DEFAULT '[]', findings jsonb NOT NULL DEFAULT '[]', custom_fields jsonb NOT NULL DEFAULT '{}',
  completed_at timestamptz, version integer NOT NULL DEFAULT 1, created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_reservations (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer NOT NULL, buyer_contact_id integer NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK(status IN('held','confirmed','expired','cancelled','converted')),
  expires_at timestamptz NOT NULL, currency text NOT NULL, deposit_amount numeric(18,6) NOT NULL DEFAULT 0 CHECK(deposit_amount>=0),
  custom_fields jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
  created_by integer REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,company_id), FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
  FOREIGN KEY(buyer_contact_id,company_id) REFERENCES contacts(id,company_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS real_estate_active_reservation_asset_idx
  ON real_estate_reservations(company_id,asset_id) WHERE status IN('held','confirmed');
CREATE INDEX IF NOT EXISTS real_estate_reservation_expiry_idx ON real_estate_reservations(expires_at) WHERE status IN('held','confirmed');
CREATE TABLE IF NOT EXISTS real_estate_sale_agreements (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer NOT NULL, buyer_contact_id integer NOT NULL,
  reservation_id integer, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','finalized','handed_over','cancelled')),
  currency text NOT NULL, sale_amount numeric(18,6) NOT NULL CHECK(sale_amount>=0), cost_amount numeric(18,6),
  finalized_at timestamptz, handed_over_at timestamptz, terms jsonb NOT NULL DEFAULT '{}', custom_fields jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1, created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
  FOREIGN KEY(buyer_contact_id,company_id) REFERENCES contacts(id,company_id),
  FOREIGN KEY(reservation_id,company_id) REFERENCES real_estate_reservations(id,company_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS real_estate_active_sale_asset_idx ON real_estate_sale_agreements(company_id,asset_id)
  WHERE status IN('finalized','handed_over');
CREATE TABLE IF NOT EXISTS real_estate_payment_plans (
  id serial PRIMARY KEY, company_id integer NOT NULL, sale_agreement_id integer NOT NULL, name text NOT NULL,
  currency text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','completed','cancelled')),
  custom_fields jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
  created_by integer REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,company_id), FOREIGN KEY(sale_agreement_id,company_id) REFERENCES real_estate_sale_agreements(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_installments (
  id serial PRIMARY KEY, company_id integer NOT NULL, payment_plan_id integer NOT NULL, label text NOT NULL,
  due_date date NOT NULL, amount numeric(18,6) NOT NULL CHECK(amount>0), milestone text,
  invoice_id integer, UNIQUE(id,company_id),
  FOREIGN KEY(payment_plan_id,company_id) REFERENCES real_estate_payment_plans(id,company_id),
  FOREIGN KEY(invoice_id,company_id) REFERENCES invoices(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_expenses (
  id serial PRIMARY KEY, company_id integer NOT NULL, asset_id integer, maintenance_id integer, supplier_id integer,
  title text NOT NULL, expense_date date NOT NULL, currency text NOT NULL, amount numeric(18,6) NOT NULL CHECK(amount>=0),
  owner_chargeable boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','posted','cancelled')),
  invoice_id integer, lines jsonb NOT NULL DEFAULT '[]', custom_fields jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1, created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
  FOREIGN KEY(maintenance_id,company_id) REFERENCES real_estate_maintenance(id,company_id),
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id),
  FOREIGN KEY(invoice_id,company_id) REFERENCES invoices(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_invoice_sources (
  id serial PRIMARY KEY, company_id integer NOT NULL, invoice_id integer NOT NULL, asset_id integer,
  source_type text NOT NULL CHECK(source_type IN('rent','security_deposit','reservation_deposit','installment','service','expense')),
  source_id integer NOT NULL, period_key text NOT NULL, accounting_context jsonb NOT NULL DEFAULT '{}',
  UNIQUE(company_id,source_type,source_id,period_key), UNIQUE(invoice_id),
  FOREIGN KEY(invoice_id,company_id) REFERENCES invoices(id,company_id),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_settlements (
  id serial PRIMARY KEY, company_id integer NOT NULL, owner_contact_id integer NOT NULL, period_key text NOT NULL,
  currency text NOT NULL, collected numeric(18,6) NOT NULL DEFAULT 0, fees numeric(18,6) NOT NULL DEFAULT 0,
  expenses numeric(18,6) NOT NULL DEFAULT 0, adjustments numeric(18,6) NOT NULL DEFAULT 0,
  payable numeric(18,6) NOT NULL DEFAULT 0, paid numeric(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','posted','partially_paid','paid','reversed')),
  lines jsonb NOT NULL DEFAULT '[]', journal_entry_id integer, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,company_id), UNIQUE(company_id,owner_contact_id,period_key,currency),
  FOREIGN KEY(owner_contact_id,company_id) REFERENCES contacts(id,company_id),
  FOREIGN KEY(journal_entry_id,company_id) REFERENCES journal_entries(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_commission_agreements (
  id serial PRIMARY KEY, company_id integer NOT NULL, agent_user_id integer NOT NULL REFERENCES users(id),
  asset_id integer, calculation text NOT NULL CHECK(calculation IN('percentage','fixed')),
  value numeric(18,6) NOT NULL CHECK(value>=0), currency text, effective_from date NOT NULL,
  effective_to date, created_by integer REFERENCES users(id), UNIQUE(id,company_id),
  FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_commissions (
  id serial PRIMARY KEY, company_id integer NOT NULL, agreement_id integer NOT NULL, invoice_payment_id integer NOT NULL REFERENCES invoice_payments(id),
  currency text NOT NULL, amount numeric(18,6) NOT NULL, paid numeric(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accrued' CHECK(status IN('accrued','partially_paid','paid','reversed')),
  journal_entry_id integer, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id), UNIQUE(agreement_id,invoice_payment_id),
  FOREIGN KEY(agreement_id,company_id) REFERENCES real_estate_commission_agreements(id,company_id),
  FOREIGN KEY(journal_entry_id,company_id) REFERENCES journal_entries(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_documents (
  id serial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id), entity_type text NOT NULL, entity_id integer NOT NULL,
  name text NOT NULL, category text NOT NULL DEFAULT 'general', media_path text NOT NULL,
  mime_type text NOT NULL, file_size bigint NOT NULL, uploaded_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id)
);
CREATE TABLE IF NOT EXISTS real_estate_activity (
  id bigserial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id), entity_type text NOT NULL,
  entity_id integer NOT NULL, action text NOT NULL, actor_user_id integer REFERENCES users(id),
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS real_estate_activity_entity_idx ON real_estate_activity(company_id,entity_type,entity_id,created_at DESC);
CREATE TABLE IF NOT EXISTS real_estate_jobs (
  id bigserial PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id), source_key text NOT NULL,
  job_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','completed','failed')),
  attempts integer NOT NULL DEFAULT 0, last_error text, locked_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,source_key)
);
CREATE INDEX IF NOT EXISTS real_estate_jobs_due_idx ON real_estate_jobs(status,run_at);
COMMIT;
