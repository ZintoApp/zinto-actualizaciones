import net from 'net';
import { isPrivateOrReservedIP } from './is-private-or-reserved-ip';

export const META_CDN_HOST_ALLOWLIST = new Set<string>([
  'lookaside.facebook.com',
  'lookaside.instagram.com',
  'fbsbx.com',
  'fbcdn.net',
  'cdninstagram.com'
]);

export function normalizeRemoteHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '');
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
}

export function hasAllowedHostSuffix(hostname: string, allowlist: Set<string>): boolean {
  for (const allowedHost of allowlist) {
    if (hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)) {
      return true;
    }
  }
  return false;
}

export function isBlockedRemoteHostname(hostname: string): boolean {
  const normalized = normalizeRemoteHostname(hostname);
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;

  if (net.isIP(normalized)) {
    return isPrivateOrReservedIP(normalized);
  }

  return false;
}

export function isMetaCdnMediaUrl(urlValue: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) return false;
  if (parsedUrl.username || parsedUrl.password) return false;

  const normalizedHostname = normalizeRemoteHostname(parsedUrl.hostname);
  if (!normalizedHostname) return false;
  if (!hasAllowedHostSuffix(normalizedHostname, META_CDN_HOST_ALLOWLIST)) return false;
  return !isBlockedRemoteHostname(normalizedHostname);
}
