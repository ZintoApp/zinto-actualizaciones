import type { QueryClient } from '@tanstack/react-query';
import type { ContactCreationMeta, ContactCreationWarningCode } from '@shared/whatsapp-contact-identity';

export type ContactAddResult<T> = { contact: T; created: boolean; creationMeta?: ContactCreationMeta };
type Translate = (key: string, fallback: string, params?: Record<string, unknown>) => string;

export async function readContactAddResult<T extends { id: number }>(response: Response): Promise<ContactAddResult<T>> {
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || 'Failed to add contact');
  const contact = (json.contact ?? json) as T;
  if (!contact?.id) throw new Error('Failed to add contact');
  return { contact, created: response.status === 201, creationMeta: json.creationMeta };
}

function warningMessage(
  code: ContactCreationWarningCode,
  t: Translate,
): string {
  if (code === 'WHATSAPP_OFFICIAL_INBOUND_REQUIRED') {
    return t(
      'contacts.creation.warning.official_inbound_required',
      'Saved successfully. WhatsApp Official cannot start a conversation by username until this contact messages you first.',
    );
  }
  return t(
    'contacts.creation.warning.username_unverified',
    'Saved successfully, but the WhatsApp username could not be verified. Verify it before sending a message.',
  );
}

export function contactCreationWarningDescription(
  meta: ContactCreationMeta | undefined,
  t: Translate,
): string | null {
  const warnings = meta?.warnings ?? [];
  return warnings.length > 0 ? warnings.map(code => warningMessage(code, t)).join(' ') : null;
}

export function contactAddFeedback(
  result: ContactAddResult<{ isArchived?: boolean | null }>,
  t: Translate,
) {
  const warning = contactCreationWarningDescription(result.creationMeta, t);
  return {
    title: result.created
      ? t('contacts.add.success_title', 'Contact created')
      : t('contacts.add.existing_title', 'Existing contact added to your contacts'),
    description: warning
      ? warning
      : result.contact.isArchived
      ? t('contacts.add.existing_archived', 'This contact is archived. Use the Archived filter to find it.')
      : result.created
        ? t('contacts.add.success_description', 'The contact has been successfully created.')
        : t('contacts.add.existing_description', 'You now have access to this contact. Its existing details have been preserved.'),
  };
}

export function contactCreationErrorMessage(
  error: Error & { errorCode?: string },
  t: Translate,
): string {
  switch (error.errorCode) {
    case 'WHATSAPP_IDENTITY_REQUIRED':
      return t('contacts.creation.error.identity_required', 'Enter a phone number or WhatsApp username.');
    case 'WHATSAPP_USERNAME_KEY_REQUIRED':
      return t('contacts.creation.error.username_key_required', 'This WhatsApp username requires its username key.');
    case 'WHATSAPP_USERNAME_NOT_REGISTERED':
      return t('contacts.creation.error.username_not_registered', 'This username is not registered on WhatsApp.');
    case 'WHATSAPP_USERNAME_UNRESOLVED':
      return t('contacts.creation.error.username_unresolved', 'This WhatsApp username could not be verified. Check the username and key, then try again.');
    case 'WHATSAPP_USERNAME_KEY_INVALID':
      return t('contacts.creation.error.username_key_invalid', 'Enter a valid WhatsApp username key.');
    case 'WHATSAPP_USERNAME_INVALID':
      return t('contacts.creation.error.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores.');
    case 'CONTACT_IDENTITIES_CONFLICT':
      return t('contacts.creation.error.identities_conflict', 'The phone number and WhatsApp username belong to different contacts.');
    default:
      return error.message;
  }
}

export function localizeWhatsAppContactImportError(error: string, t: Translate): string {
  const rowError = /^Row (\d+): (.+)$/.exec(error);
  if (!rowError) return error;
  const [, row, message] = rowError;
  if (message === 'Invalid WhatsApp username') {
    return t(
      'contacts.import.row_invalid_username',
      'Row {{row}}: Invalid WhatsApp username',
      { row },
    );
  }
  if (
    message === 'Phone number or WhatsApp username is required' ||
    message === 'Phone number or WhatsApp username is required for WhatsApp contacts.'
  ) {
    return t(
      'contacts.import.row_identity_required',
      'Row {{row}}: Phone number or WhatsApp username is required',
      { row },
    );
  }
  return error;
}

export function refreshContactQueries(queryClient: QueryClient) {
  for (const key of ['/api/contacts', '/api/contacts/tags', '/api/contacts/pins', '/api/contacts/archived-count', '/api/contacts/without-conversations', '/api/conversations', '/api/deals', '/api/erp/dental/patients']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
