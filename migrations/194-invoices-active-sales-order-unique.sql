CREATE UNIQUE INDEX IF NOT EXISTS invoices_active_sales_order_unique
ON invoices (company_id, sales_order_id)
WHERE sales_order_id IS NOT NULL
  AND status NOT IN ('cancelled', 'void');
