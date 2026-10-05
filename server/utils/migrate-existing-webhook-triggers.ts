/**
 * One-time migration: backfill webhook_triggers table from existing flow nodes.
 * Run after deploying webhook trigger sync (e.g. npx tsx server/utils/migrate-existing-webhook-triggers.ts).
 * Ensures flows that already have webhook trigger nodes get corresponding database entries.
 */

import { getDb } from "../db";
import { flows } from "@shared/schema";
import { syncWebhookTriggersForFlow } from "../services/webhook-trigger-sync";
import { logger } from "./logger";

async function main() {
  const db = getDb();
  const allFlows = await db.select().from(flows);
  let flowsProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

  logger.info("MigrateExistingWebhookTriggers", "Starting backfill", { flowCount: allFlows.length });

  for (const flow of allFlows) {
    const nodes = flow.nodes ?? [];
    const hasWebhookNodes =
      Array.isArray(nodes) &&
      (nodes as any[]).some(
        (n: any) => n?.type === "webhookTrigger" || n?.type === "mastershopWebhookTrigger"
      );
    if (!hasWebhookNodes) continue;

    try {
      const result = await syncWebhookTriggersForFlow(flow.id, nodes, flow.companyId ?? 0);
      flowsProcessed++;
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalDeleted += result.deleted;
      if (result.created > 0 || result.updated > 0 || result.deleted > 0) {
        logger.info("MigrateExistingWebhookTriggers", "Flow synced", {
          flowId: flow.id,
          flowName: flow.name,
          ...result
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("MigrateExistingWebhookTriggers", "Flow sync failed", {
        flowId: flow.id,
        flowName: flow.name,
        error: message
      });
    }
  }

  logger.info("MigrateExistingWebhookTriggers", "Backfill completed", {
    flowsProcessed,
    totalCreated,
    totalUpdated,
    totalDeleted,
    totalFlows: allFlows.length
  });
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
