import { createHmac, timingSafeEqual } from 'crypto';
import { storage } from '../storage';
import { enqueueCoexistenceEvent } from './whatsapp-coexistence-worker';
import { WhatsAppOnboardingError } from './whatsapp-onboarding-graph';
import { processWhatsAppCallingWebhook } from './whatsapp-calling-service';

export function validWhatsAppSignature(raw: Buffer, signature: unknown, secret: string | undefined | null): boolean {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
export async function acceptWhatsAppWebhook(raw: unknown, signature: unknown, partnerOnly = false) {
  if (!Buffer.isBuffer(raw)) throw new WhatsAppOnboardingError('Raw webhook body required.', 400);
  if (typeof signature !== 'string' || !signature) throw new WhatsAppOnboardingError('Webhook signature required.', 403);
  const config = await storage.getPartnerConfiguration('meta');
  const partnerSecret = config?.partnerSecret || process.env.META_WHATSAPP_APP_SECRET;
  const partnerValid = validWhatsAppSignature(raw, signature, partnerSecret);
  if (partnerOnly && !partnerValid) throw new WhatsAppOnboardingError('Invalid webhook signature.', 403);
  let payload: any;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new WhatsAppOnboardingError('Invalid JSON.', 400); }
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) throw new WhatsAppOnboardingError('Invalid WhatsApp webhook.', 400);
  const connections = await storage.getChannelConnectionsByType('whatsapp_official');
  const tasks: Array<{ connection: typeof connections[number]; entry: any; change: any }> = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const phone = change.value?.metadata?.phone_number_id;
      const matches = connections.filter(c => {
        const data = c.connectionData as any;
        const accountMatches = String(data?.wabaId || data?.businessAccountId) === String(entry.id);
        // Older manual integrations may not store the WABA; their signed phone ID is sufficient.
        return phone ? String(data?.phoneNumberId) === String(phone) && (accountMatches || !data?.wabaId && !data?.businessAccountId) : accountMatches;
      });
      if (!matches.length && !partnerValid && !validWhatsAppSignature(raw, signature, process.env.FACEBOOK_APP_SECRET)) throw new WhatsAppOnboardingError('Invalid webhook signature.', 403);
      for (const connection of matches) {
        const data = connection.connectionData as any;
        const signedByPartner = partnerValid && data.partnerManaged === true && (!data.appId || data.appId === config?.partnerApiKey);
        if (!signedByPartner && !validWhatsAppSignature(raw, signature, data.appSecret || (!data.partnerManaged ? process.env.FACEBOOK_APP_SECRET : undefined))) {
          throw new WhatsAppOnboardingError('Invalid webhook signature.', 403);
        }
        if (connection.companyId) tasks.push({ connection, entry, change });
      }
    }
  }
  if (!tasks.length && !partnerValid && !validWhatsAppSignature(raw, signature, process.env.FACEBOOK_APP_SECRET)) {
    throw new WhatsAppOnboardingError('Invalid webhook signature.', 403);
  }
  // Validate all entries before processing any of them. No first-entry tenant inference.
  for (const { connection, entry, change } of tasks) {
    const hasCallPermissionReply = change.field === 'messages' && change.value?.messages?.some(
      (message: any) => message?.interactive?.type === 'call_permission_reply' || message?.interactive?.call_permission_reply,
    );
    if (change.field === 'calls' || change.field === 'call_permission' || hasCallPermissionReply) {
      await processWhatsAppCallingWebhook(connection, change);
      if (change.field !== 'messages') continue;
    }
    const special = change.field === 'messages' && change.value?.messages?.some((m: any) => ['edit', 'revoke'].includes(m.type) || m.errors?.some((e: any) => e.code === 131060));
    if (['history', 'smb_app_state_sync', 'smb_message_echoes', 'account_update'].includes(change.field) || special) {
      await enqueueCoexistenceEvent(connection.id, connection.companyId!, { wabaId: String(entry.id), time: entry.time, field: change.field, value: change.value });
      if (change.field !== 'messages') continue;
    }
    if (change.field === 'messages' || change.field === 'user_id_update') {
      const normal = change.field === 'messages' ? { ...change, value: { ...change.value, messages: (change.value?.messages || []).filter((m: any) => !['edit', 'revoke'].includes(m.type) && !m.errors?.some((e: any) => e.code === 131060)) } } : change;
      const { processWebhook } = await import('./channels/whatsapp-official');
      await processWebhook({ object: payload.object, entry: [{ id: entry.id, changes: [normal] }] }, connection.companyId!);
    }
  }
}
