import { createHash } from 'node:crypto';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { db } from '../db';
import { channelConnections, contacts, conversations, instagramReferralEvents, messages, type Message } from '../../shared/schema';
import { instagramMessageMetadata } from '../../shared/instagram-message-utils';
import type { InstagramReferralEvent, InstagramReferralScope } from './channels/instagram-webhook-events';
import type { NormalizedMetaReferral } from './channels/meta-referral-normalization';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const INSTAGRAM_REFERRAL_WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const scopeWhere = (scope: InstagramReferralScope) => and(
  eq(instagramReferralEvents.companyId, scope.companyId), eq(instagramReferralEvents.connectionId, scope.connectionId),
  eq(instagramReferralEvents.senderId, scope.senderId));

export async function lockInstagramReferralScope(tx: Transaction, scope: InstagramReferralScope) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`instagram-referral:${scope.companyId}:${scope.connectionId}:${scope.senderId}`}))`);
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function tagContact(tx: Transaction, message: Message, referral: NormalizedMetaReferral) {
  if (referral.entryType !== 'ad') return;
  const [conversation] = await tx.select().from(conversations).where(eq(conversations.id, message.conversationId));
  if (conversation?.contactId && conversation.companyId) {
    await tx.update(contacts).set({ tags: sql`CASE WHEN 'instagram' = ANY(COALESCE(${contacts.tags}, ARRAY[]::text[]))
      THEN ${contacts.tags} ELSE array_append(COALESCE(${contacts.tags}, ARRAY[]::text[]), 'instagram') END` })
      .where(and(eq(contacts.id, conversation.contactId), eq(contacts.companyId, conversation.companyId)));
  }
}

/** Caller holds the scope lock. Explicit attribution always wins; retries cannot consume twice. */
export async function attachInstagramReferral(tx: Transaction, scope: InstagramReferralScope, message: Message): Promise<Message> {
  const eventAt = message.sentAt ?? message.createdAt ?? new Date();
  const pending = await tx.select().from(instagramReferralEvents).where(and(scopeWhere(scope),
    isNull(instagramReferralEvents.consumedMessageId), lte(instagramReferralEvents.eventAt, eventAt),
    gte(instagramReferralEvents.eventAt, new Date(eventAt.getTime() - INSTAGRAM_REFERRAL_WINDOW_MS)))).orderBy(asc(instagramReferralEvents.eventAt));
  let metadata = instagramMessageMetadata(message.metadata);
  // Most recent opening applies when several referrals precede the first message.
  const selected = pending.at(-1);
  let canReplace = !metadata.metaReferral;
  if (selected && metadata.instagramReferralFingerprint) {
    const [previous] = await tx.select().from(instagramReferralEvents)
      .where(eq(instagramReferralEvents.fingerprint, metadata.instagramReferralFingerprint));
    canReplace = !!previous && selected.eventAt > previous.eventAt;
  }
  if (canReplace && selected) {
    metadata = { ...metadata, metaReferral: selected.referral, instagramReferralFingerprint: selected.fingerprint };
    [message] = await tx.update(messages).set({ metadata }).where(eq(messages.id, message.id)).returning();
  }
  for (const event of pending) {
    await tx.update(instagramReferralEvents).set({ consumedMessageId: message.id })
      .where(eq(instagramReferralEvents.fingerprint, event.fingerprint));
  }
  if (metadata.metaReferral) await tagContact(tx, message, metadata.metaReferral);
  return message;
}

export async function persistInstagramReferral(database: typeof db, event: InstagramReferralEvent): Promise<Message | undefined> {
  const now = Date.now();
  if (!Number.isFinite(event.eventAt.getTime()) || event.eventAt.getTime() < now - RETENTION_MS || event.eventAt.getTime() > now + 300000) return;
  return database.transaction(async tx => {
    const [connection] = await tx.select({ id: channelConnections.id }).from(channelConnections).where(and(
      eq(channelConnections.id, event.connectionId), eq(channelConnections.companyId, event.companyId), eq(channelConnections.channelType, 'instagram')));
    if (!connection) throw new Error('Instagram referral connection does not match company');
    await lockInstagramReferralScope(tx, event);
    const fingerprint = createHash('sha256').update(canonical({ companyId: event.companyId, connectionId: event.connectionId,
      senderId: event.senderId, timestamp: event.eventAt.getTime(), referral: event.referral })).digest('hex');
    // Clean only this customer's old records; never scan/delete another tenant's events.
    await tx.delete(instagramReferralEvents).where(and(scopeWhere(event),
      sql`${instagramReferralEvents.createdAt} < ${new Date(now - RETENTION_MS)}`));
    await tx.insert(instagramReferralEvents).values({ fingerprint, companyId: event.companyId, connectionId: event.connectionId,
      senderId: event.senderId, eventAt: event.eventAt, referral: event.referral }).onConflictDoNothing();
    const [stored] = await tx.select().from(instagramReferralEvents).where(eq(instagramReferralEvents.fingerprint, fingerprint));
    if (stored.consumedMessageId != null) return;
    const candidates = await tx.select({ message: messages }).from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId)).where(and(
        eq(conversations.companyId, event.companyId), eq(conversations.channelId, event.connectionId),
        eq(conversations.channelType, 'instagram'), eq(messages.direction, 'inbound'),
        sql`${messages.metadata}->>'senderId' = ${event.senderId}`,
        // Message timestamps are stored without a timezone, in UTC. Do not let pg
        // serialize a JS Date using the server's local offset for these comparisons.
        sql`COALESCE(${messages.sentAt}, ${messages.createdAt}) >= ${event.eventAt.toISOString()}::timestamp`,
        sql`COALESCE(${messages.sentAt}, ${messages.createdAt}) <= ${new Date(event.eventAt.getTime() + INSTAGRAM_REFERRAL_WINDOW_MS).toISOString()}::timestamp`))
      .orderBy(sql`COALESCE(${messages.sentAt}, ${messages.createdAt})`, asc(messages.id)).limit(1);
    if (!candidates.length) return;
    const original = candidates[0].message;
    const updated = await attachInstagramReferral(tx, event, original);
    return updated !== original ? updated : undefined;
  });
}
