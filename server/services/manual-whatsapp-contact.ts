import type { InsertContact } from '@shared/schema';
import {
  emptyContactCreationMeta,
  isWhatsAppContactIdentifierType,
  type ContactCreationMeta,
} from '@shared/whatsapp-contact-identity';

type UsernameResolution = {
  exists: boolean;
  lid?: string | null;
  keyRequired?: boolean;
  usernameTaken?: boolean;
};

export class WhatsAppUsernameCreationError extends Error {
  readonly status = 400;

  constructor(
    readonly code:
      | 'WHATSAPP_USERNAME_KEY_REQUIRED'
      | 'WHATSAPP_USERNAME_NOT_REGISTERED'
      | 'WHATSAPP_USERNAME_UNRESOLVED',
    message: string,
  ) {
    super(message);
    this.name = 'WhatsAppUsernameCreationError';
  }
}

export async function prepareInteractiveWhatsAppContact(
  contact: InsertContact,
  options: {
    usernameKey?: string;
    resolvers: Array<(username: string, key?: string) => Promise<UsernameResolution>>;
  },
): Promise<{ contact: InsertContact; meta: ContactCreationMeta }> {
  const meta = emptyContactCreationMeta();
  const username = contact.whatsappUsername?.trim();
  const hasPhone = Boolean(contact.phone?.trim());

  if (!username || !isWhatsAppContactIdentifierType(contact.identifierType)) {
    return { contact, meta };
  }

  if (contact.identifierType === 'whatsapp_official' && !hasPhone) {
    meta.warnings.push('WHATSAPP_OFFICIAL_INBOUND_REQUIRED');
  }

  if (options.resolvers.length === 0) {
    meta.usernameVerification = 'unverified';
    meta.warnings.push('WHATSAPP_USERNAME_UNVERIFIED');
    return { contact, meta };
  }

  const unresolved: UsernameResolution[] = [];
  for (const resolve of options.resolvers) {
    try {
      const result = await resolve(username, options.usernameKey);
      if (result.exists) {
        meta.usernameVerification = 'verified';
        return {
          contact: result.lid ? { ...contact, whatsappLid: result.lid } : contact,
          meta,
        };
      }
      unresolved.push(result);
    } catch {
      unresolved.push({ exists: false });
    }
  }

  if (hasPhone) {
    meta.usernameVerification = 'unverified';
    meta.warnings.push('WHATSAPP_USERNAME_UNVERIFIED');
    return { contact, meta };
  }

  if (unresolved.some(result => result.keyRequired)) {
    throw new WhatsAppUsernameCreationError(
      'WHATSAPP_USERNAME_KEY_REQUIRED',
      'This WhatsApp username requires a username key',
    );
  }
  if (unresolved.length > 0 && unresolved.every(result => result.usernameTaken === false)) {
    throw new WhatsAppUsernameCreationError(
      'WHATSAPP_USERNAME_NOT_REGISTERED',
      'This username is not registered on WhatsApp',
    );
  }
  throw new WhatsAppUsernameCreationError(
    'WHATSAPP_USERNAME_UNRESOLVED',
    'This WhatsApp username could not be verified',
  );
}
