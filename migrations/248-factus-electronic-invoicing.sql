ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS colombia_fiscal_profile jsonb;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS colombia_fiscal_profile jsonb;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS colombia_fiscal_profile jsonb;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS electronic_payment_form text,
  ADD COLUMN IF NOT EXISTS electronic_payment_method_code text;

ALTER TABLE electronic_invoices
  ADD COLUMN IF NOT EXISTS provider_reference_code text,
  ADD COLUMN IF NOT EXISTS provider_document_number text,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS validated_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS electronic_invoices_provider_reference_unique
  ON electronic_invoices (company_id, provider, provider_reference_code)
  WHERE provider_reference_code IS NOT NULL;
