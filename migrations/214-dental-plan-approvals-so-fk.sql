BEGIN;

-- Composite FK (sales_order_id, company_id) ON DELETE SET NULL nulls BOTH columns.
-- company_id is NOT NULL, so deleting a sales order after plan approval fails with 23502.
-- Use a single-column FK so only sales_order_id is cleared.
ALTER TABLE dental_plan_approvals
  DROP CONSTRAINT IF EXISTS dental_plan_approvals_sales_order_company_fk;

ALTER TABLE dental_plan_approvals
  DROP CONSTRAINT IF EXISTS dental_plan_approvals_sales_order_fk;

ALTER TABLE dental_plan_approvals
  ADD CONSTRAINT dental_plan_approvals_sales_order_fk
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL;

COMMIT;
