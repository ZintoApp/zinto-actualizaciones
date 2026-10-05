export const CONTACT_DELETION_SETTING_KEY = 'allowForceContactDeletion';
export const DELETE_ALL_CONTACTS_CONFIRMATION = 'DELETE ALL';

export interface ContactDeletionActor {
  role?: string | null;
  isSuperAdmin?: boolean | null;
}

export function isCompanyAdminForContactDeletion(actor: ContactDeletionActor | null | undefined): boolean {
  return Boolean(actor?.isSuperAdmin || actor?.role === 'admin');
}

export function canForceDeleteContacts(
  actor: ContactDeletionActor | null | undefined,
  settingEnabled: boolean,
): boolean {
  return settingEnabled && isCompanyAdminForContactDeletion(actor);
}

export function isDeleteAllContactsConfirmation(value: unknown): boolean {
  return value === DELETE_ALL_CONTACTS_CONFIRMATION;
}
