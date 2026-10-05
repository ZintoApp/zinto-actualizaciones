ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pipeline_stage_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN campaigns.pipeline_stage_ids IS 'Campaign-level pipeline stage IDs used to filter audience by deal stage';
