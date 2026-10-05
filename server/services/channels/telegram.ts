import { storage } from '../../storage';
import { getCachedCompanySetting, getCachedTargetPipelineStage } from '../../utils/pipeline-cache';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  ChannelConnection as SchemaChannelConnection,
} from '@shared/schema';
import { EventEmitter } from 'events';
import { setMaxListenersSafely } from '../../utils/event-emitter-monitor';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import https from 'node:https';
import path from 'node:path';
import fsExtra from 'fs-extra';
import FormData from 'form-data';
import fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from '../../utils/logger';
import { withContactInitialMessageMetadata } from './contact-initial-message-metadata';

export class TelegramWebhookAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramWebhookAuthError';
  }
}

interface TelegramConnectionData {
  botToken?: string;
  webhookUrl?: string;
  secretToken?: string;
  botInfo?: any;
  lastConnectedAt?: string;
  lastValidatedAt?: string;
}

interface TelegramSendContext {
  userId?: number;
  companyId?: number;
  conversationId?: number;
}

function parseTelegramConnectionDataRaw(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/** Bot token from channel row (JSON string jsonb edge cases + bot_token alias). */
function getTelegramBotToken(connection: { connectionData?: unknown }): string | null {
  const data = parseTelegramConnectionDataRaw(connection.connectionData);
  const token = data.botToken ?? data.bot_token;
  if (typeof token === 'string' && token.trim()) {
    return token.trim();
  }
  return null;
}

function telegramConnectionDataWithToken(connection: ChannelConnection): TelegramConnectionData {
  const base = parseTelegramConnectionDataRaw(connection.connectionData);
  const botToken = getTelegramBotToken(connection);
  return { ...base, ...(botToken ? { botToken } : {}) } as TelegramConnectionData;
}

interface ChannelConnection {
  id: number;
  userId: number;
  companyId: number;
  accessToken?: string | null;
  connectionData?: TelegramConnectionData | Record<string, any> | null;
  channelType: 'telegram' | string;
  status: 'connected' | 'disconnected' | 'error' | 'pending' | string;
}

interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  botInfo: any | null;
  client: any | null;
}

function resolveLocalMediaFilePath(mediaUrl: string): string | null {
  let pathname = '';
  try {
    if (mediaUrl.startsWith('/')) {
      pathname = new URL(mediaUrl, 'http://localhost').pathname;
    } else {
      pathname = new URL(mediaUrl).pathname;
    }
  } catch {
    return null;
  }

  let resolvedPath: string | null = null;

  if (pathname.startsWith('/media/flow-media/')) {
    const filename = path.basename(pathname.slice('/media/flow-media/'.length));
    if (!filename) {
      return null;
    }
    resolvedPath = path.join(process.cwd(), 'uploads', 'flow-media', filename);
  } else if (pathname.startsWith('/uploads/')) {
    const rest = pathname.slice('/uploads/'.length);
    if (!rest) {
      return null;
    }
    resolvedPath = path.join(process.cwd(), 'uploads', rest);
  } else if (pathname.startsWith('/media/')) {
    const rest = pathname.slice('/media/'.length);
    if (!rest) {
      return null;
    }
    resolvedPath = path.join(process.cwd(), 'public', 'media', rest);
  }

  if (!resolvedPath || !fsExtra.existsSync(resolvedPath)) {
    return null;
  }

  return resolvedPath;
}

interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
      first_name?: string;
      last_name?: string;
      username?: string;
      title?: string;
    };
    date: number;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    video?: {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      duration: number;
      file_size?: number;
    };
    audio?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      file_size?: number;
    };
    voice?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      file_size?: number;
    };
    /** Round video messages (https://core.telegram.org/bots/api#videonote) */
    video_note?: {
      file_id: string;
      file_unique_id: string;
      length: number;
      duration: number;
      file_size?: number;
    };
    /** GIF or H.264/MPEG-4 anim (https://core.telegram.org/bots/api#animation) */
    animation?: {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      duration: number;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    sticker?: {
      file_id: string;
      file_unique_id: string;
      type?: string;
      width: number;
      height: number;
      is_animated?: boolean;
      is_video?: boolean;
    };
    caption?: string;
  };
}

type Contact = ReturnType<typeof storage.createContact> extends Promise<infer T> ? T : any;
type Conversation = ReturnType<typeof storage.createConversation> extends Promise<infer T> ? T : any;

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const eventEmitter = new EventEmitter();
setMaxListenersSafely(eventEmitter, 0, 'telegram');

import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
eventEmitterMonitor.register('telegram-service', eventEmitter);

/**
 * Bot API origin (official default + optional local/mirror: https://core.telegram.org/bots/api#using-a-local-bot-api-server).
 * If api.telegram.org does not resolve on your network, set TELEGRAM_HTTPS_PROXY or fix DNS; do not invent arbitrary hosts.
 */
export function getTelegramApiBaseUrl(): string {
  const raw = (process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').trim().replace(/\/+$/, '');
  return raw.length > 0 ? raw : 'https://api.telegram.org';
}

let telegramProxyAgent: HttpsProxyAgent<string> | null = null;
let loggedTelegramProxy = false;

/** When api.telegram.org returns ENOTFOUND locally, routing via a proxy often fixes DNS/connect (corporate / filtered resolvers). */
function getTelegramProxyAgent(): HttpsProxyAgent<string> | null {
  const url = (process.env.TELEGRAM_HTTPS_PROXY || process.env.HTTPS_PROXY || '').trim();
  if (!url) {
    return null;
  }
  if (!telegramProxyAgent) {
    telegramProxyAgent = new HttpsProxyAgent(url);
    if (!loggedTelegramProxy) {
      loggedTelegramProxy = true;
      logger.info(
        'telegram',
        'Telegram Bot API HTTP client uses TELEGRAM_HTTPS_PROXY / HTTPS_PROXY (needed when api.telegram.org does not resolve or is blocked)'
      );
    }
  }
  return telegramProxyAgent;
}

function telegramAxiosTransport(timeoutMs: number): Record<string, unknown> {
  const agent = getTelegramProxyAgent();
  if (agent) {
    return { httpsAgent: agent as unknown as https.Agent, proxy: false, timeout: timeoutMs };
  }
  return { timeout: timeoutMs };
}

/** Dedicated agent for getFile only: avoids stale keep-alive sockets that often surface as read ECONNRESET. */
let telegramGetFileDirectAgent: https.Agent | null = null;
let telegramGetFileProxyAgent: HttpsProxyAgent<string> | null = null;
let telegramGetFileProxyKey: string | null = null;

function getTelegramGetFileAgent(proxyUrl: string): https.Agent | HttpsProxyAgent<string> {
  if (proxyUrl) {
    if (!telegramGetFileProxyAgent || telegramGetFileProxyKey !== proxyUrl) {
      telegramGetFileProxyKey = proxyUrl;
      telegramGetFileProxyAgent = new HttpsProxyAgent(proxyUrl, {
        keepAlive: false,
        maxSockets: 50,
      });
    }
    return telegramGetFileProxyAgent;
  }
  if (!telegramGetFileDirectAgent) {
    telegramGetFileDirectAgent = new https.Agent({ keepAlive: false, maxSockets: 50 });
  }
  return telegramGetFileDirectAgent;
}

/**
 * Axios options for getFile: Telegram allows GET + query string or POST + JSON
 * (https://core.telegram.org/bots/api#making-requests). Fresh connections + identity encoding reduce ECONNRESETs.
 */
function telegramGetFileAxiosOptions(timeoutMs: number): Record<string, unknown> {
  const proxyUrl = (process.env.TELEGRAM_HTTPS_PROXY || process.env.HTTPS_PROXY || '').trim();
  const agent = getTelegramGetFileAgent(proxyUrl);
  const headers = {
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
  };
  if (proxyUrl) {
    return { httpsAgent: agent as unknown as https.Agent, proxy: false, timeout: timeoutMs, headers };
  }
  return { httpsAgent: agent as https.Agent, timeout: timeoutMs, headers };
}

function formatTelegramHttpClientError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }
  const bits: string[] = [];
  if (error.code) bits.push(error.code);
  bits.push(error.message || 'Axios error');
  if (error.response?.status) bits.push(`http=${error.response.status}`);
  const desc = (error.response?.data as { description?: string } | undefined)?.description;
  if (desc) bits.push(`api=${desc}`);
  return bits.join(' ');
}

function isTelegramTransientNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const c = error.code;
  return (
    c === 'ECONNABORTED' ||
    c === 'ETIMEDOUT' ||
    c === 'ECONNRESET' ||
    c === 'ENOTFOUND' ||
    c === 'EAI_AGAIN' ||
    c === 'ECONNREFUSED'
  );
}

/** getFile can be slow or flaky on some networks. */
const TELEGRAM_GET_FILE_TIMEOUT_MS = 45000;
const TELEGRAM_GET_FILE_ATTEMPTS = 4;

/** Saved under `public/media/telegram` — same layout as WhatsApp `/media/...` so download-media local-file checks work. */
const TELEGRAM_PUBLIC_MEDIA_DIR = path.join(process.cwd(), 'public', 'media', 'telegram');

const telegramPublicFileDownloads = new Map<number, Promise<string | null>>();
const telegramInboundFinalizeInFlight = new Set<number>();

function pickTelegramFileExtension(
  messageType: string,
  contentType: string | undefined,
  documentFileName?: string,
  metadata?: Record<string, unknown> | null
): string {
  if (documentFileName) {
    const ext = path.extname(documentFileName);
    if (ext) return ext;
  }
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('mp4')) return '.mp4';
  if (ct.includes('webm')) return '.webm';
  if (ct.includes('ogg')) return '.ogg';
  if (ct.includes('mpeg') || ct.includes('mp3')) return '.mp3';
  if (ct.includes('pdf')) return '.pdf';
  if (ct.includes('tgsticker') || ct.includes('application/x-tgsticker')) return '.tgs';

  /** When Telegram CDN omits a precise type, use sticker variant from the Bot API object. */
  if (messageType === 'sticker') {
    const variant = metadata?.telegramStickerVariant;
    if (variant === 'video' || metadata?.telegramStickerIsVideo === true) return '.webm';
    if (variant === 'animated' || metadata?.telegramStickerIsAnimated === true) return '.tgs';
    return '.webp';
  }

  switch (messageType) {
    case 'image':
      return '.jpg';
    case 'video':
      return '.mp4';
    case 'voice':
      return '.ogg';
    case 'audio':
      return '.mp3';
    case 'document':
      return '.bin';
    default:
      return '.bin';
  }
}

function broadcastTelegramMessageMediaResolved(companyId: number, message: { id: number; conversationId: number; mediaUrl: string | null; metadata: unknown }) {
  if (companyId == null || !(global as any).broadcastToCompany) return;
  (global as any).broadcastToCompany(
    {
      type: 'messageUpdated',
      data: {
        messageId: message.id,
        conversationId: message.conversationId,
        updates: {
          mediaUrl: message.mediaUrl,
          metadata: message.metadata,
        },
      },
    },
    companyId
  );
}

/**
 * Resolve Telegram file via Bot API (server-side only), download bytes, persist under `/media/telegram/...`.
 * Never returns or persists URLs containing the bot token.
 */
export async function downloadTelegramMediaToPublicFile(
  connection: SchemaChannelConnection,
  fileId: string,
  messageId: number,
  messageType: string,
  metadata?: Record<string, unknown> | null
): Promise<string | null> {
  const existing = telegramPublicFileDownloads.get(messageId);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<string | null> => {
    try {
      const cdnUrl = await getTelegramFileUrl(connection, fileId);
      if (!cdnUrl) {
        return null;
      }

      const docName =
        typeof metadata?.documentFileName === 'string'
          ? metadata.documentFileName
          : typeof metadata?.fileName === 'string'
            ? metadata.fileName
            : undefined;
      const mimeHint =
        typeof metadata?.mimeType === 'string'
          ? metadata.mimeType
          : typeof metadata?.documentMimeType === 'string'
            ? metadata.documentMimeType
            : undefined;

      const response = await axios.get<ArrayBuffer>(cdnUrl, {
        responseType: 'arraybuffer',
        ...telegramAxiosTransport(120000),
        maxContentLength: 200 * 1024 * 1024,
        maxBodyLength: 200 * 1024 * 1024,
      });

      if (response.status !== 200 || !response.data) {
        return null;
      }

      const contentType =
        (response.headers['content-type'] as string | undefined) || mimeHint;
      const ext = pickTelegramFileExtension(messageType, contentType, docName, metadata ?? null);
      await fsExtra.ensureDir(TELEGRAM_PUBLIC_MEDIA_DIR);
      const uniqueId = crypto.randomBytes(12).toString('hex');
      const filename = `${messageId}_${uniqueId}${ext}`;
      const filePath = path.join(TELEGRAM_PUBLIC_MEDIA_DIR, filename);
      await fsExtra.writeFile(filePath, Buffer.from(response.data));

      return `/media/telegram/${filename}`;
    } catch (error) {
      logger.error('telegram', `downloadTelegramMediaToPublicFile failed for message ${messageId}:`, formatTelegramHttpClientError(error));
      return null;
    } finally {
      telegramPublicFileDownloads.delete(messageId);
    }
  })();

  telegramPublicFileDownloads.set(messageId, promise);
  return promise;
}

async function finalizeTelegramInboundMediaAsync(
  messageId: number,
  connection: SchemaChannelConnection,
  fileId: string,
  messageType: string,
  companyId: number,
  metadataSnapshot: Record<string, unknown>
): Promise<void> {
  if (telegramInboundFinalizeInFlight.has(messageId)) {
    return;
  }
  telegramInboundFinalizeInFlight.add(messageId);
  try {
    const current = await storage.getMessageById(messageId);
    if (!current) {
      return;
    }
    const url = current.mediaUrl ? String(current.mediaUrl) : '';
    if (url.startsWith('/media/telegram/')) {
      const abs = path.join(process.cwd(), 'public', url.substring(1));
      if (await fsExtra.pathExists(abs)) {
        return;
      }
    }
    if (url && !url.includes('/file/bot') && !url.includes('api.telegram.org')) {
      return;
    }

    const localUrl = await downloadTelegramMediaToPublicFile(connection, fileId, messageId, messageType, metadataSnapshot);
    if (!localUrl) {
      return;
    }

    const updated = await storage.updateMessage(messageId, { mediaUrl: localUrl });
    broadcastTelegramMessageMediaResolved(companyId, updated);
  } finally {
    telegramInboundFinalizeInFlight.delete(messageId);
  }
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
      botInfo: null,
      client: null
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
    state.lastError = null;
  } else {
    state.errorCount++;
    state.lastError = error || 'Unknown error';
  }
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

/**
 * Connect to Telegram using session string or bot token
 */
export async function connectToTelegram(connectionId: number, userId: number): Promise<void> {
  let currentConnection: ChannelConnection | null = null;
  try {
    logger.info('telegram', `Connecting to Telegram for connection ${connectionId} by user ${userId}`);

    const connectionResult = await storage.getChannelConnection(connectionId);
    if (!connectionResult) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }
    currentConnection = connectionResult as ChannelConnection;


    if (currentConnection.userId !== userId) {
      logger.error('telegram', `Unauthorized access attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }

    const connectionData = telegramConnectionDataWithToken(currentConnection);

    const validationResult = await validateConnectionConfiguration(connectionData);
    if (!validationResult.success) {
      await storage.updateChannelConnectionStatus(connectionId, 'error');
      updateConnectionActivity(connectionId, false, validationResult.error);

      eventEmitter.emit('connectionError', {
        connectionId,
        error: validationResult.error
      });

      throw new Error(`Connection validation failed: ${validationResult.error}`);
    }


    await storage.updateChannelConnectionStatus(connectionId, 'connected');

    const updatedConnectionData: TelegramConnectionData = {
      ...(connectionData || {}),
      botInfo: validationResult.botInfo,
      lastConnectedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString()
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData as Record<string, any>,
    });

    activeConnections.set(connectionId, true);
    updateConnectionActivity(connectionId, true);

    logger.info('telegram', `Connection ${connectionId} established successfully for bot: ${validationResult.botInfo?.username}`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'connected',
      botInfo: validationResult.botInfo
    });
  } catch (error: unknown) {
    const baseMessage = `Error connecting to Telegram (ID: ${connectionId}):`;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', baseMessage, errorMessage);

    if (connectionId && (currentConnection || await storage.getChannelConnection(connectionId))) {
        await storage.updateChannelConnectionStatus(connectionId, 'error');
        updateConnectionActivity(connectionId, false, errorMessage);
    }
    if (error instanceof Error) throw error;
    throw new Error(`${baseMessage} ${errorMessage}`);
  }
}

/**
 * Disconnect from Telegram
 */
export async function disconnectFromTelegram(connectionId: number, userId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      logger.warn('telegram', `Connection ${connectionId} not found for disconnection`);
      return false;
    }


    if (connection.userId !== userId) {
      logger.error('telegram', `Unauthorized disconnect attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }


    const state = getConnectionState(connectionId);
    if (state.client) {
      try {
        await state.client.disconnect();
      } catch (error) {
        logger.warn('telegram', `Error disconnecting Telegram client for connection ${connectionId}:`, error);
      }
      state.client = null;
    }

    activeConnections.delete(connectionId);
    updateConnectionActivity(connectionId, true);
    await storage.updateChannelConnectionStatus(connectionId, 'disconnected');

    logger.info('telegram', `Telegram connection ${connectionId} disconnected successfully`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'disconnected'
    });

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', `Error disconnecting from Telegram (ID: ${connectionId}):`, errorMessage);
    return false;
  }
}

/**
 * Check if Telegram connection is active
 */
export function isTelegramConnectionActive(connectionId: number): boolean {
  return activeConnections.has(connectionId);
}

/**
 * Get active Telegram connections
 */
export function getActiveTelegramConnections(): number[] {
  return Array.from(activeConnections.keys());
}

/**
 * Validate Telegram connection configuration
 */
export async function validateConnectionConfiguration(
  connectionData: TelegramConnectionData
): Promise<{ success: boolean; error?: string; botInfo?: any }> {
  try {
    if (!connectionData?.botToken) {
      return { success: false, error: 'Bot token is required' };
    }


    const response = await axios.get(
      `${getTelegramApiBaseUrl()}/bot${connectionData.botToken}/getMe`,
      telegramAxiosTransport(10000)
    );

    if (response.status === 200 && response.data.ok) {
      return {
        success: true,
        botInfo: response.data.result
      };
    } else {
      return {
        success: false,
        error: 'Failed to validate bot token'
      };
    }
  } catch (error: any) {
    logger.error('telegram', 'Error validating Telegram connection:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      return {
        success: false,
        error: 'Invalid bot token - check your Telegram bot token'
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Bot not found - check your bot token'
      };
    } else {
      return {
        success: false,
        error: error.response?.data?.description || error.message || 'Connection validation failed'
      };
    }
  }
}

/**
 * Send text message via Telegram
 */
export async function sendTelegramMessage(
  connectionId: number,
  to: string,
  message: string,
  sendContext?: number | TelegramSendContext
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }


    const accessValidation = await validateTelegramSendAccess(connection, sendContext);
    if (!accessValidation.success) {
      return { success: false, error: accessValidation.error };
    }

    const botToken = getTelegramBotToken(connection);
    if (!botToken) {
      return { success: false, error: 'Bot token is missing for this connection' };
    }

    const response = await axios.post(
      `${getTelegramApiBaseUrl()}/bot${botToken}/sendMessage`,
      {
        chat_id: to,
        text: message,
        parse_mode: 'Markdown'
      },
      telegramAxiosTransport(30000)
    );

    if (response.status === 200 && response.data.ok) {
      updateConnectionActivity(connectionId, true);
      return { success: true, messageId: response.data.result.message_id.toString() };
    } else {
      const errorDetail = `Failed to send message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
      logger.error('telegram', errorDetail);
      updateConnectionActivity(connectionId, false, errorDetail);
      return { success: false, error: errorDetail };
    }
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Telegram message.';
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
        logger.error('telegram', 'Axios error sending Telegram message:', errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('telegram', 'Error sending Telegram message:', error.message);
    } else {
        logger.error('telegram', 'Unknown error sending Telegram message:', error);
    }
    updateConnectionActivity(connectionId, false, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send media message via Telegram
 */
export async function sendTelegramMediaMessage(
  connectionId: number,
  to: string,
  mediaUrl: string,
  mediaType: 'photo' | 'video' | 'document' | 'audio',
  caption?: string,
  sendContext?: number | TelegramSendContext
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }


    const accessValidation = await validateTelegramSendAccess(connection, sendContext);
    if (!accessValidation.success) {
      return { success: false, error: accessValidation.error };
    }

    const botToken = getTelegramBotToken(connection);
    if (!botToken) {
      return { success: false, error: 'Bot token is missing for this connection' };
    }

    const localFilePath = resolveLocalMediaFilePath(mediaUrl);
    if (localFilePath) {
      let endpoint = '';
      let mediaField = '';

      switch (mediaType) {
        case 'photo':
          endpoint = 'sendPhoto';
          mediaField = 'photo';
          break;
        case 'video':
          endpoint = 'sendVideo';
          mediaField = 'video';
          break;
        case 'document':
          endpoint = 'sendDocument';
          mediaField = 'document';
          break;
        case 'audio':
          endpoint = 'sendAudio';
          mediaField = 'audio';
          break;
        default:
          return { success: false, error: `Unsupported media type: ${mediaType}` };
      }

      const formData = new FormData();
      formData.append('chat_id', to);
      if (caption) {
        formData.append('caption', caption);
      }
      formData.append(mediaField, fs.createReadStream(localFilePath), {
        filename: path.basename(localFilePath)
      });

      const transport = telegramAxiosTransport(30000);
      const response = await axios.post(
        `${getTelegramApiBaseUrl()}/bot${botToken}/${endpoint}`,
        formData,
        {
          ...transport,
          headers: {
            ...(transport.headers ?? {}),
            ...formData.getHeaders()
          }
        }
      );

      if (response.status === 200 && response.data.ok) {
        updateConnectionActivity(connectionId, true);
        return { success: true, messageId: response.data.result.message_id.toString() };
      } else {
        const errorDetail = `Failed to send media message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
        logger.error('telegram', errorDetail);
        updateConnectionActivity(connectionId, false, errorDetail);
        return { success: false, error: errorDetail };
      }
    }

    let endpoint = '';
    let payload: any = {
      chat_id: to,
      caption: caption
    };

    switch (mediaType) {
      case 'photo':
        endpoint = 'sendPhoto';
        payload.photo = mediaUrl;
        break;
      case 'video':
        endpoint = 'sendVideo';
        payload.video = mediaUrl;
        break;
      case 'document':
        endpoint = 'sendDocument';
        payload.document = mediaUrl;
        break;
      case 'audio':
        endpoint = 'sendAudio';
        payload.audio = mediaUrl;
        break;
      default:
        return { success: false, error: `Unsupported media type: ${mediaType}` };
    }

    const response = await axios.post(
      `${getTelegramApiBaseUrl()}/bot${botToken}/${endpoint}`,
      payload,
      telegramAxiosTransport(30000)
    );

    if (response.status === 200 && response.data.ok) {
      updateConnectionActivity(connectionId, true);
      return { success: true, messageId: response.data.result.message_id.toString() };
    } else {
      const errorDetail = `Failed to send media message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
      logger.error('telegram', errorDetail);
      updateConnectionActivity(connectionId, false, errorDetail);
      return { success: false, error: errorDetail };
    }
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Telegram media message.';
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
        logger.error('telegram', 'Axios error sending Telegram media message:', errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('telegram', 'Error sending Telegram media message:', error.message);
    } else {
        logger.error('telegram', 'Unknown error sending Telegram media message:', error);
    }
    updateConnectionActivity(connectionId, false, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a photo album via Telegram sendMediaGroup (2–10 photos).
 * Caption is applied to the first photo only (Telegram API behavior).
 */
export async function sendTelegramMediaGroup(
  connectionId: number,
  to: string,
  mediaUrls: string[],
  caption?: string,
  sendContext?: number | TelegramSendContext
): Promise<{ success: boolean; messageIds?: string[]; error?: string }> {
  try {
    const urls = mediaUrls
      .filter((url) => typeof url === 'string' && url.trim().length > 0)
      .map((url) => url.trim())
      .slice(0, 10);

    if (urls.length < 2) {
      return { success: false, error: 'Telegram media group requires at least 2 photos' };
    }

    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }

    const accessValidation = await validateTelegramSendAccess(connection, sendContext);
    if (!accessValidation.success) {
      return { success: false, error: accessValidation.error };
    }

    const botToken = getTelegramBotToken(connection);
    if (!botToken) {
      return { success: false, error: 'Bot token is missing for this connection' };
    }

    const localPaths = urls.map((url) => resolveLocalMediaFilePath(url));
    const anyLocal = localPaths.some((p) => p != null);

    if (anyLocal) {
      const formData = new FormData();
      formData.append('chat_id', to);
      const mediaPayload = urls.map((url, index) => {
        const localPath = localPaths[index];
        const attachName = `photo${index}`;
        if (localPath) {
          formData.append(attachName, fs.createReadStream(localPath), {
            filename: path.basename(localPath),
          });
          return {
            type: 'photo' as const,
            media: `attach://${attachName}`,
            ...(index === 0 && caption ? { caption } : {}),
          };
        }
        return {
          type: 'photo' as const,
          media: url,
          ...(index === 0 && caption ? { caption } : {}),
        };
      });
      formData.append('media', JSON.stringify(mediaPayload));

      const transport = telegramAxiosTransport(60000);
      const response = await axios.post(
        `${getTelegramApiBaseUrl()}/bot${botToken}/sendMediaGroup`,
        formData,
        {
          ...transport,
          headers: {
            ...(transport.headers ?? {}),
            ...formData.getHeaders(),
          },
        }
      );

      if (response.status === 200 && response.data.ok && Array.isArray(response.data.result)) {
        updateConnectionActivity(connectionId, true);
        return {
          success: true,
          messageIds: response.data.result.map((m: { message_id?: number }) =>
            String(m.message_id ?? '')
          ),
        };
      }

      const errorDetail = `Failed to send media group: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
      logger.error('telegram', errorDetail);
      updateConnectionActivity(connectionId, false, errorDetail);
      return { success: false, error: errorDetail };
    }

    const media = urls.map((url, index) => ({
      type: 'photo' as const,
      media: url,
      ...(index === 0 && caption ? { caption } : {}),
    }));

    const response = await axios.post(
      `${getTelegramApiBaseUrl()}/bot${botToken}/sendMediaGroup`,
      { chat_id: to, media },
      telegramAxiosTransport(60000)
    );

    if (response.status === 200 && response.data.ok && Array.isArray(response.data.result)) {
      updateConnectionActivity(connectionId, true);
      return {
        success: true,
        messageIds: response.data.result.map((m: { message_id?: number }) =>
          String(m.message_id ?? '')
        ),
      };
    }

    const errorDetail = `Failed to send media group: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
    logger.error('telegram', errorDetail);
    updateConnectionActivity(connectionId, false, errorDetail);
    return { success: false, error: errorDetail };
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Telegram media group.';
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      errorMessage =
        (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
      logger.error('telegram', 'Axios error sending Telegram media group:', errorMessage);
    } else if (error instanceof Error) {
      errorMessage = error.message;
      logger.error('telegram', 'Error sending Telegram media group:', error.message);
    } else {
      logger.error('telegram', 'Unknown error sending Telegram media group:', error);
    }
    updateConnectionActivity(connectionId, false, errorMessage);
    return { success: false, error: errorMessage };
  }
}

function normalizeTelegramSendContext(sendContext?: number | TelegramSendContext): TelegramSendContext {
  if (typeof sendContext === 'number') {
    return { userId: sendContext };
  }
  return sendContext ?? {};
}

async function validateTelegramSendAccess(
  connection: ChannelConnection,
  sendContext?: number | TelegramSendContext
): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = normalizeTelegramSendContext(sendContext);

  if (ctx.companyId != null && connection.companyId !== ctx.companyId) {
    return { success: false, error: 'Access denied: Channel connection does not belong to your company' };
  }

  if (ctx.conversationId != null) {
    const conversation = await storage.getConversation(ctx.conversationId);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }
    if (conversation.channelId !== connection.id) {
      return { success: false, error: 'Access denied: Conversation does not belong to this channel connection' };
    }
    if (connection.companyId != null && conversation.companyId !== connection.companyId) {
      return { success: false, error: 'Access denied: Conversation and channel company mismatch' };
    }
    if (ctx.companyId != null && conversation.companyId !== ctx.companyId) {
      return { success: false, error: 'Access denied: Conversation does not belong to your company' };
    }
  }

  if (ctx.userId != null) {
    const user = await storage.getUser(ctx.userId);
    if (!user) {
      return { success: false, error: 'Unauthorized access: user not found' };
    }

    if (!(user as any).isSuperAdmin) {
      if (ctx.companyId != null && (user as any).companyId !== ctx.companyId) {
        return { success: false, error: 'Access denied: User does not belong to your company' };
      }
      if (connection.companyId != null && (user as any).companyId !== connection.companyId) {
        return { success: false, error: 'Access denied: User does not have access to this channel connection' };
      }
    }
  }

  return { success: true };
}

/**
 * Subscribe to Telegram events
 */
export function subscribeToTelegramEvents(callback: (event: string, data: any) => void): () => void {
  const listeners = {
    connectionStatusUpdate: callback.bind(null, 'connectionStatusUpdate'),
    connectionError: callback.bind(null, 'connectionError'),
    messageReceived: callback.bind(null, 'messageReceived')
  };

  eventEmitter.on('connectionStatusUpdate', listeners.connectionStatusUpdate);
  eventEmitter.on('connectionError', listeners.connectionError);
  eventEmitter.on('messageReceived', listeners.messageReceived);

  return () => {
    eventEmitter.off('connectionStatusUpdate', listeners.connectionStatusUpdate);
    eventEmitter.off('connectionError', listeners.connectionError);
    eventEmitter.off('messageReceived', listeners.messageReceived);
  };
}

/** Bot API File + getFile: https://core.telegram.org/bots/api#file https://core.telegram.org/bots/api#getfile */
interface TelegramGetFileApiResponse {
  ok: boolean;
  result?: { file_path?: string; file_id?: string };
  description?: string;
  error_code?: number;
}

interface TelegramGetUserProfilePhotosApiResponse {
  ok: boolean;
  result?: {
    total_count?: number;
    photos?: Array<Array<{ file_id?: string }>>;
  };
  description?: string;
}

/**
 * HTTPS download link: https://api.telegram.org/file/bot<token>/<file_path> (file_path from getFile).
 * Encode path segments so reserved characters in file_path are valid in the URL.
 */
function buildTelegramFileDownloadUrl(botToken: string, filePathFromApi: string): string {
  const pathPart = filePathFromApi
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${getTelegramApiBaseUrl()}/file/bot${botToken}/${pathPart}`;
}

/**
 * Call getFile per https://core.telegram.org/bots/api#getfile — parameters may be passed in the query string or as JSON.
 * Prefer GET + query string with a no-keep-alive agent and identity Accept-Encoding to reduce read ECONNRESET on flaky paths.
 */
async function getTelegramFileUrl(connection: SchemaChannelConnection, fileId: string): Promise<string | null> {
  const botToken = getTelegramBotToken(connection);
  if (!botToken) {
    return null;
  }

  const base = `${getTelegramApiBaseUrl()}/bot${botToken}/getFile`;
  const axiosOpts = telegramGetFileAxiosOptions(TELEGRAM_GET_FILE_TIMEOUT_MS);

  for (let attempt = 0; attempt < TELEGRAM_GET_FILE_ATTEMPTS; attempt++) {
    try {
      let response;
      if (attempt % 2 === 0) {
        response = await axios.get<TelegramGetFileApiResponse>(base, {
          params: { file_id: fileId },
          ...axiosOpts,
        });
      } else {
        const baseOpts = axiosOpts as Record<string, unknown> & {
          headers?: Record<string, string>;
        };
        response = await axios.post<TelegramGetFileApiResponse>(base, { file_id: fileId }, {
          ...baseOpts,
          headers: {
            ...baseOpts.headers,
            'Content-Type': 'application/json',
          },
        });
      }

      const data = response.data;
      if (!data?.ok || !data.result?.file_path || typeof data.result.file_path !== 'string') {
        logger.warn(
          'telegram',
          `getFile missing file_path or not ok: ${data?.description ?? response.statusText ?? 'unknown'}`
        );
        return null;
      }

      return buildTelegramFileDownloadUrl(botToken, data.result.file_path);
    } catch (error) {
      if (isTelegramTransientNetworkError(error) && attempt < TELEGRAM_GET_FILE_ATTEMPTS - 1) {
        const waitMs = Math.min(8000, 350 * 2 ** attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (axios.isAxiosError(error) && error.code === 'ENOTFOUND') {
        logger.error(
          'telegram',
          `getFile: DNS failed (ENOTFOUND). Allow api.telegram.org or set TELEGRAM_HTTPS_PROXY / HTTPS_PROXY. API base: ${getTelegramApiBaseUrl()}`
        );
      } else {
        logger.error(
          'telegram',
          `getFile failed (${formatTelegramHttpClientError(error)}). If this persists, check network/firewall or set TELEGRAM_HTTPS_PROXY. Base: ${getTelegramApiBaseUrl()}`
        );
      }
      return null;
    }
  }

  return null;
}

/** Exported for download-media refresh when CDN links expire (see File object note in Bot API docs). */
export async function resolveTelegramFileDownloadUrl(
  connection: SchemaChannelConnection,
  fileId: string
): Promise<string | null> {
  return getTelegramFileUrl(connection, fileId);
}

export async function fetchTelegramUserProfilePhoto(
  connection: SchemaChannelConnection,
  userId: string,
  companyId: number
): Promise<string | null> {
  try {
    const botToken = getTelegramBotToken(connection);
    if (!botToken) {
      return null;
    }

    const response = await axios.get<TelegramGetUserProfilePhotosApiResponse>(
      `${getTelegramApiBaseUrl()}/bot${botToken}/getUserProfilePhotos`,
      {
        params: { user_id: userId, limit: 1 },
        ...telegramAxiosTransport(30000),
      }
    );

    const profilePhotos = response.data?.result;
    if (
      !profilePhotos ||
      !profilePhotos.total_count ||
      !Array.isArray(profilePhotos.photos) ||
      profilePhotos.photos.length === 0
    ) {
      return null;
    }

    const firstPhotoSet = profilePhotos.photos[0];
    if (!Array.isArray(firstPhotoSet) || firstPhotoSet.length === 0) {
      return null;
    }

    const largestPhoto = firstPhotoSet[firstPhotoSet.length - 1];
    const fileId = largestPhoto?.file_id;
    if (!fileId) {
      return null;
    }

    const cdnUrl = await getTelegramFileUrl(connection, fileId);
    if (!cdnUrl) {
      return null;
    }

    const fileResponse = await axios.get<ArrayBuffer>(cdnUrl, {
      responseType: 'arraybuffer',
      ...telegramAxiosTransport(120000),
    });

    if (fileResponse.status !== 200 || !fileResponse.data) {
      return null;
    }

    await fsExtra.ensureDir(TELEGRAM_PUBLIC_MEDIA_DIR);
    const randomHex = crypto.randomBytes(12).toString('hex');
    const filename = `avatar_${userId}_${randomHex}.jpg`;
    const filePath = path.join(TELEGRAM_PUBLIC_MEDIA_DIR, filename);
    await fsExtra.writeFile(filePath, Buffer.from(fileResponse.data));
    return `/media/telegram/${filename}`;
  } catch (error) {
    logger.warn('telegram', `Unable to fetch Telegram profile photo for user ${userId} in company ${companyId}: ${formatTelegramHttpClientError(error)}`);
    return null;
  }
}

/**
 * Process incoming Telegram message
 */
async function handleIncomingTelegramMessage(
  update: TelegramWebhookUpdate,
  connection: SchemaChannelConnection
): Promise<void> {
  try {
    logger.debug('telegram', 'Processing incoming Telegram message update');

    if (!update.message) {
      logger.debug('telegram', 'Skipping non-message update');
      return;
    }

    const message = update.message;
    const chatId = message.chat.id.toString();
    const senderId = message.from.id.toString();

    if (connection.channelType !== 'telegram') {
      logger.error('telegram', `Webhook routed to non-Telegram connection ${connection.id}`);
      return;
    }

    if (connection.status !== 'connected') {
      logger.warn('telegram', `Telegram connection ${connection.id} is not connected; skipping message for chat ${chatId}`);
      return;
    }

    if (!connection.companyId) {
      logger.error('telegram', `Connection ${connection.id} missing companyId - security violation`);
      return;
    }


    let contact = await storage.getContactByPhone(senderId, connection.companyId) as Contact | null;
    let contactWasCreatedByInboundWebhook = false;
    if (!contact) {
      const contactName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') ||
                         message.from.username ||
                         `Telegram User ${senderId.substring(0, 6)}...`;

      const insertContactData: InsertContact = {
        companyId: connection.companyId,
        phone: senderId,
        name: contactName,
        source: 'telegram',
        identifier: senderId,
        identifierType: 'telegram'
      };
      const contactResult = await storage.getOrCreateContactResult(insertContactData);
      contact = contactResult.contact;
      contactWasCreatedByInboundWebhook = contactResult.created;
      if (contactResult.created) {
        logger.info('telegram', `Created new contact for Telegram user ${senderId}`);
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
    }

    if (!contact.avatarUrl) {
      const contactForAvatarRefresh = contact;
      void (async () => {
        const localAvatarUrl = await fetchTelegramUserProfilePhoto(connection, senderId, connection.companyId as number);
        if (!localAvatarUrl) {
          return;
        }

        const updatedContact = await storage.updateContact(contactForAvatarRefresh.id, { avatarUrl: localAvatarUrl });
        contact = { ...contactForAvatarRefresh, avatarUrl: localAvatarUrl };

        if ((global as any).broadcastToCompany) {
          (global as any).broadcastToCompany(
            {
              type: 'contactUpdated',
              data: updatedContact,
            },
            connection.companyId
          );
        }
      })().catch((error) => {
        logger.warn('telegram', `Failed to update Telegram contact avatar for contact ${contactForAvatarRefresh.id}: ${error instanceof Error ? error.message : String(error)}`);
      });
    }


    let isNewConversation = false;
    let conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connection.id
    ) as Conversation | null;

    if (!conversation) {
      const insertConversationData: InsertConversation = {
        contactId: contact.id,
        channelId: connection.id,
        channelType: 'telegram',
        companyId: connection.companyId,
        status: 'open',
        lastMessageAt: new Date()
      };
      conversation = await storage.createConversation(insertConversationData);
      isNewConversation = true;
      logger.info('telegram', `Created new conversation for contact ${contact.id}`);
    }

    if (isNewConversation && (global as any).broadcastToCompany) {
      (global as any).broadcastToCompany(
        {
          type: 'newConversation',
          data: { ...conversation, contact },
        },
        connection.companyId
      );
    }


    let messageText = message.text || message.caption || '';
    let messageType = 'text';
    /** Never store Telegram CDN URLs containing the bot token; resolved via download-media / background finalize. */
    let mediaUrl: string | null = null;
    let telegramFileId: string | undefined;
    const telegramFileMeta: Record<string, unknown> = {};

    if (message.photo && message.photo.length > 0) {
      messageType = 'image';
      const largestPhoto = message.photo[message.photo.length - 1];
      telegramFileId = largestPhoto.file_id;
      if (typeof largestPhoto.file_size === 'number') {
        telegramFileMeta.mediaFileSize = largestPhoto.file_size;
      }
    } else if (message.video) {
      messageType = 'video';
      telegramFileId = message.video.file_id;
      if (typeof message.video.file_size === 'number') {
        telegramFileMeta.mediaFileSize = message.video.file_size;
      }
    } else if (message.animation) {
      messageType = message.animation.mime_type === 'image/gif' ? 'image' : 'video';
      telegramFileId = message.animation.file_id;
      if (message.animation.file_name) {
        telegramFileMeta.documentFileName = message.animation.file_name;
      }
      if (message.animation.mime_type) {
        telegramFileMeta.mimeType = message.animation.mime_type;
      }
      if (typeof message.animation.file_size === 'number') {
        telegramFileMeta.mediaFileSize = message.animation.file_size;
      }
    } else if (message.document) {
      messageType = 'document';
      telegramFileId = message.document.file_id;
      if (message.document.file_name) {
        telegramFileMeta.documentFileName = message.document.file_name;
      }
      if (message.document.mime_type) {
        telegramFileMeta.mimeType = message.document.mime_type;
      }
      if (typeof message.document.file_size === 'number') {
        telegramFileMeta.mediaFileSize = message.document.file_size;
      }
    } else if (message.audio) {
      messageType = 'audio';
      telegramFileId = message.audio.file_id;
      if (typeof message.audio.file_size === 'number') {
        telegramFileMeta.mediaFileSize = message.audio.file_size;
      }
    } else if (message.voice) {
      messageType = 'voice';
      telegramFileId = message.voice.file_id;
      if (typeof message.voice.file_size === 'number') {
        telegramFileMeta.mediaFileSize = message.voice.file_size;
      }
    } else if (message.video_note) {
      messageType = 'video';
      telegramFileId = message.video_note.file_id;
      if (typeof message.video_note.file_size === 'number') {
        telegramFileMeta.mediaFileSize = message.video_note.file_size;
      }
    } else if (message.sticker) {
      messageType = 'sticker';
      telegramFileId = message.sticker.file_id;
      const st = message.sticker;
      if (st.is_video === true) {
        telegramFileMeta.telegramStickerVariant = 'video';
        telegramFileMeta.telegramStickerIsVideo = true;
      } else if (st.is_animated === true) {
        telegramFileMeta.telegramStickerVariant = 'animated';
        telegramFileMeta.telegramStickerIsAnimated = true;
      } else {
        telegramFileMeta.telegramStickerVariant = 'static';
      }
      if (typeof st.type === 'string' && st.type) {
        telegramFileMeta.telegramStickerType = st.type;
      }
    }

    const messageTimestamp = new Date(message.date * 1000);

    const insertMessageData: InsertMessage = {
      conversationId: conversation.id,
      content: messageText,
      type: messageType,
      direction: 'inbound',
      status: 'delivered',
      externalId: message.message_id.toString(),
      mediaUrl: mediaUrl,
      metadata: withContactInitialMessageMetadata({
        existingMetadata: {
          channelType: 'telegram',
          timestamp: messageTimestamp.getTime(),
          senderId: senderId,
          chatId: chatId,
          from: message.from,
          ...(telegramFileId ? { telegramFileId, ...telegramFileMeta } : {}),
        },
        channelType: 'telegram',
        conversationStatus: conversation.status,
        isInboundContactMessage: true,
        contactWasCreatedByInboundWebhook,
      }) as InsertMessage['metadata'],
    };

    const savedMessage = await storage.createMessage(insertMessageData);

    if (telegramFileId && messageType !== 'text' && connection.companyId != null) {
      const metaForFinalize = {
        ...(typeof savedMessage.metadata === 'object' && savedMessage.metadata !== null && !Array.isArray(savedMessage.metadata)
          ? (savedMessage.metadata as Record<string, unknown>)
          : {}),
      };
      void finalizeTelegramInboundMediaAsync(
        savedMessage.id,
        connection,
        telegramFileId,
        messageType,
        connection.companyId,
        metaForFinalize
      ).catch((err) => logger.error('telegram', 'Background Telegram media finalize error:', err));
    }
    updateConnectionActivity(connection.id, true);

    await storage.updateConversation(conversation.id, {
      lastMessageAt: messageTimestamp,
      status: 'open'
    });

    const updatedConversationDataForEvent = {
      ...conversation,
      lastMessageAt: messageTimestamp,
      status: 'open' as const,
      companyId: conversation.companyId ?? connection.companyId,
      lastMessage: savedMessage,
    };

    logger.info('telegram', `Message received from ${senderId} via connection ${connection.id}`);

    eventEmitter.emit('messageReceived', {
      message: savedMessage,
      conversation: updatedConversationDataForEvent,
      contact: contact,
      connection: connection
    });

    const companyId = connection.companyId;
    if (companyId != null && (global as any).broadcastToCompany) {
      (global as any).broadcastToCompany(
        {
          type: 'newMessage',
          data: savedMessage,
        },
        companyId
      );
    }

    if (!isNewConversation) {
      if ((global as any).broadcastConversationUpdate) {
        await (global as any).broadcastConversationUpdate(
          updatedConversationDataForEvent,
          'conversationUpdated'
        );
      } else if (companyId != null && (global as any).broadcastToCompany) {
        (global as any).broadcastToCompany(
          {
            type: 'conversationUpdated',
            data: updatedConversationDataForEvent,
          },
          companyId
        );
      }
    }

    try {
      if (
        companyId != null &&
        (savedMessage.direction === 'inbound' || savedMessage.direction === 'incoming') &&
        (global as any).broadcastToCompany
      ) {
        const unreadCount = await storage.getUnreadCount(conversation.id);
        (global as any).broadcastToCompany(
          {
            type: 'unreadCountUpdated',
            data: {
              conversationId: conversation.id,
              unreadCount,
            },
          },
          companyId
        );
      }
    } catch (unreadBroadcastErr) {
      logger.error('telegram', 'Error broadcasting unread count update:', unreadBroadcastErr);
    }

    try {
      if (connection.companyId && !conversation.botDisabled) {
        logger.debug('telegram', `Message eligible for flow processing: conversation ${conversation.id}`);


        await processMessageThroughFlowExecutor(savedMessage, conversation, contact, connection);
      }
    } catch (flowError: any) {
      logger.error('telegram', `Error processing message through flows:`, flowError.message);
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', `Error handling incoming Telegram message:`, errorMessage);
    if (connection?.id) {
      updateConnectionActivity(connection.id, false, errorMessage);
    }
  }
}

/**
 * Process Telegram webhook
 */
export async function processWebhook(body: TelegramWebhookUpdate, secretToken?: string): Promise<void> {
  try {
    const trimmedSecret = typeof secretToken === 'string' ? secretToken.trim() : '';

    logger.info('telegram', 'Processing Telegram webhook:', { hasSecretToken: !!trimmedSecret, bodyType: typeof body });

    const connections = await storage.getChannelConnections(null) as SchemaChannelConnection[];
    const telegramConnections = connections.filter(conn => conn.channelType === 'telegram');

    if (trimmedSecret) {
      const incomingBuf = Buffer.from(trimmedSecret, 'utf8');
      let verifiedConnection: SchemaChannelConnection | undefined;

      for (const connection of telegramConnections) {
        const storedRaw = parseTelegramConnectionDataRaw(connection.connectionData).secretToken;
        if (typeof storedRaw !== 'string' || !storedRaw.trim()) continue;
        const storedToken = storedRaw.trim();
        const storedBuf = Buffer.from(storedToken, 'utf8');
        if (incomingBuf.length !== storedBuf.length) continue;
        if (crypto.timingSafeEqual(incomingBuf, storedBuf)) {
          verifiedConnection = connection;
          break;
        }
      }

      if (!verifiedConnection) {
        throw new TelegramWebhookAuthError('Invalid webhook secret token');
      }

      logger.info('telegram', `Webhook secret verified for connection ${verifiedConnection.id}`);
      await handleIncomingTelegramMessage(body, verifiedConnection);
      return;
    }

    const legacyCandidates = telegramConnections.filter((conn) => {
      const st = parseTelegramConnectionDataRaw(conn.connectionData).secretToken;
      return !st || !String(st).trim();
    });

    if (legacyCandidates.length === 0) {
      throw new TelegramWebhookAuthError('Missing X-Telegram-Bot-Api-Secret-Token header');
    }
    if (legacyCandidates.length > 1) {
      logger.warn(
        'telegram',
        'Rejecting Telegram webhook without secret: multiple connections lack a persisted secret token'
      );
      throw new TelegramWebhookAuthError('Invalid webhook secret token');
    }

    const legacyConnection = legacyCandidates[0];
    logger.warn(
      'telegram',
      `Legacy Telegram webhook without secret header for connection ${legacyConnection.id}; save the connection or re-register the webhook to enable strict token validation`
    );
    await handleIncomingTelegramMessage(body, legacyConnection);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', 'Error processing Telegram webhook:', errorMessage);
    throw error; // Re-throw to ensure proper HTTP error response
  }
}

/**
 * Setup webhook subscription for Telegram bot
 */
export async function setupWebhookSubscription(
  connectionId: number,
  callbackUrl: string,
  secretToken?: string
): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found for webhook setup.`);
    }

    const botToken = getTelegramBotToken(connection);
    if (!botToken) {
      throw new Error('Bot token is missing for webhook setup.');
    }

    const payload: Record<string, unknown> = {
      url: callbackUrl,
      allowed_updates: ['message', 'edited_message', 'callback_query']
    };
    if (secretToken != null && secretToken !== '') {
      payload.secret_token = secretToken;
    }

    const response = await axios.post(
      `${getTelegramApiBaseUrl()}/bot${botToken}/setWebhook`,
      payload,
      telegramAxiosTransport(30000)
    );

    if (response.status === 200 && response.data.ok) {
        logger.info('telegram', `Webhook subscription set up successfully for connection ${connectionId}`);
        return true;
    } else {
        logger.error('telegram', `Failed to set up Telegram webhook subscription for connection ${connectionId}:`, response.status, response.data);
        return false;
    }
  } catch (error: unknown) {
    let errorMessage = 'Error setting up Telegram webhook subscription';
     if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
        logger.error('telegram', `Axios error setting up Telegram webhook subscription (Conn: ${connectionId}):`, errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('telegram', `Error setting up Telegram webhook subscription (Conn: ${connectionId}):`, error.message);
    } else {
        logger.error('telegram', `Unknown error setting up Telegram webhook subscription (Conn: ${connectionId}):`, error);
    }
    return false;
  }
}

/**
 * Process message through flow executor
 */
async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: SchemaChannelConnection
): Promise<void> {
  try {
    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;

    if (contact) {
      await flowExecutor.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error) {
    logger.error('telegram', 'Error in flow executor:', error);
    throw error;
  }
}

export default {
  connect: connectToTelegram,
  disconnect: disconnectFromTelegram,
  sendMessage: sendTelegramMessage,
  sendMedia: sendTelegramMediaMessage,
  sendMediaGroup: sendTelegramMediaGroup,
  isActive: isTelegramConnectionActive,
  getActiveConnections: getActiveTelegramConnections,
  subscribeToEvents: subscribeToTelegramEvents,
  processWebhook: processWebhook,
  setupWebhook: setupWebhookSubscription,
  validateConnectionConfiguration,
  getConnectionHealth,
  fetchTelegramUserProfilePhoto,
  resolveTelegramFileDownloadUrl,
  downloadTelegramMediaToPublicFile,
};
