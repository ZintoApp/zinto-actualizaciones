export type MediaCategory = 'media' | 'documents' | 'audio';
export type MediaDirection = 'all' | 'inbound' | 'outbound';
export type MediaSort = 'newest' | 'oldest';
export type ConversationMediaSummary = {
  categoryCounts: Record<MediaCategory, number>;
  totalCount: number;
  dateCounts: Record<string, number>;
};
export type ConversationMediaItem = {
  id: string;
  messageId: number;
  attachmentId: number | null;
  type: string;
  filename: string;
  size: number | null;
  createdAt: string;
  direction: string;
  previewUrl: string;
  downloadUrl: string;
  thumbnailUrl: string | null;
};
export type ConversationMediaPage = {
  items: ConversationMediaItem[];
  nextCursor: string | null;
  hasMore: boolean;
  summary?: ConversationMediaSummary;
};
export type ConversationUploadLimits = {
  planMaxBytes: number | null;
  channelMaxBytes: Partial<Record<string, number>>;
};
export const MB = 1024 * 1024;
export function mediaTypeForMime(mime: string): string {
  return ['image', 'video', 'audio'].find(type => mime.startsWith(`${type}/`)) || 'document';
}
export function effectiveUploadLimit(limits: ConversationUploadLimits, type: string) {
  const channel = limits.channelMaxBytes[type === 'voice' ? 'audio' : type] ?? null;
  const plan = limits.planMaxBytes;
  return channel !== null && (plan === null || channel < plan)
    ? { maxBytes: channel, source: 'channel' as const }
    : { maxBytes: plan, source: 'plan' as const };
}
export function uploadSizeError(limits: ConversationUploadLimits, type: string, size: number) {
  const limit = effectiveUploadLimit(limits, type);
  if (limit.maxBytes === null || size <= limit.maxBytes) return null;
  return {
    code: 'FILE_TOO_LARGE',
    message: `Maximum file size is ${limit.maxBytes / MB} MB (${limit.source} limit).`,
    maxBytes: limit.maxBytes,
    source: limit.source,
  };
}
