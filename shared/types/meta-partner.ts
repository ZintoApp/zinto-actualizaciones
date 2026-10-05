export type MetaPartnerChannel = 'whatsapp' | 'instagram' | 'messenger' | 'meta_channels';

export interface MetaPartnerAvailabilityConfig {
  partnerApiKey: string;
  /** Legacy/canonical WhatsApp Embedded Signup configuration ID */
  configId?: string | null;
  /** Alias mapped from configId for channel-specific WhatsApp consumers */
  whatsAppConfigId?: string | null;
  instagramConfigId?: string | null;
  messengerConfigId?: string | null;
  metaChannelsConfigId?: string | null;
  /** Legacy WhatsApp webhook URL alias */
  webhookUrl?: string | null;
  instagramWebhookUrl?: string | null;
  messengerWebhookUrl?: string | null;
  webhooks?: {
    whatsapp?: string | null;
    instagram?: string | null;
    messenger?: string | null;
  };
  status?: string;
  lastValidatedAt?: string | Date | null;
  apiVersion?: string;
}

export type MetaGraphDiagnosticCode =
  | 'missing_permissions'
  | 'permission_restricted'
  | 'app_review_pending'
  | 'no_eligible_assets'
  | 'webhook_subscription_failed'
  | 'configuration_missing'
  | 'session_expired'
  | 'validation_error'
  | 'connection_failed'
  | 'invalid_action'
  | 'token_invalid_or_expired'
  | 'meta_oauth_error'
  | 'meta_transport_error';

export interface MetaGraphDiagnostics {
  grantedScopes: string[];
  missingScopes: string[];
  restrictedScopes: string[];
  appId?: string;
  code?: MetaGraphDiagnosticCode;
  message: string;
}

export interface MetaWebhookSubscriptionLevelStatus {
  success: boolean;
  subscribedAt: string;
  error?: string;
  level: 'app' | 'page' | 'account';
  linkedPageId?: string;
}

export interface MetaWebhookSubscriptionStatus {
  app: MetaWebhookSubscriptionLevelStatus;
  asset: MetaWebhookSubscriptionLevelStatus;
  success: boolean;
  /** Sanitized summary error when any subscription step fails */
  error?: string;
}

/** Public Page asset returned to the browser — tokens are kept server-side only */
export interface MetaPublicPageAsset {
  id: string;
  name: string;
  category?: string;
  messengerEnabled: boolean;
  instagramAccount?: MetaPublicInstagramAsset;
}

/** Public Instagram asset returned to the browser — tokens are kept server-side only */
export interface MetaPublicInstagramAsset {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
  linkedPageId?: string;
  linkedPageName?: string;
}

/** Messenger permissions for Page discovery, messaging, and webhook subscription */
export const MESSENGER_LOGIN_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
] as const;

/** Instagram via Facebook Login for Business — no instagram_business_* Instagram Login scopes */
export const INSTAGRAM_LOGIN_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
] as const;

export type MetaChannelsOnboardingMode = 'single' | 'two_step' | 'unavailable';

export interface MetaChannelsDiscoveryResponse {
  pages: MetaPublicPageAsset[];
  instagramAccounts: MetaPublicInstagramAsset[];
  diagnostics: {
    messenger: MetaGraphDiagnostics;
    instagram: MetaGraphDiagnostics;
  };
  messengerOnboardingSessionId?: string;
  instagramOnboardingSessionId?: string;
}

export interface MetaChannelsConnectSelection {
  selectedPageId?: string;
  selectedInstagramAccountId?: string;
  selectedChannels: Array<'messenger' | 'instagram'>;
}

export function resolveMetaLoginConfigId(
  config: MetaPartnerAvailabilityConfig | null | undefined,
  channel: 'instagram' | 'messenger'
): string | undefined {
  if (!config) return undefined;
  const shared = config.metaChannelsConfigId?.trim();
  if (shared) return shared;
  const channelSpecific =
    channel === 'instagram' ? config.instagramConfigId : config.messengerConfigId;
  const trimmedChannel = channelSpecific?.trim();
  return trimmedChannel || undefined;
}

export function resolveChannelWebhookUrl(
  config: {
    partnerWebhookUrl?: string | null;
    webhookUrl?: string | null;
    instagramWebhookUrl?: string | null;
    messengerWebhookUrl?: string | null;
    webhooks?: MetaPartnerAvailabilityConfig['webhooks'];
  } | null | undefined,
  channel: 'instagram' | 'messenger',
  origin: string
): string {
  if (channel === 'instagram') {
    return (
      config?.webhooks?.instagram?.trim() ||
      config?.instagramWebhookUrl?.trim() ||
      `${origin}/api/webhooks/instagram`
    );
  }
  return (
    config?.webhooks?.messenger?.trim() ||
    config?.messengerWebhookUrl?.trim() ||
    `${origin}/api/webhooks/messenger`
  );
}
