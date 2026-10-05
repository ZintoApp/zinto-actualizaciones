/**
 * Base URL used for resolving relative media paths (e.g. /media/image/xyz.jpg).
 * When the app is deployed with the frontend and API on the same origin, this is
 * the same as window.location.origin. When the frontend is served from a different
 * origin (e.g. CDN) than the API that serves /media, set VITE_APP_URL (or
 * VITE_PUBLIC_URL) to the API origin so media requests go to the correct server.
 */
export function getMediaBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const envBase =
    (import.meta as any).env?.VITE_APP_URL ||
    (import.meta as any).env?.VITE_PUBLIC_URL;
  if (envBase && typeof envBase === 'string') {
    return envBase.replace(/\/$/, '');
  }
  return window.location.origin;
}

export function normalizeLoopbackMediaUrlForBrowser(
  url: string | null | undefined,
  mediaBaseUrl: string = getMediaBaseUrl()
): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const isLoopbackHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    const isServedMediaPath = parsed.pathname.startsWith('/media/') || parsed.pathname.startsWith('/uploads/');
    const mediaBase = new URL(mediaBaseUrl);

    if (isLoopbackHost && isServedMediaPath) {
      return `${mediaBaseUrl}${parsed.pathname}${parsed.search}`;
    }

    const isHttpConfiguredMediaOrigin =
      parsed.protocol === 'http:' &&
      mediaBase.protocol === 'https:' &&
      parsed.origin === `http://${mediaBase.host}`;

    if (isHttpConfiguredMediaOrigin && isServedMediaPath) {
      return trimmed.replace(/^http:/, 'https:');
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

/**
 * Resolves a media URL to an absolute URL suitable for img/video/fetch.
 * Relative paths (e.g. /media/image/xyz.jpg) are resolved against the media base URL
 * so they work when the app is deployed on a domain (including when frontend and API
 * are on different origins). Absolute http(s) URLs are returned unchanged.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  const base = getMediaBaseUrl();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return normalizeLoopbackMediaUrlForBrowser(trimmed, base);
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

/**
 * Rewrite absolute app media URLs (/uploads, /media) to same-origin paths so the
 * browser can reuse HTTP disk cache after refresh (avoids tunnel/CDN host mismatches).
 */
export function toSameOriginAppMediaUrl(url: string | null | undefined): string {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return '';

  try {
    const parsed = new URL(resolved, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const isAppMedia =
      parsed.pathname.startsWith('/uploads/') ||
      parsed.pathname.startsWith('/media/');
    if (!isAppMedia) return resolved;

    if (typeof window !== 'undefined') {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return resolved;
  }
}

export function isAppServedMediaPath(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim(), typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/media/');
  } catch {
    const trimmed = url.trim();
    return trimmed.startsWith('/uploads/') || trimmed.startsWith('/media/');
  }
}

/**
 * Resolve app-served media through the tracked static media layer.
 * Use this for previews/downloads where the browser fetches `/media` or `/uploads`
 * directly instead of an API action.
 */
export function resolveTrackedMediaUrl(url: string | null | undefined): string {
  return toSameOriginAppMediaUrl(url);
}
