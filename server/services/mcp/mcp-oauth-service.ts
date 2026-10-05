import crypto from "crypto";
import type { MCPServerConfig } from "@shared/types/mcp";
import type { MCPOauthToken } from "@shared/schema";
import * as tokenStore from "./mcp-token-store";
import { logger } from "../../utils/logger";
import { MCPClientError } from "./mcp-client";

interface PendingState {
  codeVerifier: string;
  companyId: number;
  userId: number;
  nodeId: string;
  serverConfig: MCPServerConfig;
  createdAt: number;
  redirectUri: string;
}

const pendingStates = new Map<string, PendingState>();

const SWEEP_MS = 10 * 60 * 1000;
const pendingSweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates.entries()) {
    if (now - v.createdAt > SWEEP_MS) {
      pendingStates.delete(k);
    }
  }
}, SWEEP_MS);
if (typeof (pendingSweep as NodeJS.Timeout).unref === "function") {
  (pendingSweep as NodeJS.Timeout).unref();
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

export function buildRedirectUri(req?: {
  protocol?: string;
  get?: (name: string) => string | undefined;
}): string {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base) {
    return `${base}/api/mcp/oauth/callback`;
  }
  if (req?.get) {
    const host = req.get("host") ?? "localhost";
    const proto = req.protocol ?? "http";
    return `${proto}://${host}/api/mcp/oauth/callback`;
  }
  return "/api/mcp/oauth/callback";
}

/** Same redirect resolution as `startAuthorization` (excluding explicit `redirectUri` override param). */
export function resolveOAuthRedirectUri(
  config: Pick<MCPServerConfig, "oauth">,
  req?: Parameters<typeof buildRedirectUri>[0],
): string {
  const fromConfig = config.oauth?.redirectUri?.trim();
  if (fromConfig) return fromConfig;
  return buildRedirectUri(req);
}

async function startAuthorization(params: {
  config: MCPServerConfig;
  companyId: number;
  userId: number;
  nodeId: string;
  /** When omitted, uses `config.oauth.redirectUri` or `buildRedirectUri(req)`. */
  redirectUri?: string;
  req?: Parameters<typeof buildRedirectUri>[0];
}): Promise<{ authorizationUrl: string; state: string; redirectUri: string }> {
  const { config } = params;
  const { authorizationUrl, tokenUrl, clientId } = config.oauth ?? {};
  if (!authorizationUrl?.trim() || !tokenUrl?.trim() || !clientId?.trim()) {
    throw new MCPClientError("OAuth configuration incomplete (authorizationUrl, tokenUrl, clientId required)", {
      kind: "validation",
      httpStatusHint: 400,
    });
  }

  const resolvedRedirect =
    params.redirectUri?.trim() || resolveOAuthRedirectUri(config, params.req);

  const state = base64url(crypto.randomBytes(16));
  const { codeVerifier, codeChallenge } = generatePkcePair();

  pendingStates.set(state, {
    codeVerifier,
    companyId: params.companyId,
    userId: params.userId,
    nodeId: params.nodeId,
    serverConfig: config,
    createdAt: Date.now(),
    redirectUri: resolvedRedirect,
  });

  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: resolvedRedirect,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const scopes = config.oauth?.scopes?.filter(Boolean) ?? [];
  if (scopes.length > 0) {
    q.set("scope", scopes.join(" "));
  }

  const sep = authorizationUrl.includes("?") ? "&" : "?";
  return {
    authorizationUrl: `${authorizationUrl}${sep}${q.toString()}`,
    state,
    redirectUri: resolvedRedirect,
  };
}

async function handleCallback(params: {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}): Promise<
  | { companyId: number; nodeId: string; serverId: string; ok: true }
  | { ok: false; error: string }
> {
  if (params.error) {
    if (params.state) {
      pendingStates.delete(params.state);
    }
    return { ok: false, error: params.error };
  }
  const { code, state } = params;
  if (!code || !state) {
    return { ok: false, error: "missing_code_or_state" };
  }

  const pending = pendingStates.get(state);
  if (!pending) {
    return { ok: false, error: "invalid_or_expired_state" };
  }

  const { serverConfig } = pending;
  const tokenUrl = serverConfig.oauth?.tokenUrl;
  const clientId = serverConfig.oauth?.clientId;
  if (!tokenUrl || !clientId) {
    pendingStates.delete(state);
    return { ok: false, error: "invalid_server_oauth_config" };
  }

  const oauthExt = serverConfig.oauth as
    | { clientSecret?: string }
    | undefined;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: clientId,
    code_verifier: pending.codeVerifier,
  });
  if (oauthExt?.clientSecret) {
    body.set("client_secret", oauthExt.clientSecret);
  }

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (e) {
    logger.error("mcp-oauth", "token exchange fetch failed", e);
    pendingStates.delete(state);
    return { ok: false, error: "token_exchange_failed" };
  }

  if (!res.ok) {
    logger.error("mcp-oauth", "token exchange non-OK", res.status, await res.text().catch(() => ""));
    pendingStates.delete(state);
    return { ok: false, error: "token_exchange_failed" };
  }

  let json: {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch (e) {
    logger.error("mcp-oauth", "token exchange JSON parse failed", e);
    pendingStates.delete(state);
    return { ok: false, error: "token_exchange_failed" };
  }

  if (!json.access_token) {
    pendingStates.delete(state);
    return { ok: false, error: "token_exchange_failed" };
  }

  await tokenStore.upsertToken({
    companyId: pending.companyId,
    nodeId: pending.nodeId,
    serverId: serverConfig.id,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    tokenType: json.token_type ?? "Bearer",
    scope: json.scope ?? null,
    expiresAt:
      typeof json.expires_in === "number"
        ? new Date(Date.now() + json.expires_in * 1000)
        : null,
  });

  pendingStates.delete(state);

  return {
    ok: true,
    companyId: pending.companyId,
    nodeId: pending.nodeId,
    serverId: serverConfig.id,
  };
}

async function refresh(params: {
  config: MCPServerConfig;
  companyId: number;
  nodeId: string;
}): Promise<MCPOauthToken> {
  const { config, companyId, nodeId } = params;
  const existing = await tokenStore.getToken({
    companyId,
    nodeId,
    serverId: config.id,
  });
  if (!existing?.refreshToken) {
    throw new MCPClientError("No OAuth refresh token stored", {
      kind: "auth",
      httpStatusHint: 401,
    });
  }

  const tokenUrl = config.oauth?.tokenUrl;
  const clientId = config.oauth?.clientId;
  if (!tokenUrl || !clientId) {
    throw new MCPClientError("OAuth token endpoint or client id missing", {
      kind: "auth",
      httpStatusHint: 401,
    });
  }

  const oauthExt = config.oauth as { clientSecret?: string } | undefined;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: existing.refreshToken,
    client_id: clientId,
  });
  if (oauthExt?.clientSecret) {
    body.set("client_secret", oauthExt.clientSecret);
  }

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (e) {
    logger.error("mcp-oauth", "refresh fetch failed", e);
    await tokenStore.markExpired({ companyId, nodeId, serverId: config.id });
    throw new MCPClientError("OAuth refresh request failed", {
      kind: "auth",
      httpStatusHint: 401,
      cause: e,
    });
  }

  if (!res.ok) {
    logger.error("mcp-oauth", "refresh non-OK", res.status);
    await tokenStore.markExpired({ companyId, nodeId, serverId: config.id });
    throw new MCPClientError("OAuth refresh rejected", {
      kind: "auth",
      httpStatusHint: res.status,
    });
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    await tokenStore.markExpired({ companyId, nodeId, serverId: config.id });
    throw new MCPClientError("OAuth refresh missing access_token", {
      kind: "auth",
      httpStatusHint: 401,
    });
  }

  return tokenStore.upsertToken({
    companyId,
    nodeId,
    serverId: config.id,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? existing.refreshToken,
    tokenType: json.token_type ?? existing.tokenType ?? "Bearer",
    scope: json.scope ?? existing.scope,
    expiresAt:
      typeof json.expires_in === "number"
        ? new Date(Date.now() + json.expires_in * 1000)
        : null,
  });
}

async function revoke(params: {
  companyId: number;
  nodeId: string;
  serverId: string;
}): Promise<void> {
  await tokenStore.deleteToken(params);
  logger.info("mcp-oauth", "revoked MCP OAuth token row", params);
}

export const mcpOauthService = {
  startAuthorization,
  handleCallback,
  refresh,
  revoke,
};
