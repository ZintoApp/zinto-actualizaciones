/** Limits keep the picker fast for huge JSON payloads. */
const MAX_DEPTH = 14;
const MAX_PATHS = 500;
const MAX_ARRAY_INDEXES = 40;

export type HttpResponseFieldPath = {
  path: string;
  preview: string;
  group: 'envelope' | 'data' | 'headers';
};

function summarizeValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v.length > 48 ? `${v.slice(0, 48)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `array(${v.length})`;
  return 'object';
}

function pushPath(
  out: HttpResponseFieldPath[],
  path: string,
  value: unknown,
  group: HttpResponseFieldPath['group']
): void {
  if (out.length >= MAX_PATHS) return;
  out.push({ path, preview: summarizeValue(value), group });
}

function walk(
  value: unknown,
  prefix: string,
  group: HttpResponseFieldPath['group'],
  out: HttpResponseFieldPath[],
  depth: number
): void {
  if (out.length >= MAX_PATHS || depth > MAX_DEPTH) return;
  pushPath(out, prefix, value, group);

  if (value === null || value === undefined) return;
  if (typeof value !== 'object') return;

  if (Array.isArray(value)) {
    const n = Math.min(value.length, MAX_ARRAY_INDEXES);
    for (let i = 0; i < n; i++) {
      walk(value[i], `${prefix}.${i}`, group, out, depth + 1);
      if (out.length >= MAX_PATHS) return;
    }
    return;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key.includes('.')) continue;
    walk((value as Record<string, unknown>)[key], `${prefix}.${key}`, group, out, depth + 1);
    if (out.length >= MAX_PATHS) return;
  }
}

export type HttpTestResultShape = {
  success?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: unknown;
  duration?: number;
};

/**
 * Build dot-paths that match `getNestedValue` on the runtime HTTP envelope:
 * status, statusText, data, data.id, headers, headers.via, etc.
 */
export function buildHttpTestResponseFieldPaths(testResult: HttpTestResultShape): HttpResponseFieldPath[] {
  const out: HttpResponseFieldPath[] = [];

  if (testResult.status !== undefined) {
    pushPath(out, 'status', testResult.status, 'envelope');
  }
  if (testResult.statusText !== undefined) {
    pushPath(out, 'statusText', testResult.statusText, 'envelope');
  }
  pushPath(out, 'success', testResult.success ?? false, 'envelope');
  if (testResult.duration !== undefined) {
    pushPath(out, 'duration', testResult.duration, 'envelope');
  }

  let data = testResult.data;
  if (typeof data === 'string' && data.trim()) {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      pushPath(out, 'data', data, 'data');
      data = undefined;
    }
  }

  if (data !== undefined) {
    if (data !== null && typeof data === 'object') {
      walk(data, 'data', 'data', out, 0);
    } else {
      pushPath(out, 'data', data, 'data');
    }
  }

  const headers = testResult.headers;
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    walk(headers, 'headers', 'headers', out, 0);
  }

  const seen = new Set<string>();
  return out.filter((p) => {
    if (seen.has(p.path)) return false;
    seen.add(p.path);
    return true;
  });
}
