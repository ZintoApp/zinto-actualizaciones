import {
  AuthSource,
  KeyValueRow,
  ParsedAuth,
  ParsedBody,
  ParsedCollection,
  ParsedEnvironment,
  ParsedFormDataRow,
  ParsedRequest,
  PickerNode,
  PostmanParseError,
  PostmanSchemaVersion
} from './types';

type Json = Record<string, unknown>;

function asObj(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return String(v);
}

function detectSchemaVersion(schema: string | undefined): PostmanSchemaVersion | null {
  if (!schema) return null;
  const s = schema.toLowerCase();
  if (s.includes('collection/v2.1') || s.includes('collection/v2.1.0')) return '2.1';
  if (s.includes('collection/v2.0') || s.includes('collection/v2.0.0')) return '2.0';
  if (s.includes('collection/v1')) return null;
  // Some exports omit patch; treat v2.1 / v2.0 path fragments
  if (/\/v2\.1(\.0)?\//.test(s) || s.endsWith('v2.1.0/collection.json')) return '2.1';
  if (/\/v2\.0(\.0)?\//.test(s)) return '2.0';
  return null;
}

function parseKeyValueList(
  list: unknown,
  source?: AuthSource
): KeyValueRow[] {
  return asArr(list).map((item) => {
    const row = asObj(item) || {};
    const disabled = row.disabled === true;
    return {
      key: str(row.key),
      value: str(row.value),
      enabled: !disabled,
      description: row.description != null ? str(row.description) : undefined,
      source
    };
  });
}

function parseAuthFixed(raw: unknown, source: AuthSource): ParsedAuth | null {
  const auth = asObj(raw);
  if (!auth || auth.type == null) return null;
  const type = str(auth.type).toLowerCase();

  if (type === 'noauth' || type === 'none') {
    return { type: 'none', source };
  }

  const bucket = asArr(auth[type]);

  const get = (wanted: string): string => {
    for (const e of bucket) {
      const o = asObj(e);
      if (o && str(o.key).toLowerCase() === wanted.toLowerCase()) return str(o.value);
    }
    return '';
  };

  if (type === 'bearer') {
    return { type: 'bearer', source, bearerToken: get('token') };
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      source,
      basicUsername: get('username'),
      basicPassword: get('password')
    };
  }
  if (type === 'apikey') {
    return {
      type: 'apikey',
      source,
      apiKeyHeader: get('key') || 'X-API-Key',
      apiKey: get('value')
    };
  }

  return { type: 'other', source, otherType: type };
}

function resolveAuth(
  collectionAuth: ParsedAuth | null,
  folderAuthStack: Array<ParsedAuth | null>,
  requestAuth: ParsedAuth | null
): ParsedAuth {
  // Explicit request auth wins, including noauth (`type: 'none'`).
  if (requestAuth !== null) return requestAuth;
  for (let i = folderAuthStack.length - 1; i >= 0; i--) {
    const a = folderAuthStack[i];
    if (a && a.type !== 'none') return a;
  }
  if (collectionAuth && collectionAuth.type !== 'none') return collectionAuth;
  return { type: 'none', source: 'request' };
}

function parseUrl(urlField: unknown): {
  baseUrl: string;
  raw: string;
  params: KeyValueRow[];
} {
  if (typeof urlField === 'string') {
    const raw = urlField;
    try {
      const u = new URL(raw);
      const params: KeyValueRow[] = [];
      u.searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true, source: 'request' });
      });
      u.search = '';
      return { baseUrl: u.toString().replace(/\/$/, '') === u.origin ? u.toString() : stripTrailingQuestion(u.toString()), raw, params };
    } catch {
      const q = raw.indexOf('?');
      if (q >= 0) {
        return {
          baseUrl: raw.slice(0, q),
          raw,
          params: parseQueryString(raw.slice(q + 1))
        };
      }
      return { baseUrl: raw, raw, params: [] };
    }
  }

  const url = asObj(urlField);
  if (!url) return { baseUrl: '', raw: '', params: [] };

  const raw = str(url.raw);
  const query = parseKeyValueList(url.query, 'request');

  if (raw) {
    const q = raw.indexOf('?');
    const baseUrl = q >= 0 ? raw.slice(0, q) : raw;
    // Prefer structured query when present; else parse from raw
    const params = query.length > 0 ? query : q >= 0 ? parseQueryString(raw.slice(q + 1)) : [];
    return { baseUrl, raw, params };
  }

  const protocol = str(url.protocol) || 'https';
  const host = asArr(url.host).map((v) => str(v)).join('.');
  const path = asArr(url.path).map((v) => str(v)).join('/');
  const baseUrl = host ? `${protocol}://${host}${path ? '/' + path : ''}` : '';
  return { baseUrl, raw: baseUrl, params: query };
}

function stripTrailingQuestion(s: string): string {
  return s.endsWith('?') ? s.slice(0, -1) : s;
}

function parseQueryString(qs: string): KeyValueRow[] {
  if (!qs) return [];
  return qs.split('&').filter(Boolean).map((part) => {
    const eq = part.indexOf('=');
    if (eq < 0) return { key: decodeURIComponent(part), value: '', enabled: true, source: 'request' as const };
    return {
      key: decodeURIComponent(part.slice(0, eq)),
      value: decodeURIComponent(part.slice(eq + 1)),
      enabled: true,
      source: 'request' as const
    };
  });
}

function parseBody(bodyField: unknown): ParsedBody {
  const body = asObj(bodyField);
  if (!body || !body.mode) return { mode: 'none' };

  const mode = str(body.mode).toLowerCase();

  if (mode === 'raw') {
    const options = asObj(body.options);
    const rawOpts = options ? asObj(options.raw) : null;
    return {
      mode: 'raw',
      raw: str(body.raw),
      rawLanguage: rawOpts ? str(rawOpts.language, 'text') : 'text'
    };
  }

  if (mode === 'urlencoded') {
    return { mode: 'urlencoded', urlencoded: parseKeyValueList(body.urlencoded, 'request') };
  }

  if (mode === 'formdata') {
    const formdata: ParsedFormDataRow[] = asArr(body.formdata).map((item) => {
      const row = asObj(item) || {};
      const disabled = row.disabled === true;
      const type = str(row.type, 'text').toLowerCase() === 'file' ? 'file' : 'text';
      const src =
        type === 'file'
          ? Array.isArray(row.src)
            ? str(row.src[0])
            : str(row.src)
          : undefined;
      return {
        key: str(row.key),
        value: type === 'file' ? '' : str(row.value),
        enabled: !disabled,
        type,
        src,
        source: 'request' as const
      };
    });
    return { mode: 'formdata', formdata };
  }

  if (mode === 'file') {
    const file = asObj(body.file);
    const src = file
      ? Array.isArray(file.src)
        ? str(file.src[0])
        : str(file.src)
      : str(body.src);
    return { mode: 'file', fileSrc: src };
  }

  if (mode === 'graphql') {
    const gql = asObj(body.graphql) || {};
    return {
      mode: 'graphql',
      graphql: {
        query: str(gql.query),
        variables: typeof gql.variables === 'string' ? gql.variables : JSON.stringify(gql.variables ?? {}, null, 2)
      }
    };
  }

  return { mode: 'none' };
}

function collectVariables(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of asArr(list)) {
    const row = asObj(item);
    if (!row) continue;
    const key = str(row.key);
    if (!key) continue;
    if (row.disabled === true) continue;
    out[key] = str(row.value);
  }
  return out;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

/**
 * Parse a Postman Collection v2.1 or v2.0 JSON object / string.
 */
export function parsePostmanCollection(input: unknown): ParsedCollection {
  idCounter = 0;
  let root: unknown = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch {
      throw new PostmanParseError('Invalid JSON. Paste a valid Postman Collection export.');
    }
  }

  const collection = asObj(root);
  if (!collection) {
    throw new PostmanParseError('Invalid collection: expected a JSON object.');
  }

  const info = asObj(collection.info) || {};
  const schema = str(info.schema);
  const schemaVersion = detectSchemaVersion(schema);

  if (!schemaVersion) {
    if (schema && /collection\/v1/i.test(schema)) {
      throw new PostmanParseError(
        'Collection v1 is not supported. Export as Collection v2.1 (or v2.0) from Postman.'
      );
    }
    if (!schema) {
      throw new PostmanParseError(
        'Missing collection schema. Export as Collection v2.1 or v2.0 from Postman (info.schema required).'
      );
    }
    throw new PostmanParseError(
      `Unsupported Postman schema. Export as Collection v2.1 or v2.0. Got: ${schema}`
    );
  }

  if (!Array.isArray(collection.item)) {
    throw new PostmanParseError(
      'Not a Postman Collection. Expected schema v2.1 or v2.0 with an item[] array.'
    );
  }

  const version: PostmanSchemaVersion = schemaVersion;
  const collectionAuth = parseAuthFixed(collection.auth, 'collection');
  const variables = collectVariables(collection.variable);

  const requests: ParsedRequest[] = [];
  const tree: PickerNode[] = [];

  function walk(
    items: unknown[],
    folderPath: string[],
    folderAuthStack: Array<ParsedAuth | null>,
    parentTree: PickerNode[]
  ) {
    for (const item of items) {
      const node = asObj(item);
      if (!node) continue;

      const name = str(node.name, 'Untitled');
      const hasRequest = node.request != null;
      const children = asArr(node.item);

      if (hasRequest) {
        const req = asObj(node.request) || {};
        const requestAuth = parseAuthFixed(req.auth ?? node.auth, 'request');
        const auth = resolveAuth(collectionAuth, folderAuthStack, requestAuth);
        const { baseUrl, raw, params } = parseUrl(req.url);
        const headers = parseKeyValueList(req.header, 'request');
        const method = str(req.method, 'GET').toUpperCase();
        const body = parseBody(req.body);
        const id = nextId('req');

        requests.push({
          id,
          name,
          folderPath: [...folderPath],
          method,
          url: baseUrl,
          urlRaw: raw,
          params,
          headers,
          auth,
          body
        });

        parentTree.push({
          id: nextId('pick'),
          name,
          type: 'request',
          requestId: id
        });
      } else if (children.length > 0) {
        const folderAuth = parseAuthFixed(node.auth, 'folder');
        const folderNode: PickerNode = {
          id: nextId('folder'),
          name,
          type: 'folder',
          children: []
        };
        parentTree.push(folderNode);
        walk(children, [...folderPath, name], [...folderAuthStack, folderAuth], folderNode.children!);
      }
    }
  }

  walk(asArr(collection.item), [], [], tree);

  return {
    name: str(info.name, 'Collection'),
    schemaVersion: version,
    tree,
    requests,
    variables
  };
}

/**
 * Parse an optional Postman Environment JSON object / string.
 */
export function parsePostmanEnvironment(input: unknown): ParsedEnvironment {
  let root: unknown = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch {
      throw new PostmanParseError('Invalid environment JSON.');
    }
  }

  const env = asObj(root);
  if (!env) {
    throw new PostmanParseError('Invalid environment: expected a JSON object.');
  }

  // Environments have values[]; collections mistaken as env lack that shape
  if (!Array.isArray(env.values) && env.info != null) {
    throw new PostmanParseError(
      'This looks like a collection, not an environment. Use a .postman_environment.json export.'
    );
  }

  const values: Record<string, string> = {};
  for (const item of asArr(env.values)) {
    const row = asObj(item);
    if (!row) continue;
    if (row.enabled === false || row.disabled === true) continue;
    const key = str(row.key);
    if (!key) continue;
    values[key] = str(row.value);
  }

  return {
    name: str(env.name, 'Environment'),
    values
  };
}

/** @internal exported for tests */
export const _test = { detectSchemaVersion, parseAuthFixed, parseUrl, parseBody };
