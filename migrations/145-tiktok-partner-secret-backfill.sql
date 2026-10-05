-- Backfill TikTok client secrets that were historically stored in partner_id.
-- After deploy, getPlatformConfig() requires partner_secret; this copies legacy values.

UPDATE partner_configurations
SET
  partner_secret = partner_id,
  updated_at = NOW()
WHERE provider = 'tiktok'
  AND (partner_secret IS NULL OR TRIM(COALESCE(partner_secret, '')) = '')
  AND partner_id IS NOT NULL
  AND TRIM(partner_id) <> '';
