import type { NormalizedMetaReferral } from './meta-referral-normalization';

export interface InstagramAttachment {
  type: string;
  payload?: { url?: string; sticker_id?: string };
  title?: string;
  url?: string;
}
export interface InstagramWebhookEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number | string;
  message?: { mid: string; text?: string; attachments?: InstagramAttachment[]; timestamp?: number;
    is_echo?: boolean; is_deleted?: boolean; referral?: Record<string, unknown>;
    reply_to?: { mid?: string; story?: { id?: string; url?: string } } };
  postback?: { mid?: string; title?: string; payload?: string; referral?: Record<string, unknown> };
  referral?: Record<string, unknown>;
  reaction?: unknown;
  read?: { mid?: string; watermark?: number; seq?: number };
  webhookField?: string;
}

const fields = new Set(['messages', 'message_echoes', 'messaging_postbacks', 'messaging_referral', 'messaging_seen', 'message_reactions']);
export function instagramEntryEvents(entry: { messaging?: unknown; changes?: unknown }): InstagramWebhookEvent[] {
  const events: InstagramWebhookEvent[] = [];
  if (Array.isArray(entry.messaging)) {
    for (const value of entry.messaging) if (value && typeof value === 'object') events.push(value);
  }
  if (Array.isArray(entry.changes)) {
    for (const change of entry.changes) {
      if (fields.has(change?.field) && change.value && typeof change.value === 'object' && !Array.isArray(change.value)) {
        events.push({ ...change.value, webhookField: change.field });
      }
    }
  }
  return events;
}

export function instagramEventTimestamp(event: InstagramWebhookEvent): Date {
  const raw = event.timestamp ?? event.message?.timestamp;
  const numeric = typeof raw === 'string' && raw.trim() ? Number(raw) : raw;
  const result = typeof numeric === 'number' && Number.isFinite(numeric) ? new Date(numeric) : new Date();
  return Number.isNaN(result.getTime()) ? new Date() : result;
}

export interface InstagramReferralScope { companyId: number; connectionId: number; senderId: string }
export interface InstagramReferralEvent extends InstagramReferralScope {
  eventAt: Date;
  referral: NormalizedMetaReferral;
}
