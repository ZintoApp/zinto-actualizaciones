/**
 * Client-side helpers for WhatsApp username input handling.
 * Mirrors the classification/validation logic of
 * server/services/whatsapp-username-utils.ts.
 */

export type RecipientInputType = 'phone' | 'username' | 'lid' | 'bsuid';

export interface ParsedRecipientInput {
  type: RecipientInputType;
  /** Normalized value: digits for phone, bare lowercase handle for username, bare numeric id for lid */
  value: string;
  raw: string;
}

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

export function parseRecipientInput(rawInput: string): ParsedRecipientInput | null {
  const raw = (rawInput ?? '').trim();
  if (!raw) return null;

  if (BSUID_REGEX.test(raw)) {
    return { type: 'bsuid', value: raw, raw };
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

/** Display helper: "@handle" form for UI rendering. */
export function formatUsername(username: string | null | undefined): string | null {
  if (!username) return null;
  return `@${normalizeUsername(username)}`;
}
