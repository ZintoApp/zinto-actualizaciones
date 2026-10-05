import type { WAMessage } from 'baileys';
import {
  extractWhatsAppOfficialReferral,
  extractWhatsAppUnofficialAdReferral,
  sanitizeWhatsAppUnofficialReferralRaw,
} from './whatsapp-ad-referral';

export type MetaReferralChannel =
  | 'messenger'
  | 'instagram'
  | 'whatsapp_official'
  | 'whatsapp';

export type NormalizedMetaReferral = {
  provider: 'meta';
  channel: MetaReferralChannel;
  entryType: string | null;
  routingKey: string | null;
  adId: string | null;
  adSetId: string | null;
  campaignId: string | null;
  ref: string | null;
  sourceId: string | null;
  ctwaClid: string | null;
  raw: Record<string, unknown>;
};

type ReferralFragment = Record<string, unknown>;

function readStringField(fragment: ReferralFragment, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fragment[key];
    if (value != null && value !== '') {
      return String(value);
    }
  }
  return null;
}

function computeRoutingKey(
  adId: string | null,
  sourceId: string | null,
  ref: string | null,
): string | null {
  return adId ?? sourceId ?? ref;
}

function normalizeEntryType(fragment: ReferralFragment): string | null {
  const raw = readStringField(fragment, 'source_type', 'sourceType', 'type', 'source');
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'ads') {
    return 'ad';
  }
  return normalized.replace(/\s+/g, '_');
}

function normalizeWhatsAppUnofficialEntryType(fragment: ReferralFragment): string | null {
  const entryPointSource = readStringField(fragment, 'entryPointConversionSource');
  if (entryPointSource) {
    const normalized = entryPointSource.trim().toLowerCase();
    if (normalized === 'ctwa_ad' || normalized.includes('ad')) {
      return 'ad';
    }
    return normalized.replace(/\s+/g, '_');
  }

  const conversionSource = readStringField(fragment, 'conversionSource');
  if (conversionSource) {
    const normalized = conversionSource.trim().toLowerCase();
    if (normalized.includes('ads')) {
      return 'ad';
    }
    return normalized.replace(/\s+/g, '_');
  }

  return normalizeEntryType(fragment);
}

function buildNormalizedWhatsAppUnofficialMetaReferral(
  raw: ReferralFragment,
): NormalizedMetaReferral | null {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
    return null;
  }

  const adId = readStringField(raw, 'ad_id', 'adId', 'adID');
  const adSetId = readStringField(raw, 'adset_id', 'adSetId', 'adsetId', 'ad_set_id');
  const campaignId = readStringField(raw, 'campaign_id', 'campaignId');
  const ref = readStringField(raw, 'ref');
  const sourceId = readStringField(raw, 'source_id', 'sourceId', 'sourceID');
  const ctwaClid = readStringField(
    raw,
    'ctwa_clid',
    'ctwaClid',
    'ctwaPayload',
    'conversionData',
  );
  const entryType = normalizeWhatsAppUnofficialEntryType(raw);
  const routingKey = computeRoutingKey(adId, sourceId, ref) ?? ctwaClid;

  if (!routingKey && !entryType && !ctwaClid && !adSetId && !campaignId) {
    return null;
  }

  return {
    provider: 'meta',
    channel: 'whatsapp',
    entryType,
    routingKey,
    adId,
    adSetId,
    campaignId,
    ref,
    sourceId,
    ctwaClid,
    raw,
  };
}

function buildNormalizedMetaReferral(
  channel: MetaReferralChannel,
  raw: ReferralFragment,
): NormalizedMetaReferral | null {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
    return null;
  }

  const adId = readStringField(raw, 'ad_id', 'adId', 'adID');
  const adSetId = readStringField(raw, 'adset_id', 'adSetId', 'adsetId', 'ad_set_id');
  const campaignId = readStringField(raw, 'campaign_id', 'campaignId');
  const ref = readStringField(raw, 'ref');
  const sourceId = readStringField(raw, 'source_id', 'sourceId');
  const ctwaClid = readStringField(raw, 'ctwa_clid', 'ctwaClid');
  const entryType = normalizeEntryType(raw);
  const routingKey = computeRoutingKey(adId, sourceId, ref);

  if (!routingKey && !entryType && !ctwaClid && !adSetId && !campaignId) {
    return null;
  }

  return {
    provider: 'meta',
    channel,
    entryType,
    routingKey,
    adId,
    adSetId,
    campaignId,
    ref,
    sourceId,
    ctwaClid,
    raw,
  };
}

function extractReferralFragment(
  surfaces: Array<unknown | undefined>,
): ReferralFragment | null {
  for (const surface of surfaces) {
    if (surface && typeof surface === 'object' && !Array.isArray(surface)) {
      return surface as ReferralFragment;
    }
  }
  return null;
}

export function normalizeMessengerMetaReferral(messagingEvent: {
  referral?: unknown;
  message?: { referral?: unknown };
  postback?: { referral?: unknown };
}): NormalizedMetaReferral | null {
  const raw = extractReferralFragment([
    messagingEvent.referral,
    messagingEvent.message?.referral,
    messagingEvent.postback?.referral,
  ]);
  if (!raw) {
    return null;
  }
  return buildNormalizedMetaReferral('messenger', raw);
}

export function normalizeInstagramMetaReferral(messagingEvent: {
  referral?: unknown;
  message?: { referral?: unknown };
  postback?: { referral?: unknown };
}): NormalizedMetaReferral | null {
  const raw = extractReferralFragment([
    messagingEvent.referral,
    messagingEvent.message?.referral,
    messagingEvent.postback?.referral,
  ].filter(value => value && typeof value === 'object' && Object.keys(value).length > 0));
  if (!raw) {
    return null;
  }
  const referral = buildNormalizedMetaReferral('instagram', raw);
  // OPEN_THREAD describes the action, whereas ADS describes its origin.
  if (referral && (referral.adId || readStringField(raw, 'source')?.trim().toUpperCase() === 'ADS')) {
    referral.entryType = 'ad';
  }
  return referral;
}

export function normalizeWhatsAppOfficialMetaReferral(message: {
  referral?: Record<string, unknown>;
}): NormalizedMetaReferral | null {
  const raw = extractWhatsAppOfficialReferral(message);
  if (!raw) {
    return null;
  }
  return buildNormalizedMetaReferral('whatsapp_official', raw);
}

export function normalizeWhatsAppUnofficialMetaReferral(
  waMsg: WAMessage,
): NormalizedMetaReferral | null {
  const extracted = extractWhatsAppUnofficialAdReferral(waMsg);
  if (!extracted) {
    return null;
  }
  const raw = sanitizeWhatsAppUnofficialReferralRaw(extracted);
  return buildNormalizedWhatsAppUnofficialMetaReferral(raw);
}

const META_REFERRAL_CHANNEL_CONTACT_TAG: Record<MetaReferralChannel, string> = {
  messenger: 'facebook',
  instagram: 'instagram',
  whatsapp_official: 'whatsapp',
  whatsapp: 'whatsapp',
};

function isAdOriginMetaReferral(referral: NormalizedMetaReferral): boolean {
  return referral.entryType === 'ad';
}

export function deriveMetaReferralContactTags(
  referral: NormalizedMetaReferral | null | undefined,
): string[] {
  if (!referral || !isAdOriginMetaReferral(referral)) {
    return [];
  }
  const tag = META_REFERRAL_CHANNEL_CONTACT_TAG[referral.channel];
  return tag ? [tag] : [];
}
