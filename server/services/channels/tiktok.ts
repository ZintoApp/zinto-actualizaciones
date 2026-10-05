import { storage } from '../../storage';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  conversations,
  contacts,
  messages,
  contactAuditLogs,
  type PartnerConfiguration,
} from '@shared/schema';
import { EventEmitter } from 'events';
import axios, { AxiosError } from 'axios';
import { rawAxiosHeaderToString } from '../../utils/axios-headers';
import FormData from 'form-data';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { withContactInitialMessageMetadata } from './contact-initial-message-metadata';
import { smartWebSocketBroadcaster } from '../../utils/smart-websocket-broadcaster';
import { eventEmitterPool } from '../../utils/event-emitter-pool';
import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
import { getDb } from '../../db';
import { eq, and, sql, lt, isNotNull } from 'drizzle-orm';
import { logTikTokWebhookEvent } from '../../utils/webhook-logger';
import type {
  TikTokConnectionData,
  TikTokPlatformConfig,
  TikTokOAuthTokenEnvelope,
  TikTokOAuthTokenResponse,
  TikTokOAuthTokenMintFlow,
  TikTokUserInfo,
  TikTokMessage,
  TikTokConversation,
  TikTokSendMessageRequest,
  TikTokSendMessageResponse,
  TikTokAPIError,
  TikTokRateLimit,
  TikTokConversationMetadata,
  TikTokMessagingEligibilityProbeResult,
  TikTokBusinessAccountVerificationResult,
} from '@shared/types/tiktok';
import {
  TIKTOK_ALLOWED_SCOPES,
  TIKTOK_BUSINESS_API_BASE_URL,
  TIKTOK_BUSINESS_API_VERSION,
  TIKTOK_BUSINESS_REVOKE_URL,
  TIKTOK_BUSINESS_TOKEN_URL,
  TIKTOK_OPEN_OAUTH_TOKEN_URL,
  TIKTOK_V2_USER_INFO_URL,
  normalizeTikTokOAuthRedirectUri,
  resolveTikTokOAuthTokenMintFlow,
  TIKTOK_MESSAGING_WINDOW_MS,
  TIKTOK_MESSAGING_WINDOW_POLICY_SHORT,
  buildTikTokBusinessApiUrl,
  parseTikTokScopeList,
  resolveTikTokPartnerOAuthScopes,
  validateTikTokGrantedScopes,
} from '@shared/types/tiktok';
import { TikTokErrorCode } from '@shared/types/tiktok';
import {
  getDecryptedTikTokConnectionSecrets,
  getDecryptedTikTokPartnerConfigurationSecrets,
} from '../../utils/tiktok-secret-storage.ts';

type RecoveryStage = 'validating' | 'refreshing_token' | 'testing_connection' | 'recovered';

interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  userInfo: TikTokUserInfo | null;
  consecutiveFailures: number;
  lastSuccessfulValidation: Date | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastRecoveryAttempt: Date | null;
  rateLimit: TikTokRateLimit | null;
  tokenRefreshInProgress: boolean;
  recoveryStage: RecoveryStage | null;
  scheduledRefreshAt: number | null;
  consecutiveValidationFailures: number;
}

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const healthMonitoringIntervals = new Map<number, NodeJS.Timeout>();
const recoveryTimeouts = new Map<number, NodeJS.Timeout>();
const proactiveRefreshTimeouts = new Map<number, NodeJS.Timeout>();
const refreshLocks = new Map<number, Promise<string>>(); // connectionId -> in-flight refresh promise
const tokenRefreshCount24h = new Map<number, { count: number; resetAt: number }>(); // connectionId -> { count, resetAt }
const HEALTH_CHECK_HEARTBEAT_INTERVAL = 10; // log heartbeat every N health checks per connection
const userInfoValidationCache = new Map<number, { userInfo: TikTokUserInfo; cachedAt: number }>();

const HEALTH_CHECK_INTERVALS = {
  ACTIVE: 300000,     // 5 minutes for stable connections
  INACTIVE: 300000,   // 5 minutes for inactive connections
  ERROR: 60000,       // 1 minute for connections with errors
  RECOVERY: 15000,    // 15 seconds during recovery
  TOKEN_EXPIRING: 600000 // 10 minutes when token expires within 24 hours
};


const ACTIVITY_THRESHOLDS = {
  INACTIVE_TIMEOUT: 600000,  // 10 minutes
  ACTIVE_THRESHOLD: 300000,  // 5 minutes
  TOKEN_VALIDATION_INTERVAL: 3600000, // 1 hour
  TOKEN_REFRESH_BUFFER: 43200000, // 12 hours (refresh 12h before expiry)
  TOKEN_EXPIRING_SOON_MS: 86400000, // 24 hours - use TOKEN_EXPIRING interval
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_BACKOFF_BASE: 30000, // 30 seconds
  MAX_RECOVERY_TIME_MS: 30 * 60 * 1000, // 30 minutes max recovery
  VALIDATION_TIMEOUT_MS: 5000,
  USER_INFO_CACHE_MS: 5 * 60 * 1000 // 5 minutes cache for getUserInfo
};
const TIKTOK_RATE_LIMIT = {
  MAX_QPS: 10, // 10 queries per second
  WINDOW_MS: 1000 // 1 second window
};


const TIKTOK_NAMESPACE = 'tiktok-service';
const pooledEmitter = eventEmitterPool.getEmitter(TIKTOK_NAMESPACE);
eventEmitterMonitor.register('tiktok-service', pooledEmitter);


const eventEmitter = pooledEmitter;

/** Structured log prefix for TikTok service */
function tiktokLog(connectionId: number | undefined, action: string, message: string, level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO', meta?: Record<string, unknown>): void {
  const prefix = connectionId != null ? `[TikTok][ConnectionID:${connectionId}][${action}]` : `[TikTok][${action}]`;
  const full = `${prefix} ${message}`;
  if (level === 'DEBUG') logger.debug('tiktok', full, meta);
  else if (level === 'WARN') logger.warn('tiktok', full, meta);
  else if (level === 'ERROR') logger.error('tiktok', full, meta);
  else logger.info('tiktok', full, meta);
}

/** Business Messaging v1.3 open API calls use Bearer access tokens (OAuth token_type). */
function buildBusinessApiHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Resolve `business_id` for Business Messaging API calls. Prefer `businessAccountId` from `/business/account/info`
 * when TikTok returns a distinct business account id; otherwise use `accountId` (open_id) only after Business Account
 * verification with no separate id — i.e. TikTok treats that user id as the messaging business identity.
 */
function resolveBusinessMessagingBusinessId(data: TikTokConnectionData | null | undefined): string {
  if (!data || typeof data !== 'object') {
    throw new Error('TikTok connection data missing');
  }
  const verified = typeof data.businessAccountId === 'string' ? data.businessAccountId.trim() : '';
  if (verified) return verified;
  const openId = typeof data.accountId === 'string' ? data.accountId.trim() : '';
  if (!openId) {
    throw new Error('business_id missing: expected businessAccountId from Business API or accountId (open_id)');
  }
  if (!data.isBusinessAccount) {
    throw new Error('TikTok Business Messaging requires a Business Account');
  }
  return openId;
}

/** `business_id` for Business API token liveness when {@link resolveBusinessMessagingBusinessId} cannot run yet. */
function getBusinessIdForMessagingTokenCheck(data: TikTokConnectionData): string {
  try {
    return resolveBusinessMessagingBusinessId(data);
  } catch {
    const openId = typeof data.accountId === 'string' ? data.accountId.trim() : '';
    return openId;
  }
}

function formatTokenExpiry(expiresAt: number): string {
  const now = Date.now();
  const ms = expiresAt - now;
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `expires in ${Math.floor(hours / 24)} days`;
  return `expires in ${hours}h ${mins}m`;
}

function getCanonicalTikTokScopes(overrideScopes?: string[]): string[] {
  if (overrideScopes && overrideScopes.length > 0) {
    return [...overrideScopes];
  }
  return [...TIKTOK_ALLOWED_SCOPES];
}

async function getTikTokConnectionSecrets(connectionId: number): Promise<{
  connection: NonNullable<Awaited<ReturnType<typeof storage.getChannelConnection>>>;
  connectionData: TikTokConnectionData;
  accessToken: string;
}> {
  const connection = await storage.getChannelConnection(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  const { accessToken, connectionData, needsMigration } = getDecryptedTikTokConnectionSecrets(connection);
  if (!connectionData) {
    throw new Error('TikTok connection data not found');
  }

  const resolvedAccessToken = accessToken ?? connectionData.accessToken;
  if (!resolvedAccessToken) {
    throw new Error('Access token not found in connection data');
  }

  if (needsMigration) {
    await storage.updateChannelConnection(connection.id, {
      accessToken: resolvedAccessToken,
      connectionData,
    }).catch((error) => {
      logger.warn('tiktok', 'Failed to backfill encrypted TikTok connection secrets', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return {
    connection,
    connectionData,
    accessToken: resolvedAccessToken,
  };
}

/** Thrown for TikTok OAuth token exchange/refresh failures so callers can surface v2 `error` / `error_description` / `log_id`. */
export class TikTokOAuthRequestError extends Error {
  readonly tiktokErrorCode: string;
  readonly tiktokErrorDescription: string;
  readonly logId?: string;
  readonly httpStatus?: number;

  constructor(opts: {
    code: string;
    description?: string;
    logId?: string;
    httpStatus?: number;
  }) {
    const desc = opts.description ?? '';
    super(desc ? `${opts.code}: ${desc}` : opts.code);
    this.name = 'TikTokOAuthRequestError';
    this.tiktokErrorCode = opts.code;
    this.tiktokErrorDescription = desc;
    this.logId = opts.logId;
    this.httpStatus = opts.httpStatus;
  }
}

function extractOAuthFailureFromEnvelope(data: unknown): { code: string; description: string; logId?: string } | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const topLogId = typeof d.log_id === 'string' ? d.log_id : undefined;
  const nestedData = d.data;
  const nestedLogId =
    nestedData && typeof nestedData === 'object' && nestedData !== null && typeof (nestedData as Record<string, unknown>).log_id === 'string'
      ? String((nestedData as Record<string, unknown>).log_id)
      : undefined;

  if (typeof d.error === 'string' && d.error.length > 0) {
    return {
      code: d.error,
      description: typeof d.error_description === 'string' ? d.error_description : '',
      logId: topLogId ?? nestedLogId,
    };
  }

  if (d.error && typeof d.error === 'object') {
    const o = d.error as Record<string, unknown>;
    const code = o.code != null ? String(o.code) : '';
    const msg = o.message != null ? String(o.message) : '';
    if (code || msg) {
      const lid = typeof o.log_id === 'string' ? o.log_id : topLogId ?? nestedLogId;
      return { code: code || 'UNKNOWN', description: msg, logId: lid };
    }
  }

  if (typeof d.code === 'number' && d.code !== 0) {
    return {
      code: String(d.code),
      description: typeof d.message === 'string' ? d.message : '',
      logId: topLogId ?? nestedLogId,
    };
  }

  return null;
}

function throwNormalizedTikTokFailure(error: unknown): never {
  if (error instanceof TikTokOAuthRequestError) {
    throw error;
  }
  if (axios.isAxiosError(error)) {
    const oauth = extractOAuthFailureFromEnvelope(error.response?.data);
    if (oauth) {
      throw new TikTokOAuthRequestError({
        code: oauth.code,
        description: oauth.description,
        logId: oauth.logId,
        httpStatus: error.response?.status,
      });
    }
  }
  const apiErr = handleTikTokError(error);
  const err = new Error(apiErr.error.message) as Error & { tiktokApiError: TikTokAPIError };
  err.tiktokApiError = apiErr;
  throw err;
}

/** Fields allowed with `user.info.basic` (TikTok v2 user info). */
const TIKTOK_V2_USER_INFO_BASIC_FIELD_NAMES = [
  'open_id',
  'union_id',
  'avatar_url',
  'avatar_url_100',
  'avatar_large_url',
  'display_name',
] as const;

/**
 * Build `fields` for `GET /v2/user/info/` from granted OAuth scopes so tokens with only
 * `user.info.basic` do not request profile/stats fields (which require additional scopes).
 */
function buildTikTokV2UserInfoFields(grantedScopes: string[] | null | undefined): string {
  const scopeSet = new Set(grantedScopes ?? []);
  const fields = new Set<string>(TIKTOK_V2_USER_INFO_BASIC_FIELD_NAMES);
  if (scopeSet.has('user.info.profile')) {
    fields.add('bio_description');
    fields.add('profile_deep_link');
    fields.add('is_verified');
    fields.add('username');
  }
  if (scopeSet.has('user.info.username')) {
    fields.add('username');
  }
  if (scopeSet.has('user.info.stats')) {
    fields.add('follower_count');
    fields.add('following_count');
    fields.add('likes_count');
    fields.add('video_count');
  }
  return [...fields].join(',');
}

async function getV2UserInfo(
  accessToken: string,
  grantedScopes?: string[] | null
): Promise<Record<string, unknown>> {
  const response = await axios.get(TIKTOK_V2_USER_INFO_URL, {
    params: { fields: buildTikTokV2UserInfoFields(grantedScopes) },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const err = new Error(
      `TikTok v2 user info request failed: HTTP ${response.status}`
    ) as Error & { response?: typeof response };
    err.response = response;
    throw err;
  }

  const user = (response.data as { data?: { user?: Record<string, unknown> } })?.data?.user;
  if (!user || typeof user !== 'object') {
    throw new Error('TikTok v2 user info response missing data.user');
  }
  return user;
}

function normalizeBusinessTokenResponse(responseData: TikTokOAuthTokenEnvelope): TikTokOAuthTokenResponse {
  const oauthFail = extractOAuthFailureFromEnvelope(responseData);
  if (oauthFail) {
    throw new TikTokOAuthRequestError({
      code: oauthFail.code,
      description: oauthFail.description,
      logId: oauthFail.logId,
    });
  }

  const data = responseData.data ?? {};
  const access_token = String(data.access_token ?? responseData.access_token ?? '');
  const refresh_token = String(data.refresh_token ?? responseData.refresh_token ?? '');
  const scopeRaw = data.scopes ?? data.scope ?? responseData.scope ?? getCanonicalTikTokScopes().join(',');
  const grantedScopes = parseTikTokScopeList(scopeRaw);

  return {
    request_id: responseData.request_id,
    access_token,
    refresh_token,
    expires_in: Number(data.expires_in ?? responseData.expires_in ?? 86400),
    token_type: 'Bearer',
    scope: grantedScopes.join(',') || getCanonicalTikTokScopes().join(','),
    open_id:
      data.open_id != null
        ? String(data.open_id)
        : responseData.open_id != null
          ? String(responseData.open_id)
          : undefined,
    advertiser_ids: Array.isArray(data.advertiser_ids)
      ? data.advertiser_ids.map((value) => String(value))
      : [],
  };
}





/**
 * Emit TikTok event to event emitter
 */
function emitTikTokEvent(eventName: string, data: any): void {
  eventEmitterPool.emit(TIKTOK_NAMESPACE, eventName, data);
}

/**
 * Broadcast TikTok event via WebSocket
 */
function broadcastTikTokEvent(eventType: string, data: any, options: {
  companyId?: number | null;
  userId?: number | null;
  conversationId?: number | null;
  priority?: 'high' | 'normal' | 'low';
} = {}): void {
  smartWebSocketBroadcaster.broadcast({
    type: eventType,
    data,
    companyId: options.companyId ?? undefined,
    userId: options.userId ?? undefined,
    conversationId: options.conversationId ?? undefined,
    priority: options.priority || 'normal',
    batchable: options.priority !== 'high'
  });
}





/**
 * Get or create connection state
 */
function getConnectionState(connectionId: number): ConnectionState {
  if (!connectionStates.has(connectionId)) {
    connectionStates.set(connectionId, {
      isActive: false,
      lastActivity: new Date(),
      errorCount: 0,
      lastError: null,
      userInfo: null,
      consecutiveFailures: 0,
      lastSuccessfulValidation: null,
      isRecovering: false,
      recoveryAttempts: 0,
      lastRecoveryAttempt: null,
      rateLimit: null,
      tokenRefreshInProgress: false,
      recoveryStage: null,
      scheduledRefreshAt: null,
      consecutiveValidationFailures: 0
    });
  }
  return connectionStates.get(connectionId)!;
}

/**
 * Update connection activity
 */
function updateConnectionActivity(connectionId: number, success: boolean = true, error?: string) {
  const state = getConnectionState(connectionId);
  state.lastActivity = new Date();

  if (success) {
    state.errorCount = 0;
    state.consecutiveFailures = 0;
    state.lastError = null;
    state.isActive = true;
    state.lastSuccessfulValidation = new Date();
    

    if (state.isRecovering) {
      state.isRecovering = false;
      state.recoveryAttempts = 0;
      state.lastRecoveryAttempt = null;
      logger.info('tiktok', `Connection ${connectionId} recovered successfully`);
      

      const recoveryTimeout = recoveryTimeouts.get(connectionId);
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
        recoveryTimeouts.delete(connectionId);
      }
    }
  } else {
    state.errorCount++;
    state.consecutiveFailures++;
    state.lastError = error || 'Unknown error';
    

    if (state.consecutiveFailures >= 3 && !state.isRecovering) {
      initiateConnectionRecovery(connectionId);
    }
  }
}

/**
 * Get adaptive health check interval based on connection state and token expiry
 */
function getAdaptiveHealthCheckInterval(state: ConnectionState, tokenExpiresAt?: number): number {
  if (state.isRecovering) {
    return HEALTH_CHECK_INTERVALS.RECOVERY;
  }
  if (state.errorCount > 0) {
    return HEALTH_CHECK_INTERVALS.ERROR;
  }
  const now = Date.now();
  if (tokenExpiresAt && tokenExpiresAt < now + ACTIVITY_THRESHOLDS.TOKEN_EXPIRING_SOON_MS) {
    return HEALTH_CHECK_INTERVALS.TOKEN_EXPIRING;
  }
  if (state.isActive) {
    return HEALTH_CHECK_INTERVALS.ACTIVE;
  }
  return HEALTH_CHECK_INTERVALS.INACTIVE;
}

/**
 * Schedule a one-time proactive token refresh at (tokenExpiresAt - 12h)
 */
function scheduleProactiveTokenRefresh(connectionId: number): void {
  const existing = proactiveRefreshTimeouts.get(connectionId);
  if (existing) {
    clearTimeout(existing);
    proactiveRefreshTimeouts.delete(connectionId);
  }

  (async () => {
    try {
      const { connectionData: data } = await getTikTokConnectionSecrets(connectionId);
      if (!data?.tokenExpiresAt || !data?.refreshToken) return;

      const nextRefreshAt = data.tokenExpiresAt - ACTIVITY_THRESHOLDS.TOKEN_REFRESH_BUFFER;
      if (nextRefreshAt <= Date.now()) {
        await ensureValidToken(connectionId);
        return;
      }

      const delay = nextRefreshAt - Date.now();
      const state = getConnectionState(connectionId);
      state.scheduledRefreshAt = nextRefreshAt;
      eventEmitter.emit('tokenRefreshScheduled', { connectionId, scheduledAt: nextRefreshAt });
      tiktokLog(connectionId, 'ProactiveRefresh', `Next refresh at ${new Date(nextRefreshAt).toISOString()} (in ${Math.round(delay / 1000)}s)`, 'DEBUG');

      const timeout = setTimeout(async () => {
        proactiveRefreshTimeouts.delete(connectionId);
        try {
          await ensureValidToken(connectionId);
          scheduleProactiveTokenRefresh(connectionId);
        } catch (err) {
          tiktokLog(connectionId, 'ProactiveRefresh', `Proactive refresh failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'WARN');
        }
      }, delay);
      proactiveRefreshTimeouts.set(connectionId, timeout);
    } catch (err) {
      tiktokLog(connectionId, 'ProactiveRefresh', `Failed to schedule: ${err instanceof Error ? err.message : 'Unknown'}`, 'WARN');
    }
  })();
}





/**
 * Get TikTok platform configuration
 */
async function getPlatformConfig(): Promise<TikTokPlatformConfig> {
  const config = await storage.getPartnerConfiguration('tiktok');
  
  if (!config || !config.isActive) {
    throw new Error('TikTok platform configuration not found or inactive');
  }

  const { partnerSecret, accessToken, webhookVerifyToken, needsMigration } =
    getDecryptedTikTokPartnerConfigurationSecrets(config);

  if (needsMigration && config) {
    const migrationPayload: Partial<PartnerConfiguration> = { partnerSecret, accessToken };
    if (config.webhookVerifyToken != null && String(config.webhookVerifyToken).length > 0) {
      migrationPayload.webhookVerifyToken = webhookVerifyToken ?? '';
    }
    await storage.updatePartnerConfiguration(config.id, migrationPayload).catch((error) => {
      logger.warn('tiktok', 'Failed to backfill encrypted TikTok partner secrets', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (!partnerSecret || String(partnerSecret).trim() === '') {
    throw new Error(
      'TikTok platform configuration is missing the client secret (partnerSecret). Please re-save the configuration in admin settings.'
    );
  }

  return {
    clientKey: config.partnerApiKey,
    clientSecret: partnerSecret,
    webhookUrl: config.partnerWebhookUrl || '',
    webhookSecret: webhookVerifyToken || undefined,
    apiVersion: TIKTOK_BUSINESS_API_VERSION,
    // Use api_base_url from database if available, otherwise fall back to constant
    apiBaseUrl: (config as any).apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL,
    partnerId: config.partnerId,
    // Use partner_name from database if available, otherwise fall back to publicProfile
    partnerName: (config as any).partnerName || (config.publicProfile as any)?.companyName || undefined,
    logoUrl: (config.publicProfile as any)?.logoUrl || undefined,
    redirectUrl: config.redirectUrl || undefined
  };
}

async function buildApiUrl(path: string): Promise<string> {
  const platformConfig = await getPlatformConfig();
  const baseUrl = platformConfig.apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL;
  return buildTikTokBusinessApiUrl(baseUrl, path);
}





/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  authCode: string
): Promise<TikTokOAuthTokenResponse> {
  try {
    const platformConfig = await getPlatformConfig();

    const clientKey = String(platformConfig.clientKey ?? '').trim();
    const clientSecret = String(platformConfig.clientSecret ?? '').trim();
    const redirectUri = normalizeTikTokOAuthRedirectUri(String(platformConfig.redirectUrl ?? ''));
    if (!clientKey) {
      throw new Error(
        'TikTok platform configuration is missing the Client Key (partnerApiKey). Re-save TikTok settings in admin.'
      );
    }
    if (!redirectUri) {
      throw new Error(
        'TikTok OAuth redirect URL is not configured. Set it in admin TikTok platform configuration; it must match the redirect_uri registered in TikTok and used when authorizing.'
      );
    }

    const body = {
      client_id: clientKey,
      client_secret: clientSecret,
      auth_code: authCode,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };

    logger.info('tiktok', 'Token exchange request (metadata)', {
      client_id: clientKey,
      redirect_uri: redirectUri,
      auth_code: '[redacted]',
      tokenUrl: TIKTOK_BUSINESS_TOKEN_URL,
    });

    const response = await axios.post(TIKTOK_BUSINESS_TOKEN_URL, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      validateStatus: () => true,
    });

    const env = response.data as TikTokOAuthTokenEnvelope;
    const requestId =
      (typeof env.request_id === 'string' && env.request_id) ||
      (typeof response.headers['x-request-id'] === 'string' ? response.headers['x-request-id'] : undefined) ||
      (typeof env.log_id === 'string' ? env.log_id : undefined);

    logger.info('tiktok', 'Token exchange response (metadata)', {
      httpStatus: response.status,
      requestId,
      logId: typeof env.log_id === 'string' ? env.log_id : undefined,
    });

    if (response.status < 200 || response.status >= 300) {
      const oauthFail = extractOAuthFailureFromEnvelope(response.data);
      if (oauthFail) {
        throw new TikTokOAuthRequestError({
          ...oauthFail,
          httpStatus: response.status,
        });
      }
      throw new TikTokOAuthRequestError({
        code: 'HTTP_ERROR',
        description: `Token endpoint returned HTTP ${response.status}`,
        httpStatus: response.status,
      });
    }

    const normalizedResponse = normalizeBusinessTokenResponse(env);
    if (!normalizedResponse.access_token) {
      const oauthFail = extractOAuthFailureFromEnvelope(env);
      if (oauthFail) {
        throw new TikTokOAuthRequestError({ ...oauthFail, httpStatus: response.status });
      }
      logger.error('tiktok', 'Token exchange missing access_token', {
        httpStatus: response.status,
        requestId,
      });
      throw new TikTokOAuthRequestError({
        code: 'INVALID_RESPONSE',
        description: 'Token exchange response missing access_token',
        httpStatus: response.status,
      });
    }

    const partnerCfg = await storage.getPartnerConfiguration('tiktok');
    const portalExpectedScopes = resolveTikTokPartnerOAuthScopes(partnerCfg?.publicProfile);
    const grantedFromResponse = parseTikTokScopeList(normalizedResponse.scope ?? '');
    if (!grantedFromResponse.includes('user.info.basic')) {
      const errorMessage =
        'Required TikTok scope user.info.basic was not granted. Please re-authorize and allow basic profile access.';
      logger.error('tiktok', errorMessage, { grantedScopes: grantedFromResponse });
      throw new Error(errorMessage);
    }
    const optionalMissing = portalExpectedScopes.filter((s) => !grantedFromResponse.includes(s));
    if (optionalMissing.length > 0) {
      logger.warn('tiktok', 'TikTok granted a subset of portal-requested scopes (connection allowed)', {
        optionalMissing,
        grantedScopes: grantedFromResponse,
        portalExpectedScopes,
      });
    }
    const minimizationCheck = validateTikTokGrantedScopes(normalizedResponse.scope ?? '', getCanonicalTikTokScopes());
    if (minimizationCheck.warnings.length > 0) {
      minimizationCheck.warnings.forEach((w) => logger.warn('tiktok', w));
    }

    const refreshExpiresIn = Number(env.data?.refresh_expires_in ?? env.refresh_expires_in ?? NaN);
    logger.info('tiktok', 'Token exchange succeeded (metadata)', {
      httpStatus: response.status,
      requestId,
      grantedScopes: grantedFromResponse,
      expiresInSec: normalizedResponse.expires_in,
      refreshExpiresInSec: Number.isFinite(refreshExpiresIn) ? refreshExpiresIn : undefined,
      timestamp: new Date().toISOString(),
    });

    return normalizedResponse;
  } catch (error) {
    if (error instanceof TikTokOAuthRequestError) {
      logger.error('tiktok', 'Error exchanging authorization code (TikTok OAuth)', {
        code: error.tiktokErrorCode,
        description: error.tiktokErrorDescription,
        logId: error.logId,
        httpStatus: error.httpStatus,
      });
      throw error;
    }
    logger.error(
      'tiktok',
      'Error exchanging authorization code:',
      error instanceof Error ? error.message : error
    );
    throwNormalizedTikTokFailure(error);
  }
}

/**
 * Validate granted OAuth scopes (scope minimization for GDPR)
 * Returns validation result with missing/excess scopes and warnings.
 */
function validateTikTokScopes(scopeString: string, requiredScopes?: string[]) {
  return validateTikTokGrantedScopes(scopeString, getCanonicalTikTokScopes(requiredScopes));
}

const REFRESH_RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

/**
 * Refresh access token using refresh token with retry and rate limit handling
 */
async function refreshAccessToken(
  refreshToken: string,
  mintFlow: TikTokOAuthTokenMintFlow,
  connectionId?: number
): Promise<TikTokOAuthTokenResponse> {
  const attemptLog = (attempt: number, msg: string, meta?: Record<string, unknown>) =>
    tiktokLog(connectionId, 'TokenRefresh', msg, attempt === 0 ? 'INFO' : 'WARN', { attempt, mintFlow, ...meta });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, REFRESH_RETRY_DELAYS[attempt - 1]));
      }
      attemptLog(attempt, `Refresh attempt ${attempt + 1}/3 at ${new Date().toISOString()}`);

      const platformConfig = await getPlatformConfig();

      const clientKey = String(platformConfig.clientKey ?? '').trim();
      const clientSecret = String(platformConfig.clientSecret ?? '').trim();
      if (!clientKey) {
        throw new Error(
          'TikTok platform configuration is missing the Client Key (partnerApiKey). Re-save TikTok settings in admin.'
        );
      }

      const tokenUrl =
        mintFlow === 'business_api_v13' ? TIKTOK_BUSINESS_TOKEN_URL : TIKTOK_OPEN_OAUTH_TOKEN_URL;
      const response =
        mintFlow === 'business_api_v13'
          ? await axios.post(
              tokenUrl,
              {
                client_id: clientKey,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
              },
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
                validateStatus: (status) => status < 500 || status === 429,
              }
            )
          : await axios.post(
              tokenUrl,
              new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
              }).toString(),
              {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000,
                validateStatus: (status) => status < 500 || status === 429,
              }
            );

      const rateLimitReset = response.headers['x-ratelimit-reset'];
      if (response.status === 429 && rateLimitReset) {
        const resetAt = parseInt(rateLimitReset, 10) * 1000;
        const waitMs = Math.max(1000, resetAt - Date.now());
        attemptLog(attempt, `Rate limited; waiting until ${new Date(resetAt).toISOString()} (${waitMs}ms)`);
        await new Promise(r => setTimeout(r, Math.min(waitMs, 60000)));
        continue;
      }
      if (response.status === 429 && !rateLimitReset) {
        const waitMs = REFRESH_RETRY_DELAYS[attempt] ?? 4000;
        attemptLog(attempt, `Rate limited (no reset header); waiting ${waitMs}ms before retry`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (response.status !== 200) {
        const oauthFail = extractOAuthFailureFromEnvelope(response.data);
        if (oauthFail) {
          throw new TikTokOAuthRequestError({
            ...oauthFail,
            httpStatus: response.status,
          });
        }
        throw new TikTokOAuthRequestError({
          code: 'HTTP_ERROR',
          description: `Token endpoint returned HTTP ${response.status}`,
          httpStatus: response.status,
        });
      }

      const normalizedRefresh = normalizeBusinessTokenResponse(response.data as TikTokOAuthTokenEnvelope);
      if (!normalizedRefresh.access_token) {
        throw new Error('Response missing access_token');
      }
      if (!normalizedRefresh.refresh_token) {
        normalizedRefresh.refresh_token = refreshToken;
      }

      attemptLog(attempt, 'Successfully refreshed access token', { connectionId });
      return normalizedRefresh;
    } catch (error: any) {
      const isRetryable = attempt < 2 && (error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT');
      attemptLog(attempt, `Refresh failed: ${error.message}`, { success: false, isRetryable });
      if (!isRetryable) {
        throwNormalizedTikTokFailure(error);
      }
    }
  }
  throw new Error('Token refresh failed after 3 attempts');
}

/**
 * Check if token needs refresh and refresh if necessary (with mutex and fallback)
 */
async function ensureValidToken(connectionId: number): Promise<string> {
  const { connectionData } = await getTikTokConnectionSecrets(connectionId);
  const now = Date.now();
  const state = getConnectionState(connectionId);

  const needsRefresh =
    connectionData.tokenExpiresAt &&
    connectionData.tokenExpiresAt < now + ACTIVITY_THRESHOLDS.TOKEN_REFRESH_BUFFER;

  if (!needsRefresh) {
    return connectionData.accessToken;
  }

  // Mutex: reuse in-flight refresh promise for same connection
  let refreshPromise = refreshLocks.get(connectionId);
  if (refreshPromise) {
    try {
      return await refreshPromise;
    } catch {
      // Fallback: existing token may still work for Business Messaging even if refresh failed
      const bizId = getBusinessIdForMessagingTokenCheck(connectionData);
      const live = bizId
        ? await checkBusinessMessagingTokenLiveness(connectionData.accessToken, bizId)
        : 'inconclusive';
      if (live !== 'invalid') {
        tiktokLog(connectionId, 'EnsureValidToken', 'Used existing token after refresh lock failed', 'INFO');
        return connectionData.accessToken;
      }
      throw new Error('Token refresh failed and existing token invalid');
    }
  }

  state.tokenRefreshInProgress = true;
  const tokenRefreshAttempts = (connectionData.tokenRefreshAttempts ?? 0) + 1;

  refreshPromise = (async (): Promise<string> => {
    try {
      const mintFlow = resolveTikTokOAuthTokenMintFlow(connectionData);
      tiktokLog(connectionId, 'EnsureValidToken', `Token expiring soon (${formatTokenExpiry(connectionData.tokenExpiresAt!)}), refreshing...`, 'INFO');
      const tokenResponse = await refreshAccessToken(connectionData.refreshToken, mintFlow, connectionId);

      const newExpiresAt = now + tokenResponse.expires_in * 1000;
      const refreshedScopeList = parseTikTokScopeList(tokenResponse.scope ?? '');
      const updatedConnectionData: TikTokConnectionData = {
        ...connectionData,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: newExpiresAt,
        lastSyncAt: now,
        tokenRefreshedAt: now,
        tokenRefreshAttempts: 0,
        nextTokenRefreshAt: newExpiresAt - ACTIVITY_THRESHOLDS.TOKEN_REFRESH_BUFFER,
        status: 'active',
        grantedScopes: refreshedScopeList.length > 0 ? refreshedScopeList : connectionData.grantedScopes,
      };

      await storage.updateChannelConnection(connectionId, {
        accessToken: tokenResponse.access_token,
        connectionData: updatedConnectionData
      });

      updateConnectionActivity(connectionId, true);
      state.tokenRefreshInProgress = false;
      refreshLocks.delete(connectionId);

      // 24h refresh count for stats
      const bucket = tokenRefreshCount24h.get(connectionId);
      const resetAt = bucket && bucket.resetAt > now ? bucket.resetAt : now + 86400000;
      if (!bucket || bucket.resetAt <= now) {
        tokenRefreshCount24h.set(connectionId, { count: 1, resetAt });
      } else {
        bucket.count++;
      }

      emitTikTokEvent('tokenRefreshed', {
        connectionId,
        oldExpiresAt: connectionData.tokenExpiresAt,
        newExpiresAt
      });
      eventEmitter.emit('tokenRefreshCompleted', {
        connectionId,
        oldExpiresAt: connectionData.tokenExpiresAt,
        newExpiresAt
      });
      tiktokLog(connectionId, 'TokenRefresh', `Token refreshed successfully; ${formatTokenExpiry(newExpiresAt)}`, 'INFO');
      scheduleProactiveTokenRefresh(connectionId);

      // Verify scopes and region after refresh (user.info.basic required; portal list is advisory).
      try {
        const partnerCfg = await storage.getPartnerConfiguration('tiktok');
        const portalScopes = resolveTikTokPartnerOAuthScopes(partnerCfg?.publicProfile);
        const tokenScope = parseTikTokScopeList(tokenResponse.scope ?? '');
        if (!tokenScope.includes('user.info.basic')) {
          tiktokLog(
            connectionId,
            'TokenRefresh',
            'Refreshed token missing required scope user.info.basic',
            'ERROR',
            { grantedScopes: tokenScope }
          );
        } else {
          const optionalMissing = portalScopes.filter((s) => !tokenScope.includes(s));
          if (optionalMissing.length > 0) {
            logger.warn('tiktok', 'Post-refresh: granted scopes are a subset of portal config', {
              connectionId,
              optionalMissing,
              grantedScopes: tokenScope,
            });
          }
        }
        if (tokenScope.length > 0) {
          eventEmitter.emit('scopesChanged', { connectionId, grantedScopes: tokenScope });
        }
        const regionResult = await detectRegionRestrictions(
          tokenResponse.access_token,
          resolveBusinessMessagingBusinessId(updatedConnectionData)
        );
        const conn2 = await storage.getChannelConnection(connectionId);
        if (conn2?.connectionData && typeof conn2.connectionData === 'object') {
          const data = conn2.connectionData as Record<string, unknown>;
          const prevRestricted = (data.regionRestricted as boolean) ?? false;
          if (regionResult.regionRestricted !== prevRestricted || (regionResult.restrictedFeatures?.length ?? 0) > 0) {
            await storage.updateChannelConnection(connectionId, {
              connectionData: {
                ...data,
                regionRestricted: regionResult.regionRestricted,
                restrictedFeatures: regionResult.restrictedFeatures,
                regionCode: regionResult.regionCode
              } as TikTokConnectionData
            }).catch(() => {});
            eventEmitter.emit('regionRestrictionsChanged', {
              connectionId,
              regionRestricted: regionResult.regionRestricted,
              restrictedFeatures: regionResult.restrictedFeatures
            });
          }
        }
      } catch (scopeErr) {
        tiktokLog(connectionId, 'TokenRefresh', `Scope/region check after refresh failed: ${scopeErr instanceof Error ? scopeErr.message : 'Unknown'}`, 'DEBUG');
      }
      return tokenResponse.access_token;
    } catch (error) {
      state.tokenRefreshInProgress = false;
      refreshLocks.delete(connectionId);
      tiktokLog(connectionId, 'TokenRefresh', `Refresh failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
      const conn = await storage.getChannelConnection(connectionId);
      if (conn?.connectionData && typeof conn.connectionData === 'object') {
        const data = { ...(conn.connectionData as Record<string, unknown>), tokenRefreshAttempts };
        await storage.updateChannelConnection(connectionId, { connectionData: data as TikTokConnectionData }).catch(() => {});
      }
      const bizId = getBusinessIdForMessagingTokenCheck(connectionData);
      const live = bizId
        ? await checkBusinessMessagingTokenLiveness(connectionData.accessToken, bizId)
        : 'inconclusive';
      if (live !== 'invalid') {
        tiktokLog(connectionId, 'EnsureValidToken', 'Used existing token after refresh failure', 'WARN');
        return connectionData.accessToken;
      }
      await handleTokenExpiration(connectionId);
      throw error;
    }
  })();

  refreshLocks.set(connectionId, refreshPromise);
  return refreshPromise;
}





/**
 * Get TikTok user information
 */
async function getUserInfo(accessToken: string, grantedScopes?: string[] | null): Promise<TikTokUserInfo> {
  try {
    const user = await getV2UserInfo(accessToken, grantedScopes);

    logger.debug('tiktok', 'Successfully retrieved user info');
    const openId = String(user.open_id ?? '').trim();
    return {
      open_id: openId,
      union_id: user.union_id != null ? String(user.union_id) : undefined,
      avatar_url: user.avatar_url != null ? String(user.avatar_url) : undefined,
      avatar_url_100: user.avatar_url_100 != null ? String(user.avatar_url_100) : undefined,
      avatar_large_url: user.avatar_large_url != null ? String(user.avatar_large_url) : undefined,
      display_name: String(user.display_name ?? 'TikTok Business'),
      bio_description: user.bio_description != null ? String(user.bio_description) : undefined,
      profile_deep_link: user.profile_deep_link != null ? String(user.profile_deep_link) : undefined,
      is_verified: typeof user.is_verified === 'boolean' ? user.is_verified : undefined,
      username: user.username != null ? String(user.username) : undefined,
      follower_count: typeof user.follower_count === 'number' ? user.follower_count : undefined,
      following_count: typeof user.following_count === 'number' ? user.following_count : undefined,
      likes_count: typeof user.likes_count === 'number' ? user.likes_count : undefined,
      video_count: typeof user.video_count === 'number' ? user.video_count : undefined,
    };
  } catch (error) {
    logger.error('tiktok', 'Error getting user info:', error);
    throw handleTikTokError(error);
  }
}

/**
 * Get sender (conversation participant) user info by user ID for Business Messaging API.
 * Uses Business API user endpoint when available; returns undefined if not supported or on error.
 */
async function getSenderUserInfo(accessToken: string, userId: string): Promise<TikTokUserInfo | undefined> {
  try {
    const response = await axios.get(await buildApiUrl('/business/user/info/'), {
      params: { user_id: userId },
      headers: buildBusinessApiHeaders(accessToken),
      timeout: 10000,
      validateStatus: (status) => status < 500,
    });
    if (response.status === 200 && response.data?.data?.user) {
      return response.data.data.user as TikTokUserInfo;
    }
    return undefined;
  } catch (error) {
    logger.debug('tiktok', 'getSenderUserInfo failed (API may not support user_id lookup)', { userId });
    return undefined;
  }
}

async function fetchBusinessMessagingConversationListProbe(
  accessToken: string,
  businessId: string
): Promise<{ httpStatus: number; data: unknown }> {
  const bid = businessId.trim();
  if (!bid) {
    throw new Error('missing business_id');
  }
  const response = await axios.get(await buildApiUrl('/business/message/conversation/list'), {
    params: { business_id: bid, limit: '1' },
    headers: buildBusinessApiHeaders(accessToken),
    timeout: 10000,
    validateStatus: () => true,
  });
  return { httpStatus: response.status, data: response.data };
}

function parseTikTokBusinessProbeEnvelope(data: unknown): {
  topCode?: number;
  message?: string;
  nestedCode: string;
} {
  const d = data as Record<string, unknown> | null | undefined;
  const topCode = typeof d?.code === 'number' ? d.code : undefined;
  const message = typeof d?.message === 'string' ? d.message : undefined;
  const err = d?.error;
  let nestedCode = '';
  if (err && typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code != null) {
    nestedCode = String((err as { code?: unknown }).code);
  }
  return { topCode, message, nestedCode };
}

function normalizeTikTokApiCodeKey(code: string): string {
  return code.trim().toLowerCase().replace(/-/g, '_');
}

function isExplicitMessagingNotEligibleCode(code: string): boolean {
  if (!code) return false;
  const c = normalizeTikTokApiCodeKey(code);
  const explicit = new Set([
    normalizeTikTokApiCodeKey(TikTokErrorCode.BUSINESS_ACCOUNT_REQUIRED),
    normalizeTikTokApiCodeKey(TikTokErrorCode.PARTNER_ACCESS_REQUIRED),
    normalizeTikTokApiCodeKey(TikTokErrorCode.INSUFFICIENT_PERMISSIONS),
    'business_account_required',
    'partner_access_required',
    'insufficient_permissions',
    'invalid_permissions',
    'account_type_not_supported',
    'not_a_business_account',
  ]);
  return explicit.has(c);
}

/**
 * Token liveness for active messaging connections: uses the same Business Messaging list endpoint as the real flow.
 * Does not treat open.tiktokapis.com availability as authoritative.
 */
async function checkBusinessMessagingTokenLiveness(
  accessToken: string,
  businessId: string
): Promise<'valid' | 'invalid' | 'inconclusive'> {
  const bid = businessId.trim();
  if (!bid) return 'inconclusive';
  try {
    const { httpStatus, data } = await fetchBusinessMessagingConversationListProbe(accessToken, bid);
    const parsed = parseTikTokBusinessProbeEnvelope(data);
    const nc = normalizeTikTokApiCodeKey(parsed.nestedCode);

    if (httpStatus === 429 || httpStatus >= 500) return 'inconclusive';
    if (httpStatus === 401) return 'invalid';

    if (
      nc === normalizeTikTokApiCodeKey(TikTokErrorCode.INVALID_TOKEN) ||
      nc === 'invalid_token' ||
      nc === 'access_token_invalid' ||
      nc === normalizeTikTokApiCodeKey(TikTokErrorCode.TOKEN_EXPIRED) ||
      nc === 'token_expired'
    ) {
      return 'invalid';
    }

    if (httpStatus === 200) {
      if (parsed.topCode !== undefined && parsed.topCode !== 0) {
        if (
          nc.includes('token') &&
          (nc.includes('invalid') || nc.includes('expired'))
        ) {
          return 'invalid';
        }
        return 'valid';
      }
      return 'valid';
    }

    if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 401) {
      if (
        nc === normalizeTikTokApiCodeKey(TikTokErrorCode.INVALID_TOKEN) ||
        nc === 'invalid_token' ||
        nc === 'access_token_invalid' ||
        nc === normalizeTikTokApiCodeKey(TikTokErrorCode.TOKEN_EXPIRED) ||
        nc === 'token_expired'
      ) {
        return 'invalid';
      }
      return 'valid';
    }

    return 'inconclusive';
  } catch {
    return 'inconclusive';
  }
}

/**
 * Probes Business Messaging as `business_id` (conversation list). Distinguishes explicit eligibility failures from transient errors.
 */
async function probeTikTokBusinessMessagingEligibility(
  accessToken: string,
  businessId: string
): Promise<TikTokMessagingEligibilityProbeResult> {
  const bid = businessId.trim();
  if (!bid) {
    return { status: 'not_eligible', message: 'missing business_id' };
  }
  try {
    const { httpStatus, data } = await fetchBusinessMessagingConversationListProbe(accessToken, bid);
    const parsed = parseTikTokBusinessProbeEnvelope(data);

    if (httpStatus === 429 || httpStatus >= 500) {
      logger.debug('tiktok', 'Business Messaging eligibility probe: retryable HTTP', {
        status: httpStatus,
        nestedCode: parsed.nestedCode,
      });
      return {
        status: 'retryable',
        httpStatus,
        message: `TikTok Business API temporarily unavailable (HTTP ${httpStatus}). Please try again.`,
      };
    }

    if (httpStatus === 401) {
      logger.debug('tiktok', 'Business Messaging eligibility probe: HTTP 401 (treated as retryable for OAuth)', {
        nestedCode: parsed.nestedCode,
      });
      return {
        status: 'retryable',
        httpStatus: 401,
        message:
          'Could not verify TikTok Business Messaging access (authorization). Please try connecting again in a moment.',
      };
    }

    if (httpStatus === 200) {
      if (parsed.topCode !== undefined && parsed.topCode !== 0) {
        logger.debug('tiktok', 'Business Messaging eligibility probe: non-zero business API code', {
          code: parsed.topCode,
          message: parsed.message,
          nestedCode: parsed.nestedCode,
        });
        if (parsed.nestedCode && isExplicitMessagingNotEligibleCode(parsed.nestedCode)) {
          return {
            status: 'not_eligible',
            httpStatus: 200,
            apiCode: parsed.nestedCode,
            message: parsed.message,
          };
        }
        return {
          status: 'not_eligible',
          httpStatus: 200,
          apiCode: String(parsed.topCode),
          message: parsed.message,
        };
      }
      return { status: 'eligible' };
    }

    if (parsed.nestedCode && isExplicitMessagingNotEligibleCode(parsed.nestedCode)) {
      logger.debug('tiktok', 'Business Messaging eligibility probe: explicit not-eligible code', {
        status: httpStatus,
        nestedCode: parsed.nestedCode,
      });
      return {
        status: 'not_eligible',
        httpStatus,
        apiCode: parsed.nestedCode,
        message: parsed.message,
      };
    }

    logger.debug('tiktok', 'Business Messaging eligibility probe: inconclusive / transient HTTP', {
      status: httpStatus,
      nestedCode: parsed.nestedCode,
      message: parsed.message,
    });
    return {
      status: 'retryable',
      httpStatus,
      message:
        parsed.message ||
        `Could not verify TikTok Business Messaging access (HTTP ${httpStatus}). Please try again.`,
    };
  } catch (err) {
    logger.warn(
      'tiktok',
      'Business Messaging eligibility probe failed (retryable)',
      err instanceof Error ? err.message : String(err)
    );
    return {
      status: 'retryable',
      message:
        err instanceof Error
          ? err.message
          : 'Messaging eligibility check failed. Please try again.',
    };
  }
}

/**
 * Verify TikTok account is eligible for Business Messaging (not merely Login Kit profile access).
 * Uses v2 user info for open_id when available; Messaging API probe is authoritative for business eligibility.
 */
async function verifyBusinessAccount(
  accessToken: string,
  grantedScopes?: string[] | null
): Promise<TikTokBusinessAccountVerificationResult> {
  let user: Record<string, unknown>;
  try {
    user = await getV2UserInfo(accessToken, grantedScopes);
  } catch (error: any) {
    const st = error?.response?.status as number | undefined;
    const retryableHttp =
      st === 429 ||
      (typeof st === 'number' && st >= 500) ||
      st == null ||
      error?.code === 'ECONNRESET' ||
      error?.code === 'ETIMEDOUT';
    if (retryableHttp) {
      logger.warn('tiktok', 'Business Account verification: v2 profile unreachable (retryable)', {
        httpStatus: st,
      });
      return {
        outcome: 'retryable',
        message:
          'Could not reach TikTok to verify your profile. Please try connecting again in a moment.',
      };
    }
    const errorCode = error?.response?.data?.error?.code;
    if (
      errorCode === TikTokErrorCode.BUSINESS_ACCOUNT_REQUIRED ||
      errorCode === TikTokErrorCode.INSUFFICIENT_PERMISSIONS ||
      errorCode === 'BUSINESS_ACCOUNT_REQUIRED' ||
      errorCode === 'INSUFFICIENT_PERMISSIONS'
    ) {
      logger.warn('tiktok', 'Business Account verification failed (v2 profile):', errorCode);
      return { outcome: 'not_business', message: String(errorCode) };
    }
    logger.warn('tiktok', 'Business Account verification: v2 profile error (retryable)', {
      httpStatus: st,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      outcome: 'retryable',
      message:
        'Could not verify your TikTok profile. Please try connecting again.',
    };
  }

  const openId = String(user.open_id ?? '').trim();
  if (!openId) {
    logger.warn('tiktok', 'Business Account verification returned no open_id');
    return { outcome: 'not_business', message: 'missing open_id' };
  }

  const probe = await probeTikTokBusinessMessagingEligibility(accessToken, openId);
  if (probe.status === 'eligible') {
    logger.info('tiktok', 'Business Account verified (Messaging API probe succeeded)', {
      businessAccountId: openId,
    });
    return { outcome: 'verified', businessAccountId: openId };
  }
  if (probe.status === 'retryable') {
    logger.warn('tiktok', 'Business Messaging probe inconclusive (retryable)', { openId, message: probe.message });
    return { outcome: 'retryable', message: probe.message };
  }
  logger.warn('tiktok', 'Business Messaging probe: account not messaging-eligible', {
    openId,
    apiCode: probe.apiCode,
    message: probe.message,
  });
  return { outcome: 'not_business', message: probe.message };
}

/**
 * Detect region restrictions for TikTok Business Messaging API
 * EEA/UK/CH regions have restricted messaging features
 */
async function detectRegionRestrictions(
  accessToken: string,
  businessId?: string
): Promise<{
  regionRestricted: boolean;
  restrictedFeatures: string[];
  regionCode?: string;
}> {
  const EEA_UK_RESTRICTED_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 
    'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 
    'SE', 'GB', 'CH'
  ]; // EEA + UK + Switzerland

  let detectedRegionCode: string | undefined;
  let regionRestricted = false;
  let restrictedFeatures: string[] = [];

  try {
    // v2 user info does not include region fields; Strategy 2 (conversation list) handles region detection.

    // Strategy 2: Infer region from Business Messaging API conversation list response
    // This endpoint will return region-specific errors for restricted regions
    const businessIdForRegion = businessId;
    const conversationsResponse = await axios.get(await buildApiUrl('/business/message/conversation/list'), {
      ...(businessIdForRegion
        ? { params: { business_id: businessIdForRegion, limit: '1' } }
        : {}),
      headers: buildBusinessApiHeaders(accessToken),
      timeout: 10000,
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });

    if (conversationsResponse.status === 200) {
      // Success - no region restrictions detected
      logger.debug('tiktok', 'Region check passed - messaging features available');
      
      // If we have a region code, check if it's restricted even though API call succeeded
      // (some regions might have partial access)
      if (detectedRegionCode) {
        regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
        if (regionRestricted) {
          restrictedFeatures = ['messaging', 'conversations'];
          logger.warn('tiktok', `Region ${detectedRegionCode} is in restricted list, but API call succeeded. Marking as restricted.`);
        }
      }
      
      return {
        regionRestricted,
        restrictedFeatures,
        regionCode: detectedRegionCode
      };
    } else {
      // Check for region-specific error codes/messages
      const errorCode = conversationsResponse.data?.error?.code;
      const errorMessage = conversationsResponse.data?.error?.message || '';
      
      // Try to extract region code from error message
      if (!detectedRegionCode && errorMessage) {
        // Look for ISO country codes in error message (e.g., "not available in GB", "region: FR")
        const regionMatch = errorMessage.match(/\b([A-Z]{2})\b/);
        if (regionMatch) {
          detectedRegionCode = regionMatch[1];
        }
      }
      
      if (
        errorCode === 'REGION_NOT_SUPPORTED' ||
        errorCode === 'SERVICE_UNAVAILABLE_IN_REGION' ||
        errorMessage.toLowerCase().includes('not available in your region') ||
        errorMessage.toLowerCase().includes('eea') ||
        errorMessage.toLowerCase().includes('european')
      ) {
        // If we detected a region code, verify it's in restricted list
        // Otherwise, assume restricted based on error
        if (detectedRegionCode) {
          regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
        } else {
          // Error indicates restriction but no specific region code found
          regionRestricted = true;
        }
        
        if (regionRestricted) {
          restrictedFeatures = ['messaging', 'conversations'];
          logger.warn('tiktok', `Region restriction detected: ${errorCode || errorMessage}`, { regionCode: detectedRegionCode });
        }
        
        return {
          regionRestricted,
          restrictedFeatures,
          regionCode: detectedRegionCode
        };
      }
      
      // Other errors (e.g., permissions) don't indicate region restriction
      // But if we have a region code, check it anyway
      if (detectedRegionCode) {
        regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
        if (regionRestricted) {
          restrictedFeatures = ['messaging', 'conversations'];
        }
      }
      
      return {
        regionRestricted,
        restrictedFeatures,
        regionCode: detectedRegionCode
      };
    }
  } catch (error: any) {
    // Check error response for region-specific indicators
    const errorCode = error.response?.data?.error?.code;
    const errorMessage = error.response?.data?.error?.message || '';
    
    // Try to extract region code from error message
    if (!detectedRegionCode && errorMessage) {
      const regionMatch = errorMessage.match(/\b([A-Z]{2})\b/);
      if (regionMatch) {
        detectedRegionCode = regionMatch[1];
      }
    }
    
    if (
      errorCode === 'REGION_NOT_SUPPORTED' ||
      errorCode === 'SERVICE_UNAVAILABLE_IN_REGION' ||
      errorMessage.toLowerCase().includes('not available in your region') ||
      errorMessage.toLowerCase().includes('eea') ||
      errorMessage.toLowerCase().includes('european')
    ) {
      // If we detected a region code, verify it's in restricted list
      if (detectedRegionCode) {
        regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
      } else {
        regionRestricted = true;
      }
      
      if (regionRestricted) {
        restrictedFeatures = ['messaging', 'conversations'];
      }
      
      logger.warn('tiktok', 'Region restriction detected from error:', errorCode || errorMessage, { regionCode: detectedRegionCode });
      return {
        regionRestricted,
        restrictedFeatures,
        regionCode: detectedRegionCode
      };
    }
    
    // If we have a detected region code, check it against restricted list
    if (detectedRegionCode) {
      regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
      if (regionRestricted) {
        restrictedFeatures = ['messaging', 'conversations'];
        logger.warn('tiktok', `Detected region ${detectedRegionCode} is in restricted list`);
      }
    }
    
    // Network errors or other exceptions - return detected region code if available
    logger.debug('tiktok', 'Region check inconclusive', { regionCode: detectedRegionCode, regionRestricted });
    return {
      regionRestricted,
      restrictedFeatures,
      regionCode: detectedRegionCode
    };
  }
}





/**
 * Start health monitoring for a connection
 */
function startHealthMonitoring(connectionId: number) {
  stopHealthMonitoring(connectionId);

  (async () => {
    try {
      const { connectionData } = await getTikTokConnectionSecrets(connectionId);
      if (!connectionData?.accessToken?.trim() || !connectionData?.refreshToken?.trim()) {
        tiktokLog(connectionId, 'HealthMonitor', 'Missing accessToken or refreshToken, skipping monitoring', 'WARN');
        return;
      }
    } catch {
      tiktokLog(connectionId, 'HealthMonitor', 'Connection not found, skipping monitoring', 'WARN');
      return;
    }
  })().then(() => {
    let healthCheckCount = 0;
    const performHealthCheck = async () => {
      try {
        const { connectionData } = await getTikTokConnectionSecrets(connectionId);
        const state = getConnectionState(connectionId);
        const timeSinceValidation = state.lastSuccessfulValidation
          ? Date.now() - state.lastSuccessfulValidation.getTime()
          : Infinity;

        if (timeSinceValidation > ACTIVITY_THRESHOLDS.TOKEN_VALIDATION_INTERVAL) {
          const start = Date.now();
          const valid = await validateTokenHealth(connectionId);
          const duration = Date.now() - start;
          if (valid) {
            eventEmitter.emit('healthCheckCompleted', { connectionId, duration });
            const fresh = await storage.getChannelConnection(connectionId);
            if (fresh?.connectionData && typeof fresh.connectionData === 'object') {
              const data = fresh.connectionData as Record<string, unknown>;
              const hcCount = ((data.healthCheckCount as number) ?? 0) + 1;
              const lastHealthCheckAt = Date.now();
              const payload: Record<string, unknown> = { ...data, lastHealthCheckAt };
              if (hcCount % 10 === 0) payload.healthCheckCount = hcCount;
              await storage.updateChannelConnection(connectionId, { connectionData: payload as unknown as TikTokConnectionData }).catch(() => {});
            }
          }
        }

        await ensureValidToken(connectionId);

        if (!state.isActive) {
          state.isActive = true;
          const updated = await storage.updateChannelConnectionStatus(connectionId, 'active');
          emitTikTokEvent('connectionStatusUpdate', { connectionId, status: 'active' });
          if (updated) {
            broadcastTikTokEvent('connectionStatusUpdate', {
              connectionId,
              status: 'active',
              connection: updated
            }, { companyId: updated.companyId, priority: 'normal' });
          }
          tiktokLog(connectionId, 'HealthMonitor', 'Connection marked as active', 'INFO');
        }

        healthCheckCount++;
        if (healthCheckCount % HEALTH_CHECK_HEARTBEAT_INTERVAL === 0) {
          tiktokLog(connectionId, 'HealthMonitor', `Heartbeat: ${healthCheckCount} checks completed`, 'DEBUG');
        }

        const nextInterval = getAdaptiveHealthCheckInterval(state, connectionData?.tokenExpiresAt);
        const timeout = setTimeout(performHealthCheck, nextInterval);
        healthMonitoringIntervals.set(connectionId, timeout);

        const totalIntervals = healthMonitoringIntervals.size;
        if (totalIntervals > 500) {
          tiktokLog(undefined, 'HealthMonitor', `Warning: ${totalIntervals} monitoring intervals active (possible leak)`, 'WARN');
        }
      } catch (error) {
        eventEmitter.emit('healthCheckFailed', {
          connectionId,
          error: error instanceof Error ? error.message : String(error)
        });
        tiktokLog(connectionId, 'HealthMonitor', `Health check error: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
        updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Health check failed');
        const timeout = setTimeout(performHealthCheck, HEALTH_CHECK_INTERVALS.ERROR);
        healthMonitoringIntervals.set(connectionId, timeout);
      }
    };
    performHealthCheck();
  });
}

/**
 * Stop health monitoring for a connection
 */
function stopHealthMonitoring(connectionId: number) {
  const interval = healthMonitoringIntervals.get(connectionId);
  if (interval) {
    clearTimeout(interval);
    healthMonitoringIntervals.delete(connectionId);
  }
  const recoveryTimeout = recoveryTimeouts.get(connectionId);
  if (recoveryTimeout) {
    clearTimeout(recoveryTimeout);
    recoveryTimeouts.delete(connectionId);
  }
  const proactiveTimeout = proactiveRefreshTimeouts.get(connectionId);
  if (proactiveTimeout) {
    clearTimeout(proactiveTimeout);
    proactiveRefreshTimeouts.delete(connectionId);
  }
}

/**
 * Validate token health by making a test API call (with cache and timeout)
 */
async function validateTokenHealth(connectionId: number): Promise<boolean> {
  const state = getConnectionState(connectionId);
  try {
    const { connectionData } = await getTikTokConnectionSecrets(connectionId);
    if (!connectionData) return false;
    const accessToken = connectionData.accessToken;
    if (!accessToken) return false;

    const cached = userInfoValidationCache.get(connectionId);
    const now = Date.now();
    if (cached && (now - cached.cachedAt) < ACTIVITY_THRESHOLDS.USER_INFO_CACHE_MS) {
      updateConnectionActivity(connectionId, true);
      state.consecutiveValidationFailures = 0;
      return true;
    }

    let businessId: string;
    try {
      businessId = resolveBusinessMessagingBusinessId(connectionData);
    } catch {
      businessId = getBusinessIdForMessagingTokenCheck(connectionData);
      if (!businessId) return false;
    }

    const timeoutMs = ACTIVITY_THRESHOLDS.VALIDATION_TIMEOUT_MS;
    const liveness = await Promise.race([
      checkBusinessMessagingTokenLiveness(accessToken, businessId),
      new Promise<'inconclusive'>((resolve) => setTimeout(() => resolve('inconclusive'), timeoutMs)),
    ]);

    if (liveness === 'invalid') {
      state.consecutiveValidationFailures = (state.consecutiveValidationFailures ?? 0) + 1;
      eventEmitter.emit('healthCheckFailed', {
        connectionId,
        error: 'Business API reported invalid or expired token',
        consecutiveFailures: state.consecutiveValidationFailures,
      });
      tiktokLog(connectionId, 'ValidateToken', 'Token invalid per Business API', 'WARN');
      await handleTokenExpiration(connectionId);
      return false;
    }

    if (liveness === 'inconclusive') {
      tiktokLog(connectionId, 'ValidateToken', 'Soft failure (timeout or inconclusive), will retry next interval', 'DEBUG');
      return false;
    }

    const minimalUserInfo: TikTokUserInfo = {
      open_id: connectionData.accountId,
      display_name: connectionData.accountName || 'TikTok',
      ...(connectionData.accountHandle ? { username: connectionData.accountHandle } : {}),
      ...(connectionData.avatarUrl ? { avatar_url: connectionData.avatarUrl } : {}),
    };
    userInfoValidationCache.set(connectionId, { userInfo: minimalUserInfo, cachedAt: now });
    updateConnectionActivity(connectionId, true);
    state.consecutiveValidationFailures = 0;
    tiktokLog(connectionId, 'ValidateToken', 'Token validation successful (Business Messaging API)', 'DEBUG');
    return true;
  } catch (error: any) {
    state.consecutiveValidationFailures = (state.consecutiveValidationFailures ?? 0) + 1;
    eventEmitter.emit('healthCheckFailed', {
      connectionId,
      error: error.message,
      consecutiveFailures: state.consecutiveValidationFailures,
    });
    tiktokLog(connectionId, 'ValidateToken', `Validation failed: ${error.message}`, 'WARN');
    updateConnectionActivity(connectionId, false, error.message);
    return false;
  }
}

/**
 * Handle token expiration: attempt one final refresh before marking error; notify tenant
 */
async function handleTokenExpiration(connectionId: number): Promise<void> {
  try {
    const { connection, connectionData } = await getTikTokConnectionSecrets(connectionId);

    try {
      const mintFlow = resolveTikTokOAuthTokenMintFlow(connectionData);
      const tokenResponse = await refreshAccessToken(connectionData.refreshToken, mintFlow, connectionId);
      const now = Date.now();
      const newExpiresAt = now + tokenResponse.expires_in * 1000;
      const updatedData: TikTokConnectionData = {
        ...connectionData,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: newExpiresAt,
        lastSyncAt: now,
        tokenRefreshedAt: now,
        tokenRefreshAttempts: 0,
        status: 'active',
        lastError: undefined,
      };
      await storage.updateChannelConnection(connectionId, {
        accessToken: tokenResponse.access_token,
        connectionData: updatedData
      });
      await storage.updateChannelConnectionStatus(connectionId, 'active');
      const state = getConnectionState(connectionId);
      state.isActive = true;
      state.lastError = null;
      emitTikTokEvent('tokenRecovered', { connectionId });
      eventEmitter.emit('tokenRecovered', { connectionId });
      broadcastTikTokEvent('connectionStatusUpdate', {
        connectionId,
        status: 'active',
        connection: await storage.getChannelConnection(connectionId)
      }, { companyId: connection.companyId, priority: 'high' });
      tiktokLog(connectionId, 'TokenExpiration', 'Recovered via final refresh', 'INFO');
      return;
    } catch (refreshErr: any) {
      const isRefreshInvalid =
        refreshErr?.response?.status === 400 ||
        refreshErr?.response?.data?.error?.code === 'invalid_refresh_token' ||
        /refresh.*invalid|expired/i.test(refreshErr?.message || '');
      const reason = isRefreshInvalid ? 'REFRESH_TOKEN_INVALID' : 'TOKEN_EXPIRED';
      const lastErrorMsg = reason === 'REFRESH_TOKEN_INVALID'
        ? 'Refresh token invalid or revoked; re-authentication required'
        : 'Access token expired or invalid';
      const conn = await storage.updateChannelConnectionStatus(connectionId, 'error');
      const state = getConnectionState(connectionId);
      state.lastError = lastErrorMsg;
      state.isActive = false;
      await storage.updateChannelConnection(connectionId, {
        connectionData: { ...connectionData, lastError: reason },
      }).catch(() => {});

      emitTikTokEvent('connectionError', {
        connectionId,
        error: lastErrorMsg,
        requiresReauth: true,
        reason
      });
      if (conn) {
        broadcastTikTokEvent('connectionError', {
          connectionId,
          status: 'error',
          error: lastErrorMsg,
          requiresReauth: true,
          connection: conn
        }, { companyId: conn.companyId, priority: 'high' });
      }
      tiktokLog(connectionId, 'TokenExpiration', lastErrorMsg, 'ERROR', { reason });
    }
  } catch (error) {
    tiktokLog(connectionId, 'TokenExpiration', `Error handling expiration: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
  }
}

/**
 * Initiate connection recovery with stages and error-type strategies
 */
async function initiateConnectionRecovery(connectionId: number, lastErrorStatus?: number): Promise<void> {
  const state = getConnectionState(connectionId);

  if (state.isRecovering) return;

  if (state.recoveryAttempts >= ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
    tiktokLog(connectionId, 'Recovery', 'Max recovery attempts reached', 'ERROR');
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    eventEmitter.emit('recoveryFailed', { connectionId, reason: 'max_attempts' });
    return;
  }

  const recoveryStartedAt = Date.now();
  state.isRecovering = true;
  state.recoveryAttempts++;
  state.lastRecoveryAttempt = new Date();
  state.recoveryStage = 'validating';
  eventEmitter.emit('recoveryStarted', { connectionId, attempt: state.recoveryAttempts });
  tiktokLog(connectionId, 'Recovery', `Starting recovery (attempt ${state.recoveryAttempts})`, 'INFO');

  let backoffDelay = ACTIVITY_THRESHOLDS.RECOVERY_BACKOFF_BASE * Math.pow(2, state.recoveryAttempts - 1);
  if (lastErrorStatus === 401 || lastErrorStatus === 403) {
    backoffDelay = 0;
  } else if (lastErrorStatus === 429) {
    backoffDelay = Math.max(backoffDelay, 60000);
  }

  const recoveryTimeout = setTimeout(async () => {
    try {
      if (Date.now() - recoveryStartedAt > ACTIVITY_THRESHOLDS.MAX_RECOVERY_TIME_MS) {
        state.isRecovering = false;
        state.recoveryStage = null;
        tiktokLog(connectionId, 'Recovery', 'Recovery time limit (30 min) exceeded', 'ERROR');
        await storage.updateChannelConnectionStatus(connectionId, 'error');
        eventEmitter.emit('recoveryFailed', { connectionId, reason: 'timeout' });
        recoveryTimeouts.delete(connectionId);
        return;
      }

      state.recoveryStage = 'refreshing_token';
      eventEmitter.emit('recoveryProgress', { connectionId, stage: 'refreshing_token' });
      await ensureValidToken(connectionId);

      state.recoveryStage = 'testing_connection';
      eventEmitter.emit('recoveryProgress', { connectionId, stage: 'testing_connection' });
      const isValid = await validateTokenHealth(connectionId);

      if (isValid) {
        state.recoveryStage = 'recovered';
        state.isRecovering = false;
        state.recoveryStage = null;
        eventEmitter.emit('recoverySucceeded', { connectionId });
        updateConnectionActivity(connectionId, true);
        recoveryTimeouts.delete(connectionId);
        tiktokLog(connectionId, 'Recovery', 'Recovered successfully', 'INFO');
      } else {
        eventEmitter.emit('recoveryProgress', { connectionId, stage: 'validating' });
        updateConnectionActivity(connectionId, false, 'Recovery validation failed');
        recoveryTimeouts.delete(connectionId);
        state.isRecovering = false;
        state.recoveryStage = null;
        initiateConnectionRecovery(connectionId);
      }
    } catch (error) {
      tiktokLog(connectionId, 'Recovery', `Recovery error: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
      updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Recovery failed');
      recoveryTimeouts.delete(connectionId);
      state.isRecovering = false;
      state.recoveryStage = null;
      eventEmitter.emit('recoveryFailed', { connectionId, reason: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }, backoffDelay);

  recoveryTimeouts.set(connectionId, recoveryTimeout);
}

/**
 * Get health monitoring statistics for admin dashboards
 */
function getHealthMonitoringStats(): {
  totalMonitored: number;
  byStatus: Record<string, number>;
  averageIntervalMs: number;
  tokenRefreshesLast24h: number;
  connectionIds: number[];
} {
  const connectionIds = Array.from(healthMonitoringIntervals.keys());
  const totalMonitored = connectionIds.length;
  const byStatus: Record<string, number> = {};
  let tokenRefreshesLast24h = 0;
  const now = Date.now();
  for (const cid of connectionIds) {
    const state = connectionStates.get(cid);
    const status = state?.isActive ? 'active' : (state?.isRecovering ? 'recovering' : 'error');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const bucket = tokenRefreshCount24h.get(cid);
    if (bucket && bucket.resetAt > now) tokenRefreshesLast24h += bucket.count;
  }
  const intervals = [HEALTH_CHECK_INTERVALS.ACTIVE, HEALTH_CHECK_INTERVALS.ERROR, HEALTH_CHECK_INTERVALS.RECOVERY, HEALTH_CHECK_INTERVALS.TOKEN_EXPIRING];
  const averageIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return {
    totalMonitored,
    byStatus,
    averageIntervalMs,
    tokenRefreshesLast24h,
    connectionIds
  };
}

let dailySummaryScheduled = false;
function scheduleDailySummary(): void {
  if (dailySummaryScheduled) return;
  dailySummaryScheduled = true;
  const run = () => {
    const stats = getHealthMonitoringStats();
    tiktokLog(undefined, 'Summary', `TikTok Health Monitoring Summary: ${stats.totalMonitored} connections active, ${stats.tokenRefreshesLast24h} tokens refreshed (24h), errors by status: ${JSON.stringify(stats.byStatus)}`, 'INFO');
  };
  const nextMidnight = new Date();
  nextMidnight.setUTCHours(24, 0, 0, 0);
  setTimeout(() => { run(); setInterval(run, 86400000); }, nextMidnight.getTime() - Date.now());
}

const BATCH_TOKEN_REFRESH_SIZE = 10;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Get connections that need token refresh (tokenExpiresAt < now + 12h) - safety net for hourly batch.
 * Uses indexed query on token expiry to avoid full-table scans.
 */
async function getConnectionsNeedingTokenRefresh(): Promise<number[]> {
  const now = Date.now();
  const threshold = now + TWELVE_HOURS_MS;
  return storage.getTikTokConnectionIdsNeedingTokenRefresh(threshold);
}

let batchTokenRefreshInterval: NodeJS.Timeout | null = null;

/**
 * Run batch token refresh once per hour (safety net)
 */
async function runBatchTokenRefresh(): Promise<void> {
  try {
    const ids = await getConnectionsNeedingTokenRefresh();
    if (ids.length === 0) return;
    tiktokLog(undefined, 'BatchRefresh', `Safety net: ${ids.length} connection(s) need token refresh`, 'INFO');
    for (let i = 0; i < ids.length; i += BATCH_TOKEN_REFRESH_SIZE) {
      const batch = ids.slice(i, i + BATCH_TOKEN_REFRESH_SIZE);
      await Promise.all(batch.map((connectionId) => ensureValidToken(connectionId).catch((err) => {
        tiktokLog(connectionId, 'BatchRefresh', `Failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'WARN');
      })));
    }
  } catch (err) {
    tiktokLog(undefined, 'BatchRefresh', `Batch refresh error: ${err instanceof Error ? err.message : 'Unknown'}`, 'ERROR');
  }
}

function startBatchTokenRefreshInterval(): void {
  if (batchTokenRefreshInterval) return;
  batchTokenRefreshInterval = setInterval(runBatchTokenRefresh, 3600000);
  tiktokLog(undefined, 'BatchRefresh', 'Hourly batch token refresh safety net started', 'DEBUG');
}

function stopBatchTokenRefreshInterval(): void {
  if (batchTokenRefreshInterval) {
    clearInterval(batchTokenRefreshInterval);
    batchTokenRefreshInterval = null;
  }
}

const MESSAGING_WINDOW_EXPIRATION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let messagingWindowExpirationInterval: NodeJS.Timeout | null = null;

/**
 * Run periodic check: mark TikTok conversations as window closed when messagingWindowExpiresAt has passed.
 * Broadcasts conversationUpdated so UI can disable reply box.
 */
async function runMessagingWindowExpirationCheck(): Promise<void> {
  try {
    const db = getDb();
    const now = Date.now();
    const expired = await db
      .select({ id: conversations.id, companyId: conversations.companyId, groupMetadata: conversations.groupMetadata })
      .from(conversations)
      .where(
        and(
          eq(conversations.channelType, 'tiktok'),
          sql`${conversations.groupMetadata}->>'messagingWindowStatus' = 'open'`,
          sql`(${conversations.groupMetadata}->>'messagingWindowExpiresAt')::bigint < ${now}`
        )
      );
    if (expired.length === 0) return;
    logger.info('tiktok', `Messaging window expiration: updating ${expired.length} conversation(s) to closed`);
    for (const row of expired) {
      try {
        const currentMetadata = (row.groupMetadata as TikTokConversationMetadata) || {};
        await storage.updateConversation(row.id, {
          groupMetadata: {
            ...currentMetadata,
            messagingWindowStatus: 'closed',
            conversationState: 'window_closed'
          }
        });
        const updated = await storage.getConversation(row.id);
        if (updated && row.companyId) {
          broadcastTikTokEvent('conversationUpdated', updated, {
            companyId: row.companyId,
            conversationId: row.id,
            priority: 'normal'
          });
        }
      } catch (err) {
        logger.error('tiktok', 'Error updating conversation window status', { conversationId: row.id, err });
      }
    }
  } catch (err) {
    logger.error('tiktok', 'Error in messaging window expiration check', err);
  }
}

function startMessagingWindowExpirationWorker(): void {
  if (messagingWindowExpirationInterval) return;
  runMessagingWindowExpirationCheck();
  messagingWindowExpirationInterval = setInterval(
    runMessagingWindowExpirationCheck,
    MESSAGING_WINDOW_EXPIRATION_CHECK_INTERVAL_MS
  );
  logger.info('tiktok', 'Messaging window expiration worker started (hourly)');
}

/**
 * Stop all health monitoring (graceful shutdown)
 */
function stopAllHealthMonitoring(): void {
  let intervalsStopped = 0;
  for (const [connectionId, timeout] of healthMonitoringIntervals) {
    clearTimeout(timeout);
    intervalsStopped++;
  }
  healthMonitoringIntervals.clear();
  for (const [connectionId, timeout] of proactiveRefreshTimeouts) {
    clearTimeout(timeout);
  }
  proactiveRefreshTimeouts.clear();
  for (const [, timeout] of recoveryTimeouts) {
    clearTimeout(timeout);
  }
  recoveryTimeouts.clear();
  connectionStates.clear();
  stopBatchTokenRefreshInterval();
  tiktokLog(undefined, 'Shutdown', `Stopped ${intervalsStopped} health monitoring interval(s)`, 'INFO');
}

/**
 * Manually trigger token refresh for testing (admin)
 */
async function testTokenRefresh(connectionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureValidToken(connectionId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Manually run a health check for testing (admin)
 */
async function testHealthCheck(connectionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const valid = await validateTokenHealth(connectionId);
    return { success: valid };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get detailed health monitoring status for a connection (admin)
 */
function getHealthMonitoringStatus(connectionId: number): {
  monitored: boolean;
  nextCheckInMs: number | null;
  lastCheckResult: 'success' | 'failure' | 'unknown';
  intervalMs: number;
  state: Partial<ConnectionState>;
} | null {
  const state = connectionStates.get(connectionId);
  const hasInterval = healthMonitoringIntervals.has(connectionId);
  const interval = hasInterval ? HEALTH_CHECK_INTERVALS.ACTIVE : 0;
  return {
    monitored: hasInterval,
    nextCheckInMs: hasInterval ? interval : null,
    lastCheckResult: state?.lastSuccessfulValidation ? 'success' : (state?.lastError ? 'failure' : 'unknown'),
    intervalMs: interval,
    state: state ? {
      isActive: state.isActive,
      consecutiveFailures: state.consecutiveFailures,
      consecutiveValidationFailures: state.consecutiveValidationFailures,
      isRecovering: state.isRecovering,
      recoveryStage: state.recoveryStage,
      scheduledRefreshAt: state.scheduledRefreshAt
    } : {}
  };
}

/**
 * Find or create a contact for a TikTok user
 * @param companyId The company ID for multi-tenant security
 * @param participantId The TikTok user open_id
 * @param participantData Optional user info from TikTok API
 * @returns The contact object
 */
async function findOrCreateContact(
  companyId: number,
  participantId: string,
  participantData?: TikTokUserInfo
): Promise<{ contact: any; created: boolean }> {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }

  let contact = await storage.getContactByIdentifierAndCompany(participantId, 'tiktok', companyId);
  let created = false;

  if (!contact) {
    const contactData: InsertContact = {
      companyId: companyId,
      name: participantData?.display_name || `TikTok User ${participantId.substring(0, 6)}...`,
      phone: null,
      email: null,
      avatarUrl: participantData?.avatar_url || participantData?.avatar_large_url || null,
      identifier: participantId,
      identifierType: 'tiktok',
      source: 'tiktok',
      notes: participantData?.bio_description || null
    };

    const contactResult = await storage.getOrCreateContactResult(contactData);
    contact = contactResult.contact;
    created = contactResult.created;
    if (contactResult.created) {
      logger.info('tiktok', `Created new contact: ${contact.id} for TikTok user ${participantId}`);
    }
  } else {
    // Update contact info if we have new data
    if (participantData) {
      const updates: Partial<InsertContact> = {};
      if (participantData.display_name && contact.name.startsWith('TikTok User')) {
        updates.name = participantData.display_name;
      }
      if (participantData.avatar_url && !contact.avatarUrl) {
        updates.avatarUrl = participantData.avatar_url;
      }
      if (Object.keys(updates).length > 0) {
        contact = await storage.updateContact(contact.id, updates);
      }
    }
  }

  return { contact, created };
}

/**
 * Find or create a conversation for a TikTok user
 * @param connectionId The channel connection ID
 * @param participantId The TikTok user open_id
 * @param companyId The company ID for multi-tenant security
 * @param conversationExternalId Optional TikTok conversation_id
 * @returns The conversation object
 */
async function findOrCreateConversation(
  connectionId: number,
  participantId: string,
  companyId: number,
  conversationExternalId?: string
): Promise<any> {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }

  const { contact } = await findOrCreateContact(companyId, participantId);

  let conversation: any = undefined;

  // If conversationExternalId is provided, first try to find conversation by external ID
  if (conversationExternalId) {
    const db = getDb();
    const [foundByExternalId] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelId, connectionId),
          eq(conversations.channelType, 'tiktok'),
          eq(conversations.companyId, companyId),
          sql`${conversations.groupMetadata}->>'tiktokConversationId' = ${conversationExternalId}`
        )
      )
      .limit(1);
    
    if (foundByExternalId) {
      conversation = foundByExternalId;
      logger.info('tiktok', `Found conversation ${conversation.id} by external ID ${conversationExternalId}`);
    }
  }

  // Fall back to contact/channel lookup if not found by external ID
  if (!conversation) {
    conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connectionId
    );
  }

  if (!conversation) {
    const conversationData: InsertConversation = {
      companyId: companyId,
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'tiktok',
      status: 'open',
      assignedToUserId: null,
      lastMessageAt: new Date(),
      ...(conversationExternalId && {
        groupMetadata: { tiktokConversationId: conversationExternalId }
      })
    };

    conversation = await storage.createConversation(conversationData);
    logger.info('tiktok', `Created new conversation: ${conversation.id} for TikTok user ${participantId}${conversationExternalId ? ` with external ID ${conversationExternalId}` : ''}`);
  } else if (conversationExternalId) {
    // Update existing conversation to store external ID if not already stored
    const currentMetadata = (conversation.groupMetadata as any) || {};
    if (!currentMetadata.tiktokConversationId) {
      await storage.updateConversation(conversation.id, {
        groupMetadata: { ...currentMetadata, tiktokConversationId: conversationExternalId }
      });
      logger.info('tiktok', `Updated conversation ${conversation.id} with external ID ${conversationExternalId}`);
    }
  }

  return conversation;
}

/**
 * Check if the messaging window is still open for a conversation
 * TikTok Business Messaging uses a 48-hour window after last user interaction (partner policy).
 * @param conversationId Internal conversation ID
 * @param windowMs Window duration in milliseconds (default: {@link TIKTOK_MESSAGING_WINDOW_MS})
 * @returns Object with window status and metadata
 */
async function checkMessagingWindow(
  conversationId: number,
  windowMs: number = TIKTOK_MESSAGING_WINDOW_MS
): Promise<{
  isOpen: boolean;
  status: 'open' | 'closed' | 'expired';
  expiresAt?: number;
  lastInteractionAt?: number;
  reason?: string;
}> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    return {
      isOpen: false,
      status: 'expired',
      reason: 'Conversation not found'
    };
  }
  if (conversation.channelType !== 'tiktok') {
    return {
      isOpen: false,
      status: 'closed',
      reason: 'Not a TikTok conversation'
    };
  }

  const metadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
  const conversationState = metadata.conversationState;

  if (conversationState === 'user_blocked') {
    return {
      isOpen: false,
      status: 'closed',
      lastInteractionAt: metadata.lastUserInteractionAt,
      expiresAt: metadata.messagingWindowExpiresAt,
      reason: 'User has blocked the business'
    };
  }
  if (conversationState === 'expired' || metadata.messagingWindowStatus === 'closed') {
    return {
      isOpen: false,
      status: 'closed',
      lastInteractionAt: metadata.lastUserInteractionAt,
      expiresAt: metadata.messagingWindowExpiresAt,
      reason: 'Messaging window has closed'
    };
  }

  let lastInteractionAt: number | undefined = metadata.lastUserInteractionAt;
  if (lastInteractionAt == null) {
    const msgs = await storage.getMessagesByConversation(conversationId);
    const lastInbound = msgs
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => (b.createdAt ? b.createdAt.getTime() : 0) - (a.createdAt ? a.createdAt.getTime() : 0))[0];
    if (lastInbound?.createdAt) {
      lastInteractionAt = lastInbound.createdAt.getTime();
    } else if (conversation.lastMessageAt) {
      lastInteractionAt = conversation.lastMessageAt.getTime();
    }
  }

  if (lastInteractionAt == null) {
    return {
      isOpen: true,
      status: 'open',
      reason: 'New conversation, no prior user message'
    };
  }

  const expiresAt = lastInteractionAt + windowMs;
  const now = Date.now();
  const isOpen = now < expiresAt;
  const status: 'open' | 'closed' | 'expired' = isOpen ? 'open' : (conversationState === 'window_closed' ? 'closed' : 'expired');

  return {
    isOpen,
    status,
    expiresAt,
    lastInteractionAt,
    reason: isOpen ? undefined : `${TIKTOK_MESSAGING_WINDOW_POLICY_SHORT} has closed`
  };
}

/**
 * Get conversation metadata including messaging window status
 * Used by UI to determine if reply box should be enabled
 * @param conversationId Internal conversation ID
 * @returns Conversation metadata with window status
 */
async function getConversationMetadata(conversationId: number): Promise<{
  windowStatus: 'open' | 'closed' | 'expired';
  canReply: boolean;
  expiresAt?: number;
  lastInteractionAt?: number;
  conversationState: string;
}> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    return {
      windowStatus: 'expired',
      canReply: false,
      conversationState: 'unknown'
    };
  }
  const metadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
  const windowCheck = await checkMessagingWindow(conversationId);
  return {
    windowStatus: windowCheck.status,
    canReply: windowCheck.isOpen,
    expiresAt: windowCheck.expiresAt,
    lastInteractionAt: windowCheck.lastInteractionAt,
    conversationState: metadata.conversationState ?? 'active'
  };
}

/**
 * Update conversation's messaging window status (e.g. when API returns window expired)
 */
async function updateConversationWindowStatus(
  conversationId: number,
  status: 'open' | 'closed' | 'expired'
): Promise<void> {
  try {
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || conversation.channelType !== 'tiktok') return;
    const currentMetadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
    const conversationState: TikTokConversationMetadata['conversationState'] =
      status === 'closed' || status === 'expired' ? 'window_closed' : 'active';
    await storage.updateConversation(conversationId, {
      groupMetadata: {
        ...currentMetadata,
        messagingWindowStatus: status,
        conversationState
      }
    });
  } catch (err) {
    logger.error('tiktok', 'Error updating conversation window status', { conversationId, status, err });
  }
}

const TIKTOK_IMAGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const TIKTOK_VIDEO_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Unwrap TikTok Business API JSON envelope `{ code, message, data }` when present.
 */
function extractTikTokBusinessData(responseData: any): any {
  if (responseData == null) return responseData;
  if (typeof responseData.code === 'number' && responseData.code !== 0) {
    const err: any = new Error(responseData.message || 'TikTok API error');
    err.response = {
      status: 400,
      data: {
        error: {
          code: String(responseData.code),
          message: responseData.message,
          log_id: responseData.request_id
        }
      }
    };
    throw err;
  }
  return responseData.data !== undefined ? responseData.data : responseData;
}

function normalizeConversationListItem(raw: any): TikTokConversation {
  if (!raw || typeof raw !== 'object') {
    return {
      conversation_id: '',
      up_time: 0
    };
  }
  return {
    conversation_id: String(raw.conversation_id ?? raw.id ?? ''),
    up_time: Number(raw.up_time ?? raw.update_time ?? 0),
    participant_id: raw.participant_id ?? raw.user_id,
    participant_name: raw.participant_name ?? raw.display_name,
    participant_avatar: raw.participant_avatar ?? raw.avatar_url,
    last_message_at: raw.last_message_at,
    unread_count: raw.unread_count,
    status: raw.status
  };
}

function normalizeMessageListItem(raw: any): TikTokMessage {
  if (!raw || typeof raw !== 'object') {
    return {
      message_id: '',
      conversation_id: '',
      sender_id: '',
      recipient_id: '',
      message_type: 'text',
      content: { text: { body: '' } },
      timestamp: 0
    };
  }
  const messageType = (raw.message_type ?? raw.type ?? 'text') as TikTokMessage['message_type'];
  let content: TikTokMessage['content'] = raw.content && typeof raw.content === 'object'
    ? raw.content
    : {};
  if (messageType === 'text' && !content.text?.body) {
    const body =
      typeof raw.text === 'string'
        ? raw.text
        : raw.content && typeof raw.content === 'string'
          ? raw.content
          : '';
    content = { ...content, text: { body } };
  }
  return {
    message_id: String(raw.message_id ?? raw.id ?? ''),
    conversation_id: String(raw.conversation_id ?? ''),
    sender_id: String(raw.sender_id ?? raw.from_user_id ?? ''),
    recipient_id: String(raw.recipient_id ?? raw.to_user_id ?? ''),
    message_type: messageType,
    content,
    timestamp: Number(raw.timestamp ?? raw.create_time ?? 0),
    status: raw.status,
    metadata: raw.metadata
  };
}

function assertAllowedTikTokUpload(mimeType: string, byteLength: number, kind: 'image' | 'video'): void {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  if (kind === 'image') {
    if (!['image/jpeg', 'image/png'].includes(normalized)) {
      throw new Error('TikTok image upload only supports JPG and PNG');
    }
    if (byteLength > TIKTOK_IMAGE_UPLOAD_MAX_BYTES) {
      throw new Error('TikTok image upload must be 3MB or smaller');
    }
  } else if (byteLength > TIKTOK_VIDEO_UPLOAD_MAX_BYTES) {
    throw new Error('TikTok video exceeds maximum upload size');
  }
}

async function fetchUrlBufferForTikTokUpload(
  url: string,
  kind: 'image' | 'video'
): Promise<{ buffer: Buffer; mimeType: string }> {
  const max = kind === 'image' ? TIKTOK_IMAGE_UPLOAD_MAX_BYTES : TIKTOK_VIDEO_UPLOAD_MAX_BYTES;
  const response = await axios.get(url.trim(), {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: max,
    maxBodyLength: max,
    validateStatus: (status) => status < 500
  });
  if (response.status >= 400) {
    throw new Error(`Failed to download media for TikTok upload: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(response.data);
  const mimeType =
    rawAxiosHeaderToString(response.headers['content-type']).split(';')[0].trim() ||
    'application/octet-stream';
  assertAllowedTikTokUpload(mimeType, buffer.length, kind);
  return { buffer, mimeType };
}

/**
 * Upload image/video bytes to TikTok; returns media_id (private helper).
 */
async function uploadMedia(
  connectionId: number,
  businessId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ media_id: string }> {
  try {
    const accessToken = await ensureValidToken(connectionId);

    const form = new FormData();
    form.append('business_id', businessId);
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'bin';
    form.append('file', fileBuffer, { filename: `upload.${ext}`, contentType: mimeType });

    const response = await axios.post(await buildApiUrl('/business/message/media/upload/'), form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...form.getHeaders(),
      },
      timeout: 120000,
      maxBodyLength: Math.max(TIKTOK_VIDEO_UPLOAD_MAX_BYTES, TIKTOK_IMAGE_UPLOAD_MAX_BYTES) + 65536,
      maxContentLength: Math.max(TIKTOK_VIDEO_UPLOAD_MAX_BYTES, TIKTOK_IMAGE_UPLOAD_MAX_BYTES) + 65536
    });

    updateConnectionActivity(connectionId, true);
    const data = extractTikTokBusinessData(response.data);
    const mediaId = data?.media_id ?? data?.mediaId;
    if (!mediaId) {
      throw new Error('TikTok media upload did not return media_id');
    }
    return { media_id: String(mediaId) };
  } catch (error) {
    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Media upload failed');
    throw error;
  }
}

/**
 * Resolve a temporary download URL for TikTok-hosted media (private helper).
 */
async function downloadMedia(
  connectionId: number,
  businessId: string,
  mediaId: string
): Promise<{ url: string }> {
  try {
    const accessToken = await ensureValidToken(connectionId);

    const response = await axios.get(await buildApiUrl('/business/message/media/download/'), {
      params: { business_id: businessId, media_id: mediaId },
      headers: buildBusinessApiHeaders(accessToken),
      timeout: 15000,
    });

    updateConnectionActivity(connectionId, true);
    const data = extractTikTokBusinessData(response.data);
    const url = data?.url ?? data?.download_url ?? data?.media_url;
    if (!url || typeof url !== 'string') {
      throw new Error('TikTok media download did not return a URL');
    }
    return { url };
  } catch (error) {
    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Media download failed');
    throw error;
  }
}

/**
 * Fetch conversation capabilities (optional before media send).
 */
async function checkCapabilities(
  connectionId: number,
  businessId: string,
  conversationId: string
): Promise<Record<string, unknown>> {
  const accessToken = await ensureValidToken(connectionId);

  const response = await axios.get(await buildApiUrl('/business/message/capabilities/get'), {
    params: { business_id: businessId, conversation_id: conversationId },
    headers: buildBusinessApiHeaders(accessToken),
    timeout: 10000,
    validateStatus: (status) => status < 500,
  });

  updateConnectionActivity(connectionId, response.status < 400);
  if (response.status >= 400) {
    const err: any = new Error('TikTok capabilities request failed');
    err.response = response;
    throw err;
  }
  const data = extractTikTokBusinessData(response.data);
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

/**
 * List conversations from TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param cursor Optional pagination cursor
 * @param limit Optional limit for results (default: 20)
 * @returns List of conversations with pagination info
 */
async function listConversations(
  connectionId: number,
  companyId: number,
  cursor?: string,
  limit: number = 20
): Promise<{ conversations: TikTokConversation[]; next_cursor?: string; has_more: boolean }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Multi-tenant security check
    if (connection.companyId !== companyId) {
      throw new Error('Unauthorized: Connection does not belong to this company');
    }

    const connectionData = connection.connectionData as TikTokConnectionData;
    if (!connectionData?.accessToken) {
      throw new Error('Access token not found in connection data');
    }

    const businessId = resolveBusinessMessagingBusinessId(connectionData);

    const accessToken = await ensureValidToken(connectionId);

    const queryParams: Record<string, string> = {
      business_id: businessId,
      limit: limit.toString()
    };
    if (cursor) {
      queryParams.cursor = cursor;
    }

    const response = await axios.get(await buildApiUrl('/business/message/conversation/list'), {
      headers: buildBusinessApiHeaders(accessToken),
      params: queryParams,
      timeout: 10000,
    });

    updateConnectionActivity(connectionId, true);
    logger.info('tiktok', `Listed conversations via connection ${connectionId}`);

    const data = extractTikTokBusinessData(response.data);
    const rawList =
      data?.conversation_list ?? data?.conversations ?? (Array.isArray(data) ? data : []) ?? [];
    const conversations = (rawList as any[]).map(normalizeConversationListItem);
    const next_cursor =
      data?.next_cursor ?? data?.cursor ?? data?.next_cursor_token ?? undefined;
    const has_more = !!(data?.has_more ?? next_cursor);

    return {
      conversations,
      next_cursor,
      has_more
    };
  } catch (error) {
    logger.error('tiktok', `Error listing conversations via connection ${connectionId}:`, error);
    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'List conversations failed');
    throw handleTikTokError(error);
  }
}

/**
 * Get messages from a TikTok conversation
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id
 * @param cursor Optional pagination cursor
 * @param limit Optional limit for results (default: 50)
 * @param retryCount Internal retry counter to prevent unbounded recursion (default: 0, max: 1)
 * @returns List of messages with pagination info
 */
async function getMessages(
  connectionId: number,
  companyId: number,
  conversationId: string,
  cursor?: string,
  limit: number = 50,
  retryCount: number = 0
): Promise<{ messages: TikTokMessage[]; next_cursor?: string; has_more: boolean }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Multi-tenant security check
    if (connection.companyId !== companyId) {
      throw new Error('Unauthorized: Connection does not belong to this company');
    }

    const connectionData = connection.connectionData as TikTokConnectionData;
    if (!connectionData?.accessToken) {
      throw new Error('Access token not found in connection data');
    }

    const businessId = resolveBusinessMessagingBusinessId(connectionData);

    const accessToken = await ensureValidToken(connectionId);

    const queryParams: Record<string, string> = {
      business_id: businessId,
      conversation_id: conversationId,
      limit: limit.toString()
    };
    if (cursor) {
      queryParams.cursor = cursor;
    }

    const response = await axios.get(await buildApiUrl('/business/message/conversation/content/list'), {
      headers: buildBusinessApiHeaders(accessToken),
      params: queryParams,
      timeout: 10000,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 404) {
      const error: any = new Error('Conversation not found or expired');
      error.response = {
        status: 404,
        data: {
          error: {
            code: 'conversation_not_found',
            message: 'The conversation was not found or has expired'
          }
        }
      };
      throw error;
    }

    if (response.status < 200 || response.status >= 300) {
      const err: any = new Error('TikTok conversation content list request failed');
      err.response = response;
      throw err;
    }

    updateConnectionActivity(connectionId, true);
    logger.info('tiktok', `Retrieved messages for conversation ${conversationId} via connection ${connectionId}`);

    const data = extractTikTokBusinessData(response.data);
    const rawMessages =
      data?.message_list ?? data?.messages ?? (Array.isArray(data) ? data : []) ?? [];
    const messages = (rawMessages as any[]).map(normalizeMessageListItem);
    const next_cursor =
      data?.next_cursor ?? data?.cursor ?? data?.next_cursor_token ?? undefined;
    const has_more = !!(data?.has_more ?? next_cursor);

    return {
      messages,
      next_cursor,
      has_more
    };
  } catch (error) {
    logger.error('tiktok', `Error getting messages for conversation ${conversationId} via connection ${connectionId}:`, error);
    
    // Retry logic for transient failures
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (isRetryableError(axiosError.response?.status || 0)) {
        // Check retry limit (max 1 retry attempt)
        if (retryCount < 1) {
          // Wait and retry once
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            return await getMessages(connectionId, companyId, conversationId, cursor, limit, retryCount + 1);
          } catch (retryError) {
            updateConnectionActivity(connectionId, false, retryError instanceof Error ? retryError.message : 'Get messages failed');
            throw handleTikTokError(retryError);
          }
        } else {
          // Max retries reached, throw the last error
          updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Get messages failed');
          throw handleTikTokError(error);
        }
      }
    }

    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Get messages failed');
    throw handleTikTokError(error);
  }
}

/**
 * Send a message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param messageType The type of message ('text' | 'image' | 'video' | 'sticker' | 'share_post')
 * @param content The message content object with appropriate fields (for image/video after upload, image_url/video_url hold media_id)
 * @returns The API response with message_id
 */
async function sendMessage(
  connectionId: number,
  conversationId: string,
  recipientId: string,
  messageType: 'text' | 'image' | 'video' | 'sticker' | 'share_post',
  content: {
    text?: string;
    image_url?: string;
    video_url?: string;
    sticker_id?: string;
    thumbnail_url?: string;
  }
): Promise<{ message_id: string; status: string }> {
  try {
    void recipientId;
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }
    const connectionData = connection.connectionData as TikTokConnectionData;
    const business_id = resolveBusinessMessagingBusinessId(connectionData);

    const accessToken = await ensureValidToken(connectionId);

    const messageRequest: TikTokSendMessageRequest = {
      business_id,
      conversation_id: conversationId
    };

    if (messageType === 'text' && content.text != null) {
      messageRequest.text = { body: content.text };
    } else if (messageType === 'image' && content.image_url) {
      messageRequest.image = { media_id: content.image_url };
    } else if (messageType === 'video' && content.video_url) {
      messageRequest.video = { media_id: content.video_url };
    } else if (messageType === 'sticker' && content.sticker_id) {
      messageRequest.sticker = { sticker_id: content.sticker_id };
    } else if (messageType === 'share_post' && content.text) {
      messageRequest.share_post = { item_id: content.text };
    } else {
      throw new Error(`TikTok sendMessage: invalid payload for message type ${messageType}`);
    }

    const response = await axios.post(await buildApiUrl('/business/message/send'), messageRequest, {
      headers: buildBusinessApiHeaders(accessToken),
      timeout: 10000,
    });

    updateConnectionActivity(connectionId, true);
    logger.info('tiktok', `Message sent successfully via connection ${connectionId}`);

    const data = extractTikTokBusinessData(response.data);
    return {
      message_id: String(data?.message_id ?? data?.id ?? ''),
      status: String(data?.status ?? 'sent')
    };
  } catch (error) {
    logger.error('tiktok', `Error sending message via connection ${connectionId}:`, error);
    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Send message failed');
    throw handleTikTokError(error);
  }
}

/**
 * Send a message and save to database
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string) - will find or create internal conversation
 * @param recipientId The TikTok user open_id
 * @param userId The user ID sending the message
 * @param messageType The type of message ('text' | 'image' | 'video' | 'sticker' | 'share_post')
 * @param content The message content (text, media URL for image/video upload, sticker id, or TikTok post item id for share_post)
 * @param thumbnailUrl Optional thumbnail URL for video messages (stored in metadata only)
 * @returns The saved message object
 */
async function sendAndSaveMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  userId: number,
  messageType: 'text' | 'image' | 'video' | 'sticker' | 'share_post' = 'text',
  content: string,
  thumbnailUrl?: string
): Promise<any> {
  let conversation: any;
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Multi-tenant security check
    if (connection.companyId !== companyId) {
      throw new Error('Unauthorized: Connection does not belong to this company');
    }

    const connectionData = connection.connectionData as TikTokConnectionData;
    const businessId = resolveBusinessMessagingBusinessId(connectionData);

    // Resolve internal conversation and validate messaging window before any media download/upload
    conversation = await findOrCreateConversation(
      connectionId,
      recipientId,
      companyId,
      conversationId
    );

    const windowCheck = await checkMessagingWindow(conversation.id);
    if (!windowCheck.isOpen) {
      const err: any = new Error(
        windowCheck.reason ?? `Cannot send message: ${TIKTOK_MESSAGING_WINDOW_POLICY_SHORT} has closed`
      );
      err.code = TikTokErrorCode.MESSAGE_WINDOW_EXPIRED;
      err.windowStatus = {
        expiresAt: windowCheck.expiresAt,
        lastInteractionAt: windowCheck.lastInteractionAt,
        status: windowCheck.status
      };
      logger.info('tiktok', 'Messaging window check failed before send', {
        conversationId: conversation.id,
        status: windowCheck.status,
        reason: windowCheck.reason
      });
      throw err;
    }

    // Build content object based on message type
    const contentObj: {
      text?: string;
      image_url?: string;
      video_url?: string;
      sticker_id?: string;
      thumbnail_url?: string;
    } = {};

    if (messageType === 'text') {
      contentObj.text = content;
    } else if (messageType === 'share_post') {
      contentObj.text = content;
    } else if (messageType === 'sticker') {
      contentObj.sticker_id = content;
    } else if (messageType === 'image') {
      if (!/^https?:\/\//i.test(content.trim())) {
        throw new Error('TikTok image send requires an http(s) URL to download and upload to TikTok');
      }
      try {
        await checkCapabilities(connectionId, businessId, conversationId);
      } catch (capErr) {
        logger.debug('tiktok', 'capabilities check skipped or failed before image send', { connectionId, capErr });
      }
      const { buffer, mimeType } = await fetchUrlBufferForTikTokUpload(content.trim(), 'image');
      const { media_id } = await uploadMedia(connectionId, businessId, buffer, mimeType);
      contentObj.image_url = media_id;
    } else if (messageType === 'video') {
      if (!/^https?:\/\//i.test(content.trim())) {
        throw new Error('TikTok video send requires an http(s) URL to download and upload to TikTok');
      }
      if (thumbnailUrl) {
        contentObj.thumbnail_url = thumbnailUrl;
      }
      try {
        await checkCapabilities(connectionId, businessId, conversationId);
      } catch (capErr) {
        logger.debug('tiktok', 'capabilities check skipped or failed before video send', { connectionId, capErr });
      }
      const { buffer, mimeType } = await fetchUrlBufferForTikTokUpload(content.trim(), 'video');
      const { media_id } = await uploadMedia(connectionId, businessId, buffer, mimeType);
      contentObj.video_url = media_id;
    }

    // Send message via Business Messaging API
    const sendResponse = await sendMessage(
      connectionId,
      conversationId,
      recipientId,
      messageType,
      contentObj
    );

    // Prepare message content for storage (keep original URL/id for image/video/sticker/share)
    const messageContent = content;

    // Persist message to database
    const messageData: InsertMessage = {
      conversationId: conversation.id,
      direction: 'outbound',
      type: messageType,
      content: messageContent,
      senderId: userId,
      senderType: 'user',
      externalId: sendResponse.message_id,
      status: 'sent',
      metadata: JSON.stringify({
        platform: 'tiktok',
        recipientId: recipientId,
        tiktok_conversation_id: conversationId,
        api_response: sendResponse,
        ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
        ...(messageType === 'image' || messageType === 'video'
          ? { uploaded_media_id: messageType === 'image' ? contentObj.image_url : contentObj.video_url }
          : {})
      }),
      createdAt: new Date()
    };

    const savedMessage = await storage.createMessage(messageData);

    // Update conversation's lastMessageAt timestamp
    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date()
    });

    // Emit events
    emitTikTokEvent('messageSent', {
      connectionId,
      conversationId: conversation.id,
      message: savedMessage,
      conversation: conversation
    });

    broadcastTikTokEvent('newMessage', savedMessage, {
      companyId: companyId,
      conversationId: conversation.id,
      priority: 'high'
    });

    broadcastTikTokEvent('conversationUpdated', conversation, {
      companyId: companyId,
      conversationId: conversation.id,
      priority: 'normal'
    });

    broadcastTikTokEvent('messageStatusUpdate', {
      messageId: savedMessage.id,
      conversationId: conversation.id,
      status: 'sent',
      sentAt: new Date()
    }, {
      companyId: companyId,
      conversationId: conversation.id,
      priority: 'normal'
    });

    logger.info('tiktok', `Message saved to database: ${savedMessage.id}`);
    return savedMessage;
  } catch (error: any) {
    const isWindowExpired =
      error?.error?.code === TikTokErrorCode.MESSAGE_WINDOW_EXPIRED ||
      error?.code === TikTokErrorCode.MESSAGE_WINDOW_EXPIRED ||
      (axios.isAxiosError(error) &&
        error.response?.status === 403 &&
        (error.response?.data as any)?.error?.code === 'conversation_expired');
    if (isWindowExpired && conversation) {
      await updateConversationWindowStatus(conversation.id, 'closed');
    }
    logger.error('tiktok', `Error in sendAndSaveMessage:`, error);
    if (axios.isAxiosError(error)) {
      const apiErr = handleTikTokError(error);
      const err = new Error(apiErr.error.message) as Error & { error: TikTokAPIError['error'] };
      err.error = apiErr.error;
      throw err;
    }
    throw error;
  }
}

/**
 * Send an image message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param imageUrl The URL of the image to send
 * @param userId The user ID sending the message
 * @returns The saved message object
 */
async function sendImageMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  imageUrl: string,
  userId: number
): Promise<any> {
  return await sendAndSaveMessage(
    connectionId,
    companyId,
    conversationId,
    recipientId,
    userId,
    'image',
    imageUrl
  );
}

/**
 * Send a video message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param videoUrl The URL of the video to send
 * @param thumbnailUrl Optional thumbnail URL for the video
 * @param userId The user ID sending the message
 * @returns The saved message object
 */
async function sendVideoMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  videoUrl: string,
  userId: number,
  thumbnailUrl?: string
): Promise<any> {
  return await sendAndSaveMessage(
    connectionId,
    companyId,
    conversationId,
    recipientId,
    userId,
    'video',
    videoUrl,
    thumbnailUrl
  );
}

/**
 * Send a sticker message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param stickerId The ID of the sticker to send
 * @param userId The user ID sending the message
 * @returns The saved message object
 */
async function sendStickerMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  stickerId: string,
  userId: number
): Promise<any> {
  return await sendAndSaveMessage(
    connectionId,
    companyId,
    conversationId,
    recipientId,
    userId,
    'sticker',
    stickerId
  );
}





/**
 * Process incoming webhook event from TikTok (Business Messaging API)
 * user_deletion is processed async so the webhook can return 200 OK immediately (idempotency inside handler).
 */
async function processWebhookEvent(payload: any, webhookContext?: { ipAddress?: string; userAgent?: string }): Promise<void> {
  try {
    logger.debug('tiktok', 'Processing webhook event:', JSON.stringify(payload, null, 2));

    const eventType = payload.event ?? payload.event_type ?? payload.type;

    switch (eventType) {
      case 'im.message.receive':
      case 'message':
      case 'message.received':
        await handleIncomingMessage(payload);
        break;

      case 'message.delivered':
        await handleMessageDelivered(payload);
        break;

      case 'message.read':
        await handleMessageRead(payload);
        break;

      case 'message.failed':
        await handleMessageFailed(payload);
        break;

      case 'user_deletion':
        logTikTokWebhookEvent('user_deletion', 'received', { payload });
        setImmediate(() => {
          handleUserDeletion(payload, webhookContext).then(() => {
            logTikTokWebhookEvent('user_deletion', 'success', { payload });
          }).catch((err) => {
            logger.error('tiktok', 'user_deletion async error', err);
            logTikTokWebhookEvent('user_deletion', 'error', { payload, error: String(err) });
          });
        });
        break;

      case 'conversation.updated':
        await handleConversationUpdated(payload);
        break;

      default:
        logger.warn('tiktok', `Unknown webhook event type: ${eventType}`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error processing webhook event:', error);
    throw error;
  }
}

/**
 * Handle incoming message from TikTok user (Business Messaging API)
 */
async function handleIncomingMessage(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const from_user_id = content.from_user_id ?? payload.sender?.id ?? payload.message?.from?.id;
    const to_user_id = content.to_user_id ?? payload.recipient?.id ?? payload.message?.to?.id;
    const message_id = content.message_id ?? payload.message_id ?? payload.message?.id ?? payload.message?.message_id;
    const conversation_id = content.conversation_id ?? payload.conversation_id;
    const message_type = content.message_type ?? payload.message?.type ?? 'text';

    if (!from_user_id || !to_user_id || !message_id) {
      logger.warn('tiktok', 'Incoming message missing required fields', { from_user_id, to_user_id, message_id });
      return;
    }

    const connections = await storage.getChannelConnectionsByType('tiktok');
    let connection = connections.find(conn => {
      const data = conn.connectionData as TikTokConnectionData;
      return data?.businessAccountId === to_user_id;
    });
    const matchedViaBusinessAccountId = !!connection;
    if (!connection) {
      connection = connections.find(conn => {
        const data = conn.connectionData as TikTokConnectionData;
        return data?.accountId === to_user_id || (data as any)?.openId === to_user_id || (data as any)?.unionId === to_user_id;
      });
    }

    if (!connection) {
      logger.warn('tiktok', 'Multi-tenant routing: no connection found for to_user_id', {
        to_user_id,
        conversation_id,
        message_id
      });
      return;
    }

    const companyId = connection.companyId ?? undefined;
    if (companyId == null) {
      logger.warn('tiktok', 'Connection has no companyId', { connectionId: connection.id, to_user_id });
      return;
    }
    if (matchedViaBusinessAccountId) {
      logger.debug('tiktok', 'Multi-tenant routing: to_user_id matched connection via businessAccountId', {
        to_user_id,
        connectionId: connection.id,
        companyId,
        conversation_id,
        message_id
      });
    } else {
      logger.debug('tiktok', 'Multi-tenant routing: to_user_id matched connection', {
        to_user_id,
        connectionId: connection.id,
        companyId,
        conversation_id,
        message_id
      });
    }

    const existingMessage = await storage.getMessageByExternalId(message_id, companyId);
    if (existingMessage) {
      logger.debug('tiktok', 'Idempotency: duplicate message ignored', {
        message_id,
        companyId,
        existingMessageId: existingMessage.id
      });
      return;
    }

    let messageContent =
      typeof content.text === 'object' && content.text !== null && 'body' in content.text
        ? String((content.text as { body?: string }).body ?? '')
        : typeof content.text === 'string'
          ? content.text
          : '';
    if (!messageContent) {
      messageContent =
        (typeof content.content === 'string' ? content.content : '') ||
        (typeof payload.message?.text === 'string' ? payload.message.text : '') ||
        (typeof payload.message?.content === 'string' ? payload.message.content : '') ||
        '';
    }

    if (message_type === 'share_post') {
      const itemId =
        content.share_post?.item_id ??
        (typeof content.item_id === 'string' ? content.item_id : undefined);
      if (itemId) {
        messageContent = String(itemId);
      }
    } else if (message_type === 'image' && content.image_url) {
      messageContent = String(content.image_url);
    } else if (message_type === 'video' && content.video_url) {
      messageContent = String(content.video_url);
    } else if (message_type === 'sticker' && content.sticker_id) {
      messageContent = String(content.sticker_id);
    }

    const mediaIdRaw =
      content.media_id ??
      (content.image && typeof content.image === 'object'
        ? (content.image as { media_id?: string }).media_id
        : undefined) ??
      (content.video && typeof content.video === 'object'
        ? (content.video as { media_id?: string }).media_id
        : undefined);

    const connectionDataForBiz = connection.connectionData as TikTokConnectionData;
    let businessIdForMedia: string | undefined;
    try {
      businessIdForMedia = resolveBusinessMessagingBusinessId(connectionDataForBiz);
    } catch {
      businessIdForMedia = undefined;
    }

    if (
      (message_type === 'image' || message_type === 'video') &&
      mediaIdRaw &&
      businessIdForMedia
    ) {
      try {
        const { url } = await downloadMedia(connection.id, businessIdForMedia, String(mediaIdRaw));
        messageContent = url;
      } catch (e) {
        logger.warn('tiktok', 'downloadMedia failed for incoming message', {
          mediaId: mediaIdRaw,
          message_id,
          error: e
        });
        if (!messageContent) {
          messageContent = String(mediaIdRaw);
        }
      }
    }

    let participantData: TikTokUserInfo | undefined;
    try {
      const { accessToken: tok } = getDecryptedTikTokConnectionSecrets(connection);
      if (tok) {
        participantData = await getSenderUserInfo(tok, from_user_id);
      }
    } catch (err) {
      logger.debug('tiktok', 'Could not fetch sender user info, using fallback', { from_user_id });
    }

    const { contact, created: contactWasCreatedByInboundWebhook } = await findOrCreateContact(
      companyId,
      from_user_id,
      participantData,
    );
    const conversation = await findOrCreateConversation(
      connection.id,
      from_user_id,
      companyId,
      conversation_id
    );

    // Update messaging window metadata
    const currentTime = Date.now();
    const windowExpiresAt = currentTime + TIKTOK_MESSAGING_WINDOW_MS;
    const currentMetadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
    await storage.updateConversation(conversation.id, {
      groupMetadata: {
        ...currentMetadata,
        lastUserInteractionAt: currentTime,
        messagingWindowStatus: 'open',
        messagingWindowExpiresAt: windowExpiresAt,
        conversationState: 'active'
      }
    });

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      direction: 'inbound',
      senderId: contact.id,
      senderType: 'contact',
      content: messageContent,
      type: message_type,
      status: 'received',
      externalId: message_id,
      metadata: withContactInitialMessageMetadata({
        existingMetadata: {
          platform: 'tiktok',
          senderId: from_user_id,
          tiktok_conversation_id: conversation_id,
          create_time: content.create_time,
          timestamp: content.create_time ? content.create_time * 1000 : Date.now(),
          rawMessage: content,
        },
        channelType: 'tiktok',
        conversationStatus: conversation.status,
        isInboundContactMessage: true,
        contactWasCreatedByInboundWebhook,
      }) as InsertMessage['metadata'],
      createdAt: new Date()
    };

    const savedMessage = await storage.createMessage(messageData);
    const updatedConversation = await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date()
    });

    updateConnectionActivity(connection.id, true);

    emitTikTokEvent('messageReceived', {
      connectionId: connection.id,
      conversationId: conversation.id,
      contactId: contact.id,
      message: savedMessage,
      conversation: updatedConversation,
      contact: contact
    });

    broadcastTikTokEvent('newMessage', savedMessage, {
      companyId: connection.companyId,
      conversationId: conversation.id,
      priority: 'high'
    });

    if (updatedConversation) {
      broadcastTikTokEvent('conversationUpdated', updatedConversation, {
        companyId: connection.companyId,
        conversationId: conversation.id,
        priority: 'normal'
      });
    }

    try {
      const unreadCount = await storage.getUnreadCount(conversation.id);
      broadcastTikTokEvent('unreadCountUpdated', {
        conversationId: conversation.id,
        unreadCount
      }, {
        companyId: connection.companyId,
        conversationId: conversation.id,
        priority: 'normal'
      });
    } catch (error) {
      logger.error('tiktok', 'Error broadcasting unread count update:', error);
    }

    logger.info('tiktok', 'Incoming message processed (new message)', {
      messageId: savedMessage.id,
      from_user_id,
      to_user_id,
      companyId: connection.companyId,
      conversation_id,
      message_id,
      connectionId: connection.id
    });
  } catch (error) {
    logger.error('tiktok', 'Error handling incoming message:', error);
    throw error;
  }
}

/**
 * Handle message delivered status update (Business Messaging API payload)
 */
async function handleMessageDelivered(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const messageId = content.message_id ?? payload.message_id ?? payload.message?.id;

    if (!messageId) {
      logger.warn('tiktok', 'Message delivered event missing message_id');
      return;
    }


    const message = await storage.getMessageByExternalId(messageId);
    if (message) {
      await storage.updateMessage(message.id, { status: 'delivered' });

      const deliveredAt = new Date();

      emitTikTokEvent('messageStatusUpdate', {
        messageId: message.id,
        status: 'delivered'
      });


      const conversation = await storage.getConversation(message.conversationId);
      if (conversation) {
        broadcastTikTokEvent('messageStatusUpdate', {
          messageId: message.id,
          conversationId: message.conversationId,
          status: 'delivered',
          deliveredAt
        }, {
          companyId: conversation.companyId,
          conversationId: message.conversationId,
          priority: 'normal'
        });
      }

      logger.debug('tiktok', `Message ${messageId} marked as delivered`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error handling message delivered:', error);
  }
}

async function resolveTikTokMessageReadUserId(
  payload: any,
  content: any,
  conversation: { contactId: number | null } | undefined
): Promise<number> {
  const candidates: unknown[] = [
    content.reader_id,
    content.reader_open_id,
    content.read_by,
    content.user_id,
    content.participant_id,
    payload?.reader?.id,
    payload?.sender?.id,
    content.to_user_id,
    content.from_user_id
  ];
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const s = String(raw).trim();
    if (!s) continue;
    const asNum = Number(s);
    if (Number.isInteger(asNum) && s === String(asNum)) return asNum;
    const contact = await storage.getContactByIdentifier(s, 'tiktok');
    if (contact) return contact.id;
  }
  if (conversation?.contactId != null) return conversation.contactId;
  return 0;
}

/**
 * Handle message read status update (Business Messaging API payload)
 */
async function handleMessageRead(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const messageId = content.message_id ?? payload.message_id ?? payload.message?.id;

    if (!messageId) {
      logger.warn('tiktok', 'Message read event missing message_id');
      return;
    }


    const message = await storage.getMessageByExternalId(messageId);
    if (message) {
      await storage.updateMessage(message.id, { status: 'read' });

      const readAt = new Date();
      const conversation = await storage.getConversation(message.conversationId);
      const userId = await resolveTikTokMessageReadUserId(payload, content, conversation);

      emitTikTokEvent('messageStatusUpdate', {
        messageId: message.id,
        status: 'read'
      });

      emitTikTokEvent('messageRead', {
        messageId: message.id,
        conversationId: message.conversationId,
        readAt,
        userId
      });

      if (conversation) {
        broadcastTikTokEvent('messageStatusUpdate', {
          messageId: message.id,
          conversationId: message.conversationId,
          status: 'read',
          readAt,
          readBy: [] as number[]
        }, {
          companyId: conversation.companyId,
          conversationId: message.conversationId,
          priority: 'normal'
        });
      }

      logger.debug('tiktok', `Message ${messageId} marked as read`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error handling message read:', error);
  }
}

/**
 * Handle message failed status update (Business Messaging API payload)
 */
async function handleMessageFailed(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const messageId = content.message_id ?? payload.message_id ?? payload.message?.id;
    const error = content.error ?? payload.error ?? 'Unknown error';

    if (!messageId) {
      logger.warn('tiktok', 'Message failed event missing message_id');
      return;
    }


    const message = await storage.getMessageByExternalId(messageId);
    if (message) {
      await storage.updateMessage(message.id, {
        status: 'failed',
        metadata: {
          ...(message.metadata as any),
          error: error
        }
      });

      const failedAt = new Date();

      emitTikTokEvent('messageStatusUpdate', {
        messageId: message.id,
        status: 'failed',
        error: error
      });


      const conversation = await storage.getConversation(message.conversationId);
      if (conversation) {
        broadcastTikTokEvent('messageStatusUpdate', {
          messageId: message.id,
          conversationId: message.conversationId,
          status: 'failed',
          error: error,
          failedAt
        }, {
          companyId: conversation.companyId,
          conversationId: message.conversationId,
          priority: 'high'
        });
      }

      logger.error('tiktok', `Message ${messageId} failed: ${error}`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error handling message failed:', error);
  }
}

/**
 * Log TikTok user deletion to contact_audit_logs and app-level audit (GDPR compliance)
 */
async function logTikTokUserDeletion(params: {
  contactId: number;
  userId: string;
  companyId: number;
  deletionMetadata: Record<string, unknown>;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  affectedMessageCount: number;
  affectedConversationCount: number;
  ipAddress?: string;
  userAgent?: string;
  tx?: any;
}): Promise<void> {
  const description = 'TikTok user data deleted per user_deletion webhook';
  const auditRecord = {
    companyId: params.companyId,
    contactId: params.contactId,
    userId: null as number | null,
    actionType: 'tiktok_user_deletion',
    actionCategory: 'compliance',
    description,
    oldValues: params.oldValues,
    newValues: params.newValues,
    metadata: {
      webhookPayload: params.deletionMetadata,
      timestamp: new Date().toISOString(),
      affectedMessageCount: params.affectedMessageCount,
      affectedConversationCount: params.affectedConversationCount
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null
  };
  if (params.tx) {
    await params.tx.insert(contactAuditLogs).values(auditRecord);
  } else {
    await storage.createContactAuditLog(auditRecord as any);
  }
  try {
    await storage.saveAppSetting(
      `audit_tiktok_deletion_${params.companyId}_${Date.now()}`,
      { ...auditRecord, tiktokUserId: params.userId }
    );
  } catch (e) {
    logger.warn('tiktok', 'Failed to save app-level TikTok deletion audit', e);
  }
}

/**
 * Handle user_deletion webhook event (compliance: user requested data deletion)
 * Enhanced with transaction, full anonymization, audit logging, and idempotency.
 */
async function handleUserDeletion(payload: any, webhookContext?: { ipAddress?: string; userAgent?: string }): Promise<void> {
  const content = payload.content ?? payload.data ?? {};
  const user_id = content.user_id ?? content.from_user_id;

  if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
    logger.warn('tiktok', 'user_deletion event missing or invalid user_id');
    return;
  }

  const db = getDb();
  const contactsToUpdateList = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.identifier, user_id),
        eq(contacts.identifierType, 'tiktok')
      )
    );

  if (contactsToUpdateList.length === 0) {
    logger.info('tiktok', 'user_deletion: no contact found for user_id', { user_id });
    return;
  }

  const now = new Date();
  const deletionMetadata = {
    platform: 'tiktok',
    user_id,
    webhookTimestamp: payload.timestamp ?? Date.now(),
    event: 'user_deletion'
  };

  let totalMessages = 0;
  let totalConversations = 0;

  try {
    await db.transaction(async (tx: any) => {
      for (const contact of contactsToUpdateList) {
        const existingMeta = (contact.deletionMetadata as Record<string, unknown>) || {};
        if (contact.deletionReason === 'tiktok_user_deletion' && existingMeta.user_id === user_id) {
          logger.debug('tiktok', 'user_deletion already processed (idempotent skip)', { user_id, contactId: contact.id });
          continue;
        }

        const oldValues = {
          name: contact.name,
          identifier: contact.identifier,
          identifierType: contact.identifierType,
          avatarUrl: contact.avatarUrl,
          email: contact.email,
          phone: contact.phone,
          notes: contact.notes,
          isActive: contact.isActive
        };

        await tx
          .update(contacts)
          .set({
            name: '[User Deleted]',
            identifier: null,
            identifierType: null,
            avatarUrl: null,
            email: null,
            phone: null,
            company: null,
            notes: ((contact.notes || '') + ' [TikTok user_deletion compliance]').trim(),
            isActive: false,
            deletedAt: now,
            anonymizedAt: now,
            deletionReason: 'tiktok_user_deletion',
            deletionMetadata,
            updatedAt: now
          })
          .where(eq(contacts.id, contact.id));

        const messagesList = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.senderId, contact.id),
              eq(messages.senderType, 'contact')
            )
          );

        for (const msg of messagesList) {
          await tx
            .update(messages)
            .set({
              content: '[Message from deleted user]',
              metadata: {
                ...(typeof msg.metadata === 'object' && msg.metadata !== null ? (msg.metadata as Record<string, unknown>) : {}),
                user_deletion: true,
                anonymized_at: now.toISOString(),
                original_platform: 'tiktok'
              },
              anonymizedAt: now,
              anonymizationReason: 'tiktok_user_deletion'
            })
            .where(eq(messages.id, msg.id));
        }
        totalMessages += messagesList.length;

        const convos = await storage.getConversationsByContact(contact.id);
        for (const conv of convos) {
          const meta = (conv.groupMetadata as Record<string, unknown>) || {};
          await tx
            .update(conversations)
            .set({
              groupMetadata: {
                ...meta,
                userDeleted: true,
                deletedAt: now.toISOString(),
                deletionSource: 'tiktok_webhook',
                messagingWindowStatus: 'expired',
                conversationState: 'user_blocked'
              },
              updatedAt: now
            })
            .where(eq(conversations.id, conv.id));
        }
        totalConversations += convos.length;

        const newValues = {
          name: '[User Deleted]',
          identifier: null,
          identifierType: null,
          avatarUrl: null,
          email: null,
          phone: null,
          isActive: false,
          deletedAt: now,
          anonymizedAt: now,
          deletionReason: 'tiktok_user_deletion',
          deletionMetadata
        };

        await logTikTokUserDeletion({
          contactId: contact.id,
          userId: user_id,
          companyId: contact.companyId!,
          deletionMetadata,
          oldValues,
          newValues,
          affectedMessageCount: messagesList.length,
          affectedConversationCount: convos.length,
          ipAddress: webhookContext?.ipAddress,
          userAgent: webhookContext?.userAgent,
          tx
        });
      }
    });

    logger.info('tiktok', 'user_deletion compliance completed', {
      user_id,
      contactCount: contactsToUpdateList.length,
      messageCount: totalMessages,
      conversationCount: totalConversations
    });
  } catch (error) {
    logger.error('tiktok', 'Error handling user_deletion (transaction rolled back):', error);
    throw error;
  }
}

/**
 * Handle conversation.updated webhook event (conversation state tracking)
 */
async function handleConversationUpdated(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const conversation_id = content.conversation_id;
    const status = content.status;

    if (!conversation_id) {
      logger.warn('tiktok', 'conversation.updated event missing conversation_id');
      return;
    }

    const db = getDb();
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelType, 'tiktok'),
          sql`${conversations.groupMetadata}->>'tiktokConversationId' = ${conversation_id}`
        )
      )
      .limit(1);

    if (!conversation) {
      logger.debug('tiktok', 'conversation.updated: no internal conversation found', { conversation_id });
      return;
    }

    const currentMetadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
    const tiktokStatusStr = typeof status === 'string' ? status.toLowerCase() : '';
    let conversationState: TikTokConversationMetadata['conversationState'] = currentMetadata.conversationState ?? 'active';
    let messagingWindowStatus: TikTokConversationMetadata['messagingWindowStatus'] = currentMetadata.messagingWindowStatus ?? 'open';
    if (tiktokStatusStr === 'active') {
      conversationState = 'active';
      messagingWindowStatus = 'open';
    } else if (tiktokStatusStr === 'expired') {
      conversationState = 'expired';
      messagingWindowStatus = 'closed';
    } else if (tiktokStatusStr === 'blocked') {
      conversationState = 'user_blocked';
      messagingWindowStatus = 'closed';
    }
    await storage.updateConversation(conversation.id, {
      groupMetadata: {
        ...currentMetadata,
        tiktokStatus: status,
        conversationState,
        messagingWindowStatus
      }
    });

    const updated = await storage.getConversation(conversation.id);
    if (updated) {
      broadcastTikTokEvent('conversationUpdated', updated, {
        companyId: conversation.companyId!,
        conversationId: conversation.id,
        priority: 'normal'
      });
    }
    logger.debug('tiktok', 'conversation.updated processed', { conversation_id, status });
  } catch (error) {
    logger.error('tiktok', 'Error handling conversation.updated:', error);
  }
}

/**
 * Apply data retention policy for TikTok: find contacts with deletedAt older than retentionDays
 * and optionally hard-delete or log application (GDPR compliance).
 * Called by background worker daily.
 */
async function applyDataRetentionPolicy(): Promise<{ companiesProcessed: number; contactsProcessed: number; errors: string[] }> {
  const result = { companiesProcessed: 0, contactsProcessed: 0, errors: [] as string[] };
  try {
    const connections = await storage.getChannelConnectionsByType('tiktok');
    const companyIds = [...new Set(connections.map((c) => c.companyId).filter(Boolean))] as number[];
    const db = getDb();

    for (const companyId of companyIds) {
      try {
        const policy = await storage.getDataRetentionPolicy(companyId, 'tiktok');
        if (!policy?.enabled || policy.retentionDays <= 0) continue;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - policy.retentionDays);
        const expiredContacts = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.companyId, companyId),
              eq(contacts.identifierType, 'tiktok'),
              isNotNull(contacts.deletedAt),
              lt(contacts.deletedAt, cutoff)
            )
          );

        for (const contact of expiredContacts) {
          try {
            await storage.deleteContact(contact.id);
            result.contactsProcessed++;
          } catch (err) {
            result.errors.push(`Contact ${contact.id}: ${(err as Error).message}`);
          }
        }
        if (expiredContacts.length > 0) {
          result.companiesProcessed++;
          logger.info('tiktok', 'Data retention policy applied', {
            companyId,
            retentionDays: policy.retentionDays,
            contactsProcessed: expiredContacts.length
          });
          try {
            await storage.saveAppSetting(
              `audit_tiktok_retention_${companyId}_${Date.now()}`,
              { companyId, retentionDays: policy.retentionDays, contactsProcessed: expiredContacts.length, appliedAt: new Date().toISOString() }
            );
          } catch (_) {}
        }
      } catch (err) {
        result.errors.push(`Company ${companyId}: ${(err as Error).message}`);
      }
    }
  } catch (error) {
    logger.error('tiktok', 'Error in applyDataRetentionPolicy', error);
    result.errors.push((error as Error).message);
  }
  return result;
}

/**
 * Test user_deletion compliance (admin): simulate user_deletion webhook for a connection and test user.
 * For development/testing only; optionally rollback.
 */
async function testUserDeletionCompliance(params: {
  connectionId: number;
  testUserId: string;
  rollback?: boolean;
}): Promise<{ success: boolean; contactCount?: number; messageCount?: number; conversationCount?: number; error?: string }> {
  const payload = {
    event: 'user_deletion',
    content: { user_id: params.testUserId },
    timestamp: Date.now()
  };
  try {
    await handleUserDeletion(payload);
    const db = getDb();
    const contactsList = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.identifier, params.testUserId),
          eq(contacts.identifierType, 'tiktok')
        )
      );
    const count = contactsList.length;
    let messageCount = 0;
    let conversationCount = 0;
    if (count > 0) {
      for (const c of contactsList) {
        const msgs = await db.select().from(messages).where(and(eq(messages.senderId, c.id), eq(messages.senderType, 'contact')));
        messageCount += msgs.length;
        const convos = await storage.getConversationsByContact(c.id);
        conversationCount += convos.length;
      }
    }
    return { success: true, contactCount: count, messageCount, conversationCount };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}



/**
 * Verify TikTok webhook signature for the v2 `TikTok-Signature` header format `t=<timestamp>,s=<hash>`.
 * HMAC-SHA256(key, t + "." + request_body) with t as Unix seconds; compares hex digest to s.
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    if (!signature || typeof signature !== 'string') {
      logger.warn('tiktok', 'Webhook signature missing or not a string');
      return false;
    }

    let tStr = '';
    let sHex = '';
    for (const part of signature.split(',')) {
      const p = part.trim();
      const eq = p.indexOf('=');
      if (eq === -1) continue;
      const key = p.slice(0, eq).trim();
      const value = p.slice(eq + 1).trim();
      if (key === 't') tStr = value;
      else if (key === 's') sHex = value;
    }

    if (!tStr || !sHex) {
      logger.warn('tiktok', 'Webhook signature missing t or s in TikTok-Signature header', {
        hasT: !!tStr,
        hasS: !!sHex
      });
      return false;
    }

    const ts = parseInt(tStr, 10);
    if (!Number.isFinite(ts) || ts < 0) {
      logger.warn('tiktok', 'Webhook signature t is not a valid Unix timestamp', { t: tStr });
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const driftSec = Math.abs(nowSec - ts);
    if (driftSec > 300) {
      logger.warn('tiktok', 'Webhook signature timestamp outside 5-minute freshness window', {
        driftSec,
        nowSec,
        ts
      });
      return false;
    }

    const expectedHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(tStr + '.' + payload)
      .digest('hex');

    const trimmedS = sHex.trim().toLowerCase();
    if (!/^[a-f0-9]+$/.test(trimmedS)) {
      logger.warn('tiktok', 'Webhook signature s is not a valid hex string');
      return false;
    }

    const receivedBuf = Buffer.from(trimmedS, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (receivedBuf.length !== expectedBuf.length) {
      logger.warn('tiktok', 'Webhook signature length mismatch', {
        expectedLen: expectedBuf.length,
        receivedLen: receivedBuf.length
      });
      return false;
    }

    const valid = crypto.timingSafeEqual(receivedBuf, expectedBuf);
    if (!valid) {
      logger.warn('tiktok', 'Webhook signature verification failed', {
        expectedPreview: expectedHex.substring(0, 16) + '...',
        receivedPreview: trimmedS.substring(0, 16) + '...',
        payloadLength: payload.length
      });
    }
    return valid;
  } catch (error) {
    logger.error('tiktok', 'Error verifying webhook signature:', error);
    return false;
  }
}





/**
 * Handle TikTok API errors and convert to standardized format
 */
function handleTikTokError(error: any): TikTokAPIError {
  const axiosError = axios.isAxiosError(error) ? (error as AxiosError) : null;
  const response =
    axiosError?.response ??
    (error && typeof error.response === 'object' && error.response?.data !== undefined
      ? error.response
      : undefined);

  if (response?.data !== undefined) {
    const oauthFail = extractOAuthFailureFromEnvelope(response.data);
    if (oauthFail) {
      return {
        error: {
          code: oauthFail.code,
          message: oauthFail.description || oauthFail.code,
          log_id: oauthFail.logId,
        },
      };
    }

    const responseData = response.data as any;
    const statusCode = Number(response.status) || 0;
    const errorCode =
      (typeof responseData?.error === 'object' && responseData?.error?.code != null
        ? responseData.error.code
        : undefined) ?? responseData?.code ?? '';
    const errorMessage =
      (typeof responseData?.error === 'object' && responseData?.error?.message != null
        ? responseData.error.message
        : undefined) ??
      responseData?.message ??
      (axiosError ? axiosError.message : undefined) ??
      (error instanceof Error ? error.message : undefined) ??
      'Unknown error occurred';

    // Map Business Messaging API error codes to TikTokErrorCode enum
    let mappedCode = errorCode || 'UNKNOWN_ERROR';
    let userFriendlyMessage = errorMessage;
    let actionableSuggestion = '';

    // Handle specific Business Messaging API error codes
    if (statusCode === 401) {
      mappedCode = TikTokErrorCode.TOKEN_EXPIRED;
      userFriendlyMessage = 'Authentication failed. Please reconnect your TikTok account.';
      actionableSuggestion = 'The access token has expired. Try refreshing the connection.';
    } else if (statusCode === 403) {
      if (errorCode === 'conversation_expired' || errorCode === 'message_window_closed') {
        mappedCode = TikTokErrorCode.MESSAGE_WINDOW_EXPIRED;
        userFriendlyMessage = 'The messaging window has closed.';
        actionableSuggestion = `The ${TIKTOK_MESSAGING_WINDOW_POLICY_SHORT} has closed. Wait for the user to message first.`;
      } else if (errorCode === 'invalid_permissions') {
        mappedCode = TikTokErrorCode.INSUFFICIENT_PERMISSIONS;
        userFriendlyMessage = 'Insufficient permissions to perform this action.';
        actionableSuggestion = 'Check that your TikTok Business account has the required permissions for messaging.';
      } else if (errorCode === 'recipient_blocked_business' || errorCode === 'user_blocked_business') {
        mappedCode = TikTokErrorCode.RECIPIENT_BLOCKED;
        userFriendlyMessage = 'The user has blocked your business account.';
        actionableSuggestion = 'Update contact metadata to mark as blocked. User must unblock to receive messages.';
      } else {
        mappedCode = TikTokErrorCode.INSUFFICIENT_PERMISSIONS;
        userFriendlyMessage = 'Access denied.';
        actionableSuggestion = 'Check your TikTok Business account permissions.';
      }
    } else if (statusCode === 404) {
      if (errorCode === 'conversation_not_found') {
        mappedCode = TikTokErrorCode.CONVERSATION_NOT_FOUND;
        userFriendlyMessage = 'Conversation not found.';
        actionableSuggestion = 'The conversation may have expired or been deleted.';
      } else if (errorCode === 'invalid_message_id') {
        mappedCode = 'INVALID_MESSAGE_ID';
        userFriendlyMessage = 'Invalid or duplicate message ID.';
        actionableSuggestion = 'Message may be malformed or already processed (idempotency).';
      } else {
        mappedCode = TikTokErrorCode.CONVERSATION_NOT_FOUND;
        userFriendlyMessage = 'Resource not found.';
      }
    } else if (statusCode === 410) {
      mappedCode = TikTokErrorCode.CONVERSATION_EXPIRED;
      userFriendlyMessage = 'Conversation has expired.';
      actionableSuggestion = 'The conversation has expired. Wait for the user to start a new conversation.';
    } else if (errorCode === 'message_window_expired') {
      mappedCode = TikTokErrorCode.MESSAGE_WINDOW_EXPIRED;
      userFriendlyMessage = 'The messaging window has closed.';
      actionableSuggestion = `Wait for the user to message first to reopen the ${TIKTOK_MESSAGING_WINDOW_POLICY_SHORT}.`;
    } else if (errorCode === 'conversation_expired') {
      mappedCode = TikTokErrorCode.CONVERSATION_EXPIRED;
      userFriendlyMessage = 'Conversation has expired.';
      actionableSuggestion = 'Mark conversation as expired in metadata. Wait for user to start a new conversation.';
    } else if (statusCode === 429) {
      mappedCode = TikTokErrorCode.RATE_LIMIT_EXCEEDED;
      userFriendlyMessage = 'Rate limit exceeded.';
      actionableSuggestion = 'Too many requests. Please wait a moment before trying again.';
    } else if (String(errorCode) === '40064') {
      mappedCode = 'MESSAGE_LIMIT_REACHED';
      userFriendlyMessage =
        'Message limit reached for this conversation. Please wait for the user to respond.';
      actionableSuggestion =
        'You have hit TikTok messaging limits for this thread or account. Wait for the user to reply or try again later.';
    } else if (statusCode >= 500) {
      mappedCode = 'SERVER_ERROR';
      userFriendlyMessage = 'TikTok API server error.';
      actionableSuggestion = 'TikTok\'s servers are experiencing issues. Please try again later.';
    }

    const nestedLogId =
      typeof responseData?.error === 'object' && responseData?.error != null
        ? (responseData.error as { log_id?: string }).log_id
        : undefined;
    const tikTokError: TikTokAPIError = {
      error: {
        code: mappedCode,
        message: userFriendlyMessage,
        log_id: nestedLogId ?? (typeof responseData?.log_id === 'string' ? responseData.log_id : undefined),
        ...(actionableSuggestion && { suggestion: actionableSuggestion })
      }
    };

    return tikTokError;
  }

  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  };
}

/**
 * Check if error is retryable
 */
function isRetryableError(statusCode: number): boolean {

  return statusCode === 429 || statusCode >= 500;
}





/**
 * Initialize a TikTok connection
 */
async function initializeConnection(connectionId: number): Promise<void> {
  try {
    logger.info('tiktok', `Initializing connection ${connectionId}`);

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }


    activeConnections.set(connectionId, true);


    const { accessToken, connectionData } = await getTikTokConnectionSecrets(connectionId);
    const businessId = resolveBusinessMessagingBusinessId(connectionData);
    const liveness = await checkBusinessMessagingTokenLiveness(accessToken, businessId);
    if (liveness === 'invalid') {
      throw new Error('TikTok access token is invalid or expired for Business Messaging');
    }
    if (liveness === 'inconclusive') {
      logger.warn('tiktok', 'Business API token liveness inconclusive during init; continuing', { connectionId });
    }

    let userInfo: TikTokUserInfo = {
      open_id: connectionData.accountId,
      display_name: connectionData.accountName || 'TikTok Business',
      ...(connectionData.accountHandle ? { username: connectionData.accountHandle } : {}),
      ...(connectionData.avatarUrl ? { avatar_url: connectionData.avatarUrl } : {}),
    };
    try {
      userInfo = await getUserInfo(accessToken, connectionData.grantedScopes);
    } catch (enrichErr) {
      logger.debug('tiktok', 'Optional v2 user profile fetch failed during init; using connection metadata', {
        connectionId,
        message: enrichErr instanceof Error ? enrichErr.message : String(enrichErr),
      });
    }

    const state = getConnectionState(connectionId);
    state.userInfo = userInfo;
    state.isActive = true;


    startHealthMonitoring(connectionId);
    scheduleProactiveTokenRefresh(connectionId);

    await storage.updateChannelConnectionStatus(connectionId, 'active');

    tiktokLog(connectionId, 'Init', 'Connection initialized successfully', 'INFO');
  } catch (error) {
    logger.error('tiktok', `Error initializing connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Disconnect a TikTok connection
 */
async function disconnectConnection(connectionId: number): Promise<void> {
  try {
    logger.info('tiktok', `Disconnecting connection ${connectionId}`);

    try {
      const { accessToken } = await getTikTokConnectionSecrets(connectionId);
      const platformConfig = await getPlatformConfig();
      const body = new URLSearchParams({
        client_key: platformConfig.clientKey,
        client_secret: platformConfig.clientSecret,
        token: accessToken,
      });
      const revokeResponse = await axios.post(TIKTOK_BUSINESS_REVOKE_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
        validateStatus: () => true,
      });
      const httpOk = revokeResponse.status >= 200 && revokeResponse.status < 300;
      const oauthFail = extractOAuthFailureFromEnvelope(revokeResponse.data);
      if (!httpOk || oauthFail) {
        logger.warn('tiktok', `TikTok token revocation failed for connection ${connectionId}`, {
          httpStatus: revokeResponse.status,
          ...(oauthFail
            ? {
                errorCode: oauthFail.code,
                errorDescription: oauthFail.description,
                logId: oauthFail.logId,
              }
            : {}),
        });
      } else {
        logger.info('tiktok', `TikTok token revoked successfully for connection ${connectionId}`, {
          httpStatus: revokeResponse.status,
        });
      }
    } catch (revokeError) {
      logger.warn('tiktok', `TikTok token revocation request failed for connection ${connectionId}`, {
        error: revokeError instanceof Error ? revokeError.message : String(revokeError),
      });
    }

    stopHealthMonitoring(connectionId);


    activeConnections.delete(connectionId);
    connectionStates.delete(connectionId);


    await storage.updateChannelConnectionStatus(connectionId, 'disconnected');

    logger.info('tiktok', `Connection ${connectionId} disconnected successfully`);
  } catch (error) {
    logger.error('tiktok', `Error disconnecting connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Get connection status
 */
function getConnectionStatus(connectionId: number): ConnectionState | null {
  return connectionStates.get(connectionId) || null;
}

const INIT_CONCURRENCY = 5;
const INIT_RETRY_DELAY_MS = 5000;
const INIT_MAX_RETRIES = 2;

/**
 * Initialize all active TikTok connections on server startup (parallel with concurrency limit)
 */
async function initializeAllConnections(): Promise<void> {
  const startTime = Date.now();
  try {
    tiktokLog(undefined, 'Init', 'Initializing all active TikTok connections...', 'INFO');
    const connections = await storage.getChannelConnectionsByType('tiktok');
    const toInit = connections.filter((c) => c.status === 'active' || c.status === 'connected');
    const failed: { id: number; reason: string }[] = [];
    let initializedCount = 0;

    const runOne = async (connection: { id: number; accountName: string }): Promise<void> => {
      for (let attempt = 1; attempt <= INIT_MAX_RETRIES; attempt++) {
        try {
          await initializeConnection(connection.id);
          initializedCount++;
          scheduleProactiveTokenRefresh(connection.id);
          tiktokLog(connection.id, 'Init', `Initialized (${connection.accountName})`, 'INFO');
          return;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (attempt < INIT_MAX_RETRIES) {
            tiktokLog(connection.id, 'Init', `Attempt ${attempt} failed, retrying in ${INIT_RETRY_DELAY_MS / 1000}s: ${msg}`, 'WARN');
            await new Promise((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
          } else {
            failed.push({ id: connection.id, reason: msg });
            tiktokLog(connection.id, 'Init', `Failed after ${INIT_MAX_RETRIES} attempts: ${msg}`, 'ERROR');
          }
        }
      }
    };

    for (let i = 0; i < toInit.length; i += INIT_CONCURRENCY) {
      const batch = toInit.slice(i, i + INIT_CONCURRENCY);
      await Promise.all(batch.map(runOne));
    }

    const totalTime = Date.now() - startTime;
    const successRate = toInit.length ? (initializedCount / toInit.length) * 100 : 100;
    tiktokLog(
      undefined,
      'Init',
      `TikTok initialization complete: ${initializedCount}/${toInit.length} connections (${successRate.toFixed(1)}%), ${failed.length} failed, ${totalTime}ms`,
      'INFO'
    );
    if (failed.length > 0) {
      tiktokLog(undefined, 'Init', `Failed connection IDs: ${failed.map((f) => f.id).join(', ')}. Reasons: ${failed.map((f) => f.reason).join('; ')}`, 'WARN');
    }
    startBatchTokenRefreshInterval();
    startMessagingWindowExpirationWorker();
    scheduleDailySummary();
  } catch (error) {
    logger.error('tiktok', 'Error initializing TikTok connections:', error);
    throw error;
  }
}





/**
 * Subscribe to TikTok events
 */
export function subscribeToTikTokEvents(
  eventType: 'connectionStatusUpdate',
  callback: (data: { connectionId: number; status: string }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'connectionError',
  callback: (data: { connectionId: number; error: string; requiresReauth?: boolean }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageReceived',
  callback: (data: { connectionId: number; conversationId: number; contactId: number; message: any; conversation?: any; contact?: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageSent',
  callback: (data: { connectionId: number; conversationId: number; message: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageStatusUpdate',
  callback: (data: { messageId: number; status: string; error?: string }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageRead',
  callback: (data: { messageId: number; userId: number; conversationId: number; readAt: Date }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: string,
  callback: (data: any) => void
): () => void {
  return eventEmitterPool.subscribe(TIKTOK_NAMESPACE, eventType, callback);
}

/**
 * Test Business Messaging API connectivity and endpoints
 * Useful for validating Business Messaging API access during partner approval process
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @returns Comprehensive test report with success/failure status for each endpoint
 */
async function testBusinessMessagingAPI(
  connectionId: number,
  companyId: number
): Promise<{
  success: boolean;
  tests: Array<{
    endpoint: string;
    success: boolean;
    error?: string;
    data?: any;
  }>;
}> {
  const tests: Array<{
    endpoint: string;
    success: boolean;
    error?: string;
    data?: any;
  }> = [];

  try {
    // Test 1: listConversations
    try {
      logger.info('tiktok', `Testing listConversations for connection ${connectionId}`);
      const conversationsResult = await listConversations(connectionId, companyId);
      tests.push({
        endpoint: 'listConversations',
        success: true,
        data: {
          count: conversationsResult.conversations.length,
          has_more: conversationsResult.has_more,
          next_cursor: conversationsResult.next_cursor
        }
      });

      // Test 2: getMessages (if conversations exist)
      if (conversationsResult.conversations.length > 0) {
        const firstConversation = conversationsResult.conversations[0];
        try {
          logger.info('tiktok', `Testing getMessages for conversation ${firstConversation.conversation_id}`);
          const messagesResult = await getMessages(
            connectionId,
            companyId,
            firstConversation.conversation_id
          );
          tests.push({
            endpoint: 'getMessages',
            success: true,
            data: {
              conversation_id: firstConversation.conversation_id,
              message_count: messagesResult.messages.length,
              has_more: messagesResult.has_more,
              next_cursor: messagesResult.next_cursor
            }
          });
        } catch (error: any) {
          tests.push({
            endpoint: 'getMessages',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: {
              conversation_id: firstConversation.conversation_id
            }
          });
        }
      } else {
        tests.push({
          endpoint: 'getMessages',
          success: true,
          data: {
            skipped: true,
            reason: 'No conversations available to test'
          }
        });
      }
    } catch (error: any) {
      tests.push({
        endpoint: 'listConversations',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const overallSuccess = tests.every(test => test.success);

    return {
      success: overallSuccess,
      tests
    };
  } catch (error: any) {
    logger.error('tiktok', `Error in testBusinessMessagingAPI for connection ${connectionId}:`, error);
    return {
      success: false,
      tests: [{
        endpoint: 'testBusinessMessagingAPI',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }]
    };
  }
}





export const TikTokService = {

  getPlatformConfig,


  exchangeCodeForToken,
  refreshAccessToken,
  ensureValidToken,


  getUserInfo,
  verifyBusinessAccount,
  detectRegionRestrictions,


  initializeConnection,
  initializeAllConnections,
  disconnectConnection,
  getConnectionStatus,
  startHealthMonitoring,
  stopHealthMonitoring,
  stopAllHealthMonitoring,
  getHealthMonitoringStats,
  getConnectionsNeedingTokenRefresh,
  testTokenRefresh,
  testHealthCheck,
  getHealthMonitoringStatus,
  testBusinessMessagingAPI,

  uploadMedia,
  downloadMedia,
  checkCapabilities,

  checkMessagingWindow,
  getConversationMetadata,
  sendMessage,
  sendAndSaveMessage,
  sendImageMessage,
  sendVideoMessage,
  sendStickerMessage,
  listConversations,
  getMessages,


  processWebhookEvent,
  verifyWebhookSignature,
  applyDataRetentionPolicy,
  validateTikTokScopes,
  testUserDeletionCompliance,
  logTikTokUserDeletion,

  eventEmitter,


  subscribeToEvents: subscribeToTikTokEvents,


  handleTikTokError
};

export default TikTokService;

