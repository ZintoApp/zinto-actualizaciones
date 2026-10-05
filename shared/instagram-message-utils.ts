import { instagramEnglish, type InstagramTranslate } from './instagram-i18n';

export function instagramMessageMetadata(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try { return instagramMessageMetadata(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function instagramQuoteMetadata(message: { reply_to?: { mid?: string; story?: { id?: string; url?: string } } }) {
  const mid = message.reply_to?.mid;
  return typeof mid === 'string' && mid.trim()
    ? { isQuotedMessage: true, quotedMessageId: mid, instagramReplyTo: { mid } }
    : message.reply_to?.story ? { instagramReplyTo: { story: message.reply_to.story } } : {};
}

export function instagramQuoteDelivery(connectionData: unknown): 'native' | 'text' {
  const data = instagramMessageMetadata(connectionData);
  return typeof data.linkedPageId === 'string' && data.linkedPageId.trim() ? 'native' : 'text';
}

// Text quotes are delivered as ordinary message text; retain a local reference separately.
export function instagramTextQuoteMetadata(originalMid: string) {
  return { isQuotedMessage: true, quotedMessageId: originalMid, quoteDelivery: 'text' };
}

export function instagramTextQuoteParts(content: string | null | undefined, metadata: unknown): { excerpt: string; reply: string } | null {
  if (instagramMessageMetadata(metadata).quoteDelivery !== 'text' || !content) return null;
  // Recognize our stored fallback, including messages sent before the label was removed.
  const match = /^(?:Text quote:\r?\n)?> ([^\r\n]+)(?:\r?\n\r?\n([\s\S]*))?$/.exec(content);
  if (!match) return null;
  return { excerpt: match[1], reply: (match[2] || '').replace(/^> \*[^*]+\*\r?\n\r?\n/, '') };
}

export function instagramQuoteTypeLabel(type: string, t: InstagramTranslate = instagramEnglish): string {
  const labels: Record<string, string> = {
    image: 'Image', video: 'Video', audio: 'Audio', document: 'Document', file: 'Document',
    sticker: 'Sticker', share: 'Shared post', story: 'Instagram story', location: 'Location',
    contact: 'Contact', template: 'Template', interactive: 'Interactive message',
  };
  const labelKey = type === 'file' ? 'document' : labels[type] ? type : 'media';
  return t(`instagram.quote.${labelKey}`, labels[type] || 'Media message');
}

export function buildInstagramTextQuote(original: { type?: string | null; content?: string | null; metadata?: unknown }, reply: string, t: InstagramTranslate = instagramEnglish): string {
  const type = original.type || 'text';
  const priorQuote = instagramTextQuoteParts(original.content, original.metadata);
  let excerpt = (priorQuote ? priorQuote.reply || priorQuote.excerpt : original.content || '').replace(/^> \*[^*]+\*\r?\n\r?\n/, '').trim();
  if (type !== 'text') {
    // Media URLs and serialized payloads must not leak into the visible quote.
    const label = `[${instagramQuoteTypeLabel(type, t)}]`;
    excerpt = !excerpt || /^\[[^\]]+\]$/.test(excerpt) || /^(?:https?:|\/uploads\/|[\[{])/.test(excerpt)
      ? label : `${label} ${excerpt}`;
  }
  excerpt = excerpt.replace(/\s+/g, ' ').trim() || `[${t('instagram.quote.message', 'Message')}]`;
  const prefix = '> ';
  const cleanReply = reply.replace(/^> \*[^*]+\*\r?\n\r?\n/, '');
  const suffix = cleanReply ? `\n\n${cleanReply}` : '';
  const encoder = new TextEncoder();
  const budget = Math.min(400, 1000 - encoder.encode(prefix + suffix).length);
  if (budget < 20) throw new Error(t('instagram.errors.reply_too_long', 'This reply is too long to include the quoted message. Shorten the reply and try again.'));
  if (encoder.encode(excerpt).length > budget) {
    let shortened = '';
    let bytes = 0;
    for (const character of excerpt) {
      const size = encoder.encode(character).length;
      if (bytes + size > budget - 3) break;
      shortened += character;
      bytes += size;
    }
    excerpt = shortened.trimEnd() + '…';
  }
  return prefix + excerpt + suffix;
}

function attributionRank(message: any): number {
  if (message.isFromBot === true || message.senderType === 'bot') return 3;
  if (message.senderType === 'user' && message.senderId != null) return 3;
  return instagramMessageMetadata(message.metadata).instagramEcho ? 0 : 1;
}

// Collapse historical echo rows by provider identity, never by text or timestamp.
export function reconcileInstagramMessages<T extends { id: number; externalId?: string | null; conversationId: number }>(messages: T[]): T[] {
  const positions = new Map<string, number>();
  const result: T[] = [];
  for (const message of messages) {
    const key = `${message.conversationId}:${message.externalId || `local:${message.id}`}`;
    const position = positions.get(key);
    if (position === undefined) { positions.set(key, result.length); result.push(message); }
    else if (attributionRank(message) >= attributionRank(result[position])) {
      result[position] = { ...result[position], ...message };
    }
  }
  return result;
}
