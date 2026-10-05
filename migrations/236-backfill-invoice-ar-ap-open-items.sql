BEGIN;

-- Invoices that were incorrectly promoted draft → sent by totals recalculation
-- never received an accounts_receivable / accounts_payable open item. Backfill
-- those rows so payment recording can succeed.
INSERT INTO accounts_receivable (
  company_id,
  contact_id,
  invoice_id,
  journal_entry_id,
  amount,
  paid_amount,
  due_date,
  status,
  created_at,
  updated_at
)
SELECT
  i.company_id,
  i.contact_id,
  i.id,
  NULL,
  i.total_amount,
  COALESCE(i.amount_paid, 0),
  i.due_date,
  CASE
    WHEN COALESCE(i.amount_paid, 0)::numeric >= i.total_amount::numeric AND i.total_amount::numeric > 0 THEN 'paid'
    WHEN COALESCE(i.amount_paid, 0)::numeric > 0 THEN 'partially_paid'
    WHEN i.due_date IS NOT NULL AND i.due_date < NOW() AND COALESCE(i.amount_due, 0)::numeric > 0 THEN 'overdue'
    ELSE 'open'
  END,
  NOW(),
  NOW()
FROM invoices i
WHERE i.type = 'sales_invoice'
  AND i.status IN ('sent', 'partially_paid', 'overdue', 'paid')
  AND NOT EXISTS (
    SELECT 1
    FROM accounts_receivable ar
    WHERE ar.company_id = i.company_id
      AND ar.invoice_id = i.id
  );

INSERT INTO accounts_payable (
  company_id,
  supplier_id,
  invoice_id,
  journal_entry_id,
  amount,
  paid_amount,
  due_date,
  status,
  created_at,
  updated_at
)
SELECT
  i.company_id,
  i.supplier_id,
  i.id,
  NULL,
  i.total_amount,
  COALESCE(i.amount_paid, 0),
  i.due_date,
  CASE
    WHEN COALESCE(i.amount_paid, 0)::numeric >= i.total_amount::numeric AND i.total_amount::numeric > 0 THEN 'paid'
    WHEN COALESCE(i.amount_paid, 0)::numeric > 0 THEN 'partially_paid'
    WHEN i.due_date IS NOT NULL AND i.due_date < NOW() AND COALESCE(i.amount_due, 0)::numeric > 0 THEN 'overdue'
    ELSE 'open'
  END,
  NOW(),
  NOW()
FROM invoices i
WHERE i.type = 'purchase_invoice'
  AND i.status IN ('sent', 'partially_paid', 'overdue', 'paid')
  AND NOT EXISTS (
    SELECT 1
    FROM accounts_payable ap
    WHERE ap.company_id = i.company_id
      AND ap.invoice_id = i.id
  );

COMMIT;
