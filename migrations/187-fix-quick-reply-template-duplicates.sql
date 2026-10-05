-- Migration: Fix duplicate quick reply templates
-- Description: Remove seeded template duplicates and enforce one template name per company
-- Date: 2026-05-14

-- Keep the oldest row for each (company_id, name) pair
DELETE FROM "quick_reply_templates" q
USING "quick_reply_templates" q2
WHERE q.company_id = q2.company_id
  AND q.name = q2.name
  AND q.id > q2.id;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_quick_reply_templates_company_name"
ON "quick_reply_templates" ("company_id", "name");
