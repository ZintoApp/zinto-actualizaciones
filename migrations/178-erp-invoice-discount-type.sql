-- Migration: invoice header and line discount type + value
-- Description: discount_type / discount_value on invoices and invoice_items (legacy discount columns retained)

BEGIN;

ALTER TABLE invoices
  ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'fixed_amount',
  ADD COLUMN discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_discount_type_check CHECK (discount_type IN ('none', 'percentage', 'fixed_amount'));

UPDATE invoices SET discount_value = discount_amount WHERE discount_amount > 0;

ALTER TABLE invoice_items
  ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'percentage',
  ADD COLUMN discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_discount_type_check CHECK (discount_type IN ('percentage', 'fixed_amount'));

UPDATE invoice_items SET discount_value = discount_percent WHERE discount_percent > 0;

COMMIT;
