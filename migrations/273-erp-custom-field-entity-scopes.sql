-- Extend ERP definitions in place, retaining existing definition IDs and JSON values.
BEGIN;
ALTER TABLE product_custom_field_definitions
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'product';
ALTER TABLE product_custom_field_definitions DROP CONSTRAINT IF EXISTS unique_company_custom_field_key;
-- Older ERP installs created this as a standalone index rather than a constraint.
DROP INDEX IF EXISTS unique_company_custom_field_key;
ALTER TABLE product_custom_field_definitions
  ADD CONSTRAINT unique_company_custom_field_key UNIQUE (company_id, entity_type, field_key);
ALTER TABLE product_custom_field_definitions DROP CONSTRAINT IF EXISTS erp_custom_field_entity_type_check;
ALTER TABLE product_custom_field_definitions
  ADD CONSTRAINT erp_custom_field_entity_type_check CHECK (entity_type IN (
    'product', 'real_estate_property', 'real_estate_project', 'real_estate_unit',
    'real_estate_lease', 'real_estate_reservation', 'real_estate_maintenance',
    'real_estate_inspection', 'real_estate_sale_agreement', 'real_estate_payment_plan', 'real_estate_expense'
  ));
CREATE INDEX IF NOT EXISTS erp_custom_fields_company_entity_order_idx
  ON product_custom_field_definitions (company_id, entity_type, sort_order);
COMMIT;
