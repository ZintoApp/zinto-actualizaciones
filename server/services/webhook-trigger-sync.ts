import type { InsertWebhookTrigger, WebhookTrigger } from "@shared/schema";
import { insertWebhookTriggerSchema } from "@shared/schema";
import {
  buildMasterShopWebhookTriggerMetadata,
  type MasterShopWebhookTriggerNodeData,
} from "@shared/types/mastershop";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { generateWebhookVerifyToken } from "../utils/webhook-token-generator";

const WEBHOOK_TRIGGER_NODE_TYPES = new Set(["webhookTrigger", "mastershopWebhookTrigger"]);

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: Array<{ nodeId: string; message: string }>;
}

interface FlowNode {
  id: string;
  type?: string;
  data?: {
    webhookToken?: string;
    customPath?: string;
    useCustomPath?: boolean;
    filterConditions?: unknown[];
    contactMapping?: unknown;
    selectedPreset?: string;
    selectedEventIds?: number[];
    selectedPresetIds?: string[];
    metadata?: Record<string, unknown>;
    customVariableMappings?: Record<string, string>;
    responseConfig?: {
      statusCode?: number;
      mode?: string;
      bodyTemplate?: string;
      headers?: Record<string, string>;
      timeout?: number;
    };
  };
}

/**
 * Extract and validate webhook trigger data from a flow node.
 * Applies defaults for missing fields. Generates webhookToken if missing.
 */
export function extractWebhookTriggerData(
  node: FlowNode,
  flowId: number,
  companyId: number
): InsertWebhookTrigger | null {
  if (!node?.id || !node.type || !WEBHOOK_TRIGGER_NODE_TYPES.has(node.type)) return null;

  const data = node.data ?? {};
  let webhookToken = data.webhookToken;
  if (!webhookToken || typeof webhookToken !== "string" || webhookToken.length < 32) {
    webhookToken = generateWebhookVerifyToken(48);
  }

  const useCustomPath = data.useCustomPath === true;
  const customPath =
    useCustomPath && data.customPath && String(data.customPath).trim()
      ? String(data.customPath).trim()
      : null;

  const filterConditions = Array.isArray(data.filterConditions) ? data.filterConditions : [];
  const contactMapping =
    data.contactMapping && typeof data.contactMapping === "object" && data.contactMapping !== null
      ? (data.contactMapping as Record<string, unknown>)
      : { strategy: "system" };

  const rc = data.responseConfig;
  const responseConfig = {
    statusCode:
      typeof rc?.statusCode === "number" && rc.statusCode >= 100 && rc.statusCode <= 599
        ? rc.statusCode
        : 200,
    mode: rc?.mode === "sync" || rc?.mode === "async" ? rc.mode : "async",
    bodyTemplate: typeof rc?.bodyTemplate === "string" ? rc.bodyTemplate : "",
    headers:
      rc?.headers && typeof rc.headers === "object" && rc.headers !== null
        ? (rc.headers as Record<string, string>)
        : {},
    ...(typeof rc?.timeout === "number" &&
      rc.timeout >= 1000 &&
      rc.timeout <= 120000 && { timeout: rc.timeout })
  };

  const metadata =
    node.type === "mastershopWebhookTrigger"
      ? buildMasterShopWebhookTriggerMetadata(data as MasterShopWebhookTriggerNodeData)
      : {};

  const payload = {
    flowId,
    nodeId: node.id,
    companyId,
    webhookToken,
    customPath,
    isActive: true,
    filterConditions,
    contactMapping,
    responseConfig,
    metadata
  };

  const result = insertWebhookTriggerSchema.safeParse(payload);
  if (!result.success) {
    logger.error(
      "WebhookTriggerSync",
      "extractWebhookTriggerData validation failed",
      { flowId, nodeId: node.id, errors: result.error.flatten() }
    );
    return null;
  }
  return result.data;
}

/**
 * Ensure customPath is unique across all flows when set.
 * Returns true if safe to create/update (no conflict or same trigger).
 */
async function isCustomPathAvailable(
  customPath: string | null,
  flowId: number,
  nodeId: string,
  existingTriggerId?: number
): Promise<boolean> {
  if (!customPath || !customPath.trim()) return true;
  const existing = await storage.getWebhookTriggerByCustomPath(customPath);
  if (!existing) return true;
  if (existing.flowId === flowId && existing.nodeId === nodeId) return true;
  if (existingTriggerId !== undefined && existing.id === existingTriggerId) return true;
  return false;
}

/**
 * Synchronize webhook_triggers table with webhook trigger nodes in a flow.
 * Creates new entries, updates existing ones, and deletes orphaned triggers.
 */
export async function syncWebhookTriggersForFlow(
  flowId: number,
  nodes: unknown[],
  companyId: number
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  const nodeList = Array.isArray(nodes) ? (nodes as FlowNode[]) : [];
  const webhookNodes = nodeList.filter(
    (n) => n?.type && WEBHOOK_TRIGGER_NODE_TYPES.has(n.type)
  );

  logger.info("WebhookTriggerSync", "Sync started", {
    flowId,
    webhookNodeCount: webhookNodes.length
  });

  const existingTriggers = await storage.getWebhookTriggers(flowId);
  const existingByNodeId = new Map<string, WebhookTrigger>();
  for (const t of existingTriggers) {
    existingByNodeId.set(t.nodeId, t);
  }

  for (const node of webhookNodes) {
    const triggerData = extractWebhookTriggerData(node, flowId, companyId);
    if (!triggerData) {
      result.errors.push({ nodeId: node.id, message: "Failed to extract or validate trigger data" });
      continue;
    }

    const customPathToUse =
      triggerData.customPath === undefined || triggerData.customPath === null
        ? null
        : String(triggerData.customPath).trim() || null;

    if (customPathToUse) {
      const existingTrigger = existingByNodeId.get(node.id);
      const available = await isCustomPathAvailable(
        customPathToUse,
        flowId,
        node.id,
        existingTrigger?.id
      );
      if (!available) {
        result.errors.push({
          nodeId: node.id,
          message: `Custom path "${customPathToUse}" is already used by another webhook trigger`
        });
        continue;
      }
    }

    const existing = existingByNodeId.get(node.id);

    try {
      if (existing) {
        const updates: Partial<InsertWebhookTrigger> = {
          customPath: customPathToUse,
          filterConditions: triggerData.filterConditions,
          contactMapping: triggerData.contactMapping,
          responseConfig: triggerData.responseConfig,
          metadata: triggerData.metadata
        };
        const nodeToken = node.data?.webhookToken;
        if (
          typeof nodeToken === "string" &&
          nodeToken.length >= 32 &&
          nodeToken !== existing.webhookToken
        ) {
          updates.webhookToken = nodeToken;
        }
        await storage.updateWebhookTrigger(existing.id, updates);
        result.updated++;
        logger.debug("WebhookTriggerSync", "Updated trigger", {
          flowId,
          nodeId: node.id,
          triggerId: existing.id
        });
      } else {
        const createPayload: InsertWebhookTrigger = {
          ...triggerData,
          isActive: true
        };
        const created = await storage.createWebhookTrigger(createPayload);
        result.created++;
        existingByNodeId.set(node.id, created);
        logger.debug("WebhookTriggerSync", "Created trigger", {
          flowId,
          nodeId: node.id,
          triggerId: created.id
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("WebhookTriggerSync", "Sync operation failed", {
        flowId,
        nodeId: node.id,
        error: message
      });
      result.errors.push({ nodeId: node.id, message });
    }
  }

  const nodeIds = new Set(webhookNodes.map((n) => n.id));
  for (const trigger of existingTriggers) {
    if (!nodeIds.has(trigger.nodeId)) {
      try {
        await storage.deleteWebhookTrigger(trigger.id);
        result.deleted++;
        logger.debug("WebhookTriggerSync", "Deleted orphaned trigger", {
          flowId,
          nodeId: trigger.nodeId,
          triggerId: trigger.id
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("WebhookTriggerSync", "Delete orphaned trigger failed", {
          flowId,
          nodeId: trigger.nodeId,
          triggerId: trigger.id,
          error: message
        });
        result.errors.push({ nodeId: trigger.nodeId, message });
      }
    }
  }

  logger.info("WebhookTriggerSync", "Sync completed", {
    flowId,
    ...result
  });

  return result;
}
