-- Allow independent Instagram credentials while retaining existing providers.
ALTER TABLE partner_configurations
  DROP CONSTRAINT IF EXISTS partner_configurations_provider_check;

ALTER TABLE partner_configurations
  ADD CONSTRAINT partner_configurations_provider_check
  CHECK (provider IN ('meta', 'twilio', 'tiktok', 'instagram'));

COMMENT ON COLUMN partner_configurations.provider IS
  'Partner provider name (meta, twilio, tiktok, instagram)';
