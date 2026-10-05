BEGIN;

-- Create deal_automation_rules table
CREATE TABLE IF NOT EXISTS "deal_automation_rules" (
  "id" SERIAL PRIMARY KEY,
  "company_id" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "trigger_type" TEXT NOT NULL,
  "conditions" JSONB,
  "action" JSONB NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS "idx_deal_automation_rules_company_enabled_priority" 
ON "deal_automation_rules" ("company_id", "enabled", "priority");

COMMIT;
