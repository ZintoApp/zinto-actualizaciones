import { assertWhatsAppMessagingReady, assertReconnectedWhatsAppWindow } from '../whatsapp-connection-state';
import { storage } from '../../storage';
import { getCachedCompanySetting, getCachedTargetPipelineStage } from '../../utils/pipeline-cache';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  ChannelConnection} from '@shared/schema';
import { EventEmitter } from 'events';
import { setMaxListenersSafely } from '../../utils/event-emitter-monitor';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import crypto from 'crypto';
import FormData from 'form-data';
import { normalizeStoredMediaUrl, resolveWhatsAppMediaFileExtension } from '../../utils/whatsapp-media';
import {
  CONTACT_INITIAL_MESSAGE_METADATA_KEYS,
  withContactInitialMessageMetadata,
} from './contact-initial-message-metadata';
import {
  deriveMetaReferralContactTags,
  normalizeWhatsAppOfficialMetaReferral,
} from './meta-referral-normalization';
import {
  isBsuid,
  normalizeUsername as normalizeWhatsAppUsername,
  validateUsername as validateWhatsAppUsername,
} from '../whatsapp-username-utils';
import {
  renderTemplateMessagePreview,
  type WhatsAppParameterFormat,
  type WhatsAppTemplateVariableDefinition,
} from '../../../shared/whatsapp-template-variables';
import { isConversationBotPauseActive } from '../conversation-bot-state';
const activeConnections = new Map<number, boolean>();

const eventEmitter = new EventEmitter();
setMaxListenersSafely(eventEmitter, 0, 'whatsapp-official');

const WHATSAPP_API_VERSION = 'v25.0';
const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
fsExtra.ensureDirSync(MEDIA_DIR);

const mediaCache = new Map<string, string>();

function normalizeTemplateMediaComponents(components: any[] = []): any[] {
  return components.map(component => {
    if (String(component?.type).toLowerCase() !== 'header' || !Array.isArray(component.parameters)) return component;
    return {
      ...component,
      parameters: component.parameters.map((parameter: any) => {
        const mediaType = ['image', 'video', 'document'].find(type => parameter?.type === type);
        if (!mediaType) return parameter;
        const media = parameter[mediaType];
        if (!media || typeof media !== 'object') throw new Error(`Template media header ${mediaType} is missing`);
        if (media.id != null) {
          const mediaId = String(media.id).trim();
          if (!/^\d+$/.test(mediaId)) {
            throw new Error(`Template media header ${mediaType} ID is not a sendable Meta media object ID`);
          }
          return { ...parameter, [mediaType]: { ...media, id: mediaId } };
        }
        if (media.link) {
          let link = String(media.link).trim();
          if (!/^https?:\/\//i.test(link)) {
            const baseUrl = process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;
            if (!baseUrl) throw new Error(`Template media header ${mediaType} URL must be publicly accessible`);
            link = `${baseUrl.replace(/\/$/, '')}/${link.replace(/^\//, '')}`;
          }
          return { ...parameter, [mediaType]: { ...media, link } };
        }
        throw new Error(`Template media header ${mediaType} requires a media object ID or public URL`);
      }),
    };
  });
}

// Track the last received WhatsApp message ID per phone number (for typing indicators)
// Key: phoneNumberId:contactPhone, Value: WhatsApp message ID (wamid)
const lastReceivedMessageId = new Map<string, string>();

// Track first-time history webhook processing for visibility in staging
let hasLoggedHistoryWebhook = false;

/**
 * Typing indicator configuration
 */
interface TypingConfig {
  enabled: boolean;
  wordsPerMinute: number;
  minDelay: number;
  maxDelay: number;
  randomnessFactor: number;
  recordingMinDelay: number;
  recordingMaxDelay: number;
}

const TYPING_CONFIG: TypingConfig = {
  enabled: true,
  wordsPerMinute: 50,
  minDelay: 1000,
  maxDelay: 5000,
  randomnessFactor: 0.6,
  recordingMinDelay: 2000,
  recordingMaxDelay: 4000,
};

/**
 * Message splitting configuration
 */
interface MessageSplittingConfig {
  enabled: boolean;
  maxLength: number;
  splitMethod: 'sentences' | 'paragraphs' | 'characters' | 'logical';
  delayBetweenMessages: number;
  randomDelayFactor: number;
  preserveFormatting: boolean;
  minChunkSize: number;
  smartBoundaries: boolean;
  prioritizeSentences: boolean;
  logicalSplitting: {
    enabled: boolean;
    delimiter: string;
    fallbackToCharacters: boolean;
  };
}

const MESSAGE_SPLITTING_CONFIG: MessageSplittingConfig = {
  enabled: false,
  maxLength: 300,
  splitMethod: 'sentences',
  delayBetweenMessages: 2000,
  randomDelayFactor: 0.5,
  preserveFormatting: true,
  minChunkSize: 20,
  smartBoundaries: true,
  prioritizeSentences: true,
  logicalSplitting: {
    enabled: true,
    delimiter: '||',
    fallbackToCharacters: true,
  },
};

interface MessageDebouncingConfig {
  enabled: boolean;
  debounceDelay: number;
  maxDebounceDelay: number;
}

const MESSAGE_DEBOUNCING_CONFIG: MessageDebouncingConfig = {
  enabled: true,
  debounceDelay: 5000,
  maxDebounceDelay: 30000,
};

interface DebouncedTextMessageRecord {
  message: any;
  content: string;
  bufferedAt: Date;
}

interface DebouncedMessageBatch {
  conversationId: number;
  contactKey: string;
  connectionId: number;
  firstBufferedAt: Date;
  lastBufferedAt: Date;
  bufferedMessages: DebouncedTextMessageRecord[];
  executionMessage: any;
  conversation: any;
  contact: any;
  channelConnection: any;
  timeoutId: NodeJS.Timeout;
  cancellationGeneration: number;
}

const debouncedMessages = new Map<string, DebouncedMessageBatch>();
const conversationDebounceIndex = new Map<number, string>();
const debounceCancellationGeneration = new Map<number, number>();

function getDebounceKey(contactKey: string, connectionId: number): string {
  return `${connectionId}_${contactKey}`;
}

function removeDebouncedBatchByKey(debounceKey: string): void {
  const existingDebounce = debouncedMessages.get(debounceKey);
  if (!existingDebounce) {
    return;
  }
  clearTimeout(existingDebounce.timeoutId);
  debouncedMessages.delete(debounceKey);
  conversationDebounceIndex.delete(existingDebounce.conversationId);
}

function getDebounceCancellationGeneration(conversationId: number): number {
  return debounceCancellationGeneration.get(conversationId) ?? 0;
}

function markDebounceBatchCancelled(conversationId: number): void {
  debounceCancellationGeneration.set(
    conversationId,
    getDebounceCancellationGeneration(conversationId) + 1
  );
}

function isDebounceBatchCancelled(conversationId: number, generation: number): boolean {
  return generation < getDebounceCancellationGeneration(conversationId);
}

function getDebounceKeyByConversationId(conversationId: number): string | undefined {
  return conversationDebounceIndex.get(conversationId);
}

export function cancelDebouncedBatchByContactKey(contactKey: string, connectionId: number): void {
  const debounceKey = getDebounceKey(contactKey, connectionId);
  const batch = debouncedMessages.get(debounceKey);
  if (batch) {
    markDebounceBatchCancelled(batch.conversationId);
  }
  removeDebouncedBatchByKey(debounceKey);
}

export function cancelDebouncedBatchByConversationId(conversationId: number): void {
  markDebounceBatchCancelled(conversationId);
  const debounceKey = getDebounceKeyByConversationId(conversationId);
  if (debounceKey) {
    removeDebouncedBatchByKey(debounceKey);
  }
}

export function hasPendingDebouncedBatchForConversation(conversationId: number): boolean {
  return conversationDebounceIndex.has(conversationId);
}

function parseInboundMessageMetadata(raw: unknown): Record<string, any> {
  if (!raw) {
    return {};
  }
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : { ...(raw as object) };
  } catch {
    return {};
  }
}

function inboundMessageHasContactInitialMarker(message: any): boolean {
  const metadata = parseInboundMessageMetadata(message?.metadata);
  const keys = CONTACT_INITIAL_MESSAGE_METADATA_KEYS;
  return (
    metadata[keys.contactInitialMessage] === true &&
    metadata[keys.contactCreatedByIncomingWebhook] === true
  );
}

function resolveDebounceExecutionMessage(existing: DebouncedMessageBatch | undefined, incoming: any): any {
  if (!existing) {
    return incoming;
  }

  const existingCandidate = existing.executionMessage ?? existing.bufferedMessages[0]?.message;
  const existingMarked = inboundMessageHasContactInitialMarker(existingCandidate);
  const incomingMarked = inboundMessageHasContactInitialMarker(incoming);

  if (existingMarked && !incomingMarked) {
    return existingCandidate;
  }
  if (!existingMarked && incomingMarked) {
    return incoming;
  }

  return incoming;
}

function scheduleDebounceProcessing(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: any,
  contactKey: string,
  connectionId: number
): void {
  const debounceKey = getDebounceKey(contactKey, connectionId);
  const now = new Date();
  const existingDebounce = debouncedMessages.get(debounceKey);
  const incomingContent = typeof message?.content === 'string' ? message.content : '';
  const incomingRecord: DebouncedTextMessageRecord = {
    message,
    content: incomingContent,
    bufferedAt: now,
  };

  const scheduleBatchTimeout = (batch: DebouncedMessageBatch): void => {
    const elapsedSinceFirst = now.getTime() - batch.firstBufferedAt.getTime();
    const remainingUntilMax = MESSAGE_DEBOUNCING_CONFIG.maxDebounceDelay - elapsedSinceFirst;

    if (remainingUntilMax <= 0) {
      void flushDebounceBatch(debounceKey);
      return;
    }

    const waitTime = Math.min(MESSAGE_DEBOUNCING_CONFIG.debounceDelay, remainingUntilMax);
    batch.timeoutId = setTimeout(() => {
      void flushDebounceBatch(debounceKey);
    }, waitTime);
  };

  if (existingDebounce) {
    clearTimeout(existingDebounce.timeoutId);
    existingDebounce.lastBufferedAt = now;
    existingDebounce.bufferedMessages.push(incomingRecord);
    existingDebounce.executionMessage = resolveDebounceExecutionMessage(existingDebounce, message);
    existingDebounce.conversation = conversation;
    existingDebounce.contact = contact;
    existingDebounce.channelConnection = channelConnection;
    scheduleBatchTimeout(existingDebounce);
    debouncedMessages.set(debounceKey, existingDebounce);
    conversationDebounceIndex.set(existingDebounce.conversationId, debounceKey);
    return;
  }

  const batch: DebouncedMessageBatch = {
    conversationId: conversation.id,
    contactKey,
    connectionId,
    firstBufferedAt: now,
    lastBufferedAt: now,
    bufferedMessages: [incomingRecord],
    executionMessage: resolveDebounceExecutionMessage(undefined, message),
    conversation,
    contact,
    channelConnection,
    cancellationGeneration: getDebounceCancellationGeneration(conversation.id),
    timeoutId: setTimeout(() => {
      void flushDebounceBatch(debounceKey);
    }, Math.min(MESSAGE_DEBOUNCING_CONFIG.debounceDelay, MESSAGE_DEBOUNCING_CONFIG.maxDebounceDelay)),
  };

  debouncedMessages.set(debounceKey, batch);
  conversationDebounceIndex.set(batch.conversationId, debounceKey);
}

async function flushDebounceBatch(debounceKey: string): Promise<void> {
  const batch = debouncedMessages.get(debounceKey);
  if (!batch) {
    return;
  }

  const { conversationId } = batch;
  const cancellationGeneration = batch.cancellationGeneration;

  debouncedMessages.delete(debounceKey);
  conversationDebounceIndex.delete(conversationId);
  clearTimeout(batch.timeoutId);

  if (isDebounceBatchCancelled(conversationId, cancellationGeneration)) {
    return;
  }

  try {
    const latestConversation = await storage.getConversation(conversationId);
    if (!latestConversation) {
      return;
    }
    if (isDebounceBatchCancelled(conversationId, cancellationGeneration)) {
      return;
    }
    if (isConversationBotPauseActive(latestConversation)) {
      return;
    }

    const mergedText = batch.bufferedMessages
      .map((record) => record.content)
      .filter((content) => content.length > 0)
      .join('\n');

    const carrierBase = batch.executionMessage ?? batch.bufferedMessages[0]?.message;
    if (!carrierBase) {
      return;
    }

    const mergedCarrier = {
      ...carrierBase,
      content: mergedText,
      __debouncedMergedContent: mergedText,
    };

    if (isDebounceBatchCancelled(conversationId, cancellationGeneration)) {
      return;
    }

    await processMessageThroughFlowExecutor(
      mergedCarrier,
      latestConversation,
      batch.contact,
      batch.channelConnection
    );
  } catch (error) {
    return;
  }
}

function cleanupOldDebouncedMessages(): void {
  const now = new Date();
  const maxAge = MESSAGE_DEBOUNCING_CONFIG.maxDebounceDelay * 2;

  const keysToDelete: string[] = [];

  debouncedMessages.forEach((debouncedMessage, key) => {
    const age = now.getTime() - debouncedMessage.firstBufferedAt.getTime();
    if (age > maxAge) {
      clearTimeout(debouncedMessage.timeoutId);
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => {
    const batch = debouncedMessages.get(key);
    if (batch) {
      markDebounceBatchCancelled(batch.conversationId);
    }
    removeDebouncedBatchByKey(key);
  });
}

setInterval(() => {
  cleanupOldDebouncedMessages();
}, 60 * 1000);

/**
 * Normalize phone number to +E.164 format
 * @param phone The phone number to normalize
 * @returns Normalized phone number in +E.164 format
 */
function normalizePhoneToE164(phone: string): string {
  if (!phone) return phone;
  if (isBsuid(phone)) return phone.trim();

  let normalized = phone.replace(/[^\d+]/g, '');

  if (normalized.startsWith('+')) {
    return normalized;
  }

  return '+' + normalized;
}

/**
 * Build the recipient portion of a Cloud API /messages payload. Phone numbers
 * go in `to`; BSUIDs must be sent via the `recipient` field instead.
 */
function buildRecipientFields(to: string): { to?: string; recipient?: string } {
  const raw = String(to ?? '').trim();
  if (isBsuid(raw)) {
    return { recipient: raw };
  }
  return { to: normalizePhoneToE164(raw) };
}

function recipientIdentityKey(to: string): string {
  const raw = String(to ?? '').trim();
  return isBsuid(raw) ? raw : normalizePhoneToE164(raw);
}

/**
 * Split message into chunks based on configuration
 * @param message The message to split
 * @returns Array of message chunks
 */
function splitMessage(message: string): string[] {
  if (!MESSAGE_SPLITTING_CONFIG.enabled) {
    return [message];
  }

  if (message.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
    return [message];
  }

  // Use logical delimiter if enabled
  if (MESSAGE_SPLITTING_CONFIG.logicalSplitting.enabled) {
    const delimiter = MESSAGE_SPLITTING_CONFIG.logicalSplitting.delimiter;
    if (delimiter && message.includes(delimiter)) {
      return message.split(delimiter).map(chunk => chunk.trim()).filter(chunk => chunk.length > 0);
    }
  }

  // Split by characters at word boundaries
  const chunks: string[] = [];
  let remainingText = message.trim();

  while (remainingText.length > 0) {
    if (remainingText.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
      chunks.push(remainingText);
      break;
    }

    let splitPoint = MESSAGE_SPLITTING_CONFIG.maxLength;

    // Find word boundary
    for (let i = MESSAGE_SPLITTING_CONFIG.maxLength - 1; i >= Math.max(20, MESSAGE_SPLITTING_CONFIG.maxLength * 0.7); i--) {
      if (remainingText[i] === ' ') {
        splitPoint = i;
        break;
      }
    }

    const chunk = remainingText.substring(0, splitPoint).trim();
    chunks.push(chunk);
    remainingText = remainingText.substring(splitPoint).trim();
  }

  return chunks;
}

/**
 * Calculate delay between split messages
 * @returns Delay in milliseconds
 */
function calculateSplitMessageDelay(): number {
  const baseDelay = MESSAGE_SPLITTING_CONFIG.delayBetweenMessages;
  const randomFactor = 1 + (Math.random() - 0.5) * MESSAGE_SPLITTING_CONFIG.randomDelayFactor;
  return Math.max(baseDelay * randomFactor, 1000);
}

/**
 * Get file extension from media type
 */
function getFileExtensionFromMediaType(mediaType: string): string {
  switch (mediaType) {
    case 'image': return 'jpg';
    case 'video': return 'mp4';
    case 'audio': return 'mp3';
    case 'document': return 'pdf';
    default: return 'bin';
  }
}

/**
 * Get content type from media type
 */
function getContentTypeFromMediaType(mediaType: string): string {
  switch (mediaType) {
    case 'image': return 'image/jpeg';
    case 'video': return 'video/mp4';
    case 'audio': return 'audio/mpeg';
    case 'document': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

/**
 * Store the last received message ID from a contact for typing indicator purposes
 * @param phoneNumberId The business phone number ID
 * @param contactPhone The contact's phone number
 * @param messageId The WhatsApp message ID (wamid)
 */
export function storeLastReceivedMessageId(phoneNumberId: string, contactPhone: string, messageId: string): void {
  const key = `${phoneNumberId}:${contactPhone}`;
  lastReceivedMessageId.set(key, messageId);
}

/**
 * Get the last received message ID from a contact
 * @param phoneNumberId The business phone number ID
 * @param contactPhone The contact's phone number
 * @returns The last message ID or null
 */
function getLastReceivedMessageId(phoneNumberId: string, contactPhone: string): string | null {
  const key = `${phoneNumberId}:${contactPhone}`;
  return lastReceivedMessageId.get(key) || null;
}

/**
 * Send typing indicator via WhatsApp Cloud API
 * According to official docs, typing indicators are sent using the "mark as read" endpoint
 * with a typing_indicator object. It requires the message_id of the received message.
 * The typing indicator auto-dismisses after 25 seconds or when you respond.
 * 
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number (with country code)
 * @returns Promise resolving to success status
 */
export async function sendTypingIndicator(
  connectionId: number,
  companyId: number,
  to: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    assertWhatsAppMessagingReady(connection);
    const connectionData = connection.connectionData as any;
    const accessToken = connection.accessToken || connectionData?.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }

    const normalizedPhone = recipientIdentityKey(to);
    
    // Get the last received message ID from this contact
    const messageId = getLastReceivedMessageId(phoneNumberId, normalizedPhone);
    
    if (!messageId) {
      // No message to mark as read - can't show typing indicator
      // This is normal for first outbound messages
      console.log(`⏭️ No received message ID available for ${normalizedPhone}, skipping typing indicator`);
      return { success: true }; // Return success to not block the message flow
    }

    // WhatsApp Cloud API typing indicator uses the "mark as read" endpoint
    // with a typing_indicator object
    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: {
          type: 'text'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data?.success) {
      console.log(`✍️ Typing indicator sent to ${normalizedPhone}`);
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Failed to send typing indicator: Unknown error'
      };
    }
  } catch (error: any) {
    console.error('Error sending typing indicator:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Send recording indicator via WhatsApp Cloud API
 * Note: WhatsApp Cloud API only supports "text" type for typing indicators.
 * This function uses the same typing indicator but logs it as recording for clarity.
 * 
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number (with country code)
 * @returns Promise resolving to success status
 */
export async function sendRecordingIndicator(
  connectionId: number,
  companyId: number,
  to: string
): Promise<{ success: boolean; error?: string }> {
  // WhatsApp Cloud API only supports "text" type for typing indicators
  // We use the same endpoint but log it as recording for debugging
  console.log(`🎤 Sending recording indicator (using text typing indicator) to ${normalizePhoneToE164(to)}`);
  return sendTypingIndicator(connectionId, companyId, to);
}

/**
 * Stop typing indicator via WhatsApp Cloud API
 * Note: WhatsApp Cloud API typing indicators auto-dismiss after 25 seconds
 * or when you send a response. There is no explicit "stop" API.
 * This function is kept for backward compatibility but is a no-op.
 * 
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number (with country code)
 * @returns Promise resolving to success status
 */
export async function stopTypingIndicator(
  connectionId: number,
  companyId: number,
  to: string
): Promise<{ success: boolean; error?: string }> {
  // WhatsApp Cloud API typing indicators auto-dismiss after 25 seconds
  // or when you send a message. There is no explicit "stop" API.
  // This function is kept for backward compatibility.
  console.log(`⏹️ Typing indicator will auto-dismiss for ${normalizePhoneToE164(to)} (no explicit stop needed)`);
  return { success: true };
}

/**
 * Calculate typing delay based on message length
 * @param message The message content to calculate typing time for
 * @returns Delay in milliseconds
 */
function calculateTypingDelay(message: string): number {
  if (!TYPING_CONFIG.enabled) {
    return 0;
  }

  const words = message.split(' ').length;
  const baseDelay = (words / TYPING_CONFIG.wordsPerMinute) * 60 * 1000;

  const randomFactor = 0.7 + Math.random() * TYPING_CONFIG.randomnessFactor;
  const calculatedDelay = Math.min(
    Math.max(baseDelay * randomFactor, TYPING_CONFIG.minDelay),
    TYPING_CONFIG.maxDelay
  );

  return calculatedDelay;
}

/**
 * Calculate recording delay for voice messages
 * @returns Delay in milliseconds
 */
function calculateRecordingDelay(): number {
  if (!TYPING_CONFIG.enabled) {
    return 0;
  }

  const delay = TYPING_CONFIG.recordingMinDelay + 
    Math.random() * (TYPING_CONFIG.recordingMaxDelay - TYPING_CONFIG.recordingMinDelay);

  return delay;
}

/**
 * Simulate typing indicator with delay based on message length
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number
 * @param message The message content to calculate typing time for
 * @returns Promise that resolves when typing simulation is complete
 */
export async function simulateTyping(
  connectionId: number,
  companyId: number,
  to: string,
  message: string
): Promise<void> {
  if (!TYPING_CONFIG.enabled) {
    return;
  }

  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      console.warn(`Connection ${connectionId} not found for typing simulation`);
      return;
    }

    const connectionData = connection.connectionData as any;
    const behaviorSettings = connectionData?.behaviorSettings;

    if (behaviorSettings?.typingIndicator === false) {
      console.log('⏭️ Typing indicator disabled in behavior settings');
      return;
    }

    await sendTypingIndicator(connectionId, companyId, to);

    const delay = calculateTypingDelay(message);
    console.log(`⏱️ Simulating typing for ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    await stopTypingIndicator(connectionId, companyId, to);
  } catch (error) {
    console.error('Error simulating typing:', error);
  }
}

/**
 * Simulate recording indicator with delay
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number
 * @returns Promise that resolves when recording simulation is complete
 */
export async function simulateRecording(
  connectionId: number,
  companyId: number,
  to: string
): Promise<void> {
  if (!TYPING_CONFIG.enabled) {
    return;
  }

  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      console.warn(`Connection ${connectionId} not found for recording simulation`);
      return;
    }

    const connectionData = connection.connectionData as any;
    const behaviorSettings = connectionData?.behaviorSettings;

    if (behaviorSettings?.typingIndicator === false) {
      console.log('⏭️ Recording indicator disabled in behavior settings');
      return;
    }

    await sendRecordingIndicator(connectionId, companyId, to);

    const delay = calculateRecordingDelay();
    console.log(`⏱️ Simulating recording for ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    await stopTypingIndicator(connectionId, companyId, to);
  } catch (error) {
    console.error('Error simulating recording:', error);
  }
}

/**
 * Get a WhatsApp Business API connection status by ID
 * @param connectionId The ID of the connection
 * @param companyId The company ID for multi-tenant security
 * @returns True if connection is active, false otherwise
 */
export async function getConnectionStatus(connectionId: number, companyId: number): Promise<boolean> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }


    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      return false;
    }

    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    return activeConnections.get(connectionId) === true;
  } catch (error) {
    console.error(`Error getting connection status for ${connectionId}:`, error);
    return false;
  }
}

/**
 * Download media from a WhatsApp Business API message and save it to disk
 * @param mediaId The ID of the media from WhatsApp Business API
 * @param accessToken The access token for the connection
 * @param mediaType The type of media (image, video, audio, document)
 * @returns The URL path to the saved media file or null if failed
 */
export async function downloadAndSaveMedia(
  mediaId: string,
  accessToken: string,
  mediaType: string,
  forceRefresh: boolean = false
): Promise<string | null> {
  try {
    const mediaKey = crypto.createHash('md5').update(mediaId).digest('hex');

    if (!forceRefresh && mediaCache.has(mediaKey)) {
      const cachedUrl = mediaCache.get(mediaKey);
      if (cachedUrl) {
        

        const filePath = path.join(process.cwd(), 'public', cachedUrl.substring(1));
        if (await fsExtra.pathExists(filePath)) {
          return cachedUrl;
        }

        
      }
      mediaCache.delete(mediaKey);
    }

    const mediaMetadataResponse = await axios.get(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const downloadUrl = mediaMetadataResponse.data?.url;
    if (!downloadUrl) {
      console.error('WhatsApp media metadata did not include a download URL:', {
        mediaId,
        mediaType,
        metadata: mediaMetadataResponse.data
      });
      return null;
    }

    const metadataMimeType = mediaMetadataResponse.data?.mime_type;
    let extension = resolveWhatsAppMediaFileExtension({
      metadataMimeType,
      downloadUrl,
      fallbackExtension: getFileExtensionFromMediaType(mediaType)
    });

    const mediaTypeDir = path.join(MEDIA_DIR, mediaType);
    await fsExtra.ensureDir(mediaTypeDir);

    let filename = `${mediaKey}${extension}`;
    let filepath = path.join(mediaTypeDir, filename);
    let mediaUrl = `/media/${mediaType}/${filename}`;

    

    if (!forceRefresh && await fsExtra.pathExists(filepath)) {
      
      mediaCache.set(mediaKey, mediaUrl);
      return mediaUrl;
    }

    const mediaResponse = await axios({
      url: downloadUrl,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer'
    });

    const responseMimeType = typeof mediaResponse.headers?.['content-type'] === 'string'
      ? mediaResponse.headers['content-type']
      : null;

    const resolvedExtension = resolveWhatsAppMediaFileExtension({
      metadataMimeType,
      responseMimeType,
      downloadUrl,
      fallbackExtension: getFileExtensionFromMediaType(mediaType)
    });

    if (resolvedExtension !== extension) {
      extension = resolvedExtension;
      filename = `${mediaKey}${extension}`;
      filepath = path.join(mediaTypeDir, filename);
      mediaUrl = `/media/${mediaType}/${filename}`;

      if (!forceRefresh && await fsExtra.pathExists(filepath)) {
        mediaCache.set(mediaKey, mediaUrl);
        return mediaUrl;
      }
    }

    await fsExtra.writeFile(filepath, mediaResponse.data);
    

    mediaCache.set(mediaKey, mediaUrl);

    return mediaUrl;
  } catch (error) {
    console.error('Error downloading media:', error);
    return null;
  }
}

/**
 * Verifies a WhatsApp Business API webhook signature
 * @param signature The X-Hub-Signature header value
 * @param body The raw request body (Buffer, string, or object)
 * @param appSecret The app secret for the WhatsApp Business application
 * @param debug Optional flag to enable verbose debugging (default: false)
 * @returns True if signature is valid, false otherwise
 */
export function verifyWebhookSignature(signature: string, body: Buffer | string | any, appSecret: string, debug: boolean = false): boolean {
  try {
    if (!signature || !appSecret) {
      return false;
    }

    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2) {
      return false;
    }

    const algorithm = signatureParts[0];
    const receivedHash = signatureParts[1];

    let bodyBuffer: Buffer;
    if (Buffer.isBuffer(body)) {
      bodyBuffer = body;
    } else if (typeof body === 'string') {
      bodyBuffer = Buffer.from(body, 'utf8');
    } else if (typeof body === 'object') {
      bodyBuffer = Buffer.from(JSON.stringify(body), 'utf8');
    } else {
      console.error('Unsupported body type for signature verification:', typeof body);
      return false;
    }

    const hmac = crypto.createHmac(algorithm, appSecret);
    hmac.update(bodyBuffer);
    const expectedHash = hmac.digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(receivedHash, 'hex')
    );

    return isValid;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Connects to WhatsApp Business API by verifying access token
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 * @param companyId The company ID for multi-tenant security
 */
export async function connectToWhatsAppBusiness(connectionId: number, userId: number, companyId: number): Promise<void> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (!connection.companyId) {
      console.warn(`Connection ${connectionId} missing companyId - this may be a legacy connection. Consider updating the database.`);
    } else if (connection.companyId !== companyId) {
      console.error(`Company ID mismatch: Connection ${connectionId} belongs to company ${connection.companyId}, but user is from company ${companyId}`);
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    if (activeConnections.has(connectionId)) {
      return;
    }

    const connectionData = connection.connectionData as any;
    const accessToken = connection.accessToken || connectionData?.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }

    try {

      const response = await axios.get(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/whatsapp_business_profile`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.status === 200 && response.data) {
        await storage.updateChannelConnectionStatus(connectionId, 'active');

        activeConnections.set(connectionId, true);

        eventEmitter.emit('connectionStatusUpdate', {
          connectionId,
          status: 'connected'
        });

        
      } else {
        throw new Error('Failed to verify WhatsApp Business API connection');
      }
    } catch (error: any) {
      console.error('Error verifying WhatsApp Business API connection:', error.response?.data || error.message);

      await storage.updateChannelConnectionStatus(connectionId, 'error');

      eventEmitter.emit('connectionError', {
        connectionId,
        error: error.response?.data?.error?.message || error.message
      });

      throw error;
    }
  } catch (error: any) {
    console.error('Error connecting to WhatsApp Business API:', error);
    throw error;
  }
}

/**
 * Disconnects from WhatsApp Business API
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 * @param companyId The company ID for multi-tenant security
 */
export async function disconnectFromWhatsAppBusiness(connectionId: number, userId: number, companyId: number): Promise<boolean> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (!connection.companyId) {
      console.warn(`Connection ${connectionId} missing companyId - this may be a legacy connection. Consider updating the database.`);
    } else if (connection.companyId !== companyId) {
      console.error(`Company ID mismatch: Connection ${connectionId} belongs to company ${connection.companyId}, but user is from company ${companyId}`);
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    activeConnections.delete(connectionId);

    await storage.updateChannelConnectionStatus(connectionId, 'inactive');

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'disconnected'
    });

    return true;
  } catch (error) {
    console.error('Error disconnecting from WhatsApp Business API:', error);
    return false;
  }
}

/**
 * Send a text message via WhatsApp Business API
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number (with country code, no spaces or symbols)
 * @param message The message text to send
 */
export async function sendWhatsAppBusinessMessage(
  connectionId: number,
  userId: number,
  companyId: number,
  to: string,
  message: string
): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    assertWhatsAppMessagingReady(connection);
    await assertReconnectedWhatsAppWindow(connection, to);
    const connectionData = connection.connectionData as any;
    const accessToken = connection.accessToken || connectionData?.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }


    const normalizedPhone = recipientIdentityKey(to);


    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...buildRecipientFields(to),
        type: 'text',
        text: {
          body: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.messages?.[0]?.id;

      return {
        success: true,
        messageId
      };
    } else {
      return {
        success: false,
        error: 'Failed to send message: Unknown error'
      };
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp Business message:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Send a template message for testing WhatsApp Business API connection
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number (with country code, no spaces or symbols)
 * @param templateName The name of the template to send (default: 'hello_world')
 * @param languageCode The language code for the template (default: 'en_US')
 */
export async function sendWhatsAppTestTemplate(
  connectionId: number,
  companyId: number,
  to: string,
  templateName: string = 'hello_world',
  languageCode: 'en_US' | 'en' | 'es' | 'pt_BR' = 'en_US'
): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    assertWhatsAppMessagingReady(connection);
    const connectionData = connection.connectionData as any;
    const accessToken = connection.accessToken || connectionData?.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }


    const normalizedPhone = recipientIdentityKey(to);


    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...buildRecipientFields(to),
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.messages?.[0]?.id;

      return {
        success: true,
        messageId
      };
    } else {
      return {
        success: false,
        error: 'Failed to send template message: Unknown error'
      };
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp template message:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Send a WhatsApp template message with variables (for campaigns)
 * @param connectionId The ID of the channel connection
 * @param userId The user ID sending the message
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number (with country code)
 * @param templateName The name of the approved template
 * @param languageCode The language code for the template (e.g., 'en', 'en_US')
 * @param components Optional template components (header, body, buttons with variables)
 * @param skipBroadcast Whether to skip broadcasting the message to clients (default: false)
 * @returns The message result with messageId
 */
export async function sendTemplateMessage(
  connectionId: number,
  userId: number,
  companyId: number,
  to: string,
  templateName: string,
  languageCode: string = 'en',
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{ type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video' | 'coupon_code'; text?: string; [key: string]: any }>;
    sub_type?: string;
    index?: string;
  }>,
  skipBroadcast: boolean = false,
  existingConversationId?: number,
): Promise<any> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    assertWhatsAppMessagingReady(connection);
    const connectionData = connection.connectionData as any;
    const accessToken = connection.accessToken || connectionData?.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }


    const pinnedConversation = existingConversationId ? await storage.getConversation(existingConversationId) : undefined;
    const pinnedContact = pinnedConversation?.contactId ? await storage.getContact(pinnedConversation.contactId) : undefined;
    if (existingConversationId && (!pinnedConversation || !pinnedContact || pinnedConversation.companyId !== companyId ||
      pinnedContact.companyId !== companyId || pinnedConversation.channelId !== connectionId || pinnedConversation.isGroup)) {
      throw new Error('Invalid template conversation');
    }
    const normalizedPhone = recipientIdentityKey(to);

    const templatePayload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...buildRecipientFields(to),
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        }
      }
    };


    const normalizedComponents = normalizeTemplateMediaComponents(components || []);
    if (normalizedComponents.length > 0) {
      templatePayload.template.components = normalizedComponents;
    }


    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      templatePayload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.messages?.[0]?.id;


      try {
        const toIsBsuid = isBsuid(to);
        let contact = pinnedContact || (toIsBsuid
          ? await storage.getContactByWhatsAppBsuid(normalizedPhone, companyId)
          : await storage.getContactByPhone(normalizedPhone, companyId));
        if (!contact) {
          contact = await storage.getOrCreateContact({
            companyId: companyId,
            name: toIsBsuid ? normalizedPhone : normalizedPhone,
            phone: toIsBsuid ? null : normalizedPhone,
            email: null,
            avatarUrl: null,
            identifier: normalizedPhone,
            identifierType: 'whatsapp',
            source: 'whatsapp_official',
            notes: null,
            ...(toIsBsuid ? { whatsappBsuid: normalizedPhone } : {})
          });
        }


        let conversation = pinnedConversation || await storage.getConversationByContactAndChannel(contact.id, connectionId);
        if (!conversation) {
          conversation = await storage.createConversation({
            companyId: companyId,
            contactId: contact.id,
            channelId: connectionId,
            channelType: 'whatsapp_official',
            status: 'open',
            assignedToUserId: userId,
            lastMessageAt: new Date()
          });
        }


        let templateRecord: any = null;
        try {
          const db = (await import('../../db')).db;
          const { campaignTemplates } = await import('@shared/schema');
          const { eq, and } = await import('drizzle-orm');
          
          const templates = await db.select()
            .from(campaignTemplates)
            .where(and(
              eq(campaignTemplates.whatsappTemplateName, templateName),
              eq(campaignTemplates.companyId, companyId),
              eq(campaignTemplates.connectionId, connectionId),
              eq(campaignTemplates.whatsappTemplateLanguage, languageCode)
            ))
            .limit(1);
          
          templateRecord = templates[0];
        } catch (err) {
          console.error('Error fetching template record:', err);
        }


        const canonicalComponents = (templateRecord?.whatsappTemplateComponents as any[]) || [];
        const variableDefinitions = (templateRecord?.whatsappTemplateVariables as WhatsAppTemplateVariableDefinition[]) || [];
        const parameterFormat = (templateRecord?.whatsappParameterFormat || 'positional') as WhatsAppParameterFormat;
        let messageContent = renderTemplateMessagePreview(
          canonicalComponents,
          variableDefinitions,
          normalizedComponents,
          parameterFormat,
          templateRecord?.content || '',
        );
        const metadata: any = {
          templateName: templateName,
          templateLanguage: languageCode,
          templateComponents: normalizedComponents,
          messageId: messageId
        };


        if (normalizedComponents.length > 0) {
          for (const component of normalizedComponents) {
            if (component.type === 'header' && component.parameters) {
              for (const param of component.parameters) {
                if (param.type === 'image' && param.image) {
                  const imageValue = (param.image as any).link || (param.image as any).id;

                  if (imageValue && /^[0-9]+$/.test(imageValue)) {
                    try {
                      const downloadedUrl = await downloadAndSaveMedia(imageValue, accessToken, 'image');
                      metadata.headerImage = downloadedUrl || imageValue;
                    } catch (err) {
                      console.error('Error downloading header image:', err);
                      metadata.headerImage = imageValue;
                    }
                  } else {
                    metadata.headerImage = imageValue;
                  }
                } else if (param.type === 'video' && param.video) {
                  const videoValue = (param.video as any).link || (param.video as any).id;

                  if (videoValue && /^[0-9]+$/.test(videoValue)) {
                    try {
                      const downloadedUrl = await downloadAndSaveMedia(videoValue, accessToken, 'video');
                      metadata.headerVideo = downloadedUrl || videoValue;
                    } catch (err) {
                      console.error('Error downloading header video:', err);
                      metadata.headerVideo = videoValue;
                    }
                  } else {
                    metadata.headerVideo = videoValue;
                  }
                } else if (param.type === 'document' && param.document) {
                  const documentValue = (param.document as any).link || (param.document as any).id;

                  if (documentValue && /^[0-9]+$/.test(documentValue)) {
                    try {
                      const downloadedUrl = await downloadAndSaveMedia(documentValue, accessToken, 'document');
                      metadata.headerDocument = downloadedUrl || documentValue;
                    } catch (err) {
                      console.error('Error downloading header document:', err);
                      metadata.headerDocument = documentValue;
                    }
                  } else {
                    metadata.headerDocument = documentValue;
                  }
                  metadata.documentFilename = (param.document as any).filename;
                }
              }
            }
          }
        }


        if (!messageContent || messageContent.trim() === '') {
          messageContent = `Template: ${templateName}`;
        }


        const existingMessage = await storage.getMessageByExternalId(messageId, companyId);
        if (existingMessage) {
          
          return {
            success: true,
            messageId,
            id: messageId
          };
        }


        const messageData = {
          conversationId: conversation.id,
          content: messageContent.trim(),
          type: 'template',
          direction: 'outbound',
          status: 'sent',
          metadata: JSON.stringify(metadata),
          mediaUrl: null,
          externalId: messageId,
          senderId: userId,
          senderType: 'user',
          sentAt: new Date()
        };

        const savedMessage = await storage.createMessage(messageData);


        await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date(),
          status: 'active'
        });


        if (!skipBroadcast && (global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'newMessage',
            data: savedMessage
          }, companyId);
        }


        eventEmitter.emit('newMessage', {
          message: savedMessage,
          conversation,
          contact
        });

      } catch (dbError) {
        console.error('Error saving template message to database:', dbError);

      }

      return {
        success: true,
        messageId,
        id: messageId
      };
    } else {
      throw new Error('Failed to send template message: Unknown error');
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp template message:', error.response?.data || error.message);
    if (error.response?.data?.error?.code === 131062) {
      throw new Error('This template cannot be sent to a username-only contact (no phone number on file). Authentication templates require a phone number.');
    }
    const sendError = new Error(error.response?.data?.error?.message || error.message || 'Failed to send template message');
    // Preserve an explicit rejection status for safe scheduled-message retries.
    Object.assign(sendError, { providerStatus: error.response?.status });
    throw sendError;
  }
}

/**
 * Send a media message via WhatsApp Business API
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 * @param to The recipient phone number (with country code, no spaces or symbols)
 * @param mediaType The type of media to send (image, video, audio, document)
 * @param mediaUrl The URL of the media to send (must be publicly accessible or a link to file upload)
 * @param caption Optional caption for the media
 * @param filename Optional filename for document media
 * @param originalMimeType Optional original MIME type to preserve for audio files
 * @param isFromBot Whether the message is sent from a bot (default: false)
 * @param skipBroadcast Whether to skip broadcasting the message to clients (default: false)
 */
export async function sendWhatsAppBusinessMediaMessage(
  connectionId: number,
  userId: number,
  companyId: number,
  to: string,
  mediaType: 'image' | 'video' | 'audio' | 'document',
  mediaUrl: string,
  caption?: string,
  filename?: string,
  originalMimeType?: string,
  isFromBot: boolean = false,
  skipBroadcast: boolean = false,
  existingConversationId?: number,
): Promise<any> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    const pinnedConversation = existingConversationId ? await storage.getConversation(existingConversationId) : undefined;
    if (existingConversationId && (!pinnedConversation || pinnedConversation.companyId !== companyId || pinnedConversation.channelId !== connectionId || pinnedConversation.isGroup)) {
      throw new Error('Invalid media conversation');
    }
    const pinnedContact = pinnedConversation?.contactId ? await storage.getContact(pinnedConversation.contactId) : undefined;
    if (pinnedConversation && (!pinnedContact || pinnedContact.companyId !== companyId)) throw new Error('Invalid media patient');
    assertWhatsAppMessagingReady(connection);
    await assertReconnectedWhatsAppWindow(connection, to);
    const connectionData = connection.connectionData as any;
    const accessToken = connection.accessToken || connectionData?.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    console.log('🔍 [WHATSAPP MEDIA] Access token source:', { hasTopLevel: !!connection.accessToken, hasNested: !!connectionData?.accessToken, using: accessToken ? 'found' : 'missing' });

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }


    const normalizedPhone = recipientIdentityKey(to);

    // Simulate typing/recording indicator before sending if message is from bot
    if (isFromBot) {
      if (mediaType === 'audio') {
        await simulateRecording(connectionId, companyId, normalizedPhone);
      } else {
        // For other media types, simulate typing based on caption or media type
        const simulationMessage = caption || `Sending ${mediaType}...`;
        await simulateTyping(connectionId, companyId, normalizedPhone, simulationMessage);
      }
    }

    let mediaId: string;
    let mediaFileSize: number | undefined;

    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {

      let fileStream: NodeJS.ReadableStream;
      const isLocalUrl = (() => {
        try {
          const u = new URL(mediaUrl);
          return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && !u.pathname.startsWith('/api/dental-consent-media/');
        } catch {
          return false;
        }
      })();

      if (isLocalUrl) {
        // Media URL points to this server (e.g. http://127.0.0.1/uploads/...). Fetching via HTTP
        // would hit ourselves and fail (e.g. ECONNREFUSED in Docker). Read from disk instead.
        const pathname = new URL(mediaUrl).pathname || '';
        const relativePath = pathname.replace(/^\//, '');
        const localPath = path.resolve(process.cwd(), relativePath);
        const cwd = path.resolve(process.cwd());
        if (!localPath.startsWith(cwd) || !(await fsExtra.pathExists(localPath))) {
          throw new Error(`Local media path not allowed or file not found: ${pathname}`);
        }
        try {
          const stat = await fsExtra.stat(localPath);
          mediaFileSize = stat.size;
        } catch { /* ignore */ }
        fileStream = fs.createReadStream(localPath);
      } else {
        const mediaResponse = await axios.get(mediaUrl, {
          responseType: 'stream',
          timeout: 30000 // 30 second timeout
        });
        fileStream = mediaResponse.data;
      }

      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', fileStream, {
        filename: filename || `media.${getFileExtensionFromMediaType(mediaType)}`,
        contentType: originalMimeType || getContentTypeFromMediaType(mediaType)
      });


      const uploadResponse = await axios.post(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...formData.getHeaders()
          }
        }
      );

      if (!uploadResponse.data?.id) {
        console.error('Media upload failed:', uploadResponse.data);
        throw new Error(`Failed to upload media to WhatsApp servers: ${uploadResponse.data?.error?.message || 'Unknown error'}`);
      }

      mediaId = uploadResponse.data.id;

    } else {
      throw new Error('Media URL must be a valid HTTP/HTTPS URL');
    }


    const mediaRequest: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...buildRecipientFields(to),
      type: mediaType
    };


    mediaRequest[mediaType] = {
      id: mediaId
    };

    if (caption && ['image', 'video', 'document'].includes(mediaType)) {
      mediaRequest[mediaType].caption = caption;
    }

    if (filename && mediaType === 'document') {
      mediaRequest.document.filename = filename;
    }

    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      mediaRequest,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.messages?.[0]?.id;


      let contact = pinnedContact || (isBsuid(to)
        ? await storage.getContactByWhatsAppBsuid(normalizedPhone, companyId)
        : await storage.getContactByPhone(normalizedPhone, companyId));
      if (!contact) {
        const contactData: InsertContact = {
          companyId,
          name: normalizedPhone,
          phone: isBsuid(to) ? null : normalizedPhone,
          email: null,
          avatarUrl: null,
          identifier: normalizedPhone,
          identifierType: 'whatsapp',
          source: 'whatsapp_official',
          notes: null,
          ...(isBsuid(to) ? { whatsappBsuid: normalizedPhone } : {})
        };
        contact = await storage.getOrCreateContact(contactData);
      }


      let conversation = pinnedConversation || await storage.getConversationByContactAndChannel(contact.id, connectionId);
      if (!conversation) {
        const conversationData: InsertConversation = {
          companyId,
          contactId: contact.id,
          channelId: connectionId,
          channelType: 'whatsapp_official',
          status: 'open',
          assignedToUserId: userId,
          lastMessageAt: new Date(),
        };
        conversation = await storage.createConversation(conversationData);
      }


      const messageData: InsertMessage = {
        conversationId: conversation.id,
        senderId: isFromBot ? null : userId,
        senderType: isFromBot ? null : 'user',
        content: caption || `[${mediaType.toUpperCase()}]`,
        type: mediaType,
        direction: 'outbound',
        status: 'sent',
        isFromBot: isFromBot,
        mediaUrl: normalizeStoredMediaUrl(mediaUrl) || mediaUrl,
        externalId: messageId,
        metadata: JSON.stringify({
          messageId,
          timestamp: Date.now(),
          mediaType,
          filename: filename || undefined,
          mediaId,
          ...(typeof mediaFileSize === 'number' && { mediaFileSize })
        })
      };

      const savedMessage = await storage.createMessage(messageData);


      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date(),
        status: 'active'
      });


      if (!skipBroadcast && (global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'newMessage',
          data: savedMessage
        }, companyId);

        (global as any).broadcastToAllClients({
          type: 'conversationUpdated',
          data: conversation
        }, companyId);
      }

      
      return savedMessage;
    } else {
      throw new Error('Failed to send media message: Unknown error');
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp Business media message:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Process a message through the flow executor (extracted for reuse)
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
      const mergedContentOverride =
        typeof message?.__debouncedMergedContent === 'string'
          ? message.__debouncedMergedContent
          : null;
      const executionPayload = mergedContentOverride
        ? { ...message, content: mergedContentOverride }
        : message;
      await flowExecutor.processIncomingMessage(executionPayload, conversation, contact, channelConnection);
    }
  } catch (error) {
    console.error('Error in flow executor:', error);
    throw error;
  }
}

/**
 * Process a message webhook from WhatsApp Business API
 * @param payload The webhook payload from WhatsApp Business API
 * @param companyId Optional company ID for multi-tenant security
 */
export async function processWebhook(payload: any, companyId?: number): Promise<void> {
  try {
    if (!payload.entry || !payload.entry.length) {
      
      return;
    }

    if (companyId === undefined) {
      console.warn('[WhatsApp processWebhook] Invoked without companyId — no targetConnection was found in the route handler for this webhook payload. Connection lookup will be performed by phoneNumberId only.');
    }

    for (const entry of payload.entry) {
      if (!entry.changes || !entry.changes.length) continue;

      for (const change of entry.changes) {
        if (change.field === 'messages') {
          const value = change.value;
          if (!value || !value.messages || !value.messages.length) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          if (!phoneNumberId) {
            
            continue;
          }




          const connections = await storage.getChannelConnectionsByType('whatsapp_official');
          const phoneNumberIdStr = String(phoneNumberId);

          const connection = connections.find(conn => {
            const connData = conn.connectionData as any;
            return connData?.phoneNumberId != null && String(connData.phoneNumberId) === phoneNumberIdStr;
          });

          if (!connection) {
            console.warn(`No WhatsApp Business API connection found for phone number ID: ${phoneNumberId} (checked ${connections.length} connections)`);
            continue;
          }


          if (companyId && connection.companyId !== companyId) {
            console.warn(`Company ID mismatch for connection ${connection.id}: expected ${companyId}, got ${connection.companyId}`);
            continue;
          }

          if (!connection.companyId) {
            console.error(`WhatsApp connection ${connection.id} missing companyId - skipping message processing`);
            continue;
          }

          for (const message of value.messages) {
            await handleIncomingWebhookMessage(message, value.contacts, connection);
          }
        } else if (change.field === 'history') {
          await handleHistoryWebhook(change.value);
        } else if (change.field === 'user_id_update') {
          await handleUserIdUpdateWebhook(change.value);
        }
      }
    }
  } catch (error) {
    console.error('Error processing webhook message:', error);
  }
}

/**
 * Handle Meta's user_id_update webhook: when a user changes their phone
 * number, their Business-Scoped User ID (BSUID) is regenerated and Meta sends
 * the old and new values so stored records can be remapped.
 */
async function handleUserIdUpdateWebhook(value: any): Promise<void> {
  try {
    const update = value?.user_id_update || value || {};
    const oldBsuid: string | null = update.old_user_id || update.oldUserId || null;
    const newBsuid: string | null = update.new_user_id || update.newUserId || null;
    if (!oldBsuid || !newBsuid || !isBsuid(oldBsuid) || !isBsuid(newBsuid)) {
      console.warn('[WhatsApp Official] user_id_update webhook missing old/new user id:', JSON.stringify(update));
      return;
    }

    const phoneNumberId = value?.metadata?.phone_number_id;
    const connections = await storage.getChannelConnectionsByType('whatsapp_official');
    const matched = phoneNumberId
      ? connections.filter(conn => {
          const connData = conn.connectionData as any;
          return connData?.phoneNumberId != null && String(connData.phoneNumberId) === String(phoneNumberId);
        })
      : connections;

    for (const conn of matched) {
      if (!conn.companyId) continue;
      const contact = await storage.getContactByWhatsAppBsuid(oldBsuid, conn.companyId);
      if (contact) {
        await storage.updateContactWhatsAppIdentity(contact.id, { whatsappBsuid: newBsuid });
        console.log(`[WhatsApp Official] Remapped BSUID for contact ${contact.id} (company ${conn.companyId})`);
      }
    }
  } catch (error) {
    console.error('[WhatsApp Official] Error handling user_id_update webhook:', error);
  }
}

/**
 * Handle history sync webhook from Meta WhatsApp Business API
 * @param historyValue The history webhook payload
 */
async function handleHistoryWebhook(historyValue: any): Promise<void> {
  try {
    if (!historyValue || !historyValue.history || !Array.isArray(historyValue.history)) {
      console.log('[HISTORY SYNC] Invalid history webhook payload structure');
      return;
    }

    const phoneNumberId = historyValue.metadata?.phone_number_id;
    if (!phoneNumberId) {
      console.warn('[HISTORY SYNC] Missing phone_number_id in history webhook metadata');
      return;
    }

    if (!hasLoggedHistoryWebhook) {
      console.log(`[HISTORY SYNC] Received history webhook event for phone_number_id=${phoneNumberId}`);
      hasLoggedHistoryWebhook = true;
    }

    const connections = await storage.getChannelConnectionsByType('whatsapp_official');
    const phoneNumberIdStr = String(phoneNumberId);
    const connection = connections.find(conn => {
      const connData = conn.connectionData as any;
      return connData?.phoneNumberId != null && String(connData.phoneNumberId) === phoneNumberIdStr;
    });

    if (!connection) {
      console.warn(`[HISTORY SYNC] No WhatsApp Business API connection found for phone number ID: ${phoneNumberId}`);
      return;
    }

    const connData = connection.connectionData as any;
    if (!connData?.historySyncEnabled) {
      console.log(`[HISTORY SYNC] History sync not enabled for connection ${connection.id}`);
      return;
    }

    // Import the processor dynamically to avoid circular dependencies
    const { WhatsAppHistorySyncProcessor } = await import('./whatsapp-history-sync-processor');
    const processor = new WhatsAppHistorySyncProcessor();

    // Process each history chunk
    for (const historyItem of historyValue.history) {
      try {
        await processor.processHistoryChunk(historyItem, connection);
      } catch (error) {
        console.error(`[HISTORY SYNC] Error processing history chunk:`, error);
      }
    }
  } catch (error) {
    console.error('[HISTORY SYNC] Error handling history webhook:', error);
  }
}

/**
 * Handle an incoming webhook message from WhatsApp Business API
 * @param message The message object from the webhook
 * @param contacts The contacts object from the webhook
 * @param connection The channel connection
 */
async function handleIncomingWebhookMessage(
  message: any,
  contacts: any[],
  connection: ChannelConnection
): Promise<void> {
  try {
    const rawFrom = String(message.from || message.from_user_id || '').trim();
    const webhookContact = contacts?.find(c =>
      (rawFrom && (c.wa_id === rawFrom || c.user_id === rawFrom))
    ) || contacts?.[0];
    const bsuid: string | null = webhookContact?.user_id || message.from_user_id || (isBsuid(rawFrom) ? rawFrom : null) || null;
    if (!rawFrom && !bsuid) {
      return;
    }

    const messageId = message.id;
    const timestamp = message.timestamp * 1000;

    const rawWebhookUsername = webhookContact?.profile?.username || webhookContact?.username || null;
    const waUsername = rawWebhookUsername && validateWhatsAppUsername(rawWebhookUsername)
      ? normalizeWhatsAppUsername(rawWebhookUsername)
      : null;
    const fromIsBsuid = isBsuid(rawFrom);
    const phoneCandidate = !fromIsBsuid && rawFrom && !isBsuid(rawFrom)
      ? rawFrom
      : (webhookContact?.wa_id || null);
    const normalizedPhone: string | null = phoneCandidate && !isBsuid(String(phoneCandidate))
      ? normalizePhoneToE164(String(phoneCandidate))
      : null;

    const senderIdentity = normalizedPhone ?? bsuid ?? rawFrom;

    const connectionData = connection.connectionData as any;
    const phoneNumberId = connectionData?.phoneNumberId;
    if (phoneNumberId && messageId && senderIdentity) {
      storeLastReceivedMessageId(phoneNumberId, senderIdentity, messageId);
    }

    const existingMessage = await storage.getMessageByExternalId(messageId, connection.companyId || undefined);
    if (existingMessage) {

      return;
    }

    const metaReferral = normalizeWhatsAppOfficialMetaReferral(message);

    let contact = bsuid
      ? await storage.getContactByWhatsAppBsuid(bsuid, connection.companyId!)
      : undefined;
    if (!contact && normalizedPhone) {
      contact = await storage.getContactByPhone(normalizedPhone, connection.companyId!);
    }
    if (!contact && waUsername) {
      contact = await storage.getContactByWhatsAppUsername(waUsername, connection.companyId!);
    }
    let contactWasCreatedByInboundWebhook = false;
    let conversationWasCreated = false;

    if (!contact) {
      const contactName = webhookContact?.profile?.name
        || (waUsername ? `@${waUsername}` : null)
        || normalizedPhone
        || bsuid
        || rawFrom;

      const metaReferralContactTags = deriveMetaReferralContactTags(metaReferral);
      const contactData: InsertContact = {
        companyId: connection.companyId!,
        name: contactName,
        phone: normalizedPhone,
        email: null,
        avatarUrl: null,
        identifier: normalizedPhone ?? bsuid ?? rawFrom,
        identifierType: 'whatsapp',
        source: 'whatsapp_official',
        notes: null,
        ...(bsuid ? { whatsappBsuid: bsuid } : {}),
        ...(waUsername ? { whatsappUsername: waUsername, whatsappUsernameUpdatedAt: new Date() } : {}),
        ...(metaReferralContactTags.length > 0 ? { tags: metaReferralContactTags } : {}),
      };

      const contactResult = await storage.getOrCreateContactResult(contactData);
      contact = contactResult.contact;
      contactWasCreatedByInboundWebhook = contactResult.created;

      // Auto-add contact to pipeline if enabled (only for newly created contacts)
      if (contactWasCreatedByInboundWebhook) try {
        const autoAddEnabled = await getCachedCompanySetting(connection.companyId!, 'autoAddContactToPipeline');
        if (autoAddEnabled) {
          const initialStage = await getCachedTargetPipelineStage(connection.companyId!);
          if (initialStage) {
            const existingDeal = await storage.getActiveDealByContact(contact.id, connection.companyId!, initialStage.pipelineId);
            if (!existingDeal) {
              const deal = await storage.createDeal({
                companyId: connection.companyId!,
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
      }
    } else {
      try {
        const identityUpdates: { whatsappBsuid?: string; whatsappUsername?: string } = {};
        if (bsuid && contact.whatsappBsuid !== bsuid) {
          identityUpdates.whatsappBsuid = bsuid;
        }
        if (waUsername && contact.whatsappUsername !== waUsername) {
          identityUpdates.whatsappUsername = waUsername;
        }
        if (Object.keys(identityUpdates).length > 0) {
          contact = (await storage.updateContactWhatsAppIdentity(contact.id, identityUpdates)) ?? contact;
        }
        if (normalizedPhone && !contact.phone) {
          contact = await storage.updateContact(contact.id, {
            phone: normalizedPhone,
            identifier: contact.identifier || normalizedPhone
          });
        }
      } catch (identityError) {
        console.error('Error updating WhatsApp official contact identity:', identityError);
      }
    }

    let conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connection.id
    );

    if (!conversation) {
      const conversationData: InsertConversation = {
        companyId: connection.companyId!, // Ensure conversation belongs to the connection's company
        contactId: contact.id,
        channelId: connection.id,
        channelType: 'whatsapp_official',
        status: 'open',
        assignedToUserId: connection.userId,
        lastMessageAt: new Date(timestamp),
      };

      conversation = await storage.createConversation(conversationData);
      conversationWasCreated = true;
      


      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'newConversation',
          data: {
            ...conversation,
            contact
          }
        });
      }
    }

    let messageType = 'text';
    let messageContent = '';
    let mediaUrl = null;
    let mediaType = null;
    const msgMetadata: any = { messageId, timestamp };

    if (message.type === 'text' && message.text) {
      messageType = 'text';
      messageContent = message.text.body || '';
    }
    else if (message.type === 'image' && message.image) {
      messageType = 'image';
      mediaType = 'image';
      messageContent = message.image.caption || '';
      msgMetadata.mediaId = message.image.id;
    }
    else if (message.type === 'video' && message.video) {
      messageType = 'video';
      mediaType = 'video';
      messageContent = message.video.caption || '';
      msgMetadata.mediaId = message.video.id;
    }
    else if (message.type === 'audio' && message.audio) {
      messageType = 'audio';
      mediaType = 'audio';
      messageContent = '';
      msgMetadata.mediaId = message.audio.id;
    }
    else if (message.type === 'document' && message.document) {
      messageType = 'document';
      mediaType = 'document';
      messageContent = message.document.caption || '';
      msgMetadata.mediaId = message.document.id;
      msgMetadata.filename = message.document.filename;
    }
    else if (message.type === 'location' && message.location) {
      messageType = 'location';
      const lat = message.location.latitude;
      const lng = message.location.longitude;
      messageContent = `Location: ${lat},${lng}`;
      if (message.location.name) {
        messageContent += ` - ${message.location.name}`;
      }
    }
    else if (message.type === 'interactive' && message.interactive) {
      messageType = 'interactive';




      if (message.interactive.type === 'button_reply' && message.interactive.button_reply) {
        const buttonReply = message.interactive.button_reply;
        messageContent = buttonReply.title || buttonReply.id || '';


        msgMetadata.messageType = 'interactive';
        msgMetadata.type = 'button';
        msgMetadata.button = {
          payload: buttonReply.id,
          text: buttonReply.title
        };


      }

      else if (message.interactive.type === 'list_reply' && message.interactive.list_reply) {
        const listReply = message.interactive.list_reply;
        messageContent = listReply.title || listReply.id || '';


        msgMetadata.messageType = 'interactive';
        msgMetadata.type = 'list';
        msgMetadata.list = {
          payload: listReply.id,
          text: listReply.title,
          description: listReply.description
        };


      }
      else {
        console.warn('🔘 Unknown interactive type:', message.interactive.type);
        messageContent = `Interactive: ${message.interactive.type}`;
      }
    }
    else if (message.type === 'template' && message.template) {
     
      const existingOutboundMessage = await storage.getMessageByExternalId(messageId, connection.companyId || undefined);
      if (existingOutboundMessage && existingOutboundMessage.direction === 'outbound') {
        return;
      }
      messageType = 'template';


      msgMetadata.templateName = message.template.name;
      msgMetadata.templateLanguage = message.template.language?.code || 'en';


      const components = message.template.components || [];
      let templateContent = '';

      for (const component of components) {
        if (component.type === 'header') {
          if (component.parameters) {
            for (const param of component.parameters) {
              if (param.type === 'text') {
                templateContent += param.text + '\n\n';
              } else if (param.type === 'image' && param.image) {
                msgMetadata.headerImage = param.image.link || param.image.id;
                mediaType = 'image';
              } else if (param.type === 'video' && param.video) {
                msgMetadata.headerVideo = param.video.link || param.video.id;
                mediaType = 'video';
              } else if (param.type === 'document' && param.document) {
                msgMetadata.headerDocument = param.document.link || param.document.id;
                msgMetadata.documentFilename = param.document.filename;
              }
            }
          }
        } else if (component.type === 'body') {
          if (component.parameters) {

            let bodyText = component.text || '';
            component.parameters.forEach((param: any, index: number) => {
              if (param.type === 'text') {
                bodyText = bodyText.replace(`{{${index + 1}}}`, param.text);
              }
            });
            templateContent += bodyText;
          } else if (component.text) {
            templateContent += component.text;
          }
        } else if (component.type === 'footer') {
          if (component.text) {
            templateContent += '\n\n' + component.text;
          }
        } else if (component.type === 'button') {
          msgMetadata.buttons = component.parameters || [];
        }
      }

      messageContent = templateContent || message.text?.body || `Template: ${message.template.name}`;


      msgMetadata.templateComponents = components;
    }
    else {
      messageType = 'unknown';
      messageContent = `Unsupported message type: ${message.type}`;
    }

    if (metaReferral) {
      msgMetadata.metaReferral = metaReferral;
    }

    if (!contactWasCreatedByInboundWebhook && conversation) {
      if (conversationWasCreated) {
        contactWasCreatedByInboundWebhook = true;
      } else if (metaReferral) {
        const existingMessages = await storage.getMessagesByConversationPaginated(conversation.id, 10, 0);
        const hasPriorInbound = existingMessages.some(
          (m) =>
            m.direction === 'inbound' &&
            m.isHistorySync !== true &&
            !m.historySyncBatchId
        );
        if (!hasPriorInbound) {
          contactWasCreatedByInboundWebhook = true;
        }
      }
    }

    const markedMsgMetadata = withContactInitialMessageMetadata({
      existingMetadata: msgMetadata,
      channelType: 'whatsapp_official',
      conversationStatus: conversation.status,
      isInboundContactMessage: true,
      contactWasCreatedByInboundWebhook,
    });
    if (typeof markedMsgMetadata === 'string') {
      Object.assign(msgMetadata, JSON.parse(markedMsgMetadata));
    } else if (markedMsgMetadata && typeof markedMsgMetadata === 'object') {
      Object.assign(msgMetadata, markedMsgMetadata as Record<string, unknown>);
    }

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: messageContent,
      type: messageType,
      direction: 'inbound',
      status: 'delivered',
      metadata: JSON.stringify(msgMetadata),
      mediaUrl: null,
      externalId: messageId // Store WhatsApp message ID for idempotency
    };

    const savedMessage = await storage.createMessage(messageData);


    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(timestamp),
      status: 'active'
    });


    const updatedConversation = await storage.getConversation(conversation.id);

    const accessToken = connection.accessToken || (connection.connectionData as any)?.accessToken;
    if (mediaType && msgMetadata.mediaId && accessToken) {
      try {
        console.log('🔍 [WHATSAPP OFFICIAL] Downloading media for message:', {
          messageId,
          mediaId: msgMetadata.mediaId,
          mediaType,
          connectionId: connection.id,
          hasAccessToken: !!accessToken,
          isEmbeddedSignup: !!(connection.connectionData as any)?.partnerManaged
        });

        const downloadedMediaUrl = await downloadAndSaveMedia(
          msgMetadata.mediaId,
          accessToken,
          mediaType
        );

        if (downloadedMediaUrl) {
          console.log('✅ [WHATSAPP OFFICIAL] Media downloaded successfully:', {
            messageId,
            mediaId: msgMetadata.mediaId,
            mediaUrl: downloadedMediaUrl
          });

          let mediaFileSize: number | undefined;
          try {
            const mediaPath = path.join(process.cwd(), 'public', downloadedMediaUrl.replace(/^\//, ''));
            const stat = await fsExtra.stat(mediaPath);
            mediaFileSize = stat.size;
          } catch { /* ignore */ }

          if (typeof mediaFileSize === 'number') {
            msgMetadata.mediaFileSize = mediaFileSize;
          }

          await storage.updateMessage(savedMessage.id, {
            mediaUrl: downloadedMediaUrl,
            metadata: JSON.stringify(msgMetadata)
          });

          savedMessage.mediaUrl = downloadedMediaUrl;
          savedMessage.metadata = JSON.stringify(msgMetadata);
        } else {
          console.warn('⚠️ [WHATSAPP OFFICIAL] Media download returned null:', {
            messageId,
            mediaId: msgMetadata.mediaId,
            mediaType
          });
        }
      } catch (error) {
        console.error('❌ [WHATSAPP OFFICIAL] Error downloading media:', {
          messageId,
          mediaId: msgMetadata.mediaId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        // Don't throw - allow message processing to continue even if media download fails
      }
    }


    if ((global as any).broadcastToAllClients && (global as any).broadcastConversationUpdate && updatedConversation) {

      (global as any).broadcastToAllClients({
        type: 'newMessage',
        data: savedMessage
      }, updatedConversation.companyId);


      (global as any).broadcastConversationUpdate(updatedConversation, 'conversationUpdated');


      try {
        const unreadCount = await storage.getUnreadCount(conversation.id);
        (global as any).broadcastToAllClients({
          type: 'unreadCountUpdated',
          data: {
            conversationId: conversation.id,
            unreadCount
          }
        }, updatedConversation.companyId);
      } catch (error) {
        console.error('Error broadcasting unread count update:', error);
      }
    }


    eventEmitter.emit('newMessage', {
      message: savedMessage,
      conversation: updatedConversation,
      contact
    });




    try {
      const shouldBufferInboundText = messageType === 'text';

      if (MESSAGE_DEBOUNCING_CONFIG.enabled && shouldBufferInboundText) {
        scheduleDebounceProcessing(
          savedMessage,
          updatedConversation,
          contact,
          connection,
          senderIdentity,
          connection.id
        );
      } else {
        await processMessageThroughFlowExecutor(savedMessage, updatedConversation, contact, connection);
      }
    } catch (error) {
      console.error('Error processing message through flow executor:', error);
    }


  } catch (error) {
    console.error('Error handling incoming webhook message:', error);
  }
}

export { handleIncomingWebhookMessage };

/**
 * Subscribe to WhatsApp Business API events
 * @param eventType The type of event to subscribe to
 * @param callback The callback function to call when the event occurs
 * @returns A function to unsubscribe from the event
 */
export function subscribeToWhatsAppBusinessEvents(
  eventType: 'connectionStatusUpdate' | 'connectionError' | 'newMessage',
  callback: (data: any) => void
): () => void {
  eventEmitter.on(eventType, callback);
  return () => eventEmitter.off(eventType, callback);
}

/**
 * Get all active connection IDs
 * @returns An array of active connection IDs
 */
export function getActiveBusinessConnections(): number[] {
  return Array.from(activeConnections.keys());
}

/**
 * Check if a connection is active
 * @param connectionId The ID of the connection
 * @returns True if connection is active, false otherwise
 */
export function isBusinessConnectionActive(connectionId: number): boolean {
  return activeConnections.has(connectionId) && activeConnections.get(connectionId) === true;
}

/**
 * Set up a webhook subscription for this application with WhatsApp Business API
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 * @param companyId The company ID for multi-tenant security
 * @param callbackUrl The URL to receive webhooks at
 * @param verifyToken A token to verify the webhook subscription
 */
export async function setupWebhookSubscription(
  connectionId: number,
  userId: number,
  companyId: number,
  callbackUrl: string,
  verifyToken: string
): Promise<boolean> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }



    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as any;
    const appId = connectionData?.appId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!appId) {
      throw new Error('WhatsApp Business API app ID is missing');
    }

    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${appId}/subscriptions`,
      {
        object: 'whatsapp_business_account',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: [
          'messages',
          'message_deliveries',
          'message_reads',
          'message_templates'
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.status === 200;
  } catch (error: any) {
    console.error('Error setting up webhook subscription:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Initialize a WhatsApp Business API connection with the provided configuration
 * @param connectionId The ID of the channel connection
 * @param companyId The company ID for multi-tenant security
 * @param config Configuration object containing access token, phone number ID, etc.
 */
export async function initializeConnection(connectionId: number, companyId: number, config: {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  webhookVerifyToken: string;
  businessAccountId?: string;
  verifiedName?: string;
}): Promise<boolean> {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }


    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (!connection.companyId) {
      console.warn(`Connection ${connectionId} missing companyId - this may be a legacy connection. Consider updating the database.`);


    } else if (connection.companyId !== companyId) {
      console.error(`Company ID mismatch: Connection ${connectionId} belongs to company ${connection.companyId}, but user is from company ${companyId}`);
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    const response = await axios.get(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${config.phoneNumberId}?access_token=${config.accessToken}`
    );

    if (response.status === 200 && response.data) {

      activeConnections.set(connectionId, true);


      await storage.updateChannelConnectionStatus(connectionId, 'active');


      eventEmitter.emit('connectionStatusUpdate', {
        connectionId,
        status: 'connected'
      });

      
      return true;
    } else {
      throw new Error('Failed to verify WhatsApp Business API connection');
    }
  } catch (error: any) {
    console.error(`Failed to initialize WhatsApp Business API connection ${connectionId}:`, error.response?.data || error.message);


    await storage.updateChannelConnectionStatus(connectionId, 'error');


    eventEmitter.emit('connectionError', {
      connectionId,
      error: error.response?.data?.error?.message || error.message
    });

    throw error;
  }
}

/**
 * Find or create a conversation for a contact and channel
 * @param connectionId The channel connection ID
 * @param phoneNumber The contact's phone number
 * @param companyId The company ID for multi-tenant security
 * @returns The conversation object
 */
async function findOrCreateConversation(connectionId: number, phoneNumber: string, companyId: number) {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }


  const recipientIsBsuid = isBsuid(phoneNumber);
  const normalizedPhone = recipientIsBsuid ? String(phoneNumber).trim() : normalizePhoneToE164(phoneNumber);

  let contact = recipientIsBsuid
    ? await storage.getContactByWhatsAppBsuid(normalizedPhone, companyId)
    : await storage.getContactByPhone(normalizedPhone, companyId);

  if (!contact) {
    const contactData: InsertContact = {
      companyId: companyId,
      name: normalizedPhone,
      phone: recipientIsBsuid ? null : normalizedPhone,
      email: null,
      avatarUrl: null,
      identifier: normalizedPhone,
      identifierType: 'whatsapp',
      source: 'whatsapp_official',
      notes: null,
      ...(recipientIsBsuid ? { whatsappBsuid: normalizedPhone } : {})
    };

    contact = await storage.getOrCreateContact(contactData);

    // Auto-add contact to pipeline if enabled (only for newly created contacts)
    try {
      const autoAddEnabled = await getCachedCompanySetting(companyId, 'autoAddContactToPipeline');
      if (autoAddEnabled) {
        const initialStage = await getCachedTargetPipelineStage(companyId);
        if (initialStage) {
          const existingDeal = await storage.getActiveDealByContact(contact.id, companyId, initialStage.pipelineId);
          if (!existingDeal) {
            const connection = await storage.getChannelConnection(connectionId);
            const deal = await storage.createDeal({
              companyId,
              contactId: contact.id,
              title: `New Lead - ${contact.name}`,
              pipelineId: initialStage.pipelineId,
              stageId: initialStage.id,
              stage: 'lead'
            });
            await storage.createDealActivity({
              dealId: deal.id,
              userId: connection?.userId ?? 0,
              type: 'create',
              content: 'Deal automatically created when contact was added'
            });
          }
        }
      }
    } catch (error) {
      console.error('Error auto-adding contact to pipeline:', error);
    }
  }


  let conversation = await storage.getConversationByContactAndChannel(
    contact.id,
    connectionId
  );

  if (!conversation) {

    const conversationData: InsertConversation = {
      companyId: companyId, // Ensure conversation belongs to the company
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'whatsapp_official',
      status: 'open',
      assignedToUserId: null,
      lastMessageAt: new Date(),
    };

    conversation = await storage.createConversation(conversationData);

  }

  return conversation;
}

/**
 * Send a message via WhatsApp Business API
 * @param connectionId The ID of the channel connection
 * @param userId The user ID sending the message
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient phone number
 * @param message The message content
 * @param isFromBot Whether the message is sent from a bot (default: false)
 * @returns The saved message object
 */
export async function sendMessage(
  connectionId: number,
  userId: number,
  companyId: number,
  to: string,
  message: string,
  isFromBot: boolean = false
) {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    assertWhatsAppMessagingReady(connection);
    await assertReconnectedWhatsAppWindow(connection, to);
    const connectionData = connection.connectionData as any;
    const accessToken = connectionData?.accessToken || connection.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }


    const normalizedPhone = recipientIdentityKey(to);

    // Split message if enabled and message is from bot
    const chunks = isFromBot ? splitMessage(message) : [message];
    const savedMessages: any[] = [];

    // Send first chunk with typing indicator
    if (isFromBot && chunks.length > 0) {
      await simulateTyping(connectionId, companyId, normalizedPhone, chunks[0]);
    }

    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        ...buildRecipientFields(to),
        type: 'text',
        text: {
          body: chunks[0]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.messages?.[0]?.id;

      const conversation = await findOrCreateConversation(connectionId, normalizedPhone, companyId);

      const savedMessage = await storage.createMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        type: 'text',
        content: chunks[0],
        senderId: isFromBot ? null : userId,
        senderType: isFromBot ? null : 'user',
        isFromBot: isFromBot,
        externalId: messageId || `wa-${Date.now()}`,
        metadata: JSON.stringify({
          whatsapp_message_id: messageId,
          timestamp: new Date().toISOString(),
          phone_number_id: phoneNumberId,
          chunkIndex: 0,
          totalChunks: chunks.length
        })
      });

      savedMessages.push(savedMessage);

      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date()
      });

      eventEmitter.emit('newMessage', {
        message: savedMessage,
        conversation: await storage.getConversation(conversation.id)
      });

      // Send remaining chunks with delays and typing indicators
      if (chunks.length > 1 && isFromBot) {
        for (let i = 1; i < chunks.length; i++) {
          const chunk = chunks[i];
          const delay = calculateSplitMessageDelay();

          // Wait before sending next chunk
          await new Promise(resolve => setTimeout(resolve, delay));

          // Simulate typing for this chunk
          await simulateTyping(connectionId, companyId, normalizedPhone, chunk);

          // Send the chunk
          const chunkResponse = await axios.post(
            `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
            {
              messaging_product: 'whatsapp',
              ...buildRecipientFields(to),
              type: 'text',
              text: {
                body: chunk
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (chunkResponse.status === 200 && chunkResponse.data) {
            const chunkMessageId = chunkResponse.data.messages?.[0]?.id;

            const chunkSavedMessage = await storage.createMessage({
              conversationId: conversation.id,
              direction: 'outbound',
              type: 'text',
              content: chunk,
              senderId: isFromBot ? null : userId,
              senderType: isFromBot ? null : 'user',
              isFromBot: isFromBot,
              externalId: chunkMessageId || `wa-${Date.now()}-${i}`,
              metadata: JSON.stringify({
                whatsapp_message_id: chunkMessageId,
                timestamp: new Date().toISOString(),
                phone_number_id: phoneNumberId,
                chunkIndex: i,
                totalChunks: chunks.length
              })
            });

            savedMessages.push(chunkSavedMessage);

            await storage.updateConversation(conversation.id, {
              lastMessageAt: new Date()
            });

            eventEmitter.emit('newMessage', {
              message: chunkSavedMessage,
              conversation: await storage.getConversation(conversation.id)
            });
          }
        }
      }

      return savedMessages[0];
    } else {
      throw new Error('Failed to send message: Unknown error');
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp Business API message:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Test WhatsApp webhook configuration
 * @param webhookUrl The webhook URL to test
 * @param verifyToken The verify token to test
 * @returns Promise with test result
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

    if (!url.pathname.includes('/api/webhooks/whatsapp')) {
      return { success: false, error: 'Webhook URL must point to /api/webhooks/whatsapp endpoint' };
    }


    const testParams = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': 'test_challenge_' + Date.now()
    });



    const testResponse = await axios.get(`${webhookUrl}?${testParams.toString()}`, {
      timeout: 10000,
      validateStatus: (status) => status === 200 || status === 403 || status === 500
    });

    if (testResponse.status === 200) {

      const expectedChallenge = testParams.get('hub.challenge');
      if (testResponse.data === expectedChallenge) {

        return { success: true };
      } else {
        return {
          success: false,
          error: `Webhook returned incorrect challenge. Expected: ${expectedChallenge}, Got: ${testResponse.data}`
        };
      }
    } else if (testResponse.status === 403) {
      return {
        success: false,
        error: 'Webhook verification failed - verify token mismatch. Check that your verify token matches the one stored in the database for your WhatsApp Business API connection.'
      };
    } else {
      return {
        success: false,
        error: `Webhook test failed with status ${testResponse.status}. ${testResponse.data || ''}`
      };
    }
  } catch (error: any) {
    console.error('Error testing WhatsApp webhook configuration:', error.message);
    return {
      success: false,
      error: error.code === 'ECONNREFUSED'
        ? 'Could not connect to webhook URL - check if server is accessible'
        : error.message || 'Webhook test failed'
    };
  }
}

/**
 * Send interactive message with buttons through WhatsApp Business API
 */
export async function sendInteractiveMessage(
  connectionId: number,
  interactiveMessage: any
): Promise<{ messageId?: string; success: boolean }> {
  try {
    

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    assertWhatsAppMessagingReady(connection);
    await assertReconnectedWhatsAppWindow(connection, String(interactiveMessage.to || interactiveMessage.recipient?.user_id || ""));
    const connectionData = connection.connectionData as any;
    const accessToken = connectionData?.accessToken || connection.accessToken;
    const phoneNumberId = connectionData?.phoneNumberId;

    if (!accessToken) {
      throw new Error('WhatsApp Business API access token is missing');
    }

    if (!phoneNumberId) {
      throw new Error('WhatsApp Business API phone number ID is missing');
    }

    const url = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

    

    
    const response = await axios.post(url, interactiveMessage, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data?.messages?.[0]?.id) {

      return {
        messageId: response.data.messages[0].id,
        success: true
      };
    } else {
      console.warn('WhatsApp interactive message sent but no message ID returned');
      return { success: true };
    }

  } catch (error: any) {
    console.error('Error sending WhatsApp interactive message:', error);

    if (error.response?.data) {
      console.error('WhatsApp API error response:', error.response.data);
      const apiError = error.response.data.error;
      const errorMessage = apiError?.message || 'Unknown error';
      const errorDetails = apiError?.error_data?.details || '';
      
      // Provide more specific error messages for common issues
      let userFriendlyMessage = errorMessage;
      if (errorDetails.includes('flow_id') && errorDetails.includes('invalid')) {
        userFriendlyMessage = `Invalid Flow ID: The flow ID does not belong to your WhatsApp Business Account or is not in a valid state. Please verify the flow ID in Meta Business Manager and ensure it's published.`;
      } else if (errorDetails.includes('flow_cta')) {
        userFriendlyMessage = `Invalid CTA: ${errorDetails}`;
      } else if (errorDetails.includes('body')) {
        userFriendlyMessage = `Invalid message body: ${errorDetails}`;
      } else if (errorDetails) {
        userFriendlyMessage = `${errorMessage}. ${errorDetails}`;
      }
      
      throw new Error(`WhatsApp API error: ${userFriendlyMessage}`);
    }

    throw error;
  }
}

/**
 * Get current typing configuration
 * @returns Current typing configuration
 */
export function getTypingConfiguration(): TypingConfig {
  return { ...TYPING_CONFIG };
}

/**
 * Configure typing indicator behavior
 * @param config Partial typing configuration to update
 */
export function configureTypingBehavior(config: Partial<TypingConfig>): void {
  Object.assign(TYPING_CONFIG, config);
  console.log('WhatsApp Official typing configuration updated:', TYPING_CONFIG);
}

/**
 * Get current message splitting configuration
 * @returns Current message splitting configuration
 */
export function getMessageSplittingConfiguration(): MessageSplittingConfig {
  return { ...MESSAGE_SPLITTING_CONFIG };
}

/**
 * Configure message splitting behavior
 * @param config Partial message splitting configuration to update
 */
export function configureMessageSplitting(config: Partial<MessageSplittingConfig>): void {
  Object.assign(MESSAGE_SPLITTING_CONFIG, config);
  console.log('WhatsApp Official message splitting configuration updated:', MESSAGE_SPLITTING_CONFIG);
}

/**
 * Configure message debouncing behavior
 * @param config Partial message debouncing configuration to update
 */
export function configureMessageDebouncing(config: Partial<MessageDebouncingConfig>): void {
  Object.assign(MESSAGE_DEBOUNCING_CONFIG, config);
  console.log('WhatsApp Official message debouncing configuration updated:', MESSAGE_DEBOUNCING_CONFIG);
}

/**
 * Get current message debouncing configuration
 * @returns Current message debouncing configuration
 */
export function getMessageDebouncingConfiguration(): MessageDebouncingConfig {
  return { ...MESSAGE_DEBOUNCING_CONFIG };
}

export function getDebouncingStatus(): any {
  return {
    enabled: MESSAGE_DEBOUNCING_CONFIG.enabled,
    debounceDelay: MESSAGE_DEBOUNCING_CONFIG.debounceDelay,
    maxDebounceDelay: MESSAGE_DEBOUNCING_CONFIG.maxDebounceDelay,
    activeDebouncedMessages: debouncedMessages.size,
    debouncedUsers: Array.from(debouncedMessages.keys()),
    indexedConversations: Array.from(conversationDebounceIndex.keys()),
  };
}

export {
  resolveDebounceExecutionMessage,
  inboundMessageHasContactInitialMarker,
};

export default {
  connect: connectToWhatsAppBusiness,
  disconnect: disconnectFromWhatsAppBusiness,
  sendMessage: sendMessage, // Use the enhanced sendMessage function
  sendBusinessMessage: sendWhatsAppBusinessMessage, // Keep the original for backward compatibility
  sendInteractiveMessage: sendInteractiveMessage, // Add interactive message support
  sendWhatsAppTestTemplate, // Add the test template function
  sendTemplateMessage, // Add the campaign template message function
  sendMedia: sendWhatsAppBusinessMediaMessage,
  isActive: isBusinessConnectionActive,
  getActiveConnections: getActiveBusinessConnections,
  subscribeToEvents: subscribeToWhatsAppBusinessEvents,
  processWebhook: processWebhook,
  setupWebhook: setupWebhookSubscription,
  verifyWebhookSignature,
  testWebhookConfiguration,
  initializeConnection, // Add the new method
  getConnectionStatus,
  storeLastReceivedMessageId,
  sendTypingIndicator,
  sendRecordingIndicator,
  stopTypingIndicator,
  simulateTyping,
  simulateRecording,
  getTypingConfiguration,
  configureTypingBehavior,
  getMessageSplittingConfiguration,
  configureMessageSplitting,
  configureMessageDebouncing,
  getMessageDebouncingConfiguration,
  cancelDebouncedBatchByConversationId,
  cancelDebouncedBatchByContactKey,
  hasPendingDebouncedBatchForConversation,
  getDebouncingStatus,
};
