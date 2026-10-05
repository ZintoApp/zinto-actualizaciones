BEGIN;
ALTER TABLE real_estate_assets ADD COLUMN IF NOT EXISTS seller_contact_id integer;
ALTER TABLE real_estate_assets ADD CONSTRAINT real_estate_asset_seller_company_fk
  FOREIGN KEY(seller_contact_id,company_id) REFERENCES contacts(id,company_id);
COMMIT;
