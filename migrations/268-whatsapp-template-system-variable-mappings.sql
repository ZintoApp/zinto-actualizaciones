ALTER TABLE campaign_templates
  ADD COLUMN IF NOT EXISTS whatsapp_template_variable_mappings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN campaign_templates.whatsapp_template_variable_mappings IS
  'Default system-variable or fixed-value mappings keyed by canonical Meta template variable ID';
