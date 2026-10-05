/** Single source of truth for MCP node/config types shared by React canvas nodes (`MCPClientToolNode`, `MCPExecuteToolNode`) and upcoming `server/services/mcp/` modules. */

export type MCPTransportType = 'streamable-http' | 'sse';

export type MCPAuthMode = 'none' | 'headers' | 'oauth2';

export interface MCPHeader {
  id: string;
  key: string;
  value: string;
}

export type MCPToolFilterMode = 'all' | 'include' | 'exclude';

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  transport: MCPTransportType;
  authMode: MCPAuthMode;
  headers?: MCPHeader[];
  oauth?: {
    clientId?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    redirectUri?: string;
  };
  toolFilter?: { mode: MCPToolFilterMode; tools: string[] };
  sessionId?: string;
  timeoutMs?: number;
}

/** Persisted when the user refreshes tools or when discovery fails (flow canvas rehydration). */
export interface MCPToolDiscoverySummary {
  lastRefreshAt: string;
  lastRefreshStatus: "ok" | "error";
  lastErrorMessage?: string;
  /** Raw tool count from the server on last successful list-tools */
  rawToolCountAtRefresh: number;
  /** Tools matching the include/exclude filter (before export/schema validation). */
  exposedToolCountAtRefresh: number;
  /**
   * Tools the executor would register after the same checks as `mcp-tool-bridge` (filter, input schema, export names).
   * Prefer this for “callable” UI; may be absent on flows saved before this field existed.
   */
  exportableToolCountAtRefresh?: number;
}

export interface MCPClientToolNodeData {
  label?: string;
  servers: MCPServerConfig[];
  /** Keys match `MCPServerConfig.id` */
  mcpToolDiscoveryByServerId?: Record<string, MCPToolDiscoverySummary>;
}

export interface MCPExecuteToolNodeData {
  label?: string;
  serverConfig?: MCPServerConfig;
  sourceMcpClientNodeId?: string;
  sourceServerId?: string;
  toolName?: string;
  argumentsJson?: string;
  outputVariablePrefix?: string;
}

export interface MCPToolDescriptor {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface MCPCallResult {
  ok: boolean;
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
  error?: string;
}
