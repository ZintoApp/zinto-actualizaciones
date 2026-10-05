import { and, eq, sql } from 'drizzle-orm';
import type { db } from '../db';
import { conversations, messages, type InsertMessage } from '../../shared/schema';
import { instagramMessageMetadata } from '../../shared/instagram-message-utils';
import { attachInstagramReferral, lockInstagramReferralScope } from './instagram-referral-store';
import { withContactInitialMessageMetadata } from './channels/contact-initial-message-metadata';

export type InstagramMessageResult = NonNullable<Awaited<ReturnType<typeof persistInstagramMessage>>>;

export async function persistInstagramMessage(database: typeof db, message: InsertMessage) {
  const externalId = message.externalId;
  if (!externalId) return null;
  const [conversation] = await database.select()
    .from(conversations).where(eq(conversations.id, message.conversationId)).limit(1);
  if (conversation?.channelType !== 'instagram') return null;

  return database.transaction(async tx => {
    const incoming = instagramMessageMetadata(message.metadata);
    const scope = message.direction === 'inbound' && conversation.companyId && incoming.senderId
      ? { companyId: conversation.companyId, connectionId: conversation.channelId, senderId: String(incoming.senderId) } : null;
    if (scope) await lockInstagramReferralScope(tx, scope);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`instagram-message:${message.conversationId}:${externalId}`}))`);
    const existing = await tx.select().from(messages)
      .where(and(eq(messages.conversationId, message.conversationId), eq(messages.externalId, externalId)))
      .orderBy(messages.id);
    if (existing.length) {
      let saved = existing.find(row => row.isFromBot || (row.senderType === 'user' && row.senderId != null)) || existing[0];
      const authoritative = message.isFromBot === true || (message.senderType === 'user' && message.senderId != null);
      const hasAttribution = saved.isFromBot === true || (saved.senderType === 'user' && saved.senderId != null);
      if (!incoming.instagramEcho && authoritative && !hasAttribution) {
        const [updated] = await tx.update(messages).set({ ...message,
          metadata: { ...instagramMessageMetadata(saved.metadata), ...incoming, instagramEcho: false },
        }).where(eq(messages.id, saved.id)).returning();
        return { message: updated, created: false, attributionUpdated: true, metadataUpdated: false };
      }
      const old = instagramMessageMetadata(saved.metadata);
      let metadataUpdated = false;
      if (scope && incoming.metaReferral && (!old.metaReferral || old.instagramReferralFingerprint)) {
        const { instagramReferralFingerprint: _, ...metadata } = old;
        [saved] = await tx.update(messages).set({ metadata: { ...metadata, metaReferral: incoming.metaReferral } })
          .where(eq(messages.id, saved.id)).returning();
        metadataUpdated = true;
      }
      if (scope) {
        const enriched = await attachInstagramReferral(tx, scope, saved);
        metadataUpdated ||= enriched !== saved;
        saved = enriched;
      }
      return { message: saved, created: false, attributionUpdated: false, metadataUpdated };
    }
    let [created] = await tx.insert(messages).values(message).returning();
    if (scope) created = await attachInstagramReferral(tx, scope, created);
    if (scope && instagramMessageMetadata(created.metadata).metaReferral && !message.isHistorySync) {
      const priorInbound = await tx.select({ id: messages.id }).from(messages).where(and(
        eq(messages.conversationId, message.conversationId), eq(messages.direction, 'inbound'),
        sql`${messages.id} <> ${created.id}`, sql`COALESCE(${messages.isHistorySync}, false) = false`,
        sql`${messages.historySyncBatchId} IS NULL`)).limit(1);
      if (!priorInbound.length) {
        const metadata = withContactInitialMessageMetadata({ existingMetadata: created.metadata, channelType: 'instagram',
          conversationStatus: conversation.status, isInboundContactMessage: true, contactWasCreatedByInboundWebhook: true });
        [created] = await tx.update(messages).set({ metadata }).where(eq(messages.id, created.id)).returning();
      }
    }
    // Message and inbox counters commit together; duplicate delivery cannot increment again.
    await tx.update(conversations).set({ lastMessageAt: sql`GREATEST(${conversations.lastMessageAt}, ${(created.sentAt ?? created.createdAt ?? new Date()).toISOString()}::timestamp)`,
      updatedAt: new Date(), unreadCount: message.direction === 'inbound'
        ? sql`COALESCE(${conversations.unreadCount}, 0) + 1` : conversations.unreadCount,
    }).where(eq(conversations.id, message.conversationId));
    return { message: created, created: true, attributionUpdated: false, metadataUpdated: false };
  });
}
