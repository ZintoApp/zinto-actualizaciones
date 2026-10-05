export type ContactViewScope = 'own' | 'assigned' | 'own_assigned' | 'company';

/** View permissions are additive. Legacy action permissions never expand visibility. */
export function resolveContactViewScope(
  permissions: Record<string, boolean>,
  isSuperAdmin = false,
): ContactViewScope | null {
  if (isSuperAdmin || permissions.view_company_contacts === true) return 'company';
  const own = permissions.view_own_contacts === true;
  const assigned = permissions.view_assigned_contacts === true;
  if (own && assigned) return 'own_assigned';
  return own ? 'own' : assigned ? 'assigned' : null;
}

export function normalizeContactPhone(phone: string | null | undefined): string | null {
  return typeof phone === 'string' && phone.trim() ? phone.trim() : null;
}
