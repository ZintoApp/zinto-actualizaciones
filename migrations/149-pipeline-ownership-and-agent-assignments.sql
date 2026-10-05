-- Migration: Pipeline ownership and agent assignments
-- Description: Add created_by to pipelines; create pipeline_agent_assignments join table

BEGIN;

-- ============================================================================
-- Section A: Add created_by to pipelines
-- ============================================================================
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipelines_created_by ON pipelines(created_by);

-- Existing rows remain NULL; new inserts will stamp created_by in application code.

-- ============================================================================
-- Section B: pipeline_agent_assignments join table
-- ============================================================================
-- Composite FK targets: (id, company_id) must be unique on pipelines and users
-- so assignment rows cannot pair a pipeline or user with a mismatched tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipelines_id_company
  ON pipelines(id, company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_company
  ON users(id, company_id);

CREATE TABLE IF NOT EXISTS pipeline_agent_assignments (
  id          SERIAL PRIMARY KEY,
  pipeline_id INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT paa_pipeline_company_fk
    FOREIGN KEY (pipeline_id, company_id) REFERENCES pipelines(id, company_id) ON DELETE CASCADE,
  CONSTRAINT paa_user_company_fk
    FOREIGN KEY (user_id, company_id) REFERENCES users(id, company_id) ON DELETE CASCADE,
  CONSTRAINT paa_assigned_by_company_fk
    FOREIGN KEY (assigned_by, company_id) REFERENCES users(id, company_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paa_pipeline_user
  ON pipeline_agent_assignments(pipeline_id, user_id);

CREATE INDEX IF NOT EXISTS idx_paa_pipeline_id  ON pipeline_agent_assignments(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_paa_user_id      ON pipeline_agent_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_paa_company_id   ON pipeline_agent_assignments(company_id);

COMMIT;
