type InstagramContact = { customFields?: unknown; identifierType?: string | null; source?: string | null; identifier?: unknown; phone?: unknown };

export function isInstagramContact(contact?: InstagramContact | null, channelType?: string | null): boolean {
  return channelType === 'instagram' || contact?.identifierType === 'instagram' || contact?.source === 'instagram';
}

export function getInstagramUsername(contact?: InstagramContact | null): string | null {
  let fields = contact?.customFields;
  if (typeof fields === 'string') {
    try { fields = JSON.parse(fields); } catch { return null; }
  }
  const username = fields && typeof fields === 'object' ? (fields as Record<string, unknown>).instagramUsername : null;
  if (typeof username !== 'string') return null;
  return username.trim().replace(/^@+/, '') || null;
}

export function getInstagramHandle(contact?: InstagramContact | null): string | null {
  const username = getInstagramUsername(contact);
  return username ? `@${username}` : null;
}

export function normalizeInstagramRecipientId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().replace(/^\+/, '');
  return /^[0-9]+$/.test(id) ? id : null;
}

export function getInstagramRecipientId(contact?: InstagramContact | null): string | null {
  let fields = contact?.customFields;
  if (typeof fields === 'string') {
    try { fields = JSON.parse(fields); } catch { fields = null; }
  }
  const storedId = fields && typeof fields === 'object' ? (fields as Record<string, unknown>).instagramIgsid : null;
  return normalizeInstagramRecipientId(contact?.identifier)
    || normalizeInstagramRecipientId(storedId)
    || normalizeInstagramRecipientId(contact?.phone);
}
