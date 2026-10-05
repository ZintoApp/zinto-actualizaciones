-- Remove duplicate task categories created by re-running migration 090
-- (ON CONFLICT DO NOTHING was ineffective without a unique constraint).
DELETE FROM task_categories tc
USING task_categories newer
WHERE tc.company_id = newer.company_id
  AND tc.name = newer.name
  AND tc.id > newer.id;

-- Prevent future duplicates per company
CREATE UNIQUE INDEX IF NOT EXISTS task_categories_company_id_name_unique
  ON task_categories(company_id, name);
