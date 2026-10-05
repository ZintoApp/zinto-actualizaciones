import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { conversations, messages, deals, dealActivities } from '../../shared/schema';
import { isHumanContact } from '../../shared/pipeline-follow-up';

// Called only after an interactive provider dispatch has succeeded, never on message insertion.
export async function recordPipelineContact(conversationId: number, userId: number, result: any): Promise<void> {
  try {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conversation?.companyId || !conversation.contactId || conversation.isGroup || conversation.groupJid) return;
    const messageResult = result?.data ?? result;
    const candidateId = messageResult?.id;
    const externalId = result?.messageId ?? messageResult?.externalId;
    const [message] = await db.select().from(messages).where(and(
      eq(messages.conversationId, conversationId),
      Number.isSafeInteger(candidateId) ? eq(messages.id, candidateId) : eq(messages.externalId, String(externalId ?? '')),
    ));
    if (!message || !isHumanContact(message)) return;
    const contactedAt = message.sentAt ?? message.createdAt;
    if (!contactedAt) return;
    const updated = await db.transaction(async tx => {
      const receipt = await tx.execute(sql`INSERT INTO pipeline_contact_receipts (message_id, company_id, contacted_at)
        VALUES (${message.id}, ${conversation.companyId}, ${contactedAt}) ON CONFLICT DO NOTHING RETURNING message_id`);
      if (!receipt.rows.length) return [];
      const rows = await tx.update(deals).set({
        lastContactedAt: contactedAt,
        lastActivityAt: sql`GREATEST(${deals.lastActivityAt}, ${contactedAt})`,
      }).where(and(eq(deals.companyId, conversation.companyId!), eq(deals.contactId, conversation.contactId!),
        eq(deals.status, 'active'), sql`(${deals.lastContactedAt} IS NULL OR ${deals.lastContactedAt} < ${contactedAt})`)).returning();
      if (rows.length) await tx.insert(dealActivities).values(rows.map(deal => ({
        dealId: deal.id, userId, type: 'message_sent', content: '', createdAt: contactedAt,
        metadata: { messageId: message.id, conversationId, channelType: conversation.channelType },
      })));
      return rows;
    });
    if (updated.length) (global as any).broadcastToAllClients?.({
      type: 'pipelineContactUpdated', data: { contactId: conversation.contactId, deals: updated },
    }, conversation.companyId);
  } catch (error) {
    // A CRM persistence error must not cause an already-dispatched message to be resent.
    console.error('[pipeline-contact] Failed to record confirmed contact', { conversationId, error });
  }
}
