import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  createMCPClient,
  type MCPClient,
  type MCPTransport,
} from "@ai-sdk/mcp";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type { Tool } from "ai";
import type {
  MCPServerConfig,
  MCPCallResult,
  MCPToolDescriptor,
} from "@shared/types/mcp";
import * as tokenStore from "./mcp-token-store";
import { logger } from "../../utils/logger";
import { ZodError } from "zod";

export type MCPClientErrorKind =
  | "transport"
  | "auth"
  | "tool_not_found"
  | "tool_execution"
  | "validation"
  | "unknown";

export class MCPClientError extends Error {
  readonly kind: MCPClientErrorKind;
  readonly httpStatusHint?: number;
  override readonly cause?: unknown;

  constructor(
    message: string,
    init: {
      kind: MCPClientErrorKind;
      httpStatusHint?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: init.cause });
    this.name = "MCPClientError";
    this.kind = init.kind;
    this.httpStatusHint = init.httpStatusHint;
    this.cause = init.cause;
  }

  static fromUnknown(
    err: unknown,
    defaultKind: MCPClientErrorKind = "unknown",
  ): MCPClientError {
    if (err instanceof MCPClientError) {
      return err;
    }
    if (err instanceof ZodError) {
      return new MCPClientError(err.message, {
        kind: "validation",
        httpStatusHint: 400,
        cause: err,
      });
    }
    const anyErr = err as { code?: string | number; status?: number; name?: string };
    if (typeof anyErr.code === "number") {
      const c = anyErr.code;
      if (c === 401 || c === 403) {
        return new MCPClientError(`HTTP ${c}`, {
          kind: "auth",
          httpStatusHint: c,
          cause: err,
        });
      }
      if ([408, 429, 502, 503, 504].includes(c)) {
        return new MCPClientError(`HTTP ${c}`, {
          kind: "transport",
          httpStatusHint: c,
          cause: err,
        });
      }
    }
    if (anyErr.name === "AbortError") {
      return new MCPClientError("Request aborted", {
        kind: "transport",
        httpStatusHint: 408,
        cause: err,
      });
    }
    const strCode = typeof anyErr.code === "string" ? anyErr.code : undefined;
    if (strCode === "ECONNRESET" || strCode === "ETIMEDOUT") {
      return new MCPClientError(String((err as Error).message || strCode), {
        kind: "transport",
        cause: err,
      });
    }
    const status = anyErr.status;
    if (typeof status === "number") {
      if (status === 401 || status === 403) {
        return new MCPClientError(`HTTP ${status}`, {
          kind: "auth",
          httpStatusHint: status,
          cause: err,
        });
      }
      if ([408, 429, 502, 503, 504].includes(status)) {
        return new MCPClientError(`HTTP ${status}`, {
          kind: "transport",
          httpStatusHint: status,
          cause: err,
        });
      }
    }
    if (err instanceof McpError) {
      const dataStr =
        err.data == null
          ? ""
          : typeof err.data === "string"
            ? err.data
            : (() => {
                try {
                  return JSON.stringify(err.data);
                } catch {
                  return String(err.data);
                }
              })();
      const combined = `${err.message} ${dataStr}`;

      if (err.code === ErrorCode.MethodNotFound) {
        return new MCPClientError(err.message, {
          kind: "tool_not_found",
          httpStatusHint: 404,
          cause: err,
        });
      }
      if (
        err.code === ErrorCode.InvalidParams ||
        err.code === ErrorCode.InternalError
      ) {
        if (textSuggestsUnknownTool(combined)) {
          return new MCPClientError(err.message, {
            kind: "tool_not_found",
            httpStatusHint: 404,
            cause: err,
          });
        }
      }
    }

    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);

    const maybeRpc = err as {
      error?: { code?: unknown; message?: string; data?: unknown };
      code?: unknown;
      message?: string;
    };
    const rpcNested = maybeRpc.error;
    const rpcCode = rpcNested?.code ?? maybeRpc.code;
    const rpcPieces = [
      rpcNested?.message,
      typeof rpcNested?.data === "string"
        ? rpcNested.data
        : rpcNested?.data != null
          ? (() => {
              try {
                return JSON.stringify(rpcNested.data);
              } catch {
                return String(rpcNested.data);
              }
            })()
          : undefined,
      maybeRpc.message,
      msg,
    ];
    const rpcBundle = rpcPieces.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");

    if (
      rpcCode === ErrorCode.MethodNotFound ||
      rpcCode === -32601 ||
      rpcCode === "-32601"
    ) {
      return new MCPClientError(rpcBundle || "Method not found", {
        kind: "tool_not_found",
        httpStatusHint: 404,
        cause: err,
      });
    }
    if (
      rpcCode === ErrorCode.InvalidParams ||
      rpcCode === ErrorCode.InternalError ||
      rpcCode === -32602 ||
      rpcCode === -32603 ||
      rpcCode === "-32602" ||
      rpcCode === "-32603"
    ) {
      if (textSuggestsUnknownTool(rpcBundle)) {
        return new MCPClientError(rpcBundle, {
          kind: "tool_not_found",
          httpStatusHint: 404,
          cause: err,
        });
      }
    }

    const httpStatusFromText = extractHttpStatusFromErrorChain(err);
    if (httpStatusFromText != null) {
      const kind = classifyHttpStatusKind(httpStatusFromText);
      if (kind) {
        return new MCPClientError(msg || `HTTP ${httpStatusFromText}`, {
          kind,
          httpStatusHint: httpStatusFromText,
          cause: err,
        });
      }
      if (httpStatusFromText === 404) {
        return new MCPClientError(msg, {
          kind: defaultKind,
          httpStatusHint: 404,
          cause: err,
        });
      }
    }

    return new MCPClientError(msg, { kind: defaultKind, cause: err });
  }
}

const HTTP_STATUS_MESSAGE_PATTERNS = [
  /\bHTTP\s+(\d{3})\b/i,
  /\(HTTP\s+(\d{3})\)/i,
  /Transport Error:\s*(\d{3})\b/i,
] as const;

function collectErrorTexts(err: unknown): string[] {
  const texts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    if (typeof cur === "string") {
      texts.push(cur);
    } else if (cur instanceof Error) {
      if (cur.message) {
        texts.push(cur.message);
      }
      cur = cur.cause;
      continue;
    } else if (typeof cur === "object") {
      const obj = cur as { message?: unknown; cause?: unknown };
      if (typeof obj.message === "string" && obj.message.length > 0) {
        texts.push(obj.message);
      }
      cur = obj.cause;
      continue;
    }
    break;
  }
  return texts;
}

function parseHttpStatusFromText(text: string): number | undefined {
  for (const pattern of HTTP_STATUS_MESSAGE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }
    const status = Number(match[1]);
    if (status >= 100 && status <= 599) {
      return status;
    }
  }
  return undefined;
}

function extractHttpStatusFromErrorChain(err: unknown): number | undefined {
  for (const text of collectErrorTexts(err)) {
    const status = parseHttpStatusFromText(text);
    if (status != null) {
      return status;
    }
  }
  return undefined;
}

function classifyHttpStatusKind(status: number): MCPClientErrorKind | undefined {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if ([408, 429, 502, 503, 504].includes(status)) {
    return "transport";
  }
  return undefined;
}

function mcpClientErrorForHttpStatus(
  status: number,
  detail: string,
  cause?: unknown,
): MCPClientError {
  const kind = classifyHttpStatusKind(status) ?? "unknown";
  return new MCPClientError(detail || `HTTP ${status}`, {
    kind,
    httpStatusHint: status,
    cause,
  });
}

export function composeAbortSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal != null);
  if (active.length === 0) {
    return undefined;
  }
  if (active.length === 1) {
    return active[0];
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal): void => {
    if (controller.signal.aborted) {
      return;
    }
    controller.abort(source.reason);
  };
  for (const signal of active) {
    if (signal.aborted) {
      abortFrom(signal);
      return controller.signal;
    }
    signal.addEventListener("abort", () => abortFrom(signal), { once: true });
  }
  return controller.signal;
}

/** Text from tool error payloads and RPC messages that indicates the tool name is missing on the server. */
function textSuggestsUnknownTool(text: string, toolName?: string): boolean {
  const t = text.toLowerCase();
  if (!t.trim()) {
    return false;
  }
  if (t.includes("requires task-based execution")) {
    return false;
  }
  if (t.includes("task not found")) {
    return false;
  }
  if (t.includes("output schema") || t.includes("structured content")) {
    return false;
  }
  if (t.includes("failed to validate structured content")) {
    return false;
  }

  const phrases = [
    "tool not found",
    "unknown tool",
    "no such tool",
    "invalid tool",
    "tool does not exist",
    "tool doesn't exist",
    "undefined tool",
    "unrecognized tool",
    "no tool named",
    "missing tool",
    "not a registered tool",
    "unregistered tool",
    "tool is not available",
    "tool unavailable",
    "tool does not exist on",
  ];
  if (phrases.some((p) => t.includes(p))) {
    return true;
  }
  if (
    /\bunknown\b.*\btool\b|\btool\b.*\bunknown\b/.test(t) ||
    /\bno\b[\s\S]{0,48}\btool\b[\s\S]{0,48}\b(found|exist)/.test(t)
  ) {
    return true;
  }

  const name = toolName?.trim();
  if (name) {
    const lower = name.toLowerCase();
    if (
      t.includes(`"${lower}"`) &&
      (t.includes("not found") || t.includes("unknown") || t.includes("no such"))
    ) {
      return true;
    }
    if (
      t.includes(`'${lower}'`) &&
      (t.includes("not found") || t.includes("unknown") || t.includes("no such"))
    ) {
      return true;
    }
  }

  return false;
}

function stringifyToolResultContent(content: unknown): string {
  if (content == null) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof (item as { text: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join(" ");
  }
  if (typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

const sessionIdCache = new Map<string, string>();

function keyFor(
  companyId: number,
  config: MCPServerConfig,
  nodeId?: string,
): string {
  return `${companyId}:${nodeId ?? "_"}:${config.id}`;
}

async function getOauthService() {
  const { mcpOauthService } = await import("./mcp-oauth-service");
  return mcpOauthService;
}

async function resolveAuthHeaders(
  config: MCPServerConfig,
  companyId: number,
  nodeId?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (config.authMode === "headers" && config.headers?.length) {
    for (const h of config.headers) {
      if (h.key?.trim() && h.value != null && String(h.value).length > 0) {
        headers[h.key.trim()] = String(h.value);
      }
    }
  }

  if (config.authMode === "oauth2" && nodeId) {
    let token = await tokenStore.getToken({
      companyId,
      nodeId,
      serverId: config.id,
    });
    if (
      token &&
      tokenStore.isExpired(token) &&
      token.refreshToken
    ) {
      try {
        const oauth = await getOauthService();
        token = await oauth.refresh({ config, companyId, nodeId });
      } catch (e) {
        logger.error("mcp-client", "OAuth refresh failed in resolveAuthHeaders", e);
        throw new MCPClientError("OAuth token refresh failed", {
          kind: "auth",
          httpStatusHint: 401,
          cause: e,
        });
      }
    }
    if (token) {
      const tt = token.tokenType || "Bearer";
      headers["Authorization"] = `${tt} ${token.accessToken}`;
    }
  }

  return headers;
}

/**
 * Public helper: builds a transport using `config.sessionId` (no timeout/signal — add those in your own `RequestInit` if needed).
 * `withClient` wires timeout, session cache, and OAuth headers internally.
 */
export function buildTransport(
  config: MCPServerConfig,
  authHeaders: Record<string, string>,
): Transport {
  return buildTransportWithRequestInit(config, { headers: authHeaders }, config.sessionId);
}

function buildTransportWithRequestInit(
  config: MCPServerConfig,
  requestInit: RequestInit,
  sessionId: string | undefined,
): Transport {
  const url = new URL(config.url);
  if (config.transport === "streamable-http") {
    return new StreamableHTTPClientTransport(url, {
      requestInit,
      sessionId,
    });
  }
  if (config.transport === "sse") {
    const headers = new Headers(requestInit.headers as HeadersInit);
    if (sessionId) {
      headers.set("mcp-session-id", sessionId);
    }
    return new SSEClientTransport(url, {
      requestInit: { ...requestInit, headers },
    });
  }
  throw new MCPClientError(
    `Unsupported MCP transport: ${String(config.transport)}`,
    { kind: "validation", httpStatusHint: 400 },
  );
}

function isStreamableHttpSessionNotFound(err: unknown): boolean {
  return err instanceof StreamableHTTPError && err.code === 404;
}

function isStaleStreamableHttpSession(
  err: unknown,
  config: MCPServerConfig,
  hadSessionId: boolean,
): boolean {
  if (!hadSessionId || config.transport !== "streamable-http") {
    return false;
  }
  if (isStreamableHttpSessionNotFound(err)) {
    return true;
  }
  const mcpErr =
    err instanceof MCPClientError
      ? err
      : MCPClientError.fromUnknown(err, "unknown");
  if (mcpErr.httpStatusHint === 404) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 404/i.test(msg);
}

function createIdempotentClose(closeFn: () => Promise<void>): () => Promise<void> {
  let closed = false;
  return async () => {
    if (closed) {
      return;
    }
    closed = true;
    try {
      await closeFn();
    } catch {
      /* swallow */
    }
  };
}

function createMcpSessionTrackingFetch(
  onSessionId: (sessionId: string) => void,
  baseFetch: typeof fetch = globalThis.fetch,
  outerSignal?: AbortSignal,
): FetchFunction {
  return async (url, init) => {
    const signal = composeAbortSignals(outerSignal, init?.signal ?? undefined);
    let response: Response;
    try {
      response = await baseFetch(url, {
        ...init,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      throw MCPClientError.fromUnknown(err, "transport");
    }

    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) {
      onSessionId(sessionId);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const detail =
        text.trim().length > 0
          ? `HTTP ${response.status}: ${text.slice(0, 500)}`
          : `HTTP ${response.status}`;
      throw mcpClientErrorForHttpStatus(response.status, detail, response);
    }

    return response;
  };
}

function buildAiSdkMcpTransportConfig(
  config: MCPServerConfig,
  authHeaders: Record<string, string>,
  sessionId: string | undefined,
  fetchFn?: FetchFunction,
): MCPTransport | {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
} {
  const headers: Record<string, string> = { ...authHeaders };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  if (config.transport === "streamable-http") {
    return {
      type: "http",
      url: config.url,
      headers,
      fetch: fetchFn,
    };
  }
  if (config.transport === "sse") {
    return {
      type: "sse",
      url: config.url,
      headers,
      fetch: fetchFn,
    };
  }
  throw new MCPClientError(
    `Unsupported MCP transport: ${String(config.transport)}`,
    { kind: "validation", httpStatusHint: 400 },
  );
}

function mapCallResult(raw: unknown): MCPCallResult {
  const r = raw as {
    content?: unknown;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const isError = !!r?.isError;
  let error: string | undefined;
  if (isError && r.content !== undefined) {
    try {
      error = JSON.stringify(r.content);
    } catch {
      error = String(r.content);
    }
  }
  return {
    ok: !isError,
    content: r.content,
    structuredContent: r.structuredContent,
    isError,
    error,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attemptIndex: number): number {
  const base = 250 * Math.pow(2, attemptIndex);
  return base * (0.75 + Math.random() * 0.5);
}

function isTransientFailure(mcpErr: MCPClientError, raw: unknown): boolean {
  if (
    mcpErr.message === "MCP tool execution timed out" ||
    mcpErr.message === "Request aborted"
  ) {
    return false;
  }
  if (mcpErr.kind === "transport") {
    return true;
  }
  if (
    typeof mcpErr.httpStatusHint === "number" &&
    [408, 429, 502, 503, 504].includes(mcpErr.httpStatusHint)
  ) {
    return true;
  }
  const r = raw as { code?: string | number; status?: number };
  if (typeof r.code === "string" && (r.code === "ECONNRESET" || r.code === "ETIMEDOUT")) {
    return true;
  }
  const n = typeof r.code === "number" ? r.code : r.status;
  if (typeof n === "number" && [408, 429, 502, 503, 504].includes(n)) {
    return true;
  }
  const statusFromText = extractHttpStatusFromErrorChain(raw);
  if (statusFromText != null && [408, 429, 502, 503, 504].includes(statusFromText)) {
    return true;
  }
  return false;
}

interface McpTransportContext {
  transport: Transport;
  cacheKey: string;
  effectiveSessionId: string | undefined;
  persistSessionId: () => void;
}

async function createMcpTransportContext(
  config: MCPServerConfig,
  companyId: number,
  opts?: { nodeId?: string; signal?: AbortSignal },
): Promise<McpTransportContext> {
  const cacheKey = keyFor(companyId, config, opts?.nodeId);
  const effectiveSessionId = sessionIdCache.get(cacheKey) ?? config.sessionId;
  const authHeaders = await resolveAuthHeaders(config, companyId, opts?.nodeId);
  const requestInit: RequestInit = {
    headers: authHeaders,
    ...(opts?.signal ? { signal: opts.signal } : {}),
  };
  const transport = buildTransportWithRequestInit(
    config,
    requestInit,
    effectiveSessionId,
  );
  const persistSessionId = (): void => {
    if (config.transport === "streamable-http") {
      const sid = (
        transport as InstanceType<typeof StreamableHTTPClientTransport>
      ).sessionId;
      if (sid) {
        sessionIdCache.set(cacheKey, sid);
        config.sessionId = sid;
      }
    }
  };
  return { transport, cacheKey, effectiveSessionId, persistSessionId };
}

export interface AiSdkMcpServerRuntime {
  client: MCPClient;
  /** AI SDK tools keyed by original MCP tool name. */
  tools: Record<string, Tool>;
  close: () => Promise<void>;
  /** Recreates the turn-scoped client after streamable-http session reset. */
  recreate: () => Promise<AiSdkMcpServerRuntime>;
}

export interface ExecuteAiSdkMcpToolOptions {
  nodeId?: string;
  onSessionReset?: () => Promise<void>;
}

/**
 * Wraps AI SDK MCP tool execution with the same timeout, retry, session-reset, and OAuth
 * recovery behavior as legacy {@link callTool}.
 */
export async function executeAiSdkMcpToolWithRecovery<T>(
  config: MCPServerConfig,
  companyId: number,
  execute: (signal: AbortSignal) => Promise<T>,
  opts?: ExecuteAiSdkMcpToolOptions,
): Promise<T> {
  const cacheKey = keyFor(companyId, config, opts?.nodeId);

  const resetRuntimeIfNeeded = async (): Promise<void> => {
    if (opts?.onSessionReset) {
      await opts.onSessionReset();
    }
  };

  const invokeWithTimeout = async (): Promise<T> => {
    const timeoutMs = config.timeoutMs ?? 30_000;
    const attemptAbort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      return await Promise.race([
        execute(attemptAbort.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            const timeoutError = new MCPClientError("MCP tool execution timed out", {
              kind: "transport",
              httpStatusHint: 408,
            });
            attemptAbort.abort(timeoutError);
            reject(timeoutError);
          }, timeoutMs);
        }),
      ]);
    } catch (err) {
      if (timedOut || attemptAbort.signal.aborted) {
        await resetRuntimeIfNeeded();
      }
      throw err instanceof MCPClientError
        ? err
        : MCPClientError.fromUnknown(err, "transport");
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const runWithTransportRetry = async (
    allowSessionReset: boolean,
  ): Promise<T> => {
    const hadSessionId = !!(sessionIdCache.get(cacheKey) ?? config.sessionId);
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await invokeWithTimeout();
      } catch (err) {
        last = err;
        const e =
          err instanceof MCPClientError
            ? err
            : MCPClientError.fromUnknown(err, "unknown");

        if (
          allowSessionReset &&
          isStaleStreamableHttpSession(err, config, hadSessionId)
        ) {
          sessionIdCache.delete(cacheKey);
          delete config.sessionId;
          await resetRuntimeIfNeeded();
          return runWithTransportRetry(false);
        }

        if (i < 2 && isTransientFailure(e, err)) {
          await resetRuntimeIfNeeded();
          await sleep(backoffMs(i));
          continue;
        }
        throw e;
      }
    }
    throw MCPClientError.fromUnknown(last, "transport");
  };

  try {
    return await runWithTransportRetry(true);
  } catch (err) {
    const e =
      err instanceof MCPClientError
        ? err
        : MCPClientError.fromUnknown(err, "unknown");
    if (
      e.kind === "auth" &&
      config.authMode === "oauth2" &&
      opts?.nodeId
    ) {
      const tok = await tokenStore.getToken({
        companyId,
        nodeId: opts.nodeId,
        serverId: config.id,
      });
      if (tok?.refreshToken) {
        try {
          const oauth = await getOauthService();
          await oauth.refresh({ config, companyId, nodeId: opts.nodeId });
          sessionIdCache.delete(cacheKey);
          await resetRuntimeIfNeeded();
          return invokeWithTimeout();
        } catch {
          throw e;
        }
      }
    }
    throw e;
  }
}

/**
 * Turn-scoped AI SDK MCP runtime for assistant tool execution.
 * Shares auth, OAuth refresh, session-id, SSE, and streamable HTTP transport with legacy helpers.
 */
export async function createAiSdkMcpRuntimeForServer(
  config: MCPServerConfig,
  companyId: number,
  opts?: { nodeId?: string },
): Promise<AiSdkMcpServerRuntime> {
  let client: MCPClient | undefined;
  const cacheKey = keyFor(companyId, config, opts?.nodeId);
  const timeoutMs = config.timeoutMs ?? 30_000;

  const persistSessionId = (sid: string): void => {
    sessionIdCache.set(cacheKey, sid);
    config.sessionId = sid;
  };

  const buildRuntime = async (
    signal?: AbortSignal,
  ): Promise<AiSdkMcpServerRuntime> => {
    const authHeaders = await resolveAuthHeaders(config, companyId, opts?.nodeId);
    const sessionId = sessionIdCache.get(cacheKey) ?? config.sessionId;
    const fetchFn = createMcpSessionTrackingFetch(
      persistSessionId,
      globalThis.fetch,
      signal,
    );
    const transport = buildAiSdkMcpTransportConfig(
      config,
      authHeaders,
      sessionId,
      fetchFn,
    );

    const nextClient = await createMCPClient({
      transport,
      clientName: "bothive-mcp-client",
      version: "1.0.0",
    });
    client = nextClient;
    const tools = await nextClient.tools();
    const close = createIdempotentClose(async () => {
      if (nextClient) {
        await nextClient.close();
      }
    });
    return {
      client: nextClient,
      tools,
      close,
      recreate: async () => {
        await close();
        return buildRuntime(undefined);
      },
    };
  };

  const initAbort = new AbortController();
  const initTimer = setTimeout(() => initAbort.abort(), timeoutMs);

  try {
    return await buildRuntime(initAbort.signal);
  } catch (e) {
    if (client) {
      try {
        await client.close();
      } catch {
        /* swallow */
      }
    }
    throw MCPClientError.fromUnknown(e);
  } finally {
    clearTimeout(initTimer);
  }
}

async function withClient<T>(
  config: MCPServerConfig,
  companyId: number,
  fn: (client: InstanceType<typeof Client>) => Promise<T>,
  opts?: { nodeId?: string },
): Promise<T> {
  const timeoutMs = config.timeoutMs ?? 30_000;
  const cacheKey = keyFor(companyId, config, opts?.nodeId);

  const attempt = async (allowSessionReset: boolean): Promise<T> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);

    let client: InstanceType<typeof Client> | undefined;
    let effectiveSessionId: string | undefined;
    try {
      const transportContext = await createMcpTransportContext(config, companyId, {
        nodeId: opts?.nodeId,
        signal: abort.signal,
      });
      effectiveSessionId = transportContext.effectiveSessionId;

      client = new Client(
        { name: "bothive-mcp-client", version: "1.0.0" },
        { capabilities: {} },
      );

      await client.connect(transportContext.transport);
      transportContext.persistSessionId();

      return await fn(client);
    } catch (e) {
      if (
        allowSessionReset &&
        config.transport === "streamable-http" &&
        effectiveSessionId &&
        isStreamableHttpSessionNotFound(e)
      ) {
        sessionIdCache.delete(cacheKey);
        delete config.sessionId;
        return attempt(false);
      }
      if (e instanceof MCPClientError) {
        throw e;
      }
      throw MCPClientError.fromUnknown(e, "unknown");
    } finally {
      clearTimeout(timer);
      if (client) {
        try {
          await client.close();
        } catch {
          /* swallow */
        }
      }
    }
  };

  return attempt(true);
}

async function listTools(
  config: MCPServerConfig,
  companyId: number,
  opts?: { nodeId?: string },
): Promise<MCPToolDescriptor[]> {
  return withClient(
    config,
    companyId,
    async (client) => {
      const res = await client.listTools();
      return (res.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    },
    opts,
  );
}

async function callTool(
  config: MCPServerConfig,
  companyId: number,
  name: string,
  args: Record<string, unknown> | undefined,
  opts?: { nodeId?: string },
): Promise<MCPCallResult> {
  const cacheKey = keyFor(companyId, config, opts?.nodeId);

  const invoke = async (): Promise<MCPCallResult> => {
    return withClient(
      config,
      companyId,
      async (client) => {
        const raw = await client.callTool({
          name,
          arguments: args ?? {},
        });
        const mapped = mapCallResult(raw);
        if (mapped.isError) {
          const contentText = stringifyToolResultContent(
            (raw as { content?: unknown }).content,
          );
          const detail = [mapped.error, contentText].filter(Boolean).join(" ");
          if (textSuggestsUnknownTool(detail, name)) {
            throw new MCPClientError(
              (mapped.error ?? contentText) || "MCP tool not found",
              {
                kind: "tool_not_found",
                httpStatusHint: 404,
                cause: raw,
              },
            );
          }
          throw new MCPClientError(
            mapped.error ?? "MCP tool execution failed",
            {
              kind: "tool_execution",
              httpStatusHint: 500,
              cause: raw,
            },
          );
        }
        return mapped;
      },
      opts,
    );
  };

  const runWithTransportRetry = async (): Promise<MCPCallResult> => {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await invoke();
      } catch (err) {
        last = err;
        const e =
          err instanceof MCPClientError
            ? err
            : MCPClientError.fromUnknown(err, "unknown");
        if (i < 2 && isTransientFailure(e, err)) {
          await sleep(backoffMs(i));
          continue;
        }
        throw e;
      }
    }
    throw MCPClientError.fromUnknown(last, "transport");
  };

  try {
    return await runWithTransportRetry();
  } catch (err) {
    const e =
      err instanceof MCPClientError
        ? err
        : MCPClientError.fromUnknown(err, "unknown");
    if (
      e.kind === "auth" &&
      config.authMode === "oauth2" &&
      opts?.nodeId
    ) {
      const tok = await tokenStore.getToken({
        companyId,
        nodeId: opts.nodeId,
        serverId: config.id,
      });
      if (tok?.refreshToken) {
        try {
          const oauth = await getOauthService();
          await oauth.refresh({ config, companyId, nodeId: opts.nodeId });
          sessionIdCache.delete(cacheKey);
          return await invoke();
        } catch {
          throw e;
        }
      }
    }
    throw e;
  }
}

async function fetchServerInfo(
  config: MCPServerConfig,
  companyId: number,
  opts?: { nodeId?: string },
): Promise<{ serverInfo: unknown; capabilities: unknown }> {
  return withClient(
    config,
    companyId,
    async (client) => ({
      serverInfo: client.getServerVersion(),
      capabilities: client.getServerCapabilities(),
    }),
    opts,
  );
}

export const mcpClient = {
  listTools,
  callTool,
  withClient,
  fetchServerInfo,
  buildTransport,
  createAiSdkMcpRuntimeForServer,
  executeAiSdkMcpToolWithRecovery,
  MCPClientError,
  _internals: {
    sessionIdCache,
    composeAbortSignals,
    createMcpSessionTrackingFetch,
    extractHttpStatusFromErrorChain,
  } as const,
};
