import type { Request } from 'express';

/** First hop in a comma-separated forwarded header chain (multi-proxy safe). */
export function firstForwardedHeaderValue(header: string | undefined): string | undefined {
  if (header == null || header === '') return undefined;
  const first = header.split(',')[0]?.trim();
  return first || undefined;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost');
}

function isPrivateIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second, third, fourth] = parts;
  // RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  // Loopback: 127.0.0.0/8
  // Link-local: 169.254.0.0/16
  // Non-routable: 0.0.0.0
  return (
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 0 && second === 0 && third === 0 && fourth === 0)
  );
}

export function isPubliclyReachableBaseUrl(baseUrl: string, requireHttps: boolean = false): boolean {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === 'your-domain.com' ||
      isLoopbackHost(hostname) ||
      isPrivateIpv4Host(hostname)
    ) {
      return false;
    }

    if ((requireHttps || process.env.NODE_ENV === 'production') && url.protocol !== 'https:') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizePublicUrl(url: URL): string {
  const shouldUpgradeToHttps = url.protocol === 'http:' && !isLoopbackHost(url.hostname);
  const protocol = shouldUpgradeToHttps ? 'https:' : url.protocol;
  return `${protocol}//${url.host}`;
}

export function publicBaseUrlFromEnv(): string | undefined {
  const raw = process.env.PUBLIC_URL || process.env.WEBHOOK_BASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return normalizePublicUrl(u);
  } catch {
    return undefined;
  }
}

/**
 * Public origin for Twilio signature validation: prefer explicit env config, then forwarded headers.
 * Use with `req.originalUrl` to build the full URL Twilio signed.
 */
export function getPublicBaseUrlFromRequest(req: Pick<Request, 'get' | 'protocol'>): string {
  const envUrl = publicBaseUrlFromEnv();
  if (envUrl) return envUrl;
  const proto =
    firstForwardedHeaderValue(req.get('x-forwarded-proto')) ?? req.protocol ?? 'https';
  const forwardedHost = firstForwardedHeaderValue(req.get('x-forwarded-host'));
  const hostHeader = firstForwardedHeaderValue(req.get('host'));
  const host = forwardedHost ?? hostHeader;
  if (host) {
    // Upgrade to https for non-localhost hosts — public domains should never use plain HTTP
    const hostname = host.split(':')[0] || host;
    const isLoopback = isLoopbackHost(hostname);
    const effectiveProto = (!isLoopback && proto === 'http') ? 'https' : proto;
    return `${effectiveProto}://${host}`;
  }
  return 'https://your-domain.com';
}

/**
 * Telegram `setWebhook` URL: use a saved `webhookUrl` from connection data when it is a valid http(s) URL,
 * otherwise fall back to this deployment's `/api/webhooks/telegram` endpoint.
 */
export function resolveTelegramWebhookCallbackUrl(
  connectionData: Record<string, unknown> | null | undefined,
  req: Pick<Request, 'get' | 'protocol'>
): string {
  const raw =
    connectionData && typeof connectionData['webhookUrl'] === 'string'
      ? connectionData['webhookUrl'].trim()
      : '';
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        return u.href.replace(/\/$/, '');
      }
    } catch {
      /* fall through */
    }
  }
  return `${getPublicBaseUrlFromRequest(req)}/api/webhooks/telegram`;
}
