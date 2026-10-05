import {
  type ChannelConnectionData,
  type VoiceCallMode,
  type VoiceProviderStack,
  normalizeVoiceChannelConnectionData,
} from '@shared/types/call-types';

export const SID_PATTERNS = {
  accountSid: { prefix: 'AC', length: 34, label: 'Account SID' },
  apiKey: { prefix: 'SK', length: 34, label: 'API Key' },
  twimlAppSid: { prefix: 'AP', length: 34, label: 'TwiML App SID' },
} as const;

export interface VoiceConnectionFormData {
  providerStack: VoiceProviderStack;
  accountName: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
  telnyxApiKey: string;
  telnyxConnectionId: string;
  callMode: VoiceCallMode;
  elevenLabsApiKey: string;
  elevenLabsAgentId: string;
  elevenLabsAgentPhoneNumberId: string;
  elevenLabsPostCallWebhookUrl: string;
  elevenLabsWebhookSecret: string;
  elevenLabsPrompt: string;
  voiceId: string;
  audioFormat: 'ulaw_8000' | 'pcm_8000' | 'pcm_16000';
  webhookUrl: string;
  statusCallbackUrl: string;
  vapiApiKey: string;
  vapiAssistantId: string;
  vapiPhoneNumberId: string;
  /** Telnyx Ed25519 webhook verification public key (per Telnyx account). */
  telnyxWebhookVerificationKey: string;
}

/** Label for the single Telnyx Call Control event URL field (direct PSTN calls). */
export const TELNYX_VOICE_EVENT_WEBHOOK_LABEL = 'Telnyx voice event webhook URL';

export function getDefaultVoiceWebhookValues(origin: string, providerStack: VoiceProviderStack) {
  const elevenLabsPostCallWebhookUrl = `${origin}/api/webhooks/elevenlabs/post-call`;
  if (providerStack === 'telnyx-vapi') {
    return {
      webhookUrl: `${origin}/api/webhooks/telnyx/voice`,
      statusCallbackUrl: '',
      elevenLabsPostCallWebhookUrl
    };
  }
  return {
    webhookUrl: providerStack === 'twilio-elevenlabs' ? `${origin}/api/webhooks/twilio/voice` : '',
    statusCallbackUrl: providerStack === 'twilio-elevenlabs' ? `${origin}/api/webhooks/twilio/voice-status` : '',
    elevenLabsPostCallWebhookUrl
  };
}

export function getTwimlAppVoiceUrl(origin: string): string {
  return `${origin}/api/twilio/voice-app-twiml`;
}

/** Lowercases and strips surrounding brackets from IPv6 hostnames (e.g. [::1] → ::1). */
export function normalizeHostnameForLocalhostCheck(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  return h;
}

/**
 * True for loopback / local-only hosts: `localhost`, any `*.localhost` (RFC 6761),
 * IPv4 loopback, and IPv6 loopback (including bracketed forms after normalization).
 */
export function isLocalhostHostname(hostname: string): boolean {
  const h = normalizeHostnameForLocalhostCheck(hostname);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '127.0.0.1') return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '::ffff:127.0.0.1') return true;
  return false;
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    return isLocalhostHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** True when the URL's host is localhost-style (same rules as {@link isLocalhostOrigin}). */
export function isWebhookUrlHostLocalhost(urlString: string): boolean {
  try {
    return isLocalhostHostname(new URL(urlString).hostname);
  } catch {
    return false;
  }
}

/** Webhook / status URLs to validate for format and external reachability for the active stack. */
export function getActiveVoiceWebhookUrlFields(form: VoiceConnectionFormData): string[] {
  const urls: string[] = [];
  if (form.providerStack === 'twilio-elevenlabs') {
    urls.push(form.webhookUrl, form.statusCallbackUrl);
    if (form.callMode === 'ai-powered') {
      urls.push(form.elevenLabsPostCallWebhookUrl);
    }
  } else if (form.providerStack === 'telnyx-vapi') {
    urls.push(form.webhookUrl);
  } else {
    urls.push(form.webhookUrl, form.statusCallbackUrl);
  }
  return urls;
}

/** Returns a translation key (settings.voiceConnectionForm.validation.*) or null if valid. */
export function validateSidFormat(
  value: string,
  pattern: (typeof SID_PATTERNS)[keyof typeof SID_PATTERNS]
): string | null {
  const v = value.trim();
  if (v.length === pattern.length && v.startsWith(pattern.prefix)) return null;
  if (pattern.prefix === SID_PATTERNS.accountSid.prefix) {
    return 'settings.voiceConnectionForm.validation.accountSidFormat';
  }
  if (pattern.prefix === SID_PATTERNS.apiKey.prefix) {
    return 'settings.voiceConnectionForm.validation.apiKeyFormat';
  }
  return 'settings.voiceConnectionForm.validation.twimlAppSidFormat';
}

export function createDefaultVoiceConnectionFormData(origin: string): VoiceConnectionFormData {
  const defaults = getDefaultVoiceWebhookValues(origin, 'twilio-elevenlabs');
  return {
    providerStack: 'twilio-elevenlabs',
    accountName: '',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    apiKey: '',
    apiSecret: '',
    twimlAppSid: '',
    telnyxApiKey: '',
    telnyxConnectionId: '',
    callMode: 'basic',
    elevenLabsApiKey: '',
    elevenLabsAgentId: '',
    elevenLabsAgentPhoneNumberId: '',
    elevenLabsPostCallWebhookUrl: defaults.elevenLabsPostCallWebhookUrl,
    elevenLabsWebhookSecret: '',
    elevenLabsPrompt: '',
    voiceId: '',
    audioFormat: 'ulaw_8000',
    webhookUrl: defaults.webhookUrl,
    statusCallbackUrl: defaults.statusCallbackUrl,
    vapiApiKey: '',
    vapiAssistantId: '',
    vapiPhoneNumberId: '',
    telnyxWebhookVerificationKey: ''
  };
}

export function parseVoiceConnectionFormData(input: unknown, accountName = '', origin: string): VoiceConnectionFormData {
  const connectionData = normalizeVoiceChannelConnectionData(input as ChannelConnectionData | undefined);
  const defaults = getDefaultVoiceWebhookValues(origin, connectionData.providerStack);
  const primaryWebhook = (connectionData.webhookUrl ?? '').trim();
  const legacyStatusAsTelnyxUrl = (connectionData.statusCallbackUrl ?? '').trim();
  const resolvedWebhookUrl =
    connectionData.providerStack === 'telnyx-vapi'
      ? primaryWebhook || legacyStatusAsTelnyxUrl || defaults.webhookUrl
      : connectionData.webhookUrl || defaults.webhookUrl;
  const resolvedStatusCallbackUrl =
    connectionData.providerStack === 'telnyx-vapi'
      ? ''
      : connectionData.statusCallbackUrl || defaults.statusCallbackUrl;
  return {
    ...createDefaultVoiceConnectionFormData(origin),
    providerStack: connectionData.providerStack,
    accountName,
    accountSid: connectionData.accountSid || '',
    authToken: connectionData.authToken || '',
    fromNumber: connectionData.fromNumber || '',
    apiKey: connectionData.apiKey || '',
    apiSecret: connectionData.apiSecret || '',
    twimlAppSid: connectionData.twimlAppSid || '',
    telnyxApiKey: connectionData.telnyxApiKey || '',
    telnyxConnectionId: connectionData.telnyxConnectionId || '',
    callMode: connectionData.callMode || 'basic',
    elevenLabsApiKey: connectionData.elevenLabsApiKey || '',
    elevenLabsAgentId: connectionData.elevenLabsAgentId || '',
    elevenLabsAgentPhoneNumberId: connectionData.elevenLabsAgentPhoneNumberId || '',
    elevenLabsPostCallWebhookUrl: connectionData.elevenLabsPostCallWebhookUrl || defaults.elevenLabsPostCallWebhookUrl,
    elevenLabsWebhookSecret: connectionData.elevenLabsWebhookSecret || '',
    elevenLabsPrompt: connectionData.elevenLabsPrompt || '',
    voiceId: connectionData.voiceId || '',
    audioFormat: connectionData.audioFormat || 'ulaw_8000',
    webhookUrl: resolvedWebhookUrl,
    statusCallbackUrl: resolvedStatusCallbackUrl,
    vapiApiKey: connectionData.vapiApiKey || '',
    vapiAssistantId: connectionData.vapiAssistantId || '',
    vapiPhoneNumberId: connectionData.vapiPhoneNumberId || '',
    telnyxWebhookVerificationKey: connectionData.telnyxWebhookVerificationKey || ''
  };
}

export function buildVoiceConnectionDataPayload(form: VoiceConnectionFormData): ChannelConnectionData {
  const base: ChannelConnectionData = {
    providerStack: form.providerStack,
    accountSid: form.accountSid,
    authToken: form.authToken,
    fromNumber: form.fromNumber,
    apiKey: form.apiKey,
    apiSecret: form.apiSecret,
    twimlAppSid: form.twimlAppSid,
    telnyxApiKey: form.telnyxApiKey,
    telnyxConnectionId: form.telnyxConnectionId,
    telnyxWebhookVerificationKey: form.telnyxWebhookVerificationKey,
    webhookUrl: form.webhookUrl,
    statusCallbackUrl: form.statusCallbackUrl,
    callMode: form.callMode,
    elevenLabsApiKey: form.elevenLabsApiKey,
    elevenLabsAgentId: form.elevenLabsAgentId,
    elevenLabsAgentPhoneNumberId: form.elevenLabsAgentPhoneNumberId,
    elevenLabsPostCallWebhookUrl: form.elevenLabsPostCallWebhookUrl,
    elevenLabsWebhookSecret: form.elevenLabsWebhookSecret,
    elevenLabsPrompt: form.elevenLabsPrompt,
    voiceId: form.voiceId,
    audioFormat: form.audioFormat,
    vapiApiKey: form.vapiApiKey,
    vapiAssistantId: form.vapiAssistantId,
    vapiPhoneNumberId: form.vapiPhoneNumberId,
  };
  if (form.providerStack === 'telnyx-vapi') {
    const w = form.webhookUrl.trim();
    return normalizeVoiceChannelConnectionData({
      ...base,
      webhookUrl: w,
      statusCallbackUrl: ''
    });
  }
  return normalizeVoiceChannelConnectionData(base);
}

/** Returns a translation key under `settings.voiceConnectionForm.validation.*`, or null if valid. */
export function validateVoiceConnectionForm(form: VoiceConnectionFormData): string | null {
  if (!form.accountName.trim() || !form.fromNumber.trim()) {
    return 'settings.voiceConnectionForm.validation.nameAndFromRequired';
  }
  if (!/^\+[1-9]\d{5,14}$/.test(form.fromNumber.trim())) {
    return 'settings.voiceConnectionForm.validation.fromNumberE164';
  }
  if (form.providerStack === 'twilio-elevenlabs') {
    if (!form.accountSid.trim() || !form.authToken.trim()) {
      return 'settings.voiceConnectionForm.validation.twilioSidTokenRequired';
    }
    const accountSidErr = validateSidFormat(form.accountSid, SID_PATTERNS.accountSid);
    if (accountSidErr) return accountSidErr;
    if (!form.apiKey.trim() || !form.apiSecret.trim() || !form.twimlAppSid.trim()) {
      return 'settings.voiceConnectionForm.validation.twilioVoiceSdkRequired';
    }
    const apiKeyErr = validateSidFormat(form.apiKey, SID_PATTERNS.apiKey);
    if (apiKeyErr) return apiKeyErr;
    const twimlErr = validateSidFormat(form.twimlAppSid, SID_PATTERNS.twimlAppSid);
    if (twimlErr) return twimlErr;
    if (form.callMode === 'ai-powered') {
      if (!form.elevenLabsApiKey.trim()) {
        return 'settings.voiceConnectionForm.validation.elevenLabsKeyRequired';
      }
      if (!form.elevenLabsAgentId.trim() && !form.elevenLabsPrompt.trim()) {
        return 'settings.voiceConnectionForm.validation.elevenLabsAgentOrPrompt';
      }
      if (form.elevenLabsAgentId.trim() && !form.elevenLabsAgentPhoneNumberId.trim()) {
        return 'settings.voiceConnectionForm.validation.elevenLabsAgentPhoneIdRequired';
      }
    }
  } else {
    if (!form.telnyxApiKey.trim()) {
      return 'settings.voiceConnectionForm.validation.telnyxApiKeyRequired';
    }
    if (form.callMode === 'ai-powered' && (!form.vapiApiKey.trim() || !form.vapiAssistantId.trim() || !form.vapiPhoneNumberId.trim())) {
      return 'settings.voiceConnectionForm.validation.vapiAiPoweredRequired';
    }
  }
  const webhookUrls = getActiveVoiceWebhookUrlFields(form);
  for (const url of webhookUrls) {
    if (url?.trim()) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
          return 'settings.voiceConnectionForm.validation.webhookHttps';
        }
      } catch {
        return 'settings.voiceConnectionForm.validation.webhookInvalidUrl';
      }
    }
  }
  for (const url of webhookUrls) {
    if (url?.trim() && isWebhookUrlHostLocalhost(url)) {
      return 'settings.voiceConnectionForm.validation.webhookLocalhost';
    }
  }
  return null;
}

