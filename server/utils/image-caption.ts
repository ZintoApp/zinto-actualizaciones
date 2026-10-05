const IMAGE_CAPTION_PLACEHOLDERS = new Set([
  'image message',
  '[image]',
  'image',
  'photo',
  'photo message'
]);

export function normalizeImageCaption(content: string | null | undefined): string | null {
  const trimmed = (content || '').trim();
  if (!trimmed) return null;
  if (IMAGE_CAPTION_PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}
