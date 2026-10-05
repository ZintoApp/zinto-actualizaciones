/**
 * TikTok Business Messaging API Type Definitions
 *
 * OAuth follows TikTok Business API v1.3 (authorization via `www.tiktok.com/v2/auth/authorize` — TikTok account holder URL per Accounts API Authorization v1.3,
 * token exchange via `business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/`).
 */

/** Business Messaging partner reply window: 48 hours after the user's last message (documented policy). */
export const TIKTOK_MESSAGING_WINDOW_HOURS = 48;
export const TIKTOK_MESSAGING_WINDOW_MS = TIKTOK_MESSAGING_WINDOW_HOURS * 60 * 60 * 1000;

/** User-facing short label for UI copy (keep in sync with capability + send pipeline). */
export const TIKTOK_MESSAGING_WINDOW_POLICY_SHORT = '48-hour messaging window';

export function isWithinTikTokPartnerMessagingWindow(
  lastUserMessageAtMs: number | null | undefined,
  nowMs: number
): boolean {
  if (lastUserMessageAtMs == null || lastUserMessageAtMs <= 0) return true;
  return nowMs - lastUserMessageAtMs < TIKTOK_MESSAGING_WINDOW_MS;
}

/** Canonical OAuth scopes for TikTok Business Messaging (single source for auth, validation, diagnostics). */
export const TIKTOK_ALLOWED_SCOPES = [
  'user.info.basic',
  'user.info.username',
  'user.info.stats',
  'user.info.profile',
  'user.account.type',
  'user.insights',
  'video.list',
  'video.insights',
  'comment.list',
  'comment.list.manage',
  'video.publish',
  'video.upload',
  'biz.spark.auth',
  'discovery.search.words',
] as const;

export type TikTokAllowedScope = (typeof TIKTOK_ALLOWED_SCOPES)[number];

/**
 * Scopes the backend enforces on OAuth callback and token refresh (subset grants are allowed for all other portal-listed scopes).
 */
export const TIKTOK_OAUTH_ENFORCED_SCOPES = ['user.info.basic'] as const;

export function getTikTokOAuthScopeParam(scopes: readonly string[] = TIKTOK_ALLOWED_SCOPES): string {
  return [...scopes].join(',');
}

/**
 * OAuth authorization metadata stored on partner `publicProfile` (admin-configured).
 * Either {@link accountHolderAuthorizationUrl} or {@link allowedScopes} (or both) may be set;
 * the connect flow prefers the URL template when present.
 */
export interface TikTokPartnerOAuthPublicProfile {
  allowedScopes?: string[];
  /** Full account-holder authorize URL from the TikTok developer portal; `state` and `redirect_uri` are applied at connect time. */
  accountHolderAuthorizationUrl?: string;
}

/**
 * Resolve the portal-approved scope list for outbound OAuth and scope checks.
 * Prefers the `scope` query param on {@link TikTokPartnerOAuthPublicProfile.accountHolderAuthorizationUrl}
 * (portal URL is authoritative); then persisted `allowedScopes`; otherwise {@link TIKTOK_ALLOWED_SCOPES}.
 */
export function resolveTikTokPartnerOAuthScopes(publicProfile: unknown): string[] {
  const pp = publicProfile as TikTokPartnerOAuthPublicProfile | null | undefined;
  if (!pp) return [...TIKTOK_ALLOWED_SCOPES];
  const url = typeof pp.accountHolderAuthorizationUrl === 'string' ? pp.accountHolderAuthorizationUrl.trim() : '';
  if (url) {
    try {
      const parsed = parseTikTokScopeList(new URL(url).searchParams.get('scope'));
      if (parsed.length > 0) return parsed;
    } catch {
      /* ignore invalid URL */
    }
  }
  const arr = pp.allowedScopes;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.map((s) => String(s).trim()).filter(Boolean);
  }
  return [...TIKTOK_ALLOWED_SCOPES];
}

/**
 * OAuth callback path segment appended to the app origin for the registered redirect URI (no forced trailing slash).
 */
export const TIKTOK_OAUTH_CALLBACK_PATH = '/api/tiktok/oauth/callback';

export type TikTokOAuthRedirectOriginIssue = 'not_https' | 'explicit_port';

/** Build the default redirect URI: `{origin}{TIKTOK_OAUTH_CALLBACK_PATH}` (trim origin; do not alter trailing slash on the path). */
export function buildCanonicalTikTokOAuthRedirectUriFromOrigin(origin: string): string {
  const trimmed = String(origin).trim().replace(/\/+$/, '');
  if (!trimmed) {
    return TIKTOK_OAUTH_CALLBACK_PATH;
  }
  return `${trimmed}${TIKTOK_OAUTH_CALLBACK_PATH}`;
}

export class TikTokPartnerConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TikTokPartnerConfigValidationError';
  }
}

/**
 * Canonical OAuth redirect URI for this product: `{origin}{TIKTOK_OAUTH_CALLBACK_PATH}` with no trailing slash on the path.
 * TikTok matches redirect URIs exactly; this collapses slash/format variants to the single supported callback shape.
 */
export function canonicalizeTikTokOAuthRedirectUri(redirectUri: string): string {
  const t = redirectUri.trim();
  if (!t) {
    throw new TikTokPartnerConfigValidationError('OAuth redirect URL is required.');
  }
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new TikTokPartnerConfigValidationError('OAuth redirect URL must be a valid absolute http(s) URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new TikTokPartnerConfigValidationError('OAuth redirect URL must use http or https.');
  }
  const normalizedPath =
    u.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const expected = TIKTOK_OAUTH_CALLBACK_PATH.replace(/\/$/, '');
  if (normalizedPath !== expected) {
    throw new TikTokPartnerConfigValidationError(
      `OAuth redirect URL path must be exactly ${TIKTOK_OAUTH_CALLBACK_PATH} (register this exact URL, including slashes, in the TikTok developer portal).`
    );
  }
  return `${u.origin}${TIKTOK_OAUTH_CALLBACK_PATH}`;
}

/**
 * Prepare a TikTok OAuth redirect URI for outbound requests and runtime use.
 * When the value is non-empty, returns {@link canonicalizeTikTokOAuthRedirectUri}; unknown legacy values fall back to trim-only.
 */
export function normalizeTikTokOAuthRedirectUri(redirectUri: string): string {
  const t = redirectUri.trim();
  if (!t) return '';
  try {
    return canonicalizeTikTokOAuthRedirectUri(t);
  } catch {
    return t;
  }
}

/**
 * Detect origin characteristics that often break TikTok production redirect registration (HTTPS, default ports).
 */
export function getTikTokOAuthRedirectOriginIssues(origin: string): TikTokOAuthRedirectOriginIssue[] {
  const issues: TikTokOAuthRedirectOriginIssue[] = [];
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') {
      issues.push('not_https');
    }
    if (
      u.port &&
      !((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80'))
    ) {
      issues.push('explicit_port');
    }
    return issues;
  } catch {
    return ['not_https'];
  }
}

/**
 * Apply dynamic `state` and app `redirect_uri` to a portal-copied authorization URL.
 */
export function finalizeTikTokAccountHolderAuthorizationUrl(
  templateUrl: string,
  opts: { state: string; redirectUri: string }
): string {
  const url = new URL(templateUrl.trim());
  url.searchParams.set('state', opts.state);
  url.searchParams.set('redirect_uri', normalizeTikTokOAuthRedirectUri(opts.redirectUri));
  return url.toString();
}

/**
 * Apply state and redirect_uri to a portal authorization URL template; returns null if the template is not a valid URL.
 */
export function tryFinalizeTikTokAccountHolderAuthorizationUrl(
  templateUrl: string,
  opts: { state: string; redirectUri: string }
): string | null {
  try {
    const trimmed = templateUrl.trim();
    if (!trimmed) return null;
    return finalizeTikTokAccountHolderAuthorizationUrl(trimmed, opts);
  } catch {
    return null;
  }
}

/**
 * Reject non-empty values that cannot be parsed as absolute http(s) URLs (admin save / persistence).
 */
export function validateTikTokAccountHolderAuthorizationUrlForPersistence(urlRaw: string): void {
  const t = urlRaw.trim();
  if (!t) return;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new TikTokPartnerConfigValidationError(
        'Account holder authorization URL must use http or https.'
      );
    }
  } catch (e) {
    if (e instanceof TikTokPartnerConfigValidationError) throw e;
    throw new TikTokPartnerConfigValidationError(
      'Account holder authorization URL must be a valid absolute http(s) URL.'
    );
  }
}

/**
 * Normalize TikTok OAuth fields on partner `publicProfile` when saving from admin APIs.
 */
export function normalizeTikTokPartnerPublicProfileForPersistence(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const merged = { ...(existing || {}), ...(incoming || {}) };
  const urlRaw =
    typeof merged.accountHolderAuthorizationUrl === 'string'
      ? merged.accountHolderAuthorizationUrl.trim()
      : '';
  if (urlRaw) {
    validateTikTokAccountHolderAuthorizationUrlForPersistence(urlRaw);
    merged.accountHolderAuthorizationUrl = urlRaw;
  } else delete merged.accountHolderAuthorizationUrl;

  if (urlRaw) {
    try {
      const parsed = parseTikTokScopeList(new URL(urlRaw).searchParams.get('scope'));
      merged.allowedScopes = parsed.length > 0 ? parsed : [...TIKTOK_ALLOWED_SCOPES];
    } catch {
      merged.allowedScopes = [...TIKTOK_ALLOWED_SCOPES];
    }
  } else {
    const scopes = merged.allowedScopes;
    if (Array.isArray(scopes) && scopes.length > 0) {
      merged.allowedScopes = scopes.map((s) => String(s).trim()).filter(Boolean);
    } else {
      merged.allowedScopes = [...TIKTOK_ALLOWED_SCOPES];
    }
  }
  return merged;
}

/** Business API hosts (token + API calls). */
export const TIKTOK_BUSINESS_API_BASE_URL = 'https://business-api.tiktok.com';
export const TIKTOK_BUSINESS_API_VERSION = 'v1.3';
export const TIKTOK_BUSINESS_API_OPEN_PREFIX = '/open_api/v1.3';

const TIKTOK_BUSINESS_OPEN_API_V13_SUFFIX = '/open_api/v1.3';
const TIKTOK_BUSINESS_OPEN_API_V2_SUFFIX = '/open_api/v2';

/**
 * Normalize `api_base_url` from partner config: may be host-only or already include
 * `/open_api/v1.3` (per migrations/008) or legacy `/open_api/v2` / trailing `/v2`, possibly duplicated.
 * Returns the origin/host segment only so {@link TIKTOK_BUSINESS_API_OPEN_PREFIX} is appended exactly once.
 */
function normalizeTikTokBusinessConfigurableBase(baseUrl: string): string {
  let s = String(baseUrl).trim().replace(/\/+$/, '');
  for (;;) {
    const before = s;
    if (s.endsWith(TIKTOK_BUSINESS_OPEN_API_V13_SUFFIX)) {
      s = s.slice(0, -TIKTOK_BUSINESS_OPEN_API_V13_SUFFIX.length).replace(/\/+$/, '');
    } else if (s.endsWith(TIKTOK_BUSINESS_OPEN_API_V2_SUFFIX)) {
      s = s.slice(0, -TIKTOK_BUSINESS_OPEN_API_V2_SUFFIX.length).replace(/\/+$/, '');
    } else if (s.endsWith('/v2')) {
      s = s.slice(0, -'/v2'.length).replace(/\/+$/, '');
    }
    if (s === before || s.length === 0) {
      s = before;
      break;
    }
  }
  return s.replace(/\/+$/, '');
}

/**
 * Join configurable Business API base host with the v1.3 open prefix and resource path.
 */
export function buildTikTokBusinessApiUrl(baseUrl: string, path: string): string {
  let base = normalizeTikTokBusinessConfigurableBase(baseUrl);
  if (!base) {
    base = TIKTOK_BUSINESS_API_BASE_URL;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${TIKTOK_BUSINESS_API_OPEN_PREFIX}${normalizedPath}`;
}

/**
 * TikTok Account Holder token endpoint (Accounts API v1.3 JSON body: `client_id`, `client_secret`, `auth_code`, `grant_type`).
 * Use only if your integration exchanges codes against this host; {@link TIKTOK_OPEN_OAUTH_TOKEN_URL} is required for `www.tiktok.com/v2/auth/authorize/`.
 */
export const TIKTOK_BUSINESS_TOKEN_URL =
  'https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/';

/**
 * OAuth v2 token endpoint for user access tokens (pairs with `https://www.tiktok.com/v2/auth/authorize/`).
 * Request: `application/x-www-form-urlencoded` with `client_key`, `client_secret`, `code`, `grant_type`, `redirect_uri` (code exchange) or refresh fields.
 */
export const TIKTOK_OPEN_OAUTH_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

/** TikTok Login Kit v2 user profile (`GET`, `Authorization: Bearer`, `fields` query param). */
export const TIKTOK_V2_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

/**
 * OAuth token revocation (v2).
 */
export const TIKTOK_BUSINESS_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';

/**
 * TikTok account holder authorization URL (Accounts API Authorization v1.3).
 * Query params: `client_key`, `redirect_uri`, `state`, `scope` (comma-separated), `response_type`.
 */
export const TIKTOK_BUSINESS_OAUTH_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize';

export function buildTikTokBusinessAuthorizationUrl(opts: {
  clientKey: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const url = new URL(TIKTOK_BUSINESS_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('client_key', opts.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', normalizeTikTokOAuthRedirectUri(opts.redirectUri));
  url.searchParams.set('state', opts.state);
  const scopeParam =
    opts.scopes && opts.scopes.length > 0 ? getTikTokOAuthScopeParam(opts.scopes) : getTikTokOAuthScopeParam();
  if (scopeParam) url.searchParams.set('scope', scopeParam);
  return url.toString();
}

/**
 * Raw JSON envelope for TikTok v2 OAuth token responses (`POST .../v2/oauth/token/`).
 * Success payloads include top-level `access_token`, `refresh_token`, `expires_in`,
 * `refresh_expires_in`, `token_type`, `scope`, and `open_id`. Some gateways nest the same fields under `data`.
 * Failed token requests return top-level `error` (string), `error_description`, and `log_id` per TikTok v2 docs.
 */
export interface TikTokOAuthTokenEnvelope {
  request_id?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    token_type?: string;
    scope?: string;
    scopes?: string[] | string;
    open_id?: string;
    advertiser_ids?: string[];
    [key: string]: unknown;
  };
  /** v2 OAuth error code (string) or nested API-style error object */
  error?: string | { code?: string; message?: string; log_id?: string };
  error_description?: string;
  log_id?: string;
  /** v2 success: tokens and metadata at top level */
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
  scope?: string;
  open_id?: string;
}


/**
 * TikTok platform configuration stored in partner_configurations table
 * This is configured by super admin and shared across all companies
 */
export interface TikTokPlatformConfig {

  clientKey: string;           // TikTok app client key
  clientSecret: string;        // TikTok app secret — plaintext only in memory at service boundaries; encrypted at rest in DB
  

  webhookUrl: string;           // Platform webhook URL for receiving messages
  webhookSecret?: string;       // Webhook signature verification secret (encrypted)
  

  apiVersion?: string;          // TikTok API version (e.g., "v1.3")
  apiBaseUrl?: string;          // Base URL for TikTok Business API
  

  partnerId?: string;           // TikTok Messaging Partner ID (if applicable)
  partnerName?: string;         // Partner display name
  

  logoUrl?: string;             // TikTok logo URL for UI
  redirectUrl?: string;         // OAuth redirect URL
}





/** How access/refresh tokens were minted; drives which token endpoint and payload refresh uses. */
export type TikTokOAuthTokenMintFlow = 'open_oauth_v2' | 'business_api_v13';

/** Persist on new connections when tokens are obtained via Business API v1.3 code exchange. */
export const TIKTOK_OAUTH_TOKEN_MINT_FLOW_BUSINESS_API_V13: TikTokOAuthTokenMintFlow = 'business_api_v13';

/**
 * TikTok connection data stored in channel_connections.connectionData
 * This is specific to each company's TikTok Business account
 */
export interface TikTokConnectionData {

  /**
   * Token mint flow for this connection. Omitted or `open_oauth_v2` = Login Kit / open.tiktokapis.com v2 token family (legacy persisted connections).
   * `business_api_v13` = Business API `tt_user/oauth2/token` code exchange (current default for new links).
   */
  oauthTokenMintFlow?: TikTokOAuthTokenMintFlow;

  /** Access token — encrypted at rest (`ttk1:` envelope in DB); plaintext when built in memory before persist */
  accessToken: string;
  /** Refresh token — encrypted at rest */
  refreshToken: string;
  tokenExpiresAt: number;       // Unix timestamp when access token expires
  

  accountId: string;            // TikTok user ID (open_id)
  accountName: string;          // TikTok display name
  accountHandle?: string;       // TikTok username (@handle)
  avatarUrl?: string;           // TikTok profile picture URL
  

  grantedScopes: string[];      // Scopes granted by user (e.g., ["user.info.basic", "im.chat", "business.management"])
  

  isBusinessAccount: boolean;   // Must be true for messaging
  businessAccountId?: string;   // TikTok Business account ID (if different from open_id)
  
  // Region restrictions
  regionRestricted?: boolean;   // Indicates if account is in EEA/UK/CH (messaging unavailable)
  restrictedFeatures?: string[]; // List of unavailable features (e.g., ["messaging", "conversations"])
  regionCode?: string;          // Detected region/country code for reference

  connectedAt: number;          // Unix timestamp when connection was established
  lastSyncAt?: number;          // Unix timestamp of last successful sync
  tokenRefreshedAt?: number;    // Unix timestamp when token was last refreshed
  healthCheckCount?: number;    // Total number of health checks performed
  lastHealthCheckAt?: number;  // Unix timestamp of last health check
  tokenRefreshAttempts?: number; // Consecutive refresh attempts (reset on success)
  nextTokenRefreshAt?: number;  // Pre-calculated time when next refresh will occur

  status: 'active' | 'error' | 'token_expired' | 'disconnected';
  lastError?: string;           // Last error message (e.g. "TOKEN_EXPIRED", "REFRESH_TOKEN_INVALID")
  errorCount?: number;          // Consecutive error count

  // Conversation state tracking (e.g. last known window status for UI/serialization)
  conversationState?: 'active' | 'window_closed' | 'user_blocked' | 'expired';
  messagingWindowStatus?: 'open' | 'closed' | 'expired';
  lastWindowStatusAt?: number;  // Unix timestamp when window status was last updated
}

export function resolveTikTokOAuthTokenMintFlow(
  data: Pick<TikTokConnectionData, 'oauthTokenMintFlow'>
): TikTokOAuthTokenMintFlow {
  return data.oauthTokenMintFlow === 'business_api_v13' ? 'business_api_v13' : 'open_oauth_v2';
}

/**
 * TikTok OAuth authorization request parameters
 */
/** @deprecated Login Kit style; Business flow uses {@link buildTikTokBusinessAuthorizationUrl}. */
export interface TikTokOAuthAuthorizationParams {
  client_key: string;
  scope: string;
  response_type: 'code';
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: 'S256';
}

/** TikTok account holder authorization URL query params. */
export interface TikTokBusinessOAuthAuthorizationParams {
  client_key: string;
  response_type: 'code';
  redirect_uri: string;
  state: string;
  scope?: string;
}

/**
 * TikTok account holder OAuth redirect query params on `redirect_uri`.
 * Successful callbacks may include `code` and/or `auth_code` (TikTok and docs vary); server handlers prefer `code` when both are present, with `auth_code` as a compatibility fallback.
 * Error/denial callbacks include `error`, optional `error_description`, and typically `state`.
 */
export interface TikTokOAuthCallbackSuccess {
  code?: string;
  auth_code?: string;
  scopes?: string;
  state?: string;
  error?: never;
  error_description?: never;
}

export interface TikTokOAuthCallbackError {
  error: string;
  error_description?: string;
  state?: string;
  code?: never;
}

export type TikTokOAuthCallbackResponse = TikTokOAuthCallbackSuccess | TikTokOAuthCallbackError;

/**
 * TikTok Business API v1.3 OAuth token request body (matches {@link TikTokBusinessOAuthTokenBody}).
 * Uses `client_id` and `client_secret` for the Accounts API token endpoint.
 */
export interface TikTokOAuthTokenRequest {
  client_id: string;
  client_secret: string;
  auth_code?: string;
  grant_type?: 'authorization_code' | 'refresh_token';
  refresh_token?: string;
}

/** Business API v1.3 token exchange/refresh JSON body (`.../open_api/v1.3/tt_user/oauth2/token/`). Uses `client_id` and `client_secret`. */
export interface TikTokBusinessOAuthTokenBody {
  client_id: string;
  client_secret: string;
  auth_code?: string;
  grant_type?: 'authorization_code' | 'refresh_token';
  refresh_token?: string;
}

/**
 * TikTok OAuth token response
 */
export interface TikTokOAuthTokenResponse {
  request_id?: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;           // Seconds until expiration (typically 86400 = 24 hours)
  token_type: 'Bearer';
  scope: string;
  open_id?: string;
  advertiser_ids?: string[];
}

export function parseTikTokScopeList(raw: string | string[] | undefined | null): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Result of validating granted OAuth scopes (scope minimization)
 */
export interface TikTokScopeValidationResult {
  valid: boolean;
  grantedScopes: string[];
  missingScopes: string[];
  excessScopes: string[];
  warnings: string[];
}

export function validateTikTokGrantedScopes(
  scopeString: string,
  required: readonly string[] = TIKTOK_ALLOWED_SCOPES
): TikTokScopeValidationResult {
  const grantedScopes = parseTikTokScopeList(scopeString);
  const missingScopes = required.filter((s) => !grantedScopes.includes(s));
  const excessScopes = grantedScopes.filter((s) => !required.includes(s));
  const warnings: string[] = [];
  if (grantedScopes.includes('business.management') && !required.includes('business.management')) {
    warnings.push(
      'Scope business.management granted but not required for current feature set (scope minimization)'
    );
  }
  return {
    valid: missingScopes.length === 0,
    grantedScopes,
    missingScopes,
    excessScopes,
    warnings,
  };
}





/**
 * TikTok user information from user.info.basic scope
 */
export interface TikTokUserInfo {
  open_id: string;              // TikTok user ID
  union_id?: string;            // Union ID across TikTok apps
  avatar_url?: string;          // Profile picture URL
  avatar_url_100?: string;      // 100x100 avatar
  avatar_large_url?: string;    // Large avatar
  display_name: string;         // Display name
  bio_description?: string;     // Profile bio
  profile_deep_link?: string;   // Deep link to profile
  is_verified?: boolean;        // Verified account badge
  username?: string;            // TikTok username (@handle)
  follower_count?: number;      // Number of followers
  following_count?: number;     // Number of following
  likes_count?: number;         // Total likes received
  video_count?: number;         // Number of videos posted
}





/**
 * TikTok conversation object from Business Messaging API
 * (e.g. GET /business/message/conversation/list)
 */
export interface TikTokConversation {
  conversation_id: string;
  /** Last update time for the conversation (API-specific epoch; typically Unix seconds or ms) */
  up_time: number;
  participant_id?: string;
  participant_name?: string;
  participant_avatar?: string;
  last_message_at?: number;
  unread_count?: number;
  status?: 'active' | 'archived';
}

/**
 * Message content types for TikTok Business Messaging API (v2 surface)
 */
export type TikTokBusinessMessageType =
  | 'text'
  | 'image'
  | 'share_post'
  | 'video'
  | 'sticker';

/**
 * TikTok message payload shape (send/receive content fields)
 */
export interface TikTokMessageContent {
  text?: { body: string };
  image?: { media_id: string };
  share_post?: { item_id: string };
  /** Video message (receive/webhook often exposes video_url; sends may use API-specific fields) */
  video?: { video_url?: string; thumbnail_url?: string; media_id?: string };
  /** Sticker message */
  sticker?: { sticker_id: string };
}

/**
 * TikTok message object from Business Messaging API
 */
export interface TikTokMessage {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  message_type: TikTokBusinessMessageType;
  content: TikTokMessageContent;
  timestamp: number;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: Record<string, any>;
}

/**
 * POST /business/message/send request body (TikTok Business Messaging API)
 */
export interface TikTokSendMessageRequest {
  business_id: string;
  conversation_id: string;
  text?: { body: string };
  image?: { media_id: string };
  share_post?: { item_id: string };
  video?: { media_id: string };
  sticker?: { sticker_id: string };
}

/**
 * POST /business/message/send response
 */
export interface TikTokSendMessageResponse {
  message_id?: string;
  status: string;
  error?: {
    code: string;
    message: string;
    log_id?: string;
    suggestion?: string;
  };
}

/**
 * POST media upload — JSON/form fields; file is sent as multipart outside this object.
 */
export interface TikTokMediaUploadRequest {
  business_id: string;
}

export interface TikTokMediaUploadResponse {
  media_id: string;
}

/** Temporary download URL for media fetched from TikTok */
export interface TikTokMediaDownloadResponse {
  url: string;
}

/**
 * GET /business/message/capabilities/get response payload (field set may vary by API revision).
 */
export interface TikTokCapabilitiesResponse {
  business_id?: string;
  max_message_length?: number;
  supported_features?: string[];
  capabilities?: Record<string, unknown>;
  [key: string]: unknown;
}





/**
 * TikTok webhook payload (Business Messaging API)
 */
export interface TikTokWebhookPayload {
  event: TikTokWebhookEventType;
  content?: TikTokWebhookEventContent;
  timestamp?: number;
  signature?: string;           // HMAC signature for verification
}

export type TikTokWebhookEventType =
  | 'im.message.receive'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'conversation.updated'
  | 'user_deletion'
  | 'share_post';

/**
 * TikTok webhook event content (varies by event type)
 */
export interface TikTokWebhookEventContent {
  conversation_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  message_id?: string;
  create_time?: number;
  message_type?: string;
  text?: string;
  content?: string;
  image_url?: string;
  video_url?: string;
  sticker_id?: string;
  /** Structured share-post payload when message_type indicates a post share */
  share_post?: { item_id?: string };
  user_id?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Legacy / alternate webhook data shape
 */
export interface TikTokWebhookData {
  message?: TikTokMessage;
  conversation_id?: string;
  user_id?: string;
  status?: string;
  metadata?: Record<string, any>;
}

/**
 * TikTok Business Messaging API webhook event (canonical structure)
 */
export interface TikTokBusinessMessagingEvent {
  event: string;
  content: {
    conversation_id?: string;
    from_user_id?: string;
    to_user_id?: string;
    message_id?: string;
    create_time?: number;
    message_type?: string;
    text?: string;
    image_url?: string;
    video_url?: string;
    sticker_id?: string;
    share_post?: { item_id?: string };
    user_id?: string;
    status?: string;
    [key: string]: unknown;
  };
  timestamp: number;
}





/**
 * TikTok API error response
 */
export interface TikTokAPIError {
  error: {
    code: string;               // Error code (e.g., "invalid_token", "rate_limit_exceeded")
    message: string;            // Human-readable error message
    log_id?: string;            // Request log ID for debugging
    suggestion?: string;        // Actionable suggestion for resolving the error
  };
}

/**
 * TikTok error codes
 */
export enum TikTokErrorCode {
  INVALID_TOKEN = 'invalid_token',
  TOKEN_EXPIRED = 'token_expired',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  INVALID_REQUEST = 'invalid_request',
  USER_NOT_FOUND = 'user_not_found',
  MESSAGE_WINDOW_EXPIRED = 'message_window_expired',  // 48-hour partner messaging window
  BUSINESS_ACCOUNT_REQUIRED = 'business_account_required',
  PARTNER_ACCESS_REQUIRED = 'partner_access_required',
  CONVERSATION_NOT_FOUND = 'conversation_not_found',
  CONVERSATION_EXPIRED = 'conversation_expired',
  RECIPIENT_BLOCKED = 'recipient_blocked',
}

/**
 * Outcome of probing Business Messaging (conversation list) for OAuth / eligibility.
 * Transient HTTP or transport failures use `retryable` so callers do not treat them as wrong account type.
 */
export type TikTokMessagingEligibilityProbeResult =
  | { status: 'eligible' }
  | { status: 'not_eligible'; httpStatus?: number; apiCode?: string; message?: string }
  | { status: 'retryable'; httpStatus?: number; message: string };

/**
 * OAuth-time Business Messaging verification — explicit not-business vs retryable / inconclusive probe or profile errors.
 */
export type TikTokBusinessAccountVerificationResult =
  | { outcome: 'verified'; businessAccountId: string }
  | { outcome: 'not_business'; message?: string }
  | { outcome: 'retryable'; message: string };





/**
 * TikTok conversation metadata stored in groupMetadata JSONB field
 */
export interface TikTokConversationMetadata {
  tiktokConversationId?: string;
  tiktokStatus?: string;
  lastUserInteractionAt?: number;
  messagingWindowStatus?: 'open' | 'closed' | 'expired';
  messagingWindowExpiresAt?: number;
  conversationState?: 'active' | 'window_closed' | 'user_blocked' | 'expired';
  userDeleted?: boolean;
}

/**
 * TikTok rate limit information
 */
export interface TikTokRateLimit {
  limit: number;                // Max requests per window (e.g., 10 QPS)
  remaining: number;            // Remaining requests in current window
  reset: number;                // Unix timestamp when limit resets
  window: number;               // Window duration in seconds
}


export function isTikTokConnectionData(data: any): data is TikTokConnectionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.accessToken === 'string' &&
    typeof data.refreshToken === 'string' &&
    typeof data.accountId === 'string' &&
    typeof data.accountName === 'string' &&
    typeof data.isBusinessAccount === 'boolean'
  );
}

export function isTikTokPlatformConfig(config: any): config is TikTokPlatformConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    typeof config.clientKey === 'string' &&
    typeof config.clientSecret === 'string'
  );
}

/**
 * TikTok messaging window status for conversation UI
 */
export interface TikTokMessagingWindowStatus {
  conversationId: number;
  isOpen: boolean;
  expiresAt: Date | null;
  lastInteractionAt: Date;
  status: 'active' | 'expiring_soon' | 'expired';
  remainingTime: number; // milliseconds
}

/**
 * TikTok connection health for diagnostics UI
 */
export interface TikTokConnectionHealth {
  connectionId: number;
  status: 'connected' | 'token_expiring' | 'disconnected' | 'error';
  healthScore: number; // 0-100
  tokenExpiresAt: Date;
  lastSuccessfulCall: Date | null;
  errorCount: number;
  lastError: string | null;
  grantedScopes: string[];
  /** Scopes required by the backend (OAuth callback / refresh); connection is invalid if non-empty. */
  missingScopes: string[];
  /** Portal-requested scopes not granted; informational when the connection is otherwise accepted. */
  advisoryMissingScopes?: string[];
  regionRestrictions: {
    isRestricted: boolean;
    region: string;
    unavailableFeatures: string[];
  };
}

/**
 * TikTok rich media content for message rendering
 */
export interface TikTokRichMediaContent {
  type: 'video_share' | 'product_card' | 'sticker';
  videoUrl?: string;
  coverImageUrl?: string;
  title?: string;
  creatorName?: string;
  productId?: string;
  stickerUrl?: string;
}

