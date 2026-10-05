-- Migration: ERP double-entry accounting system
-- Description: Chart of accounts, fiscal years, journal entries, AR/AP

BEGIN;

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code    TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  sub_type        TEXT,
  parent_account_id INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  balance         NUMERIC(14, 2) DEFAULT 0,
  description     TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chart_of_accounts_type_check CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense'))
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_id ON chart_of_accounts(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_company_account_code ON chart_of_accounts(company_id, account_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_of_accounts_id_company ON chart_of_accounts(id, company_id);

-- Fiscal Years
CREATE TABLE IF NOT EXISTS fiscal_years (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  start_date      TIMESTAMP NOT NULL,
  end_date        TIMESTAMP NOT NULL,
  is_closed       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_years_company_id ON fiscal_years(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_years_id_company ON fiscal_years(id, company_id);

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_number    TEXT NOT NULL,
  date            TIMESTAMP NOT NULL,
  description     TEXT,
  reference_type  TEXT NOT NULL,
  reference_id    INTEGER,
  fiscal_year_id  INTEGER REFERENCES fiscal_years(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  posted_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  posted_at       TIMESTAMP,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT journal_entries_reference_type_check CHECK (reference_type IN ('invoice', 'payment', 'adjustment', 'opening', 'manual')),
  CONSTRAINT journal_entries_status_check CHECK (status IN ('draft', 'posted', 'reversed'))
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_company_id ON journal_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(company_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(company_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference_type ON journal_entries(reference_type, reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_company_entry_number ON journal_entries(company_id, entry_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_id_company ON journal_entries(id, company_id);

-- Journal Entry Lines
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                SERIAL PRIMARY KEY,
  journal_entry_id  INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        INTEGER NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description       TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON journal_entry_lines(account_id);

-- Accounts Receivable
CREATE TABLE IF NOT EXISTS accounts_receivable (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id        INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  invoice_id        INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  journal_entry_id  INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  amount            NUMERIC(14, 2) NOT NULL,
  paid_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_date          TIMESTAMP,
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  CONSTRAINT accounts_receivable_status_check CHECK (status IN ('open', 'partially_paid', 'paid', 'overdue', 'written_off'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_company_id ON accounts_receivable(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_contact_id ON accounts_receivable(contact_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_invoice_id ON accounts_receivable(invoice_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status ON accounts_receivable(company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS unique_ar_company_invoice ON accounts_receivable(company_id, invoice_id);

-- Accounts Payable
CREATE TABLE IF NOT EXISTS accounts_payable (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_id        INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  journal_entry_id  INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  amount            NUMERIC(14, 2) NOT NULL,
  paid_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_date          TIMESTAMP,
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  CONSTRAINT accounts_payable_status_check CHECK (status IN ('open', 'partially_paid', 'paid', 'overdue', 'written_off'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_company_id ON accounts_payable(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_supplier_id ON accounts_payable(supplier_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_invoice_id ON accounts_payable(invoice_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS unique_ap_company_invoice ON accounts_payable(company_id, invoice_id);

-- Update role_permissions with new accounting permissions
UPDATE role_permissions
SET permissions = permissions || '{"view_accounting": true, "manage_accounting": true, "post_journal_entries": true, "close_fiscal_year": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_accounting": false, "manage_accounting": false, "post_journal_entries": false, "close_fiscal_year": false}'::jsonb
WHERE role = 'agent';

COMMIT;
