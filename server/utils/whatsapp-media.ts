import path from 'path';
import mimeTypes from 'mime-types';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MIME_EXTENSION_OVERRIDES: Record<string, string> = {
  'audio/ogg': '.ogg',
  'image/jpeg': '.jpg',
};

function normalizeMimeType(mimeType?: string | null): string | null {
  if (!mimeType || typeof mimeType !== 'string') return null;
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase();
  return normalized || null;
}

function getExtensionFromMimeType(mimeType?: string | null): string | null {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return null;

  if (MIME_EXTENSION_OVERRIDES[normalized]) {
    return MIME_EXTENSION_OVERRIDES[normalized];
  }

  const extension = mimeTypes.extension(normalized);
  return typeof extension === 'string' && extension ? `.${extension.toLowerCase()}` : null;
}

function getExtensionFromUrl(downloadUrl?: string | null): string | null {
  if (!downloadUrl) return null;

  try {
    const pathname = new URL(downloadUrl).pathname;
    const extension = path.extname(pathname);
    return extension ? extension.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function resolveWhatsAppMediaFileExtension({
  metadataMimeType,
  responseMimeType,
  downloadUrl,
  fallbackExtension,
}: {
  metadataMimeType?: string | null;
  responseMimeType?: string | null;
  downloadUrl?: string | null;
  fallbackExtension: string;
}): string {
  const fallback = fallbackExtension.startsWith('.')
    ? fallbackExtension.toLowerCase()
    : `.${fallbackExtension.toLowerCase()}`;

  return (
    getExtensionFromMimeType(responseMimeType) ||
    getExtensionFromMimeType(metadataMimeType) ||
    getExtensionFromUrl(downloadUrl) ||
    fallback
  );
}

export function normalizeStoredMediaUrl(mediaUrl?: string | null): string | null | undefined {
  if (mediaUrl == null) return mediaUrl;
  if (typeof mediaUrl !== 'string') return mediaUrl;

  const trimmed = mediaUrl.trim();
  if (!trimmed) return trimmed;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      LOOPBACK_HOSTS.has(parsed.hostname) &&
      (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/media/'))
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}