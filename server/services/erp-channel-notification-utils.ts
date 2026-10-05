import { storage } from '../storage';
import type { Contact } from '@shared/schema';
import { isChannelAvailable } from '@shared/channel-utils';

/** Channel types that support text/status updates via channelManager.sendDirectMessage. */
export const ORDER_NOTIFICATION_DM_CHANNEL_TYPES = new Set([
  'whatsapp_official',
  'whatsapp_unofficial',
  'whatsapp',
  'telegram',
  'twilio_sms',
  'messenger',
  'instagram',
  'tiktok',
  'webchat',
  'email',
]);

export function isChannelConnectionUsableForNotification(conn: {
  status: string | null;
  channelType: string;
}): boolean {
  const ready = isChannelAvailable(conn);
  return ready && ORDER_NOTIFICATION_DM_CHANNEL_TYPES.has(conn.channelType);
}

export function resolveContactPhone(contact: Contact): string {
  const phone = contact.phone?.trim();
  if (phone) return phone;
  const ident = contact.identifier?.trim();
  if (ident && contact.identifierType !== 'email') return ident;
  return '';
}

/**
 * Recipient address/ID passed to sendDirectMessage: channel-appropriate (not phone-only).
 */
export function resolveOrderNotificationRecipient(contact: Contact, channelType: string): string | null {
  const ident = contact.identifier?.trim() || '';
  const email =
    contact.email?.trim() ||
    (contact.identifierType === 'email' ? ident : '') ||
    '';

  switch (channelType) {
    case 'email':
      return email || null;
    case 'messenger':
    case 'instagram':
    case 'tiktok':
    case 'webchat':
      if (ident) return ident;
      console.warn(
        '[erp-channel-notification-utils] Skipping notification: contact missing channel identifier for',
        channelType
      );
      return null;
    case 'telegram':
      if (contact.identifierType === 'telegram' && ident) return ident;
      if (ident) return ident;
      return resolveContactPhone(contact) || null;
    case 'whatsapp_official':
    case 'whatsapp_unofficial':
    case 'whatsapp':
    case 'twilio_sms': {
      const phoneish = resolveContactPhone(contact);
      if (phoneish) return phoneish;
      if (contact.identifierType === 'whatsapp' && ident) return ident;
      return ident || null;
    }
    default:
      console.warn(
        '[erp-channel-notification-utils] Notification skipped: unsupported channel type for direct messages:',
        channelType
      );
      return null;
  }
}

export function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export async function resolveNotificationConnection(params: {
  companyId: number;
  contactId: number;
  preferredConnectionId: number | null;
}): Promise<{ channelType: string; id: number } | null> {
  if (params.preferredConnectionId != null) {
    const conn = await storage.getChannelConnection(params.preferredConnectionId);
    if (conn && conn.companyId === params.companyId) {
      if (!ORDER_NOTIFICATION_DM_CHANNEL_TYPES.has(conn.channelType)) {
        console.warn(
          '[erp-channel-notification-utils] Notification skipped: originating channel does not support text status messages:',
          conn.channelType
        );
      } else if (!isChannelConnectionUsableForNotification(conn)) {
        console.warn(
          '[erp-channel-notification-utils] Preferred channel connection is not active/connected; falling back to contact conversations.',
          conn.id
        );
      } else {
        return { channelType: conn.channelType, id: conn.id };
      }
    }
  }
  const conversations = await storage.getConversationsByContact(params.contactId);
  for (const conv of conversations) {
    if (conv.companyId != null && conv.companyId !== params.companyId) continue;
    const cid = conv.channelId;
    if (cid == null) continue;
    const conn = await storage.getChannelConnection(cid);
    if (conn && conn.companyId === params.companyId && isChannelConnectionUsableForNotification(conn)) {
      return { channelType: conn.channelType, id: conn.id };
    }
  }
  return null;
}
