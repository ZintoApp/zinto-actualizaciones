import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import net from 'net';
import { isPrivateOrReservedIP } from '../utils/is-private-or-reserved-ip';

export type FlowHttpRequestResult = {
  status: number;
  statusText: string;
  data: unknown;
  headers: Record<string, string>;
  /** URL after any redirects */
  finalUrl: string;
  durationMs: number;
  retryAttempts: number;
};

export type FlowHttpRequestOptions = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
  followRedirects?: boolean;
  retryCount?: number;
  retryDelay?: number;
  responseType?: string;
  /** When true, only http(s) URLs are allowed; hostnames are resolved and blocked if any IP is private/reserved; each redirect target is re-validated; connections bind to the validated IP (no second DNS lookup). */
  ssrfGuard?: boolean;
  /** When set with ssrfGuard, replaces DNS resolution (used by tests). */
  ssrfDnsOverride?: (hostname: string) => Promise<string[]>;
};

const MAX_REDIRECTS = 20;

async function resolveAllAddresses(hostname: string): Promise<string[]> {
  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[])
  ]);
  const combined = [...v4, ...v6];
  if (combined.length > 0) return combined;
  const lookedUp = await dns.lookup(hostname, { all: true, verbatim: true });
  return lookedUp.map((e) => e.address);
}

/**
 * Parses and validates an absolute http(s) URL for outbound requests (SSRF mitigation).
 * For hostnames: resolves DNS once, ensures every address is public, returns a single pinned IP
 * so the transport connects to that IP without a second resolution (mitigates DNS rebinding).
 */
async function prepareSsrfOutboundRequest(
  rawUrl: string,
  dnsOverride?: (hostname: string) => Promise<string[]>
): Promise<{ mode: 'direct' } | { mode: 'pinned'; pinnedIp: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  const host = parsed.hostname;
  if (!host) {
    throw new Error('Invalid URL: missing host');
  }

  const normalizedHost = host.toLowerCase();
  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) {
    throw new Error('URL host is not allowed: private, loopback, or reserved address');
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isPrivateOrReservedIP(host)) {
      throw new Error('URL host is not allowed: private, loopback, or reserved address');
    }
    return { mode: 'direct' };
  }

  let addresses: string[];
  try {
    addresses = dnsOverride ? await dnsOverride(host) : await resolveAllAddresses(host);
  } catch {
    throw new Error('Could not resolve hostname');
  }

  if (addresses.length === 0) {
    throw new Error('Could not resolve hostname');
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIP(addr)) {
      throw new Error('URL host is not allowed: private, loopback, or reserved address');
    }
  }

  const sorted = [...addresses].sort();
  const pinnedIp = sorted[0]!;
  return { mode: 'pinned', pinnedIp };
}

/**
 * Validates an absolute http(s) URL for outbound fetch (SSRF mitigation).
 * Resolves DNS and rejects if any resolved address is loopback/private/link-local/reserved.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  await prepareSsrfOutboundRequest(rawUrl);
}

function parseResponseBody(
  responseText: string,
  responseType: string | undefined,
  contentType: string
): unknown {
  const rt = responseType || 'auto';
  if (rt === 'json') {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }
  if (rt === 'text' || rt === 'xml') {
    return responseText;
  }
  if (rt === 'auto') {
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    }
    return responseText;
  }
  return responseText;
}

function flattenOutgoingHeaders(
  headers: Record<string, string> | undefined
): http.OutgoingHttpHeaders {
  if (!headers) return {};
  const out: http.OutgoingHttpHeaders = { ...headers };
  return out;
}

/**
 * Connects to the pre-validated IP for this URL (no hostname DNS lookup). Preserves Host and TLS SNI
 * from the original URL hostname so HTTP/TLS semantics match a normal client.
 */
function fetchOncePinnedToValidatedIp(
  absoluteUrl: string,
  init: { method: string; headers?: Record<string, string>; body?: string | Buffer },
  timeoutMs: number,
  pinnedIp: string
): Promise<Response> {
  const u = new URL(absoluteUrl);
  const isHttps = u.protocol === 'https:';
  const lib = isHttps ? https : http;
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
  const pathWithQuery = u.pathname + u.search;

  const headers = flattenOutgoingHeaders(init.headers);
  const hostHeader = u.host;
  if (!headers.host && !headers.Host) {
    headers.host = hostHeader;
  }

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const cleanup = () => clearTimeout(timeoutId);

    const reqOptions: https.RequestOptions = {
      // Raw IPv4 / IPv6 literal (never bracketed); Host + TLS SNI stay on the original hostname.
      hostname: pinnedIp,
      port,
      path: pathWithQuery,
      method: init.method,
      headers,
      // SNI + cert verification name when connecting by IP
      servername: isHttps ? u.hostname : undefined
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        cleanup();
        if (controller.signal.aborted) {
          reject(new Error(`HTTP request timeout after ${timeoutMs}ms`));
          return;
        }
        const text = Buffer.concat(chunks);
        const hdrs = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) v.forEach((x) => hdrs.append(k, x));
          else hdrs.set(k, v);
        }
        resolve(
          new Response(text, {
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: hdrs
          })
        );
      });
      res.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });

    req.on('error', (err) => {
      cleanup();
      if (controller.signal.aborted && err.message.includes('aborted')) {
        reject(new Error(`HTTP request timeout after ${timeoutMs}ms`));
        return;
      }
      reject(err);
    });

    controller.signal.addEventListener('abort', () => {
      req.destroy();
    });

    const body = init.method === 'GET' || init.method === 'HEAD' ? undefined : init.body;
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function fetchOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  ssrfPinned?: { pinnedIp: string }
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();

  if (ssrfPinned) {
    const headersObj: Record<string, string> = {};
    if (init.headers) {
      const h = new Headers(init.headers as HeadersInit);
      h.forEach((value, key) => {
        headersObj[key] = value;
      });
    }
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : init.body != null
          ? Buffer.isBuffer(init.body)
            ? init.body
            : typeof init.body === 'string'
              ? init.body
              : Buffer.isBuffer((init as any).body)
                ? (init as any).body
                : String(init.body)
          : undefined;
    return fetchOncePinnedToValidatedIp(
      url,
      { method, headers: headersObj, body: body as string | Buffer | undefined },
      timeoutMs,
      ssrfPinned.pinnedIp
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Returns true when an HTTP status should consume a retry (transient server / overload / timeout-style).
 *
 * Single-attempt (not retried for HTTP status): typical client 4xx such as 400, 401, 403, 404, 405, 409, 413, 414, 415, 422, etc.
 * Retried when retries remain: 408 Request Timeout, 429 Too Many Requests, and all 5xx.
 */
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

/**
 * Shared HTTP implementation for flow HTTP nodes and tests: retries, redirects, responseType, optional SSRF checks on every hop.
 */
export async function performFlowHttpRequest(options: FlowHttpRequestOptions): Promise<FlowHttpRequestResult> {
  const {
    url: initialUrl,
    method,
    headers = {},
    body,
    timeout = 30000,
    followRedirects = true,
    retryCount = 0,
    retryDelay = 1000,
    responseType = 'auto',
    ssrfGuard = false,
    ssrfDnsOverride
  } = options;

  const maxAttempts = Math.max(1, (retryCount ?? 0) + 1);
  let totalRetryAttempts = 0;
  const overallStart = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let currentUrl = initialUrl;
      let redirectHops = 0;
      let reqMethod = method.toUpperCase();
      let reqBody: string | Buffer | undefined = body;
      let lastResponse!: Response;

      while (true) {
        let ssrfPinned: { pinnedIp: string } | undefined;
        if (ssrfGuard) {
          const prep = await prepareSsrfOutboundRequest(currentUrl, ssrfDnsOverride);
          if (prep.mode === 'pinned') {
            ssrfPinned = { pinnedIp: prep.pinnedIp };
          }
        }

        const response = await fetchOnce(
          currentUrl,
          {
            method: reqMethod,
            headers,
            body: reqMethod === 'GET' || reqMethod === 'HEAD' ? undefined : reqBody,
            redirect: 'manual'
          },
          timeout,
          ssrfPinned
        );

        const status = response.status;
        const location = response.headers.get('location');

        if (
          followRedirects &&
          location &&
          (status === 301 || status === 302 || status === 303 || status === 307 || status === 308)
        ) {
          if (redirectHops >= MAX_REDIRECTS) {
            throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
          }
          redirectHops++;
          currentUrl = new URL(location, currentUrl).href;
          if (status !== 307 && status !== 308) {
            reqMethod = 'GET';
            reqBody = undefined;
          }
          continue;
        }

        lastResponse = response;
        break;
      }

      const contentType = lastResponse.headers.get('content-type') || '';
      let data: unknown;
      if (responseType === 'binary') {
        const ab = await lastResponse.arrayBuffer();
        data = Buffer.from(ab);
      } else {
        const lastText = await lastResponse.text();
        data = parseResponseBody(lastText, responseType, contentType);
      }
      const responseHeaders: Record<string, string> = {};
      lastResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const durationMs = Date.now() - overallStart;

      const httpStatus = lastResponse.status;
      const shouldRetryForStatus =
        isRetryableHttpStatus(httpStatus) && attempt < maxAttempts;

      if (shouldRetryForStatus) {
        totalRetryAttempts++;
        await new Promise((r) => setTimeout(r, Math.max(0, retryDelay)));
        continue;
      }

      return {
        status: lastResponse.status,
        statusText: lastResponse.statusText,
        data,
        headers: responseHeaders,
        finalUrl: currentUrl,
        durationMs,
        retryAttempts: totalRetryAttempts
      };
    } catch (error) {
      if (attempt < maxAttempts) {
        totalRetryAttempts++;
        await new Promise((r) => setTimeout(r, Math.max(0, retryDelay)));
        continue;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`HTTP request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  throw new Error('HTTP request failed');
}
