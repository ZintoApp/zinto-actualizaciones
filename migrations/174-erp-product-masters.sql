ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand_id INTEGER;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_id INTEGER;

CREATE TABLE IF NOT EXISTS product_brands (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_company_product_brand_name UNIQUE (company_id, name),
  CONSTRAINT unique_company_product_brand_slug UNIQUE (company_id, slug),
  CONSTRAINT idx_product_brands_id_company UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS product_tags_master (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_company_product_tag_name UNIQUE (company_id, name),
  CONSTRAINT idx_product_tags_master_id_company UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS product_units (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  symbol TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_company_product_unit_name UNIQUE (company_id, name),
  CONSTRAINT unique_company_product_unit_code UNIQUE (company_id, code),
  CONSTRAINT idx_product_units_id_company UNIQUE (id, company_id)
);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_brand_company_fk;
ALTER TABLE products
  ADD CONSTRAINT products_brand_company_fk
  FOREIGN KEY (brand_id, company_id)
  REFERENCES product_brands(id, company_id)
  ON DELETE RESTRICT;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_company_fk;
ALTER TABLE products
  ADD CONSTRAINT products_unit_company_fk
  FOREIGN KEY (unit_id, company_id)
  REFERENCES product_units(id, company_id)
  ON DELETE RESTRICT;

INSERT INTO product_units (company_id, code, name, symbol, is_active, sort_order)
SELECT DISTINCT p.company_id, NULL, p.unit_of_measure, p.unit_of_measure, TRUE, 0
FROM products p
WHERE COALESCE(TRIM(p.unit_of_measure), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM product_units u
    WHERE u.company_id = p.company_id
      AND lower(u.name) = lower(p.unit_of_measure)
  );

INSERT INTO product_tags_master (company_id, name, color, is_active, sort_order)
SELECT DISTINCT p.company_id, tag.value, NULL, TRUE, 0
FROM products p,
LATERAL unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag(value)
WHERE COALESCE(TRIM(tag.value), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM product_tags_master t
    WHERE t.company_id = p.company_id
      AND lower(t.name) = lower(tag.value)
  );
