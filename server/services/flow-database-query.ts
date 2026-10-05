import dns from 'dns/promises';
import net from 'net';
import type { Submittable } from 'pg';
import { isPrivateOrReservedIP } from '../utils/is-private-or-reserved-ip';

/** pg-cursor instance returned by `client.query(new Cursor(...))` — extends driver's Submittable. */
type PgCursorInstance = Submittable & {
  read(rowCount: number): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
  _result?: {
    fields?: Array<{ name: string; dataTypeID?: number }>;
    rowCount?: number;
    command?: string;
  };
};

export type FlowDatabaseEngine = 'postgres' | 'mysql';

export type FlowDatabaseConnection =
  | {
      mode: 'fields';
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
      ssl?: boolean;
    }
  | {
      mode: 'connectionString';
      connectionString: string;
    };

export type FlowDatabaseQueryOptions = {
  engine: FlowDatabaseEngine;
  connection: FlowDatabaseConnection;
  query: string;
  resolveVariable: (path: string) => unknown;
  rowLimit: number;
  timeoutMs: number;
  ssl?: boolean;
  ssrfGuard?: boolean;
  /** When set, replaces DNS resolution (used by tests). */
  ssrfDnsOverride?: (hostname: string) => Promise<string[]>;
};

export type FlowDatabaseQueryResult = {
  rows: any[];
  /** Number of rows returned in `rows` (after any truncation). */
  rowCount: number;
  /** Rows changed by DML when the driver reports it (INSERT/UPDATE/DELETE without RETURNING). */
  rowsAffected?: number;
  /** SQL command tag from the driver when available (e.g. INSERT, SELECT). */
  command?: string;
  /** When known, total rows the query would have returned before truncation. */
  totalRowCount?: number;
  fields: Array<{ name: string; type?: string }>;
  durationMs: number;
  truncated: boolean;
};

export const MAX_DB_ROW_LIMIT = 10000;

const TEMPLATE_TOKEN_RE = /\{\{([^}]+)\}\}/g;
const SSRF_BLOCKED_HOST_ERROR =
  'Database host is not allowed: private, loopback, or reserved address';

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/[^@\s]+@[^\s]+/gi, 'postgres://***@***')
    .replace(/mysql:\/\/[^@\s]+@[^\s]+/gi, 'mysql://***@***')
    .replace(/password[=:][^\s;&]+/gi, 'password=***');
}

function parseConnectionString(
  connectionString: string,
  expectedEngine: FlowDatabaseEngine
): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  engine: FlowDatabaseEngine;
} {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Invalid database connection string');
  }

  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  let engine: FlowDatabaseEngine;
  if (scheme === 'postgres' || scheme === 'postgresql') {
    engine = 'postgres';
  } else if (scheme === 'mysql') {
    engine = 'mysql';
  } else {
    throw new Error(`Unsupported connection string scheme: ${scheme}`);
  }

  if (engine !== expectedEngine) {
    throw new Error(
      `Connection string scheme (${scheme}) does not match selected engine (${expectedEngine})`
    );
  }

  const database = parsed.pathname.replace(/^\//, '') || '';
  const defaultPort = engine === 'postgres' ? 5432 : 3306;
  const ssl =
    parsed.searchParams.get('ssl') === 'true' ||
    parsed.searchParams.get('sslmode') === 'require' ||
    parsed.searchParams.get('sslmode') === 'verify-full';

  return {
    engine,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : defaultPort,
    database,
    username: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    ssl
  };
}

function normalizeDatabaseHostname(host: string): string {
  const trimmed = host.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isBlockedDatabaseHostname(hostname: string): boolean {
  const bare = normalizeDatabaseHostname(hostname).toLowerCase().replace(/\.+$/, '');
  if (!bare) return true;
  if (bare === 'localhost' || bare.endsWith('.localhost')) return true;

  const ipVersion = net.isIP(bare);
  if (ipVersion === 4 || ipVersion === 6) {
    return isPrivateOrReservedIP(bare);
  }

  return false;
}

async function resolveDatabaseHostAddresses(
  hostname: string,
  dnsOverride?: (hostname: string) => Promise<string[]>
): Promise<string[]> {
  if (dnsOverride) {
    return dnsOverride(hostname);
  }

  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[])
  ]);
  const combined = [...v4, ...v6];
  if (combined.length > 0) return combined;
  const lookedUp = await dns.lookup(hostname, { all: true, verbatim: true });
  return lookedUp.map((entry) => entry.address);
}

/**
 * Validates a database host for SSRF mitigation. Returns a pinned public IP when the host
 * was resolved from DNS so the driver connects to the validated address.
 */
export async function assertSafeDatabaseHost(
  host: string,
  _port: number,
  ssrfGuard: boolean,
  dnsOverride?: (hostname: string) => Promise<string[]>
): Promise<string> {
  if (!ssrfGuard || process.env.ALLOW_PRIVATE_DB_HOSTS === '1') {
    return host;
  }

  const bare = normalizeDatabaseHostname(host);
  if (isBlockedDatabaseHostname(bare)) {
    throw new Error(SSRF_BLOCKED_HOST_ERROR);
  }

  const ipVersion = net.isIP(bare);
  if (ipVersion === 4 || ipVersion === 6) {
    return bare;
  }

  let addresses: string[];
  try {
    addresses = await resolveDatabaseHostAddresses(bare, dnsOverride);
  } catch {
    throw new Error('Could not resolve database hostname');
  }

  if (addresses.length === 0) {
    throw new Error('Could not resolve database hostname');
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIP(addr)) {
      throw new Error(SSRF_BLOCKED_HOST_ERROR);
    }
  }

  return [...addresses].sort()[0]!;
}

export function compileTemplatedQuery(
  query: string,
  resolveValue: (path: string) => unknown,
  engine: FlowDatabaseEngine
): { sql: string; params: unknown[]; missingVars: string[] } {
  const params: unknown[] = [];
  const missingVars: string[] = [];
  const tokenToIndex = new Map<string, number>();

  const sql = query.replace(TEMPLATE_TOKEN_RE, (_match, rawPath: string) => {
    const path = rawPath.trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(path)) {
      return _match;
    }

    if (engine === 'mysql') {
      const value = resolveValue(path);
      if (value === undefined) {
        missingVars.push(path);
      }
      params.push(value === undefined ? null : value);
      return '?';
    }

    let idx = tokenToIndex.get(path);
    if (idx === undefined) {
      const value = resolveValue(path);
      if (value === undefined) {
        missingVars.push(path);
      }
      params.push(value === undefined ? null : value);
      idx = params.length;
      tokenToIndex.set(path, idx);
    }

    return `$${idx}`;
  });

  return { sql, params, missingVars };
}

async function resolveConnectionTargets(
  engine: FlowDatabaseEngine,
  connection: FlowDatabaseConnection,
  sslOverride?: boolean
): Promise<{
  engine: FlowDatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}> {
  if (connection.mode === 'connectionString') {
    const parsed = parseConnectionString(connection.connectionString, engine);
    return {
      engine: parsed.engine,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      username: parsed.username,
      password: parsed.password,
      ssl: parsed.ssl ?? false
    };
  }

  return {
    engine,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    password: connection.password,
    ssl: sslOverride ?? connection.ssl ?? false
  };
}

function isExpectedPostgresTruncationError(err: unknown): boolean {
  const pgErr = err as { code?: string; message?: string };
  const message = pgErr.message || '';
  return (
    pgErr.code === 'ECONNRESET' ||
    pgErr.code === '57P01' ||
    message.includes('Connection terminated') ||
    message.includes('Client was closed and is not queryable')
  );
}

async function queryPostgres(
  target: Awaited<ReturnType<typeof resolveConnectionTargets>>,
  sql: string,
  params: unknown[],
  timeoutMs: number,
  rowLimit: number
): Promise<{
  rows: any[];
  fields: Array<{ name: string; type?: string }>;
  truncated: boolean;
  rowsAffected?: number;
  command?: string;
}> {
  const { Pool } = await import('pg');
  const pgCursorModule = await import('pg-cursor');
  const CursorCtor = (pgCursorModule.default ?? pgCursorModule) as new (
    text: string,
    values?: unknown[]
  ) => PgCursorInstance;

  const pool = new Pool({
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.username,
    password: target.password,
    min: 0,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 1000,
    ssl: target.ssl ? { rejectUnauthorized: false } : undefined
  });

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${Math.max(1, timeoutMs)}`);

    const cursor = client.query(new CursorCtor(sql, params));
    const batch = await cursor.read(rowLimit + 1);
    const truncated = batch.length > rowLimit;
    const rows = truncated ? batch.slice(0, rowLimit) : batch;

    const pgResult = cursor._result;

    const fields = (cursor._result?.fields ?? []).map((field) => ({
      name: field.name,
      type: field.dataTypeID !== undefined ? String(field.dataTypeID) : undefined
    }));

    await cursor.close();

    return {
      rows,
      fields,
      truncated,
      rowsAffected: pgResult?.rowCount,
      command: pgResult?.command
    };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

async function waitForMysqlConnection(
  conn: import('mysql2').Connection
): Promise<void> {
  if (conn.authorized) return;

  await new Promise<void>((resolve, reject) => {
    conn.once('connect', () => resolve());
    conn.once('error', (err) => reject(err));
  });
}

function isExpectedMysqlTruncationError(err: NodeJS.ErrnoException & { fatal?: boolean }): boolean {
  return (
    err.code === 'PROTOCOL_CONNECTION_LOST' ||
    err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
    Boolean(err.fatal)
  );
}

async function queryMysql(
  target: Awaited<ReturnType<typeof resolveConnectionTargets>>,
  sql: string,
  params: unknown[],
  timeoutMs: number,
  rowLimit: number
): Promise<{
  rows: any[];
  fields: Array<{ name: string; type?: string }>;
  truncated: boolean;
  rowsAffected?: number;
  command?: string;
}> {
  const mysql = await import('mysql2');
  const conn = mysql.createConnection({
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.username,
    password: target.password,
    ssl: target.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: timeoutMs
  });

  await waitForMysqlConnection(conn);

  let closed = false;
  const closeConnection = () => {
    if (closed) return;
    closed = true;
    conn.destroy();
  };

  try {
    return await new Promise((resolve, reject) => {
      const rows: any[] = [];
      let fields: Array<{ name: string; type?: string }> = [];
      let truncated = false;
      let settled = false;

      const settle = (result: {
        rows: any[];
        fields: Array<{ name: string; type?: string }>;
        truncated: boolean;
        rowsAffected?: number;
      }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const query = conn.query({ sql, values: params, timeout: timeoutMs }) as import('mysql2').Query & {
        affectedRows?: number;
      };

      query.on('fields', (fieldPackets: Array<{ name: string; columnType?: number }>) => {
        fields = fieldPackets.map((f) => ({
          name: f.name,
          type: f.columnType !== undefined ? String(f.columnType) : undefined
        }));
      });

      query.on('result', (row: unknown) => {
        if (settled) return;
        if (rows.length < rowLimit) {
          rows.push(row);
          return;
        }
        truncated = true;
        closeConnection();
        settle({ rows, fields, truncated, rowsAffected: query.affectedRows });
      });

      query.on('end', () => {
        settle({ rows, fields, truncated, rowsAffected: query.affectedRows });
      });

      query.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        if (truncated && isExpectedMysqlTruncationError(err)) {
          settle({ rows, fields, truncated, rowsAffected: query.affectedRows });
          return;
        }
        settled = true;
        reject(err);
      });
    });
  } finally {
    if (!closed) {
      await new Promise<void>((resolve) => {
        conn.end(() => resolve());
      }).catch(() => {
        closeConnection();
      });
    }
  }
}

export async function performFlowDatabaseQuery(
  opts: FlowDatabaseQueryOptions
): Promise<FlowDatabaseQueryResult> {
  const ssrfGuard = opts.ssrfGuard !== false;
  const rowLimit = Math.min(Math.max(1, opts.rowLimit || 100), MAX_DB_ROW_LIMIT);
  const timeoutMs = Math.max(1000, opts.timeoutMs || 30000);
  const start = Date.now();

  const target = await resolveConnectionTargets(opts.engine, opts.connection, opts.ssl);
  if (!target.host || !target.database) {
    throw new Error('Database host and database name are required');
  }
  if (!opts.query?.trim()) {
    throw new Error('SQL query is required');
  }

  target.host = await assertSafeDatabaseHost(
    target.host,
    target.port,
    ssrfGuard,
    opts.ssrfDnsOverride
  );

  const { sql, params } = compileTemplatedQuery(opts.query, opts.resolveVariable, target.engine);

  let rows: any[] = [];
  let fields: Array<{ name: string; type?: string }> = [];
  let truncated = false;
  let rowsAffected: number | undefined;
  let command: string | undefined;

  const driverPromise =
    target.engine === 'postgres'
      ? queryPostgres(target, sql, params, timeoutMs, rowLimit)
      : queryMysql(target, sql, params, timeoutMs, rowLimit);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Database query timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const result = await Promise.race([driverPromise, timeoutPromise]);
    rows = result.rows;
    fields = result.fields;
    truncated = result.truncated;
    rowsAffected = result.rowsAffected;
    command = result.command;
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const code = err?.code ? ` (${err.code})` : '';
    const message = sanitizeErrorMessage(err?.message || 'Database query failed');
    throw new Error(`${message}${code}`);
  }

  const durationMs = Date.now() - start;

  return {
    rows,
    rowCount: rows.length,
    rowsAffected,
    command,
    totalRowCount: truncated ? undefined : rows.length,
    fields,
    durationMs,
    truncated
  };
}

/** @internal Exported for row-limit streaming tests. */
export const flowDatabaseQueryDriversForTests = {
  queryMysql,
  queryPostgres,
  isExpectedMysqlTruncationError,
  isExpectedPostgresTruncationError
};
