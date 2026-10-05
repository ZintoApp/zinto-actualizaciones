import type { Message } from '@shared/schema';

function isLocalMediaReference(value: string): boolean {
  return value.startsWith('/media/') || value.startsWith('media/') || value.startsWith('/');
}

export function getConversationMessageMetadata(message: Partial<Message>): string | null {
  if (message.metadata) {
    let metadataObject: Record<string, unknown> | null = null;
    if (typeof message.metadata === 'string') {
      try {
        const parsed = JSON.parse(message.metadata);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadataObject = parsed as Record<string, unknown>;
        }
      } catch {
        metadataObject = null;
      }
    } else if (typeof message.metadata === 'object' && !Array.isArray(message.metadata)) {
      metadataObject = message.metadata as Record<string, unknown>;
    }

    if (metadataObject) {
      const scopedMetadata: Record<string, unknown> = {};
      if (metadataObject.imageAnalysis && typeof metadataObject.imageAnalysis === 'object') {
        scopedMetadata.imageAnalysis = metadataObject.imageAnalysis;
      }
      if (typeof metadataObject.transcription === 'string' && metadataObject.transcription.trim()) {
        scopedMetadata.transcription = metadataObject.transcription;
      }
      const mediaTypeFromMetadata = typeof metadataObject.mediaType === 'string' ? metadataObject.mediaType : undefined;
      const mediaUrlFromMetadata = typeof metadataObject.mediaUrl === 'string' ? metadataObject.mediaUrl : undefined;
      const mediaUrlFromMessage = typeof message.mediaUrl === 'string' ? message.mediaUrl : undefined;
      const mediaUrl = mediaUrlFromMetadata || mediaUrlFromMessage;
      const audioPath = typeof metadataObject.audioPath === 'string' ? metadataObject.audioPath : undefined;
      const audioSeconds = (metadataObject.whatsappMessage &&
        typeof metadataObject.whatsappMessage === 'object' &&
        (metadataObject.whatsappMessage as { message?: { audioMessage?: { seconds?: unknown } } }).message?.audioMessage?.seconds);
      const hasAudioDuration = typeof audioSeconds === 'number' && Number.isFinite(audioSeconds) && audioSeconds >= 0;
      const isAudioMessage = message.type === 'audio' || mediaTypeFromMetadata === 'audio' || hasAudioDuration;

      if (isAudioMessage) {
        scopedMetadata.mediaType = 'audio';
        if (typeof mediaUrl === 'string' && mediaUrl.trim()) {
          scopedMetadata.mediaUrl = mediaUrl;
        }
        if (audioPath && (!mediaUrl || !isLocalMediaReference(mediaUrl))) {
          scopedMetadata.audioPath = audioPath;
        }
        if (hasAudioDuration) {
          scopedMetadata.whatsappMessage = {
            message: {
              audioMessage: {
                seconds: audioSeconds
              }
            }
          };
        }
      }
      if (Object.keys(scopedMetadata).length > 0) {
        return JSON.stringify(scopedMetadata);
      }
    }
  }

  if (message.mediaUrl) {
    return JSON.stringify({
      mediaUrl: message.mediaUrl,
      mediaType: message.type
    });
  }

  return null;
}

export function buildAIAssistantContextMessage(
  originalMessage: Partial<Message> | null | undefined,
  content: string,
  conversationId: number
): Message {
  const baseMessage: Message = {
    id: 0,
    content,
    type: 'text',
    direction: 'inbound',
    status: 'delivered',
    createdAt: new Date(),
    conversationId,
    mediaUrl: null,
    externalId: null,
    senderId: null,
    senderType: null,
    isFromBot: false,
    metadata: null,
    sentAt: null,
    readAt: null,
    groupParticipantJid: null,
    groupParticipantName: null,
    emailMessageId: null,
    emailInReplyTo: null,
    emailReferences: null,
    emailSubject: null,
    emailFrom: null,
    emailTo: null,
    emailCc: null,
    emailBcc: null,
    emailHtml: null,
    emailPlainText: null,
    emailHeaders: null,
    isHistorySync: false,
    historySyncBatchId: null,
    anonymizedAt: null,
    anonymizationReason: null
  };

  const mergedMessage = originalMessage ? { ...baseMessage, ...originalMessage } : baseMessage;

  return {
    ...mergedMessage,
    content,
    conversationId,
    type: mergedMessage.type || 'text',
    direction: mergedMessage.direction || 'inbound',
    status: mergedMessage.status || 'delivered',
    createdAt: mergedMessage.createdAt || new Date(),
    mediaUrl: mergedMessage.mediaUrl ?? null,
    metadata: mergedMessage.metadata ?? null,
    isFromBot: false
  };
}

export function resolveVoiceProcessingEnabled(
  enableVoiceProcessing: boolean | undefined,
  provider: string | undefined
): boolean {
  if (enableVoiceProcessing !== undefined) {
    return enableVoiceProcessing;
  }

  return (provider || 'openai').toLowerCase() === 'openai' || (provider || '').toLowerCase() === 'azure';
}

export function buildAIAssistantTextToSpeechConfig(data: Record<string, any>) {
  return {
    enableTextToSpeech: data.enableTextToSpeech || false,
    ttsProvider: data.ttsProvider || 'openai',
    ttsVoice: data.ttsVoice || 'alloy',
    voiceResponseMode: data.voiceResponseMode || 'always',
    elevenLabsApiKey: data.elevenLabsApiKey,
    elevenLabsVoiceId: data.elevenLabsVoiceId,
    elevenLabsCustomVoiceId: data.elevenLabsCustomVoiceId,
    elevenLabsModel: data.elevenLabsModel || 'eleven_multilingual_v2',
    elevenLabsStability: data.elevenLabsStability ?? 0.5,
    elevenLabsSimilarityBoost: data.elevenLabsSimilarityBoost ?? 0.75,
    elevenLabsStyle: data.elevenLabsStyle ?? 0.0,
    elevenLabsUseSpeakerBoost: data.elevenLabsUseSpeakerBoost ?? true,
    elevenLabsPromptInfluence: data.elevenLabsPromptInfluence,
    elevenLabsEnableAudioTags: data.elevenLabsEnableAudioTags,
    elevenLabsAudioTagsInstructions: data.elevenLabsAudioTagsInstructions
  };
}

export function resolveAIAssistantAudioHistoryContent(
  responseText: string | null | undefined
): string {
  const trimmedResponseText = responseText?.trim();
  return trimmedResponseText || 'Voice message';
}