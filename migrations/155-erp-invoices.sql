-- Migration: ERP invoices, invoice line items, invoice payments
-- Description: Invoicing tables and permission keys

BEGIN;

CREATE TABLE IF NOT EXISTS invoices (
  id                    SERIAL PRIMARY KEY,
  invoice_number        TEXT NOT NULL,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id            INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  supplier_id           INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  sales_order_id        INTEGER REFERENCES sales_orders(id) ON DELETE SET NULL,
  purchase_order_id     INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL DEFAULT 'sales_invoice',
  status                TEXT NOT NULL DEFAULT 'draft',
  issue_date            TIMESTAMP DEFAULT NOW(),
  due_date              TIMESTAMP,
  subtotal              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_due            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency              TEXT DEFAULT 'USD',
  notes                 TEXT,
  terms_and_conditions  TEXT,
  pdf_url               TEXT,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  CONSTRAINT invoices_type_check CHECK (type IN (
    'sales_invoice', 'purchase_invoice', 'credit_note', 'debit_note'
  )),
  CONSTRAINT invoices_status_check CHECK (status IN (
    'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void'
  ))
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(company_id, type);
CREATE INDEX IF NOT EXISTS idx_invoices_contact_id ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order_id ON invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order_id ON invoices(purchase_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_company_invoice_number ON invoices(company_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_id_company ON invoices(id, company_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id       INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  description      TEXT,
  quantity         NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price       NUMERIC(12, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  tax_rate         NUMERIC(5, 2) DEFAULT 0,
  line_total       NUMERIC(12, 2) NOT NULL,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id               SERIAL PRIMARY KEY,
  invoice_id       INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount           NUMERIC(12, 2) NOT NULL,
  payment_date     TIMESTAMP DEFAULT NOW(),
  payment_method   TEXT,
  reference_number TEXT,
  notes            TEXT,
  recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT invoice_payments_payment_method_check CHECK (
    payment_method IS NULL OR payment_method IN (
      'cash', 'check', 'credit_card', 'debit_card', 'bank_transfer',
      'stripe', 'paypal', 'mercadopago', 'moyasar', 'mpesa', 'paystack', 'other'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);

UPDATE role_permissions
SET permissions = permissions || '{"view_invoices": true, "manage_invoices": true, "record_payments": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_invoices": false, "manage_invoices": false, "record_payments": false}'::jsonb
WHERE role = 'agent';

COMMIT;
