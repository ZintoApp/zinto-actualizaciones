ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS custom_variables jsonb NOT NULL DEFAULT '[]';
