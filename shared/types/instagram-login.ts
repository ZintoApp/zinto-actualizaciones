import { instagramEnglish, type InstagramTranslate } from '../instagram-i18n';

export const INSTAGRAM_BUSINESS_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
] as const;
// Meta's Instagram Login field matrix lists this additional permission for echoes.
export const INSTAGRAM_ECHO_SCOPE = 'instagram_business_manage_comments';
export const INSTAGRAM_BUSINESS_REQUESTED_SCOPES = [...INSTAGRAM_BUSINESS_SCOPES, INSTAGRAM_ECHO_SCOPE] as const;
export const INSTAGRAM_BASE_WEBHOOK_FIELDS = ['messages', 'messaging_seen', 'message_reactions'] as const;
export const INSTAGRAM_BUSINESS_WEBHOOK_FIELDS = [...INSTAGRAM_BASE_WEBHOOK_FIELDS,
  'message_echoes', 'messaging_postbacks', 'messaging_referral'] as const;
export const INSTAGRAM_OAUTH_CALLBACK_PATH = '/api/instagram/oauth/callback';
export const INSTAGRAM_WEBHOOK_PATH = '/api/webhooks/instagram';
export const INSTAGRAM_GRAPH_VERSION = 'v25.0';

export interface InstagramLoginConfiguration {
  appId: string;
  appSecret: string;
  verifyToken: string;
  webhookUrl: string;
  redirectUrl: string;
  hasAppSecret?: boolean;
}

export interface InstagramLoginResult {
  type: 'instagram_oauth_result';
  state: string;
  success: boolean;
  connectionId?: number;
  username?: string;
  warning?: string;
  error?: string;
}

export interface InstagramAccountSubscriptionStatus {
  success: boolean;
  dashboardConfiguration: 'manual';
  subscribedAt: string;
  error?: string;
  requestedFields?: string[];
  subscribedFields?: string[];
  grantedPermissions?: string[];
  inboundActive?: boolean;
  outboundActive?: boolean;
  adEventsActive?: boolean;
  reconnectRequired?: boolean;
  failures?: Array<{ field: string; code?: number; subcode?: number }>;
}

export function validateInstagramLoginConfiguration(config: InstagramLoginConfiguration, t: InstagramTranslate = instagramEnglish): string[] {
  const errors: string[] = [];
  if (!/^\d+$/.test(config.appId.trim())) errors.push(t("instagram.validation.app_id", 'A numeric Instagram App ID is required.'));
  if (!config.appSecret.trim() && !config.hasAppSecret) errors.push(t("instagram.validation.app_secret", 'Instagram App Secret is required.'));
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(config.verifyToken)) {
    errors.push(t("instagram.validation.verify_token", 'Verify token must contain 16–128 letters, numbers, underscores or hyphens.'));
  }
  for (const [value, path, label] of [
    [config.webhookUrl, INSTAGRAM_WEBHOOK_PATH, t('settings.metaPartnerConfiguration.webhook_url', 'Webhook URL')],
    [config.redirectUrl, INSTAGRAM_OAUTH_CALLBACK_PATH, t('settings.metaPartnerConfiguration.oauth_redirect_url', 'OAuth redirect URL')],
  ]) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.pathname !== path || url.search || url.hash || url.username || url.password) throw new Error();
    } catch {
      errors.push(t('instagram.validation.callback_url', '{{label}} must be an HTTPS URL ending in {{path}}, without a query or fragment.', { label, path }));
    }
  }
  return errors;
}
