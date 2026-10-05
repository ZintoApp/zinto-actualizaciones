BEGIN;
-- Old invoices retain the two-place monetary basis used by their history.
-- New invoice writers capture the existing company's configured ERP currency.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency_decimal_places integer NOT NULL DEFAULT 2 CHECK(currency_decimal_places BETWEEN 0 AND 6);
ALTER TABLE invoices
 ALTER COLUMN subtotal TYPE numeric(16,6),
 ALTER COLUMN tax_amount TYPE numeric(16,6),
 ALTER COLUMN discount_value TYPE numeric(16,6),
 ALTER COLUMN discount_amount TYPE numeric(16,6),
 ALTER COLUMN tip_amount TYPE numeric(16,6),
 ALTER COLUMN service_charge_amount TYPE numeric(16,6),
 ALTER COLUMN total_amount TYPE numeric(16,6),
 ALTER COLUMN amount_paid TYPE numeric(16,6),
 ALTER COLUMN amount_due TYPE numeric(16,6);
ALTER TABLE invoice_items
 ALTER COLUMN unit_price TYPE numeric(16,6),
 ALTER COLUMN discount_value TYPE numeric(16,6),
 ALTER COLUMN line_total TYPE numeric(16,6);
COMMIT;
