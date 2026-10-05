import type { RequestHandler } from 'express';
import { resolveContactViewScope } from '../shared/contact-access';
import type { ContactAccessOptions } from './contact-access';

export type ContactFileOwner = { contactId: number; companyId: number; clinical: boolean };

/** Contact documents must not become public merely because their URL is known. */
export function createContactFileAccessGuard(deps: {
  owner: (publicPath: string) => Promise<ContactFileOwner | null | 'non-contact'>;
  getPermissions: (user: any) => Promise<Record<string, boolean>>;
  accessibleIds: (ids: number[], options: ContactAccessOptions) => Promise<number[]>;
  dentalPatient: (companyId: number, contactId: number) => Promise<boolean>;
}): RequestHandler {
  return async (req, res, next) => {
    try {
      const owner = await deps.owner(`${req.baseUrl}${req.path}`);
      // Deal files keep their separate existing policy.
      if (owner === 'non-contact') return next();
      const user = req.user as any;
      if (!owner || !req.isAuthenticated?.() || !user || (!user.isSuperAdmin && owner.companyId !== user.companyId)) {
        res.status(404).end();
        return;
      }
      // Prevent a shared cache from serving an authorized response to another user.
      res.setHeader('Cache-Control', 'private, no-store');
      if (user.isSuperAdmin) return next();
      const permissions = await deps.getPermissions(user);
      if (owner.clinical && permissions.view_dental_imaging !== true) {
        res.status(404).end();
        return;
      }
      const scope = resolveContactViewScope(permissions);
      const scoped = scope && (await deps.accessibleIds([owner.contactId], {
        companyId: owner.companyId, userId: user.id, contactScope: scope,
      })).length === 1;
      const dental = (permissions.view_dental_patients === true || permissions.manage_dental_patients === true) &&
        await deps.dentalPatient(owner.companyId, owner.contactId);
      if (!scoped && !dental) {
        res.status(404).end();
        return;
      }
      next();
    } catch (error) {
      console.error('Failed to authorize contact file:', error);
      res.status(500).end();
    }
  };
}
