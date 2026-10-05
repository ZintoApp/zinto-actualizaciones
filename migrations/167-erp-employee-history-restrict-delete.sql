-- Migration: Preserve employee HR/payroll history on true deletes
-- Description: Replace employee history cascades with restrictive foreign keys.

BEGIN;

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey,
  ADD CONSTRAINT leave_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_employee_id_fkey,
  ADD CONSTRAINT attendance_records_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE payroll_items
  DROP CONSTRAINT IF EXISTS payroll_items_employee_id_fkey,
  ADD CONSTRAINT payroll_items_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

COMMIT;
