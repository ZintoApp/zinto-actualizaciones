import { z } from 'zod';
import { normalizeVoiceChannelConnectionData, type ChannelConnectionData } from './call-types';

export const callCapturePolicySchema = z.enum(['required', 'agent_choice', 'disabled']);
export type CallCapturePolicy = z.infer<typeof callCapturePolicySchema>;

export const whatsappInboundRoutingSchema = z.enum(['human_first', 'ai_first', 'human_only']);
export type WhatsAppInboundRouting = z.infer<typeof whatsappInboundRoutingSchema>;

export const whatsappCallingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  callButtonVisible: z.boolean().default(false),
  callbackPermissionEnabled: z.boolean().default(false),
  operatingHours: z.array(z.object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    enabled: z.boolean(),
  })).default([]),
  timezone: z.string().default('UTC'),
  inboundRouting: whatsappInboundRoutingSchema.default('human_first'),
  aiVoiceConnectionId: z.number().int().positive().nullable().default(null),
  recordingPolicy: callCapturePolicySchema.default('agent_choice'),
  recordingDefault: z.boolean().default(true),
  transcriptionPolicy: callCapturePolicySchema.default('agent_choice'),
  transcriptionDefault: z.boolean().default(true),
  eligibility: z.object({
    eligible: z.boolean().default(false),
    callingEnabledByMeta: z.boolean().default(false),
    messagingTier: z.string().nullable().default(null),
    restrictionCodes: z.array(z.string()).default([]),
    checkedAt: z.string().nullable().default(null),
  }).default({}),
}).default({});

export type WhatsAppCallingConfig = z.infer<typeof whatsappCallingConfigSchema>;

export function normalizeWhatsAppCallingConfig(value: unknown): WhatsAppCallingConfig {
  const parsed = whatsappCallingConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : whatsappCallingConfigSchema.parse({});
}

export interface CallChannelOption {
  id: number;
  channelType: 'twilio_voice' | 'whatsapp_official';
  displayName: string;
  enabled: boolean;
  disabledCode?: string;
  supportedCallTypes: Array<'direct' | 'ai-powered'>;
  supportsBrowserDirect: boolean;
  providerStack?: 'twilio-elevenlabs' | 'telnyx-vapi';
  recordingPolicy: CallCapturePolicy;
  recordingDefault: boolean;
  transcriptionPolicy: CallCapturePolicy;
  transcriptionDefault: boolean;
  whatsappPermission?: {
    status: 'unknown' | 'pending' | 'granted' | 'revoked' | 'expired';
    permissionType?: 'temporary' | 'permanent';
    expiresAt?: string | null;
    serviceWindowOpen?: boolean;
    canRequest?: boolean;
    canStart?: boolean;
    limits?: Array<{ timePeriod: string; maximum: number; used: number; resetsAt?: string | null }>;
  };
}

export const initiateCallRequestSchema = z.object({
  channelId: z.number().int().positive().optional(),
  callType: z.enum(['direct', 'ai-powered']).optional(),
  recording: z.boolean().optional(),
  transcription: z.boolean().optional(),
  sdpOffer: z.string().min(1).max(256_000).optional(),
});

export type InitiateCallRequest = z.infer<typeof initiateCallRequestSchema>;

export function resolveCaptureSelection(
  policy: CallCapturePolicy,
  defaultValue: boolean,
  requested: boolean | undefined,
): boolean {
  if (policy === 'required') return true;
  if (policy === 'disabled') return false;
  return requested ?? defaultValue;
}

export function canRequestWhatsAppCallPermission(history: Array<{ requestedAt: string | Date }>, at = new Date()) {
  const now = at.getTime();
  const recent = history.filter((entry) => new Date(entry.requestedAt).getTime() > now - 7 * 24 * 60 * 60 * 1000);
  return !recent.some((entry) => new Date(entry.requestedAt).getTime() > now - 24 * 60 * 60 * 1000) && recent.length < 2;
}

export function normalizeWhatsAppTranscript(raw: any) {
  const segments = Array.isArray(raw?.transcript?.segments)
    ? raw.transcript.segments
    : Array.isArray(raw?.segments)
      ? raw.segments
      : Array.isArray(raw) ? raw : [];
  return segments.map((segment: any) => ({
    speaker: segment.speaker || segment.role || 'unknown',
    startMs: Number(segment.start_ms ?? segment.start_time_ms ?? Number(segment.start ?? 0) * 1000),
    endMs: Number(segment.end_ms ?? segment.end_time_ms ?? Number(segment.end ?? 0) * 1000),
    text: String(segment.text || ''),
  }));
}

export function parseWhatsAppMessagingTier(value: unknown): number | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('UNLIMITED')) return Number.POSITIVE_INFINITY;
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(K|M)?/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return amount * (match[2] === 'M' ? 1_000_000 : match[2] === 'K' ? 1_000 : 1);
}

export function normalizeMetaCallPermission(payload: any, previousStatus?: string) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : payload;
  const permission = item?.permission || payload?.permission;
  const actions = Array.isArray(item?.actions) ? item.actions : Array.isArray(payload?.actions) ? payload.actions : [];
  const startCallAction = actions.find((action: any) => action?.action_name === 'start_call');
  const requestAction = actions.find((action: any) => action?.action_name === 'send_call_permission_request');
  const rawStatus = String(permission?.status || permission?.permission_status || item?.permission_status || '').toLowerCase();
  const explicitType = String(permission?.type || permission?.permission_type || '').toLowerCase();
  const permissionType = ['temporary', 'permanent'].includes(rawStatus)
    ? rawStatus as 'temporary' | 'permanent'
    : ['temporary', 'permanent'].includes(explicitType)
      ? explicitType as 'temporary' | 'permanent'
      : null;
  let status: 'unknown' | 'pending' | 'granted' | 'revoked' | 'expired' = 'unknown';
  if (startCallAction?.can_perform_action === true || permissionType) status = 'granted';
  else if (rawStatus === 'granted') status = 'granted';
  else if (rawStatus === 'revoked') status = 'revoked';
  else if (rawStatus === 'expired') status = 'expired';
  else if (rawStatus === 'pending' || (startCallAction?.can_perform_action === false && previousStatus === 'pending')) status = 'pending';

  const expiration = permission?.expiration_time ?? permission?.expiration_timestamp ?? item?.expiration_time;
  const expirationNumber = Number(expiration);
  const expiresAt = expiration
    ? new Date(Number.isFinite(expirationNumber) ? expirationNumber * 1000 : String(expiration))
    : null;
  const limits = (Array.isArray(requestAction?.limits) ? requestAction.limits : []).map((limit: any) => ({
    timePeriod: String(limit.time_period || ''),
    maximum: Number(limit.max_allowed || 0),
    used: Number(limit.current_usage || 0),
    resetsAt: limit.limit_expiration_time ? new Date(Number(limit.limit_expiration_time) * 1000).toISOString() : null,
  }));
  const canRequest = requestAction?.can_perform_action !== false;
  const canStart = startCallAction?.can_perform_action !== false;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { status: 'unknown' as const, permissionType, expiresAt: null, canRequest, canStart, limits };
  if (status === 'granted' && expiresAt && expiresAt.getTime() <= Date.now()) status = 'expired';
  return { status, permissionType, expiresAt, canRequest, canStart, limits };
}

export function buildWhatsAppAiGatewayProviderConfig(connectionData: ChannelConnectionData | null | undefined) {
  const data = normalizeVoiceChannelConnectionData(connectionData);
  return data.providerStack === 'telnyx-vapi'
    ? {
        provider: 'vapi' as const,
        providerConfig: { apiKey: data.vapiApiKey, assistantId: data.vapiAssistantId, transport: 'private-sip' as const },
      }
    : {
        provider: 'elevenlabs' as const,
        providerConfig: { apiKey: data.elevenLabsApiKey, agentId: data.elevenLabsAgentId, prompt: data.elevenLabsPrompt, transport: 'websocket' as const },
      };
}

export const WHATSAPP_CALL_ERROR_CODES = {
  disabled: 'WHATSAPP_CALLING_DISABLED',
  ineligible: 'WHATSAPP_CALLING_INELIGIBLE',
  coexistence: 'WHATSAPP_CALLING_COEXISTENCE_UNSUPPORTED',
  permissionRequired: 'WHATSAPP_CALL_PERMISSION_REQUIRED',
  permissionRateLimited: 'WHATSAPP_CALL_PERMISSION_RATE_LIMITED',
  alreadyClaimed: 'CALL_ALREADY_CLAIMED',
  capturePolicy: 'CAPTURE_POLICY_VIOLATION',
  invalidState: 'CALL_INVALID_STATE',
} as const;
