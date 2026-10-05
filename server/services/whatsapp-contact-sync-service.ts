import path from 'node:path';
import fsExtra from 'fs-extra';
import type { ChannelConnection, Contact, InsertContact } from '@shared/schema';
import { storage } from '../storage';
import { fetchProfilePicture, getConnection } from './channels/whatsapp';
import { buildWhatsAppContactMerge } from './whatsapp-contact-sync-utils';
import {
  extractLidFromJid,
  extractPhoneNumberFromJid,
  normalizeUsername,
  validateUsername,
} from './whatsapp-username-utils';
import { resolveUsernameViaUSync } from './whatsapp-username-resolver';

export type WhatsAppContactSyncOutcome =
  | { status: 'updated'; changedFields: string[]; contact: Contact }
  | { status: 'unchanged'; changedFields: []; contact: Contact }
  | { status: 'skipped'; changedFields: []; reason: string; contact: Contact };

export class WhatsAppContactSyncTransientError extends Error {}

function normalizedPhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function valueFrom(source: any, names: string[]): string | null {
  for (const name of names) {
    const value = source?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function removeOldManagedAvatar(value: string | null | undefined): Promise<void> {
  if (!value?.startsWith('/media/profile_pictures/')) return;
  const root = path.resolve(process.cwd(), 'media', 'profile_pictures');
  const target = path.resolve(process.cwd(), value.replace(/^\//, ''));
  if (target !== root && target.startsWith(`${root}${path.sep}`)) {
    await fsExtra.remove(target).catch(() => undefined);
  }
}

function isLinkedWhatsAppConnection(connection: ChannelConnection): boolean {
  return ['whatsapp', 'whatsapp_unofficial'].includes(connection.channelType) &&
    (connection.status === 'active' || connection.status === 'connected');
}

export async function syncContactFromWhatsApp(
  contact: Contact,
  connection: ChannelConnection,
): Promise<WhatsAppContactSyncOutcome> {
  if (!contact.companyId || connection.companyId !== contact.companyId) {
    return { status: 'skipped', changedFields: [], reason: 'ownership_mismatch', contact };
  }
  if (!isLinkedWhatsAppConnection(connection)) {
    return {
      status: 'skipped',
      changedFields: [],
      reason: connection.channelType === 'whatsapp_official'
        ? 'official_api_lookup_unavailable'
        : 'unsupported_connection',
      contact,
    };
  }

  const sock = getConnection(connection.id);
  if (!sock) throw new WhatsAppContactSyncTransientError('WhatsApp connection is not active');

  const phone = normalizedPhone(contact.phone || contact.identifier);
  const currentLid = contact.whatsappLid?.trim().replace(/@lid$/i, '') || '';
  const currentUsername = contact.whatsappUsername && validateUsername(contact.whatsappUsername)
    ? normalizeUsername(contact.whatsappUsername)
    : '';

  let jid = currentLid ? `${currentLid}@lid` : '';
  let providerRecord: any = null;

  if (phone) {
    try {
      const records = await sock.onWhatsApp(phone);
      providerRecord = Array.isArray(records) ? records[0] : null;
      if (!providerRecord?.exists || !providerRecord?.jid) {
        return { status: 'skipped', changedFields: [], reason: 'not_registered', contact };
      }
      jid = providerRecord.jid;
    } catch (error) {
      throw new WhatsAppContactSyncTransientError(error instanceof Error ? error.message : 'WhatsApp lookup failed');
    }
  } else if (!jid && currentUsername) {
    try {
      const result = await resolveUsernameViaUSync(sock, currentUsername);
      if (!result.exists || !result.jid) {
        return { status: 'skipped', changedFields: [], reason: 'not_registered', contact };
      }
      jid = result.jid;
      providerRecord = result;
    } catch (error) {
      throw new WhatsAppContactSyncTransientError(error instanceof Error ? error.message : 'WhatsApp username lookup failed');
    }
  }

  if (!jid) return { status: 'skipped', changedFields: [], reason: 'missing_identifier', contact };

  let resolvedLid = extractLidFromJid(jid) || currentLid || '';
  let resolvedPhone = extractPhoneNumberFromJid(jid) || phone;
  try {
    if (jid.endsWith('@lid') && !resolvedPhone) {
      resolvedPhone = extractPhoneNumberFromJid(await sock.signalRepository.lidMapping.getPNForLID(jid) || '');
    } else if (!resolvedLid && jid.endsWith('@s.whatsapp.net')) {
      resolvedLid = extractLidFromJid(await sock.signalRepository.lidMapping.getLIDForPN(jid) || '') || '';
    }
  } catch {
    // LID/phone mapping is opportunistic and may not be available for every contact.
  }

  const rawUsername = valueFrom(providerRecord, ['username']);
  const resolvedUsername = rawUsername && validateUsername(rawUsername) ? normalizeUsername(rawUsername) : '';
  const resolvedBsuid = valueFrom(providerRecord, ['bsuid', 'businessScopedUserId', 'businessScopedUserID']);
  const displayName = valueFrom(providerRecord, ['name', 'notify', 'verifiedName', 'displayName', 'pushName']);

  const profilePictureUrl = await fetchProfilePicture(
    connection.id,
    jid,
    true,
    true,
    `${connection.id}-${contact.id}`,
  );

  const merged = buildWhatsAppContactMerge(contact, {
    phone: resolvedPhone,
    lid: resolvedLid,
    username: resolvedUsername,
    bsuid: resolvedBsuid,
    displayName,
    avatarUrl: profilePictureUrl,
  });
  const patch: Partial<InsertContact> = {
    ...merged.patch,
    lastWhatsAppSyncAt: new Date(),
    lastWhatsAppSyncConnectionId: connection.id,
  };
  const changedFields = merged.changedFields;
  if (changedFields.includes('whatsappUsername')) {
    patch.whatsappUsernameUpdatedAt = new Date();
  }

  const updatedContact = await storage.updateContact(contact.id, patch);
  if (profilePictureUrl && profilePictureUrl !== contact.whatsappAvatarUrl) {
    await removeOldManagedAvatar(contact.whatsappAvatarUrl);
    if (contact.avatarUrl !== contact.whatsappAvatarUrl) await removeOldManagedAvatar(contact.avatarUrl);
  }

  return changedFields.length
    ? { status: 'updated', changedFields: Array.from(new Set(changedFields)), contact: updatedContact }
    : { status: 'unchanged', changedFields: [], contact: updatedContact };
}
