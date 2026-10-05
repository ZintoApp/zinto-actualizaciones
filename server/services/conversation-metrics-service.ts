/**
 * Conversation Metrics Service
 * Owns all DB writes to conversation_metrics; called from routes and storage (fire-and-forget).
 */

import { storage } from '../storage';
import type { ConversationMetric, InsertConversationMetric } from '@shared/schema';
import { sql } from 'drizzle-orm';

export class ConversationMetricsService {
  /**
   * Create a metric row for a new conversation. No-ops on duplicate (unique on conversation_id).
   */
  async initMetric(
    conversationId: number,
    companyId: number,
    channelType: string,
    contactedAt: Date
  ): Promise<ConversationMetric | void> {
    try {
      return await storage.createConversationMetric({
        conversationId,
        companyId,
        channelType,
        contactedAt,
        totalMessages: 0,
        agentMessages: 0
      });
    } catch (e: any) {
      if (e?.code === '23505') return; // unique_violation
      throw e;
    }
  }

  /**
   * Record agent assignment. Only updates if a metric row exists.
   */
  async recordAssignment(
    conversationId: number,
    userId: number,
    assignedAt: Date
  ): Promise<ConversationMetric | void> {
    const metric = await storage.getConversationMetric(conversationId);
    if (!metric) return;
    return storage.updateConversationMetric(conversationId, {
      assignedToUserId: userId,
      assignedAt
    });
  }

  /**
   * Record first outbound agent response (idempotent: only sets if firstResponseAt is null).
   * Atomic: update uses WHERE first_response_at IS NULL so concurrent calls cannot overwrite.
   */
  async recordFirstResponse(conversationId: number, respondedAt: Date): Promise<ConversationMetric | void> {
    return storage.updateConversationMetricFirstResponseIfNull(conversationId, respondedAt);
  }

  /**
   * Record conversation resolution (closed/resolved).
   */
  async recordResolution(conversationId: number, resolvedAt: Date): Promise<ConversationMetric | void> {
    const metric = await storage.getConversationMetric(conversationId);
    if (!metric) return;
    const resolutionTimeSec = Math.round(
      (resolvedAt.getTime() - new Date(metric.contactedAt).getTime()) / 1000
    );
    return storage.updateConversationMetric(conversationId, {
      resolvedAt,
      resolutionTimeSec
    });
  }

  /**
   * Atomically increment total_messages and optionally agent_messages.
   */
  async incrementMessageCounts(conversationId: number, isAgentMessage: boolean): Promise<ConversationMetric | void> {
    const updates: Record<string, unknown> = {
      totalMessages: sql`total_messages + 1`
    };
    if (isAgentMessage) {
      updates.agentMessages = sql`agent_messages + 1`;
    }
    return storage.updateConversationMetric(conversationId, updates);
  }
}

export default new ConversationMetricsService();
