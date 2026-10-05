-- Tenant-safe composite FKs for key ERP relations, ERP flow dispatch ledger, and COGS cleanup for invoice-posted inventory relief.

BEGIN;

-- Ensure parent uniqueness targets exist for composite FKs (id, company_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_id_company ON purchase_orders(id, company_id);

-- Null out any cross-company pairings (should be none if app-layer checks held).
UPDATE sales_orders so
SET contact_id = NULL
FROM contacts c
WHERE so.contact_id = c.id AND so.company_id IS DISTINCT FROM c.company_id;

UPDATE sales_orders so
SET deal_id = NULL
FROM deals d
WHERE so.deal_id = d.id AND so.company_id IS DISTINCT FROM d.company_id;

UPDATE purchase_orders po
SET supplier_id = NULL
FROM suppliers s
WHERE po.supplier_id = s.id AND po.company_id IS DISTINCT FROM s.company_id;

UPDATE invoices i
SET contact_id = NULL
FROM contacts c
WHERE i.contact_id = c.id AND i.company_id IS DISTINCT FROM c.company_id;

UPDATE invoices i
SET supplier_id = NULL
FROM suppliers s
WHERE i.supplier_id = s.id AND i.company_id IS DISTINCT FROM s.company_id;

UPDATE invoices i
SET sales_order_id = NULL
FROM sales_orders so
WHERE i.sales_order_id = so.id AND i.company_id IS DISTINCT FROM so.company_id;

UPDATE invoices i
SET purchase_order_id = NULL
FROM purchase_orders po
WHERE i.purchase_order_id = po.id AND i.company_id IS DISTINCT FROM po.company_id;

UPDATE accounts_receivable ar
SET contact_id = NULL
FROM contacts c
WHERE ar.contact_id = c.id AND ar.company_id IS DISTINCT FROM c.company_id;

UPDATE accounts_payable ap
SET supplier_id = NULL
FROM suppliers s
WHERE ap.supplier_id = s.id AND ap.company_id IS DISTINCT FROM s.company_id;

-- Hard fail if any cross-company pairings remain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales_orders so JOIN contacts c ON so.contact_id = c.id
    WHERE so.company_id IS DISTINCT FROM c.company_id
  ) THEN RAISE EXCEPTION 'Cross-company sales_orders.contact_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM sales_orders so JOIN deals d ON so.deal_id = d.id
    WHERE so.company_id IS DISTINCT FROM d.company_id
  ) THEN RAISE EXCEPTION 'Cross-company sales_orders.deal_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.company_id IS DISTINCT FROM s.company_id
  ) THEN RAISE EXCEPTION 'Cross-company purchase_orders.supplier_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i JOIN contacts c ON i.contact_id = c.id
    WHERE i.company_id IS DISTINCT FROM c.company_id
  ) THEN RAISE EXCEPTION 'Cross-company invoices.contact_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.company_id IS DISTINCT FROM s.company_id
  ) THEN RAISE EXCEPTION 'Cross-company invoices.supplier_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i JOIN sales_orders so ON i.sales_order_id = so.id
    WHERE i.company_id IS DISTINCT FROM so.company_id
  ) THEN RAISE EXCEPTION 'Cross-company invoices.sales_order_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i JOIN purchase_orders po ON i.purchase_order_id = po.id
    WHERE i.company_id IS DISTINCT FROM po.company_id
  ) THEN RAISE EXCEPTION 'Cross-company invoices.purchase_order_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounts_receivable ar JOIN contacts c ON ar.contact_id = c.id
    WHERE ar.contact_id IS NOT NULL AND ar.company_id IS DISTINCT FROM c.company_id
  ) THEN RAISE EXCEPTION 'Cross-company accounts_receivable.contact_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounts_receivable ar JOIN invoices i ON ar.invoice_id = i.id
    WHERE ar.company_id IS DISTINCT FROM i.company_id
  ) THEN RAISE EXCEPTION 'Cross-company accounts_receivable.invoice_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounts_payable ap JOIN suppliers s ON ap.supplier_id = s.id
    WHERE ap.supplier_id IS NOT NULL AND ap.company_id IS DISTINCT FROM s.company_id
  ) THEN RAISE EXCEPTION 'Cross-company accounts_payable.supplier_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounts_payable ap JOIN invoices i ON ap.invoice_id = i.id
    WHERE ap.company_id IS DISTINCT FROM i.company_id
  ) THEN RAISE EXCEPTION 'Cross-company accounts_payable.invoice_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM stock_transfers st JOIN warehouses w ON st.from_warehouse_id = w.id
    WHERE st.company_id IS DISTINCT FROM w.company_id
  ) THEN RAISE EXCEPTION 'Cross-company stock_transfers.from_warehouse_id rows remain'; END IF;

  IF EXISTS (
    SELECT 1 FROM stock_transfers st JOIN warehouses w ON st.to_warehouse_id = w.id
    WHERE st.company_id IS DISTINCT FROM w.company_id
  ) THEN RAISE EXCEPTION 'Cross-company stock_transfers.to_warehouse_id rows remain'; END IF;
END $$;

-- Drop legacy single-column FKs (PostgreSQL default naming from Drizzle-style FKs).
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_contact_id_contacts_id_fk;
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_deal_id_deals_id_fk;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_suppliers_id_fk;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_contact_id_contacts_id_fk;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_supplier_id_suppliers_id_fk;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_sales_order_id_sales_orders_id_fk;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_purchase_order_id_purchase_orders_id_fk;

ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_contact_id_contacts_id_fk;
ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_invoice_id_invoices_id_fk;

ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_supplier_id_suppliers_id_fk;
ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_invoice_id_invoices_id_fk;

ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_from_warehouse_id_warehouses_id_fk;
ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_to_warehouse_id_warehouses_id_fk;

-- Add composite FKs enforcing tenant alignment.
ALTER TABLE sales_orders
  ADD CONSTRAINT sales_orders_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE SET NULL;
ALTER TABLE sales_orders
  ADD CONSTRAINT sales_orders_deal_company_fk
    FOREIGN KEY (deal_id, company_id) REFERENCES deals(id, company_id) ON DELETE SET NULL;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_company_fk
    FOREIGN KEY (supplier_id, company_id) REFERENCES suppliers(id, company_id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE SET NULL;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_supplier_company_fk
    FOREIGN KEY (supplier_id, company_id) REFERENCES suppliers(id, company_id) ON DELETE SET NULL;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_sales_order_company_fk
    FOREIGN KEY (sales_order_id, company_id) REFERENCES sales_orders(id, company_id) ON DELETE SET NULL;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_purchase_order_company_fk
    FOREIGN KEY (purchase_order_id, company_id) REFERENCES purchase_orders(id, company_id) ON DELETE SET NULL;

ALTER TABLE accounts_receivable
  ADD CONSTRAINT accounts_receivable_contact_company_fk
    FOREIGN KEY (contact_id, company_id) REFERENCES contacts(id, company_id) ON DELETE SET NULL;
ALTER TABLE accounts_receivable
  ADD CONSTRAINT accounts_receivable_invoice_company_fk
    FOREIGN KEY (invoice_id, company_id) REFERENCES invoices(id, company_id) ON DELETE CASCADE;

ALTER TABLE accounts_payable
  ADD CONSTRAINT accounts_payable_supplier_company_fk
    FOREIGN KEY (supplier_id, company_id) REFERENCES suppliers(id, company_id) ON DELETE SET NULL;
ALTER TABLE accounts_payable
  ADD CONSTRAINT accounts_payable_invoice_company_fk
    FOREIGN KEY (invoice_id, company_id) REFERENCES invoices(id, company_id) ON DELETE CASCADE;

ALTER TABLE stock_transfers
  ADD CONSTRAINT stock_transfers_from_warehouse_company_fk
    FOREIGN KEY (from_warehouse_id, company_id) REFERENCES warehouses(id, company_id) ON DELETE CASCADE;
ALTER TABLE stock_transfers
  ADD CONSTRAINT stock_transfers_to_warehouse_company_fk
    FOREIGN KEY (to_warehouse_id, company_id) REFERENCES warehouses(id, company_id) ON DELETE CASCADE;

-- Idempotent ERP automation dispatch ledger for flow triggers.
CREATE TABLE IF NOT EXISTS erp_flow_event_dispatches (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_erp_flow_event_dispatch_company UNIQUE (company_id, event_key, flow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_flow_event_dispatches_company_created ON erp_flow_event_dispatches(company_id, created_at DESC);

-- Reverse invoice-posted COGS/inventory relief when stock was not actually relieved for the linked sales order.
WITH base AS (
  SELECT
    je.id AS orig_journal_id,
    je.company_id,
    je.reference_id AS invoice_id,
    je.transaction_currency,
    je.base_currency,
    je.exchange_rate,
    MAX(CASE WHEN coa.account_code = '5000' THEN jel.debit::numeric ELSE 0 END) AS cogs_debit,
    MAX(CASE WHEN coa.account_code = '1200' THEN jel.credit::numeric ELSE 0 END) AS inv_credit,
    MAX(CASE WHEN coa.account_code = '5000' THEN jel.debit_base::numeric ELSE NULL END) AS cogs_debit_base,
    MAX(CASE WHEN coa.account_code = '1200' THEN jel.credit_base::numeric ELSE NULL END) AS inv_credit_base
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id AND coa.company_id = je.company_id
  WHERE je.reference_type = 'invoice'
    AND je.status = 'posted'
    AND coa.account_code IN ('5000', '1200')
  GROUP BY je.id, je.company_id, je.reference_id, je.transaction_currency, je.base_currency, je.exchange_rate
),
targets AS (
  SELECT b.*
  FROM base b
  JOIN invoices i ON i.id = b.invoice_id AND i.company_id = b.company_id
  WHERE i.type = 'sales_invoice'
    AND i.sales_order_id IS NOT NULL
    AND b.cogs_debit > 0
    AND b.inv_credit > 0
    AND NOT EXISTS (
      SELECT 1
      FROM stock_movements sm
      WHERE sm.company_id = b.company_id
        AND sm.reference_type = 'sales_order'
        AND sm.reference_id = i.sales_order_id
        AND sm.movement_type = 'out'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM journal_entries je2
      WHERE je2.company_id = b.company_id
        AND je2.reference_type = 'adjustment'
        AND je2.reference_id = b.orig_journal_id
        AND je2.description ILIKE 'Migration: reverse premature COGS/inventory relief%'
    )
),
ins AS (
  INSERT INTO journal_entries (
    company_id, entry_number, date, description, reference_type, reference_id,
    transaction_currency, base_currency, exchange_rate,
    fiscal_year_id, status, posted_by, posted_at, created_by, created_at, updated_at )
  SELECT
    t.company_id,
    'MIG-161-COGS-' || t.orig_journal_id::text,
    NOW(),
    'Migration: reverse premature COGS/inventory relief for invoice ' || t.invoice_id::text,
    'adjustment',
    t.orig_journal_id,
    t.transaction_currency,
    t.base_currency,
    t.exchange_rate,
    NULL,
    'posted',
    NULL,
    NOW(),
    NULL,
    NOW(),
    NOW()
  FROM targets t
  RETURNING id AS new_journal_id, company_id, reference_id AS orig_journal_id
)
INSERT INTO journal_entry_lines (
  journal_entry_id, account_id, debit, credit, debit_base, credit_base, description, created_at
)
SELECT
  ins.new_journal_id,
  cogs.id,
  0::numeric,
  t.cogs_debit,
  CASE WHEN t.cogs_debit_base IS NULL THEN NULL ELSE 0::numeric END,
  t.cogs_debit_base,
  'Reversal: COGS (invoice posted before fulfillment)',
  NOW()
FROM ins
JOIN targets t ON t.orig_journal_id = ins.orig_journal_id AND t.company_id = ins.company_id
JOIN chart_of_accounts cogs ON cogs.company_id = ins.company_id AND cogs.account_code = '5000'
UNION ALL
SELECT
  ins.new_journal_id,
  inv.id,
  t.inv_credit,
  0::numeric,
  t.inv_credit_base,
  CASE WHEN t.inv_credit_base IS NULL THEN NULL ELSE 0::numeric END,
  'Reversal: Inventory relief (invoice posted before fulfillment)',
  NOW()
FROM ins
JOIN targets t ON t.orig_journal_id = ins.orig_journal_id AND t.company_id = ins.company_id
JOIN chart_of_accounts inv ON inv.company_id = ins.company_id AND inv.account_code = '1200';

-- Update chart_of_accounts balances for posted reversal lines (matches server posting rules).
WITH rev AS (
  SELECT je.id AS journal_id, je.company_id
  FROM journal_entries je
  WHERE je.reference_type = 'adjustment'
    AND je.entry_number LIKE 'MIG-161-COGS-%'
    AND je.status = 'posted'
),
lines AS (
  SELECT jel.account_id, jel.debit::numeric AS debit, jel.credit::numeric AS credit, r.company_id
  FROM journal_entry_lines jel
  JOIN rev r ON r.journal_id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
),
deltas AS (
  SELECT
    lines.account_id,
    SUM(
      CASE
        WHEN coa.type IN ('asset', 'expense') THEN debit - credit
        ELSE credit - debit
      END
    ) AS delta,
    lines.company_id
  FROM lines
  JOIN chart_of_accounts coa ON coa.id = lines.account_id AND coa.company_id = lines.company_id
  GROUP BY lines.account_id, lines.company_id
)
UPDATE chart_of_accounts coa
SET balance = coa.balance::numeric + d.delta,
    updated_at = NOW()
FROM deltas d
WHERE coa.id = d.account_id AND coa.company_id = d.company_id;

COMMIT;
