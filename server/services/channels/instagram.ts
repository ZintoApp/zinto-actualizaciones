import { storage } from '../../storage';
import { instagramEntryEvents, instagramEventTimestamp, type InstagramWebhookEvent } from './instagram-webhook-events';
import { instagramQuoteMetadata } from '../../../shared/instagram-message-utils';
import { getInstagramUsername, normalizeInstagramRecipientId } from '../../../shared/instagram-contact';
import { instagramConfiguration, subscribeInstagramBusinessAccount } from '../instagram-business-login';
import type { InstagramAccountSubscriptionStatus } from '../../../shared/types/instagram-login';
import { getCachedCompanySetting, getCachedTargetPipelineStage } from '../../utils/pipeline-cache';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
} from '@shared/schema';
import { EventEmitter } from 'events';
import { setMaxListenersSafely } from '../../utils/event-emitter-monitor';
import axios from 'axios';
import { rawAxiosHeaderToString } from '../../utils/axios-headers';
import crypto from 'crypto';
import { lookup as dnsLookup } from 'dns/promises';
import fsExtra from 'fs-extra';
import http from 'http';
import https from 'https';
import path from 'path';
import { logger } from '../../utils/logger';
import { withContactInitialMessageMetadata } from './contact-initial-message-metadata';
import {
  deriveMetaReferralContactTags,
  normalizeInstagramMetaReferral,
} from './meta-referral-normalization';
import { isPrivateOrReservedIP } from '../../utils/is-private-or-reserved-ip';
import {
  META_CDN_HOST_ALLOWLIST,
  hasAllowedHostSuffix,
  isBlockedRemoteHostname,
  isMetaCdnMediaUrl,
  normalizeRemoteHostname
} from '../../utils/remote-url-guard';
import {
  INSTAGRAM_LOGIN_SCOPES,
  type MetaWebhookSubscriptionLevelStatus,
  type MetaWebhookSubscriptionStatus,
} from '../../../shared/types/meta-partner';
import {
  configureInstagramAppWebhook,
  debugToken,
  subscribeInstagramAccountWebhooks,
} from '../meta-graph-api';
import {
  isMetaWebhookSignatureBypassAllowed,
  requireMetaWebhookRawPayload,
} from '../../utils/meta-webhook-security';


interface InstagramAccountInfo {
  id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count: number;
}
interface InstagramConnectionData {
  authMethod?: 'instagram_login' | 'facebook_login';
  requiresReauth?: boolean;
  instagramSubscription?: InstagramAccountSubscriptionStatus;
  grantedPermissions?: string[];
  instagramAccountId?: string;
  linkedPageId?: string;
  linkedPageName?: string;
  accountInfo?: InstagramAccountInfo;
  appId?: string;
  appSecret?: string;
  webhookUrl?: string;
  verifyToken?: string;
  webhookSubscriptionStatus?: MetaWebhookSubscriptionStatus;
  lastConnectedAt?: string;
  lastValidatedAt?: string;
  accessTokenExpiresAt?: string;
  lastTokenRefresh?: string;
  features?: {
    mediaMessages?: boolean;
    stories?: boolean;
    quickReplies?: boolean;
    templates?: boolean;
  };
  settings?: {
    autoResponses?: boolean;
    messageTemplates?: any[];
    quickReplies?: any[];
  };
  healthCheckStatus?: Record<string, any>;
}

interface ChannelConnection {
  id: number;
  userId: number;
  companyId: number;
  accountName?: string | null;
  accountId?: string | null;
  accessToken?: string | null;
  connectionData?: InstagramConnectionData | Record<string, any> | null;
  channelType: 'instagram' | string;
  status: 'active' | 'inactive' | 'error' | 'connected' | 'disconnected' | 'pending' | string;
}

type Contact = ReturnType<typeof storage.createContact> extends Promise<infer T> ? T : any;
type Conversation = ReturnType<typeof storage.createConversation> extends Promise<infer T> ? T : any;
type Message = ReturnType<typeof storage.createMessage> extends Promise<infer T> ? T : any;


interface InstagramWebhookMessageAttachment {
  type: string;
  payload?: {
    url?: string;
    sticker_id?: string;
  };
  title?: string;
  url?: string;
}

interface InstagramMediaUploadResponse {
  id: string;
}

interface InstagramMessageTemplate {
  id: string;
  name: string;
  content: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  quickReplies?: string[];
}

interface InstagramQuickReply {
  content_type: 'text';
  title: string;
  payload: string;
}

interface InstagramWebhookReferral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  source_id?: string;
  source_type?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  thumbnail_url?: string;
  video_url?: string;
  ctwa_clid?: string;
  referer_uri?: string;
}

interface InstagramWebhookMessage {
  mid: string;
  text?: string;
  attachments?: InstagramWebhookMessageAttachment[];
  timestamp?: number;
  is_deleted?: boolean;
  is_echo?: boolean;
  reply_to?: { mid?: string; story?: { id?: string; url?: string } };
  referral?: InstagramWebhookReferral;
}

type InstagramWebhookMessagingEvent = InstagramWebhookEvent;

interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging?: InstagramWebhookMessagingEvent[];
  changes?: Array<{
    field: string;
    value: {
      sender: { id: string };
      recipient: { id: string };
      timestamp: string | number;
      message: {
        mid: string;
        text: string;
        is_echo?: boolean;
      };
    };
  }>;
}

interface InstagramWebhookBody {
  object: 'instagram' | string;
  entry?: InstagramWebhookEntry[];
  'hub.mode'?: 'subscribe';
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

interface ConnectionStatusUpdatePayload {
  connectionId: number;
  status: ChannelConnection['status'];
  accountInfo?: InstagramAccountInfo;
}

interface ConnectionErrorPayload {
  connectionId: number;
  error: string;
  requiresReauth?: boolean;
}

interface MessageReceivedPayload {
  message: Message;
  conversation: Conversation;
  contact: Contact;
  connection: ChannelConnection;
}

interface InstagramAccountInfoResponse extends InstagramAccountInfo {}
interface InstagramMessageSendResponse {
  message_id: string;
  recipient_id?: string;
}

interface InstagramUserProfile {
  id: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  is_verified_user?: boolean;
  follower_count?: number;
  is_user_follow_business?: boolean;
  is_business_follow_user?: boolean;
}

interface InstagramSubscriptionResponse {
    success?: boolean;
}


interface InstagramMediaMessageRequestBody {
  recipient: { id: string };
  reply_to?: { mid: string };
  message: {
    attachment: {
      type: 'image' | 'video' | 'audio' | 'file';
      payload: { url?: string; attachment_id?: string; is_reusable?: boolean };
    };
  };
}

declare global {
  var broadcastToAllClients: ((payload: { type: string; data: any }) => void) | undefined;
}


interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  accountInfo: any | null;
  consecutiveFailures: number;
  lastSuccessfulValidation: Date | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastRecoveryAttempt: Date | null;
}


const HEALTH_CHECK_INTERVALS = {
  ACTIVE: 120000, // 2 minutes
  INACTIVE: 300000, // 5 minutes
  ERROR: 60000, // 1 minute
  RECOVERY: 30000 // 30 seconds
};


const ACTIVITY_THRESHOLDS = {
  INACTIVE_TIMEOUT: 600000, // 10 minutes
  ACTIVE_THRESHOLD: 300000, // 5 minutes
  TOKEN_VALIDATION_INTERVAL: 3600000, // 1 hour
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_BACKOFF_BASE: 30000 // 30 seconds
};

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const healthMonitoringIntervals = new Map<number, NodeJS.Timeout>();
const recoveryTimeouts = new Map<number, NodeJS.Timeout>();
const eventEmitter = new EventEmitter();
setMaxListenersSafely(eventEmitter, 0, 'instagram');

import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
eventEmitterMonitor.register('instagram-service', eventEmitter);

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
      accountInfo: null
      ,consecutiveFailures: 0
      ,lastSuccessfulValidation: null
      ,isRecovering: false
      ,recoveryAttempts: 0
      ,lastRecoveryAttempt: null
    });
  }
  return connectionStates.get(connectionId)!;
}

/**
 * Update connection activity
 */
export function updateConnectionActivity(connectionId: number, success: boolean = true, error?: string) {
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
      logger.info('instagram', `Connection ${connectionId} recovered successfully`);

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


async function validateTokenHealth(connectionId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) return false;

    const connectionData = connection.connectionData as InstagramConnectionData | undefined;
      const accessToken = connection.accessToken;
    const instagramAccountId = connectionData?.instagramAccountId;

    if (!accessToken || !instagramAccountId) return false;

    const response = await axios.get(
      buildInstagramAccountUrl(connectionData),
      {
        params: { fields: 'id,username' },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      }
    );

    if (response.status === 200) {
      updateConnectionActivity(connectionId, true);
      logger.debug('instagram', `Token validation successful for connection ${connectionId}`);
      return true;
    }

    return false;
  } catch (error: any) {
    logger.warn('instagram', `Token validation failed for connection ${connectionId}:`, error?.message || error);

    const status = error?.response?.status;
    const graphErrorCode = error?.response?.data?.error?.code;

    if (status === 401 || status === 403 || (status === 400 && graphErrorCode === 190)) {
      await handleTokenExpiration(connectionId);
    } else {
      updateConnectionActivity(connectionId, false, error?.message || String(error));
    }

    return false;
  }
}

async function handleTokenExpiration(connectionId: number): Promise<void> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    const data = connection?.connectionData as InstagramConnectionData | undefined;
    if (data?.authMethod === 'instagram_login') {
      await storage.updateChannelConnection(connectionId, { connectionData: { ...data, requiresReauth: true } });
    }
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    const state = getConnectionState(connectionId);
    state.lastError = 'Access token expired or invalid';
    state.isActive = false;

    eventEmitter.emit('connectionError', { connectionId, error: 'Access token expired or invalid', requiresReauth: true } as ConnectionErrorPayload);
    logger.error('instagram', `Access token expired for connection ${connectionId}`);
  } catch (error: any) {
    logger.error('instagram', `Error handling token expiration for connection ${connectionId}:`, error);
  }
}

async function initiateConnectionRecovery(connectionId: number): Promise<void> {
  const state = getConnectionState(connectionId);


  if (state.isRecovering) return;


  if ((state.recoveryAttempts || 0) >= ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
    logger.error('instagram', `Max recovery attempts reached for connection ${connectionId}`);
    try {
      await storage.updateChannelConnectionStatus(connectionId, 'error');
    } catch (err) {
      logger.error('instagram', `Failed to mark connection ${connectionId} as error:`, err);
    }
    return;
  }


  state.isRecovering = true;
  state.recoveryAttempts = (state.recoveryAttempts || 0) + 1;
  state.lastRecoveryAttempt = new Date();
  logger.info('instagram', `Initiating recovery for connection ${connectionId} (attempt ${state.recoveryAttempts})`);


  const backoffDelay = ACTIVITY_THRESHOLDS.RECOVERY_BACKOFF_BASE * Math.pow(2, (state.recoveryAttempts || 1) - 1);


  const recoveryTimeout = setTimeout(async () => {
    try {
      const success = await validateTokenHealth(connectionId);

      if (success) {
        logger.info('instagram', `Recovery succeeded for connection ${connectionId}`);

      } else {

        if ((state.recoveryAttempts || 0) < ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
          logger.info('instagram', `Recovery attempt ${state.recoveryAttempts} failed for connection ${connectionId}, scheduling retry`);


          const prev = recoveryTimeouts.get(connectionId);
          if (prev) {
            clearTimeout(prev);
            recoveryTimeouts.delete(connectionId);
          }

          const retryTimeout = setTimeout(async () => {

            recoveryTimeouts.delete(connectionId);
            try {
              const latestState = getConnectionState(connectionId);

              if (latestState.isRecovering) return;
              if ((latestState.consecutiveFailures || 0) < 3) return;

              const conn = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
              if (!conn) return;

              if (conn.status === 'error' || conn.status === 'disconnected' || conn.status === 'inactive' || !activeConnections.has(connectionId)) return;


              await initiateConnectionRecovery(connectionId);
            } catch (e) {
              logger.error('instagram', `Error running scheduled recovery retry for ${connectionId}:`, e);
            }
          }, backoffDelay) as unknown as NodeJS.Timeout;

          recoveryTimeouts.set(connectionId, retryTimeout);
        } else {

          state.isRecovering = false;
          try {
            await storage.updateChannelConnectionStatus(connectionId, 'error');
          } catch (err) {
            logger.error('instagram', `Failed to mark connection ${connectionId} as error after recovery attempts:`, err);
          }
          logger.error('instagram', `Recovery failed for connection ${connectionId} after ${state.recoveryAttempts} attempts`);
        }
      }
    } catch (err) {
      logger.error('instagram', `Error during recovery attempt for connection ${connectionId}:`, err);
      state.isRecovering = false;
    } finally {
      recoveryTimeouts.delete(connectionId);
    }
  }, backoffDelay);

  recoveryTimeouts.set(connectionId, recoveryTimeout as unknown as NodeJS.Timeout);
}

/**
 * Determine adaptive health check interval based on connection state
 */
function getAdaptiveHealthCheckInterval(state: ConnectionState): number {
  if (state.isRecovering) return HEALTH_CHECK_INTERVALS.RECOVERY;
  if (state.errorCount > 0) return HEALTH_CHECK_INTERVALS.ERROR;
  if (state.isActive) return HEALTH_CHECK_INTERVALS.ACTIVE;
  return HEALTH_CHECK_INTERVALS.INACTIVE;
}

/**
 * Stop health monitoring and clear timers for a connection
 */
function stopHealthMonitoring(connectionId: number) {
  const interval = healthMonitoringIntervals.get(connectionId);
  if (interval) {
    clearTimeout(interval);
    healthMonitoringIntervals.delete(connectionId);
  }

  const recovery = recoveryTimeouts.get(connectionId);
  if (recovery) {
    clearTimeout(recovery);
    recoveryTimeouts.delete(connectionId);
  }
}

/**
 * Start health monitoring loop for a connection
 */
function startHealthMonitoring(connectionId: number) {
  stopHealthMonitoring(connectionId);

  const performHealthCheck = async () => {
    try {
      const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
      if (!connection) {
        stopHealthMonitoring(connectionId);
        return;
      }

      const state = getConnectionState(connectionId);

      const data = connection.connectionData as InstagramConnectionData;
      if (data?.authMethod === 'instagram_login') {
        if (data.requiresReauth) { stopHealthMonitoring(connectionId); return; }
        if (await checkTokenExpiry(connectionId)) {
          await refreshInstagramAccessToken(connectionId);
          const refreshed = await storage.getChannelConnection(connectionId);
          if ((refreshed?.connectionData as InstagramConnectionData)?.requiresReauth) {
            stopHealthMonitoring(connectionId);
            return;
          }
        }
      }

      let validated = true;
      const timeSinceValidation = state.lastSuccessfulValidation ? (Date.now() - state.lastSuccessfulValidation.getTime()) : Infinity;
      if (timeSinceValidation > ACTIVITY_THRESHOLDS.TOKEN_VALIDATION_INTERVAL) {

        validated = await validateTokenHealth(connectionId);
      }


      if (validated && !state.isActive && connection.status !== 'error') {
        state.isActive = true;
        await storage.updateChannelConnectionStatus(connectionId, 'active');
        eventEmitter.emit('connectionStatusUpdate', { connectionId, status: 'active' });
        logger.info('instagram', `Connection ${connectionId} marked active`);
      }

      const nextInterval = getAdaptiveHealthCheckInterval(state);
      const timeout = setTimeout(performHealthCheck, nextInterval);
      healthMonitoringIntervals.set(connectionId, timeout);
    } catch (error: any) {
      logger.error('instagram', 'Health check error for connection ' + connectionId + ':', error);
      updateConnectionActivity(connectionId, false, error?.message || String(error));

      const timeout = setTimeout(performHealthCheck, HEALTH_CHECK_INTERVALS.ERROR);
      healthMonitoringIntervals.set(connectionId, timeout);
    }
  };


  performHealthCheck();
}

/**
 * Initialize health monitoring for all active Instagram connections.
 * This should be called when the server starts.
 */
export async function initializeHealthMonitoring(): Promise<void> {
  try {
    const connections = await storage.getChannelConnectionsByType('instagram');
    for (const conn of connections) {
      if ((conn.status === 'active' || conn.status === 'connected') && !healthMonitoringIntervals.has(conn.id)) {
        activeConnections.set(conn.id, true);
        updateConnectionActivity(conn.id, true);
        startHealthMonitoring(conn.id);
        logger.info('instagram', `Started health monitoring for connection ${conn.id}`);
      }
    }
  } catch (error: any) {
    logger.error('instagram', 'Error initializing health monitoring:', error);
  }
}

/**
 * Process a message through the flow executor
 * This function handles flow execution for Instagram messages
 */
async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: any
): Promise<void> {
  try {
    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;

    if (contact) {
      await flowExecutor.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error) {
    logger.error('instagram', 'Error in flow executor:', error);
    throw error;
  }
}

/**
 * Enhanced error handling utilities for Instagram service
 */

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2
};

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;


    if (status && (status >= 500 || status === 429)) {
      return true;
    }


    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return true;
    }


    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  connectionId?: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: any;
  let attempts = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      attempts++;
      const result = await operation();


      if (connectionId && attempt > 0) {
        updateConnectionActivity(connectionId, true);
        logger.info('instagram', `${operationName} succeeded after ${attempt} retries`);
      }

      return result;
    } catch (error) {
      lastError = error;


      if (connectionId) {
        const errorMessage = getSafeInstagramErrorDetails(error);
        updateConnectionActivity(connectionId, false, errorMessage);
      }


      if (attempt === config.maxRetries || !isRetryableError(error)) {
        break;
      }

      const delay = calculateRetryDelay(attempt, config);
      logger.warn('instagram', `${operationName} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, getSafeInstagramErrorDetails(error));

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }


  logger.error('instagram', `${operationName} failed after ${attempts} attempt(s):`, getSafeInstagramErrorDetails(lastError));
  throw lastError;
}

/**
 * Get connection health status
 */
export function getConnectionHealth(connectionId: number): {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  healthScore: number;
} {
  const state = getConnectionState(connectionId);
  const isActive = activeConnections.has(connectionId);


  let healthScore = 100;
  if (state.errorCount > 0) {
    healthScore = Math.max(0, 100 - (state.errorCount * 10));
  }

  const timeSinceActivity = Date.now() - state.lastActivity.getTime();
  if (timeSinceActivity > 300000) { // 5 minutes
    healthScore = Math.max(0, healthScore - 20);
  }

  return {
    isActive,
    lastActivity: state.lastActivity,
    errorCount: state.errorCount,
    lastError: state.lastError,
    healthScore
  };
}

const INSTAGRAM_API_VERSION = 'v25.0';
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com';
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com';
const INSTAGRAM_NATIVE_REPLY_UNAVAILABLE = 'Native quoted replies are not available for Instagram Login connections. Use the inbox Reply action to send a visible text quote instead. Incoming quoted messages are still supported.';

function resolveInstagramMessagingTarget(connectionData?: InstagramConnectionData | Record<string, any> | null): {
  graphUrl: string;
  objectId?: string;
  isLinkedPageConnection: boolean;
} {
  const linkedPageId = typeof connectionData?.linkedPageId === 'string'
    ? connectionData.linkedPageId.trim()
    : '';
  const instagramAccountId = typeof connectionData?.instagramAccountId === 'string'
    ? connectionData.instagramAccountId.trim()
    : '';

  if (linkedPageId) {
    return {
      graphUrl: FACEBOOK_GRAPH_URL,
      objectId: linkedPageId,
      isLinkedPageConnection: true,
    };
  }

  return {
    graphUrl: INSTAGRAM_GRAPH_URL,
    objectId: instagramAccountId,
    isLinkedPageConnection: false,
  };
}

function buildInstagramGraphEdgeUrl(
  connectionData: InstagramConnectionData | Record<string, any> | null | undefined,
  edge: 'messages' | 'media' | 'message_attachments'
): string {
  const target = resolveInstagramMessagingTarget(connectionData);
  if (!target.objectId) {
    throw new Error(target.isLinkedPageConnection
      ? 'Linked Facebook Page ID is missing from connectionData.'
      : 'Instagram account ID is missing from connectionData.');
  }

  return `${target.graphUrl}/${INSTAGRAM_API_VERSION}/${target.objectId}/${edge}`;
}

async function uploadInstagramMessageAttachment(
  accessToken: string,
  connectionData: InstagramConnectionData | Record<string, any> | null | undefined,
  filePath: string,
  mediaType: 'image' | 'video' | 'audio' | 'file'
): Promise<{ success: boolean; attachmentId?: string; error?: string }> {
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return { success: false, error: `Instagram media file not found: ${path.basename(filePath)}` };
    }

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('message', JSON.stringify({
      attachment: {
        type: mediaType,
        payload: { is_reusable: true },
      },
    }));
    formData.append('filedata', fsExtra.createReadStream(filePath));

    const messagingTarget = resolveInstagramMessagingTarget(connectionData);
    // Facebook Page-linked Instagram messaging requires platform=instagram on attachment upload.
    if (messagingTarget.isLinkedPageConnection) {
      formData.append('platform', 'instagram');
    }

    const uploadUrl = buildInstagramGraphEdgeUrl(connectionData, 'message_attachments');
    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...formData.getHeaders(),
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const attachmentId = uploadResponse.data?.attachment_id;
    if (uploadResponse.status === 200 && typeof attachmentId === 'string' && attachmentId.trim()) {
      return { success: true, attachmentId };
    }

    return { success: false, error: 'Failed to upload media attachment to Instagram' };
  } catch (error: unknown) {
    return { success: false, error: getSafeInstagramErrorDetails(error) };
  }
}

function buildInstagramAccountUrl(
  connectionData: InstagramConnectionData | Record<string, any> | null | undefined
): string {
  const target = resolveInstagramMessagingTarget(connectionData);
  const instagramAccountId = typeof connectionData?.instagramAccountId === 'string'
    ? connectionData.instagramAccountId.trim()
    : '';
  const objectId = target.isLinkedPageConnection ? instagramAccountId : target.objectId;

  if (!objectId) {
    throw new Error('Instagram account ID is missing from connectionData.');
  }

  return `${target.graphUrl}/${INSTAGRAM_API_VERSION}/${objectId}`;
}

function isAllowedMetaCdnHost(hostname: string): boolean {
  return hasAllowedHostSuffix(hostname, META_CDN_HOST_ALLOWLIST);
}

function createPinnedLookup(
  expectedHostname: string,
  addresses: Array<{ address: string; family: 4 | 6 }>
) {
  return (hostname: string, options: any, callback: any) => {
    if (normalizeRemoteHostname(hostname) !== expectedHostname) {
      callback(new Error('Unexpected remote image hostname'));
      return;
    }

    if (options?.all) {
      callback(null, addresses);
      return;
    }

    const preferredFamily = options?.family === 4 || options?.family === 6 ? options.family : null;
    const selected = preferredFamily
      ? addresses.find(address => address.family === preferredFamily) || addresses[0]
      : addresses[0];
    callback(null, selected.address, selected.family);
  };
}

async function validateMetaCdnMediaUrl(mediaUrl: string): Promise<{
  parsedUrl: URL;
  hostname: string;
  addresses: Array<{ address: string; family: 4 | 6 }>;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    throw new Error('Meta media URL is invalid');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Meta media URL protocol is not allowed');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Meta media URL credentials are not allowed');
  }

  const hostname = normalizeRemoteHostname(parsedUrl.hostname);
  if (!hostname || !isAllowedMetaCdnHost(hostname)) {
    throw new Error('Meta media URL host is not allowed');
  }
  if (isBlockedRemoteHostname(hostname)) {
    throw new Error('Meta media URL host is not allowed');
  }

  const addresses = await dnsLookup(hostname, { all: true, verbatim: true }) as Array<{ address: string; family: 4 | 6 }>;
  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIP(address))) {
    throw new Error('Meta media URL host is not allowed');
  }

  return { parsedUrl, hostname, addresses };
}


export function verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
  if (!signature) {
    console.error('Error verifying Instagram webhook signature: No signature provided.');
    return false;
  }
  try {
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(payload, 'utf8');
    const expectedSignature = hmac.digest('hex');

    const providedSignature = signature.startsWith('sha256=')
      ? signature.substring('sha256='.length)
      : signature;

    if (expectedSignature.length !== providedSignature.length) {
        console.error('Error verifying Instagram webhook signature: Signature length mismatch.');
        return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying Instagram webhook signature:', error);
    return false;
  }
}

export async function connectToInstagram(connectionId: number, userId: number, companyId?: number): Promise<void> {
  let currentConnection: ChannelConnection | null = null;
  try {
    logger.info('instagram', `Connecting to Instagram for connection ${connectionId} by user ${userId} (company: ${companyId})`);

    const connectionResult = await storage.getChannelConnection(connectionId);
    if (!connectionResult) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }
    currentConnection = connectionResult as ChannelConnection;


    if (companyId && currentConnection.companyId && currentConnection.companyId !== companyId) {
      logger.error('instagram', `Company ID mismatch: Connection ${connectionId} belongs to company ${currentConnection.companyId}, but user is from company ${companyId}`);
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    if (currentConnection.userId !== userId) {
      logger.error('instagram', `Unauthorized access attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }


    const accessToken = currentConnection.accessToken;
    const instagramAccountId = (currentConnection.connectionData as InstagramConnectionData)?.instagramAccountId;

    if (!accessToken) {
      throw new Error('Instagram access token is missing for this connection.');
    }
    if (!instagramAccountId) {
      throw new Error('Instagram account ID is missing from connectionData.');
    }


    const connectionData = currentConnection.connectionData as InstagramConnectionData;
    const validationResult = await validateConnectionConfiguration(connectionData, accessToken);
    if (!validationResult.success) {
      await storage.updateChannelConnectionStatus(connectionId, 'error');
      updateConnectionActivity(connectionId, false, validationResult.error);

      eventEmitter.emit('connectionError', {
        connectionId,
        error: validationResult.error
      });

      throw new Error(`Connection validation failed: ${validationResult.error}`);
    }


  await storage.updateChannelConnectionStatus(connectionId, 'active');

    const updatedConnectionData: InstagramConnectionData = {
      ...(connectionData || {}),
      instagramAccountId: validationResult.accountInfo?.id || connectionData.instagramAccountId,
      accountInfo: validationResult.accountInfo,
      lastConnectedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString()
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData as Record<string, any>,
    });

    activeConnections.set(connectionId, true);
    updateConnectionActivity(connectionId, true);

    logger.info('instagram', `Connection ${connectionId} established successfully for account: ${validationResult.accountInfo?.username}`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'active',
      accountInfo: validationResult.accountInfo
    } as ConnectionStatusUpdatePayload);
  } catch (error: unknown) {
    const baseMessage = `Error connecting to Instagram (ID: ${connectionId}):`;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('instagram', baseMessage, errorMessage);

    if (connectionId && (currentConnection || await storage.getChannelConnection(connectionId))) {
        await storage.updateChannelConnectionStatus(connectionId, 'error');
        updateConnectionActivity(connectionId, false, errorMessage);
    }
    if (error instanceof Error) throw error;
    throw new Error(`${baseMessage} ${errorMessage}`);
  }
}

export async function disconnectFromInstagram(connectionId: number, userId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      logger.warn('instagram', `Connection ${connectionId} not found for disconnection`);
      return false;
    }


    if (connection.userId !== userId) {
      logger.error('instagram', `Unauthorized disconnect attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }

  activeConnections.delete(connectionId);
  updateConnectionActivity(connectionId, true);
  await storage.updateChannelConnectionStatus(connectionId, 'inactive');

    logger.info('instagram', `Instagram connection ${connectionId} disconnected successfully`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'inactive'
    } as ConnectionStatusUpdatePayload);

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('instagram', `Error disconnecting from Instagram (ID: ${connectionId}):`, errorMessage);
    return false;
  }
}

export function isInstagramConnectionActive(connectionId: number): boolean {
  return activeConnections.has(connectionId);
}

export function getActiveInstagramConnections(): number[] {
  return Array.from(activeConnections.keys());
}

function getSafeInstagramErrorDetails(error: unknown): string {
  const value = error as { message?: unknown; response?: { data?: { error?: Record<string, unknown> } } } | null;
  const providerError = value?.response?.data?.error;
  const details = providerError
    ? [providerError.message, providerError.error_user_msg,
        typeof providerError.code === 'number' ? `Code: ${providerError.code}` : null,
        typeof providerError.fbtrace_id === 'string' ? `Trace ID: ${providerError.fbtrace_id}` : null]
        .filter(part => typeof part === 'string' && part).join(' ')
    : typeof value?.message === 'string' ? value.message : 'Instagram request failed';
  return details.replace(/Bearer\s+[^\s"'\\]+/gi, 'Bearer [redacted]')
    .replace(/((?:access_token|client_secret)\s*[=:]\s*)[^\s&"'\\]+/gi, '$1[redacted]')
    .replace(/\b(?:IGAA|EAA)[A-Za-z0-9_-]{20,}/g, '[redacted]');
}


/**
 * Enhanced send message function that integrates with the inbox system
 * @param connectionId The channel connection ID
 * @param userId The user ID sending the message
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient Instagram user ID (IGSID)
 * @param message The message content
 * @returns The saved message object
 */
export async function sendMessage(connectionId: number, userId: number, companyId: number, to: string, message: string) {
  try {
    const recipientId = normalizeInstagramRecipientId(to);
    if (!recipientId) throw new Error('Instagram recipient ID must contain digits only. Refresh the contact profile and try again.');
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as InstagramConnectionData;
    const instagramAccountId = connectionData?.instagramAccountId;

    if (!accessToken) {
      throw new Error('Instagram access token is missing');
    }

    if (!instagramAccountId) {
      throw new Error('Instagram account ID is missing');
    }

    const messagesUrl = buildInstagramGraphEdgeUrl(connectionData, 'messages');

    const response = await axios.post<InstagramMessageSendResponse>(
      messagesUrl,
      { recipient: { id: recipientId }, message: { text: message } },
      {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.message_id) {
      const messageId = response.data.message_id;


      const conversation = await findOrCreateConversation(connectionId, recipientId, companyId);


      const savedMessage = await storage.createMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        type: 'text',
        content: message,
        senderId: userId,
        senderType: 'user',
        isFromBot: false,
        externalId: messageId || `instagram-${Date.now()}`,
        metadata: JSON.stringify({
          instagram_message_id: messageId,
          timestamp: new Date().toISOString(),
          instagram_account_id: instagramAccountId,
          recipient_id: recipientId
        })
      });


      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date()
      });


      const fullConversation = await storage.getConversation(conversation.id);


      eventEmitter.emit('messageSent', {
        message: savedMessage,
        conversation: fullConversation
      });

      return savedMessage;
    } else {
      throw new Error('Failed to send message: Unknown error');
    }
  } catch (error: any) {
    const errorMessage = getSafeInstagramErrorDetails(error);
    logger.error('instagram', 'Error sending Instagram message:', errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Send a text message via Instagram (legacy function for backward compatibility)
 * @param connectionId The ID of the channel connection
 * @param to The recipient Instagram user ID (IGSID)
 * @param message The message text to send
 * @param userId Optional user ID for authorization
 * @returns Promise with send result
 */
export async function sendInstagramMessage(
  connectionId: number,
  to: string,
  message: string,
  userId?: number,
  replyToMid?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const recipientId = normalizeInstagramRecipientId(to);
    if (!recipientId) throw new Error('Instagram recipient ID must contain digits only. Refresh the contact profile and try again.');
    return await executeWithRetry(
      async () => {
        const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
        if (!connection) {
          throw new Error(`Connection with ID ${connectionId} not found`);
        }

        if (userId && connection.userId !== userId) {
          throw new Error('Unauthorized access to channel connection');
        }

        const accessToken = connection.accessToken;
        const connectionData = connection.connectionData as InstagramConnectionData;
        const instagramAccountId = connectionData?.instagramAccountId;

        // Meta documents reply_to.mid for Facebook-linked Instagram messaging.
        // Direct Instagram Login rejects these references even when its read API can retrieve the message.
        if (replyToMid && !resolveInstagramMessagingTarget(connectionData).isLinkedPageConnection) {
          return { success: false, error: INSTAGRAM_NATIVE_REPLY_UNAVAILABLE };
        }

        if (!accessToken) {
          throw new Error('Instagram access token is missing.');
        }
        if (!instagramAccountId) {
          throw new Error('Instagram account ID is missing from connectionData.');
        }

        const messagesUrl = buildInstagramGraphEdgeUrl(connectionData, 'messages');

        const response = await axios.post<InstagramMessageSendResponse>(
          messagesUrl,
          { recipient: { id: recipientId }, message: { text: message }, ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}) },
          {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            timeout: 10000 // 10 second timeout
          }
        );

        if (response.status === 200 && response.data?.message_id) {
          return { success: true, messageId: response.data.message_id };
        } else {
          throw new Error(`Failed to send message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`);
        }
      },
      'Instagram message sending',
      connectionId
    );
  } catch (error: unknown) {
    const errorMessage = getSafeInstagramErrorDetails(error);
    logger.error('instagram', 'Error sending Instagram message:', errorMessage);
    return { success: false, error: errorMessage };
  }
}



/**
 * Upload media to Instagram for messaging
 */
export async function uploadInstagramMedia(
  connectionId: number,
  mediaUrl: string,
  mediaType: 'image' | 'video'
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as InstagramConnectionData;
    const instagramAccountId = connectionData?.instagramAccountId;

    if (!accessToken || !instagramAccountId) {
      return { success: false, error: 'Instagram credentials missing' };
    }


    const mediaUrlEndpoint = buildInstagramGraphEdgeUrl(connectionData, 'media');

    const uploadResponse = await axios.post(
      mediaUrlEndpoint,
      {
        image_url: mediaType === 'image' ? mediaUrl : undefined,
        video_url: mediaType === 'video' ? mediaUrl : undefined,
        media_type: mediaType.toUpperCase()
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (uploadResponse.status === 200 && uploadResponse.data?.id) {
      return {
        success: true,
        mediaId: uploadResponse.data.id
      };
    } else {
      return {
        success: false,
        error: 'Failed to upload media to Instagram'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error uploading media:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Media upload failed'
    };
  }
}

export async function downloadInstagramMedia(
  mediaUrl: string,
  accessToken: string,
  mediaType: string,
  messageId: number
): Promise<string | null> {
  try {
    const validatedUrl = await validateMetaCdnMediaUrl(mediaUrl);
    const pinnedLookup = createPinnedLookup(validatedUrl.hostname, validatedUrl.addresses);

    // Download media from Instagram CDN
    const response = await axios.get(validatedUrl.parsedUrl.toString(), {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      timeout: 30000,
      maxRedirects: 0,
      httpAgent: new http.Agent({ lookup: pinnedLookup }),
      httpsAgent: new https.Agent({ lookup: pinnedLookup })
    });

    if (response.status !== 200) {
      logger.error('instagram', `Failed to download media: HTTP ${response.status}`);
      return null;
    }

    // Determine file extension from content-type or URL
    const contentType = rawAxiosHeaderToString(response.headers['content-type']);
    let extension = '.jpg';
    if (contentType.includes('png')) extension = '.png';
    else if (contentType.includes('gif')) extension = '.gif';
    else if (contentType.includes('webp')) extension = '.webp';
    else if (contentType.includes('mp4')) extension = '.mp4';
    else if (contentType.includes('mpeg')) extension = '.mp3';
    else if (contentType.includes('ogg')) extension = '.ogg';
    else if (contentType.includes('pdf')) extension = '.pdf';
    else if (mediaType === 'video') extension = '.mp4';
    else if (mediaType === 'audio') extension = '.mp3';

    // Create uploads directory for Instagram media
    const uploadDir = path.join(process.cwd(), 'uploads', 'instagram');
    await fsExtra.ensureDir(uploadDir);

    // Generate unique filename
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const filename = `${messageId}_${uniqueId}${extension}`;
    const filePath = path.join(uploadDir, filename);

    // Save media to disk
    await fsExtra.writeFile(filePath, response.data);

    logger.info('instagram', `Media downloaded successfully: ${filename}`);
    return `/uploads/instagram/${filename}`;
  } catch (error: any) {
    logger.error('instagram', `Error downloading Instagram media: ${error.message}`);
    return null;
  }
}

export async function sendInstagramMediaMessage(
  connectionId: number,
  to: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' | 'audio' | 'file',
  caption?: string,
  userId?: number,
  replyToMid?: string,
  localFilePath?: string
): Promise<{ success: boolean; messageId?: string; captionMessageId?: string; error?: string }> {
  try {
    const recipientId = normalizeInstagramRecipientId(to);
    if (!recipientId) throw new Error('Instagram recipient ID must contain digits only. Refresh the contact profile and try again.');
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }


    if (userId && connection.userId !== userId) {
      return { success: false, error: 'Unauthorized access to channel connection' };
    }

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as InstagramConnectionData;
    const instagramAccountId = connectionData?.instagramAccountId;
    if (replyToMid && !resolveInstagramMessagingTarget(connectionData).isLinkedPageConnection) {
      return { success: false, error: INSTAGRAM_NATIVE_REPLY_UNAVAILABLE };
    }

    if (!accessToken) {
      return { success: false, error: 'Instagram access token is missing.' };
    }
    if (!instagramAccountId) {
      return { success: false, error: 'Instagram account ID is missing from connectionData.' };
    }

    const messagesUrl = buildInstagramGraphEdgeUrl(connectionData, 'messages');
    const messagingTarget = resolveInstagramMessagingTarget(connectionData);

    let attachmentPayload: { url?: string; attachment_id?: string; is_reusable?: boolean };

    if (localFilePath) {
      const uploadResult = await uploadInstagramMessageAttachment(
        accessToken,
        connectionData,
        localFilePath,
        mediaType
      );
      if (!uploadResult.success || !uploadResult.attachmentId) {
        return { success: false, error: uploadResult.error || 'Failed to upload Instagram media attachment' };
      }
      attachmentPayload = { attachment_id: uploadResult.attachmentId };
    } else {
      attachmentPayload = {
        url: mediaUrl,
        ...(['audio', 'file'].includes(mediaType) ? {} : { is_reusable: true }),
      };
    }

    const mediaResult = await executeWithRetry(
      async () => {
        const mediaRequest: InstagramMediaMessageRequestBody = {
          recipient: { id: recipientId },
          ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}),
          message: {
            attachment: { type: mediaType, payload: attachmentPayload }
          }
        };

        const response = await axios.post<InstagramMessageSendResponse>(
          messagesUrl,
          mediaRequest,
          {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            timeout: 15000 // 15 second timeout for media
          }
        );

        if (response.status === 200 && response.data?.message_id) {
          return { success: true, messageId: response.data.message_id };
        } else {
          throw new Error(`Failed to send media message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`);
        }
      },
      'Instagram media message sending',
      connectionId
    );

    const trimmedCaption = caption?.trim();
    if (trimmedCaption && mediaResult.messageId) {
      try {
        const captionResult = await sendInstagramMessage(connectionId, recipientId, trimmedCaption, userId);
        if (captionResult.success) {
          return {
            success: true,
            messageId: mediaResult.messageId,
            captionMessageId: captionResult.messageId
          };
        }

        const captionError = captionResult.error || 'Unknown caption delivery error';
        logger.error('instagram', 'Failed to send Instagram media caption:', {
          connectionId,
          error: captionError
        });
        
        return {
          success: false,
          error: `Media sent but caption failed: ${captionError}`
        };
      } catch (captionError: unknown) {
        const errorMessage = captionError instanceof Error ? captionError.message : String(captionError);
        logger.error('instagram', 'Error sending Instagram media caption:', {
          connectionId,
          error: errorMessage
        });
        
        return {
          success: false,
          error: `Media sent but caption error occurred: ${errorMessage}`
        };
      }
    }

    return mediaResult;
  } catch (error: unknown) {
    const errorMessage = getSafeInstagramErrorDetails(error);
    logger.error('instagram', 'Error sending Instagram media message:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Alias for sendInstagramMediaMessage to match API message service interface
 */
export const sendMedia = sendInstagramMediaMessage;

/**
 * Verify webhook signature against any configured Instagram connection
 * @param payload The raw payload from the webhook
 * @param signature The signature from the X-Hub-Signature-256 header
 * @returns True if signature is valid for any connection
 */
async function markWebhookSignatureSecretErrors(connections: ChannelConnection[]): Promise<void> {
  const error = 'Instagram webhook signature verification failed because no App Secret is configured.';
  await Promise.all(connections.map(async (connection) => {
    const connectionData = (connection.connectionData || {}) as InstagramConnectionData;
    if (connectionData.healthCheckStatus?.webhookSignatureError) {
      return;
    }

    const healthCheckStatus = {
      ...(connectionData.healthCheckStatus || {}),
      webhookSignatureError: error,
      webhookSignatureErrorAt: new Date().toISOString(),
    };

    try {
      await storage.updateChannelConnection(connection.id, {
        connectionData: {
          ...connectionData,
          healthCheckStatus,
        } as Record<string, any>,
      });
      await storage.updateChannelConnectionStatus(connection.id, 'error');
      updateConnectionActivity(connection.id, false, error);
      eventEmitter.emit('connectionError', {
        connectionId: connection.id,
        error,
        requiresReauth: false,
      } as ConnectionErrorPayload);
    } catch (updateError) {
      logger.error('instagram', 'Failed to mark Instagram connection with webhook signature configuration error', {
        connectionId: connection.id,
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }
  }));
}

function instagramConnectionMatchesEntry(connection: ChannelConnection, entryId: string): boolean {
  const connectionData = connection.connectionData as InstagramConnectionData | undefined;
  return String(connectionData?.instagramAccountId || '') === entryId ||
    String(connection.accountId || '') === entryId;
}

export async function verifyWebhookSignatureForAnyConnection(payload: string, signature: string): Promise<boolean> {
  try {
    logger.debug('instagram', 'Starting signature verification for Instagram webhook', {
      hasSignature: !!signature,
      signaturePreview: typeof signature === 'string' && signature.indexOf('=') > 0 ? signature.split('=')[0] + '=...' : 'none',
      payloadLength: payload ? payload.length : 0
    });

    const instagramConnections = await storage.getChannelConnectionsByType('instagram') as ChannelConnection[];

    logger.debug('instagram', 'Fetched connections for signature verification', { totalInstagramConnections: instagramConnections.length });

    const partnerConfig = await storage.getPartnerConfiguration('meta');
    const partnerSecret = partnerConfig?.partnerSecret?.trim() || null;
    let directSecret: string | null = null;
    if (instagramConnections.some(c => (c.connectionData as InstagramConnectionData)?.authMethod === 'instagram_login')) {
      const directConfig = await storage.getPartnerConfiguration('instagram');
      directSecret = directConfig ? instagramConfiguration(directConfig).appSecret : null;
    }

    const entryIds: string[] = (JSON.parse(payload)?.entry || []).map((entry: any) => String(entry.id));
    const targets = instagramConnections.filter(c => entryIds.some(id => instagramConnectionMatchesEntry(c, id)));
    if (targets.length) {
      return targets.every(c => {
        const data = c.connectionData as InstagramConnectionData;
        const secret = data.authMethod === 'instagram_login' ? directSecret : data.appSecret?.trim() || partnerSecret;
        return !!secret && verifyWebhookSignature(payload, signature, secret);
      });
    }

    let checked = 0;
    let withAppSecret = 0;
    let skippedNoSecret = 0;

    for (const connection of instagramConnections) {
      checked++;
      const connectionData = connection.connectionData as InstagramConnectionData;
      const appSecret = connectionData?.authMethod === 'instagram_login'
        ? directSecret : connectionData?.appSecret?.trim() || partnerSecret;
      const hasAppSecret = !!appSecret;

      const accountName = (connection as any).accountName || connectionData?.accountInfo?.name || null;

      logger.debug('instagram', 'Verifying signature against connection', {
        connectionId: connection.id,
        accountName,
        hasAppSecret,
        secretSource: connectionData?.appSecret?.trim() ? 'connection' : (partnerSecret ? 'partner' : 'none'),
      });

      if (!hasAppSecret) {
        skippedNoSecret++;
        logger.warn('instagram', 'Skipping signature verification for connection due to missing appSecret', { connectionId: connection.id });
        continue;
      }

      withAppSecret++;
      let isValid = false;
      try {
        isValid = verifyWebhookSignature(payload, signature, appSecret);
      } catch (err: any) {
        logger.error('instagram', 'Error while verifying signature for connection', { connectionId: connection.id, error: err });
      }

      logger.debug('instagram', 'Signature verification result', { connectionId: connection.id, valid: !!isValid });

      if (isValid) {
        if (connectionData?.healthCheckStatus?.webhookSignatureError) {
          const healthCheckStatus = { ...(connectionData.healthCheckStatus || {}) };
          delete healthCheckStatus.webhookSignatureError;
          delete healthCheckStatus.webhookSignatureErrorAt;
          await storage.updateChannelConnection(connection.id, {
            connectionData: {
              ...connectionData,
              healthCheckStatus,
            } as Record<string, any>,
          });
        }
        logger.info('instagram', 'Webhook signature verified for connection', { connectionId: connection.id, accountName });
        return true;
      }
    }

    logger.warn('instagram', 'Webhook signature could not be verified against any connection', {
      totalChecked: checked,
      withAppSecret,
      skippedNoSecret,
      suggestion: 'Ensure appSecret is configured on the Instagram connection or Meta partner credentials (partnerSecret) in the admin panel.'
    });

    if (checked > 0 && skippedNoSecret === checked) {
      await markWebhookSignatureSecretErrors(instagramConnections);
    }

    logger.info('instagram', 'Signature verification summary', { totalChecked: checked, withAppSecret, skippedNoSecret });
    return false;
  } catch (error: any) {
    logger.error('instagram', 'Exception during verifyWebhookSignatureForAnyConnection', {
      errorName: error?.name || null,
      errorMessage: error?.message || error,
      stack: error?.stack || null
    });
    return false;
  }
}

export async function processWebhook(
  body: InstagramWebhookBody,
  signature?: string,
  companyId?: number,
  rawPayload?: string
): Promise<void> {
  try {

    console.log('🔍 [INSTAGRAM SERVICE] Webhook details:', {
      hasSignature: !!signature,
      bodyType: typeof body,
      companyId: companyId || 'not_specified',
      bodyKeys: Object.keys(body || {})
    });
    
    logger.info('instagram', 'Processing Instagram webhook:', {
      hasSignature: !!signature,
      bodyType: typeof body,
      companyId: companyId || 'not_specified'
    });


    if (companyId) {
      try {
        const connections = await storage.getChannelConnectionsByType('instagram');
        const errorConnections = connections.filter((conn: any) =>
          conn.companyId === companyId &&
          conn.status === 'error' &&
          (conn.connectionData as InstagramConnectionData | undefined)?.authMethod !== 'instagram_login' &&
          !((conn.connectionData as InstagramConnectionData | undefined)?.healthCheckStatus?.webhookSignatureError)
        );
        
        if (errorConnections.length > 0) {

          for (const connection of errorConnections) {
            try {
              await storage.updateChannelConnectionStatus(connection.id, 'active');
              activeConnections.set(connection.id, true);
              updateConnectionActivity(connection.id, true);
              
              eventEmitter.emit('connectionStatusUpdate', {
                connectionId: connection.id,
                status: 'active'
              });
              

              logger.info('instagram', `Connection ${connection.id} status updated to active via webhook processing`);
            } catch (updateError) {
              console.error(`❌ [INSTAGRAM SERVICE] Failed to update connection ${connection.id}:`, updateError);
            }
          }
        }
      } catch (error) {
        console.error('❌ [INSTAGRAM SERVICE] Error updating connection statuses:', error);
      }
    }


    if (body['hub.mode'] === 'subscribe' && body['hub.verify_token']) {

      logger.info('instagram', 'Webhook verification request received');
      return;
    }


    const payloadForVerification = rawPayload ?? (typeof body === 'string' ? body : undefined);

    try {
      requireMetaWebhookRawPayload(signature, payloadForVerification);
    } catch (securityError) {
      const message =
        securityError instanceof Error ? securityError.message : 'Webhook signature verification failed';
      logger.error('instagram', message, {
        channel: 'instagram',
        companyId: companyId ?? null,
      });
      throw securityError;
    }

    if (signature && payloadForVerification) {
      const isValidSignature = await verifyWebhookSignatureForAnyConnection(
        payloadForVerification,
        signature
      );
      if (!isValidSignature) {
        logger.error('instagram', 'Invalid webhook signature - rejecting request', {
          channel: 'instagram',
          companyId: companyId ?? null,
        });
        throw new Error('Invalid webhook signature');
      }
    } else if (isMetaWebhookSignatureBypassAllowed()) {
      logger.warn('instagram', 'Processing unsigned Instagram webhook (development bypass enabled)', {
        channel: 'instagram',
        hasRawPayload: !!payloadForVerification,
      });
    }

    if (body.entry && Array.isArray(body.entry)) {

      
      for (const entry of body.entry) {
        console.log('🔍 [INSTAGRAM SERVICE] Entry details:', {
          id: entry.id,
          hasMessaging: !!entry.messaging,
          hasChanges: !!entry.changes,
          isMessagingArray: Array.isArray(entry.messaging),
          isChangesArray: Array.isArray(entry.changes),
          messagingCount: Array.isArray(entry.messaging) ? entry.messaging.length : 0,
          changesCount: Array.isArray(entry.changes) ? entry.changes.length : 0
        });
        

        for (const event of instagramEntryEvents(entry)) {
          await handleIncomingInstagramMessage(event, String(entry.id), companyId);
        }
      }
    } else {
        console.warn('⚠️ [INSTAGRAM SERVICE] No entry array found in webhook body');
        logger.debug('instagram', 'No entry array found in webhook body');
    }
    

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [INSTAGRAM SERVICE] Error in processWebhook:', errorMessage);
    if (error instanceof Error) {
      console.error('❌ [INSTAGRAM SERVICE] Error stack:', error.stack);
    }
    logger.error('instagram', 'Error processing Instagram webhook:', errorMessage);
    throw error; // Re-throw to ensure proper HTTP error response
  }
}

function captionForAttachment(attachment: InstagramWebhookMessageAttachment): string {
    if (attachment.type === 'story_mention') return '[Mentioned you in a story]';
    if (attachment.type === 'image') return '';
    if (attachment.type === 'video') return '';
    if (attachment.type === 'audio') return '';
    if (attachment.type === 'share' && attachment.title) return `[Shared Post: ${attachment.title}]`;
    if (attachment.type === 'fallback') return '[Unsupported Attachment]';
    return `[${attachment.type.toUpperCase()}]`;
}

/**
 * Find or create a conversation for a contact and channel
 * @param connectionId The channel connection ID
 * @param recipientId The recipient's Instagram user ID (IGSID)
 * @param companyId The company ID for multi-tenant security
 * @returns The conversation object
 */
async function findOrCreateConversation(connectionId: number, recipientId: string, companyId: number) {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }


  let contact = await findInstagramContact(recipientId, companyId);

  if (!contact) {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    let name = 'Instagram contact';
    let avatarUrl = null;
    let profileMetadata = {};

    // Best-effort profile fetch for outbound flow
    if (connection?.accessToken) {
      const profile = await fetchInstagramUserProfile(recipientId, connection.accessToken, connection.connectionData);
      if (profile) {
        name = normalizeInstagramDisplayName(profile, recipientId);
        avatarUrl = profile.profile_pic || null;
        profileMetadata = {
          instagramUsername: profile.username,
          instagramIgsid: profile.id,
          instagramProfileFetchedAt: new Date().toISOString(),
          instagramIsVerifiedUser: profile.is_verified_user,
          follower_count: profile.follower_count,
          is_user_follow_business: profile.is_user_follow_business,
          is_business_follow_user: profile.is_business_follow_user,
        };
      }
    }

    const contactData: InsertContact = {
      companyId: companyId,
      name,
      phone: null,
      email: null,
      avatarUrl,
      identifier: recipientId,
      identifierType: 'instagram',
      source: 'instagram',
      notes: null,
      customFields: profileMetadata
    };

    contact = await storage.getOrCreateContact(contactData);
  }


  let conversation = await storage.getConversationByContactAndChannel(
    contact.id,
    connectionId
  );

  if (!conversation) {
    const conversationData: InsertConversation = {
      companyId: companyId,
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'instagram',
      status: 'open',
      assignedToUserId: null,
      lastMessageAt: new Date(),
    };

    conversation = await storage.createConversation(conversationData);


    if ((global as any).broadcastToCompany) {
      (global as any).broadcastToCompany({
        type: 'newConversation',
        data: {
          ...conversation,
          contact
        }
      }, companyId);

    }
  }

  return conversation;
}

async function handleIncomingInstagramMessage(messagingEvent: InstagramWebhookMessagingEvent, recipientIgAccountId: string, companyId?: number): Promise<void> {
  let connection: ChannelConnection | null = null;
  try {
    if (messagingEvent.reaction || messagingEvent.read) return;
    const connections = await storage.getChannelConnectionsByType('instagram') as ChannelConnection[];
    connection = connections.find(conn => instagramConnectionMatchesEntry(conn, recipientIgAccountId)) || null;
    if (!connection?.companyId || (companyId != null && connection.companyId !== companyId)) return;
    const accountIds = new Set([recipientIgAccountId, connection.accountId,
      (connection.connectionData as InstagramConnectionData)?.instagramAccountId].filter(Boolean).map(String));
    const senderIsBusiness = accountIds.has(String(messagingEvent.sender?.id));
    const recipientIsBusiness = accountIds.has(String(messagingEvent.recipient?.id));
    const isEcho = messagingEvent.message?.is_echo === true || messagingEvent.webhookField === 'message_echoes' || senderIsBusiness;
    // Never turn a customer's message into an outbound message based on an inconsistent echo flag.
    if ((isEcho && !senderIsBusiness) || (!isEcho && !recipientIsBusiness)) return;
    const counterpartyId = isEcho ? messagingEvent.recipient?.id : messagingEvent.sender?.id;
    if (!counterpartyId || accountIds.has(String(counterpartyId))) return;
    const metaReferral = !isEcho ? normalizeInstagramMetaReferral(messagingEvent) : null;
    const messageTimestamp = instagramEventTimestamp(messagingEvent);
    const postback = messagingEvent.postback;
    const message = messagingEvent.message ?? (postback?.mid ? {
      mid: postback.mid, text: postback.title || postback.payload || '[Instagram option selected]',
    } : undefined);
    if (!message?.mid) {
      if (metaReferral && messagingEvent.timestamp != null && Number.isFinite(Number(messagingEvent.timestamp))) {
        const updated = await storage.storeInstagramReferral({ companyId: connection.companyId, connectionId: connection.id,
          senderId: String(counterpartyId), eventAt: messageTimestamp, referral: metaReferral });
        if (updated) (global as any).broadcastToCompany?.({ type: 'messageUpdated', data: { messageId: updated.id, conversationId: updated.conversationId, updates: updated } }, connection.companyId);
      }
      return;
    }
    let contact = await findInstagramContact(counterpartyId, connection.companyId);
    let contactWasCreatedByInboundWebhook = false;
    let conversationWasCreated = false;

    if (!contact) {

      const metaReferralContactTags = deriveMetaReferralContactTags(metaReferral);
      
      // Fetch profile data for non-echo messages only
      let profileData: InstagramUserProfile | null = null;
      if (!isEcho && connection.accessToken) {
        try { profileData = await fetchInstagramUserProfile(counterpartyId, connection.accessToken, connection.connectionData); }
        catch { /* Profile enrichment is optional for message persistence. */ }
      }

      const insertContactData: InsertContact = {
        companyId: connection.companyId,
        phone: null,
        name: normalizeInstagramDisplayName(profileData, counterpartyId),
        avatarUrl: profileData?.profile_pic || null,
        source: 'instagram',
        identifier: counterpartyId,
        identifierType: 'instagram',
        customFields: profileData ? {
          instagramUsername: profileData.username,
          instagramIgsid: profileData.id,
          instagramProfileFetchedAt: new Date().toISOString(),
          instagramIsVerifiedUser: profileData.is_verified_user,
          follower_count: profileData.follower_count,
          is_user_follow_business: profileData.is_user_follow_business,
          is_business_follow_user: profileData.is_business_follow_user,
        } : {},
        ...(metaReferralContactTags.length > 0 ? { tags: metaReferralContactTags } : {}),
      };
      const contactResult = await storage.getOrCreateContactResult(insertContactData);
      contact = contactResult.contact;
      contactWasCreatedByInboundWebhook = contactResult.created;

      if (contactResult.created) {
        logger.info('instagram', `Created new contact for Instagram user ${counterpartyId}`);
      }

      // Auto-add contact to pipeline if enabled (only for newly created contacts)
      if (contactWasCreatedByInboundWebhook) try {
        const autoAddEnabled = await getCachedCompanySetting(connection.companyId, 'autoAddContactToPipeline');
        if (autoAddEnabled) {
          // Get initial stage first to resolve pipelineId for duplicate check
          const initialStage = await getCachedTargetPipelineStage(connection.companyId);
          if (initialStage) {
            // Check if contact already has an active deal in this pipeline to avoid duplicates
            const existingDeal = await storage.getActiveDealByContact(contact.id, connection.companyId, initialStage.pipelineId);
            if (!existingDeal) {
              const deal = await storage.createDeal({
                companyId: connection.companyId,
                contactId: contact.id,
                title: `New Lead - ${contact.name}`,
                pipelineId: initialStage.pipelineId,
                stageId: initialStage.id,
                stage: 'lead'
              });
              await storage.createDealActivity({
                dealId: deal.id,
                userId: connection.userId,
                type: 'create',
                content: 'Deal automatically created when contact was added'
              });
            }
          }
        }
      } catch (error) {
        console.error('Error auto-adding contact to pipeline:', error);
        // Don't fail contact creation if pipeline addition fails
      }
    } else {
      // Existing contact - enrich if necessary (non-echo only)
      if (!isEcho && (isInstagramPlaceholderName(contact.name, counterpartyId) || !contact.avatarUrl || !getInstagramUsername(contact))) {
        try { contact = await enrichContactWithInstagramProfile(contact, connection, counterpartyId); }
        catch { /* Keep the existing contact when profile enrichment is unavailable. */ }
      }
    }

    
    let conversation = await storage.getConversationByContactAndChannel(contact.id, connection.id) as Conversation | null;
    if (!conversation) {
      conversation = await storage.createConversation({ companyId: connection.companyId, contactId: contact.id,
        channelType: 'instagram', channelId: connection.id, status: 'open', lastMessageAt: messageTimestamp });
      conversationWasCreated = true;
    }
    const existing = await storage.getMessageByExternalIdInConversation(message.mid, conversation.id);
    const attachments = message.attachments || [];
    const attachment = attachments[0];
    let messageType = attachment ? (attachment.type === 'file' ? 'document' : attachment.type || 'media') : 'text';
    let messageText = message.text || (attachment ? captionForAttachment(attachment) : '[Unsupported or Empty Message Content]');
    let mediaUrl: string | null = existing?.mediaUrl || attachment?.payload?.url || attachment?.url || null;
    // Post/reel URLs represent shared content, not necessarily an image or video binary.
    const binaryMedia = ['image', 'video', 'audio', 'document', 'sticker'].includes(messageType);
    if (!existing && binaryMedia && mediaUrl && isMetaCdnMediaUrl(mediaUrl)) {
      try { mediaUrl = await downloadInstagramMedia(mediaUrl, connection.accessToken || '', messageType, Date.now()) || mediaUrl; }
      catch { /* Retain the supplied URL if the optional download fails. */ }
    }
    if (!contactWasCreatedByInboundWebhook && !isEcho) {
      if (conversationWasCreated) contactWasCreatedByInboundWebhook = true;
      else if (metaReferral && !existing) {
        const previous = await storage.getMessagesByConversationPaginated(conversation.id, 10, 0);
        contactWasCreatedByInboundWebhook = !previous.some(m => m.direction === 'inbound' && !m.isHistorySync && !m.historySyncBatchId);
      }
    }
    const result = await storage.createInstagramMessage({
      conversationId: conversation.id, content: messageText, type: messageType,
      direction: isEcho ? 'outbound' : 'inbound', senderType: isEcho ? 'external' : 'contact',
      isFromBot: false, status: isEcho ? 'sent' : 'delivered', externalId: message.mid, mediaUrl,
      sentAt: messageTimestamp,
      metadata: withContactInitialMessageMetadata({ existingMetadata: {
        channelType: 'instagram', instagramEcho: isEcho, ...instagramQuoteMetadata(message),
        timestamp: messageTimestamp.getTime(), senderId: messagingEvent.sender?.id, recipientId: messagingEvent.recipient?.id,
        ...(metaReferral ? { metaReferral } : {}),
        ...(attachments.length ? { instagramAttachments: attachments } : {}),
        ...(postback ? { instagramPostback: postback } : {}),
      }, channelType: 'instagram', conversationStatus: conversation.status,
        isInboundContactMessage: !isEcho, contactWasCreatedByInboundWebhook: !isEcho && contactWasCreatedByInboundWebhook,
      }) as InsertMessage['metadata'],
    });
    if (!result.created) {
      if (result.metadataUpdated || result.attributionUpdated) {
        (global as any).broadcastToCompany?.({ type: 'messageUpdated', data: { messageId: result.message.id, conversationId: result.message.conversationId, updates: result.message } }, connection.companyId);
      }
      return;
    }
    const savedMessage = result.message;
    updateConnectionActivity(connection.id, true);
    // lastMessageAt/unread count were committed atomically with the message.
    const updatedConversation = await storage.updateConversation(conversation.id, { status: 'open' }) || conversation;
    if (conversationWasCreated) {
      (global as any).broadcastToCompany?.({ type: 'newConversation', data: { ...updatedConversation, contact } }, connection.companyId);
    }
    const eventPayload: MessageReceivedPayload = { message: savedMessage, conversation: updatedConversation as Conversation, contact, connection };
    eventEmitter.emit('messageReceived', eventPayload);
    (global as any).broadcastToCompany?.({ type: 'newMessage', data: savedMessage }, connection.companyId);
    (global as any).broadcastToCompany?.({ type: 'conversationUpdated', data: updatedConversation }, connection.companyId);
    if (!isEcho && !updatedConversation.botDisabled) {
      try { await processMessageThroughFlowExecutor(savedMessage, updatedConversation, contact, connection); }
      catch (error: any) { logger.error('instagram', 'Instagram flow processing failed', error.message); }
    }
  } catch (error: unknown) {
    if (connection?.id) updateConnectionActivity(connection.id, false, 'Instagram event processing failed');
    // Let the route return 500 so Meta retries an event that was not persisted.
    throw error;
  }
}

export { handleIncomingInstagramMessage };

export function subscribeToInstagramEvents(
  eventType: 'connectionStatusUpdate',
  callback: (data: ConnectionStatusUpdatePayload) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: 'connectionError',
  callback: (data: ConnectionErrorPayload) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: 'messageReceived',
  callback: (data: MessageReceivedPayload) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: 'messageSent',
  callback: (data: any) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: string,
  callback: (data: any) => void
): () => void {
  eventEmitter.on(eventType, callback);
  return () => eventEmitter.off(eventType, callback);
}


/**
 * Test webhook configuration
 * @param webhookUrl The webhook URL to test
 * @param verifyToken The verify token to test
 * @returns Promise<boolean> indicating success
 */
export async function testWebhookConfiguration(
  webhookUrl: string,
  verifyToken: string
): Promise<{ success: boolean; error?: string }> {
  try {

    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:') {
      return { success: false, error: 'Webhook URL must use HTTPS' };
    }

    if (!url.pathname.includes('/api/webhooks/instagram')) {
      return { success: false, error: 'Webhook URL must point to /api/webhooks/instagram endpoint' };
    }


    const testParams = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': 'test_challenge_' + Date.now()
    });

    const testResponse = await axios.get(`${webhookUrl}?${testParams.toString()}`, {
      timeout: 10000,
      validateStatus: (status) => status === 200 || status === 403
    });

    if (testResponse.status === 200) {
      return { success: true };
    } else {
      return { success: false, error: 'Webhook verification failed - check verify token configuration' };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error testing webhook configuration:', error.message);
    return {
      success: false,
      error: error.code === 'ECONNREFUSED'
        ? 'Could not connect to webhook URL - check if server is accessible'
        : error.message || 'Webhook test failed'
    };
  }
}

/**
 * Refresh Instagram access token
 */
const tokenRefreshes = new Map<number, Promise<{ success: boolean; newToken?: string; expiresAt?: string; error?: string }>>();

export function refreshInstagramAccessToken(connectionId: number) {
  const pending = tokenRefreshes.get(connectionId);
  if (pending) return pending;
  const operation = performInstagramTokenRefresh(connectionId).finally(() => tokenRefreshes.delete(connectionId));
  tokenRefreshes.set(connectionId, operation);
  return operation;
}

async function performInstagramTokenRefresh(
  connectionId: number
): Promise<{ success: boolean; newToken?: string; expiresAt?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const connectionData = connection.connectionData as InstagramConnectionData;
    const appId = connectionData?.appId;
    const appSecret = connectionData?.appSecret;
    const currentToken = connection.accessToken;

    if (!currentToken || (connectionData.authMethod !== 'instagram_login' && (!appId || !appSecret))) {
      return { success: false, error: 'Missing credentials for token refresh' };
    }

    const isLinkedPageConnection = !!connectionData?.linkedPageId?.trim();
    const refreshUrl = isLinkedPageConnection
      ? `${FACEBOOK_GRAPH_URL}/${INSTAGRAM_API_VERSION}/oauth/access_token`
      : `${INSTAGRAM_GRAPH_URL}/refresh_access_token`;
    const refreshParams = isLinkedPageConnection
      ? {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: currentToken
      }
      : {
        grant_type: 'ig_refresh_token',
        access_token: currentToken
      };

    const response = await axios.get(
      refreshUrl,
      {
        params: refreshParams,
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.access_token) {
      const newToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 5184000; // Default 60 days
      const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();


      const updatedConnectionData = {
        ...connectionData,
        accessTokenExpiresAt: expiresAt,
        lastTokenRefresh: new Date().toISOString()
      };

      await storage.updateChannelConnection(connectionId, {
        accessToken: newToken,
        connectionData: updatedConnectionData as Record<string, any>
      });

      logger.info('instagram', `Access token refreshed for connection ${connectionId}`);

      return {
        success: true,
        newToken,
        expiresAt
      };
    } else {
      return {
        success: false,
        error: 'Failed to refresh access token'
      };
    }
  } catch (error: any) {
    if (error?.response?.status === 401 || error?.response?.data?.error?.code === 190) {
      await handleTokenExpiration(connectionId);
    }
    logger.error('instagram', 'Instagram token refresh failed', { connectionId, status: error?.response?.status });
    return {
      success: false,
      error: 'Instagram token refresh failed. Reconnect if authorization has expired or been revoked.'
    };
  }
}

/**
 * Check if access token needs refresh (within 7 days of expiry)
 */
export async function checkTokenExpiry(connectionId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) return false;

    const connectionData = connection.connectionData as InstagramConnectionData;
    const expiresAt = connectionData?.accessTokenExpiresAt;

    if (!expiresAt) return false;

    const expiryDate = new Date(expiresAt);
    const sevenDaysFromNow = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

    return expiryDate <= sevenDaysFromNow;
  } catch (error) {
    logger.error('instagram', 'Error checking token expiry:', error);
    return false;
  }
}

/**
 * Validate Instagram connection configuration
 * @param connectionData The connection configuration to validate
 * @returns Promise with validation result
 */
export async function validateConnectionConfiguration(
  connectionData: InstagramConnectionData,
  accessToken: string
): Promise<{ success: boolean; error?: string; accountInfo?: any }> {
  try {

    const response = await axios.get(
      buildInstagramAccountUrl(connectionData),
      {
        params: {
          fields: 'id,username,name,profile_picture_url,followers_count'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data) {
      return {
        success: true,
        accountInfo: response.data
      };
    } else {
      return {
        success: false,
        error: 'Failed to validate Instagram account access'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error validating Instagram connection:', error.response?.data || error.message);

    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'Access denied - check Instagram account access token permissions'
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Instagram account not found - check account ID'
      };
    } else {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Connection validation failed'
      };
    }
  }
}

/**
 * Fetch Instagram user profile using Meta's official User Profile API
 */
export async function fetchInstagramUserProfile(
  igsid: string,
  accessToken: string,
  connectionData?: InstagramConnectionData | Record<string, any> | null,
  strict: boolean = false
): Promise<InstagramUserProfile | null> {
  try {
    const fields = 'name,username,profile_pic,is_verified_user,follower_count,is_user_follow_business,is_business_follow_user';
    const target = resolveInstagramMessagingTarget(connectionData);
    const url = `${target.graphUrl}/${INSTAGRAM_API_VERSION}/${igsid}`;

    const response = await axios.get<InstagramUserProfile>(url, {
      params: { fields, access_token: accessToken },
      timeout: 10000
    });

    if (response.status === 200 && response.data) {
      return response.data;
    }
    
    if (strict) {
      throw new Error(`Instagram profile fetch failed with status ${response.status}`);
    }
    return null;
  } catch (error: any) {
    const message = error.response?.data?.error?.message || error.message;
    if (strict) {
      throw new Error(`Failed to fetch Instagram user profile: ${message}`);
    }
    logger.warn('instagram', `Failed to fetch Instagram user profile for ${igsid}: ${message}`);
    return null;
  }
}

/**
 * Normalize display name from Instagram profile
 */
export function normalizeInstagramDisplayName(profile: InstagramUserProfile | null, igsid: string): string {
  if (profile?.name?.trim()) {
    return profile.name.trim();
  }
  if (profile?.username?.trim()) {
    return `@${profile.username.trim()}`;
  }
  return 'Instagram contact';
}

/**
 * Check if a name is a placeholder
 */
export function isInstagramPlaceholderName(name: string | null | undefined, igsid: string): boolean {
  if (!name || name.trim() === '') return true;
  if (name === 'Instagram contact') return true;
  if (name.startsWith('Instagram User ')) return true;
  if (name === igsid) return true;
  return false;
}

async function findInstagramContact(igsid: string, companyId: number): Promise<Contact | undefined> {
  // Older contacts stored the Instagram-scoped ID in the phone column.
  return await storage.getContactByIdentifierAndCompany(igsid, 'instagram', companyId)
    ?? await storage.getContactByPhone(igsid, companyId)
    ?? await storage.getContactByPhone(`+${igsid}`, companyId);
}

/**
 * Enrich contact with Instagram profile data
 */
export async function enrichContactWithInstagramProfile(
  contact: Contact,
  connection: ChannelConnection,
  igsid: string,
  strict: boolean = false
): Promise<Contact> {
  if (!connection.accessToken) {
    const error = `Cannot enrich contact ${contact.id}: missing connection access token`;
    if (strict) throw new Error(error);
    logger.warn('instagram', error);
    return contact;
  }

  const profile = await fetchInstagramUserProfile(igsid, connection.accessToken, connection.connectionData, strict);
  if (!profile) return contact;

  const updates: Partial<InsertContact> = {};

  // Update name only if it's a placeholder
  if (isInstagramPlaceholderName(contact.name, igsid)) {
    const newName = normalizeInstagramDisplayName(profile, igsid);
    if (newName !== contact.name) {
      updates.name = newName;
    }
  }

  // Update avatar if present and different
  if (profile.profile_pic && profile.profile_pic !== contact.avatarUrl) {
    updates.avatarUrl = profile.profile_pic;
  }

  // Preserve and enrich custom fields
  const customFields: Record<string, any> = typeof contact.customFields === 'object' && contact.customFields !== null ? { ...contact.customFields } : {};
  let customFieldsChanged = false;

  const instagramMetadata = {
    instagramUsername: profile.username,
    instagramIgsid: profile.id,
    instagramProfileFetchedAt: new Date().toISOString(),
    instagramIsVerifiedUser: profile.is_verified_user,
    follower_count: profile.follower_count,
    is_user_follow_business: profile.is_user_follow_business,
    is_business_follow_user: profile.is_business_follow_user,
  };

  for (const [key, value] of Object.entries(instagramMetadata)) {
    if (value !== undefined && customFields[key] !== value) {
      customFields[key] = value;
      customFieldsChanged = true;
    }
  }

  if (customFieldsChanged) {
    updates.customFields = customFields;
  }

  if (Object.keys(updates).length > 0) {
    const updatedContact = await storage.updateContact(contact.id, updates);
    
    // Broadcast contact update
    if ((global as any).broadcastToCompany) {
      (global as any).broadcastToCompany({
        type: 'contactUpdated',
        data: updatedContact
      }, connection.companyId);
    }
    
    return updatedContact;
  }

  return contact;
}

/**
 * Public refresh function for Instagram profile
 */
export async function refreshContactInstagramProfile(
  contactId: number,
  connectionId: number
): Promise<{ success: boolean; contact?: Contact; profilePictureUrl?: string; error?: string }> {
  try {
    const contact = await storage.getContact(contactId);
    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    if (contact.identifierType !== 'instagram') {
      return { success: false, error: 'Contact is not an Instagram contact' };
    }

    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection || connection.channelType !== 'instagram') {
      return { success: false, error: 'Valid Instagram connection not found' };
    }

    const igsid = contact.identifier || contact.phone;
    if (!igsid) {
      return { success: false, error: 'Contact missing Instagram ID' };
    }

    const enrichedContact = await enrichContactWithInstagramProfile(contact, connection, igsid, true);
    return {
      success: true,
      contact: enrichedContact,
      profilePictureUrl: enrichedContact.avatarUrl || undefined
    };
  } catch (error: any) {
    logger.error('instagram', `Error refreshing Instagram profile: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export interface InstagramSetupWebhookOptions {
  appSecret?: string;
}

function buildInstagramSubscriptionLevelStatus(
  level: MetaWebhookSubscriptionLevelStatus['level'],
  success: boolean,
  error?: string,
  linkedPageId?: string
): MetaWebhookSubscriptionLevelStatus {
  return {
    success,
    subscribedAt: new Date().toISOString(),
    level,
    ...(error ? { error } : {}),
    ...(linkedPageId ? { linkedPageId } : {}),
  };
}

async function resolveInstagramAppSecret(
  connectionData: InstagramConnectionData,
  options?: InstagramSetupWebhookOptions
): Promise<string | null> {
  if (options?.appSecret?.trim()) {
    return options.appSecret.trim();
  }
  if (connectionData.appSecret?.trim()) {
    return connectionData.appSecret.trim();
  }
  const partnerConfig = await storage.getPartnerConfiguration('meta');
  return partnerConfig?.partnerSecret?.trim() || null;
}

async function persistInstagramWebhookSubscriptionStatus(
  connectionId: number,
  connectionData: InstagramConnectionData,
  status: MetaWebhookSubscriptionStatus
): Promise<void> {
  await storage.updateChannelConnection(connectionId, {
    connectionData: {
      ...connectionData,
      webhookSubscriptionStatus: status,
    } as Record<string, any>,
  });
}

/**
 * Set up app-level and Instagram account-level webhook subscriptions.
 */
export async function setupWebhookSubscription(
  connectionId: number,
  callbackUrl: string,
  verifyToken: string,
  options?: InstagramSetupWebhookOptions
): Promise<MetaWebhookSubscriptionStatus> {
  const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
  if (!connection) {
    return {
      app: buildInstagramSubscriptionLevelStatus('app', false, `Connection with ID ${connectionId} not found`),
      asset: buildInstagramSubscriptionLevelStatus('account', false, 'Skipped — connection not found'),
      success: false,
      error: `Connection with ID ${connectionId} not found`,
    };
  }

  const connectionData = (connection.connectionData || {}) as InstagramConnectionData;
  if (connectionData.authMethod === 'instagram_login') {
    const status = await subscribeInstagramBusinessAccount(connectionData.instagramAccountId || '', connection.accessToken || '', undefined,
      connectionData.grantedPermissions, connectionData.instagramSubscription);
    await storage.updateChannelConnection(connectionId, {
      status: (status.success || status.inboundActive) ? 'active' : 'error', connectionData: { ...connectionData, instagramSubscription: status },
    });
    // The app subscription is managed in the dashboard, not by this API request.
    return {
      app: buildInstagramSubscriptionLevelStatus('app', false, 'App-level webhooks must be configured in the Meta dashboard.'),
      asset: buildInstagramSubscriptionLevelStatus('account', status.success, status.error),
      success: status.success, ...(status.error ? { error: status.error } : {}),
    };
  }
  const pageAccessToken = connection.accessToken?.trim();
  const instagramAccountId = connectionData.instagramAccountId?.trim();
  const linkedPageId = connectionData.linkedPageId?.trim();
  const appId = connectionData.appId?.trim();
  const resolvedCallbackUrl = callbackUrl?.trim() || connectionData.webhookUrl?.trim();
  const resolvedVerifyToken = verifyToken?.trim() || connectionData.verifyToken?.trim();
  const appSecret = await resolveInstagramAppSecret(connectionData, options);

  const missing: string[] = [];
  if (!instagramAccountId) missing.push('Instagram account ID');
  if (!linkedPageId) missing.push('linked Page ID');
  if (!pageAccessToken) missing.push('Page access token');
  if (!appId) missing.push('App ID');
  if (!appSecret) missing.push('App Secret');
  if (!resolvedCallbackUrl) missing.push('callback URL');
  if (!resolvedVerifyToken) missing.push('verify token');

  if (missing.length > 0) {
    const error = `Missing required webhook configuration: ${missing.join(', ')}`;
    const failed: MetaWebhookSubscriptionStatus = {
      app: buildInstagramSubscriptionLevelStatus('app', false, error),
      asset: buildInstagramSubscriptionLevelStatus('account', false, error, linkedPageId),
      success: false,
      error,
    };
    await persistInstagramWebhookSubscriptionStatus(connectionId, connectionData, failed);
    return failed;
  }

  const scopeDiagnostics = await debugToken(
    pageAccessToken!,
    appId!,
    appSecret!,
    INSTAGRAM_LOGIN_SCOPES
  );
  const requiredScopes = [
    'instagram_manage_messages',
    'pages_manage_metadata',
    'pages_messaging',
    'pages_show_list',
    'pages_read_engagement',
  ];
  const missingRequiredScopes = requiredScopes.filter((scope) =>
    scopeDiagnostics.missingScopes.includes(scope) ||
    scopeDiagnostics.restrictedScopes.includes(scope)
  );

  if (missingRequiredScopes.length > 0) {
    const error = `Page token missing required scopes: ${missingRequiredScopes.join(', ')}`;
    const failed: MetaWebhookSubscriptionStatus = {
      app: buildInstagramSubscriptionLevelStatus('app', false, error),
      asset: buildInstagramSubscriptionLevelStatus('account', false, error, linkedPageId),
      success: false,
      error,
    };
    await persistInstagramWebhookSubscriptionStatus(connectionId, connectionData, failed);
    return failed;
  }

  const appResult = await configureInstagramAppWebhook(
    appId!,
    appSecret!,
    resolvedCallbackUrl!,
    resolvedVerifyToken!
  );

  const appStatus = buildInstagramSubscriptionLevelStatus(
    'app',
    appResult.success,
    appResult.error
  );

  let assetStatus: MetaWebhookSubscriptionLevelStatus;
  if (!appResult.success) {
    assetStatus = buildInstagramSubscriptionLevelStatus(
      'account',
      false,
      'Skipped — app-level subscription failed',
      linkedPageId
    );
  } else {
    const accountResult = await subscribeInstagramAccountWebhooks(
      linkedPageId!,
      pageAccessToken!
    );
    assetStatus = buildInstagramSubscriptionLevelStatus(
      'account',
      accountResult.success,
      accountResult.error,
      linkedPageId
    );
  }

  const success = appStatus.success && assetStatus.success;
  const status: MetaWebhookSubscriptionStatus = {
    app: appStatus,
    asset: assetStatus,
    success,
    ...(!success
      ? {
          error:
            appStatus.error ||
            assetStatus.error ||
            'Instagram webhook subscription failed',
        }
      : {}),
  };

  await persistInstagramWebhookSubscriptionStatus(connectionId, connectionData, status);

  if (success) {
    logger.info('instagram', `Webhook subscription completed for connection ${connectionId}`);
  } else {
    logger.warn('instagram', `Webhook subscription failed for connection ${connectionId}:`, status.error);
  }

  return status;
}

/**
 * Send Instagram message with quick replies
 */
export async function sendInstagramMessageWithQuickReplies(
  connectionId: number,
  to: string,
  message: string,
  quickReplies: InstagramQuickReply[],
  userId?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }

    if (userId && connection.userId !== userId) {
      return { success: false, error: 'Unauthorized access to channel connection' };
    }

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as InstagramConnectionData;
    const instagramAccountId = connectionData?.instagramAccountId;

    if (!accessToken || !instagramAccountId) {
      return { success: false, error: 'Instagram credentials missing' };
    }

    const messageData = {
      recipient: { id: to },
      message: {
        text: message,
        quick_replies: quickReplies.slice(0, 13) // Instagram allows max 13 quick replies
      }
    };

    const messagesUrl = buildInstagramGraphEdgeUrl(connectionData, 'messages');

    const response = await axios.post(
      messagesUrl,
      messageData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.message_id) {
      return {
        success: true,
        messageId: response.data.message_id
      };
    } else {
      return {
        success: false,
        error: 'Failed to send Instagram message with quick replies'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error sending message with quick replies:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to send message'
    };
  }
}

/**
 * Get Instagram message templates for a connection
 */
export async function getInstagramMessageTemplates(connectionId: number): Promise<InstagramMessageTemplate[]> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return [];
    }

    const connectionData = connection.connectionData as InstagramConnectionData;
    return connectionData?.settings?.messageTemplates || [];
  } catch (error) {
    logger.error('instagram', 'Error getting message templates:', error);
    return [];
  }
}

/**
 * Save Instagram message template
 */
export async function saveInstagramMessageTemplate(
  connectionId: number,
  template: InstagramMessageTemplate
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const connectionData = connection.connectionData as InstagramConnectionData || {};
    const settings = connectionData.settings || {};
    const templates = settings.messageTemplates || [];


    const existingIndex = templates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push(template);
    }

    const updatedConnectionData = {
      ...connectionData,
      settings: {
        ...settings,
        messageTemplates: templates
      }
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData as Record<string, any>
    });

    return { success: true };
  } catch (error: any) {
    logger.error('instagram', 'Error saving message template:', error);
    return { success: false, error: error.message };
  }
}

export default {
  connect: connectToInstagram,
  disconnect: disconnectFromInstagram,
  sendMessage: sendInstagramMessage,
  sendMedia: sendInstagramMediaMessage,
  sendMessageWithQuickReplies: sendInstagramMessageWithQuickReplies,
  uploadMedia: uploadInstagramMedia,
  getMessageTemplates: getInstagramMessageTemplates,
  saveMessageTemplate: saveInstagramMessageTemplate,
  refreshAccessToken: refreshInstagramAccessToken,
  checkTokenExpiry: checkTokenExpiry,
  isActive: isInstagramConnectionActive,
  getActiveConnections: getActiveInstagramConnections,
  subscribeToEvents: subscribeToInstagramEvents,
  processWebhook: processWebhook,
  setupWebhook: setupWebhookSubscription,
  verifyWebhookSignature,
  testWebhookConfiguration,
  validateConnectionConfiguration,
  getConnectionHealth,
  initializeHealthMonitoring,
  refreshContactInstagramProfile
};
