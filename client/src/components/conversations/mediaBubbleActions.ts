export type MediaBubbleAction = {
  kind: 'open';
  href: string;
  labelKey: 'message_bubble.open';
  labelFallback: 'Open';
};

export function getMediaBubbleAction(type: string | undefined, mediaUrl?: string): MediaBubbleAction | null {
  if (type === 'document' && mediaUrl) {
    return {
      kind: 'open',
      href: mediaUrl,
      labelKey: 'message_bubble.open',
      labelFallback: 'Open'
    };
  }

  return null;
}

export function getMediaDownloadUrl(type: string | undefined, messageId: number | undefined): string | null {
  return Number.isSafeInteger(messageId) && messageId! > 0 && ['image', 'video', 'audio', 'voice', 'sticker', 'document'].includes(type || '')
    ? `/api/messages/${messageId}/stream-media` : null;
}

export function getMediaPreviewUrl(
  type: string | undefined,
  messageId: number | undefined,
  revision?: number
): string | null {
  const downloadUrl = getMediaDownloadUrl(type, messageId);
  if (!downloadUrl) return null;

  const params = new URLSearchParams(type === 'image' ? { thumbnail: '1' } : { inline: '1' });
  if (revision !== undefined) params.set('v', String(revision));
  return `${downloadUrl}?${params.toString()}`;
}

export function getMediaInlineUrl(
  type: string | undefined,
  messageId: number | undefined,
  revision?: number
): string | null {
  const downloadUrl = getMediaDownloadUrl(type, messageId);
  if (!downloadUrl) return null;

  const params = new URLSearchParams({ inline: '1' });
  if (revision !== undefined) params.set('v', String(revision));
  return `${downloadUrl}?${params.toString()}`;
}

export function getRenderableMediaCaption(
  content: unknown,
  channelType?: string,
  direction?: string
): string | null {
  if (typeof content !== 'string' || !content.trim()) return null;
  const trimmed = content.trim();
  if (/^\[.+\]$/.test(trimmed) || /^Media file:/i.test(trimmed)) return null;
  if (channelType === 'instagram' && direction === 'outbound') return null;
  return content;
}
