ALTER TABLE flow_executions
  ADD COLUMN IF NOT EXISTS run_id TEXT;

UPDATE flow_executions
SET run_id = execution_id
WHERE run_id IS NULL;

ALTER TABLE flow_executions
  ALTER COLUMN run_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'flow_executions_run_id_unique'
  ) THEN
    ALTER TABLE flow_executions
      ADD CONSTRAINT flow_executions_run_id_unique UNIQUE (run_id);
  END IF;
END $$;

ALTER TABLE flow_executions
  ADD COLUMN IF NOT EXISTS runtime_type TEXT NOT NULL DEFAULT 'legacy';

UPDATE flow_executions
SET runtime_type = 'legacy'
WHERE runtime_type IS NULL;

ALTER TABLE flow_executions
  DROP CONSTRAINT IF EXISTS flow_executions_runtime_type_check;

ALTER TABLE flow_executions
  ADD CONSTRAINT flow_executions_runtime_type_check
  CHECK (runtime_type IN ('legacy', 'session'));

ALTER TABLE flow_executions
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES flow_sessions(session_id) ON DELETE SET NULL;

ALTER TABLE flow_executions
  DROP CONSTRAINT IF EXISTS flow_executions_status_check;

ALTER TABLE flow_executions
  ADD CONSTRAINT flow_executions_status_check
  CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'abandoned', 'timeout'));

CREATE INDEX IF NOT EXISTS idx_flow_executions_session_id
  ON flow_executions(session_id);