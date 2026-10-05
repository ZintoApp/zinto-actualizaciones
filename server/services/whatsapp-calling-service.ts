import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  callEvents,
  calls,
  campaignTemplates,
  channelConnections,
  contacts,
  messages,
  PERMISSIONS,
  whatsappCallAgentPresence,
  whatsappCallAssetJobs,
  whatsappCallPermissions,
  whatsappCallSessions,
  type ChannelConnection,
  type Contact,
  type Conversation,
} from '@shared/schema';
import {
  WHATSAPP_CALL_ERROR_CODES,
  buildWhatsAppAiGatewayProviderConfig,
  canRequestWhatsAppCallPermission,
  normalizeWhatsAppCallingConfig,
  normalizeMetaCallPermission,
  normalizeWhatsAppTranscript,
  parseWhatsAppMessagingTier,
  resolveCaptureSelection,
  type CallChannelOption,
  type InitiateCallRequest,
  type WhatsAppCallingConfig,
} from '@shared/types/whatsapp-calling';
import { db, getPool } from '../db';
import { getUserPermissions } from '../middleware';
import { storage } from '../storage';
import { decryptValue, encryptValue } from '../utils/crypto';
import { broadcastToCompany } from '../utils/websocket';
import { getAgentsWithAvailability } from './agent-availability-service';
import { recordMediaFileOwnership } from './media-ownership';
import {
  getActiveVoiceConnections,
  getAiVoiceConfigurationError,
} from './voice-provider-service';
import {
  getVoiceProviderStackLabel,
  normalizeVoiceChannelConnectionData,
  supportsBrowserVoiceConnection,
} from '@shared/types/call-types';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SIGNALING_TTL_MS = 10 * 60 * 1000;

export class WhatsAppCallingError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}


export function isWhatsAppCallingGloballyEnabled(): boolean {
  return process.env.WHATSAPP_CALLING_ENABLED !== 'false';
}

function connectionData(connection: ChannelConnection): Record<string, any> {
  return (connection.connectionData && typeof connection.connectionData === 'object')
    ? connection.connectionData as Record<string, any>
    : {};
}

export function getWhatsAppCallingConfig(connection: ChannelConnection): WhatsAppCallingConfig {
  return normalizeWhatsAppCallingConfig(connectionData(connection).whatsappCalling);
}

function getWhatsAppCredential(connection: ChannelConnection) {
  const data = connectionData(connection);
  return {
    phoneNumberId: String(data.phoneNumberId || ''),
    accessToken: String(data.accessToken || connection.accessToken || ''),
    signupMode: data.signupMode,
    isOnBizApp: data.isOnBizApp === true,
  };
}

function getWhatsAppAiConfigurationError(connection: ChannelConnection | undefined) {
  if (!connection) return 'The selected AI voice profile is unavailable.';
  const data = normalizeVoiceChannelConnectionData(connection.connectionData as any);
  if (data.providerStack === 'telnyx-vapi') {
    return data.vapiApiKey && data.vapiAssistantId
      ? null
      : 'Vapi.ai API key and assistant ID are required for WhatsApp AI calls.';
  }
  return data.elevenLabsApiKey && (data.elevenLabsAgentId || data.elevenLabsPrompt)
    ? null
    : 'ElevenLabs API key plus an agent ID or prompt are required for WhatsApp AI calls.';
}

function callingDisabledCode(connection: ChannelConnection, config: WhatsAppCallingConfig): string | undefined {
  const credentials = getWhatsAppCredential(connection);
  if (!isWhatsAppCallingGloballyEnabled()) return WHATSAPP_CALL_ERROR_CODES.disabled;
  if (credentials.signupMode === 'coexistence' || credentials.isOnBizApp) return WHATSAPP_CALL_ERROR_CODES.coexistence;
  if (!config.enabled || !config.callButtonVisible) return WHATSAPP_CALL_ERROR_CODES.disabled;
  if (!config.eligibility.eligible || !config.eligibility.callingEnabledByMeta) return WHATSAPP_CALL_ERROR_CODES.ineligible;
  if (!credentials.phoneNumberId || !credentials.accessToken) return WHATSAPP_CALL_ERROR_CODES.ineligible;
  return undefined;
}

function effectivePermissionStatus(row: typeof whatsappCallPermissions.$inferSelect | undefined) {
  if (!row) return { status: 'unknown' as const, canRequest: true, canStart: false, limits: [] };
  const actions = Array.isArray(row.actionState) ? row.actionState as any[] : [];
  const requestAction = actions.find((action) => action?.action_name === 'send_call_permission_request');
  const startAction = actions.find((action) => action?.action_name === 'start_call');
  const localCanRequest = canRequestWhatsAppCallPermission(Array.isArray(row.requestHistory) ? row.requestHistory as any[] : []);
  const permissionRequestState = {
    canRequest: localCanRequest && requestAction?.can_perform_action !== false,
    canStart: startAction ? startAction.can_perform_action === true : row.status === 'granted',
    limits: (Array.isArray(requestAction?.limits) ? requestAction.limits : []).map((limit: any) => ({
      timePeriod: String(limit.time_period || ''), maximum: Number(limit.max_allowed || 0), used: Number(limit.current_usage || 0),
      resetsAt: limit.limit_expiration_time ? new Date(Number(limit.limit_expiration_time) * 1000).toISOString() : null,
    })),
  };
  if (row.status === 'granted' && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return { status: 'expired' as const, permissionType: row.permissionType as 'temporary' | 'permanent', expiresAt: row.expiresAt.toISOString(), ...permissionRequestState };
  }
  return {
    status: (['pending', 'granted', 'revoked', 'expired'].includes(row.status) ? row.status : 'unknown') as 'unknown' | 'pending' | 'granted' | 'revoked' | 'expired',
    permissionType: row.permissionType as 'temporary' | 'permanent' | undefined,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    ...permissionRequestState,
  };
}

function getWhatsAppCallPermissionIdentity(contact: Contact) {
  if (contact.whatsappBsuid) {
    return {
      waId: String(contact.whatsappBsuid),
      query: { recipient: String(contact.whatsappBsuid) },
    };
  }

  const userWaId = String(contact.phoneDigits || contact.phone || '').replace(/\D/g, '');
  if (!userWaId) return undefined;
  return { waId: userWaId, query: { user_wa_id: userWaId } };
}

async function findContactByWhatsAppIdentity(companyId: number, value: string, bsuid?: string) {
  if (bsuid) {
    const byBsuid = await storage.getContactByWhatsAppBsuid(bsuid, companyId);
    if (byBsuid) return byBsuid;
  }
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;
  const [contact] = await db.select().from(contacts).where(and(
    eq(contacts.companyId, companyId),
    or(eq(contacts.phone, value), eq(contacts.phoneDigits, digits)),
  )).limit(1);
  return contact;
}

export async function refreshWhatsAppCallPermission(connection: ChannelConnection, contact: Contact) {
  const credentials = getWhatsAppCredential(connection);
  const identity = getWhatsAppCallPermissionIdentity(contact);
  if (!credentials.phoneNumberId || !credentials.accessToken || !identity) return undefined;

  const [previous] = await db.select().from(whatsappCallPermissions).where(and(
    eq(whatsappCallPermissions.channelId, connection.id),
    eq(whatsappCallPermissions.contactId, contact.id),
  )).limit(1);

  try {
    const response = await axios.get(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/call_permissions`, {
      params: identity.query,
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      timeout: 15_000,
    });
    const parsed = normalizeMetaCallPermission(response.data, previous?.status);
    const now = new Date();
    const [updated] = await db.insert(whatsappCallPermissions).values({
      companyId: connection.companyId!,
      channelId: connection.id,
      contactId: contact.id,
      waId: identity.waId,
      status: parsed.status,
      permissionType: parsed.permissionType,
      grantedAt: parsed.status === 'granted' ? now : null,
      expiresAt: parsed.expiresAt,
      revokedAt: parsed.status === 'revoked' ? now : null,
      actionState: Array.isArray(response.data?.actions) ? response.data.actions : Array.isArray(response.data?.data?.[0]?.actions) ? response.data.data[0].actions : [],
    }).onConflictDoUpdate({
      target: [whatsappCallPermissions.channelId, whatsappCallPermissions.contactId],
      set: {
        waId: identity.waId,
        status: parsed.status,
        permissionType: parsed.permissionType,
        grantedAt: parsed.status === 'granted' ? previous?.grantedAt || now : null,
        expiresAt: parsed.expiresAt,
        revokedAt: parsed.status === 'revoked' ? now : null,
        actionState: Array.isArray(response.data?.actions) ? response.data.actions : Array.isArray(response.data?.data?.[0]?.actions) ? response.data.data[0].actions : [],
        updatedAt: now,
      },
    }).returning();
    return updated;
  } catch (error: any) {
    if (error instanceof WhatsAppCallingError) throw error;
    const graphError = error?.response?.data?.error;
    throw new WhatsAppCallingError(
      'WHATSAPP_CALL_PERMISSION_REFRESH_FAILED',
      graphError?.message || 'Unable to refresh WhatsApp calling permission.',
      502,
      { graphCode: graphError?.code, graphSubcode: graphError?.error_subcode },
    );
  }
}

export async function listCallChannels(companyId: number, contactId?: number): Promise<CallChannelOption[]> {
  const all = await storage.getChannelConnectionsByCompany(companyId);
  const contact = contactId ? await storage.getContact(contactId) : undefined;
  const voiceOptions: CallChannelOption[] = getActiveVoiceConnections(all as any).map((connection) => {
    const data = normalizeVoiceChannelConnectionData(connection.connectionData);
    return {
      id: connection.id,
      channelType: 'twilio_voice',
      displayName: connection.accountName || getVoiceProviderStackLabel(data.providerStack),
      enabled: !contactId || !!contact?.phone,
      disabledCode: contactId && !contact?.phone ? 'CONTACT_PHONE_REQUIRED' : undefined,
      supportedCallTypes: getAiVoiceConfigurationError(data) ? ['direct'] : ['direct', 'ai-powered'],
      supportsBrowserDirect: supportsBrowserVoiceConnection(data.providerStack),
      providerStack: data.providerStack,
      recordingPolicy: 'agent_choice',
      recordingDefault: true,
      transcriptionPolicy: 'disabled',
      transcriptionDefault: false,
    };
  });

  const whatsAppOptions = await Promise.all(all
    .filter((connection) => connection.channelType === 'whatsapp_official' && connection.status === 'active')
    .map(async (connection) => {
      const config = getWhatsAppCallingConfig(connection as ChannelConnection);
      let disabledCode = callingDisabledCode(connection as ChannelConnection, config)
        || (contactId && !getWhatsAppCallPermissionIdentity(contact!) ? 'CONTACT_PHONE_REQUIRED' : undefined);
      const aiConnection = config.aiVoiceConnectionId
        ? all.find((candidate) => candidate.id === config.aiVoiceConnectionId && candidate.channelType === 'twilio_voice' && candidate.status === 'active')
        : undefined;
      const supportedCallTypes: Array<'direct' | 'ai-powered'> = ['direct'];
      if (aiConnection && !getWhatsAppAiConfigurationError(aiConnection as ChannelConnection)) supportedCallTypes.push('ai-powered');
      let permission = contactId
        ? (await db.select().from(whatsappCallPermissions).where(and(
            eq(whatsappCallPermissions.channelId, connection.id),
            eq(whatsappCallPermissions.contactId, contactId),
          )).limit(1))[0]
        : undefined;
      const effective = effectivePermissionStatus(permission);
      if (contact && !disabledCode && effective.status !== 'granted') {
        try {
          permission = await refreshWhatsAppCallPermission(connection as ChannelConnection, contact) || permission;
        } catch (error) {
          // Channel discovery remains usable during a transient Graph outage. Meta will enforce
          // the permission again when the agent actually starts the call.
          console.warn('[WhatsApp Calling] Permission refresh failed while listing channels:', error);
        }
      }
      const resolvedPermission = effectivePermissionStatus(permission);
      if (!disabledCode && resolvedPermission.status === 'granted' && resolvedPermission.canStart === false) {
        disabledCode = 'WHATSAPP_CALL_RESTRICTED';
      }
      let serviceWindowOpen = false;
      if (contactId) {
        const conversation = await storage.getConversationByContactAndChannel(contactId, connection.id);
        if (conversation) {
          const [lastInbound] = await db.select({ sentAt: messages.sentAt, createdAt: messages.createdAt })
            .from(messages)
            .where(and(eq(messages.conversationId, conversation.id), eq(messages.direction, 'inbound')))
            .orderBy(desc(messages.sentAt), desc(messages.createdAt)).limit(1);
          const timestamp = lastInbound?.sentAt || lastInbound?.createdAt;
          serviceWindowOpen = !!timestamp && timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000;
        }
      }
      return {
        id: connection.id,
        channelType: 'whatsapp_official' as const,
        displayName: connection.accountName || 'WhatsApp',
        enabled: !disabledCode,
        disabledCode,
        supportedCallTypes,
        supportsBrowserDirect: true,
        providerStack: aiConnection
          ? normalizeVoiceChannelConnectionData(aiConnection.connectionData as any).providerStack
          : undefined,
        recordingPolicy: config.recordingPolicy,
        recordingDefault: config.recordingDefault,
        transcriptionPolicy: config.transcriptionPolicy,
        transcriptionDefault: config.transcriptionDefault,
        whatsappPermission: { ...resolvedPermission, serviceWindowOpen },
      } satisfies CallChannelOption;
    }));

  return [...voiceOptions, ...whatsAppOptions];
}

async function graphCall(connection: ChannelConnection, payload: Record<string, unknown>) {
  const credentials = getWhatsAppCredential(connection);
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.ineligible, 'WhatsApp Calling credentials are incomplete.');
  }
  try {
    const response = await axios.post(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/calls`, {
      messaging_product: 'whatsapp',
      ...payload,
    }, {
      headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
      timeout: 20_000,
    });
    return response.data;
  } catch (error: any) {
    const graphError = error?.response?.data?.error;
    throw new WhatsAppCallingError(
      graphError?.code === 138006 ? WHATSAPP_CALL_ERROR_CODES.permissionRequired : 'WHATSAPP_CALLING_GRAPH_ERROR',
      graphError?.message || 'Meta rejected the WhatsApp call request.',
      graphError?.code === 138006 ? 409 : 502,
      { graphCode: graphError?.code, graphSubcode: graphError?.error_subcode },
    );
  }
}

export interface ProviderNeutralCallAdapter {
  connect(input: { recipient: string; recipientIsBsuid: boolean; sdpOffer: string; recording: boolean; transcription: boolean }): Promise<any>;
  answer(input: { providerCallId: string; sdpAnswer: string; recording: boolean; transcription: boolean }): Promise<any>;
  terminate(providerCallId: string, reject?: boolean): Promise<any>;
}

export class WhatsAppCallingAdapter implements ProviderNeutralCallAdapter {
  constructor(private readonly connection: ChannelConnection) {}

  connect(input: { recipient: string; recipientIsBsuid: boolean; sdpOffer: string; recording: boolean; transcription: boolean }) {
    return graphCall(this.connection, {
      ...(input.recipientIsBsuid ? { recipient: input.recipient } : { to: input.recipient }),
      action: 'connect',
      session: { sdp_type: 'offer', sdp: input.sdpOffer },
      ...metaCaptureOptions(input.recording, input.transcription),
    });
  }

  answer(input: { providerCallId: string; sdpAnswer: string; recording: boolean; transcription: boolean }) {
    return graphCall(this.connection, {
      call_id: input.providerCallId,
      action: 'accept',
      session: { sdp_type: 'answer', sdp: input.sdpAnswer },
      ...metaCaptureOptions(input.recording, input.transcription),
    });
  }

  terminate(providerCallId: string, reject = false) {
    return graphCall(this.connection, { call_id: providerCallId, action: reject ? 'reject' : 'terminate' });
  }
}

function metaCaptureOptions(recording: boolean, transcription: boolean) {
  const purpose = (process.env.WHATSAPP_CALL_CAPTURE_PURPOSE || 'quality assurance').slice(0, 250);
  const announcementLanguage = process.env.WHATSAPP_CALL_ANNOUNCEMENT_LANGUAGE || 'en_US';
  return {
    ...(recording ? { recording: { status: 'ENABLED', purpose, announcement_language: announcementLanguage } } : {}),
    ...(transcription ? { transcription: { status: 'ENABLED', purpose, announcement_language: announcementLanguage } } : {}),
  };
}

export async function appendCallEvent(companyId: number, callId: number, eventType: string, payload: Record<string, unknown>) {
  const [event] = await db.insert(callEvents).values({ companyId, callId, eventType, payload }).returning();
  await getPool().query('SELECT pg_notify($1, $2)', ['bothive_call_events', String(event.id)]);
  return event;
}

let eventListenerStarted = false;
let routingWorkerStarted = false;
let assetWorkerStarted = false;
let assetJobsTableReady = false;
let assetJobsTableMissingLogged = false;

async function isWhatsAppCallAssetJobsTableReady(): Promise<boolean> {
  if (assetJobsTableReady) return true;
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'whatsapp_call_asset_jobs'
      ) AS ready
    `);
    assetJobsTableReady = result.rows[0]?.ready === true;
  } catch (error) {
    console.error('[WhatsApp Calling] failed to verify asset jobs table:', error);
    assetJobsTableReady = false;
  }
  return assetJobsTableReady;
}

function logMissingAssetJobsTableOnce() {
  if (assetJobsTableMissingLogged) return;
  assetJobsTableMissingLogged = true;
  console.warn('[WhatsApp Calling] whatsapp_call_asset_jobs table is missing; run `npm run db:migrate`. Asset ingestion worker paused.');
}

export async function startWhatsAppCallingWorkers() {
  if (!isWhatsAppCallingGloballyEnabled()) return;
  if (!eventListenerStarted) {
    eventListenerStarted = true;
    const client = await getPool().connect();
    client.on('error', (error) => {
      eventListenerStarted = false;
      console.error('[WhatsApp Calling] PostgreSQL event listener failed:', error);
    });
    client.on('notification', async (notification) => {
      if (notification.channel !== 'bothive_call_events' || !notification.payload) return;
      const eventId = Number(notification.payload);
      if (!Number.isInteger(eventId)) return;
      const [event] = await db.select().from(callEvents).where(eq(callEvents.id, eventId)).limit(1);
      if (event) broadcastToCompany({ type: event.eventType, data: { eventId: event.id, callId: event.callId, ...(event.payload as object) } }, event.companyId);
    });
    await client.query('LISTEN bothive_call_events');
  }
  if (!routingWorkerStarted) {
    routingWorkerStarted = true;
    const timer = setInterval(() => void processDueInboundRouting().catch((error) => console.error('[WhatsApp Calling] routing worker:', error)), 2_000);
    timer.unref?.();
  }
  if (!assetWorkerStarted) {
    assetWorkerStarted = true;
    const timer = setInterval(() => void processWhatsAppCallAssetJobs().catch((error) => console.error('[WhatsApp Calling] asset worker:', error)), 30_000);
    timer.unref?.();
    void processWhatsAppCallAssetJobs().catch((error) => console.error('[WhatsApp Calling] initial asset worker:', error));
  }
}

function assertCaptureValue(policy: string, value: boolean) {
  if ((policy === 'required' && !value) || (policy === 'disabled' && value)) {
    throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.capturePolicy, 'The requested capture settings violate the channel policy.');
  }
}

export async function initiateWhatsAppCall(input: {
  companyId: number;
  userId: number;
  channel: ChannelConnection;
  contact: Contact;
  conversation: Conversation;
  request: InitiateCallRequest;
}) {
  const config = getWhatsAppCallingConfig(input.channel);
  const disabledCode = callingDisabledCode(input.channel, config);
  if (disabledCode) throw new WhatsAppCallingError(disabledCode, 'WhatsApp Calling is not available for this channel.');

  let [permission] = await db.select().from(whatsappCallPermissions).where(and(
    eq(whatsappCallPermissions.channelId, input.channel.id),
    eq(whatsappCallPermissions.contactId, input.contact.id),
  )).limit(1);
  try {
    permission = await refreshWhatsAppCallPermission(input.channel, input.contact) || permission;
  } catch (error) {
    // A still-valid cached grant can be used because Meta performs the authoritative check on
    // the connect request. Unknown, expired, or revoked cache entries must not bypass refresh.
    if (effectivePermissionStatus(permission).status !== 'granted') throw error;
  }
  const resolvedPermission = effectivePermissionStatus(permission);
  if (resolvedPermission.status !== 'granted') {
    throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.permissionRequired, 'Customer calling permission is required.', 409, {
      permission: resolvedPermission,
    });
  }
  if (resolvedPermission.canStart === false) {
    throw new WhatsAppCallingError('WHATSAPP_CALL_RESTRICTED', 'Meta currently restricts calls to this customer.', 409, { permission: resolvedPermission });
  }

  const callType = input.request.callType || 'direct';
  if (callType === 'direct' && !input.request.sdpOffer) {
    throw new WhatsAppCallingError('WHATSAPP_CALL_SDP_REQUIRED', 'An SDP offer is required for a direct WhatsApp call.');
  }
  if (callType === 'ai-powered' && !config.aiVoiceConnectionId) {
    throw new WhatsAppCallingError('WHATSAPP_CALL_AI_NOT_CONFIGURED', 'No AI voice profile is configured for this WhatsApp channel.');
  }
  const recording = resolveCaptureSelection(config.recordingPolicy, config.recordingDefault, input.request.recording);
  const transcription = resolveCaptureSelection(config.transcriptionPolicy, config.transcriptionDefault, input.request.transcription);
  assertCaptureValue(config.recordingPolicy, recording);
  assertCaptureValue(config.transcriptionPolicy, transcription);

  const recipientIdentity = getWhatsAppCallPermissionIdentity(input.contact);
  if (!recipientIdentity) throw new WhatsAppCallingError('CONTACT_PHONE_REQUIRED', 'The contact has no WhatsApp calling identity.');

  // AI calls receive their WebRTC offer from the media gateway. The internal adapter is deliberately
  // explicit so a phone-number/PSTN based AI endpoint can never be used for WhatsApp.
  let sdpOffer = input.request.sdpOffer;
  let providerConversationId: string | undefined;
  if (callType === 'ai-powered') {
    const media = await createAiMediaSession(input.companyId, input.channel, config.aiVoiceConnectionId!);
    sdpOffer = media.sdpOffer;
    providerConversationId = media.providerConversationId;
  }

  const graphResult = await new WhatsAppCallingAdapter(input.channel).connect({
    recipient: recipientIdentity.waId,
    recipientIsBsuid: 'recipient' in recipientIdentity.query,
    sdpOffer: sdpOffer!,
    recording,
    transcription,
  });
  const metaCallId = String(graphResult?.calls?.[0]?.id || graphResult?.id || '');
  if (!metaCallId) throw new WhatsAppCallingError('WHATSAPP_CALLING_INVALID_RESPONSE', 'Meta did not return a call ID.', 502);

  const now = new Date();
  const [call] = await db.insert(calls).values({
    companyId: input.companyId,
    channelId: input.channel.id,
    contactId: input.contact.id,
    conversationId: input.conversation.id,
    direction: 'outbound',
    status: 'initiated',
    from: getWhatsAppCredential(input.channel).phoneNumberId,
    to: recipientIdentity.waId,
    startedAt: now,
    provider: 'whatsapp',
    providerCallId: metaCallId,
    aiProviderConversationId: providerConversationId,
    callType,
    recordingRequested: recording,
    recordingAudioProvider: recording ? 'whatsapp' : null,
    recordingExpectedFrom: recording ? 'whatsapp' : null,
    transcriptionRequested: transcription,
    transcriptProvider: transcription ? 'whatsapp' : null,
    metadata: { initiatedByUserId: input.userId, aiVoiceConnectionId: config.aiVoiceConnectionId, callType, provider: 'whatsapp' },
  }).returning();

  const [timeline] = await db.insert(messages).values({
    conversationId: input.conversation.id,
    externalId: `wa-call:${metaCallId}`,
    direction: 'outbound',
    type: 'call',
    content: 'WhatsApp call',
    senderId: input.userId,
    senderType: 'user',
    status: 'initiated',
    sentAt: now,
    metadata: { callId: call.id, provider: 'whatsapp', callType, recording, transcription },
  }).returning();
  await storage.updateConversation(input.conversation.id, { lastMessageAt: now });
  broadcastToCompany({ type: 'newMessage', data: timeline }, input.companyId);

  await db.insert(whatsappCallSessions).values({
    callId: call.id,
    companyId: input.companyId,
    channelId: input.channel.id,
    metaCallId,
    state: 'initiated',
    encryptedOfferSdp: sdpOffer ? encryptValue(sdpOffer) : null,
    signalingExpiresAt: new Date(Date.now() + SIGNALING_TTL_MS),
    routingStage: callType === 'ai-powered' ? 'ai' : 'outbound',
    timelineMessageId: timeline.id,
    providerConversationId,
  });
  await appendCallEvent(input.companyId, call.id, 'callStatusUpdate', { status: 'initiated', provider: 'whatsapp', direction: 'outbound' });
  return { call, metaCallId, callType };
}

async function createAiMediaSession(companyId: number, channel: ChannelConnection, voiceConnectionId: number) {
  const voice = await storage.getChannelConnection(voiceConnectionId);
  if (!voice || voice.companyId !== companyId || voice.channelType !== 'twilio_voice' || voice.status !== 'active') {
    throw new WhatsAppCallingError('WHATSAPP_CALL_AI_NOT_CONFIGURED', 'The selected AI voice profile is unavailable.');
  }
  const data = normalizeVoiceChannelConnectionData(voice.connectionData as any);
  const configError = getWhatsAppAiConfigurationError(voice);
  if (configError) throw new WhatsAppCallingError('WHATSAPP_CALL_AI_NOT_CONFIGURED', configError);
  const gatewayUrl = process.env.WHATSAPP_MEDIA_GATEWAY_URL;
  const gatewayToken = process.env.WHATSAPP_MEDIA_GATEWAY_TOKEN;
  if (!gatewayUrl || !gatewayToken) {
    throw new WhatsAppCallingError('WHATSAPP_MEDIA_GATEWAY_UNAVAILABLE', 'The WhatsApp AI media gateway is not configured.', 503);
  }
  const { provider, providerConfig } = buildWhatsAppAiGatewayProviderConfig(data);
  try {
    const response = await axios.post(`${gatewayUrl.replace(/\/$/, '')}/v1/sessions`, {
      provider,
      channelId: channel.id,
      // The gateway receives only provider credentials; it is contractually forbidden from dialing a phone number.
      providerConfig,
    }, { headers: { Authorization: `Bearer ${gatewayToken}` }, timeout: 15_000 });
    if (!response.data?.sdpOffer) throw new Error('Missing SDP offer');
    return { sdpOffer: String(response.data.sdpOffer), providerConversationId: response.data.providerConversationId as string | undefined };
  } catch (error: any) {
    throw new WhatsAppCallingError('WHATSAPP_MEDIA_GATEWAY_UNAVAILABLE', error?.response?.data?.message || 'The AI media session could not be started.', 503);
  }
}

export async function claimWhatsAppCall(callId: number, companyId: number, userId: number) {
  const [offer] = await db.select().from(callEvents).where(and(
    eq(callEvents.callId, callId),
    eq(callEvents.companyId, companyId),
    eq(callEvents.eventType, 'incomingWhatsAppCall'),
  )).orderBy(desc(callEvents.id)).limit(1);
  const targetUserIds = Array.isArray((offer?.payload as any)?.targetUserIds)
    ? (offer!.payload as any).targetUserIds.map(Number)
    : [];
  const offeredStage = String((offer?.payload as any)?.routingStage || '');
  if (!targetUserIds.includes(userId)) {
    throw new WhatsAppCallingError('CALL_NOT_OFFERED_TO_AGENT', 'This call is not assigned to you.', 403);
  }
  const result = await getPool().query(`
    UPDATE whatsapp_call_sessions
    SET claimed_by_user_id=$1, claimed_at=now(), state='claimed', updated_at=now()
    WHERE call_id=$2 AND company_id=$3 AND claimed_by_user_id IS NULL
      AND state IN ('ringing','offered') AND signaling_expires_at > now() AND routing_stage=$4
    RETURNING *
  `, [userId, callId, companyId, offeredStage]);
  if (!result.rows[0]) throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.alreadyClaimed, 'This call was already answered.', 409);
  await db.update(calls).set({ answeredByUserId: userId, status: 'accepted', updatedAt: new Date() }).where(and(eq(calls.id, callId), eq(calls.companyId, companyId)));
  await appendCallEvent(companyId, callId, 'callClaimed', { userId, status: 'accepted' });
  const row = result.rows[0];
  return {
    callId,
    state: row.state,
    claimedByUserId: row.claimed_by_user_id,
    sdpOffer: row.encrypted_offer_sdp ? decryptValue(row.encrypted_offer_sdp) : undefined,
    signalingExpiresAt: row.signaling_expires_at,
  };
}

async function loadSession(callId: number, companyId: number) {
  const [session] = await db.select({ session: whatsappCallSessions, channel: channelConnections })
    .from(whatsappCallSessions)
    .innerJoin(channelConnections, eq(channelConnections.id, whatsappCallSessions.channelId))
    .where(and(eq(whatsappCallSessions.callId, callId), eq(whatsappCallSessions.companyId, companyId)))
    .limit(1);
  if (!session) throw new WhatsAppCallingError('CALL_NOT_FOUND', 'Call not found.', 404);
  return session;
}

export async function answerWhatsAppCall(callId: number, companyId: number, userId: number, sdpAnswer: string, capture: { recording?: boolean; transcription?: boolean }) {
  const loaded = await loadSession(callId, companyId);
  if (loaded.session.claimedByUserId !== userId) throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.alreadyClaimed, 'This call is assigned to another agent.', 409);
  const config = getWhatsAppCallingConfig(loaded.channel);
  const recording = resolveCaptureSelection(config.recordingPolicy, config.recordingDefault, capture.recording);
  const transcription = resolveCaptureSelection(config.transcriptionPolicy, config.transcriptionDefault, capture.transcription);
  assertCaptureValue(config.recordingPolicy, recording);
  assertCaptureValue(config.transcriptionPolicy, transcription);
  try {
    await new WhatsAppCallingAdapter(loaded.channel).answer({
      providerCallId: loaded.session.metaCallId,
      sdpAnswer,
      recording,
      transcription,
    });
  } catch (error) {
    await db.update(whatsappCallSessions).set({ state: 'failed', encryptedOfferSdp: null, encryptedAnswerSdp: null, updatedAt: new Date() }).where(eq(whatsappCallSessions.id, loaded.session.id));
    await db.update(calls).set({ status: 'failed', failureCode: error instanceof WhatsAppCallingError ? error.code : 'WHATSAPP_CALL_ANSWER_FAILED', endedAt: new Date(), updatedAt: new Date() }).where(eq(calls.id, callId));
    await appendCallEvent(companyId, callId, 'callStatusUpdate', { status: 'failed', failureCode: error instanceof WhatsAppCallingError ? error.code : 'WHATSAPP_CALL_ANSWER_FAILED' });
    throw error;
  }
  await db.update(whatsappCallSessions).set({
    state: 'connected', encryptedAnswerSdp: encryptValue(sdpAnswer), signalingExpiresAt: new Date(Date.now() + SIGNALING_TTL_MS), updatedAt: new Date(),
  }).where(eq(whatsappCallSessions.id, loaded.session.id));
  await db.update(calls).set({
    status: 'in-progress',
    recordingRequested: recording,
    recordingAudioProvider: recording ? 'whatsapp' : null,
    recordingExpectedFrom: recording ? 'whatsapp' : null,
    transcriptionRequested: transcription,
    transcriptProvider: transcription ? 'whatsapp' : null,
    callType: 'direct',
    metadata: sql`COALESCE(${calls.metadata}, '{}'::jsonb) || ${JSON.stringify({ callType: 'direct' })}::jsonb`,
    updatedAt: new Date(),
  }).where(eq(calls.id, callId));
  await appendCallEvent(companyId, callId, 'callStatusUpdate', { status: 'in-progress', answeredByUserId: userId });
}

export async function terminateWhatsAppCall(callId: number, companyId: number, userId: number, status: 'rejected' | 'completed' = 'completed') {
  const loaded = await loadSession(callId, companyId);
  if (loaded.session.claimedByUserId && loaded.session.claimedByUserId !== userId) {
    throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.alreadyClaimed, 'This call is assigned to another agent.', 409);
  }
  await new WhatsAppCallingAdapter(loaded.channel).terminate(loaded.session.metaCallId);
  await db.update(whatsappCallSessions).set({ state: status, encryptedOfferSdp: null, encryptedAnswerSdp: null, updatedAt: new Date() }).where(eq(whatsappCallSessions.id, loaded.session.id));
  await db.update(calls).set({ status, endedAt: new Date(), updatedAt: new Date() }).where(eq(calls.id, callId));
  if (loaded.session.timelineMessageId) {
    const [updatedMessage] = await db.update(messages).set({ status, metadata: sql`COALESCE(${messages.metadata}, '{}'::jsonb) || ${JSON.stringify({ status })}::jsonb` }).where(eq(messages.id, loaded.session.timelineMessageId)).returning();
    if (updatedMessage) broadcastToCompany({ type: 'messageUpdated', data: { messageId: updatedMessage.id, conversationId: updatedMessage.conversationId, updates: updatedMessage } }, companyId);
  }
  await appendCallEvent(companyId, callId, 'callStatusUpdate', { status });
}

export async function handleWhatsAppAiGatewayEvent(input: {
  providerConversationId: string;
  status: 'failed' | 'completed';
  failureCode?: string;
}) {
  const [loaded] = await db.select({ session: whatsappCallSessions, call: calls, channel: channelConnections })
    .from(whatsappCallSessions)
    .innerJoin(calls, eq(calls.id, whatsappCallSessions.callId))
    .innerJoin(channelConnections, eq(channelConnections.id, whatsappCallSessions.channelId))
    .where(eq(whatsappCallSessions.providerConversationId, input.providerConversationId))
    .limit(1);
  if (!loaded) throw new WhatsAppCallingError('CALL_NOT_FOUND', 'AI call session not found.', 404);

  const terminalStates = ['completed', 'failed', 'rejected', 'busy', 'no-answer'];
  if (terminalStates.includes(String(loaded.call.status))) {
    return { callId: loaded.call.id, status: loaded.call.status };
  }

  const status = input.status;
  const failureCode = status === 'failed'
    ? (input.failureCode || 'WHATSAPP_AI_TRANSPORT_FAILED').slice(0, 200)
    : undefined;
  await new WhatsAppCallingAdapter(loaded.channel).terminate(loaded.session.metaCallId).catch(() => undefined);
  await db.update(whatsappCallSessions).set({
    state: status,
    encryptedOfferSdp: null,
    encryptedAnswerSdp: null,
    updatedAt: new Date(),
  }).where(eq(whatsappCallSessions.id, loaded.session.id));
  await db.update(calls).set({
    status,
    failureCode: failureCode || null,
    endedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(calls.id, loaded.call.id));
  if (loaded.session.timelineMessageId) {
    const [updatedMessage] = await db.update(messages).set({
      status,
      metadata: sql`COALESCE(${messages.metadata}, '{}'::jsonb) || ${JSON.stringify({ status, failureCode })}::jsonb`,
    }).where(eq(messages.id, loaded.session.timelineMessageId)).returning();
    if (updatedMessage) broadcastToCompany({
      type: 'messageUpdated',
      data: { messageId: updatedMessage.id, conversationId: updatedMessage.conversationId, updates: updatedMessage },
    }, loaded.call.companyId!);
  }
  await appendCallEvent(loaded.call.companyId!, loaded.call.id, 'callStatusUpdate', { status, failureCode, source: 'ai-media-gateway' });
  return { callId: loaded.call.id, status };
}

export async function getActiveWhatsAppCalls(companyId: number, userId: number) {
  const rows = await db.select({ session: whatsappCallSessions, call: calls })
    .from(whatsappCallSessions)
    .innerJoin(calls, eq(calls.id, whatsappCallSessions.callId))
    .where(and(
      eq(whatsappCallSessions.companyId, companyId),
      inArray(whatsappCallSessions.state, ['initiated', 'ringing', 'offered', 'claimed', 'connected', 'in-progress']),
      or(isNull(whatsappCallSessions.claimedByUserId), eq(whatsappCallSessions.claimedByUserId, userId)),
    ));
  const visible = [];
  for (const { session, call } of rows) {
    if (call.direction === 'outbound' && Number((call.metadata as any)?.initiatedByUserId) !== userId) continue;
    if (call.direction === 'inbound' && !session.claimedByUserId) {
      const events = await db.select().from(callEvents).where(and(eq(callEvents.callId, call.id), inArray(callEvents.eventType, ['incomingWhatsAppCall', 'callDeclined']))).orderBy(desc(callEvents.id)).limit(25);
      const offer = events.find((event) => event.eventType === 'incomingWhatsAppCall');
      const declined = events.some((event) => event.eventType === 'callDeclined' && Number((event.payload as any)?.userId) === userId && event.id > (offer?.id || 0));
      const targets = Array.isArray((offer?.payload as any)?.targetUserIds) ? (offer!.payload as any).targetUserIds.map(Number) : [];
      if (!offer || !targets.includes(userId) || declined) continue;
    }
    const channel = await storage.getChannelConnection(session.channelId);
    const config = channel ? getWhatsAppCallingConfig(channel) : normalizeWhatsAppCallingConfig({});
    visible.push({
      call,
      capture: {
        recordingPolicy: config.recordingPolicy, recordingDefault: config.recordingDefault,
        transcriptionPolicy: config.transcriptionPolicy, transcriptionDefault: config.transcriptionDefault,
      },
      session: {
        id: session.id, callId: session.callId, state: session.state, claimedByUserId: session.claimedByUserId,
        routingStage: session.routingStage, stageExpiresAt: session.stageExpiresAt, signalingExpiresAt: session.signalingExpiresAt,
        remoteSdp: call.direction === 'outbound' && session.encryptedAnswerSdp ? decryptValue(session.encryptedAnswerSdp) : undefined,
      },
    });
  }
  return visible;
}

export async function touchWhatsAppCallAgentPresence(companyId: number, userId: number) {
  await db.insert(whatsappCallAgentPresence).values({ companyId, userId, lastSeenAt: new Date() }).onConflictDoUpdate({
    target: [whatsappCallAgentPresence.companyId, whatsappCallAgentPresence.userId],
    set: { lastSeenAt: new Date() },
  });
}

export async function declineWhatsAppCall(callId: number, companyId: number, userId: number) {
  const loaded = await loadSession(callId, companyId);
  if (loaded.session.claimedByUserId) throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.alreadyClaimed, 'This call was already answered.', 409);
  await appendCallEvent(companyId, callId, 'callDeclined', { userId });
  if (loaded.session.routingStage === 'assigned') {
    await db.update(whatsappCallSessions).set({ stageExpiresAt: new Date(), updatedAt: new Date() }).where(eq(whatsappCallSessions.id, loaded.session.id));
  }
}

export async function getCallEvents(companyId: number, afterId: number) {
  return db.select().from(callEvents).where(and(eq(callEvents.companyId, companyId), gt(callEvents.id, afterId))).orderBy(callEvents.id).limit(250);
}

export async function requestWhatsAppCallPermission(input: {
  companyId: number; channel: ChannelConnection; contact: Contact; mode: 'freeform' | 'template'; templateName?: string; languageCode?: string; message?: string;
}) {
  const config = getWhatsAppCallingConfig(input.channel);
  const disabledCode = callingDisabledCode(input.channel, config);
  if (disabledCode) throw new WhatsAppCallingError(disabledCode, 'WhatsApp Calling is unavailable for this channel.');
  const identity = getWhatsAppCallPermissionIdentity(input.contact);
  if (!identity) throw new WhatsAppCallingError('CONTACT_PHONE_REQUIRED', 'The contact has no WhatsApp identity.');
  const [cachedPermission] = await db.select().from(whatsappCallPermissions).where(and(
    eq(whatsappCallPermissions.channelId, input.channel.id),
    eq(whatsappCallPermissions.contactId, input.contact.id),
  )).limit(1);
  if (effectivePermissionStatus(cachedPermission).canRequest === false) {
    throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.permissionRateLimited, 'Meta does not currently allow another permission request.', 429);
  }
  let approvedTemplate: typeof campaignTemplates.$inferSelect | undefined;
  if (input.mode === 'template') {
    const [template] = await db.select().from(campaignTemplates).where(and(
      eq(campaignTemplates.companyId, input.companyId),
      eq(campaignTemplates.connectionId, input.channel.id),
      eq(campaignTemplates.name, input.templateName || ''),
      eq(campaignTemplates.whatsappTemplateStatus, 'approved'),
    )).limit(1);
    if (!template) throw new WhatsAppCallingError('WHATSAPP_CALL_PERMISSION_TEMPLATE_INVALID', 'Select an approved template for this WhatsApp channel.');
    const components = Array.isArray(template.whatsappTemplateComponents) ? template.whatsappTemplateComponents : [];
    if (!components.some((component: any) => String(component?.type || '').toLowerCase() === 'call_permission_request')) {
      throw new WhatsAppCallingError('WHATSAPP_CALL_PERMISSION_TEMPLATE_INVALID', 'The selected template is not a call permission request template.');
    }
    approvedTemplate = template;
  } else if (!input.message?.trim()) {
    throw new WhatsAppCallingError('WHATSAPP_CALL_PERMISSION_MESSAGE_REQUIRED', 'A permission request message is required.');
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM whatsapp_call_permissions WHERE channel_id=$1 AND contact_id=$2 FOR UPDATE', [input.channel.id, input.contact.id]);
    const history = Array.isArray(existing.rows[0]?.request_history) ? existing.rows[0].request_history : [];
    const now = Date.now();
    const recent = history.filter((entry: any) => new Date(entry.requestedAt).getTime() > now - 7 * 24 * 60 * 60 * 1000);
    if (!canRequestWhatsAppCallPermission(recent, new Date(now))) {
      throw new WhatsAppCallingError(WHATSAPP_CALL_ERROR_CODES.permissionRateLimited, 'Meta permits one request per 24 hours and two per seven days.', 429);
    }
    const credentials = getWhatsAppCredential(input.channel);
    const recipient = 'recipient' in identity.query
      ? { recipient: identity.waId }
      : { to: identity.waId };
    const payload = input.mode === 'template'
      ? {
          messaging_product: 'whatsapp', recipient_type: 'individual', ...recipient, type: 'template',
          template: { name: approvedTemplate?.whatsappTemplateName || approvedTemplate?.name, language: { code: approvedTemplate?.whatsappTemplateLanguage || input.languageCode || 'en_US' } },
        }
      : {
          messaging_product: 'whatsapp', recipient_type: 'individual', ...recipient, type: 'interactive',
          interactive: { type: 'call_permission_request', action: { name: 'call_permission_request' }, body: { text: input.message!.trim() } },
        };
    await axios.post(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/messages`, payload, {
      headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' }, timeout: 20_000,
    });
    const nextHistory = [...recent, { requestedAt: new Date().toISOString(), mode: input.mode }];
    await client.query(`INSERT INTO whatsapp_call_permissions
      (company_id,channel_id,contact_id,wa_id,status,last_requested_at,request_history,created_at,updated_at)
      VALUES($1,$2,$3,$4,'pending',now(),$5::jsonb,now(),now())
      ON CONFLICT(channel_id,contact_id) DO UPDATE SET status='pending',last_requested_at=now(),request_history=$5::jsonb,updated_at=now()`,
      [input.companyId, input.channel.id, input.contact.id, identity.waId, JSON.stringify(nextHistory)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof WhatsAppCallingError) throw error;
    const graphMessage = (error as any)?.response?.data?.error?.message;
    throw new WhatsAppCallingError('WHATSAPP_CALL_PERMISSION_REQUEST_FAILED', graphMessage || 'Permission request failed.', 502);
  } finally {
    client.release();
  }
}

export async function refreshWhatsAppCallingEligibility(connection: ChannelConnection) {
  const credentials = getWhatsAppCredential(connection);
  if (credentials.signupMode === 'coexistence' || credentials.isOnBizApp) {
    return { eligible: false, callingEnabledByMeta: false, messagingTier: null, restrictionCodes: ['coexistence_not_supported'], checkedAt: new Date().toISOString() };
  }
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    return { eligible: false, callingEnabledByMeta: false, messagingTier: null, restrictionCodes: ['credentials_missing'], checkedAt: new Date().toISOString() };
  }
  try {
    const [phone, settings] = await Promise.all([
      axios.get(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}`, {
        params: { fields: 'platform_type,is_on_biz_app,messaging_limit_tier,code_verification_status' },
        headers: { Authorization: `Bearer ${credentials.accessToken}` }, timeout: 20_000,
      }),
      axios.get(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/settings`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` }, timeout: 20_000,
      }).catch(() => ({ data: {} })),
    ]);
    const tier = phone.data?.messaging_limit_tier || null;
    const tierNumber = parseWhatsAppMessagingTier(tier);
    const callingSetting = settings.data?.data?.find?.((item: any) => item.setting === 'calling') || settings.data?.calling;
    const callingEnabledByMeta = callingSetting?.enabled === true || callingSetting?.status === 'ENABLED';
    const restrictionCodes: string[] = [];
    if (phone.data?.is_on_biz_app) restrictionCodes.push('coexistence_not_supported');
    if (tierNumber === null || tierNumber < 2000) restrictionCodes.push('messaging_tier_too_low');
    if (!callingEnabledByMeta) restrictionCodes.push('calling_not_enabled_by_meta');
    return {
      eligible: tierNumber !== null && tierNumber >= 2000 && !phone.data?.is_on_biz_app,
      callingEnabledByMeta,
      messagingTier: tier,
      restrictionCodes,
      checkedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    return { eligible: false, callingEnabledByMeta: false, messagingTier: null, restrictionCodes: ['eligibility_check_failed'], checkedAt: new Date().toISOString(), error: error?.response?.data?.error?.message || error.message };
  }
}

export async function updateWhatsAppCallingSettings(connection: ChannelConnection, patch: unknown) {
  const current = getWhatsAppCallingConfig(connection);
  const next = normalizeWhatsAppCallingConfig({ ...current, ...(patch as Record<string, unknown>), eligibility: current.eligibility });
  const data = connectionData(connection);
  let persisted = next;
  if (isWhatsAppCallingGloballyEnabled() && next.eligibility.eligible) {
    const credentials = getWhatsAppCredential(connection);
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    try {
      await axios.post(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/settings`, {
        calling: {
          status: next.enabled ? 'ENABLED' : 'DISABLED',
          call_icon_visibility: next.callButtonVisible ? 'DEFAULT' : 'DISABLE_ALL',
          callback_permission_status: next.callbackPermissionEnabled ? 'ENABLED' : 'DISABLED',
          call_hours: {
            status: next.operatingHours.some((entry) => entry.enabled) ? 'ENABLED' : 'DISABLED',
            timezone_id: next.timezone,
            weekly_operating_hours: next.operatingHours.filter((entry) => entry.enabled).map((entry) => ({
              day_of_week: dayNames[entry.day], open_time: entry.start.replace(':', ''), close_time: entry.end.replace(':', ''),
            })),
            holiday_schedule: [],
          },
        },
      }, { headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' }, timeout: 20_000 });
      persisted = normalizeWhatsAppCallingConfig({
        ...next,
        eligibility: {
          ...next.eligibility,
          callingEnabledByMeta: next.enabled,
          restrictionCodes: next.enabled
            ? next.eligibility.restrictionCodes.filter((code) => code !== 'calling_not_enabled_by_meta')
            : [...new Set([...next.eligibility.restrictionCodes, 'calling_not_enabled_by_meta'])],
          checkedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      throw new WhatsAppCallingError('WHATSAPP_CALLING_SETTINGS_SYNC_FAILED', error?.response?.data?.error?.message || 'Meta rejected the calling settings.', 502);
    }
  }
  const updated = await storage.updateChannelConnection(connection.id, { connectionData: { ...data, whatsappCalling: persisted } });
  return getWhatsAppCallingConfig(updated);
}

export async function persistEligibility(connection: ChannelConnection) {
  const eligibility = await refreshWhatsAppCallingEligibility(connection);
  const current = getWhatsAppCallingConfig(connection);
  const data = connectionData(connection);
  const updated = await storage.updateChannelConnection(connection.id, {
    connectionData: { ...data, whatsappCalling: normalizeWhatsAppCallingConfig({ ...current, eligibility }) },
  });
  return getWhatsAppCallingConfig(updated);
}

export async function updatePermissionFromWebhook(channelId: number, companyId: number, value: any) {
  const reply = value?.interactive?.call_permission_reply || value?.call_permission_reply || value;
  const bsuid = String(value?.from_user_id || value?.from_parent_user_id || value?.recipient_id || '');
  const waId = String(value?.wa_id || value?.from || bsuid || '');
  if (!waId) return;
  const contact = await findContactByWhatsAppIdentity(companyId, waId, bsuid);
  if (!contact) return;
  if (bsuid && !contact.whatsappBsuid) await storage.updateContactWhatsAppIdentity(contact.id, { whatsappBsuid: bsuid });
  const response = String(reply?.response || reply?.status || reply?.permission_status || '').toLowerCase();
  const granted = ['accept', 'accepted', 'granted', 'temporary', 'permanent'].includes(response);
  const revoked = ['decline', 'declined', 'revoke', 'revoked'].includes(response);
  const status = granted ? 'granted' : revoked ? 'revoked' : 'pending';
  const permissionType = reply?.is_permanent === true
    ? 'permanent'
    : String(reply?.permission_type || '').toLowerCase() || (granted ? 'temporary' : null);
  const expiration = reply?.expiration_time ?? reply?.expiration_timestamp;
  const expiresAt = expiration ? new Date(Number(expiration) * 1000) : null;
  const [previous] = await db.select({ status: whatsappCallPermissions.status }).from(whatsappCallPermissions).where(and(
    eq(whatsappCallPermissions.channelId, channelId),
    eq(whatsappCallPermissions.contactId, contact.id),
  )).limit(1);
  await db.insert(whatsappCallPermissions).values({
    companyId, channelId, contactId: contact.id, waId,
    status, permissionType, grantedAt: granted ? new Date() : null, expiresAt, revokedAt: revoked ? new Date() : null,
  }).onConflictDoUpdate({
    target: [whatsappCallPermissions.channelId, whatsappCallPermissions.contactId],
    set: { waId, status, permissionType, grantedAt: granted ? new Date() : null, expiresAt, revokedAt: revoked ? new Date() : null, updatedAt: new Date() },
  });
  if (previous?.status !== status) {
    broadcastToCompany({
      type: 'whatsappCallPermissionUpdated',
      data: { channelId, contactId: contact.id, status, permissionType, expiresAt: expiresAt?.toISOString() || null },
    }, companyId);
  }
}

function normalizedMetaStatus(event: any): string {
  const raw = String(event?.status || event?.event || event?.state || '').toLowerCase().replace(/_/g, '-');
  if (['connect', 'ringing', 'initiated'].includes(raw)) return raw === 'connect' ? 'ringing' : raw;
  if (['accepted', 'answered', 'in-progress', 'connected'].includes(raw)) return 'in-progress';
  if (['terminate', 'terminated', 'completed', 'ended'].includes(raw)) return 'completed';
  if (['reject', 'rejected', 'declined'].includes(raw)) return 'rejected';
  if (['busy', 'no-answer', 'failed'].includes(raw)) return raw;
  return raw || 'unknown';
}

async function eligibleAgentIds(companyId: number) {
  const agents = await getAgentsWithAvailability(companyId);
  const available = agents.filter((agent) => agent.isAvailable && agent.isOnDuty);
  if (!available.length) return [];
  const online = await db.select({ userId: whatsappCallAgentPresence.userId }).from(whatsappCallAgentPresence).where(and(
    eq(whatsappCallAgentPresence.companyId, companyId),
    inArray(whatsappCallAgentPresence.userId, available.map((agent) => agent.id)),
    gt(whatsappCallAgentPresence.lastSeenAt, new Date(Date.now() - 15_000)),
  ));
  const onlineIds = new Set(online.map((row) => row.userId));
  const authorized = await Promise.all(available.filter((agent) => onlineIds.has(agent.id)).map(async (agent) => {
    const user = await storage.getUser(agent.id);
    if (!user) return undefined;
    const permissions = await getUserPermissions(user);
    return user.isSuperAdmin || permissions[PERMISSIONS.MANAGE_CALL_LOGS] === true ? agent.id : undefined;
  }));
  return authorized.filter((id): id is number => id !== undefined);
}

async function startInboundAiSession(session: typeof whatsappCallSessions.$inferSelect, call: typeof calls.$inferSelect, channel: ChannelConnection) {
  const config = getWhatsAppCallingConfig(channel);
  if (!config.aiVoiceConnectionId || !session.encryptedOfferSdp) throw new WhatsAppCallingError('WHATSAPP_CALL_AI_NOT_CONFIGURED', 'No AI voice profile is available.');
  const voice = await storage.getChannelConnection(config.aiVoiceConnectionId);
  if (!voice || voice.companyId !== call.companyId || voice.channelType !== 'twilio_voice' || voice.status !== 'active') throw new WhatsAppCallingError('WHATSAPP_CALL_AI_NOT_CONFIGURED', 'The AI voice profile is unavailable.');
  const data = normalizeVoiceChannelConnectionData(voice.connectionData as any);
  const configError = getWhatsAppAiConfigurationError(voice);
  if (configError) throw new WhatsAppCallingError('WHATSAPP_CALL_AI_NOT_CONFIGURED', configError);
  const gatewayUrl = process.env.WHATSAPP_MEDIA_GATEWAY_URL;
  const gatewayToken = process.env.WHATSAPP_MEDIA_GATEWAY_TOKEN;
  if (!gatewayUrl || !gatewayToken) throw new WhatsAppCallingError('WHATSAPP_MEDIA_GATEWAY_UNAVAILABLE', 'The AI media gateway is unavailable.', 503);
  const { provider, providerConfig } = buildWhatsAppAiGatewayProviderConfig(data);
  const response = await axios.post(`${gatewayUrl.replace(/\/$/, '')}/v1/sessions`, {
    provider,
    role: 'answerer',
    sdpOffer: decryptValue(session.encryptedOfferSdp),
    providerConfig,
  }, { headers: { Authorization: `Bearer ${gatewayToken}` }, timeout: 15_000 });
  if (!response.data?.sdpAnswer) throw new Error('Media gateway did not return an SDP answer');
  const recording = resolveCaptureSelection(config.recordingPolicy, config.recordingDefault, undefined);
  const transcription = resolveCaptureSelection(config.transcriptionPolicy, config.transcriptionDefault, undefined);
  await new WhatsAppCallingAdapter(channel).answer({
    providerCallId: session.metaCallId,
    sdpAnswer: String(response.data.sdpAnswer),
    recording,
    transcription,
  });
  await db.update(whatsappCallSessions).set({
    state: 'connected', routingStage: 'ai', encryptedAnswerSdp: encryptValue(String(response.data.sdpAnswer)),
    providerConversationId: response.data.providerConversationId || null, signalingExpiresAt: new Date(Date.now() + SIGNALING_TTL_MS), updatedAt: new Date(),
  }).where(eq(whatsappCallSessions.id, session.id));
  await db.update(calls).set({
    status: 'in-progress',
    callType: 'ai-powered',
    aiProviderConversationId: response.data.providerConversationId || null,
    recordingRequested: recording,
    transcriptionRequested: transcription,
    updatedAt: new Date(),
  }).where(eq(calls.id, call.id));
  await appendCallEvent(call.companyId!, call.id, 'callStatusUpdate', { status: 'in-progress', callType: 'ai-powered' });
}

async function offerInboundToHumans(session: typeof whatsappCallSessions.$inferSelect, call: typeof calls.$inferSelect, conversation: Conversation, stage: 'assigned' | 'pool') {
  const available = await eligibleAgentIds(call.companyId!);
  const assigned = conversation.assignedToUserId && available.includes(conversation.assignedToUserId) ? conversation.assignedToUserId : null;
  const targetUserIds = stage === 'assigned' && assigned ? [assigned] : available.filter((id) => id !== assigned);
  if (targetUserIds.length === 0 && stage === 'assigned') return offerInboundToHumans(session, call, conversation, 'pool');
  await db.update(whatsappCallSessions).set({
    state: 'offered', routingStage: stage, stageExpiresAt: new Date(Date.now() + 20_000), updatedAt: new Date(),
  }).where(eq(whatsappCallSessions.id, session.id));
  await appendCallEvent(call.companyId!, call.id, 'incomingWhatsAppCall', {
    status: 'ringing', targetUserIds, routingStage: stage, expiresAt: new Date(Date.now() + 20_000).toISOString(),
    contactId: call.contactId, conversationId: call.conversationId, from: call.from,
  });
}

async function markInboundMissed(session: typeof whatsappCallSessions.$inferSelect, call: typeof calls.$inferSelect, channel: ChannelConnection, failureCode?: string) {
  await new WhatsAppCallingAdapter(channel).terminate(session.metaCallId).catch(() => undefined);
  await db.update(whatsappCallSessions).set({ state: 'no-answer', encryptedOfferSdp: null, encryptedAnswerSdp: null, updatedAt: new Date() }).where(eq(whatsappCallSessions.id, session.id));
  await db.update(calls).set({ status: 'no-answer', failureCode, endedAt: new Date(), updatedAt: new Date() }).where(eq(calls.id, call.id));
  if (session.timelineMessageId) {
    const [updatedMessage] = await db.update(messages).set({ status: 'no-answer' }).where(eq(messages.id, session.timelineMessageId)).returning();
    if (updatedMessage) broadcastToCompany({ type: 'messageUpdated', data: { messageId: updatedMessage.id, conversationId: updatedMessage.conversationId, updates: updatedMessage } }, call.companyId!);
  }
  await appendCallEvent(call.companyId!, call.id, 'callStatusUpdate', { status: 'no-answer', failureCode });
}

async function processDueInboundRouting() {
  const client = await getPool().connect();
  let rows: any[] = [];
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT s.id FROM whatsapp_call_sessions s
      WHERE s.state='offered' AND s.stage_expires_at <= now()
      ORDER BY s.stage_expires_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 20
    `);
    rows = result.rows;
    if (rows.length) await client.query(`UPDATE whatsapp_call_sessions SET stage_expires_at=now()+interval '2 minutes', updated_at=now() WHERE id = ANY($1::bigint[])`, [rows.map((row) => row.id)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  for (const row of rows) {
    const [loaded] = await db.select({ session: whatsappCallSessions, call: calls, channel: channelConnections })
      .from(whatsappCallSessions)
      .innerJoin(calls, eq(calls.id, whatsappCallSessions.callId))
      .innerJoin(channelConnections, eq(channelConnections.id, whatsappCallSessions.channelId))
      .where(eq(whatsappCallSessions.id, Number(row.id))).limit(1);
    if (!loaded) continue;
    const conversation = loaded.call.conversationId ? await storage.getConversation(loaded.call.conversationId) : undefined;
    if (!conversation) return markInboundMissed(loaded.session, loaded.call, loaded.channel, 'CONVERSATION_NOT_FOUND');
    if (loaded.session.routingStage === 'assigned') {
      await offerInboundToHumans(loaded.session, loaded.call, conversation, 'pool');
      continue;
    }
    const config = getWhatsAppCallingConfig(loaded.channel);
    if (config.inboundRouting === 'human_first' && config.aiVoiceConnectionId) {
      try { await startInboundAiSession(loaded.session, loaded.call, loaded.channel); }
      catch (error) { await markInboundMissed(loaded.session, loaded.call, loaded.channel, error instanceof WhatsAppCallingError ? error.code : 'AI_START_FAILED'); }
    } else {
      await markInboundMissed(loaded.session, loaded.call, loaded.channel);
    }
  }
}

async function createInboundCall(connection: ChannelConnection, event: any) {
  const metaCallId = String(event.id || event.call_id || '');
  if (!metaCallId) return;

  // Meta may deliver the same ringing event to more than one application replica at once.
  // Keep the advisory lock for the complete materialization path so the second replica sees
  // the durable session before it can create an orphan call or duplicate timeline card.
  const lockKey = `whatsapp-call:${connection.id}:${metaCallId}`;
  const lockClient = await getPool().connect();
  try {
    await lockClient.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [lockKey]);
    await createInboundCallWhileLocked(connection, event, metaCallId);
  } finally {
    try {
      await lockClient.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [lockKey]);
    } finally {
      lockClient.release();
    }
  }
}

async function createInboundCallWhileLocked(connection: ChannelConnection, event: any, metaCallId: string) {
  const companyId = connection.companyId!;
  const config = getWhatsAppCallingConfig(connection);
  const credentials = getWhatsAppCredential(connection);
  if (!config.enabled || !config.eligibility.eligible || !config.eligibility.callingEnabledByMeta
    || credentials.signupMode === 'coexistence' || credentials.isOnBizApp) {
    await new WhatsAppCallingAdapter(connection).terminate(metaCallId, true).catch(() => undefined);
    return;
  }
  const [existing] = await db.select().from(whatsappCallSessions).where(eq(whatsappCallSessions.metaCallId, metaCallId)).limit(1);
  if (existing) return;
  const fromBsuid = String(event.from_user_id || event.from_parent_user_id || '');
  const from = String(event.from || event.wa_id || event.caller_id || fromBsuid || '');
  if (!from) return;
  let contact = await findContactByWhatsAppIdentity(companyId, from, fromBsuid);
  if (!contact) {
    contact = await storage.createContact({
      companyId, name: event.contacts?.[0]?.profile?.name || event.contacts?.profile?.name || event.caller_name || from,
      phone: event.from || event.wa_id || null,
      identifier: from, identifierType: 'whatsapp_official', source: 'whatsapp_official', isActive: true,
      ...(fromBsuid ? { whatsappBsuid: fromBsuid } : {}),
    });
  } else if (fromBsuid && !contact.whatsappBsuid) {
    const updatedContact = await storage.updateContactWhatsAppIdentity(contact.id, { whatsappBsuid: fromBsuid });
    if (updatedContact) contact = updatedContact;
  }
  let conversation = await storage.getConversationByContactAndChannel(contact.id, connection.id);
  if (!conversation) conversation = await storage.createConversation({
    companyId, contactId: contact.id, channelId: connection.id, channelType: 'whatsapp_official', status: 'active', lastMessageAt: new Date(), isGroup: false,
  });
  const offer = event.session?.sdp || event.sdp;
  if (!offer) throw new WhatsAppCallingError('WHATSAPP_CALL_SDP_REQUIRED', 'Inbound call did not include an SDP offer.');
  const defaultRecording = resolveCaptureSelection(config.recordingPolicy, config.recordingDefault, undefined);
  const defaultTranscription = resolveCaptureSelection(config.transcriptionPolicy, config.transcriptionDefault, undefined);
  const [call] = await db.insert(calls).values({
    companyId, channelId: connection.id, contactId: contact.id, conversationId: conversation.id,
    direction: 'inbound', status: 'ringing', from, to: getWhatsAppCredential(connection).phoneNumberId,
    startedAt: new Date(), provider: 'whatsapp', providerCallId: metaCallId,
    callType: config.inboundRouting === 'ai_first' ? 'ai-powered' : 'direct',
    recordingRequested: defaultRecording,
    recordingAudioProvider: defaultRecording ? 'whatsapp' : null,
    recordingExpectedFrom: defaultRecording ? 'whatsapp' : null,
    transcriptionRequested: defaultTranscription,
    transcriptProvider: defaultTranscription ? 'whatsapp' : null,
    metadata: { callType: config.inboundRouting === 'ai_first' ? 'ai-powered' : 'direct', provider: 'whatsapp' },
  }).returning();
  const [timeline] = await db.insert(messages).values({
    conversationId: conversation.id, externalId: `wa-call:${metaCallId}`, direction: 'inbound', type: 'call', content: 'WhatsApp call',
    status: 'ringing', sentAt: new Date(), metadata: { callId: call.id, provider: 'whatsapp', direction: 'inbound' },
  }).returning();
  await storage.updateConversation(conversation.id, { lastMessageAt: new Date() });
  broadcastToCompany({ type: 'newMessage', data: timeline }, companyId);
  const [session] = await db.insert(whatsappCallSessions).values({
    callId: call.id, companyId, channelId: connection.id, metaCallId, state: 'ringing',
    encryptedOfferSdp: encryptValue(String(offer)), signalingExpiresAt: new Date(Date.now() + SIGNALING_TTL_MS),
    routingStage: config.inboundRouting === 'ai_first' ? 'ai' : 'assigned', timelineMessageId: timeline.id,
    lastWebhookAt: event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date(),
  }).returning();
  await appendCallEvent(companyId, call.id, 'callStatusUpdate', { status: 'ringing', provider: 'whatsapp', direction: 'inbound' });
  if (config.inboundRouting === 'ai_first') {
    try { await startInboundAiSession(session, call, connection); return; }
    catch { /* Required fallback is the normal human routing chain. */ }
  }
  await offerInboundToHumans(session, call, conversation, 'assigned');
}

async function applyCallStatus(connection: ChannelConnection, event: any) {
  const metaCallId = String(event.id || event.call_id || '');
  if (!metaCallId) return;
  const [loaded] = await db.select({ session: whatsappCallSessions, call: calls })
    .from(whatsappCallSessions).innerJoin(calls, eq(calls.id, whatsappCallSessions.callId))
    .where(eq(whatsappCallSessions.metaCallId, metaCallId)).limit(1);
  if (!loaded) return;
  const eventName = String(event.event || '').toLowerCase();
  const recordingMedia = event.call_recording?.audio;
  const transcriptMedia = event.call_transcript?.document;
  if (eventName === 'call_recording_available' || eventName === 'call_transcription_available') {
    await db.update(whatsappCallSessions).set({ lastWebhookAt: new Date(), updatedAt: new Date() }).where(eq(whatsappCallSessions.id, loaded.session.id));
    if (recordingMedia?.url && recordingMedia?.id) {
      await enqueueMetaCallAsset(connection, loaded.call.id, 'recording', recordingMedia);
    }
    if (transcriptMedia?.url && transcriptMedia?.id) {
      await enqueueMetaCallAsset(connection, loaded.call.id, 'transcript', transcriptMedia);
    }
    void processWhatsAppCallAssetJobs().catch((error) => console.error('[WhatsApp Calling] immediate asset ingestion:', error));
    return;
  }
  const webhookAt = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
  if (loaded.session.lastWebhookAt && !Number.isNaN(webhookAt.getTime()) && webhookAt < loaded.session.lastWebhookAt) return;
  let status = normalizedMetaStatus(event);
  if (eventName === 'terminate' && status === 'completed' && !event.start_time) status = 'no-answer';
  const terminal = ['completed', 'rejected', 'failed', 'busy', 'no-answer'].includes(status);
  const answerSdp = event.session?.sdp || event.sdp_answer;
  const startedAt = event.start_time ? new Date(Number(event.start_time) * 1000) : undefined;
  const endedAt = event.end_time ? new Date(Number(event.end_time) * 1000) : terminal ? new Date() : undefined;
  const durationSec = Number.isFinite(Number(event.duration)) ? Number(event.duration) : undefined;
  const failureCode = event.errors?.[0]?.code != null ? String(event.errors[0].code) : undefined;
  await db.update(whatsappCallSessions).set({
    state: status, lastWebhookAt: Number.isNaN(webhookAt.getTime()) ? new Date() : webhookAt, updatedAt: new Date(),
    ...(answerSdp ? { encryptedAnswerSdp: encryptValue(String(answerSdp)), signalingExpiresAt: new Date(Date.now() + SIGNALING_TTL_MS) } : {}),
    ...(terminal ? { encryptedOfferSdp: null, encryptedAnswerSdp: null } : {}),
  }).where(eq(whatsappCallSessions.id, loaded.session.id));
  await db.update(calls).set({
    status,
    ...(startedAt && !Number.isNaN(startedAt.getTime()) ? { startedAt } : {}),
    ...(endedAt && !Number.isNaN(endedAt.getTime()) ? { endedAt } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(failureCode ? { failureCode } : {}),
    updatedAt: new Date(),
  }).where(eq(calls.id, loaded.call.id));
  if (loaded.session.timelineMessageId) {
    const [updatedMessage] = await db.update(messages).set({
      status,
      metadata: sql`COALESCE(${messages.metadata}, '{}'::jsonb) || ${JSON.stringify({ status, durationSec, failureCode })}::jsonb`,
    }).where(eq(messages.id, loaded.session.timelineMessageId)).returning();
    if (updatedMessage) broadcastToCompany({ type: 'messageUpdated', data: { messageId: updatedMessage.id, conversationId: updatedMessage.conversationId, updates: updatedMessage } }, connection.companyId!);
  }
  await appendCallEvent(connection.companyId!, loaded.call.id, 'callStatusUpdate', { status, failureCode, durationSec, remoteSdpAvailable: !!answerSdp });
}

async function enqueueMetaCallAsset(connection: ChannelConnection, callId: number, assetType: 'recording' | 'transcript', media: any) {
  await db.insert(whatsappCallAssetJobs).values({
    companyId: connection.companyId!,
    channelId: connection.id,
    callId,
    assetType,
    mediaId: String(media.id),
    downloadUrl: String(media.url),
    mimeType: media.mime_type ? String(media.mime_type) : null,
    sha256: media.sha256 ? String(media.sha256) : null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).onConflictDoUpdate({
    target: [whatsappCallAssetJobs.callId, whatsappCallAssetJobs.assetType, whatsappCallAssetJobs.mediaId],
    set: {
      downloadUrl: String(media.url),
      mimeType: media.mime_type ? String(media.mime_type) : null,
      sha256: media.sha256 ? String(media.sha256) : null,
      status: 'queued',
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function persistMetaCallAsset(connection: ChannelConnection, job: typeof whatsappCallAssetJobs.$inferSelect) {
  const credentials = getWhatsAppCredential(connection);
  const headers = { Authorization: `Bearer ${credentials.accessToken}` };
  let downloadUrl = job.downloadUrl;
  if (job.attempts > 1) {
    const mediaResponse = await axios.get(`${GRAPH_URL}/${encodeURIComponent(job.mediaId)}`, { headers, timeout: 15_000 });
    if (!mediaResponse.data?.url) throw new Error('Meta did not return a refreshed media URL');
    downloadUrl = String(mediaResponse.data.url);
    await db.update(whatsappCallAssetJobs).set({ downloadUrl, updatedAt: new Date() }).where(eq(whatsappCallAssetJobs.id, job.id));
  }
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (job.assetType === 'recording') {
      const response = await axios.get(downloadUrl, { headers, responseType: 'arraybuffer', timeout: 30_000 });
      const recordingBuffer = Buffer.from(response.data);
      if (job.sha256 && createHash('sha256').update(recordingBuffer).digest('base64') !== job.sha256) {
        throw new Error('WhatsApp recording checksum mismatch');
      }
      const contentType = String(response.headers['content-type'] || job.mimeType || 'audio/ogg');
      const extension = contentType.includes('mpeg') ? 'mp3' : contentType.includes('wav') ? 'wav' : 'ogg';
      const directory = path.resolve('uploads', 'call-recordings', String(connection.companyId));
      await fs.ensureDir(directory);
      const filename = `${job.callId}-${randomUUID()}.${extension}`;
      const absolute = path.join(directory, filename);
      await fs.writeFile(absolute, recordingBuffer);
      const publicUrl = `/uploads/call-recordings/${connection.companyId}/${filename}`;
      updates.recordingUrl = publicUrl;
      updates.recordingAudioProvider = 'whatsapp';
      updates.whatsappRecordingId = job.mediaId;
      await recordMediaFileOwnership({ companyId: connection.companyId!, publicUrl, bucket: `call:${job.callId}`, fileSize: (await fs.stat(absolute)).size });
  } else {
      const response = await axios.get(downloadUrl, { headers, responseType: 'arraybuffer', timeout: 30_000 });
      const transcriptBuffer = Buffer.from(response.data);
      if (job.sha256 && createHash('sha256').update(transcriptBuffer).digest('base64') !== job.sha256) {
        throw new Error('WhatsApp transcript checksum mismatch');
      }
      const raw = JSON.parse(transcriptBuffer.toString('utf8'));
      const segments = normalizeWhatsAppTranscript(raw);
      updates.transcript = {
        provider: 'whatsapp',
        language: raw?.transcript?.language,
        confidence: raw?.transcript?.confidence,
        durationSec: raw?.transcript?.duration,
        segments,
      };
      updates.transcriptProvider = 'whatsapp';
      updates.whatsappTranscriptId = job.mediaId;
  }
  await db.update(calls).set(updates).where(and(eq(calls.id, job.callId), eq(calls.companyId, connection.companyId!)));
  await appendCallEvent(connection.companyId!, job.callId, 'callAssetsUpdated', {
    recordingAvailable: job.assetType === 'recording',
    transcriptAvailable: job.assetType === 'transcript',
  });
}

async function processWhatsAppCallAssetJobs() {
  if (!(await isWhatsAppCallAssetJobsTableReady())) {
    logMissingAssetJobsTableOnce();
    return;
  }

  const client = await getPool().connect();
  let jobs: Array<typeof whatsappCallAssetJobs.$inferSelect> = [];
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE whatsapp_call_asset_jobs SET status='processing', attempts=attempts+1, updated_at=now()
      WHERE id IN (
        SELECT id FROM whatsapp_call_asset_jobs
        WHERE (status IN ('queued','failed') OR (status='processing' AND updated_at < now()-interval '5 minutes'))
          AND next_attempt_at <= now() AND expires_at > now()
        ORDER BY next_attempt_at ASC FOR UPDATE SKIP LOCKED LIMIT 10
      )
      RETURNING *
    `);
    jobs = result.rows.map((row: any) => ({
      id: Number(row.id), companyId: row.company_id, channelId: row.channel_id, callId: row.call_id,
      assetType: row.asset_type, mediaId: row.media_id, downloadUrl: row.download_url, mimeType: row.mime_type,
      sha256: row.sha256, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at,
      expiresAt: row.expires_at, lastError: row.last_error, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const job of jobs) {
    try {
      const connection = await storage.getChannelConnection(job.channelId);
      if (!connection || connection.companyId !== job.companyId || connection.channelType !== 'whatsapp_official') {
        throw new Error('WhatsApp channel is no longer available');
      }
      await persistMetaCallAsset(connection, job);
      await db.update(whatsappCallAssetJobs).set({ status: 'completed', lastError: null, updatedAt: new Date() }).where(eq(whatsappCallAssetJobs.id, job.id));
    } catch (error: any) {
      const delayMinutes = Math.min(360, 2 ** Math.min(job.attempts, 8));
      const nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000);
      const permanentlyFailed = job.attempts >= 10 || nextAttemptAt >= job.expiresAt;
      await db.update(whatsappCallAssetJobs).set({
        status: permanentlyFailed ? 'expired' : 'failed',
        nextAttemptAt,
        lastError: String(error?.message || error).slice(0, 2_000),
        updatedAt: new Date(),
      }).where(eq(whatsappCallAssetJobs.id, job.id));
      await appendCallEvent(job.companyId, job.callId, 'callAssetIngestionFailed', {
        assetType: job.assetType,
        retryable: !permanentlyFailed,
        attempts: job.attempts,
      });
    }
  }
}

export async function processWhatsAppCallingWebhook(connection: ChannelConnection, change: any) {
  if (!isWhatsAppCallingGloballyEnabled()) return;
  const value = change?.value || {};
  if (value.call_permission || change.field === 'call_permission') {
    await updatePermissionFromWebhook(connection.id, connection.companyId!, value.call_permission || value);
  }
  for (const message of Array.isArray(value.messages) ? value.messages : []) {
    if (message?.interactive?.type === 'call_permission_reply' || message?.interactive?.call_permission_reply) {
      await updatePermissionFromWebhook(connection.id, connection.companyId!, message);
    }
  }
  const events = [
    ...(Array.isArray(value.calls) ? value.calls : []),
    ...(Array.isArray(value.call_statuses) ? value.call_statuses : []),
  ];
  for (const event of events) {
    const direction = String(event.direction || '').toLowerCase();
    const status = normalizedMetaStatus(event);
    if ((direction.includes('user') || direction === 'inbound') && status === 'ringing') await createInboundCall(connection, event);
    else await applyCallStatus(connection, event);
  }
}
