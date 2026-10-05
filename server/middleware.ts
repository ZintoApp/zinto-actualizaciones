import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { User as SelectUser, Company, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, USER_PERMISSION_MODES, RESERVED_ADMIN_PERMISSIONS } from "../shared/schema";
import { planLimitsService } from "./services/plan-limits-service";


export { ensureActiveSubscription, apiSubscriptionGuard, subscriptionWarning } from './middleware/subscription-guard';
import { ensureLicenseValid } from './middleware/license-guard';
export { ensureLicenseValid };

export const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};

export const ensureSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  ensureLicenseValid(req, res, (err?: any) => {
    if (err) {
      return next(err);
    }
    
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    const session = req.session as any;
    if (session?.impersonation?.originalUserId) {
      (req as any).isImpersonating = true;
      (req as any).originalUserId = session.impersonation.originalUserId;
      return next();
    }
    res.status(403).json({ message: 'Super admin access required' });
  });
};

/** Call Agent health: super admins get full access; company admins get their company's connections only */
export const ensureCallAgentHealthAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const user = req.user as SelectUser;
  if (user.isSuperAdmin) {
    (req as any).healthScope = 'full';
    return next();
  }
  if (user.companyId) {
    (req as any).healthScope = 'company';
    (req as any).healthCompanyId = user.companyId;
    return next();
  }
  return res.status(403).json({ message: 'Company admin access required' });
};

/** Super admins must be impersonating or otherwise bound to a company for company-scoped admin surfaces. */
export function hasCompanyContext(user: SelectUser): boolean {
  return user.companyId != null;
}

/** Requires an authenticated user with a company association. */
export const ensureCompanyContext = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = req.user as SelectUser;
  if (!hasCompanyContext(user)) {
    return res.status(403).json({ message: 'Company context required' });
  }

  next();
};

/** Role-based guard for admin-reserved surfaces (team management, role defaults, company settings). Not permission-based. */
export const ensureAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = req.user as SelectUser;
  if (user.role !== 'admin' && !user.isSuperAdmin) {
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }

  if (user.isSuperAdmin && !hasCompanyContext(user)) {
    return res.status(403).json({ message: 'Company context required for company settings' });
  }

  next();
};

export type TeamMembersListScope = 'company-all' | 'company-active';

/** Read access for team management member list endpoints. Returns null when caller may not list members. */
export async function resolveTeamMembersListScope(user: SelectUser): Promise<TeamMembersListScope | null> {
  if (!hasCompanyContext(user)) {
    return null;
  }
  if (user.isSuperAdmin || user.role === 'admin') {
    return 'company-all';
  }
  const perms = await getUserPermissions(user);
  if (perms[PERMISSIONS.VIEW_TEAM]) {
    return 'company-active';
  }
  return null;
}

/** Active company admin eligible to manage team/settings (matches findCompanyAdmin active tier). */
export function isActingCompanyAdmin(user: SelectUser): boolean {
  return user.role === 'admin' && !!user.active;
}

export function countActingCompanyAdmins(companyUsers: SelectUser[]): number {
  return companyUsers.filter(isActingCompanyAdmin).length;
}

export function wouldRemoveLastCompanyAdmin(
  companyUsers: SelectUser[],
  targetUserId: number,
  newRole?: string
): boolean {
  const target = companyUsers.find(u => u.id === targetUserId);
  if (!target || !isActingCompanyAdmin(target)) {
    return false;
  }
  if (newRole !== undefined && newRole === 'admin') {
    return false;
  }
  return countActingCompanyAdmins(companyUsers) <= 1;
}

export const teamMemberPermissionFieldsSchema = z.object({
  permissionMode: z
    .enum([USER_PERMISSION_MODES.INHERIT, USER_PERMISSION_MODES.CUSTOM])
    .optional(),
  permissions: z.record(z.boolean()).optional(),
  customPermissions: z.record(z.boolean()).optional(),
});

export type TeamMemberPermissionFields = z.infer<typeof teamMemberPermissionFieldsSchema>;

export type TeamMemberPermissionUpdates = {
  permissionMode?: SelectUser['permissionMode'];
  permissions?: Record<string, boolean>;
  customPermissions?: Record<string, boolean>;
};

export function buildTeamMemberPermissionUpdates(
  data: TeamMemberPermissionFields
): TeamMemberPermissionUpdates {
  const updates: TeamMemberPermissionUpdates = {};
  if (data.permissionMode !== undefined) {
    updates.permissionMode = data.permissionMode;
  }
  if (data.permissions !== undefined) {
    updates.permissions = data.permissions;
  }
  if (data.customPermissions !== undefined) {
    updates.customPermissions = data.customPermissions;
  }
  return updates;
}

export function isSelfAuthMutationAttempt(
  actorId: number,
  targetId: number,
  body: Record<string, unknown>
): boolean {
  if (actorId !== targetId) {
    return false;
  }
  return (
    body.role !== undefined ||
    body.customRoleId !== undefined ||
    'permissionMode' in body ||
    'permissions' in body ||
    'customPermissions' in body
  );
}

export const ensureCompanyUser = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = req.user as SelectUser;

  if (user.isSuperAdmin) {
    return next();
  }

  const session = req.session as any;
  if (session?.impersonation?.originalUserId) {
    if (!user.companyId) {
      return res.status(403).json({ message: 'Impersonated user has no company association' });
    }

    const company = await storage.getCompany(user.companyId);
    if (!company || !company.active) {
      return res.status(403).json({ message: 'Impersonated company account is inactive or not found' });
    }

    (req as any).company = company;
    (req as any).isImpersonating = true;
    (req as any).originalUserId = session.impersonation.originalUserId;
    return next();
  }

  if (!user.companyId) {
    return res.status(403).json({ message: 'No company association found' });
  }

  const company = await storage.getCompany(user.companyId);
  if (!company || !company.active) {
    return res.status(403).json({ message: 'Company account is inactive or not found' });
  }

  (req as any).company = company;
  next();
};

/** Enforces company + role: agents without manage_pipeline may only access pipelines they created or are assigned to when view_own_pipelines is true; otherwise denied. */
export async function assertUserCanAccessPipeline(
  user: SelectUser,
  pipeline: { id: number; companyId: number | null; createdBy: number | null },
  perms: Record<string, boolean>
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (user.isSuperAdmin) {
    return { ok: true };
  }
  if (!user.companyId || pipeline.companyId == null || pipeline.companyId !== user.companyId) {
    return { ok: false, status: 403, message: 'You do not have permission to access this pipeline' };
  }
  if (perms[PERMISSIONS.MANAGE_PIPELINE]) {
    return { ok: true };
  }
  if (user.role !== 'agent') {
    return { ok: true };
  }
  if (perms[PERMISSIONS.VIEW_OWN_PIPELINES] !== true) {
    return { ok: false, status: 403, message: 'You do not have permission to access this pipeline' };
  }
  const assignments = await storage.getPipelineAssignmentsByUser(user.id, user.companyId);
  const assignedIds = new Set(assignments.map(a => a.pipelineId));
  if (pipeline.createdBy === user.id || assignedIds.has(pipeline.id)) {
    return { ok: true };
  }
  return { ok: false, status: 403, message: 'You do not have permission to access this pipeline' };
}

function buildPermissionCatalog(defaultValue: boolean): Record<string, boolean> {
  return Object.values(PERMISSIONS).reduce((acc, permission) => {
    acc[permission] = defaultValue;
    return acc;
  }, {} as Record<string, boolean>);
}

function applyReservedAdminPermissions(
  permissions: Record<string, boolean>,
  role: SelectUser['role']
): Record<string, boolean> {
  if (role !== 'admin') {
    return permissions;
  }
  const effective = { ...permissions };
  for (const permission of RESERVED_ADMIN_PERMISSIONS) {
    effective[permission] = true;
  }
  return effective;
}

/** Persisted admin custom snapshots cannot contradict effective reserved admin access. */
export function normalizeAdminCustomPermissionsSnapshot(
  role: SelectUser['role'],
  customPermissions: Record<string, boolean> | undefined
): Record<string, boolean> | undefined {
  if (!customPermissions || role !== 'admin') {
    return customPermissions;
  }
  return applyReservedAdminPermissions(customPermissions, 'admin');
}

async function resolveInheritedPermissions(user: SelectUser): Promise<Record<string, boolean>> {
  let rolePermissions: Record<string, boolean> = {};
  if (user.companyId && user.role) {
    const defaultsForRole =
      (DEFAULT_ROLE_PERMISSIONS as Record<string, Record<string, boolean>>)[user.role] || {};
    rolePermissions = { ...defaultsForRole };
    try {
      if (user.customRoleId) {
        const customRole = await storage.getCompanyCustomRole(user.customRoleId, user.companyId);
        if (customRole) {
          const stored = (customRole.permissions || {}) as Record<string, boolean>;
          // Custom roles are agent-tier; start from agent catalog defaults then overlay role snapshot.
          rolePermissions = { ...DEFAULT_ROLE_PERMISSIONS.agent };
          for (const key of Object.keys(stored)) {
            if (stored[key] !== undefined) {
              rolePermissions[key] = stored[key];
            }
          }
        }
      } else if (user.role === 'admin' || user.role === 'agent') {
        const companyRolePermissions = await storage.getRolePermissionsByRole(user.companyId, user.role);
        if (companyRolePermissions) {
          const stored = (companyRolePermissions.permissions || {}) as Record<string, boolean>;
          rolePermissions = { ...defaultsForRole };
          for (const key of Object.keys(stored)) {
            if (stored[key] !== undefined) {
              rolePermissions[key] = stored[key];
            }
          }
        }
      } else {
        rolePermissions = { ...defaultsForRole };
      }
    } catch (error) {
      rolePermissions = { ...defaultsForRole };
    }
  }

  const userSpecificPermissions = (user.permissions || {}) as Record<string, boolean>;

  return {
    ...rolePermissions,
    ...userSpecificPermissions
  };
}

function resolveCustomPermissions(user: SelectUser): Record<string, boolean> {
  const effective = buildPermissionCatalog(false);
  const snapshot = (user.customPermissions || {}) as Record<string, boolean>;
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined) {
      effective[key] = value;
    }
  }
  return effective;
}

export const getUserPermissions = async (user: SelectUser): Promise<Record<string, boolean>> => {
  if (user.isSuperAdmin) {
    return buildPermissionCatalog(true);
  }

  const permissions =
    user.permissionMode === USER_PERMISSION_MODES.CUSTOM
      ? resolveCustomPermissions(user)
      : await resolveInheritedPermissions(user);

  return applyReservedAdminPermissions(permissions, user.role);
};

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    try {
      const userPermissions = await getUserPermissions(user);

      if (!userPermissions[permission]) {
        return res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          requiredPermission: permission
        });
      }

      (req as any).userPermissions = userPermissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};

export const requireAllPermissions = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    try {
      const userPermissions = await getUserPermissions(user);

      const missingPermissions = permissions.filter(permission => !userPermissions[permission]);

      if (missingPermissions.length > 0) {
        return res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          requiredPermissions: permissions,
          missingPermissions
        });
      }

      (req as any).userPermissions = userPermissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};

export const requireAnyPermission = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    try {
      const userPermissions = await getUserPermissions(user);

      const hasAnyPermission = permissions.some(permission => userPermissions[permission]);

      if (!hasAnyPermission) {
        return res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          requiredPermissions: permissions
        });
      }

      (req as any).userPermissions = userPermissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};
