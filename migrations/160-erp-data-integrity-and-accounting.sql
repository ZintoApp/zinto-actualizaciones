-- Backfill tenant scope, normalize line totals, and add base-currency accounting columns.

BEGIN;

UPDATE sales_order_items
SET line_total = ROUND((COALESCE(quantity, 0)::numeric * COALESCE(unit_price, 0)::numeric) * (1 - COALESCE(discount_percent, 0)::numeric / 100), 2);

UPDATE invoice_items
SET line_total = ROUND((COALESCE(quantity, 0)::numeric * COALESCE(unit_price, 0)::numeric) * (1 - COALESCE(discount_percent, 0)::numeric / 100), 2);

UPDATE product_variants pv
SET company_id = p.company_id
FROM products p
WHERE pv.product_id = p.id AND pv.company_id IS DISTINCT FROM p.company_id;

UPDATE product_price_tiers pt
SET company_id = p.company_id
FROM products p
WHERE pt.product_id = p.id AND pt.company_id IS DISTINCT FROM p.company_id;

UPDATE stock_levels sl
SET company_id = w.company_id
FROM warehouses w
WHERE sl.warehouse_id = w.id AND sl.company_id IS DISTINCT FROM w.company_id;

UPDATE stock_movements sm
SET company_id = w.company_id
FROM warehouses w
WHERE sm.warehouse_id = w.id AND sm.company_id IS DISTINCT FROM w.company_id;

UPDATE delivery_notes dn
SET company_id = so.company_id
FROM sales_orders so
WHERE dn.sales_order_id = so.id AND dn.company_id IS DISTINCT FROM so.company_id;

UPDATE goods_receipts gr
SET company_id = po.company_id
FROM purchase_orders po
WHERE gr.purchase_order_id = po.id AND gr.company_id IS DISTINCT FROM po.company_id;

UPDATE supplier_products sp
SET company_id = s.company_id
FROM suppliers s
WHERE sp.supplier_id = s.id AND sp.company_id IS DISTINCT FROM s.company_id;

UPDATE invoice_payments ip
SET company_id = i.company_id
FROM invoices i
WHERE ip.invoice_id = i.id AND ip.company_id IS DISTINCT FROM i.company_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_id_company ON contacts(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_id_company ON deals(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_id_company ON suppliers(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_groups_id_company ON tax_groups(id, company_id);

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS transaction_currency TEXT,
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14, 6);

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS debit_base NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS credit_base NUMERIC(14, 2);

UPDATE journal_entries
SET transaction_currency = COALESCE(transaction_currency, 'USD'),
    base_currency = COALESCE(base_currency, 'USD'),
    exchange_rate = COALESCE(exchange_rate, 1)
WHERE transaction_currency IS NULL OR base_currency IS NULL OR exchange_rate IS NULL;

UPDATE journal_entry_lines
SET debit_base = COALESCE(debit_base, debit),
    credit_base = COALESCE(credit_base, credit)
WHERE debit_base IS NULL OR credit_base IS NULL;

COMMIT;
