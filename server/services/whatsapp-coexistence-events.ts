import type { ChannelConnection } from '../../shared/schema';
import { storage } from '../storage';
import { getPool } from '../db';
import { broadcastToCompany } from '../utils/websocket';
import { patchWhatsAppConnection } from './whatsapp-connection-state';

export const normalizeCoexistencePhone = (value: unknown) => `+${String(value || '').replace(/\D/g, '')}`;
export function historyOutcome(value: any): 'declined' | undefined {
  return value?.history?.some((item: any) => item.errors?.some((error: any) => error.code === 2593109)) ? 'declined' : undefined;
}
export function lifecyclePatch(event: string, time: number, previousTime = 0) {
  if (time < previousTime) return null;
  if (event === 'ACCOUNT_OFFBOARDED') return { coexistenceStatus: 'offboarded', coexistenceEventAt: time };
  if (event === 'ACCOUNT_RECONNECTED') return { coexistenceStatus: 'connected', coexistenceEventAt: time };
  if (event === 'PARTNER_REMOVED') return { coexistenceStatus: 'disconnected', coexistenceEventAt: time };
  return null;
}

async function contactFor(connection: ChannelConnection, phone: string, name?: string) {
  const existing = await storage.getContactByPhone(phone, connection.companyId!);
  if (existing) return existing;
  return storage.getOrCreateContact({ companyId: connection.companyId!, phone, name: name || phone, identifier: phone,
    identifierType: 'whatsapp', source: 'whatsapp_official', email: null, avatarUrl: null, notes: null });
}
async function saveMirroredMessage(connection: ChannelConnection, message: any, threadId?: string, echo = false) {
  if (!message?.id || !message.timestamp) return;
  const data = connection.connectionData as any;
  const business = normalizeCoexistencePhone(data.phoneNumber);
  const outbound = echo || normalizeCoexistencePhone(message.from) === business;
  const address = normalizeCoexistencePhone(threadId || (outbound ? message.to : message.from));
  if (threadId && /@g\.us$/.test(threadId)) return;
  // Media supplements can omit the recipient; resolve the original scoped message first.
  const priorMessage = await storage.getMessageByExternalId(message.id, connection.companyId!);
  const priorConversation = priorMessage ? await storage.getConversation(priorMessage.conversationId) : undefined;
  let conversation = priorConversation?.channelId === connection.id ? priorConversation : undefined;
  if (!conversation && address === '+') throw new Error('Waiting for the original history message before applying media.');
  const contact = conversation ? undefined : await contactFor(connection, address);
  if (!conversation && contact) conversation = await storage.getConversationByContactAndChannel(contact.id, connection.id);
  if (!conversation) conversation = await storage.createConversation({ companyId: connection.companyId!, contactId: contact!.id, channelId: connection.id,
    channelType: 'whatsapp_official', status: 'open', assignedToUserId: connection.userId, lastMessageAt: null });
  const previous = await storage.getMessageByExternalIdInConversation(message.id, conversation.id);
  const kind = message.type || 'unknown';
  const media = message[kind];
  // Later history webhooks fill in media placeholders without creating duplicate messages.
  if (previous && !(media?.id && previous.type === 'media_placeholder')) return;
  let mediaUrl: string | null = null;
  if (media?.id && ['image', 'video', 'audio', 'document', 'sticker'].includes(kind)) {
    const { downloadAndSaveMedia } = await import('./channels/whatsapp-official');
    mediaUrl = await downloadAndSaveMedia(media.id, data.accessToken, kind);
    if (!mediaUrl) throw new Error('History media download failed; retrying durable job.');
  }
  const metadata = { isHistorySync: !echo, smbMessageEcho: echo, mediaId: media?.id, filename: media?.filename, location: message.location, contacts: message.contacts };
  const content = message.text?.body || media?.caption || media?.filename || (kind === 'media_placeholder' ? 'Media pending synchronization' : `[${kind}]`);
  const timestamp = new Date(Number(message.timestamp) * 1000);
  if (!Number.isFinite(timestamp.getTime())) return;
  const status = String(message.history_context?.status || 'sent').toLowerCase();
  const saved = previous ? await storage.updateMessage(previous.id, { type: kind, content, mediaUrl, metadata: JSON.stringify(metadata) })
    : await storage.createMessage({ conversationId: conversation.id, content, type: kind, direction: outbound ? 'outbound' : 'inbound',
      status: status === 'error' ? 'failed' : status, externalId: message.id, mediaUrl, metadata: JSON.stringify(metadata), isHistorySync: !echo, createdAt: timestamp });
  await getPool().query('UPDATE conversations SET last_message_at = GREATEST(last_message_at, $2) WHERE id = $1', [conversation.id, timestamp]);
  broadcastToCompany(previous
    ? { type: 'messageUpdated', data: { messageId: saved.id, conversationId: saved.conversationId, updates: saved } }
    : { type: 'newMessage', data: saved }, connection.companyId!);
  if ((global as any).broadcastConversationUpdate) {
    const latestConversation = await storage.getConversation(conversation.id);
    await (global as any).broadcastConversationUpdate(latestConversation, 'conversationUpdated');
  }
  // Deliberately do not invoke inbound automation, unread notifications, or service-window updates.
}

export async function processCoexistenceEvent(connection: ChannelConnection, payload: { wabaId: string; time?: number; field: string; value: any }) {
  const { field, value } = payload;
  const data = connection.connectionData as any;
  if (String(data.wabaId || data.businessAccountId) !== String(payload.wabaId)) throw new Error('Webhook account no longer matches connection.');
  if (field === 'account_update') {
    const patch = lifecyclePatch(value.event, Number(payload.time || 0), data.coexistenceEventAt || 0);
    if (!patch) return;
    const status = patch.coexistenceStatus === 'connected' ? (data.onboardingStatus === 'ready' ? 'active' : 'pending') : 'disconnected';
    await patchWhatsAppConnection(connection.id, { ...patch,
      ...(['ACCOUNT_OFFBOARDED', 'ACCOUNT_RECONNECTED'].includes(value.event) ? { signupMode: 'coexistence' } : {}),
      disconnectionInfo: value.disconnection_info || null }, status);
    return;
  }
  if (field === 'smb_app_state_sync') {
    for (const change of value.state_sync || []) {
      if (change.type !== 'contact' || !change.contact?.phone_number) continue;
      const phone = normalizeCoexistencePhone(change.contact.phone_number);
      // Removal from a device address book is not deletion of a CRM contact/conversation.
      if (change.action === 'remove') continue;
      const existing = await storage.getContactByPhone(phone, connection.companyId!);
      const name = change.contact.full_name || change.contact.first_name;
      if (existing) { if (name) await storage.updateContact(existing.id, { name }); }
      else await contactFor(connection, phone, name);
    }
    await patchWhatsAppConnection(connection.id, { contactSyncStatus: 'received', contactSyncLastReceivedAt: new Date().toISOString() });
    return;
  }
  if (field === 'smb_message_echoes') {
    for (const message of value.message_echoes || []) await saveMirroredMessage(connection, message, undefined, true);
    return;
  }
  if (field === 'messages') {
    for (const message of value.messages || []) {
      if (message.errors?.some((e: any) => e.code === 131060)) {
        await patchWhatsAppConnection(connection.id, { coexistenceNotice: 'An unsupported message was received. Check the WhatsApp Business app to view it.' });
        continue;
      }
      const originalId = message.edit?.original_message_id || message.revoke?.original_message_id;
      if (!originalId) continue;
      const original = await storage.getMessageByExternalId(originalId, connection.companyId!);
      if (!original) throw new Error('Original message has not arrived yet.');
      const conversation = await storage.getConversation(original.conversationId);
      if (conversation?.channelId !== connection.id) continue;
      const changed = await storage.updateMessage(original.id, message.revoke ? { content: 'Message deleted', mediaUrl: null }
        : { content: message.edit.message?.text?.body || message.edit.message?.[message.edit.message?.type]?.caption || original.content });
      broadcastToCompany({ type: 'messageUpdated', data: { messageId: changed.id, conversationId: changed.conversationId, updates: changed } }, connection.companyId!);
    }
    return;
  }
  if (field !== 'history' || !data.historySyncEnabled) return;
  if (historyOutcome(value) === 'declined') {
    await getPool().query(`UPDATE channel_connections SET connection_data = connection_data || $2::jsonb
      WHERE id=$1 AND COALESCE(connection_data->>'historySyncStatus','') <> 'completed'`,
    [connection.id, JSON.stringify({ historySyncStatus: 'declined', syncNotice: 'History sharing was declined in WhatsApp. Your messaging connection remains active.' })]);
    broadcastToCompany({ type: 'whatsappHistorySyncProgress', data: { connectionId: connection.id } }, connection.companyId!);
    return;
  }
  for (const chunk of value.history || []) {
    if (chunk.errors?.length) {
      await getPool().query(`UPDATE channel_connections SET connection_data = connection_data || '{"historySyncStatus":"failed"}'::jsonb
        WHERE id=$1 AND COALESCE(connection_data->>'historySyncStatus','') NOT IN ('completed','declined')`, [connection.id]);
      broadcastToCompany({ type: 'whatsappHistorySyncProgress', data: { connectionId: connection.id } }, connection.companyId!);
      continue;
    }
    for (const thread of chunk.threads || []) for (const message of thread.messages || []) await saveMirroredMessage(connection, message, thread.id);
    const progress = Math.min(100, Math.max(0, Number(chunk.metadata?.progress) || 0));
    await getPool().query(`UPDATE channel_connections SET connection_data = connection_data || jsonb_build_object(
      'historySyncProgress', GREATEST(COALESCE((connection_data->>'historySyncProgress')::int, 0), $2::int),
      'historySyncStatus', CASE WHEN connection_data->>'historySyncStatus' IN ('completed','declined') THEN connection_data->>'historySyncStatus'
        WHEN $2 = 100 THEN 'completed' ELSE 'syncing' END)
      WHERE id=$1`, [connection.id, progress]);
    const latest = (await storage.getChannelConnection(connection.id))!.connectionData as any;
    broadcastToCompany({ type: 'whatsappHistorySyncProgress', data: { connectionId: connection.id, progress: latest.historySyncProgress, status: latest.historySyncStatus } }, connection.companyId!);
    if (progress === 100) broadcastToCompany({ type: 'whatsappHistorySyncComplete', data: { connectionId: connection.id } }, connection.companyId!);
  }
  for (const message of value.messages || []) await saveMirroredMessage(connection, message);
}
