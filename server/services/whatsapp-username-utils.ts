/**
 * Pure helpers for WhatsApp username handling (no I/O, no socket access).
 * Kept separate from whatsapp-username-resolver.ts so channel services can
 * import these without creating circular imports.
 */

import { jidDecode, jidNormalizedUser } from 'baileys';

export type HistoryLidPnMapping = { lid: string; pn: string };

export type ContactInputType = 'phone' | 'username' | 'lid' | 'bsuid';

export interface ParsedContactInput {
  type: ContactInputType;
  /** Normalized value: digits for phone, bare lowercase handle for username, bare numeric id for lid, full BSUID */
  value: string;
  /** Original raw input as provided */
  raw: string;
}

/**
 * WhatsApp username rules: 3-35 chars, lowercase letters / digits / periods /
 * underscores, must contain at least one letter, cannot start or end with a
 * period or contain two consecutive periods. (Uppercase input is normalized.)
 */
const USERNAME_REGEX = /^(?=.*[a-z])[a-z0-9_.]{3,35}$/;
const BSUID_REGEX = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/;

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

export function validateUsername(input: string): boolean {
  const username = normalizeUsername(input);
  if (!USERNAME_REGEX.test(username)) return false;
  if (username.startsWith('.') || username.endsWith('.')) return false;
  if (username.includes('..')) return false;
  if (username.startsWith('www.')) return false;
  return true;
}

export function isBsuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return BSUID_REGEX.test(value.trim());
}

/** Extract the bare numeric LID from a JID like "123456789:12@lid", or null. */
export function extractLidFromJid(jid: string | null | undefined): string | null {
  if (!jid || !/@lid$/i.test(jid)) return null;
  const bare = jid.replace(/@lid$/i, '').split(':')[0];
  return /^\d{5,20}$/.test(bare) ? bare : null;
}

export function toLidJid(lid: string | null | undefined): string | null {
  if (!lid) return null;
  const bare = lid.trim().replace(/@lid$/i, '').split(':')[0];
  if (!/^\d{5,20}$/.test(bare)) return null;
  return `${bare}@lid`;
}

/** Return phone digits from a PN JID, never from an opaque LID JID. */
export function extractPhoneNumberFromJid(jid: string | null | undefined): string {
  if (!jid) return '';
  const normalizedJid = jid.includes('@')
    ? jidNormalizedUser(jid)
    : `${jid.replace(/[^\d]/g, '')}@s.whatsapp.net`;
  const decoded = jidDecode(normalizedJid);
  if (!decoded || decoded.server === 'lid' || decoded.server === 'hosted.lid') {
    return '';
  }
  return decoded.user.replace(/[^\d]/g, '');
}

export function normalizeLidJidForLookup(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const normalized = jidNormalizedUser(jid);
  const decoded = jidDecode(normalized);
  return decoded && (decoded.server === 'lid' || decoded.server === 'hosted.lid') ? normalized : null;
}

/** Build the reverse LID → PN map supplied by Baileys history payloads and contacts. */
export function buildHistoryLidToPnMap(
  contacts: Array<{ id?: string | null; phoneNumber?: string | null; lid?: string | null }>,
  mappings: HistoryLidPnMapping[]
): Map<string, string> {
  const lidToPn = new Map<string, string>();

  const addMapping = (lidValue: unknown, pnValue: unknown) => {
    if (typeof lidValue !== 'string' || typeof pnValue !== 'string') return;
    const lidJid = normalizeLidJidForLookup(lidValue);
    const phoneNumber = extractPhoneNumberFromJid(pnValue);
    if (lidJid && phoneNumber) {
      lidToPn.set(lidJid, `${phoneNumber}@s.whatsapp.net`);
    }
  };

  for (const mapping of mappings) {
    addMapping(mapping.lid, mapping.pn);
  }
  for (const contact of contacts) {
    addMapping(contact.id, contact.phoneNumber);
    addMapping(contact.lid, contact.phoneNumber || contact.id);
  }

  return lidToPn;
}

/**
 * Classify a recipient input as a phone number, a WhatsApp username, a raw
 * LID, or a BSUID. Returns null when the input matches none of the supported formats.
 */
export function parseContactInput(rawInput: string): ParsedContactInput | null {
  const raw = (rawInput ?? '').trim();
  if (!raw) return null;

  if (isBsuid(raw)) {
    return { type: 'bsuid', value: raw.trim(), raw };
  }

  const lidMatch = raw.match(/^(\d{5,20})@lid$/i);
  if (lidMatch) {
    return { type: 'lid', value: lidMatch[1], raw };
  }

  if (raw.startsWith('@')) {
    const username = normalizeUsername(raw);
    return validateUsername(username) ? { type: 'username', value: username, raw } : null;
  }

  if (/^[+]?[\d\s\-().]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 ? { type: 'phone', value: digits, raw } : null;
  }

  const username = normalizeUsername(raw);
  if (validateUsername(username)) {
    return { type: 'username', value: username, raw };
  }

  return null;
}
