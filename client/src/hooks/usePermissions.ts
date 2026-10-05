import { resolveContactViewScope } from '@shared/contact-access';
import { REAL_ESTATE_PERMISSIONS, REAL_ESTATE_PERMISSION_KEYS } from '@shared/real-estate';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';

export const PERMISSIONS = {
  ...REAL_ESTATE_PERMISSIONS,
  VIEW_ALL_CONVERSATIONS: 'view_all_conversations',
  VIEW_ASSIGNED_CONVERSATIONS: 'view_assigned_conversations',
  ASSIGN_CONVERSATIONS: 'assign_conversations',
  MANAGE_CONVERSATIONS: 'manage_conversations',

  VIEW_CONTACTS: 'view_contacts',
  VIEW_OWN_CONTACTS: 'view_own_contacts',
  VIEW_ASSIGNED_CONTACTS: 'view_assigned_contacts',
  VIEW_COMPANY_CONTACTS: 'view_company_contacts',
  MANAGE_CONTACTS: 'manage_contacts',
  VIEW_CONTACT_PHONE: 'view_contact_phone',
  CREATE_CONTACTS: 'create_contacts',

  VIEW_CHANNELS: 'view_channels',
  MANAGE_CHANNELS: 'manage_channels',

  VIEW_FLOWS: 'view_flows',
  MANAGE_FLOWS: 'manage_flows',

  VIEW_ANALYTICS: 'view_analytics',
  VIEW_DETAILED_ANALYTICS: 'view_detailed_analytics',

  VIEW_TEAM: 'view_team',
  MANAGE_TEAM: 'manage_team',

  VIEW_SETTINGS: 'view_settings',
  MANAGE_SETTINGS: 'manage_settings',

  VIEW_PIPELINE: 'view_pipeline',
  MANAGE_PIPELINE: 'manage_pipeline',

  VIEW_CALENDAR: 'view_calendar',
  MANAGE_CALENDAR: 'manage_calendar',


  VIEW_CAMPAIGNS: 'view_campaigns',
  CREATE_CAMPAIGNS: 'create_campaigns',
  EDIT_CAMPAIGNS: 'edit_campaigns',
  DELETE_CAMPAIGNS: 'delete_campaigns',
  MANAGE_TEMPLATES: 'manage_templates',
  MANAGE_SEGMENTS: 'manage_segments',
  VIEW_CAMPAIGN_ANALYTICS: 'view_campaign_analytics',
  MANAGE_WHATSAPP_ACCOUNTS: 'manage_whatsapp_accounts',
  CONFIGURE_CHANNELS: 'configure_channels',

  VIEW_PAGES: 'view_pages',
  MANAGE_PAGES: 'manage_pages',

  VIEW_TASKS: 'view_tasks',
  MANAGE_TASKS: 'manage_tasks',

  VIEW_CALL_LOGS: 'view_call_logs',
  MANAGE_CALL_LOGS: 'manage_call_logs',
  EXPORT_CALL_LOGS: 'export_call_logs',
  DELETE_CALL_LOGS: 'delete_call_logs',

  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',
  VIEW_AGENT_REPORTS: 'view_agent_reports',
  VIEW_RESPONSE_TIME_REPORTS: 'view_response_time_reports',
  VIEW_CAPTURED_DATA: 'view_captured_data',
  MANAGE_CAPTURED_DATA: 'manage_captured_data',

  VIEW_ERP: 'view_erp',
  VIEW_PRODUCTS: 'view_products',
  MANAGE_PRODUCTS: 'manage_products',
  VIEW_INVENTORY: 'view_inventory',
  MANAGE_INVENTORY: 'manage_inventory',
  VIEW_SALES_ORDERS: 'view_sales_orders',
  MANAGE_SALES_ORDERS: 'manage_sales_orders',
  DELETE_SALES_ORDERS: 'delete_sales_orders',
  CREATE_QUOTATIONS: 'create_quotations',

  VIEW_SUPPLIERS: 'view_suppliers',
  MANAGE_SUPPLIERS: 'manage_suppliers',
  VIEW_PURCHASE_ORDERS: 'view_purchase_orders',
  MANAGE_PURCHASE_ORDERS: 'manage_purchase_orders',

  VIEW_INVOICES: 'view_invoices',
  MANAGE_INVOICES: 'manage_invoices',
  RECORD_PAYMENTS: 'record_payments',

  VIEW_ACCOUNTING: 'view_accounting',
  MANAGE_ACCOUNTING: 'manage_accounting',
  POST_JOURNAL_ENTRIES: 'post_journal_entries',
  CLOSE_FISCAL_YEAR: 'close_fiscal_year',

  VIEW_HR: 'view_hr',
  MANAGE_HR: 'manage_hr',
  VIEW_PAYROLL: 'view_payroll',
  MANAGE_PAYROLL: 'manage_payroll',
  APPROVE_LEAVE: 'approve_leave',

  VIEW_ERP_SETTINGS: 'view_erp_settings',
  MANAGE_ERP_SETTINGS: 'manage_erp_settings',

  VIEW_ERP_DASHBOARD: 'view_erp_dashboard',
  VIEW_ERP_REPORTS: 'view_erp_reports',

  VIEW_DENTAL_PATIENTS: 'view_dental_patients',
  MANAGE_DENTAL_PATIENTS: 'manage_dental_patients',
  VIEW_DENTAL_SCHEDULE: 'view_dental_schedule',
  MANAGE_DENTAL_SCHEDULE: 'manage_dental_schedule',
  VIEW_DENTAL_CHART: 'view_dental_chart',
  EDIT_DENTAL_CHART: 'edit_dental_chart',
  VIEW_PRIVATE_DENTAL_PROGRESS_NOTES: 'view_private_dental_progress_notes',
  VIEW_DENTAL_IMAGING: 'view_dental_imaging',
  MANAGE_DENTAL_IMAGING: 'manage_dental_imaging',
  VIEW_DENTAL_TREATMENT_PLANS: 'view_dental_treatment_plans',
  MANAGE_DENTAL_TREATMENT_PLANS: 'manage_dental_treatment_plans',
  MANAGE_DENTAL_PRESCRIPTIONS: 'manage_dental_prescriptions',
  USE_DENTAL_AI: 'use_dental_ai',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/** Aligns with `ERPDashboardRoute` in `ProtectedRoute.tsx` (who may open `/erp/dashboard`). */
export const ERP_DASHBOARD_ROUTE_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_ERP_DASHBOARD,
  PERMISSIONS.VIEW_PRODUCTS,
  PERMISSIONS.VIEW_SALES_ORDERS,
  PERMISSIONS.VIEW_INVOICES,
  PERMISSIONS.VIEW_ACCOUNTING,
  PERMISSIONS.VIEW_INVENTORY,
];

/** Aligns with `ERPReportsRoute` in `ProtectedRoute.tsx` (who may open `/erp/reports`). */
export const ERP_REPORTS_ROUTE_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_ERP_REPORTS,
];

/** Dental clinical keys — enough to unlock ERP nav when the user has clinical-only access. */
export const DENTAL_CLINICAL_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_DENTAL_PATIENTS,
  PERMISSIONS.MANAGE_DENTAL_PATIENTS,
  PERMISSIONS.VIEW_DENTAL_SCHEDULE,
  PERMISSIONS.MANAGE_DENTAL_SCHEDULE,
  PERMISSIONS.VIEW_DENTAL_CHART,
  PERMISSIONS.EDIT_DENTAL_CHART,
  PERMISSIONS.VIEW_PRIVATE_DENTAL_PROGRESS_NOTES,
  PERMISSIONS.VIEW_DENTAL_IMAGING,
  PERMISSIONS.MANAGE_DENTAL_IMAGING,
  PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS,
  PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS,
  PERMISSIONS.MANAGE_DENTAL_PRESCRIPTIONS,
  PERMISSIONS.USE_DENTAL_AI,
];

/**
 * Who may see the ERP sidebar shell / `canAccessERP`.
 * Includes dental clinical keys so clinical-only roles unlock Dental nav.
 */
export const ERP_ACCESS_PERMISSIONS: Permission[] = [
  ...REAL_ESTATE_PERMISSION_KEYS,
  PERMISSIONS.VIEW_ERP,
  PERMISSIONS.VIEW_ERP_DASHBOARD,
  PERMISSIONS.VIEW_ERP_REPORTS,
  PERMISSIONS.VIEW_PRODUCTS,
  PERMISSIONS.MANAGE_PRODUCTS,
  PERMISSIONS.VIEW_INVENTORY,
  PERMISSIONS.MANAGE_INVENTORY,
  PERMISSIONS.VIEW_SALES_ORDERS,
  PERMISSIONS.MANAGE_SALES_ORDERS,
  PERMISSIONS.CREATE_QUOTATIONS,
  PERMISSIONS.VIEW_SUPPLIERS,
  PERMISSIONS.MANAGE_SUPPLIERS,
  PERMISSIONS.VIEW_PURCHASE_ORDERS,
  PERMISSIONS.MANAGE_PURCHASE_ORDERS,
  PERMISSIONS.VIEW_INVOICES,
  PERMISSIONS.MANAGE_INVOICES,
  PERMISSIONS.RECORD_PAYMENTS,
  PERMISSIONS.VIEW_ACCOUNTING,
  PERMISSIONS.MANAGE_ACCOUNTING,
  PERMISSIONS.POST_JOURNAL_ENTRIES,
  PERMISSIONS.CLOSE_FISCAL_YEAR,
  PERMISSIONS.VIEW_HR,
  PERMISSIONS.MANAGE_HR,
  PERMISSIONS.VIEW_PAYROLL,
  PERMISSIONS.MANAGE_PAYROLL,
  PERMISSIONS.APPROVE_LEAVE,
  PERMISSIONS.VIEW_ERP_SETTINGS,
  PERMISSIONS.MANAGE_ERP_SETTINGS,
  ...DENTAL_CLINICAL_PERMISSIONS,
];

interface UserPermissions {
  [key: string]: boolean;
}

const fetchUserPermissions = async (): Promise<UserPermissions> => {
  const response = await fetch('/api/users/permissions', {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user permissions');
  }

  return response.json();
};

export const usePermissions = () => {
  const { user } = useAuth();

  const {
    data: permissions = {},
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['userPermissions', user?.id],
    queryFn: fetchUserPermissions,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const hasPermission = (permission: Permission): boolean => {
    if (user?.isSuperAdmin) {
      return true;
    }

    return permissions[permission] === true;
  };

  const hasAnyPermission = (permissionList: Permission[]): boolean => {
    if (user?.isSuperAdmin) {
      return true;
    }

    return permissionList.some(permission => permissions[permission] === true);
  };

  const hasAllPermissions = (permissionList: Permission[]): boolean => {
    if (user?.isSuperAdmin) {
      return true;
    }

    return permissionList.every(permission => permissions[permission] === true);
  };

  const canViewAllConversations = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_ALL_CONVERSATIONS);
  };

  const canOnlyViewAssignedConversations = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS) &&
           !hasPermission(PERMISSIONS.VIEW_ALL_CONVERSATIONS);
  };

  const canAssignConversations = (): boolean => {
    return hasPermission(PERMISSIONS.ASSIGN_CONVERSATIONS);
  };

  const canManageConversations = (): boolean => {
    return hasPermission(PERMISSIONS.MANAGE_CONVERSATIONS);
  };

  const canAccessSettings = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]);
  };

  const canAccessAnalytics = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.VIEW_DETAILED_ANALYTICS]);
  };

  const canAccessTeam = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_TEAM, PERMISSIONS.MANAGE_TEAM]);
  };

  const canManageTeam = (): boolean => {
    return user?.isSuperAdmin === true || hasPermission(PERMISSIONS.MANAGE_TEAM);
  };

  const canAccessPipeline = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE]);
  };

  const canAccessFlows = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_FLOWS, PERMISSIONS.MANAGE_FLOWS]);
  };

  const canAccessChannels = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]);
  };

  const canAccessContacts = (): boolean => resolveContactViewScope(permissions, user?.isSuperAdmin === true) !== null;

  const canViewOwnContacts = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_OWN_CONTACTS);
  };

  const canViewAssignedContacts = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_ASSIGNED_CONTACTS);
  };

  const canViewCompanyContacts = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_COMPANY_CONTACTS);
  };

  const canViewContactPhone = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_CONTACT_PHONE);
  };

  const getContactViewScope = () => resolveContactViewScope(permissions, user?.isSuperAdmin === true);

  const canAccessCalendar = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CALENDAR, PERMISSIONS.MANAGE_CALENDAR]);
  };

  const canAccessCampaigns = (): boolean => {
    return hasAnyPermission([
      PERMISSIONS.VIEW_CAMPAIGNS,
      PERMISSIONS.CREATE_CAMPAIGNS,
      PERMISSIONS.EDIT_CAMPAIGNS,
      PERMISSIONS.DELETE_CAMPAIGNS,
      PERMISSIONS.MANAGE_TEMPLATES,
      PERMISSIONS.MANAGE_SEGMENTS,
      PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS,
      PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS,
      PERMISSIONS.CONFIGURE_CHANNELS
    ]);
  };

  const canAccessTasks = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS]);
  };

  const canAccessCallLogs = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]);
  };

  const canManageCallLogs = (): boolean => {
    return hasPermission(PERMISSIONS.MANAGE_CALL_LOGS);
  };

  const canExportCallLogs = (): boolean => {
    return hasPermission(PERMISSIONS.EXPORT_CALL_LOGS);
  };

  const canAccessReports = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]);
  };

  const canAccessCapturedData = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]);
  };

  const canAccessERP = (): boolean => {
    return hasAnyPermission(ERP_ACCESS_PERMISSIONS);
  };

  const canExportReports = (): boolean => {
    return hasPermission(PERMISSIONS.EXPORT_REPORTS);
  };

  return {
    permissions,
    isLoading,
    error,
    refetch,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canViewAllConversations,
    canOnlyViewAssignedConversations,
    canAssignConversations,
    canManageConversations,
    canAccessSettings,
    canAccessAnalytics,
    canAccessTeam,
    canManageTeam,
    canAccessPipeline,
    canAccessFlows,
    canAccessChannels,
    canAccessContacts,
    canViewOwnContacts,
    canViewAssignedContacts,
    canViewCompanyContacts,
    canViewContactPhone,
    getContactViewScope,
    canAccessCalendar,
    canAccessCampaigns,
    canAccessTasks,
    canAccessCallLogs,
    canManageCallLogs,
    canExportCallLogs,
    canAccessReports,
    canAccessCapturedData,
    canAccessERP,
    canExportReports,
    PERMISSIONS
  };
};

export const withPermission = (permission: Permission) => {
  return <P extends object>(Component: React.ComponentType<P>) => {
    const WrappedComponent = (props: P) => {
      const { hasPermission } = usePermissions();

      if (!hasPermission(permission)) {
        return null;
      }

      return React.createElement(Component, props);
    };

    return WrappedComponent;
  };
};

export const PermissionGate: React.FC<{
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  return hasAccess ? React.createElement(React.Fragment, null, children) : React.createElement(React.Fragment, null, fallback);
};
