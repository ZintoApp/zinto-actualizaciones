BEGIN;

-- Legacy dental foundation (patient_profile_id / total_estimate) conflicts with Issue 06/07.
-- Force-rename when the contact_id-based schema is absent.
DO $$
BEGIN
  IF to_regclass('public.dental_treatment_plans') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'dental_treatment_plans'
         AND column_name = 'patient_profile_id'
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'dental_treatment_plans'
         AND column_name = 'contact_id'
     )
  THEN
    IF to_regclass('public.dental_treatment_plan_approvals') IS NOT NULL
       AND to_regclass('public.dental_treatment_plan_approvals_legacy') IS NULL THEN
      ALTER TABLE dental_treatment_plan_approvals RENAME TO dental_treatment_plan_approvals_legacy;
    END IF;
    IF to_regclass('public.dental_treatment_plan_items') IS NOT NULL
       AND to_regclass('public.dental_treatment_plan_items_legacy') IS NULL THEN
      ALTER TABLE dental_treatment_plan_items RENAME TO dental_treatment_plan_items_legacy;
    END IF;
    IF to_regclass('public.dental_treatment_plan_options') IS NOT NULL
       AND to_regclass('public.dental_treatment_plan_options_legacy') IS NULL THEN
      ALTER TABLE dental_treatment_plan_options RENAME TO dental_treatment_plan_options_legacy;
    END IF;
    IF to_regclass('public.dental_treatment_plans_legacy') IS NULL THEN
      ALTER TABLE dental_treatment_plans RENAME TO dental_treatment_plans_legacy;
      -- Indexes keep their names across table rename; free names for the new schema.
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'dental_treatment_plans_id_company_unique') THEN
        ALTER INDEX dental_treatment_plans_id_company_unique
          RENAME TO dental_treatment_plans_id_company_unique_legacy;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'dental_treatment_plans_pkey') THEN
        ALTER INDEX dental_treatment_plans_pkey
          RENAME TO dental_treatment_plans_legacy_pkey;
      END IF;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dental_treatment_plans (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  currency TEXT NOT NULL DEFAULT 'USD',
  estimated_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sales_order_id INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT dental_treatment_plans_id_company_unique UNIQUE (id, company_id),
  CONSTRAINT dental_treatment_plans_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dental_treatment_plans_sales_order_company_fk
    FOREIGN KEY (sales_order_id, company_id) REFERENCES sales_orders(id, company_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dental_treatment_plans_company_contact_idx
  ON dental_treatment_plans(company_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dental_treatment_plans_company_status_idx
  ON dental_treatment_plans(company_id, status);

CREATE TABLE IF NOT EXISTS dental_treatment_procedures (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL,
  product_id INTEGER,
  description TEXT NOT NULL,
  tooth_refs JSONB,
  surfaces TEXT,
  phase INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'planned',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estimated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT dental_treatment_procedures_plan_company_fk
    FOREIGN KEY (plan_id, company_id) REFERENCES dental_treatment_plans(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dental_treatment_procedures_product_company_fk
    FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dental_treatment_procedures_plan_sort_idx
  ON dental_treatment_procedures(company_id, plan_id, sort_order, id);

COMMIT;
