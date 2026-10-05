import axios from 'axios';
import type { CallAgentConfig } from './call-agent-service';
import { initiateOutboundCall, initiateOutboundCallViaElevenLabs } from './call-agent-service';
import {
  type CallType,
  type ChannelConnectionData,
  type VoiceProviderStack,
  hasAiProviderCredentials,
  normalizeVoiceChannelConnectionData,
  supportsBrowserVoiceConnection
} from '@shared/types/call-types';
import { buildCallRecordingFields } from '@shared/schema';

export interface VoiceChannelConnectionLike {
  id: number;
  companyId: number;
  channelType: string;
  status: string;
  accountId?: string | null;
  accountName?: string | null;
  connectionData?: ChannelConnectionData | null;
}

export interface VoiceCallDispatchResult {
  providerStack: VoiceProviderStack;
  telephonyProvider: 'twilio' | 'telnyx';
  callType: 'direct' | 'ai-powered';
  callSid: string;
  from: string;
  to: string;
  startTime: Date;
  metadata: Record<string, any>;
  conferenceName?: string;
  supportsBrowserDirect: boolean;
  providerResponse?: Record<string, any>;
}

export function getActiveVoiceConnections(connections: VoiceChannelConnectionLike[]) {
  return connections
    .filter(conn => conn.channelType === 'twilio_voice' && conn.status === 'active')
    .map(conn => ({ ...conn, connectionData: normalizeVoiceChannelConnectionData(conn.connectionData) }));
}

export function getPreferredVoiceConnection(connections: VoiceChannelConnectionLike[]) {
  return getActiveVoiceConnections(connections)[0] || null;
}

export function resolveEffectiveVoiceCallType(
  connectionData?: ChannelConnectionData | null,
  requestedCallType?: CallType
): 'direct' | 'ai-powered' {
  if (requestedCallType === 'ai-powered') {
    return 'ai-powered';
  }
  if (requestedCallType === 'direct') {
    return 'direct';
  }
  return normalizeVoiceChannelConnectionData(connectionData).callMode === 'ai-powered' ? 'ai-powered' : 'direct';
}

export function buildVoiceConnectionDisplayName(connection?: VoiceChannelConnectionLike | null) {
  return connection?.accountName || connection?.accountId || `Voice channel ${connection?.id ?? ''}`.trim();
}

export function getVoiceConnectionCredentialError(connectionData?: ChannelConnectionData | null) {
  const data = normalizeVoiceChannelConnectionData(connectionData);
  if (!data.fromNumber) {
    return 'A voice channel from-number is required.';
  }

  if (data.providerStack === 'telnyx-vapi') {
    if (!data.telnyxApiKey) {
      return 'Telnyx API key is required.';
    }
    return null;
  }

  if (!data.accountSid || !data.authToken) {
    return 'Twilio Account SID and Auth Token are required.';
  }

  return null;
}

/**
 * Single effective callback URL for Telnyx direct outbound calls (`webhook_url` on dial).
 * Prefers `webhookUrl`; falls back to legacy `statusCallbackUrl` when present.
 */
export function getEffectiveTelnyxVoiceWebhookUrl(connectionData?: ChannelConnectionData | null): string {
  const d = normalizeVoiceChannelConnectionData(connectionData);
  const primary = (d.webhookUrl ?? '').trim();
  if (primary) return primary;
  return (d.statusCallbackUrl ?? '').trim();
}

/**
 * Persists Telnyx webhook URL in the canonical `webhookUrl` field and clears legacy `statusCallbackUrl`
 * so later edits do not depend on hidden duplicate state.
 */
export function normalizeTelnyxVoiceConnectionForPersist(
  connectionData: ChannelConnectionData | null | undefined
): ChannelConnectionData {
  const d = normalizeVoiceChannelConnectionData(connectionData);
  if (d.providerStack !== 'telnyx-vapi') {
    return d;
  }
  const effective = getEffectiveTelnyxVoiceWebhookUrl(d);
  return {
    ...d,
    webhookUrl: effective,
    statusCallbackUrl: ''
  };
}

export function getAiVoiceConfigurationError(connectionData?: ChannelConnectionData | null) {
  const data = normalizeVoiceChannelConnectionData(connectionData);
  if (!hasAiProviderCredentials(data)) {
    return data.providerStack === 'telnyx-vapi'
      ? 'Vapi.ai API key, assistant ID, and phone number ID are required for AI-powered calls.'
      : 'ElevenLabs API key plus an agent ID or prompt are required for AI-powered calls.';
  }

  if (data.providerStack === 'twilio-elevenlabs' && data.elevenLabsAgentId && !data.elevenLabsAgentPhoneNumberId) {
    return 'ElevenLabs Agent Phone Number ID is required when using an ElevenLabs agent for outbound calls.';
  }

  return null;
}

async function initiateOutboundCallViaTelnyx(options: {
  to: string;
  from: string;
  apiKey: string;
  connectionId?: string;
  webhookUrl?: string;
}) {
  const response = await axios.post(
    'https://api.telnyx.com/v2/calls',
    {
      to: options.to,
      from: options.from,
      connection_id: options.connectionId || undefined,
      webhook_url: options.webhookUrl || undefined
    },
    {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const call = response.data?.data || {};
  return {
    callSid: call.call_control_id || call.call_leg_id || call.id,
    providerResponse: response.data
  };
}

async function initiateOutboundCallViaVapi(options: {
  to: string;
  from: string;
  apiKey: string;
  assistantId: string;
  phoneNumberId: string;
}) {
  const response = await axios.post(
    'https://api.vapi.ai/call/phone',
    {
      assistantId: options.assistantId,
      phoneNumberId: options.phoneNumberId,
      customer: { number: options.to },
      assistantOverrides: { variableValues: { businessNumber: options.from } }
    },
    {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const call = response.data || {};
  return {
    callSid: call.id || call.call?.id,
    providerResponse: response.data
  };
}

export async function dispatchVoiceCall(params: {
  connection: VoiceChannelConnectionLike;
  to: string;
  from: string;
  requestedCallType?: CallType;
  twilioConfigFactory: () => CallAgentConfig;
  webhookBaseUrl: string;
  /** When omitted, defaults to true (matches conversation quick-call behavior). */
  recordCall?: boolean;
}) {
  const connectionData = normalizeVoiceChannelConnectionData(params.connection.connectionData);
  const providerStack = connectionData.providerStack;
  const callType = resolveEffectiveVoiceCallType(connectionData, params.requestedCallType);
  const recordCallFlag = params.recordCall !== false;

  if (callType === 'ai-powered') {
    if (providerStack === 'telnyx-vapi') {
      const result = await initiateOutboundCallViaVapi({
        to: params.to,
        from: params.from,
        apiKey: connectionData.vapiApiKey || '',
        assistantId: connectionData.vapiAssistantId || '',
        phoneNumberId: connectionData.vapiPhoneNumberId || ''
      });
      return {
        ...result,
        from: params.from,
        to: params.to,
        startTime: new Date(),
        metadata: {
          providerResponse: result.providerResponse,
          callType: 'ai-powered',
          ...buildCallRecordingFields({
            recordCall: recordCallFlag,
            telephonyProvider: 'telnyx',
            callType: 'ai-powered'
          })
        },
        providerStack,
        callType,
        telephonyProvider: 'telnyx',
        supportsBrowserDirect: false
      } satisfies VoiceCallDispatchResult;
    }

    if (connectionData.elevenLabsAgentId && connectionData.elevenLabsAgentPhoneNumberId) {
      const result = await initiateOutboundCallViaElevenLabs(
        connectionData.elevenLabsApiKey || '',
        connectionData.elevenLabsAgentId,
        connectionData.elevenLabsAgentPhoneNumberId,
        params.to,
        params.from
      );
      return {
        ...result,
        providerStack,
        callType,
        telephonyProvider: 'twilio',
        supportsBrowserDirect: true,
        metadata: {
          ...result.metadata,
          ...buildCallRecordingFields({
            recordCall: recordCallFlag,
            telephonyProvider: 'twilio',
            callType: 'ai-powered',
            elevenLabsNativeOutbound: true
          })
        }
      } satisfies VoiceCallDispatchResult;
    }
  }

  if (providerStack === 'telnyx-vapi') {
    const result = await initiateOutboundCallViaTelnyx({
      to: params.to,
      from: params.from,
      apiKey: connectionData.telnyxApiKey || '',
      connectionId: connectionData.telnyxConnectionId,
      webhookUrl: getEffectiveTelnyxVoiceWebhookUrl(connectionData) || undefined
    });
    return {
      ...result,
      from: params.from,
      to: params.to,
      startTime: new Date(),
      metadata: {
        providerResponse: result.providerResponse,
        callType: 'direct',
        ...buildCallRecordingFields({
          recordCall: recordCallFlag,
          telephonyProvider: 'telnyx',
          callType: 'direct'
        })
      },
      providerStack,
      callType: 'direct',
      telephonyProvider: 'telnyx',
      supportsBrowserDirect: false
    } satisfies VoiceCallDispatchResult;
  }

  const result = await initiateOutboundCall(params.twilioConfigFactory(), params.webhookBaseUrl);
  return {
    ...result,
    providerStack,
    callType,
    telephonyProvider: 'twilio',
    supportsBrowserDirect: supportsBrowserVoiceConnection(connectionData),
    metadata: {
      ...result.metadata,
      ...buildCallRecordingFields({
        recordCall: recordCallFlag,
        telephonyProvider: 'twilio',
        callType
      })
    }
  } satisfies VoiceCallDispatchResult;
}

export function getExpectedTwimlAppVoiceUrl(baseUrl: string): string {
  return `${baseUrl}/api/twilio/voice-app-twiml`;
}

export async function validateWebhookReachability(url: string): Promise<{
  reachable: boolean;
  statusCode?: number;
  error?: string;
}> {
  try {
    const res = await axios.head(url, { timeout: 5000, validateStatus: () => true });
    const statusCode = res.status;
    const reachable = statusCode < 500;
    if (reachable) {
      return { reachable: true, statusCode };
    }
    return { reachable: false, statusCode, error: `HTTP ${statusCode}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, error: message };
  }
}
