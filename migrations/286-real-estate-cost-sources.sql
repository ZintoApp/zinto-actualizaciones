CREATE TABLE IF NOT EXISTS real_estate_asset_cost_sources (
 id serial PRIMARY KEY,
 company_id integer NOT NULL REFERENCES companies(id),
 asset_id integer NOT NULL,
 journal_entry_id integer NOT NULL,
 journal_line_id integer NOT NULL REFERENCES journal_entry_lines(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
 created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 removed_by integer REFERENCES users(id),
 removed_at timestamptz,
 removal_reason text,
 FOREIGN KEY(asset_id,company_id) REFERENCES real_estate_assets(id,company_id),
 FOREIGN KEY(journal_entry_id,company_id) REFERENCES journal_entries(id,company_id),
 CHECK((removed_at IS NULL AND removed_by IS NULL AND removal_reason IS NULL) OR
       (removed_at IS NOT NULL AND removed_by IS NOT NULL AND length(trim(removal_reason)) BETWEEN 3 AND 1000))
);
CREATE UNIQUE INDEX IF NOT EXISTS real_estate_cost_source_active_line ON real_estate_asset_cost_sources(journal_line_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS real_estate_cost_source_asset ON real_estate_asset_cost_sources(company_id,asset_id);
