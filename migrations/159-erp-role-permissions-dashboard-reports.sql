-- Merge ERP dashboard and report permission keys into existing role_permissions rows.
-- Aligns with PERMISSIONS.VIEW_ERP_DASHBOARD / VIEW_ERP_REPORTS in shared/schema.ts.

BEGIN;

UPDATE role_permissions
SET permissions = permissions || '{"view_erp_dashboard": true, "view_erp_reports": true}'::jsonb
WHERE role = 'admin';

UPDATE role_permissions
SET permissions = permissions || '{"view_erp_dashboard": false, "view_erp_reports": false}'::jsonb
WHERE role = 'agent';

-- Custom / other roles: default deny unless keys already present (safe for reads that use ?? false).
UPDATE role_permissions
SET permissions = permissions || '{"view_erp_dashboard": false, "view_erp_reports": false}'::jsonb
WHERE role NOT IN ('admin', 'agent')
  AND (
    (permissions->>'view_erp_dashboard') IS NULL
    OR (permissions->>'view_erp_reports') IS NULL
  );

COMMIT;
