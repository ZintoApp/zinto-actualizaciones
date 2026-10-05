export interface WhatsAppContactNameSource {
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
  username?: string | null;
}

export function normalizeWhatsAppSyncSettings(
  historyEnabled: unknown,
  contactsEnabled: unknown,
): { historySyncEnabled: boolean; contactSyncEnabled: boolean } {
  const historySyncEnabled = historyEnabled === true;
  return {
    historySyncEnabled,
    contactSyncEnabled: historySyncEnabled && contactsEnabled === true,
  };
}

const GENERIC_WHATSAPP_NAMES = new Set([
  'whatsapp contact',
  'whatsapp user',
  'unknown contact',
  'unknown',
]);

export function resolveWhatsAppContactName(
  source: WhatsAppContactNameSource,
  phoneNumber?: string | null,
): string {
  const candidates = [source.name, source.notify, source.verifiedName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (candidates.length > 0) return candidates[0];

  const username = source.username?.trim().replace(/^@/, '');
  if (username) return `@${username}`;
  if (phoneNumber) return phoneNumber;
  return 'WhatsApp contact';
}

export function isReplaceableWhatsAppContactName(
  currentName: string | null | undefined,
  currentPhone?: string | null,
  lid?: string | null,
): boolean {
  const normalized = currentName?.trim();
  if (!normalized) return true;
  if (GENERIC_WHATSAPP_NAMES.has(normalized.toLowerCase())) return true;

  const nameDigits = normalized.replace(/\D/g, '');
  const phoneDigits = currentPhone?.replace(/\D/g, '') || '';
  if (nameDigits && phoneDigits && nameDigits === phoneDigits) return true;
  if (lid && (normalized === lid || normalized === `${lid}@lid` || nameDigits === lid)) return true;
  return false;
}

export interface WhatsAppContactMergeSource {
  phone?: string | null;
  lid?: string | null;
  username?: string | null;
  bsuid?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface WhatsAppContactMergeTarget {
  name: string;
  phone?: string | null;
  identifier?: string | null;
  whatsappLid?: string | null;
  whatsappUsername?: string | null;
  whatsappBsuid?: string | null;
  whatsappDisplayName?: string | null;
  avatarUrl?: string | null;
  whatsappAvatarUrl?: string | null;
}

export function buildWhatsAppContactMerge(
  contact: WhatsAppContactMergeTarget,
  source: WhatsAppContactMergeSource,
): { patch: Record<string, string>; changedFields: string[] } {
  const patch: Record<string, string> = {};
  const changedFields: string[] = [];
  const currentLid = contact.whatsappLid?.trim().replace(/@lid$/i, '') || '';
  const currentPhone = contact.phone?.replace(/\D/g, '') || '';
  const sourcePhone = source.phone?.replace(/\D/g, '') || '';

  if (sourcePhone && (!currentPhone || (currentLid && currentPhone === currentLid))) {
    patch.phone = `+${sourcePhone}`;
    changedFields.push('phone');
  }
  if (sourcePhone && (!contact.identifier || contact.identifier === currentLid) && contact.identifier !== sourcePhone) {
    patch.identifier = sourcePhone;
    changedFields.push('identifier');
  }
  if (source.lid && source.lid !== currentLid) {
    patch.whatsappLid = source.lid;
    changedFields.push('whatsappLid');
  }
  if (source.username && source.username !== contact.whatsappUsername) {
    patch.whatsappUsername = source.username;
    changedFields.push('whatsappUsername');
  }
  if (source.bsuid && source.bsuid !== contact.whatsappBsuid) {
    patch.whatsappBsuid = source.bsuid;
    changedFields.push('whatsappBsuid');
  }
  if (source.displayName && source.displayName !== contact.whatsappDisplayName) {
    patch.whatsappDisplayName = source.displayName;
    changedFields.push('whatsappDisplayName');
    if (
      contact.name === contact.whatsappDisplayName ||
      isReplaceableWhatsAppContactName(contact.name, contact.phone, currentLid)
    ) {
      patch.name = source.displayName;
      changedFields.push('name');
    }
  }
  if (source.avatarUrl && source.avatarUrl !== contact.whatsappAvatarUrl) {
    patch.whatsappAvatarUrl = source.avatarUrl;
    changedFields.push('whatsappAvatarUrl');
    const providerManaged = !contact.avatarUrl ||
      contact.avatarUrl === contact.whatsappAvatarUrl ||
      contact.avatarUrl.startsWith('/media/profile_pictures/');
    if (providerManaged) {
      patch.avatarUrl = source.avatarUrl;
      changedFields.push('avatarUrl');
    }
  }

  return { patch, changedFields: Array.from(new Set(changedFields)) };
}
