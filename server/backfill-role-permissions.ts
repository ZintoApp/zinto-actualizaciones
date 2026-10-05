import { DEFAULT_ROLE_PERMISSIONS } from '@shared/schema';
import { storage } from './storage';
import { logger } from './utils/logger';

function rolePermissionsDiffer(
  a: Record<string, boolean>,
  b: Record<string, boolean>
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return true;
    }
  }
  return false;
}

/** One-time startup backfill: persist new DEFAULT_ROLE_PERMISSIONS keys into existing role_permissions rows only. */
export async function backfillRolePermissions(): Promise<void> {
  // Role-layer only: never read or mutate users.customPermissions or users.permissionMode.
  const rows = await storage.getRolePermissions();
  let updatedCount = 0;
  for (const row of rows) {
    if (row.role !== 'admin' && row.role !== 'agent') {
      continue;
    }
    const defaultsForRole = DEFAULT_ROLE_PERMISSIONS[row.role];
    const stored = (row.permissions || {}) as Record<string, boolean>;
    const merged: Record<string, boolean> = { ...defaultsForRole, ...stored };
    if (!rolePermissionsDiffer(merged, stored)) {
      continue;
    }
    await storage.updateRolePermissions(row.role, merged, row.companyId);
    updatedCount += 1;
  }
  if (updatedCount > 0) {
    logger.info(
      'role-permissions',
      `Backfilled ${updatedCount} role_permissions row(s) with missing default keys`
    );
  }
}
