import {
  HttpBodyType,
  HttpFormDataRow,
  HttpKeyValueRow,
  HttpRawLanguage,
  HttpRequestConfig
} from './types';

/**
 * Normalize legacy HTTP node data (string body only) into the extended request config shape.
 */
export function normalizeHttpNodeData(data: Record<string, unknown> | null | undefined): HttpRequestConfig {
  const d = data || {};
  const headersRaw = Array.isArray(d.headers) ? d.headers : [];
  const headers: HttpKeyValueRow[] = headersRaw.map((h: any) => ({
    key: String(h?.key ?? ''),
    value: String(h?.value ?? ''),
    enabled: h?.enabled !== false
  }));

  const paramsRaw = Array.isArray(d.params)
    ? d.params
    : d.params && typeof d.params === 'object'
      ? Object.entries(d.params as Record<string, unknown>).map(([key, value]) => ({
          key,
          value: String(value ?? ''),
          enabled: true
        }))
      : [];

  const params: HttpKeyValueRow[] = paramsRaw.map((p: any) => ({
    key: String(p?.key ?? ''),
    value: String(p?.value ?? ''),
    enabled: p?.enabled !== false
  }));

  let bodyType = (d.bodyType as HttpBodyType) || undefined;
  const body = typeof d.body === 'string' ? d.body : d.body != null ? JSON.stringify(d.body) : '';

  if (!bodyType) {
    if (body) bodyType = 'raw';
    else bodyType = 'none';
  }

  const formdata: HttpFormDataRow[] = Array.isArray(d.formdata)
    ? d.formdata.map((r: any) => ({
        key: String(r?.key ?? ''),
        value: String(r?.value ?? ''),
        enabled: r?.enabled !== false,
        type: r?.type === 'file' ? 'file' : 'text'
      }))
    : [];

  const urlencoded: HttpKeyValueRow[] = Array.isArray(d.urlencoded)
    ? d.urlencoded.map((r: any) => ({
        key: String(r?.key ?? ''),
        value: String(r?.value ?? ''),
        enabled: r?.enabled !== false
      }))
    : [];

  return {
    url: String(d.url ?? ''),
    method: String(d.method ?? 'GET').toUpperCase(),
    headers,
    params,
    bodyType,
    body,
    rawLanguage: (d.rawLanguage as HttpRawLanguage) || 'json',
    urlencoded,
    formdata,
    binaryUrl: String(d.binaryUrl ?? ''),
    graphqlQuery: String(d.graphqlQuery ?? ''),
    graphqlVariables: String(d.graphqlVariables ?? ''),
    authType: (d.authType as HttpRequestConfig['authType']) || 'none',
    authToken: String(d.authToken ?? ''),
    authUsername: String(d.authUsername ?? ''),
    authPassword: String(d.authPassword ?? ''),
    authApiKey: String(d.authApiKey ?? ''),
    authApiKeyHeader: String(d.authApiKeyHeader ?? 'X-API-Key')
  };
}

/**
 * Build final URL from base + enabled query params.
 */
export function buildUrlWithParams(baseUrl: string, params: HttpKeyValueRow[]): string {
  const enabled = params.filter((p) => p.enabled !== false && p.key.trim());
  if (enabled.length === 0) return baseUrl;

  try {
    const u = new URL(baseUrl);
    for (const p of enabled) {
      u.searchParams.append(p.key.trim(), p.value);
    }
    return u.toString();
  } catch {
    const qs = enabled
      .map((p) => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value)}`)
      .join('&');
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}${qs}`;
  }
}

export function enabledHeadersToRecord(headers: HttpKeyValueRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (h.enabled === false) continue;
    const key = h.key.trim();
    if (!key) continue;
    out[key] = h.value;
  }
  return out;
}
