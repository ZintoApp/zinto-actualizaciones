-- Add channel-specific Meta partner configuration fields for Instagram and Messenger

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_configurations' AND column_name = 'instagram_config_id'
  ) THEN
    ALTER TABLE partner_configurations ADD COLUMN instagram_config_id TEXT;
    RAISE NOTICE 'Added instagram_config_id column to partner_configurations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_configurations' AND column_name = 'messenger_config_id'
  ) THEN
    ALTER TABLE partner_configurations ADD COLUMN messenger_config_id TEXT;
    RAISE NOTICE 'Added messenger_config_id column to partner_configurations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_configurations' AND column_name = 'meta_channels_config_id'
  ) THEN
    ALTER TABLE partner_configurations ADD COLUMN meta_channels_config_id TEXT;
    RAISE NOTICE 'Added meta_channels_config_id column to partner_configurations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_configurations' AND column_name = 'instagram_webhook_url'
  ) THEN
    ALTER TABLE partner_configurations ADD COLUMN instagram_webhook_url TEXT;
    RAISE NOTICE 'Added instagram_webhook_url column to partner_configurations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_configurations' AND column_name = 'messenger_webhook_url'
  ) THEN
    ALTER TABLE partner_configurations ADD COLUMN messenger_webhook_url TEXT;
    RAISE NOTICE 'Added messenger_webhook_url column to partner_configurations';
  END IF;
END$$;

COMMENT ON COLUMN partner_configurations.config_id IS 'WhatsApp Configuration ID for embedded signup';
COMMENT ON COLUMN partner_configurations.instagram_config_id IS 'Facebook Login for Business configuration ID for Instagram onboarding';
COMMENT ON COLUMN partner_configurations.messenger_config_id IS 'Facebook Login for Business configuration ID for Messenger onboarding';
COMMENT ON COLUMN partner_configurations.meta_channels_config_id IS 'Shared Facebook Login for Business configuration ID for Instagram and Messenger';
COMMENT ON COLUMN partner_configurations.instagram_webhook_url IS 'Webhook callback URL for Instagram channel events';
COMMENT ON COLUMN partner_configurations.messenger_webhook_url IS 'Webhook callback URL for Messenger channel events';
