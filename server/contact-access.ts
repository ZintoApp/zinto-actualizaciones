import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { contacts, conversations, userContactAccess } from '../shared/schema';
import { resolveContactViewScope, type ContactViewScope } from '../shared/contact-access';
import type { RequestHandler } from 'express';

export type ContactAccessOptions = {
  companyId?: number;
  userId?: number;
  contactScope?: ContactViewScope;
};

/** Shared predicate for list queries and individual authorization; no presentation filters. */
export function contactAccessCondition(options: ContactAccessOptions): SQL | undefined {
  const { companyId, userId, contactScope } = options;
  const tenant = companyId ? eq(contacts.companyId, companyId) : undefined;
  // Unscoped calls are internal storage callers; HTTP callers must resolve a scope first.
  if (!contactScope || contactScope === 'company') return tenant;
  if (!companyId || !userId) return sql`false`;
  const allowed: SQL[] = [sql`EXISTS (
    SELECT 1 FROM ${userContactAccess}
    WHERE ${userContactAccess.contactId} = ${contacts.id}
      AND ${userContactAccess.companyId} = ${companyId}
      AND ${userContactAccess.userId} = ${userId}
  )`];
  if (contactScope === 'own' || contactScope === 'own_assigned') {
    allowed.push(eq(contacts.createdBy, userId));
  }
  if (contactScope === 'assigned' || contactScope === 'own_assigned') {
    allowed.push(sql`EXISTS (
      SELECT 1 FROM ${conversations}
      WHERE ${conversations.contactId} = ${contacts.id}
        AND ${conversations.companyId} = ${companyId}
        AND ${conversations.assignedToUserId} = ${userId}
    )`);
  }
  return and(tenant, or(...allowed));
}

const collectionPaths = new Set([
  'archived-count', 'pins', 'csv-template', 'tags', 'scrape-whatsapp', 'scrape-google-maps',
  'export', 'without-conversations', 'delete-all-preview', 'bulk', 'all',
  'import', 'import-for-segment',
]);

/** Runs before contact-specific handlers (including upload middleware). */
export function createContactAccessGuard(deps: {
  getPermissions: (user: any) => Promise<Record<string, boolean>>;
  accessibleIds: (ids: number[], options: ContactAccessOptions) => Promise<number[]>;
  dentalAccess?: (req: Parameters<RequestHandler>[0], id: number, permissions: Record<string, boolean>) => Promise<boolean>;
}): RequestHandler {
  return async (req, res, next) => {
    const segment = req.params.contactId;
    const bulk = segment === 'bulk';
    if (collectionPaths.has(segment) && !bulk && segment !== 'all' && segment !== 'delete-all-preview') return next();
    if (segment === 'all' || segment === 'delete-all-preview') {
      try {
        const user = req.user as any;
        const scope = resolveContactViewScope(await deps.getPermissions(user), user.isSuperAdmin);
        if (scope !== 'company' || !user.companyId) {
          res.status(403).json({ message: 'Company contact visibility is required' });
          return;
        }
        return next();
      } catch (error) { return next(error); }
    }
    const rawIds = bulk ? req.body?.contactIds : [segment];
    if (!Array.isArray(rawIds) || !rawIds.length || rawIds.some(id => !/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
      res.status(400).json({ message: 'Valid contact IDs are required' });
      return;
    }
    const ids = [...new Set(rawIds.map(Number))];
    try {
      const user = req.user as any;
      const permissions = await deps.getPermissions(user);
      const scope = resolveContactViewScope(permissions, user.isSuperAdmin);
      if (!bulk && deps.dentalAccess && user.companyId && await deps.dentalAccess(req, ids[0], permissions)) {
        return next();
      }
      if (!scope || (!user.isSuperAdmin && !user.companyId)) {
        res.status(404).json({ message: 'Contact not found' });
        return;
      }
      const allowed = await deps.accessibleIds(ids, {
        companyId: user.isSuperAdmin ? undefined : user.companyId,
        userId: user.id,
        contactScope: scope,
      });
      if (allowed.length !== ids.length) {
        res.status(404).json({ message: 'Contact not found' });
        return;
      }
      next();
    } catch (error) {
      console.error('Failed to authorize contact access:', error);
      res.status(500).json({ message: 'Failed to authorize contact access' });
    }
  };
}
