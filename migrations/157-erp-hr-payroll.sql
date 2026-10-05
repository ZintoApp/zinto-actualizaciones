-- Migration: HR & payroll (departments, employees, leave, attendance, payroll runs)
-- Description: Human resources tables and permission keys

BEGIN;

CREATE TABLE IF NOT EXISTS departments (
  id                     SERIAL PRIMARY KEY,
  company_id             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  manager_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parent_department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  description            TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW(),
  CONSTRAINT idx_departments_id_company UNIQUE (id, company_id),
  CONSTRAINT unique_company_department_name UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments(company_id);

CREATE TABLE IF NOT EXISTS employees (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id        TEXT NOT NULL,
  department_id      INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  position           TEXT,
  hire_date          TIMESTAMP,
  termination_date   TIMESTAMP,
  employment_type    TEXT NOT NULL DEFAULT 'full_time',
  salary             NUMERIC(12, 2),
  salary_frequency   TEXT NOT NULL DEFAULT 'monthly',
  currency           TEXT DEFAULT 'USD',
  manager_id         INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  emergency_contact  JSONB DEFAULT '{}'::jsonb,
  bank_details       JSONB DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'active',
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_company_user_employee UNIQUE (company_id, user_id),
  CONSTRAINT idx_employees_id_company UNIQUE (id, company_id),
  CONSTRAINT unique_company_employee_id UNIQUE (company_id, employee_id),
  CONSTRAINT employees_employment_type_check CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'intern')),
  CONSTRAINT employees_salary_frequency_check CHECK (salary_frequency IN ('hourly', 'weekly', 'biweekly', 'monthly', 'annual')),
  CONSTRAINT employees_status_check CHECK (status IN ('active', 'on_leave', 'terminated'))
);

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(company_id, status);

CREATE TABLE IF NOT EXISTS leave_requests (
  id           SERIAL PRIMARY KEY,
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_type   TEXT NOT NULL,
  start_date   TIMESTAMP NOT NULL,
  end_date     TIMESTAMP NOT NULL,
  days         NUMERIC(5, 1) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason       TEXT,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT leave_requests_leave_type_check CHECK (leave_type IN ('annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid')),
  CONSTRAINT leave_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_id ON leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(company_id, status);

CREATE TABLE IF NOT EXISTS attendance_records (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date          TIMESTAMP NOT NULL,
  check_in      TIMESTAMP,
  check_out     TIMESTAMP,
  hours_worked  NUMERIC(5, 2),
  status        TEXT NOT NULL DEFAULT 'present',
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_employee_attendance_date UNIQUE (employee_id, date),
  CONSTRAINT attendance_records_status_check CHECK (status IN ('present', 'absent', 'late', 'half_day', 'remote'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_company_id ON attendance_records(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_id ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON attendance_records(company_id, status);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start     TIMESTAMP NOT NULL,
  period_end       TIMESTAMP NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  total_gross      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_net        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency         TEXT DEFAULT 'USD',
  notes            TEXT,
  processed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT payroll_runs_status_check CHECK (status IN ('draft', 'processing', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_id ON payroll_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(company_id, status);

CREATE TABLE IF NOT EXISTS payroll_items (
  id              SERIAL PRIMARY KEY,
  payroll_run_id  INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary     NUMERIC(12, 2) NOT NULL,
  bonuses         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_pay         NUMERIC(12, 2) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_payroll_employee UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run_id ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id ON payroll_items(employee_id);

UPDATE role_permissions
SET permissions = permissions || '{"view_hr": true, "manage_hr": true, "view_payroll": true, "manage_payroll": true, "approve_leave": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_hr": false, "manage_hr": false, "view_payroll": false, "manage_payroll": false, "approve_leave": false}'::jsonb
WHERE role = 'agent';

COMMIT;
