import {
  normalizeVoiceProviderStack,
  normalizeVoiceChannelConnectionData,
  type ChannelConnectionData,
  type VoiceProviderStack,
} from '@shared/types/call-types';

export type CallAgentNodeConfigMode = 'agentId' | 'customPrompt';

export function resolveCallAgentNodeConfigMode(input: {
  agentConfigMode?: unknown;
  elevenLabsAgentId?: unknown;
}): CallAgentNodeConfigMode {
  if (input.agentConfigMode === 'agentId' || input.agentConfigMode === 'customPrompt') {
    return input.agentConfigMode;
  }

  return typeof input.elevenLabsAgentId === 'string' && input.elevenLabsAgentId.trim()
    ? 'agentId'
    : 'customPrompt';
}

export function buildCallAgentVoiceConnectionData(input: {
  providerStack?: VoiceProviderStack | string | null;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  fromNumber?: string;
  telnyxApiKey?: string;
  telnyxConnectionId?: string;
  elevenLabsApiKey?: string;
  elevenLabsAgentId?: string;
  elevenLabsPrompt?: string;
  customAgentPrompt?: string;
  agentConfigMode?: unknown;
  voiceId?: string;
  voiceSettings?: { voiceId?: string } | null;
  webhookUrl?: string;
  statusCallbackUrl?: string;
  vapiApiKey?: string;
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;
}): ChannelConnectionData {
  const agentConfigMode = resolveCallAgentNodeConfigMode(input);
  const prompt = (input.elevenLabsPrompt || input.customAgentPrompt || '').trim();
  const agentId = (input.elevenLabsAgentId || '').trim();

  return normalizeVoiceChannelConnectionData({
    providerStack: normalizeVoiceProviderStack(input.providerStack),
    callMode: 'ai-powered',
    accountSid: input.twilioAccountSid?.trim(),
    authToken: input.twilioAuthToken?.trim(),
    fromNumber: (input.fromNumber || input.twilioFromNumber || '').trim(),
    telnyxApiKey: input.telnyxApiKey?.trim(),
    telnyxConnectionId: input.telnyxConnectionId?.trim(),
    elevenLabsApiKey: input.elevenLabsApiKey?.trim(),
    elevenLabsAgentId: agentConfigMode === 'agentId' ? agentId : undefined,
    elevenLabsPrompt: agentConfigMode === 'customPrompt' ? prompt : undefined,
    voiceId: input.voiceId?.trim() || input.voiceSettings?.voiceId?.trim(),
    webhookUrl: input.webhookUrl?.trim(),
    statusCallbackUrl: input.statusCallbackUrl?.trim(),
    vapiApiKey: input.vapiApiKey?.trim(),
    vapiAssistantId: input.vapiAssistantId?.trim(),
    vapiPhoneNumberId: input.vapiPhoneNumberId?.trim(),
  });
}

