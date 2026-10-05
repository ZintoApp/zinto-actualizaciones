ALTER TABLE campaign_templates
  ADD COLUMN IF NOT EXISTS whatsapp_template_components JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_template_variables JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_parameter_format TEXT DEFAULT 'positional';

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS whatsapp_template_variable_mappings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN campaign_templates.whatsapp_template_components IS 'Canonical Meta template component definitions';
COMMENT ON COLUMN campaign_templates.whatsapp_template_variables IS 'Component-scoped WhatsApp template variable descriptors';
COMMENT ON COLUMN campaign_templates.whatsapp_parameter_format IS 'Meta template parameter format: named or positional';
COMMENT ON COLUMN campaigns.whatsapp_template_variable_mappings IS 'Per-template-variable contact/custom/fixed mappings for official campaigns';
