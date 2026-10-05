import {
  HttpBodyType,
  HttpFormDataRow,
  HttpKeyValueRow,
  HttpRawLanguage,
  HttpRequestConfig,
  MapRequestResult,
  ParsedRequest,
  VariableMappingChoice
} from './types';

const API_KEY_HEADER_NAMES = new Set([
  'x-api-key',
  'api-key',
  'apikey',
  'x-api-token',
  'api_key'
]);

/** Decode base64 in Node or browser. */
function decodeBase64Utf8(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Strip block and line comments from JSON-like text.
 * Returns cleaned text and count of comment regions removed.
 */
export function stripJsonComments(input: string): { text: string; removed: number } {
  let removed = 0;
  let out = '';
  let i = 0;
  let inString = false;
  let stringQuote: '"' | "'" | null = null;
  let escaped = false;

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      removed += 1;
      i += 2;
      while (i < input.length - 1 && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2; // skip */
      continue;
    }

    if (ch === '/' && next === '/') {
      removed += 1;
      i += 2;
      while (i < input.length && input[i] !== '\n' && input[i] !== '\r') i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  // Tidy trailing commas before } or ] that comments sometimes leave awkward
  return { text: out, removed };
}

function applyVariableMappings(text: string, choices: VariableMappingChoice[]): string {
  if (!text || choices.length === 0) return text;
  let result = text;
  for (const choice of choices) {
    if (choice.action === 'leave') continue;
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(choice.name)}\\s*\\}\\}`, 'g');
    if (choice.action === 'literal') {
      result = result.replace(pattern, choice.value ?? '');
    } else if (choice.action === 'flow') {
      const flowName = (choice.value || choice.name).trim();
      result = result.replace(pattern, `{{${flowName}}}`);
    }
  }
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapLanguage(lang?: string): HttpRawLanguage {
  const l = (lang || 'text').toLowerCase();
  if (l === 'json') return 'json';
  if (l === 'xml') return 'xml';
  if (l === 'html') return 'html';
  if (l === 'javascript' || l === 'js') return 'javascript';
  return 'text';
}

function emptyConfig(): HttpRequestConfig {
  return {
    url: '',
    method: 'GET',
    headers: [],
    params: [],
    bodyType: 'none',
    body: '',
    rawLanguage: 'json',
    urlencoded: [],
    formdata: [],
    binaryUrl: '',
    graphqlQuery: '',
    graphqlVariables: '',
    authType: 'none',
    authToken: '',
    authUsername: '',
    authPassword: '',
    authApiKey: '',
    authApiKeyHeader: 'X-API-Key'
  };
}

function toRows(rows: Array<{ key: string; value: string; enabled: boolean }>): HttpKeyValueRow[] {
  return rows.map((r) => ({ key: r.key, value: r.value, enabled: r.enabled !== false }));
}

/**
 * Map a parsed Postman request into HTTP node request config.
 */
export function mapPostmanRequestToHttpConfig(
  request: ParsedRequest,
  variableChoices: VariableMappingChoice[] = []
): MapRequestResult {
  const warnings: string[] = [];
  const config = emptyConfig();
  const mapText = (s: string) => applyVariableMappings(s, variableChoices);

  config.method = (request.method || 'GET').toUpperCase();
  config.url = mapText(request.url || '');
  config.params = request.params.map((p) => ({
    key: mapText(p.key),
    value: mapText(p.value),
    enabled: p.enabled !== false
  }));

  // --- Auth: structured Postman auth first, then smart-map remaining headers ---
  let headers = request.headers.map((h) => ({
    key: h.key,
    value: mapText(h.value),
    enabled: h.enabled !== false
  }));

  const auth = request.auth;
  if (auth.type === 'bearer' && auth.bearerToken) {
    config.authType = 'bearer';
    config.authToken = mapText(auth.bearerToken);
  } else if (auth.type === 'basic') {
    config.authType = 'basic';
    config.authUsername = mapText(auth.basicUsername || '');
    config.authPassword = mapText(auth.basicPassword || '');
  } else if (auth.type === 'apikey' && auth.apiKey) {
    config.authType = 'apikey';
    config.authApiKey = mapText(auth.apiKey);
    config.authApiKeyHeader = auth.apiKeyHeader || 'X-API-Key';
  } else {
    // Smart-map from enabled headers only (disabled auth-like rows stay as disabled headers)
    const next: HttpKeyValueRow[] = [];
    for (const h of headers) {
      if (h.enabled === false) {
        next.push(h);
        continue;
      }
      const keyLower = h.key.trim().toLowerCase();
      const val = h.value.trim();

      if (keyLower === 'authorization' && /^bearer\s+/i.test(val)) {
        config.authType = 'bearer';
        config.authToken = val.replace(/^bearer\s+/i, '').trim();
        continue;
      }
      if (keyLower === 'authorization' && /^basic\s+/i.test(val)) {
        try {
          const decoded = decodeBase64Utf8(val.replace(/^basic\s+/i, '').trim());
          const colon = decoded.indexOf(':');
          config.authType = 'basic';
          config.authUsername = colon >= 0 ? decoded.slice(0, colon) : decoded;
          config.authPassword = colon >= 0 ? decoded.slice(colon + 1) : '';
        } catch {
          next.push(h);
        }
        continue;
      }
      if (API_KEY_HEADER_NAMES.has(keyLower) && val) {
        config.authType = 'apikey';
        config.authApiKey = val;
        config.authApiKeyHeader = h.key.trim() || 'X-API-Key';
        continue;
      }
      next.push(h);
    }
    headers = next;
  }

  // If structured/smart auth was set, strip matching *enabled* auth headers from list
  if (config.authType !== 'none') {
    headers = headers.filter((h) => {
      if (h.enabled === false) return true;
      const keyLower = h.key.trim().toLowerCase();
      if (config.authType === 'bearer' || config.authType === 'basic') {
        if (keyLower === 'authorization') return false;
      }
      if (config.authType === 'apikey') {
        if (keyLower === config.authApiKeyHeader.trim().toLowerCase()) return false;
        if (API_KEY_HEADER_NAMES.has(keyLower)) return false;
      }
      return true;
    });
  }

  config.headers = headers;

  // --- Body ---
  const body = request.body;
  let commentsRemoved = 0;

  if (body.mode === 'raw') {
    config.bodyType = 'raw';
    config.rawLanguage = mapLanguage(body.rawLanguage);
    let raw = mapText(body.raw || '');
    if (config.rawLanguage === 'json') {
      const stripped = stripJsonComments(raw);
      raw = stripped.text;
      commentsRemoved = stripped.removed;
    }
    config.body = raw;
  } else if (body.mode === 'urlencoded') {
    config.bodyType = 'urlencoded';
    config.urlencoded = toRows(
      (body.urlencoded || []).map((r) => ({
        key: mapText(r.key),
        value: mapText(r.value),
        enabled: r.enabled !== false
      }))
    );
  } else if (body.mode === 'formdata') {
    config.bodyType = 'formdata';
    const formdata: HttpFormDataRow[] = [];
    for (const r of body.formdata || []) {
      if (r.type === 'file') {
        formdata.push({
          key: mapText(r.key),
          value: '',
          enabled: r.enabled !== false,
          type: 'file'
        });
        warnings.push(
          `File field "${r.key}" was not included in the export — set a URL/path manually.`
        );
      } else {
        formdata.push({
          key: mapText(r.key),
          value: mapText(r.value),
          enabled: r.enabled !== false,
          type: 'text'
        });
      }
    }
    config.formdata = formdata;
  } else if (body.mode === 'file') {
    config.bodyType = 'binary';
    config.binaryUrl = '';
    warnings.push('File body was not included in the export — set a URL/path manually.');
  } else if (body.mode === 'graphql') {
    config.bodyType = 'graphql';
    config.graphqlQuery = mapText(body.graphql?.query || '');
    config.graphqlVariables = mapText(body.graphql?.variables || '');
  } else {
    config.bodyType = 'none';
  }

  return { config, warnings, commentsRemoved };
}

/**
 * Collect distinct {{var}} names from a request (pre-mapping).
 */
export function collectPostmanVariables(request: ParsedRequest): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const scan = (text: string) => {
    if (!text) return;
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, 'g');
    while ((m = local.exec(text))) {
      found.add(m[1].trim());
    }
  };

  scan(request.url);
  scan(request.urlRaw || '');
  for (const p of request.params) {
    scan(p.key);
    scan(p.value);
  }
  for (const h of request.headers) {
    scan(h.key);
    scan(h.value);
  }
  if (request.auth.bearerToken) scan(request.auth.bearerToken);
  if (request.auth.basicUsername) scan(request.auth.basicUsername);
  if (request.auth.basicPassword) scan(request.auth.basicPassword);
  if (request.auth.apiKey) scan(request.auth.apiKey);
  if (request.body.raw) scan(request.body.raw);
  for (const r of request.body.urlencoded || []) {
    scan(r.key);
    scan(r.value);
  }
  for (const r of request.body.formdata || []) {
    scan(r.key);
    scan(r.value);
  }
  if (request.body.graphql) {
    scan(request.body.graphql.query);
    scan(request.body.graphql.variables);
  }

  return [...found];
}

/**
 * Build request-config patch for apply-to-node (excludes flow settings / label).
 */
export function requestConfigToNodeDataPatch(config: HttpRequestConfig): Record<string, unknown> {
  return {
    url: config.url,
    method: config.method,
    headers: config.headers,
    params: config.params,
    bodyType: config.bodyType,
    body: config.body,
    rawLanguage: config.rawLanguage,
    urlencoded: config.urlencoded,
    formdata: config.formdata,
    binaryUrl: config.binaryUrl,
    graphqlQuery: config.graphqlQuery,
    graphqlVariables: config.graphqlVariables,
    authType: config.authType,
    authToken: config.authToken,
    authUsername: config.authUsername,
    authPassword: config.authPassword,
    authApiKey: config.authApiKey,
    authApiKeyHeader: config.authApiKeyHeader
  };
}

export function uniqueNodeLabel(baseName: string, existingLabels: string[]): string {
  const names = new Set(existingLabels.map((l) => l.trim().toLowerCase()));
  if (!names.has(baseName.trim().toLowerCase())) return baseName;
  let n = 2;
  while (names.has(`${baseName} (${n})`.toLowerCase())) n += 1;
  return `${baseName} (${n})`;
}

/** Suggest Content-Type for a body type when none is present. */
export function suggestedContentType(bodyType: HttpBodyType, rawLanguage?: HttpRawLanguage): string | null {
  switch (bodyType) {
    case 'raw':
      if (rawLanguage === 'json') return 'application/json';
      if (rawLanguage === 'xml') return 'application/xml';
      if (rawLanguage === 'html') return 'text/html';
      if (rawLanguage === 'javascript') return 'application/javascript';
      return 'text/plain';
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'formdata':
      return 'multipart/form-data';
    case 'binary':
      return 'application/octet-stream';
    case 'graphql':
      return 'application/json';
    default:
      return null;
  }
}

/**
 * Auto-suggest Content-Type header if missing (never overwrite).
 */
export function ensureContentTypeHeader(
  headers: HttpKeyValueRow[],
  bodyType: HttpBodyType,
  rawLanguage?: HttpRawLanguage
): HttpKeyValueRow[] {
  const hasCt = headers.some((h) => h.key.trim().toLowerCase() === 'content-type' && h.key.trim() !== '');
  if (hasCt) return headers;
  const suggested = suggestedContentType(bodyType, rawLanguage);
  if (!suggested || bodyType === 'none' || bodyType === 'formdata') {
    // multipart: let runtime set boundary — don't add bare multipart/form-data
    return headers;
  }
  return [...headers, { key: 'Content-Type', value: suggested, enabled: true }];
}
