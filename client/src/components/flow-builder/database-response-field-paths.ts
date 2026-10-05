const MAX_DEPTH = 14;
const MAX_PATHS = 500;
const MAX_ARRAY_INDEXES = 40;

export type DatabaseResponseFieldPath = {
  path: string;
  preview: string;
  group: 'result' | 'rows';
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
  out: DatabaseResponseFieldPath[],
  path: string,
  value: unknown,
  group: DatabaseResponseFieldPath['group']
): void {
  if (out.length >= MAX_PATHS) return;
  out.push({ path, preview: summarizeValue(value), group });
}

function walk(
  value: unknown,
  prefix: string,
  group: DatabaseResponseFieldPath['group'],
  out: DatabaseResponseFieldPath[],
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

export type DatabaseTestResultShape = {
  success?: boolean;
  rows?: unknown[];
  rowCount?: number;
  rowsAffected?: number;
  command?: string;
  fields?: Array<{ name: string; type?: string }>;
  durationMs?: number;
  truncated?: boolean;
};

export function buildDatabaseTestResponseFieldPaths(
  testResult: DatabaseTestResultShape
): DatabaseResponseFieldPath[] {
  const out: DatabaseResponseFieldPath[] = [];

  if (testResult.rowCount !== undefined) {
    pushPath(out, 'rowCount', testResult.rowCount, 'result');
  }
  if (testResult.rowsAffected !== undefined) {
    pushPath(out, 'rowsAffected', testResult.rowsAffected, 'result');
  }
  if (testResult.command !== undefined) {
    pushPath(out, 'command', testResult.command, 'result');
  }
  if (testResult.durationMs !== undefined) {
    pushPath(out, 'durationMs', testResult.durationMs, 'result');
  }
  pushPath(out, 'truncated', testResult.truncated ?? false, 'result');

  const rows = testResult.rows;
  if (Array.isArray(rows)) {
    pushPath(out, 'rows', rows, 'rows');
    if (rows.length > 0) {
      walk(rows[0], 'rows.0', 'rows', out, 0);
      const first = rows[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        for (const key of Object.keys(first as Record<string, unknown>)) {
          pushPath(out, `rows.0.${key}`, (first as Record<string, unknown>)[key], 'rows');
        }
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((p) => {
    if (seen.has(p.path)) return false;
    seen.add(p.path);
    return true;
  });
}

export function scanQueryVariableTokens(query: string): string[] {
  const tokens = new Set<string>();
  const re = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(query)) !== null) {
    const token = match[1].trim();
    if (token) tokens.add(token);
  }
  return Array.from(tokens);
}
