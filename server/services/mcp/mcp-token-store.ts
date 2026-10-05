import { db } from "../../db";
import { mcpOauthTokens, type MCPOauthToken } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../utils/logger";

export async function getToken(params: {
  companyId: number;
  nodeId: string;
  serverId: string;
}): Promise<MCPOauthToken | null> {
  try {
    const rows = await db
      .select()
      .from(mcpOauthTokens)
      .where(
        and(
          eq(mcpOauthTokens.companyId, params.companyId),
          eq(mcpOauthTokens.nodeId, params.nodeId),
          eq(mcpOauthTokens.serverId, params.serverId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    logger.error("mcp-token-store", "getToken failed", err);
    throw err;
  }
}

export async function upsertToken(input: {
  companyId: number;
  nodeId: string;
  serverId: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string;
  scope?: string | null;
  expiresAt?: Date | null;
}): Promise<MCPOauthToken> {
  try {
    const rows = await db
      .insert(mcpOauthTokens)
      .values({
        companyId: input.companyId,
        nodeId: input.nodeId,
        serverId: input.serverId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken ?? null,
        tokenType: input.tokenType ?? "Bearer",
        scope: input.scope ?? null,
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          mcpOauthTokens.companyId,
          mcpOauthTokens.nodeId,
          mcpOauthTokens.serverId,
        ],
        set: {
          accessToken: sql`excluded.access_token`,
          refreshToken: sql`excluded.refresh_token`,
          tokenType: sql`excluded.token_type`,
          scope: sql`excluded.scope`,
          expiresAt: sql`excluded.expires_at`,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error("mcp_oauth_upsert_no_row");
    }
    return row;
  } catch (err) {
    logger.error("mcp-token-store", "upsertToken failed", err);
    throw err;
  }
}

export async function deleteToken(params: {
  companyId: number;
  nodeId: string;
  serverId: string;
}): Promise<void> {
  try {
    await db
      .delete(mcpOauthTokens)
      .where(
        and(
          eq(mcpOauthTokens.companyId, params.companyId),
          eq(mcpOauthTokens.nodeId, params.nodeId),
          eq(mcpOauthTokens.serverId, params.serverId),
        ),
      );
  } catch (err) {
    logger.error("mcp-token-store", "deleteToken failed", err);
    throw err;
  }
}

export async function markExpired(params: {
  companyId: number;
  nodeId: string;
  serverId: string;
}): Promise<void> {
  try {
    await db
      .update(mcpOauthTokens)
      .set({
        expiresAt: sql`now() - interval '1 second'`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(mcpOauthTokens.companyId, params.companyId),
          eq(mcpOauthTokens.nodeId, params.nodeId),
          eq(mcpOauthTokens.serverId, params.serverId),
        ),
      );
  } catch (err) {
    logger.error("mcp-token-store", "markExpired failed", err);
    throw err;
  }
}

export function isExpired(token: MCPOauthToken, skewSeconds = 30): boolean {
  if (!token.expiresAt) {
    return false;
  }
  const expiryMs = token.expiresAt.getTime();
  const threshold = expiryMs - skewSeconds * 1000;
  return Date.now() >= threshold;
}
