BEGIN;

-- Billing lifecycle statuses for treatment plans / procedures (text columns; app validates enums).
-- No CHECK constraints were added in 211, so status values are free-form at DB level.

CREATE TABLE IF NOT EXISTS dental_plan_approvals (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL,
  sales_order_id INTEGER,
  decision TEXT NOT NULL DEFAULT 'approved',
  notes TEXT,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT dental_plan_approvals_plan_company_fk
    FOREIGN KEY (plan_id, company_id) REFERENCES dental_treatment_plans(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dental_plan_approvals_sales_order_company_fk
    FOREIGN KEY (sales_order_id, company_id) REFERENCES sales_orders(id, company_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dental_plan_approvals_company_plan_idx
  ON dental_plan_approvals(company_id, plan_id, approved_at DESC);

COMMIT;
