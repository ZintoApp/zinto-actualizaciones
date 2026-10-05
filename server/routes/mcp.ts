import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ensureCompanyUser } from "../middleware";
import { logger } from "../utils/logger";
import { mcpClient, MCPClientError } from "../services/mcp/mcp-client";
import {
  clearToolListCache,
  countExportableMcpToolsForServer,
} from "../services/mcp/mcp-tool-bridge";
import {
  mcpOauthService,
  resolveOAuthRedirectUri,
  buildRedirectUri,
} from "../services/mcp/mcp-oauth-service";
import * as mcpTokenStore from "../services/mcp/mcp-token-store";
import type {
  MCPServerConfig,
  MCPToolDescriptor,
  MCPTransportType,
  MCPAuthMode,
} from "@shared/types/mcp";

export const mcpHeaderSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
});

const transportEnum = z.enum(["streamable-http", "sse"]) satisfies z.ZodType<MCPTransportType>;
const authModeEnum = z.enum(["none", "headers", "oauth2"]) satisfies z.ZodType<MCPAuthMode>;

const oauthSchema = z
  .object({
    clientId: z.string().optional(),
    authorizationUrl: z.string().url().optional(),
    tokenUrl: z.string().url().optional(),
    scopes: z.array(z.string()).optional(),
    redirectUri: z.string().url().optional(),
  })
  .optional();

export const mcpServerConfigSchema: z.ZodType<MCPServerConfig> = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  transport: transportEnum,
  authMode: authModeEnum,
  headers: z.array(mcpHeaderSchema).optional(),
  oauth: oauthSchema,
  toolFilter: z
    .object({
      mode: z.enum(["all", "include", "exclude"]),
      tools: z.array(z.string()),
    })
    .optional(),
  sessionId: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

const listToolsBodySchema = z.object({
  server: mcpServerConfigSchema,
  nodeId: z.string().optional(),
});

const mcpToolDescriptorSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  /** Omitted by some servers; bridge treats null/missing as valid for validation. */
  inputSchema: z.unknown().optional(),
});

const countExportableBodySchema = z.object({
  server: mcpServerConfigSchema,
  tools: z.array(mcpToolDescriptorSchema),
  nodeId: z.string().optional(),
});

const testConnectionBodySchema = listToolsBodySchema;

const oauthStartBodySchema = z
  .object({
    server: mcpServerConfigSchema,
    nodeId: z.string().min(1),
  })
  .refine((data) => data.server.authMode === "oauth2", {
    message: "server.authMode must be oauth2",
    path: ["server", "authMode"],
  })
  .refine(
    (data) => {
      const o = data.server.oauth;
      return !!(
        o?.clientId?.trim() &&
        o?.authorizationUrl?.trim() &&
        o?.tokenUrl?.trim()
      );
    },
    {
      message:
        "server.oauth.clientId, authorizationUrl, and tokenUrl are required for OAuth start",
      path: ["server", "oauth"],
    },
  );

const disconnectBodySchema = z.object({
  nodeId: z.string().min(1),
  serverId: z.string().min(1),
});

const oauthStatusQuerySchema = z.object({
  nodeId: z.string().min(1),
  serverId: z.string().min(1),
});

/** Only `oauth` affects redirect resolution; avoid requiring a valid MCP `url` while the user is editing. */
const oauthResolveRedirectBodySchema = z.object({
  server: z
    .object({
      oauth: oauthSchema,
    })
    .passthrough()
    .optional(),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

function getCompanyId(req: Request): number | null {
  const id = (req as { user?: { companyId?: number | null } }).user?.companyId;
  return typeof id === "number" ? id : null;
}

function mapMCPErrorToStatus(err: MCPClientError): number {
  if (err.httpStatusHint != null) {
    return err.httpStatusHint;
  }
  switch (err.kind) {
    case "auth":
      return 401;
    case "tool_not_found":
      return 404;
    case "validation":
      return 400;
    case "transport":
      return 502;
    case "tool_execution":
      return 500;
    default:
      return 500;
  }
}

function respondMCPError(
  res: Response,
  source: string,
  err: unknown,
): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: "invalid_request",
      code: "validation",
      details: err.issues,
    });
    return;
  }
  const mcpErr = MCPClientError.fromUnknown(err);
  logger.error("mcp-routes", source, mcpErr);
  res.status(mapMCPErrorToStatus(mcpErr)).json({
    error: mcpErr.message,
    code: mcpErr.kind,
    details:
      mcpErr.cause instanceof Error ? mcpErr.cause.message : undefined,
  });
}

/** Safe for embedding JSON as a JS expression in HTML: blocks `</script>` and related breakouts. */
function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildCallbackHtml(payload: {
  ok: boolean;
  serverId?: string;
  nodeId?: string;
  error?: string;
}): string {
  const envelope = { type: "mcp-oauth-complete" as const, ...payload };
  const payloadJson = jsonForInlineScript(envelope);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <title>MCP OAuth</title>
</head>
<body>
  <p>You can close this window.</p>
  <script>
    (function () {
      try {
        const payload = ${payloadJson};
        window.opener && window.opener.postMessage(payload, '*');
      } finally {
        setTimeout(function () { window.close(); }, 400);
      }
    })();
  </script>
</body>
</html>`;
}

const router = Router();

router.post("/list-tools", ensureCompanyUser, async (req, res) => {
  try {
    const { server, nodeId } = listToolsBodySchema.parse(req.body);
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ error: "Company ID is required" });
    }
    const tools = await mcpClient.listTools(server, companyId, { nodeId });
    clearToolListCache({ companyId, serverId: server.id });
    const counts = countExportableMcpToolsForServer(server, tools);
    res.json({
      tools,
      rawToolCount: counts.rawToolCount,
      filterExposedCount: counts.filterExposedCount,
      exportableToolCount: counts.exportableToolCount,
    });
  } catch (err) {
    logger.error("mcp-routes", "list-tools", err);
    respondMCPError(res, "list-tools", err);
  }
});

/** Same exportability rules as flow execution; body tools typically come from a prior list-tools response. */
router.post("/count-exportable", ensureCompanyUser, async (req, res) => {
  try {
    const { server, tools } = countExportableBodySchema.parse(req.body);
    const counts = countExportableMcpToolsForServer(server, tools as MCPToolDescriptor[]);
    res.json({
      rawToolCount: counts.rawToolCount,
      filterExposedCount: counts.filterExposedCount,
      exportableToolCount: counts.exportableToolCount,
    });
  } catch (err) {
    logger.error("mcp-routes", "count-exportable", err);
    respondMCPError(res, "count-exportable", err);
  }
});

router.post("/test-connection", ensureCompanyUser, async (req, res) => {
  try {
    const { server, nodeId } = testConnectionBodySchema.parse(req.body);
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ ok: false, error: "Company ID is required" });
    }
    const { serverInfo, capabilities } = await mcpClient.fetchServerInfo(
      server,
      companyId,
      { nodeId },
    );
    clearToolListCache({ companyId, serverId: server.id });
    res.json({ ok: true, serverInfo, capabilities });
  } catch (err) {
    logger.error("mcp-routes", "test-connection", err);
    const mcpErr =
      err instanceof z.ZodError
        ? MCPClientError.fromUnknown(err)
        : err instanceof MCPClientError
          ? err
          : MCPClientError.fromUnknown(err);
    res.status(mapMCPErrorToStatus(mcpErr)).json({
      ok: false,
      error: mcpErr.message,
      code: mcpErr.kind,
    });
  }
});

router.post("/oauth/start", ensureCompanyUser, async (req, res) => {
  try {
    const { server, nodeId } = oauthStartBodySchema.parse(req.body);
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ error: "Company ID is required" });
    }
    const userId = (req as { user?: { id: number } }).user?.id;
    if (userId == null) {
      return res.status(400).json({ error: "User ID is required" });
    }
    const { authorizationUrl, state, redirectUri } =
      await mcpOauthService.startAuthorization({
        config: server,
        companyId,
        userId,
        nodeId,
        req,
      });
    logger.info("mcp-routes", "oauth-start", {
      companyId,
      nodeId,
      serverId: server.id,
    });
    res.json({ authorizationUrl, state, redirectUri });
  } catch (err) {
    logger.error("mcp-routes", "oauth-start", err);
    respondMCPError(res, "oauth-start", err);
  }
});

router.post("/oauth/resolve-redirect", ensureCompanyUser, async (req, res) => {
  try {
    const { server } = oauthResolveRedirectBodySchema.parse(req.body ?? {});
    const redirectUri = server
      ? resolveOAuthRedirectUri(server, req)
      : buildRedirectUri(req);
    res.json({ redirectUri });
  } catch (err) {
    logger.error("mcp-routes", "oauth-resolve-redirect", err);
    respondMCPError(res, "oauth-resolve-redirect", err);
  }
});

router.post("/disconnect", ensureCompanyUser, async (req, res) => {
  try {
    const { nodeId, serverId } = disconnectBodySchema.parse(req.body);
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ error: "Company ID is required" });
    }
    await mcpOauthService.revoke({ companyId, nodeId, serverId });
    await mcpTokenStore.deleteToken({ companyId, nodeId, serverId });
    res.json({ ok: true });
  } catch (err) {
    logger.error("mcp-routes", "disconnect", err);
    respondMCPError(res, "disconnect", err);
  }
});

router.get("/oauth/status", ensureCompanyUser, async (req, res) => {
  try {
    const { nodeId, serverId } = oauthStatusQuerySchema.parse(req.query);
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ error: "Company ID is required" });
    }
    const tok = await mcpTokenStore.getToken({ companyId, nodeId, serverId });
    if (!tok) {
      return res.json({ connected: false });
    }
    const expired = mcpTokenStore.isExpired(tok);
    if (expired && !tok.refreshToken) {
      return res.json({
        connected: false,
        expired: true,
        expiresAt: tok.expiresAt?.toISOString(),
      });
    }
    res.json({
      connected: true,
      expiresAt: tok.expiresAt?.toISOString() ?? undefined,
      scope: tok.scope ?? undefined,
    });
  } catch (err) {
    logger.error("mcp-routes", "oauth-status", err);
    respondMCPError(res, "oauth-status", err);
  }
});

export default router;
