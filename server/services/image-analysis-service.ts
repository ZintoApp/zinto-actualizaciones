import { assertAppSumoAccess } from './appsumo-policy';
import OpenAI from 'openai';
import axios from 'axios';
import { lookup as dnsLookup } from 'dns/promises';
import * as fs from 'fs/promises';
import http from 'http';
import https from 'https';
import net from 'net';
import mime from 'mime-types';
import sharp from 'sharp';
import { storage } from '../storage';
import { aiCredentialsService, azureConnectionFromCredentialSource } from './ai-credentials-service';
import { createAzureOpenAIRestClient } from './azure-openai';
import { downloadAndSaveMedia, getConnection as getWhatsAppConnection } from './channels/whatsapp';
import { downloadAndSaveMedia as downloadWhatsAppOfficialMedia } from './channels/whatsapp-official';
import { downloadTelegramMediaToPublicFile } from './channels/telegram';
import { downloadInstagramMedia } from './channels/instagram';
import { isPlaceholderMediaUrl, isSimulatedMediaUrl, normalizeAnalyzableMediaUrls } from '../utils/image-analysis-media';
import { localImageFromMediaUrl } from '../utils/image-analysis-local-media';
import { isPrivateOrReservedIP } from '../utils/is-private-or-reserved-ip';
import {
  isBlockedRemoteHostname,
  isMetaCdnMediaUrl,
  normalizeRemoteHostname
} from '../utils/remote-url-guard';
import { normalizeImageCaption } from '../utils/image-caption';
import type { Conversation, Message } from '@shared/schema';

type ImageAnalysisProvider = 'openai' | 'openrouter' | 'azure';
type CredentialSource = 'auto' | 'company' | 'system' | 'manual';
export type ImageAnalysisErrorCode =
  | 'IMAGE_ANALYSIS_DISABLED'
  | 'IMAGE_ANALYSIS_INVALID_MESSAGE'
  | 'IMAGE_ANALYSIS_MEDIA_UNAVAILABLE'
  | 'IMAGE_ANALYSIS_MISSING_CREDENTIALS'
  | 'IMAGE_ANALYSIS_NOT_FOUND'
  | 'IMAGE_ANALYSIS_PROVIDER_FAILED';

const IMAGE_ANALYSIS_VERSION = 1;
const DEFAULT_MODELS: Record<ImageAnalysisProvider, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'google/gemini-2.5-flash',
  azure: ''
};
const INLINE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const INLINE_IMAGE_MAX_DIMENSION = 2048;
const INLINE_IMAGE_RESIZE_DIMENSIONS = [2048, 1536, 1024];
const INLINE_IMAGE_JPEG_QUALITIES = [82, 72, 62, 52];
const SUPPORTED_PROVIDERS = new Set<ImageAnalysisProvider>(['openai', 'openrouter', 'azure']);
const SUPPORTED_CREDENTIAL_SOURCES = new Set<CredentialSource>(['auto', 'company', 'system', 'manual']);

export interface ImageAnalysisSettings {
  enabled: boolean;
  provider: ImageAnalysisProvider;
  credentialSource: CredentialSource;
  credentialId?: number | null;
  manualApiKey?: string;
}

export interface ImageAnalysisResult {
  version: number;
  ocrText: string;
  visualSummary: string;
  uncertaintyNotes: string;
  requiresClarification: boolean;
  provider: ImageAnalysisProvider;
  model: string;
  credentialId?: number | null;
  analyzedAt: string;
  sourceMediaUrl: string;
  sourceCaption: string | null;
}

type Metadata = Record<string, any>;

type ResolvedImage = {
  sourceMediaUrl: string;
  localPath?: string;
  buffer?: Buffer;
  mimeType?: string;
};

type ValidatedRemoteImageUrl = {
  url: URL;
  hostname: string;
  addresses: Array<{ address: string; family: 4 | 6 }>;
};

export class ImageAnalysisError extends Error {
  code: ImageAnalysisErrorCode;
  cause?: unknown;

  constructor(code: ImageAnalysisErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ImageAnalysisError';
    this.code = code;
    this.cause = cause;
  }
}

export function getImageAnalysisErrorCode(error: unknown): ImageAnalysisErrorCode | undefined {
  if (error instanceof ImageAnalysisError) return error.code;

  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('disabled by company settings')) return 'IMAGE_ANALYSIS_DISABLED';
  if (message.includes('No API key available')) return 'IMAGE_ANALYSIS_MISSING_CREDENTIALS';
  if (message.includes('not found')) return 'IMAGE_ANALYSIS_NOT_FOUND';
  if (message.includes('not an image') || message.includes('Only inbound image')) return 'IMAGE_ANALYSIS_INVALID_MESSAGE';
  if (
    message.includes('media') ||
    message.includes('download') ||
    message.includes('SVG images') ||
    message.includes('inline provider request size') ||
    message.includes('channel connection')
  ) {
    return 'IMAGE_ANALYSIS_MEDIA_UNAVAILABLE';
  }

  return undefined;
}

function parseMetadata(metadata: unknown): Metadata {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as Metadata) } : {};
}

function mergeImageAnalysisMetadata(metadata: Metadata, imageAnalysis: ImageAnalysisResult): Metadata {
  return {
    ...metadata,
    imageAnalysis
  };
}

function normalizeProvider(provider: unknown): ImageAnalysisProvider {
  const value = typeof provider === 'string' ? provider.toLowerCase() : 'openai';
  return SUPPORTED_PROVIDERS.has(value as ImageAnalysisProvider) ? value as ImageAnalysisProvider : 'openai';
}

function normalizeCredentialSource(source: unknown): CredentialSource {
  const value = typeof source === 'string' ? source.toLowerCase() : 'auto';
  return SUPPORTED_CREDENTIAL_SOURCES.has(value as CredentialSource) ? value as CredentialSource : 'auto';
}

function normalizeCredentialId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const credentialId = Number(value);
  return Number.isInteger(credentialId) && credentialId > 0 ? credentialId : null;
}

function isHttpUrl(mediaUrl: string): boolean {
  return /^https?:\/\//i.test(mediaUrl);
}

async function validateRemoteImageUrl(mediaUrl: string): Promise<ValidatedRemoteImageUrl> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media URL is not downloadable');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || isPlaceholderMediaUrl(mediaUrl) || isSimulatedMediaUrl(mediaUrl)) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media URL is not downloadable');
  }

  const normalizedHostname = normalizeRemoteHostname(parsedUrl.hostname);
  if (parsedUrl.username || parsedUrl.password || isBlockedRemoteHostname(normalizedHostname)) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media URL host is not allowed');
  }

  const ipFamily = net.isIP(normalizedHostname);
  if (ipFamily) {
    return {
      url: parsedUrl,
      hostname: normalizedHostname,
      addresses: [{ address: normalizedHostname, family: ipFamily as 4 | 6 }]
    };
  }

  let addresses: Array<{ address: string; family: 4 | 6 }>;
  try {
    addresses = await dnsLookup(normalizedHostname, { all: true, verbatim: true }) as Array<{ address: string; family: 4 | 6 }>;
  } catch {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media URL host could not be resolved');
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIP(address))) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media URL host is not allowed');
  }

  return { url: parsedUrl, hostname: normalizedHostname, addresses };
}

function createPinnedLookup(
  expectedHostname: string,
  addresses: Array<{ address: string; family: 4 | 6 }>
) {
  return (hostname: string, options: any, callback: any) => {
    if (normalizeRemoteHostname(hostname) !== expectedHostname) {
      callback(new Error('Unexpected remote image hostname'));
      return;
    }

    if (options?.all) {
      callback(null, addresses);
      return;
    }

    const preferredFamily = options?.family === 4 || options?.family === 6 ? options.family : null;
    const selected = preferredFamily
      ? addresses.find(address => address.family === preferredFamily) || addresses[0]
      : addresses[0];
    callback(null, selected.address, selected.family);
  };
}

async function fetchRemoteImage(mediaUrl: string): Promise<ResolvedImage> {
  const validatedUrl = await validateRemoteImageUrl(mediaUrl);
  const pinnedLookup = createPinnedLookup(validatedUrl.hostname, validatedUrl.addresses);

  let response;
  try {
    response = await axios.get<ArrayBuffer>(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 25 * 1024 * 1024,
      maxBodyLength: 25 * 1024 * 1024,
      maxRedirects: 0,
      httpAgent: new http.Agent({ lookup: pinnedLookup }),
      httpsAgent: new https.Agent({ lookup: pinnedLookup }),
      validateStatus: status => status >= 200 && status < 300
    });
  } catch (error) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media URL could not be downloaded', error);
  }

  const contentType = String(response.headers['content-type'] || '').split(';')[0].trim();
  if (contentType && !contentType.startsWith('image/')) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Downloaded media is not an image');
  }
  if (contentType === 'image/svg+xml') {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'SVG images are not supported for image analysis');
  }

  return {
    sourceMediaUrl: mediaUrl,
    buffer: Buffer.from(response.data),
    mimeType: contentType || 'image/jpeg'
  };
}

async function validateMessageForImageAnalysis(
  messageId: number,
  companyId: number
): Promise<{ message: Message; conversation: Conversation; metadata: Metadata }> {
  const message = await storage.getMessageById(messageId);
  if (!message) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_NOT_FOUND', 'Message not found');
  }

  const conversation = await storage.getConversation(message.conversationId);
  if (!conversation || conversation.companyId !== companyId) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_NOT_FOUND', 'Message not found');
  }

  if (message.type !== 'image') {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_INVALID_MESSAGE', 'Message is not an image message');
  }

  if (message.direction !== 'inbound') {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_INVALID_MESSAGE', 'Only inbound image messages can be analyzed');
  }

  return { message, conversation, metadata: parseMetadata(message.metadata) };
}

async function resolveAnalyzableImage(
  message: Message,
  conversation: Conversation,
  metadata: Metadata
): Promise<ResolvedImage> {
  const metadataMediaUrl = typeof metadata.mediaUrl === 'string' ? metadata.mediaUrl : null;
  const mediaUrlCandidates = normalizeAnalyzableMediaUrls(message.mediaUrl, metadataMediaUrl);

  for (const candidateUrl of mediaUrlCandidates) {
    const existingLocal = await localImageFromMediaUrl(candidateUrl);
    if (existingLocal) return existingLocal;
  }

  if (!conversation.channelId) {
    const remoteCandidateUrl = mediaUrlCandidates.find(isHttpUrl);
    if (remoteCandidateUrl) return fetchRemoteImage(remoteCandidateUrl);
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Conversation has no channel connection for image recovery');
  }

  if (conversation.channelType === 'whatsapp_official') {
    if (!metadata.mediaId) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'WhatsApp image media ID is not available');
    }
    const connection = await storage.getChannelConnection(conversation.channelId);
    const connectionData = connection?.connectionData as any;
    const accessToken = connection?.accessToken || connectionData?.accessToken;
    if (!accessToken) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'WhatsApp access token not available');
    }
    const mediaUrl = await downloadWhatsAppOfficialMedia(String(metadata.mediaId), accessToken, 'image');
    if (!mediaUrl) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Failed to download WhatsApp image');
    }
    await storage.updateMessage(message.id, { mediaUrl });
    const resolved = await localImageFromMediaUrl(mediaUrl);
    if (resolved) return resolved;
  }

  if (conversation.channelType === 'telegram') {
    const fileId = typeof metadata.telegramFileId === 'string' ? metadata.telegramFileId.trim() : '';
    if (!fileId) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Telegram image file ID is not available');
    }
    const connection = await storage.getChannelConnection(conversation.channelId);
    if (!connection) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Telegram channel connection not found');
    }
    const mediaUrl = await downloadTelegramMediaToPublicFile(connection as any, fileId, message.id, 'image', metadata);
    if (!mediaUrl) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Failed to download Telegram image');
    }
    await storage.updateMessage(message.id, { mediaUrl });
    const resolved = await localImageFromMediaUrl(mediaUrl);
    if (resolved) return resolved;
  }

  if (conversation.channelType === 'instagram' || conversation.channelType === 'messenger') {
    const candidateUrl = mediaUrlCandidates.find(isMetaCdnMediaUrl);
    if (candidateUrl) {
      const connection = await storage.getChannelConnection(conversation.channelId);
      if (!connection) {
        throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Meta channel connection not found');
      }
      const mediaUrl = await downloadInstagramMedia(candidateUrl, connection.accessToken || '', 'image', message.id);
      if (!mediaUrl) {
        throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Failed to download Meta image');
      }
      await storage.updateMessage(message.id, { mediaUrl });
      const resolved = await localImageFromMediaUrl(mediaUrl);
      if (resolved) return resolved;
    }
  }

  if (conversation.channelType === 'whatsapp' || conversation.channelType === 'whatsapp_unofficial') {
    const waMessage = metadata.waMessage ||
      metadata.whatsappMessage ||
      metadata.message ||
      metadata.messageData?.message;
    if (waMessage) {
      const sock = getWhatsAppConnection(conversation.channelId);
      if (!sock) {
        throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'WhatsApp connection not active');
      }
      const mediaUrl = await downloadAndSaveMedia(waMessage, sock, conversation.channelId);
      if (!mediaUrl) {
        throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Failed to download WhatsApp image');
      }
      await storage.updateMessage(message.id, { mediaUrl });
      const resolved = await localImageFromMediaUrl(mediaUrl);
      if (resolved) return resolved;
    }
  }

  const candidateUrl = mediaUrlCandidates.find(isHttpUrl);
  if (candidateUrl && isHttpUrl(candidateUrl)) {
    return fetchRemoteImage(candidateUrl);
  }

  throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'No analyzable image media is available');
}

function normalizeImageMimeType(value: string | false): string {
  return typeof value === 'string' && value.trim()
    ? value.split(';')[0].trim().toLowerCase()
    : 'image/jpeg';
}

async function prepareInlineImageBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (mimeType === 'image/svg+xml') {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'SVG images are not supported for image analysis');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { animated: false }).metadata();
  } catch {
    if (buffer.length <= INLINE_IMAGE_MAX_BYTES) {
      return { buffer, mimeType };
    }
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image exceeds inline provider request size and could not be compressed');
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const isProviderSafeMime = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
  if (
    buffer.length <= INLINE_IMAGE_MAX_BYTES &&
    width <= INLINE_IMAGE_MAX_DIMENSION &&
    height <= INLINE_IMAGE_MAX_DIMENSION &&
    isProviderSafeMime
  ) {
    return { buffer, mimeType };
  }

  let smallest: Buffer | null = null;
  for (const dimension of INLINE_IMAGE_RESIZE_DIMENSIONS) {
    for (const quality of INLINE_IMAGE_JPEG_QUALITIES) {
      const candidate = await sharp(buffer, { animated: false })
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: 'inside',
          withoutEnlargement: true
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      if (!smallest || candidate.length < smallest.length) {
        smallest = candidate;
      }
      if (candidate.length <= INLINE_IMAGE_MAX_BYTES) {
        return { buffer: candidate, mimeType: 'image/jpeg' };
      }
    }
  }

  if (smallest && smallest.length <= INLINE_IMAGE_MAX_BYTES) {
    return { buffer: smallest, mimeType: 'image/jpeg' };
  }

  throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image exceeds inline provider request size after compression');
}

async function buildImageDataUrl(resolved: ResolvedImage): Promise<string> {
  let buffer: Buffer;
  let preparedImage: { buffer: Buffer; mimeType: string };
  try {
    buffer = resolved.buffer ?? await fs.readFile(resolved.localPath as string);
    const mimeType = normalizeImageMimeType(resolved.mimeType ||
      (resolved.localPath ? mime.lookup(resolved.localPath) : false) ||
      'image/jpeg');
    preparedImage = await prepareInlineImageBuffer(buffer, mimeType);
  } catch (error) {
    if (error instanceof ImageAnalysisError) throw error;
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MEDIA_UNAVAILABLE', 'Image media could not be prepared for analysis', error);
  }

  return `data:${preparedImage.mimeType};base64,${preparedImage.buffer.toString('base64')}`;
}

async function analyzeWithProvider(
  apiKey: string,
  provider: ImageAnalysisProvider,
  imageDataUrl: string,
  caption: string | null,
  azure?: { endpoint: string; apiVersion?: string; defaultChatDeployment?: string }
): Promise<{ result: Pick<ImageAnalysisResult, 'ocrText' | 'visualSummary' | 'uncertaintyNotes' | 'requiresClarification'>; model: string }> {
  const model = provider === 'azure'
    ? (azure?.defaultChatDeployment || '')
    : DEFAULT_MODELS[provider];
  if (!model) {
    throw new Error(
      provider === 'azure'
        ? 'Set a default chat deployment on your Azure credential for image analysis.'
        : `No multimodal image analysis model configured for ${provider}`
    );
  }

  const client = provider === 'azure' && azure
    ? createAzureOpenAIRestClient({
        apiKey,
        endpoint: azure.endpoint,
        apiVersion: azure.apiVersion || '2024-10-21',
        defaultChatDeployment: azure.defaultChatDeployment,
      }, model)
    : new OpenAI({
        apiKey,
        ...(provider === 'openrouter'
          ? {
              baseURL: 'https://openrouter.ai/api/v1',
              defaultHeaders: {
                'HTTP-Referer': 'https://bothive.pro',
                'X-Title': 'BotHive'
              }
            }
          : {})
      });

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You analyze inbound customer images. Return only valid JSON with keys ocrText, visualSummary, uncertaintyNotes, requiresClarification. Extract all visible text verbatim when readable. Describe visible content concisely. Do not invent unreadable, cropped, hidden, or uncertain details. Set requiresClarification true when the image is too unclear to answer confidently.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: caption
              ? `Analyze this image. User-provided caption/context: ${caption}`
              : 'Analyze this image.'
          },
          {
            type: 'image_url',
            image_url: { url: imageDataUrl }
          }
        ]
      }
    ] as any
  });

  const raw = response.choices[0]?.message?.content || '{}';
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      ocrText: '',
      visualSummary: raw.trim(),
      uncertaintyNotes: 'Provider returned non-JSON output.',
      requiresClarification: true
    };
  }

  return {
    model,
    result: {
      ocrText: typeof parsed.ocrText === 'string' ? parsed.ocrText : '',
      visualSummary: typeof parsed.visualSummary === 'string' ? parsed.visualSummary : '',
      uncertaintyNotes: typeof parsed.uncertaintyNotes === 'string' ? parsed.uncertaintyNotes : '',
      requiresClarification: Boolean(parsed.requiresClarification)
    }
  };
}

export async function getImageAnalysisSettings(companyId: number): Promise<ImageAnalysisSettings> {
  await assertAppSumoAccess(companyId);
  const enabledSetting = await storage.getCompanySetting(companyId, 'inbox_image_analysis_enabled');
  const providerSetting = await storage.getCompanySetting(companyId, 'inbox_image_analysis_provider');
  const credentialSourceSetting = await storage.getCompanySetting(companyId, 'inbox_image_analysis_credential_source');
  const credentialIdSetting = await storage.getCompanySetting(companyId, 'inbox_image_analysis_credential_id');
  const manualKeySetting = await storage.getCompanySetting(companyId, 'inbox_image_analysis_manual_api_key');

  return {
    enabled: enabledSetting?.value === true,
    provider: normalizeProvider(providerSetting?.value),
    credentialSource: normalizeCredentialSource(credentialSourceSetting?.value),
    credentialId: normalizeCredentialId(credentialIdSetting?.value),
    manualApiKey: (manualKeySetting?.value as string) || ''
  };
}

export async function getStoredImageAnalysis(
  messageId: number,
  companyId: number
): Promise<ImageAnalysisResult | null> {
  const { metadata } = await validateMessageForImageAnalysis(messageId, companyId);
  const cached = metadata.imageAnalysis;
  if (!cached || typeof cached !== 'object') {
    return null;
  }
  return cached as ImageAnalysisResult;
}

export async function resolveImageMessageForModelInput(
  messageId: number,
  companyId: number,
  options: { bypassCompanyEnabledCheck?: boolean } = {}
): Promise<{ dataUrl: string; sourceMediaUrl: string }> {
  const settings = await getImageAnalysisSettings(companyId);
  if (!settings.enabled && !options.bypassCompanyEnabledCheck) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_DISABLED', 'Image analysis is disabled by company settings');
  }

  const { message, conversation, metadata } = await validateMessageForImageAnalysis(messageId, companyId);
  const resolvedImage = await resolveAnalyzableImage(message, conversation, metadata);
  const dataUrl = await buildImageDataUrl(resolvedImage);
  return {
    dataUrl,
    sourceMediaUrl: resolvedImage.sourceMediaUrl
  };
}

export async function analyzeImageMessage(
  messageId: number,
  companyId: number
): Promise<ImageAnalysisResult> {
  const { message, conversation, metadata } = await validateMessageForImageAnalysis(messageId, companyId);

  if (metadata.imageAnalysis && typeof metadata.imageAnalysis === 'object') {
    return metadata.imageAnalysis as ImageAnalysisResult;
  }

  const settings = await getImageAnalysisSettings(companyId);
  if (!settings.enabled) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_DISABLED', 'Image analysis is disabled by company settings');
  }

  const resolvedImage = await resolveAnalyzableImage(message, conversation, metadata);
  const imageDataUrl = await buildImageDataUrl(resolvedImage);

  let apiKey: string;
  let credentialId: number | null = null;
  let azureMeta: { endpoint: string; apiVersion?: string; defaultChatDeployment?: string } | undefined;
  if (settings.provider === 'azure' && settings.credentialSource === 'manual') {
    throw new ImageAnalysisError(
      'IMAGE_ANALYSIS_MISSING_CREDENTIALS',
      'Azure image analysis requires a company or system Azure credential with a default chat deployment.'
    );
  }
  if (settings.credentialSource === 'manual' && settings.manualApiKey) {
    apiKey = settings.manualApiKey;
  } else {
    const credentialSource = settings.credentialSource === 'manual' ? 'auto' : settings.credentialSource;
    const credentialData = credentialSource === 'company' && settings.credentialId
      ? await aiCredentialsService.getCompanyCredentialById(companyId, settings.provider, settings.credentialId)
      : await aiCredentialsService.getCredentialWithPreference(
          companyId,
          settings.provider,
          credentialSource as 'company' | 'system' | 'auto'
        );
    if (!credentialData?.apiKey) {
      throw new ImageAnalysisError(
        'IMAGE_ANALYSIS_MISSING_CREDENTIALS',
        'No API key available for image analysis. Please configure credentials in Inbox Settings.'
      );
    }
    apiKey = credentialData.apiKey;
    credentialId = credentialData.credential?.id ?? null;
    const azure = azureConnectionFromCredentialSource(credentialData);
    if (azure) {
      azureMeta = {
        endpoint: azure.endpoint,
        apiVersion: azure.apiVersion,
        defaultChatDeployment: azure.defaultChatDeployment,
      };
    }
  }

  const sourceCaption = normalizeImageCaption(message.content);
  let providerResponse: Awaited<ReturnType<typeof analyzeWithProvider>>;
  try {
    providerResponse = await analyzeWithProvider(apiKey, settings.provider, imageDataUrl, sourceCaption, azureMeta);
  } catch (error) {
    if (error instanceof ImageAnalysisError) throw error;
    throw new ImageAnalysisError('IMAGE_ANALYSIS_PROVIDER_FAILED', 'Image analysis provider failed', error);
  }
  const imageAnalysis: ImageAnalysisResult = {
    version: IMAGE_ANALYSIS_VERSION,
    ...providerResponse.result,
    provider: settings.provider,
    model: providerResponse.model,
    credentialId,
    analyzedAt: new Date().toISOString(),
    sourceMediaUrl: resolvedImage.sourceMediaUrl,
    sourceCaption
  };

  await storage.updateMessage(messageId, {
    metadata: JSON.stringify(mergeImageAnalysisMetadata(metadata, imageAnalysis))
  });

  return imageAnalysis;
}

/** Analyze an already-authorized local image without creating or mutating a message record. */
export async function analyzeLocalImageFile(
  filePath: string,
  mimeType: string,
  companyId: number,
  sourceCaption: string | null = null,
): Promise<Omit<ImageAnalysisResult, 'sourceMediaUrl' | 'analyzedAt'>> {
  const settings = await getImageAnalysisSettings(companyId);
  if (!settings.enabled) {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_DISABLED', 'Image analysis is disabled by company settings');
  }
  let apiKey: string;
  let credentialId: number | null = null;
  let azureMeta: { endpoint: string; apiVersion?: string; defaultChatDeployment?: string } | undefined;
  if (settings.provider === 'azure' && settings.credentialSource === 'manual') {
    throw new ImageAnalysisError('IMAGE_ANALYSIS_MISSING_CREDENTIALS', 'Azure image analysis requires a configured credential.');
  }
  if (settings.credentialSource === 'manual' && settings.manualApiKey) {
    apiKey = settings.manualApiKey;
  } else {
    const source = settings.credentialSource === 'manual' ? 'auto' : settings.credentialSource;
    const credential = source === 'company' && settings.credentialId
      ? await aiCredentialsService.getCompanyCredentialById(companyId, settings.provider, settings.credentialId)
      : await aiCredentialsService.getCredentialWithPreference(companyId, settings.provider, source);
    if (!credential?.apiKey) {
      throw new ImageAnalysisError('IMAGE_ANALYSIS_MISSING_CREDENTIALS', 'No API key available for image analysis.');
    }
    apiKey = credential.apiKey;
    credentialId = credential.credential?.id ?? null;
    const azure = azureConnectionFromCredentialSource(credential);
    if (azure) azureMeta = azure;
  }
  const imageDataUrl = await buildImageDataUrl({ localPath: filePath, mimeType, sourceMediaUrl: filePath });
  const response = await analyzeWithProvider(apiKey, settings.provider, imageDataUrl, sourceCaption, azureMeta);
  return { version: IMAGE_ANALYSIS_VERSION, ...response.result, provider: settings.provider, model: response.model, credentialId, sourceCaption };
}
