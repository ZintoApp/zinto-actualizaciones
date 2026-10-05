import crypto from "crypto";
import type { Tool } from "ai";
import type { MCPServerConfig, MCPToolDescriptor } from "@shared/types/mcp";
import { applyMcpToolFilter } from "@shared/mcp-tool-filter";
import { mcpClient, MCPClientError, type AiSdkMcpServerRuntime } from "./mcp-client";

export const MCP_FUNCTION_NAME_PREFIX = "mcp__";

/** Reversible JSON + base64url payload (prefix `mcp__e__`). Legacy exports only; parser retained. */
const MCP_FN_ENC_PREFIX = `${MCP_FUNCTION_NAME_PREFIX}e__`;
/** Readable slug + short hash (prefix `mcp__r__`). */
const MCP_FN_READABLE_PREFIX = `${MCP_FUNCTION_NAME_PREFIX}r__`;
/** Short hash id when the readable form cannot be made unique (prefix `mcp__h__`). */
const MCP_FN_HASH_PREFIX = `${MCP_FUNCTION_NAME_PREFIX}h__`;

/**
 * Tool `function.name` length limit for OpenAI-compatible providers (replay/tool-call validation rejects longer names).
 * MCP allows longer logical names; we fold to {@link MCP_FN_HASH_PREFIX} before export.
 */
export const MAX_MCP_EXPORT_FN_NAME_LEN = 64;

/** OpenAI-style tool names: `^[a-zA-Z0-9_-]+$` (no spaces). */
const PROVIDER_TOOL_FN_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** True when a string is safe to send as `tools[].function.name` to OpenAI-compatible chat APIs. */
export function isValidMcpProviderExportName(name: string): boolean {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= MAX_MCP_EXPORT_FN_NAME_LEN &&
    PROVIDER_TOOL_FN_NAME_PATTERN.test(name)
  );
}

export function sanitizeIdentifier(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

function payloadJson(serverId: string, toolName: string): string {
  return JSON.stringify({ s: serverId, t: toolName });
}

/**
 * Collision-safe export names: `mcp__r__` + sanitized tool identity + `__` + short hash (preferred),
 * or `mcp__h__` + digest if a unique readable name cannot be constructed.
 * Resolve `mcp__r__` / `mcp__h__` with {@link parseMCPFunctionName} and `hashNameLookup` from the same load.
 */
export function buildPrefixedName(
  serverId: string,
  toolName: string,
  hashNameLookup: Map<string, { serverId: string; toolName: string }>,
): { name: string; collision: boolean } {
  const payload = payloadJson(serverId, toolName);
  for (let hashLen = 8; hashLen <= 32; hashLen += 4) {
    const h = crypto.createHash("sha256").update(payload).digest("hex").slice(0, hashLen);
    const maxReadable =
      MAX_MCP_EXPORT_FN_NAME_LEN - MCP_FN_READABLE_PREFIX.length - 2 - hashLen;
    let readable = sanitizeIdentifier(toolName).replace(/^_+|_+$/g, "");
    if (!readable) readable = "tool";
    readable = readable.slice(0, Math.max(1, maxReadable));
    let name = `${MCP_FN_READABLE_PREFIX}${readable}__${h}`;
    while (name.length > MAX_MCP_EXPORT_FN_NAME_LEN && readable.length > 1) {
      readable = readable.slice(0, -1);
      name = `${MCP_FN_READABLE_PREFIX}${readable}__${h}`;
    }
    if (name.length > MAX_MCP_EXPORT_FN_NAME_LEN) {
      continue;
    }
    if (!isValidMcpProviderExportName(name)) {
      continue;
    }
    const prev = hashNameLookup.get(name);
    if (prev && (prev.serverId !== serverId || prev.toolName !== toolName)) {
      continue;
    }
    hashNameLookup.set(name, { serverId, toolName });
    return { name, collision: false };
  }
  const digest = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
  const fallback = `${MCP_FN_HASH_PREFIX}${digest}`;
  const prevFb = hashNameLookup.get(fallback);
  if (prevFb && (prevFb.serverId !== serverId || prevFb.toolName !== toolName)) {
    return { name: fallback, collision: true };
  }
  hashNameLookup.set(fallback, { serverId, toolName });
  return { name: fallback, collision: false };
}

export function parseMCPFunctionName(
  name: string,
  hashNameLookup?: ReadonlyMap<string, { serverId: string; toolName: string }>,
): { serverId: string; toolName: string } | null {
  if (typeof name !== "string" || !name.startsWith(MCP_FUNCTION_NAME_PREFIX)) {
    return null;
  }
  if (name.startsWith(MCP_FN_ENC_PREFIX)) {
    const b64 = name.slice(MCP_FN_ENC_PREFIX.length);
    try {
      const json = Buffer.from(b64, "base64url").toString("utf8");
      const o = JSON.parse(json) as { s?: string; t?: string };
      if (typeof o.s === "string" && typeof o.t === "string") {
        return { serverId: o.s, toolName: o.t };
      }
    } catch {
      return null;
    }
    return null;
  }
  if (name.startsWith(MCP_FN_READABLE_PREFIX)) {
    return hashNameLookup?.get(name) ?? null;
  }
  if (name.startsWith(MCP_FN_HASH_PREFIX)) {
    return hashNameLookup?.get(name) ?? null;
  }
  const parts = name.split("__");
  if (parts.length < 3 || parts[0] !== "mcp") {
    return null;
  }
  return {
    serverId: parts[1],
    toolName: parts.slice(2).join("__"),
  };
}

export function convertToolToFunctionDefinition(
  tool: MCPToolDescriptor,
  serverId: string,
  serverName: string,
  exportName: string,
): { name: string; description: string; parameters: unknown } {
  let parameters: unknown;
  const schema = tool.inputSchema;
  if (
    schema != null &&
    typeof schema === "object" &&
    !Array.isArray(schema) &&
    (schema as { type?: string }).type === "object"
  ) {
    parameters = schema;
  } else {
    parameters = { type: "object", properties: {} };
  }
  const serverLabel = serverName.trim() || serverId;
  const originLine = `MCP server "${serverLabel}" (id: ${serverId}). Original tool name: "${tool.name}".`;
  const baseDesc = tool.description?.trim();
  const description = baseDesc ? `${baseDesc}\n\n${originLine}` : originLine;
  return {
    name: exportName,
    description,
    parameters,
  };
}

function configHash(config: MCPServerConfig): string {
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        url: config.url,
        transport: config.transport,
        authMode: config.authMode,
        headers: config.headers,
        oauth: config.oauth,
      }),
    )
    .digest("hex");
}

function cacheKey(companyId: number, server: MCPServerConfig): string {
  return `${companyId}:${server.id}:${configHash(server)}`;
}

interface CacheEntry {
  expiresAt: number;
  tools: MCPToolDescriptor[];
}

const toolListCache = new Map<string, CacheEntry>();
const TOOL_LIST_TTL_MS = 60_000;

function inputSchemaIssue(tool: MCPToolDescriptor): string | null {
  if (tool.inputSchema == null) {
    return null;
  }
  if (typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) {
    return "invalid_schema";
  }
  const o = tool.inputSchema as Record<string, unknown>;
  if (!("type" in o)) {
    return "missing_type";
  }
  if (o.type !== "object") {
    return "type_not_object";
  }
  return null;
}

/**
 * Counts tools that {@link loadFunctionDefinitionsForServers} would actually export for one server:
 * client filter, then input-schema checks, then export-name generation / collision / provider contract.
 */
export function countExportableMcpToolsForServer(
  server: MCPServerConfig,
  rawTools: MCPToolDescriptor[],
): {
  rawToolCount: number;
  filterExposedCount: number;
  exportableToolCount: number;
} {
  const rawToolCount = rawTools.length;
  const filtered = applyMcpToolFilter(rawTools, server.toolFilter);
  const filterExposedCount = filtered.length;
  const hashNameLookup = new Map<
    string,
    { serverId: string; toolName: string }
  >();
  let exportableToolCount = 0;
  for (const tool of filtered) {
    const issue = inputSchemaIssue(tool);
    if (issue) {
      continue;
    }
    const { name: exportName, collision } = buildPrefixedName(
      server.id,
      tool.name,
      hashNameLookup,
    );
    if (collision) {
      continue;
    }
    if (!isValidMcpProviderExportName(exportName)) {
      continue;
    }
    exportableToolCount += 1;
  }
  return { rawToolCount, filterExposedCount, exportableToolCount };
}

export interface MCPLoadedToolset {
  functionDefinitions: Array<{ name: string; description: string; parameters: unknown }>;
  denied: Array<{
    serverId: string;
    serverName: string;
    reason: string;
    details?: string;
  }>;
  /** Servers that connected but expose no callable tools after filter / validation. */
  zeroCallableTools: Array<{
    serverId: string;
    serverName: string;
    nodeId?: string;
    detail: string;
  }>;
  serverIndex: Map<
    string,
    { server: MCPServerConfig; originalName: string; nodeId?: string }
  >;
  /** Resolves `mcp__r__*` / `mcp__h__*` export names for {@link parseMCPFunctionName}. */
  hashNameLookup: Map<string, { serverId: string; toolName: string }>;
  /** AI SDK MCP tools keyed by exported `mcp__*` names. */
  tools: Record<string, Tool>;
  /** Closes all turn-scoped AI SDK MCP clients opened during load. */
  close: () => Promise<void>;
  /** Reconnects one server runtime after streamable-http session reset. */
  reconnectServer?: (serverId: string) => Promise<void>;
}

function deniedReasonFromError(err: unknown): { reason: string; details?: string } {
  if (err instanceof MCPClientError) {
    return { reason: err.kind, details: err.message };
  }
  return {
    reason: "unknown",
    details: err instanceof Error ? err.message : String(err),
  };
}

export async function loadFunctionDefinitionsForServers(
  servers: Array<MCPServerConfig & { __nodeId?: string }>,
  companyId: number,
): Promise<MCPLoadedToolset> {
  const functionDefinitions: MCPLoadedToolset["functionDefinitions"] = [];
  const denied: MCPLoadedToolset["denied"] = [];
  const zeroCallableTools: MCPLoadedToolset["zeroCallableTools"] = [];
  const hashNameLookup = new Map<
    string,
    { serverId: string; toolName: string }
  >();
  const serverIndex = new Map<
    string,
    { server: MCPServerConfig; originalName: string; nodeId?: string }
  >();
  const aiSdkTools: Record<string, Tool> = {};
  const serverRuntimes: Array<{
    server: MCPServerConfig & { __nodeId?: string };
    runtime: AiSdkMcpServerRuntime;
    toolDefinitions: {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: { type: "object"; properties?: Record<string, unknown> };
      }>;
    };
    exportEntries: Array<{
      exportName: string;
      originalName: string;
      toolDescription?: string;
      definition: { name: string; description: string; parameters: unknown };
    }>;
  }> = [];

  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const key = cacheKey(companyId, server);
      const now = Date.now();
      const hit = toolListCache.get(key);
      let tools: MCPToolDescriptor[];
      if (hit && hit.expiresAt > now) {
        tools = hit.tools;
      } else {
        tools = await mcpClient.listTools(server, companyId, {
          nodeId: server.__nodeId,
        });
        toolListCache.set(key, {
          expiresAt: now + TOOL_LIST_TTL_MS,
          tools,
        });
      }
      return { server, tools };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const server = servers[i];
    const r = results[i];
    if (r.status === "rejected") {
      const { reason, details } = deniedReasonFromError(r.reason);
      denied.push({
        serverId: server.id,
        serverName: server.name,
        reason,
        details,
      });
      continue;
    }

    const { tools: rawTools } = r.value;
    const { exportableToolCount: addedForServer } =
      countExportableMcpToolsForServer(server, rawTools);
    const filtered = applyMcpToolFilter(rawTools, server.toolFilter);
    const serverExportEntries: Array<{
      exportName: string;
      originalName: string;
      toolDescription?: string;
      definition: { name: string; description: string; parameters: unknown };
    }> = [];

    for (const tool of filtered) {
      const issue = inputSchemaIssue(tool);
      if (issue) {
        denied.push({
          serverId: server.id,
          serverName: server.name,
          reason: "validation",
          details: `tool ${tool.name}: ${issue}`,
        });
        continue;
      }
      const { name: exportName, collision } = buildPrefixedName(
        server.id,
        tool.name,
        hashNameLookup,
      );
      if (collision) {
        denied.push({
          serverId: server.id,
          serverName: server.name,
          reason: "validation",
          details: `tool ${tool.name}: export name hash collision`,
        });
        continue;
      }
      if (!isValidMcpProviderExportName(exportName)) {
        denied.push({
          serverId: server.id,
          serverName: server.name,
          reason: "validation",
          details: `tool ${tool.name}: export name failed provider length or character contract`,
        });
        continue;
      }
      serverExportEntries.push({
        exportName,
        originalName: tool.name,
        toolDescription: tool.description,
        definition: convertToolToFunctionDefinition(
          tool,
          server.id,
          server.name,
          exportName,
        ),
      });
    }

    if (addedForServer === 0) {
      const detail =
        rawTools.length === 0
          ? "Server returned no tools."
          : filtered.length === 0
            ? "Tool filter excludes every tool from this server."
            : "No tools passed schema validation for export.";
      const entry = {
        serverId: server.id,
        serverName: server.name,
        nodeId: server.__nodeId,
        detail,
      };
      zeroCallableTools.push(entry);
      denied.push({
        serverId: server.id,
        serverName: server.name,
        reason: "zero_callable_tools",
        details: detail,
      });
      continue;
    }

    if (serverExportEntries.length === 0) {
      continue;
    }

    const toolDefinitions = {
      tools: serverExportEntries.map(({ originalName, definition }) => ({
        name: originalName,
        description: definition.description,
        inputSchema: definition.parameters as {
          type: "object";
          properties?: Record<string, unknown>;
          required?: string[];
          [key: string]: unknown;
        },
      })),
    };

    const commitServerTools = (
      runtime: AiSdkMcpServerRuntime,
    ): number => {
      const serverToolMap = runtime.client.toolsFromDefinitions(toolDefinitions);
      let committedCount = 0;
      for (const entry of serverExportEntries) {
        const originalTool = serverToolMap[entry.originalName];
        if (!originalTool) {
          denied.push({
            serverId: server.id,
            serverName: server.name,
            reason: "validation",
            details: `tool ${entry.originalName}: missing from AI SDK MCP runtime`,
          });
          continue;
        }
        functionDefinitions.push(entry.definition);
        serverIndex.set(entry.exportName, {
          server,
          originalName: entry.originalName,
          nodeId: server.__nodeId,
        });
        aiSdkTools[entry.exportName] = originalTool;
        committedCount += 1;
      }
      return committedCount;
    };

    const recordZeroCallableServer = (detail: string): void => {
      zeroCallableTools.push({
        serverId: server.id,
        serverName: server.name,
        nodeId: server.__nodeId,
        detail,
      });
      denied.push({
        serverId: server.id,
        serverName: server.name,
        reason: "zero_callable_tools",
        details: detail,
      });
    };

    try {
      const runtime = await mcpClient.createAiSdkMcpRuntimeForServer(
        server,
        companyId,
        { nodeId: server.__nodeId },
      );
      const committedCount = commitServerTools(runtime);
      if (committedCount === 0) {
        await runtime.close();
        recordZeroCallableServer(
          "No tools were registered in the AI SDK MCP runtime.",
        );
        continue;
      }
      serverRuntimes.push({
        server,
        runtime,
        toolDefinitions,
        exportEntries: serverExportEntries,
      });
    } catch (err) {
      const { reason, details } = deniedReasonFromError(err);
      denied.push({
        serverId: server.id,
        serverName: server.name,
        reason,
        details,
      });
      recordZeroCallableServer(
        details ?? "Failed to initialize AI SDK MCP runtime.",
      );
    }
  }

  let toolsetClosed = false;
  const close = async (): Promise<void> => {
    if (toolsetClosed) {
      return;
    }
    toolsetClosed = true;
    await Promise.all(serverRuntimes.map(({ runtime }) => runtime.close()));
  };

  const reconnectServer = async (serverId: string): Promise<void> => {
    const entry = serverRuntimes.find(({ server: srv }) => srv.id === serverId);
    if (!entry) {
      return;
    }
    entry.runtime = await entry.runtime.recreate();
    const serverToolMap = entry.runtime.client.toolsFromDefinitions(
      entry.toolDefinitions,
    );
    for (const exportEntry of entry.exportEntries) {
      const originalTool = serverToolMap[exportEntry.originalName];
      if (originalTool) {
        aiSdkTools[exportEntry.exportName] = originalTool;
      }
    }
  };

  return {
    functionDefinitions,
    denied,
    zeroCallableTools,
    serverIndex,
    hashNameLookup,
    tools: aiSdkTools,
    close,
    reconnectServer,
  };
}

/** Alias retained for assistant MCP runtime wiring. */
export const loadAssistantMcpRuntimeForServers = loadFunctionDefinitionsForServers;

export function isMcpFunctionName(name: string): boolean {
  return typeof name === "string" && name.startsWith(MCP_FUNCTION_NAME_PREFIX);
}

export function clearToolListCache(scope?: {
  companyId?: number;
  serverId?: string;
}): void {
  if (!scope?.companyId && !scope?.serverId) {
    toolListCache.clear();
    return;
  }
  for (const k of toolListCache.keys()) {
    const i1 = k.indexOf(":");
    const i2 = k.indexOf(":", i1 + 1);
    if (i1 < 0 || i2 < 0) {
      toolListCache.delete(k);
      continue;
    }
    const comp = k.slice(0, i1);
    const srv = k.slice(i1 + 1, i2);
    if (scope.companyId !== undefined && comp !== String(scope.companyId)) {
      continue;
    }
    if (scope.serverId !== undefined && srv !== scope.serverId) {
      continue;
    }
    toolListCache.delete(k);
  }
}
