export const WHATSAPP_CONTACT_IDENTIFIER_TYPES = new Set([
  'whatsapp',
  'whatsapp_unofficial',
  'whatsapp_official',
]);

export const CONTACT_CREATION_WARNING_CODES = [
  'WHATSAPP_USERNAME_UNVERIFIED',
  'WHATSAPP_OFFICIAL_INBOUND_REQUIRED',
] as const;

export type ContactCreationWarningCode = typeof CONTACT_CREATION_WARNING_CODES[number];
export type WhatsAppUsernameVerificationStatus =
  | 'not_requested'
  | 'existing'
  | 'verified'
  | 'unverified';

export type ContactCreationMeta = {
  usernameVerification: WhatsAppUsernameVerificationStatus;
  warnings: ContactCreationWarningCode[];
};

export function isWhatsAppContactIdentifierType(identifierType: unknown): boolean {
  if (typeof identifierType !== 'string' || !identifierType.trim()) return true;
  return WHATSAPP_CONTACT_IDENTIFIER_TYPES.has(identifierType.trim().toLowerCase());
}

export function hasWhatsAppContactIdentity(input: {
  phone?: unknown;
  whatsappUsername?: unknown;
}): boolean {
  return [input.phone, input.whatsappUsername].some(
    value => typeof value === 'string' && value.trim().length > 0,
  );
}

export function requiresWhatsAppContactIdentity(input: {
  identifierType?: unknown;
  phone?: unknown;
  whatsappUsername?: unknown;
}): boolean {
  return isWhatsAppContactIdentifierType(input.identifierType) && !hasWhatsAppContactIdentity(input);
}

export function emptyContactCreationMeta(): ContactCreationMeta {
  return { usernameVerification: 'not_requested', warnings: [] };
}
