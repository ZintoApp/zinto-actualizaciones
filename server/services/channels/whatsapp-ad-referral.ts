import type { WAMessage } from 'baileys';

type ReferralContext = Record<string, unknown>;

/** Thumbnail object shape on unofficial WhatsApp externalAdReply payloads. */
export type WhatsAppReferralThumbnail = {
  url?: string;
  directPath?: string;
};

const CTWA_CARRIER_SCALAR_KEYS = [
  'conversionSource',
  'entryPointConversionSource',
  'entryPointConversionApp',
  'entryPointConversionExternalSource',
  'entryPointConversionExternalMedium',
  'ctwaSignals',
  'entryPointConversionDelaySeconds',
] as const;

const EXTERNAL_AD_REPLY_SCALAR_KEYS = [
  'title',
  'body',
  'mediaUrl',
  'sourceUrl',
  'sourceId',
  'sourceType',
  'sourceID',
  'renderLargerThumbnail',
  'showAdAttribution',
  'mediaType',
  'adId',
  'adsetId',
  'campaignId',
  'ref',
] as const;

export function asWhatsAppReferralThumbnail(
  thumbnail: unknown
): WhatsAppReferralThumbnail | null {
  if (!thumbnail || typeof thumbnail !== 'object') {
    return null;
  }
  return thumbnail as WhatsAppReferralThumbnail;
}

function isBinaryLike(value: unknown): boolean {
  return (
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    (typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as { type?: string }).type === 'Buffer' &&
      Array.isArray((value as { data?: unknown[] }).data))
  );
}

function encodeReferralBytesField(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type?: string }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown[] }).data)
  ) {
    const bufferPayload = value as unknown as { data: number[] };
    return Buffer.from(bufferPayload.data).toString('base64');
  }
  return null;
}

export function normalizeReferralThumbnail(thumbnail: unknown): string | null {
  if (thumbnail == null) {
    return null;
  }
  if (typeof thumbnail === 'string') {
    if (
      thumbnail.startsWith('data:') ||
      thumbnail.startsWith('http://') ||
      thumbnail.startsWith('https://')
    ) {
      return thumbnail;
    }
    if (isBinaryLike(thumbnail)) {
      return null;
    }
    return thumbnail;
  }
  if (isBinaryLike(thumbnail)) {
    return null;
  }
  if (typeof thumbnail === 'object') {
    const thumbnailObj = asWhatsAppReferralThumbnail(thumbnail);
    if (thumbnailObj?.url) {
      return thumbnailObj.url;
    }
    if (thumbnailObj?.directPath) {
      return thumbnailObj.directPath;
    }
  }
  return null;
}

function copyScalarFields(
  source: ReferralContext,
  target: ReferralContext,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const value = source[key];
    if (value != null && value !== '' && !isBinaryLike(value)) {
      target[key] = value;
    }
  }
}

function sanitizeExternalAdReplyFragment(externalAdReply: ReferralContext): ReferralContext {
  const sanitized: ReferralContext = {};
  copyScalarFields(externalAdReply, sanitized, EXTERNAL_AD_REPLY_SCALAR_KEYS);

  const thumbnail = normalizeReferralThumbnail(externalAdReply.thumbnail);
  if (thumbnail) {
    sanitized.thumbnail = thumbnail;
  }

  return sanitized;
}

function readCtwaCarrierFields(contextInfo: ReferralContext): ReferralContext | null {
  const hasCtwaCarrier =
    contextInfo.conversionData != null ||
    contextInfo.ctwaPayload != null ||
    contextInfo.entryPointConversionSource != null;

  if (!hasCtwaCarrier) {
    return null;
  }

  const carrier: ReferralContext = {};
  copyScalarFields(contextInfo, carrier, CTWA_CARRIER_SCALAR_KEYS);

  const conversionData = encodeReferralBytesField(contextInfo.conversionData);
  if (conversionData) {
    carrier.conversionData = conversionData;
  }

  const ctwaPayload = encodeReferralBytesField(contextInfo.ctwaPayload);
  if (ctwaPayload) {
    carrier.ctwaPayload = ctwaPayload;
  }

  return Object.keys(carrier).length > 0 ? carrier : null;
}

export function sanitizeWhatsAppUnofficialReferralRaw(raw: ReferralContext): ReferralContext {
  const sanitized: ReferralContext = {};

  copyScalarFields(raw, sanitized, CTWA_CARRIER_SCALAR_KEYS);

  const conversionData = encodeReferralBytesField(raw.conversionData);
  if (conversionData) {
    sanitized.conversionData = conversionData;
  }

  const ctwaPayload = encodeReferralBytesField(raw.ctwaPayload);
  if (ctwaPayload) {
    sanitized.ctwaPayload = ctwaPayload;
  }

  copyScalarFields(raw, sanitized, EXTERNAL_AD_REPLY_SCALAR_KEYS);

  const thumbnail = normalizeReferralThumbnail(raw.thumbnail);
  if (thumbnail) {
    sanitized.thumbnail = thumbnail;
  }

  return sanitized;
}

function readContextInfo(node: unknown): ReferralContext | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const contextInfo = (node as { contextInfo?: ReferralContext }).contextInfo;
  return contextInfo && typeof contextInfo === 'object' ? contextInfo : null;
}

function readExternalAdReply(contextInfo: ReferralContext | null): ReferralContext | null {
  const externalAdReply = contextInfo?.externalAdReply;
  return externalAdReply && typeof externalAdReply === 'object'
    ? (externalAdReply as ReferralContext)
    : null;
}

function readReferralFromContextInfo(contextInfo: ReferralContext | null): ReferralContext | null {
  if (!contextInfo) {
    return null;
  }

  const ctwaFields = readCtwaCarrierFields(contextInfo);
  const externalAdReply = readExternalAdReply(contextInfo);
  const sanitizedExternal = externalAdReply
    ? sanitizeExternalAdReplyFragment(externalAdReply)
    : null;

  if (ctwaFields && sanitizedExternal && Object.keys(sanitizedExternal).length > 0) {
    return sanitizeWhatsAppUnofficialReferralRaw({
      ...sanitizedExternal,
      ...ctwaFields,
    });
  }
  if (ctwaFields) {
    return sanitizeWhatsAppUnofficialReferralRaw(ctwaFields);
  }
  if (sanitizedExternal && Object.keys(sanitizedExternal).length > 0) {
    return sanitizedExternal;
  }

  return null;
}

function scanContextInfo(contextInfo: ReferralContext | null): ReferralContext | null {
  const direct = readReferralFromContextInfo(contextInfo);
  if (direct) {
    return direct;
  }

  const quotedMessage = contextInfo?.quotedMessage as Record<string, unknown> | undefined;
  if (quotedMessage && typeof quotedMessage === 'object') {
    for (const key of Object.keys(quotedMessage)) {
      const fromQuoted = scanMessageNode(quotedMessage[key]);
      if (fromQuoted) {
        return fromQuoted;
      }
    }
  }

  return null;
}

function scanMessageNode(msgNode: unknown): ReferralContext | null {
  if (!msgNode || typeof msgNode !== 'object') {
    return null;
  }

  const fromContext = scanContextInfo(readContextInfo(msgNode));
  if (fromContext) {
    return fromContext;
  }

  const nested = msgNode as Record<string, unknown>;
  for (const key of Object.keys(nested)) {
    const child = nested[key];
    if (!child || typeof child !== 'object') {
      continue;
    }

    const childRecord = child as Record<string, unknown>;
    if (childRecord.message && typeof childRecord.message === 'object') {
      const fromWrapped = scanMessageNode(childRecord.message);
      if (fromWrapped) {
        return fromWrapped;
      }
    }

    const fromChild = scanMessageNode(childRecord);
    if (fromChild) {
      return fromChild;
    }
  }

  return null;
}

/**
 * Detect ad/referral context from unofficial WhatsApp (Baileys) payloads,
 * including CTWA carrier fields, externalAdReply, wrapped view-once/ephemeral
 * media-caption, and quoted-message shapes.
 */
export function extractWhatsAppUnofficialAdReferral(waMsg: WAMessage): ReferralContext | null {
  try {
    const msgAny = waMsg.message as Record<string, unknown> | null | undefined;
    if (!msgAny) {
      return null;
    }

    const fromRoot = scanMessageNode(msgAny);
    if (fromRoot) {
      return fromRoot;
    }

    const wrapperKeys = [
      'viewOnceMessage',
      'viewOnceMessageV2',
      'viewOnceMessageV2Extension',
      'ephemeralMessage',
      'documentWithCaptionMessage',
      'imageMessage',
      'videoMessage',
    ];

    for (const wrapperKey of wrapperKeys) {
      const wrapper = msgAny[wrapperKey] as { message?: unknown } | undefined;
      if (wrapper?.message) {
        const fromWrapper = scanMessageNode(wrapper.message);
        if (fromWrapper) {
          return fromWrapper;
        }
      }
    }

    const extendedContext = readContextInfo(msgAny.extendedTextMessage);
    const quotedMessage = extendedContext?.quotedMessage as Record<string, unknown> | undefined;
    if (quotedMessage) {
      for (const key of Object.keys(quotedMessage)) {
        const fromQuoted = scanMessageNode(quotedMessage[key]);
        if (fromQuoted) {
          return fromQuoted;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting unofficial WhatsApp ad/referral context:', error);
    return null;
  }
}

export function hasWhatsAppUnofficialAdReferral(waMsg: WAMessage): boolean {
  return extractWhatsAppUnofficialAdReferral(waMsg) != null;
}

/** Meta Cloud API referral object on inbound webhook messages. */
export function extractWhatsAppOfficialReferral(message: {
  referral?: ReferralContext;
}): ReferralContext | null {
  const referral = message?.referral;
  return referral && typeof referral === 'object' ? referral : null;
}

export function hasWhatsAppOfficialAdReferral(message: { referral?: ReferralContext }): boolean {
  return extractWhatsAppOfficialReferral(message) != null;
}
