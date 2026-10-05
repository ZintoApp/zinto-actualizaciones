import { instagramMessageMetadata } from './instagram-message-utils';

export const INSTAGRAM_SHARED_TYPES = new Set(['share', 'ig_post', 'ig_reel', 'reel', 'story', 'ig_story', 'story_mention']);
export function instagramContextUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  if (/^\/(?:uploads|media)\//.test(value)) return value;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Invalid provider URLs must not become clickable links. */ }
}

export function instagramMessageContext(message: { metadata?: unknown; type?: string; mediaUrl?: string | null }) {
  const metadata = instagramMessageMetadata(message.metadata);
  const referral = instagramMessageMetadata(metadata.metaReferral);
  const raw = instagramMessageMetadata(referral.raw);
  const context = instagramMessageMetadata(raw.ads_context_data);
  const ad = referral.channel === 'instagram' && (referral.entryType === 'ad' || referral.adId || raw.source === 'ADS') ? {
    title: typeof context.ad_title === 'string' ? context.ad_title : typeof raw.headline === 'string' ? raw.headline : '',
    image: instagramContextUrl(context.photo_url || context.video_url || raw.image_url || raw.thumbnail_url),
    url: instagramContextUrl(raw.source_url) || instagramContextUrl(raw.referer_uri),
    adId: typeof referral.adId === 'string' ? referral.adId : undefined,
  } : null;
  const attachments = Array.isArray(metadata.instagramAttachments) ? metadata.instagramAttachments : [];
  const shares = attachments.filter(a => a && INSTAGRAM_SHARED_TYPES.has(a.type)).map(a => ({
    type: String(a.type), title: typeof a.title === 'string' ? a.title : '',
    url: instagramContextUrl(a.payload?.url || a.url),
  }));
  if (!shares.length && INSTAGRAM_SHARED_TYPES.has(message.type || '')) {
    shares.push({ type: message.type!, title: '', url: instagramContextUrl(message.mediaUrl) });
  }
  return { ad, shares };
}
