import { appSumoCompanyPolicy } from './appsumo-policy';
import type { Message } from '@shared/schema';
import { normalizeImageCaption } from '../utils/image-caption';
import { getEnvironmentKeyForProvider } from './ai-credential-env';

export interface ResolveFlowLanguageOptions {
  configuredLanguage?: string | null;
  inboundMessage?: Message;
  conversationHistory?: Message[];
  provider?: string;
  apiKey?: string;
  companyId?: number;
  enableImage?: boolean;
}

function parseMessageMetadataObject(message: Pick<Message, 'metadata'> | undefined): Record<string, unknown> {
  const rawMetadata = message?.metadata;
  if (!rawMetadata) return {};
  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
    ? { ...(rawMetadata as Record<string, unknown>) }
    : {};
}

function buildImageTextProjectionFromMessage(
  message: Pick<Message, 'content' | 'type' | 'metadata'>,
  options: { enableImage?: boolean } = {}
): string {
  if (message.type !== 'image') {
    return String(message.content || '').trim();
  }
  const baseText = normalizeImageCaption(message.content) || '';
  if (options.enableImage !== true) {
    return baseText;
  }
  const metadata = parseMessageMetadataObject(message);
  const imageAnalysis = (metadata.imageAnalysis && typeof metadata.imageAnalysis === 'object')
    ? metadata.imageAnalysis as Record<string, unknown>
    : null;
  const ocrText = typeof imageAnalysis?.ocrText === 'string' ? imageAnalysis.ocrText.trim() : '';
  const visualSummary = typeof imageAnalysis?.visualSummary === 'string' ? imageAnalysis.visualSummary.trim() : '';
  const uncertaintyNotes = typeof imageAnalysis?.uncertaintyNotes === 'string' ? imageAnalysis.uncertaintyNotes.trim() : '';
  const requiresClarification = Boolean(imageAnalysis?.requiresClarification);

  const parts = [
    baseText ? `Caption/context: ${baseText}` : '',
    ocrText ? `OCR text: ${ocrText}` : '',
    visualSummary ? `Visual summary: ${visualSummary}` : '',
    uncertaintyNotes ? `Uncertainty notes: ${uncertaintyNotes}` : '',
    requiresClarification ? 'Clarification needed: true' : ''
  ].filter(Boolean);
  return parts.join('\n');
}

function extractInboundMessageText(
  message: Pick<Message, 'content' | 'type' | 'direction' | 'metadata'>,
  enableImage?: boolean
): string {
  return buildImageTextProjectionFromMessage(message, { enableImage }) ||
    (message.type === 'image' ? normalizeImageCaption(message.content) || '' : message.content || '');
}

function findLatestInboundText(
  inboundMessage: Message | undefined,
  conversationHistory: Message[] | undefined,
  enableImage?: boolean
): string {
  if (inboundMessage) {
    const inboundText = extractInboundMessageText(inboundMessage, enableImage).trim();
    if (inboundText) {
      return inboundText;
    }
  }

  if (conversationHistory?.length) {
    for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
      const historyMessage = conversationHistory[index];
      if (historyMessage.direction !== 'inbound') {
        continue;
      }
      const historyText = extractInboundMessageText(historyMessage, enableImage).trim();
      if (historyText) {
        return historyText;
      }
    }
  }

  return '';
}

function normalizeLanguageCode(language: string): string {
  let normalized = language;
  if (normalized.includes('-')) {
    normalized = normalized.split('-')[0];
  }
  return normalized.toLowerCase();
}

async function detectLanguageFromInboundText(
  text: string,
  provider: string,
  apiKey: string,
  companyId?: number
): Promise<string> {
  let detectionApiKey = apiKey;
  if (!detectionApiKey && companyId) {
    try {
      const { aiCredentialsService } = await import('./ai-credentials-service');
      const credentialSource = await aiCredentialsService.getCredentialForCompany(companyId, provider);
      if (credentialSource) {
        detectionApiKey = credentialSource.apiKey;
      }
    } catch {
      // Fall through to environment key or simple detection.
    }
  }
  if (!detectionApiKey) {
    detectionApiKey = (await appSumoCompanyPolicy(companyId)).managed ? '' : getEnvironmentKeyForProvider(provider) || '';
  }

  const aiAssistantService = (await import('./ai-assistant')).default;
  const translationService = (aiAssistantService as { translationService?: { detectLanguage: (text: string, provider: string, apiKey: string) => Promise<string> } }).translationService;
  if (!translationService) {
    return 'en';
  }

  try {
    const detectedLang = await translationService.detectLanguage(text, provider, detectionApiKey);
    return detectedLang && detectedLang !== 'unknown' ? detectedLang : 'en';
  } catch (error) {
    console.error('Error detecting flow language:', error);
    return 'en';
  }
}

export async function resolveFlowLanguage(options: ResolveFlowLanguageOptions): Promise<string> {
  const {
    configuredLanguage,
    inboundMessage,
    conversationHistory,
    provider = 'openai',
    apiKey = '',
    companyId,
    enableImage,
  } = options;

  const rawLanguage = typeof configuredLanguage === 'string' ? configuredLanguage.trim() : '';
  let language = rawLanguage;

  if (!language || language === 'auto') {
    const messageContent = findLatestInboundText(inboundMessage, conversationHistory, enableImage);
    if (messageContent.trim()) {
      language = await detectLanguageFromInboundText(messageContent, provider, apiKey, companyId);
    } else {
      language = 'en';
    }
  }

  return normalizeLanguageCode(language);
}

export async function resolveFlowLanguageFromNodeData(options: {
  nodeData: Record<string, unknown>;
  preferZohoLanguage?: boolean;
  inboundMessage?: Message;
  conversationHistory?: Message[];
  companyId?: number;
}): Promise<string> {
  const { nodeData, preferZohoLanguage, inboundMessage, conversationHistory, companyId } = options;
  const zohoLanguage = typeof nodeData.zohoCalendarLanguage === 'string' ? nodeData.zohoCalendarLanguage.trim() : '';
  const nodeLanguage = typeof nodeData.language === 'string' ? nodeData.language.trim() : '';
  const configuredLanguage = preferZohoLanguage
    ? (zohoLanguage || nodeLanguage)
    : nodeLanguage;

  return resolveFlowLanguage({
    configuredLanguage,
    inboundMessage,
    conversationHistory,
    provider: typeof nodeData.provider === 'string' ? nodeData.provider : 'openai',
    apiKey: typeof nodeData.apiKey === 'string' ? nodeData.apiKey : '',
    companyId,
    enableImage: nodeData.enableImage === true,
  });
}
