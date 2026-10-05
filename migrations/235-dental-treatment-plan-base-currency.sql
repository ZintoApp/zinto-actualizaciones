BEGIN;

-- Treatment plans were created with a hard-coded USD default even when the
-- company ERP base currency was something else (e.g. COP). Align existing
-- plans (and their linked quotations/invoices) with the company base currency.
UPDATE dental_treatment_plans AS p
SET
  currency = upper(c.code),
  updated_at = NOW()
FROM currencies AS c
WHERE c.company_id = p.company_id
  AND c.is_base_currency IS TRUE
  AND upper(trim(c.code)) <> 'USD'
  AND upper(trim(p.currency)) = 'USD';

UPDATE sales_orders AS so
SET currency = upper(c.code)
FROM dental_treatment_plans AS p
INNER JOIN currencies AS c
  ON c.company_id = p.company_id
 AND c.is_base_currency IS TRUE
WHERE so.id = p.sales_order_id
  AND so.company_id = p.company_id
  AND so.source = 'dental_treatment_plan'
  AND upper(trim(c.code)) <> 'USD'
  AND upper(trim(so.currency)) = 'USD';

UPDATE invoices AS inv
SET
  currency = upper(c.code),
  updated_at = NOW()
FROM dental_treatment_plans AS p
INNER JOIN currencies AS c
  ON c.company_id = p.company_id
 AND c.is_base_currency IS TRUE
WHERE inv.sales_order_id = p.sales_order_id
  AND inv.company_id = p.company_id
  AND p.sales_order_id IS NOT NULL
  AND upper(trim(c.code)) <> 'USD'
  AND upper(trim(inv.currency)) = 'USD';

COMMIT;
