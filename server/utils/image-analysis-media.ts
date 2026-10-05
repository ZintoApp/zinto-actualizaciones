export function isPlaceholderMediaUrl(mediaUrl: string): boolean {
  return /\/media\/placeholder-[^/]+\.svg$/i.test(mediaUrl) || mediaUrl.includes('placeholder-');
}

export function isSimulatedMediaUrl(mediaUrl: string): boolean {
  return /^simulated:/i.test(mediaUrl) || /\/media\/simulated-[^/]+/i.test(mediaUrl);
}

function normalizeAnalyzableMediaUrl(mediaUrl: string | null | undefined): string | null {
  const normalized = (mediaUrl || '').trim();
  if (!normalized || isPlaceholderMediaUrl(normalized) || isSimulatedMediaUrl(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizeAnalyzableMediaUrls(
  messageMediaUrl: string | null | undefined,
  metadataMediaUrl: string | null | undefined
): string[] {
  const urls = [
    normalizeAnalyzableMediaUrl(messageMediaUrl),
    normalizeAnalyzableMediaUrl(metadataMediaUrl)
  ].filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls));
}
