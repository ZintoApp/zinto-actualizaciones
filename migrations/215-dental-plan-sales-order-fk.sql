BEGIN;

-- Same composite ON DELETE SET NULL trap as dental_plan_approvals (fixed in 214):
-- (sales_order_id, company_id) SET NULL would null company_id (NOT NULL) on SO delete.
ALTER TABLE dental_treatment_plans
  DROP CONSTRAINT IF EXISTS dental_treatment_plans_sales_order_company_fk;

ALTER TABLE dental_treatment_plans
  DROP CONSTRAINT IF EXISTS dental_treatment_plans_sales_order_fk;

ALTER TABLE dental_treatment_plans
  ADD CONSTRAINT dental_treatment_plans_sales_order_fk
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL;

COMMIT;
