import {
  HttpFormDataRow,
  HttpKeyValueRow,
  HttpRequestConfig
} from './types';
import { buildUrlWithParams, enabledHeadersToRecord } from './http-node-model';

export type EncodedHttpBody =
  | { kind: 'none' }
  | { kind: 'string'; contentType?: string; body: string }
  | { kind: 'urlencoded'; body: string; contentType: string }
  | {
      kind: 'multipart';
      fields: Array<{ name: string; value: string; type: 'text' | 'file' }>;
    }
  | { kind: 'binary'; url: string; contentType?: string };

export interface EncodedHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: EncodedHttpBody;
}

/**
 * Encode HTTP node config into a transport-ready request description.
 * Does not fetch binary/file bytes — caller does that with SSRF guards.
 */
export function encodeHttpRequestConfig(
  config: HttpRequestConfig,
  replaceVariables: (s: string) => string = (s) => s
): EncodedHttpRequest {
  const method = (config.method || 'GET').toUpperCase();
  const baseUrl = replaceVariables(config.url || '');
  const params = config.params.map((p) => ({
    ...p,
    key: replaceVariables(p.key),
    value: replaceVariables(p.value)
  }));
  const url = buildUrlWithParams(baseUrl, params);

  const headers = enabledHeadersToRecord(
    config.headers.map((h) => ({
      ...h,
      key: replaceVariables(h.key),
      value: replaceVariables(h.value)
    }))
  );

  // Auth headers (caller may also merge; keep encode focused on body + params)
  if (config.authType === 'bearer' && config.authToken) {
    headers['Authorization'] = `Bearer ${replaceVariables(config.authToken)}`;
  } else if (config.authType === 'basic' && config.authUsername) {
    const u = replaceVariables(config.authUsername);
    const p = replaceVariables(config.authPassword || '');
    const token =
      typeof Buffer !== 'undefined'
        ? Buffer.from(`${u}:${p}`).toString('base64')
        : btoa(unescape(encodeURIComponent(`${u}:${p}`)));
    headers['Authorization'] = `Basic ${token}`;
  } else if (config.authType === 'apikey' && config.authApiKey) {
    const name = (config.authApiKeyHeader || 'X-API-Key').trim();
    if (name) headers[name] = replaceVariables(config.authApiKey);
  }

  const bodyType = config.bodyType || (config.body ? 'raw' : 'none');
  let body: EncodedHttpBody = { kind: 'none' };

  if (method !== 'GET' && method !== 'HEAD') {
    if (bodyType === 'raw') {
      const rawLang = config.rawLanguage || 'json';
      const suggested =
        rawLang === 'json'
          ? 'application/json'
          : rawLang === 'xml'
            ? 'application/xml'
            : rawLang === 'html'
              ? 'text/html'
              : rawLang === 'javascript'
                ? 'application/javascript'
                : 'text/plain';
      body = {
        kind: 'string',
        contentType: suggested,
        body: replaceVariables(config.body || '')
      };
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = suggested;
      }
    } else if (bodyType === 'graphql') {
      const query = replaceVariables(config.graphqlQuery || '');
      let variables: unknown = {};
      const rawVars = replaceVariables(config.graphqlVariables || '').trim();
      if (rawVars) {
        try {
          variables = JSON.parse(rawVars);
        } catch {
          variables = rawVars;
        }
      }
      body = {
        kind: 'string',
        contentType: 'application/json',
        body: JSON.stringify({ query, variables })
      };
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (bodyType === 'urlencoded') {
      const pairs = (config.urlencoded || []).filter((r) => r.enabled !== false && r.key.trim());
      const bodyStr = pairs
        .map(
          (r) =>
            `${encodeURIComponent(replaceVariables(r.key).trim())}=${encodeURIComponent(replaceVariables(r.value))}`
        )
        .join('&');
      body = {
        kind: 'urlencoded',
        body: bodyStr,
        contentType: 'application/x-www-form-urlencoded'
      };
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (bodyType === 'formdata') {
      const fields = (config.formdata || [])
        .filter((r: HttpFormDataRow) => r.enabled !== false && r.key.trim())
        .map((r) => ({
          name: replaceVariables(r.key).trim(),
          value: replaceVariables(r.value || ''),
          type: r.type === 'file' ? ('file' as const) : ('text' as const)
        }));
      body = { kind: 'multipart', fields };
      // Remove bare multipart Content-Type so runtime can set boundary
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'content-type' && /multipart\/form-data/i.test(headers[k]) && !/boundary=/i.test(headers[k])) {
          delete headers[k];
        }
      }
    } else if (bodyType === 'binary') {
      const fileUrl = replaceVariables(config.binaryUrl || '');
      body = { kind: 'binary', url: fileUrl };
    }
  }

  return { url, method, headers, body };
}

/** Encode urlencoded rows to a string (helper for tests). */
export function encodeUrlencoded(rows: HttpKeyValueRow[]): string {
  return rows
    .filter((r) => r.enabled !== false && r.key.trim())
    .map((r) => `${encodeURIComponent(r.key.trim())}=${encodeURIComponent(r.value)}`)
    .join('&');
}
