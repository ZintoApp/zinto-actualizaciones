import type { Express, Request, RequestHandler } from 'express';
import type { User, Company } from '../../shared/schema';

type GetUser = (id: number) => Promise<User | undefined>;

// Browser flags are never an authority for authoring or restoring an account.
export async function resolveOriginalAdmin(req: Request, getUser: GetUser) {
  if (!req.isAuthenticated()) return undefined;
  const id = req.user?.isSuperAdmin ? req.user.id : (req.session as any)?.impersonation?.originalUserId;
  if (!Number.isSafeInteger(id)) return undefined;
  const admin = await getUser(id);
  return admin?.isSuperAdmin ? admin : undefined;
}

async function switchAccount(req: Request, user: User, impersonation?: Record<string, unknown>) {
  try {
    await new Promise<void>((resolve, reject) => req.logout(error => error ? reject(error) : resolve()));
    await new Promise<void>((resolve, reject) => req.login(user, error => error ? reject(error) : resolve()));
    // Passport 0.7 regenerates on BOTH logout and login. Set only trusted
    // impersonation metadata on the final session, then persist before redirect.
    if (impersonation) {
      Object.assign(req.session, { impersonation, originalSuperAdminId: impersonation.originalUserId, isImpersonating: true });
    }
    await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  } catch (error) {
    // Do not leave a partially switched or unpersisted privileged session alive.
    await new Promise<void>(resolve => req.session?.destroy(() => resolve()) ?? resolve());
    throw error;
  }
}

export function registerImpersonationRoutes(app: Express, deps: {
  ensureSuperAdmin: RequestHandler;
  storage: { getUser: GetUser; getCompany: (id: number) => Promise<Company | undefined> };
  findCompanyAdmin: (id: number) => Promise<User | undefined>;
  createTemporaryAdmin: (company: Company) => Promise<User>;
}) {
  app.post('/api/admin/impersonate/:companyId', deps.ensureSuperAdmin, async (req, res) => {
    try {
      const originalUser = await resolveOriginalAdmin(req, id => deps.storage.getUser(id));
      if (!originalUser) return res.status(403).json({ error: 'Super admin access required' });
      const companyId = Number(req.params.companyId);
      if (!Number.isSafeInteger(companyId) || companyId <= 0) return res.sendStatus(400);
      const company = await deps.storage.getCompany(companyId);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      const adminUser = await deps.findCompanyAdmin(companyId) || await deps.createTemporaryAdmin(company);
      await switchAccount(req, adminUser, {
        originalUserId: originalUser.id, originalUserEmail: originalUser.email,
        impersonatedAt: new Date().toISOString(), companyId,
      });
      res.json({ user: adminUser, company, impersonating: true, originalUserId: originalUser.id });
    } catch {
      res.status(503).json({ error: 'Could not save the impersonation session. Please sign in again.' });
    }
  });

  app.post('/api/admin/return-from-impersonation', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Administrator sign-in required' });
    try {
      const session = req.session as any;
      const originalId = session.impersonation?.originalUserId || (session.isImpersonating && session.originalSuperAdminId);
      const admin = Number.isSafeInteger(originalId) ? await deps.storage.getUser(originalId) : undefined;
      if (!admin?.isSuperAdmin) return res.status(403).json({ error: 'Original administrator session unavailable. Please sign in again.' });
      await switchAccount(req, admin);
      res.json({ user: admin, impersonating: false, message: 'Successfully returned to admin account' });
    } catch {
      res.status(503).json({ error: 'Failed to return from impersonation. Please retry or sign in again.' });
    }
  });
}
