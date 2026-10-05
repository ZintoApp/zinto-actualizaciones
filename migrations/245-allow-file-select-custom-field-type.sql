BEGIN;

ALTER TABLE company_custom_fields
  DROP CONSTRAINT IF EXISTS company_custom_fields_field_type_check;

ALTER TABLE company_custom_fields
  ADD CONSTRAINT company_custom_fields_field_type_check
  CHECK (field_type IN ('text', 'number', 'select', 'multi_select', 'date', 'boolean', 'file_select'));

COMMIT;
