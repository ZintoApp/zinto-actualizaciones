export type CallType = 'direct' | 'ai-powered' | 'basic';
export type VoiceCallMode = 'basic' | 'ai-powered';
export type VoiceProviderStack = 'twilio-elevenlabs' | 'telnyx-vapi';

export const DEFAULT_VOICE_PROVIDER_STACK: VoiceProviderStack = 'twilio-elevenlabs';

export const VOICE_PROVIDER_STACK_OPTIONS: Array<{
  value: VoiceProviderStack;
  label: string;
  telephonyProvider: 'twilio' | 'telnyx';
  aiProvider: 'elevenlabs' | 'vapi';
}> = [
  {
    value: 'twilio-elevenlabs',
    label: 'Twilio + ElevenLabs',
    telephonyProvider: 'twilio',
    aiProvider: 'elevenlabs'
  },
  {
    value: 'telnyx-vapi',
    label: 'Telnyx + Vapi.ai',
    telephonyProvider: 'telnyx',
    aiProvider: 'vapi'
  }
];

export function normalizeVoiceProviderStack(providerStack?: unknown): VoiceProviderStack {
  return providerStack === 'telnyx-vapi' ? 'telnyx-vapi' : DEFAULT_VOICE_PROVIDER_STACK;
}

export function getVoiceProviderStackLabel(providerStack?: unknown): string {
  return normalizeVoiceProviderStack(providerStack) === 'telnyx-vapi'
    ? 'Telnyx + Vapi.ai'
    : 'Twilio + ElevenLabs';
}

export function getVoiceAiProviderLabel(providerStack?: unknown): string {
  return normalizeVoiceProviderStack(providerStack) === 'telnyx-vapi' ? 'Vapi.ai' : 'ElevenLabs';
}

export function getVoiceTelephonyProviderLabel(providerStack?: unknown): string {
  return normalizeVoiceProviderStack(providerStack) === 'telnyx-vapi' ? 'Telnyx' : 'Twilio';
}

export interface InitiateCallRequest {
  callType?: CallType;
}

export interface CallLogMetadata {
  hasElevenLabs?: boolean;
  callType?: CallType;
  userSelectedCallType?: boolean;
  providerStack?: VoiceProviderStack;
  [key: string]: any;
}

export interface ChannelConnectionData {
  providerStack?: VoiceProviderStack;

  // REST API credentials
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  
  // Voice SDK credentials
  apiKey?: string;
  apiSecret?: string;
  twimlAppSid?: string;

  // Telnyx configuration
  telnyxApiKey?: string;
  telnyxConnectionId?: string;
  /** Ed25519 public key from Telnyx for verifying Call Control webhooks (per Telnyx account / connection). */
  telnyxWebhookVerificationKey?: string;
  
  // Shared voice configuration
  callMode?: VoiceCallMode;
  webhookUrl?: string;
  statusCallbackUrl?: string;

  // ElevenLabs configuration
  elevenLabsApiKey?: string;
  elevenLabsAgentId?: string;
  elevenLabsAgentPhoneNumberId?: string;
  elevenLabsPostCallWebhookUrl?: string;
  elevenLabsWebhookSecret?: string;
  elevenLabsPrompt?: string;
  voiceId?: string;

  // Vapi.ai configuration
  vapiApiKey?: string;
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;

  [key: string]: any;
}

export type NormalizedVoiceChannelConnectionData = ChannelConnectionData & {
  providerStack: VoiceProviderStack;
  callMode: VoiceCallMode;
};

export function normalizeVoiceChannelConnectionData(
  connectionData?: Partial<ChannelConnectionData> | null
): NormalizedVoiceChannelConnectionData {
  const data = connectionData || {};
  return {
    ...data,
    providerStack: normalizeVoiceProviderStack(data.providerStack),
    callMode: data.callMode === 'ai-powered' ? 'ai-powered' : 'basic'
  };
}

export function hasAiProviderCredentials(connectionData?: Partial<ChannelConnectionData> | null): boolean {
  const data = normalizeVoiceChannelConnectionData(connectionData);
  if (data.providerStack === 'telnyx-vapi') {
    return !!(data.vapiApiKey && data.vapiAssistantId && data.vapiPhoneNumberId);
  }

  return !!(data.elevenLabsApiKey && (data.elevenLabsAgentId || data.elevenLabsPrompt));
}

export function supportsBrowserVoiceConnection(
  connectionDataOrProviderStack?: Partial<ChannelConnectionData> | VoiceProviderStack | null
): boolean {
  if (!connectionDataOrProviderStack) {
    return true;
  }

  if (typeof connectionDataOrProviderStack === 'string') {
    return normalizeVoiceProviderStack(connectionDataOrProviderStack) === 'twilio-elevenlabs';
  }

  return normalizeVoiceProviderStack(connectionDataOrProviderStack.providerStack) === 'twilio-elevenlabs';
}
