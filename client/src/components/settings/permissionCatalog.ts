import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@shared/schema';
import { REAL_ESTATE_PERMISSION_KEYS, REAL_ESTATE_SECTIONS } from '@shared/real-estate';

const P = PERMISSIONS;

type LabelDef = { key: string; default: string };

const PERMISSION_LABELS: Record<string, LabelDef> = {
  [P.VIEW_ALL_CONVERSATIONS]: { key: 'roles.view_all_conversations', default: 'View All Conversations' },
  [P.VIEW_ASSIGNED_CONVERSATIONS]: { key: 'roles.view_assigned_conversations', default: 'View Assigned Conversations' },
  [P.ASSIGN_CONVERSATIONS]: { key: 'roles.assign_conversations', default: 'Assign Conversations' },
  [P.MANAGE_CONVERSATIONS]: { key: 'roles.manage_conversations', default: 'Manage Conversations' },
  [P.VIEW_OWN_CONTACTS]: { key: 'roles.view_own_contacts', default: 'View Own Contacts' },
  [P.VIEW_ASSIGNED_CONTACTS]: { key: 'roles.view_assigned_contacts', default: 'View Assigned Contacts' },
  [P.VIEW_COMPANY_CONTACTS]: { key: 'roles.view_company_contacts', default: 'View Company Contacts' },
  [P.MANAGE_CONTACTS]: { key: 'roles.manage_contacts', default: 'Manage Contacts' },
  [P.VIEW_CONTACT_PHONE]: { key: 'roles.view_contact_phone', default: 'View Contact Phone' },
  [P.CREATE_CONTACTS]: { key: 'roles.create_contacts', default: 'Create Contacts' },
  [P.DELETE_CONTACTS]: { key: 'roles.delete_contacts', default: 'Delete Contacts' },
  [P.VIEW_CAMPAIGNS]: { key: 'roles.view_campaigns', default: 'View Campaigns' },
  [P.CREATE_CAMPAIGNS]: { key: 'roles.create_campaigns', default: 'Create Campaigns' },
  [P.EDIT_CAMPAIGNS]: { key: 'roles.edit_campaigns', default: 'Edit Campaigns' },
  [P.DELETE_CAMPAIGNS]: { key: 'roles.delete_campaigns', default: 'Delete Campaigns' },
  [P.MANAGE_TEMPLATES]: { key: 'roles.manage_templates', default: 'Manage Templates' },
  [P.MANAGE_SEGMENTS]: { key: 'roles.manage_segments', default: 'Manage Segments' },
  [P.VIEW_CAMPAIGN_ANALYTICS]: { key: 'roles.view_campaign_analytics', default: 'View Campaign Analytics' },
  [P.MANAGE_WHATSAPP_ACCOUNTS]: { key: 'roles.manage_whatsapp_accounts', default: 'Manage WhatsApp Accounts' },
  [P.VIEW_PIPELINE]: { key: 'roles.view_pipeline', default: 'View Pipeline' },
  [P.MANAGE_PIPELINE]: { key: 'roles.manage_pipeline', default: 'Manage Pipeline' },
  [P.VIEW_OWN_PIPELINES]: { key: 'roles.view_own_pipelines', default: 'View Own Pipelines' },
  [P.CREATE_DEALS]: { key: 'roles.create_deals', default: 'Create Deals' },
  [P.EDIT_DEALS]: { key: 'roles.edit_deals', default: 'Edit Deals' },
  [P.DELETE_DEALS]: { key: 'roles.delete_deals', default: 'Delete Deals' },
  [P.MANAGE_PIPELINE_STAGES]: { key: 'roles.manage_pipeline_stages', default: 'Manage Pipeline Stages' },
  [P.VIEW_CHANNELS]: { key: 'roles.view_channels', default: 'View Channels' },
  [P.MANAGE_CHANNELS]: { key: 'roles.manage_channels', default: 'Manage Channels' },
  [P.CONFIGURE_CHANNELS]: { key: 'roles.configure_channels', default: 'Configure Channels' },
  [P.VIEW_FLOWS]: { key: 'roles.view_flows', default: 'View Flows' },
  [P.MANAGE_FLOWS]: { key: 'roles.manage_flows', default: 'Manage Flows' },
  [P.VIEW_ANALYTICS]: { key: 'roles.view_analytics', default: 'View Analytics' },
  [P.VIEW_DETAILED_ANALYTICS]: { key: 'roles.view_detailed_analytics', default: 'View Detailed Analytics' },
  [P.VIEW_TEAM]: { key: 'roles.view_team', default: 'View Team' },
  [P.MANAGE_TEAM]: { key: 'roles.manage_team', default: 'Manage Team' },
  [P.VIEW_SETTINGS]: { key: 'roles.view_settings', default: 'View Settings' },
  [P.MANAGE_SETTINGS]: { key: 'roles.manage_settings', default: 'Manage Settings' },
  [P.VIEW_CALENDAR]: { key: 'roles.view_calendar', default: 'View Calendar' },
  [P.MANAGE_CALENDAR]: { key: 'roles.manage_calendar', default: 'Manage Calendar' },
  [P.VIEW_TASKS]: { key: 'roles.view_tasks', default: 'View Tasks' },
  [P.MANAGE_TASKS]: { key: 'roles.manage_tasks', default: 'Manage Tasks' },
  [P.VIEW_PAGES]: { key: 'roles.view_pages', default: 'View Pages' },
  [P.MANAGE_PAGES]: { key: 'roles.manage_pages', default: 'Manage Pages' },
  [P.VIEW_CALL_LOGS]: { key: 'roles.view_call_logs', default: 'View Call Logs' },
  [P.MANAGE_CALL_LOGS]: { key: 'roles.manage_call_logs', default: 'Manage Call Logs' },
  [P.EXPORT_CALL_LOGS]: { key: 'roles.export_call_logs', default: 'Export Call Logs' },
  [P.DELETE_CALL_LOGS]: { key: 'roles.delete_call_logs', default: 'Delete Call Logs' },
  [P.VIEW_REPORTS]: { key: 'roles.view_reports', default: 'View Reports' },
  [P.EXPORT_REPORTS]: { key: 'roles.export_reports', default: 'Export Reports' },
  [P.VIEW_AGENT_REPORTS]: { key: 'roles.view_agent_reports', default: 'View Agent Reports' },
  [P.VIEW_RESPONSE_TIME_REPORTS]: { key: 'roles.view_response_time_reports', default: 'View Response Time Reports' },
  [P.VIEW_ERP]: { key: 'roles.view_erp', default: 'View ERP' },
  [P.VIEW_ERP_DASHBOARD]: { key: 'roles.view_erp_dashboard', default: 'View ERP Dashboard' },
  [P.VIEW_ERP_REPORTS]: { key: 'roles.view_erp_reports', default: 'View ERP Reports' },
  [P.VIEW_ERP_SETTINGS]: { key: 'roles.view_erp_settings', default: 'View ERP Settings' },
  [P.MANAGE_ERP_SETTINGS]: { key: 'roles.manage_erp_settings', default: 'Manage ERP Settings' },
  [P.VIEW_PRODUCTS]: { key: 'roles.view_products', default: 'View Products' },
  [P.MANAGE_PRODUCTS]: { key: 'roles.manage_products', default: 'Manage Products' },
  [P.VIEW_INVENTORY]: { key: 'roles.view_inventory', default: 'View Inventory' },
  [P.MANAGE_INVENTORY]: { key: 'roles.manage_inventory', default: 'Manage Inventory' },
  [P.VIEW_SALES_ORDERS]: { key: 'roles.view_sales_orders', default: 'View Sales Orders' },
  [P.MANAGE_SALES_ORDERS]: { key: 'roles.manage_sales_orders', default: 'Manage Sales Orders' },
  [P.DELETE_SALES_ORDERS]: { key: 'roles.delete_sales_orders', default: 'Delete Sales Orders' },
  [P.CREATE_QUOTATIONS]: { key: 'roles.create_quotations', default: 'Create Quotations' },
  [P.VIEW_SUPPLIERS]: { key: 'roles.view_suppliers', default: 'View Suppliers' },
  [P.MANAGE_SUPPLIERS]: { key: 'roles.manage_suppliers', default: 'Manage Suppliers' },
  [P.VIEW_PURCHASE_ORDERS]: { key: 'roles.view_purchase_orders', default: 'View Purchase Orders' },
  [P.MANAGE_PURCHASE_ORDERS]: { key: 'roles.manage_purchase_orders', default: 'Manage Purchase Orders' },
  [P.VIEW_INVOICES]: { key: 'roles.view_invoices', default: 'View Invoices' },
  [P.MANAGE_INVOICES]: { key: 'roles.manage_invoices', default: 'Manage Invoices' },
  [P.RECORD_PAYMENTS]: { key: 'roles.record_payments', default: 'Record Payments' },
  [P.VIEW_ACCOUNTING]: { key: 'roles.view_accounting', default: 'View Accounting' },
  [P.MANAGE_ACCOUNTING]: { key: 'roles.manage_accounting', default: 'Manage Accounting' },
  [P.POST_JOURNAL_ENTRIES]: { key: 'roles.post_journal_entries', default: 'Post Journal Entries' },
  [P.CLOSE_FISCAL_YEAR]: { key: 'roles.close_fiscal_year', default: 'Close Fiscal Year' },
  [P.VIEW_HR]: { key: 'roles.view_hr', default: 'View HR' },
  [P.MANAGE_HR]: { key: 'roles.manage_hr', default: 'Manage HR' },
  [P.VIEW_PAYROLL]: { key: 'roles.view_payroll', default: 'View Payroll' },
  [P.MANAGE_PAYROLL]: { key: 'roles.manage_payroll', default: 'Manage Payroll' },
  [P.APPROVE_LEAVE]: { key: 'roles.approve_leave', default: 'Approve Leave' },
  [P.VIEW_DENTAL_PATIENTS]: { key: 'roles.view_dental_patients', default: 'View Dental Patients' },
  [P.MANAGE_DENTAL_PATIENTS]: { key: 'roles.manage_dental_patients', default: 'Manage Dental Patients' },
  [P.VIEW_DENTAL_SCHEDULE]: { key: 'roles.view_dental_schedule', default: 'View Dental Schedule' },
  [P.MANAGE_DENTAL_SCHEDULE]: { key: 'roles.manage_dental_schedule', default: 'Manage Dental Schedule' },
  [P.VIEW_DENTAL_CHART]: { key: 'roles.view_dental_chart', default: 'View Dental Chart' },
  [P.EDIT_DENTAL_CHART]: { key: 'roles.edit_dental_chart', default: 'Edit Dental Chart' },
  [P.VIEW_PRIVATE_DENTAL_PROGRESS_NOTES]: { key: 'roles.view_private_dental_progress_notes', default: 'View Private Dental Progress Notes' },
  [P.VIEW_DENTAL_IMAGING]: { key: 'roles.view_dental_imaging', default: 'View Dental Imaging' },
  [P.MANAGE_DENTAL_IMAGING]: { key: 'roles.manage_dental_imaging', default: 'Manage Dental Imaging' },
  [P.VIEW_DENTAL_TREATMENT_PLANS]: { key: 'roles.view_dental_treatment_plans', default: 'View Dental Treatment Plans' },
  [P.MANAGE_DENTAL_TREATMENT_PLANS]: { key: 'roles.manage_dental_treatment_plans', default: 'Manage Dental Treatment Plans' },
  [P.MANAGE_DENTAL_PRESCRIPTIONS]: { key: 'roles.manage_dental_prescriptions', default: 'Manage Dental Prescriptions' },
  [P.USE_DENTAL_AI]: { key: 'roles.use_dental_ai', default: 'Use Dental AI' },
};

export const PERMISSION_GROUP_KEYS = [
  'conversations',
  'contacts',
  'campaigns',
  'pipeline',
  'channels',
  'flows',
  'analytics',
  'team',
  'settings',
  'calendar',
  'tasks',
  'pages',
  'call_logs',
  'reports',
  'erp',
] as const;

export type PermissionGroupKey = (typeof PERMISSION_GROUP_KEYS)[number];

const GROUP_DEFINITIONS: Record<
  PermissionGroupKey,
  { titleKey: string; titleDefault: string; tabLabelKey: string; tabLabelDefault: string; permissionKeys: string[] }
> = {
  conversations: {
    titleKey: 'roles.conversation_management',
    titleDefault: 'Conversation Management',
    tabLabelKey: 'roles.conversation_management_tab',
    tabLabelDefault: 'Conversations',
    permissionKeys: [P.VIEW_ALL_CONVERSATIONS, P.VIEW_ASSIGNED_CONVERSATIONS, P.ASSIGN_CONVERSATIONS, P.MANAGE_CONVERSATIONS],
  },
  contacts: {
    titleKey: 'roles.contact_management',
    titleDefault: 'Contact Management',
    tabLabelKey: 'roles.contact_management_tab',
    tabLabelDefault: 'Contacts',
    permissionKeys: [P.VIEW_OWN_CONTACTS, P.VIEW_ASSIGNED_CONTACTS, P.VIEW_COMPANY_CONTACTS, P.MANAGE_CONTACTS, P.VIEW_CONTACT_PHONE, P.CREATE_CONTACTS, P.DELETE_CONTACTS],
  },
  campaigns: {
    titleKey: 'roles.campaign_management',
    titleDefault: 'Campaign Management',
    tabLabelKey: 'roles.campaign_management_tab',
    tabLabelDefault: 'Campaigns',
    permissionKeys: [P.VIEW_CAMPAIGNS, P.CREATE_CAMPAIGNS, P.EDIT_CAMPAIGNS, P.DELETE_CAMPAIGNS, P.MANAGE_TEMPLATES, P.MANAGE_SEGMENTS, P.VIEW_CAMPAIGN_ANALYTICS, P.MANAGE_WHATSAPP_ACCOUNTS],
  },
  pipeline: {
    titleKey: 'roles.pipeline_management',
    titleDefault: 'Pipeline Management',
    tabLabelKey: 'roles.pipeline_management_tab',
    tabLabelDefault: 'Pipeline',
    permissionKeys: [P.VIEW_PIPELINE, P.MANAGE_PIPELINE, P.VIEW_OWN_PIPELINES, P.CREATE_DEALS, P.EDIT_DEALS, P.DELETE_DEALS, P.MANAGE_PIPELINE_STAGES],
  },
  channels: {
    titleKey: 'roles.channel_management',
    titleDefault: 'Channel Management',
    tabLabelKey: 'roles.channel_management_tab',
    tabLabelDefault: 'Channels',
    permissionKeys: [P.VIEW_CHANNELS, P.MANAGE_CHANNELS, P.CONFIGURE_CHANNELS],
  },
  flows: {
    titleKey: 'roles.flow_management',
    titleDefault: 'Flow Management',
    tabLabelKey: 'roles.flow_management_tab',
    tabLabelDefault: 'Flows',
    permissionKeys: [P.VIEW_FLOWS, P.MANAGE_FLOWS],
  },
  analytics: {
    titleKey: 'roles.analytics',
    titleDefault: 'Analytics',
    tabLabelKey: 'roles.analytics_tab',
    tabLabelDefault: 'Analytics',
    permissionKeys: [P.VIEW_ANALYTICS, P.VIEW_DETAILED_ANALYTICS],
  },
  team: {
    titleKey: 'roles.team_management',
    titleDefault: 'Team Management',
    tabLabelKey: 'roles.team_management_tab',
    tabLabelDefault: 'Team',
    permissionKeys: [P.VIEW_TEAM, P.MANAGE_TEAM],
  },
  settings: {
    titleKey: 'roles.settings',
    titleDefault: 'Settings',
    tabLabelKey: 'roles.settings_tab',
    tabLabelDefault: 'Settings',
    permissionKeys: [P.VIEW_SETTINGS, P.MANAGE_SETTINGS],
  },
  calendar: {
    titleKey: 'roles.calendar',
    titleDefault: 'Calendar',
    tabLabelKey: 'roles.calendar_tab',
    tabLabelDefault: 'Calendar',
    permissionKeys: [P.VIEW_CALENDAR, P.MANAGE_CALENDAR],
  },
  tasks: {
    titleKey: 'roles.task_management',
    titleDefault: 'Task Management',
    tabLabelKey: 'roles.task_management_tab',
    tabLabelDefault: 'Tasks',
    permissionKeys: [P.VIEW_TASKS, P.MANAGE_TASKS],
  },
  pages: {
    titleKey: 'roles.page_management',
    titleDefault: 'Page Management',
    tabLabelKey: 'roles.page_management_tab',
    tabLabelDefault: 'Pages',
    permissionKeys: [P.VIEW_PAGES, P.MANAGE_PAGES],
  },
  call_logs: {
    titleKey: 'roles.call_logs_management',
    titleDefault: 'Call Logs Management',
    tabLabelKey: 'roles.call_logs_management_tab',
    tabLabelDefault: 'Call Logs',
    permissionKeys: [P.VIEW_CALL_LOGS, P.MANAGE_CALL_LOGS, P.EXPORT_CALL_LOGS, P.DELETE_CALL_LOGS],
  },
  reports: {
    titleKey: 'roles.reports',
    titleDefault: 'Reports',
    tabLabelKey: 'roles.reports_tab',
    tabLabelDefault: 'Reports',
    permissionKeys: [P.VIEW_REPORTS, P.EXPORT_REPORTS, P.VIEW_AGENT_REPORTS, P.VIEW_RESPONSE_TIME_REPORTS],
  },
  erp: {
    titleKey: 'roles.erp_management',
    titleDefault: 'ERP Management',
    tabLabelKey: 'roles.erp_management_tab',
    tabLabelDefault: 'ERP',
    permissionKeys: [
      ...REAL_ESTATE_PERMISSION_KEYS,
      P.VIEW_ERP, P.VIEW_ERP_DASHBOARD, P.VIEW_ERP_REPORTS, P.VIEW_ERP_SETTINGS, P.MANAGE_ERP_SETTINGS,
      P.VIEW_PRODUCTS, P.MANAGE_PRODUCTS, P.VIEW_INVENTORY, P.MANAGE_INVENTORY,
      P.VIEW_SALES_ORDERS, P.MANAGE_SALES_ORDERS, P.DELETE_SALES_ORDERS, P.CREATE_QUOTATIONS,
      P.VIEW_SUPPLIERS, P.MANAGE_SUPPLIERS, P.VIEW_PURCHASE_ORDERS, P.MANAGE_PURCHASE_ORDERS,
      P.VIEW_INVOICES, P.MANAGE_INVOICES, P.RECORD_PAYMENTS,
      P.VIEW_ACCOUNTING, P.MANAGE_ACCOUNTING, P.POST_JOURNAL_ENTRIES, P.CLOSE_FISCAL_YEAR,
      P.VIEW_HR, P.MANAGE_HR, P.VIEW_PAYROLL, P.MANAGE_PAYROLL, P.APPROVE_LEAVE,
      P.VIEW_DENTAL_PATIENTS, P.MANAGE_DENTAL_PATIENTS,
      P.VIEW_DENTAL_SCHEDULE, P.MANAGE_DENTAL_SCHEDULE,
      P.VIEW_DENTAL_CHART, P.EDIT_DENTAL_CHART, P.VIEW_PRIVATE_DENTAL_PROGRESS_NOTES,
      P.VIEW_DENTAL_IMAGING, P.MANAGE_DENTAL_IMAGING,
      P.VIEW_DENTAL_TREATMENT_PLANS, P.MANAGE_DENTAL_TREATMENT_PLANS,
      P.MANAGE_DENTAL_PRESCRIPTIONS, P.USE_DENTAL_AI,
    ],
  },
};

export interface PermissionGroup {
  title: string;
  tabLabel: string;
  permissions: Record<string, string>;
}

export type TranslateFn = (key: string, defaultValue: string) => string;

export function getPermissionLabel(permissionKey: string, t: TranslateFn): string {
  if (permissionKey.includes('_real_estate_')) {
    const section = REAL_ESTATE_SECTIONS.find(item => permissionKey.endsWith(`_${item.key}`));
    const fallback = `${permissionKey.startsWith('view_') ? 'View' : permissionKey.startsWith('manage_') ? 'Manage' : 'Record / post'} Real Estate ${section?.label ?? permissionKey.split('_real_estate_')[1].replaceAll('_', ' ')}`;
    return t(`roles.${permissionKey}`, fallback);
  }
  const label = PERMISSION_LABELS[permissionKey];
  return label ? t(label.key, label.default) : permissionKey;
}

export function getPermissionGroups(t: TranslateFn): Record<PermissionGroupKey, PermissionGroup> {
  const groups = {} as Record<PermissionGroupKey, PermissionGroup>;
  for (const groupKey of PERMISSION_GROUP_KEYS) {
    const def = GROUP_DEFINITIONS[groupKey];
    const permissions: Record<string, string> = {};
    for (const permKey of def.permissionKeys) {
      permissions[permKey] = getPermissionLabel(permKey, t);
    }
    groups[groupKey] = {
      title: t(def.titleKey, def.titleDefault),
      tabLabel: t(def.tabLabelKey, def.tabLabelDefault),
      permissions,
    };
  }
  return groups;
}

export interface ErpPermissionSection {
  title: string;
  permissions: string[];
}

export function getErpPermissionSections(t: TranslateFn): ErpPermissionSection[] {
  return [
    { title: t('roles.erp_real_estate', 'Real Estate'), permissions: REAL_ESTATE_PERMISSION_KEYS },
    {
      title: t('roles.erp_core', 'Core / Dashboard & Reports'),
      permissions: [P.VIEW_ERP, P.VIEW_ERP_DASHBOARD, P.VIEW_ERP_REPORTS],
    },
    {
      title: t('roles.erp_products_inventory', 'Products & Inventory'),
      permissions: [P.VIEW_PRODUCTS, P.MANAGE_PRODUCTS, P.VIEW_INVENTORY, P.MANAGE_INVENTORY],
    },
    {
      title: t('roles.erp_sales_quotations', 'Sales & Quotations'),
      permissions: [P.VIEW_SALES_ORDERS, P.MANAGE_SALES_ORDERS, P.CREATE_QUOTATIONS, P.DELETE_SALES_ORDERS],
    },
    {
      title: t('roles.erp_suppliers_purchase_orders', 'Suppliers & Purchase Orders'),
      permissions: [P.VIEW_SUPPLIERS, P.MANAGE_SUPPLIERS, P.VIEW_PURCHASE_ORDERS, P.MANAGE_PURCHASE_ORDERS],
    },
    {
      title: t('roles.erp_invoices_payments', 'Invoices & Payments'),
      permissions: [P.VIEW_INVOICES, P.MANAGE_INVOICES, P.RECORD_PAYMENTS],
    },
    {
      title: t('roles.erp_accounting', 'Accounting'),
      permissions: [P.VIEW_ACCOUNTING, P.MANAGE_ACCOUNTING, P.POST_JOURNAL_ENTRIES, P.CLOSE_FISCAL_YEAR],
    },
    {
      title: t('roles.erp_hr_payroll', 'HR & Payroll'),
      permissions: [P.VIEW_HR, P.MANAGE_HR, P.VIEW_PAYROLL, P.MANAGE_PAYROLL, P.APPROVE_LEAVE],
    },
    {
      title: t('roles.erp_settings_section', 'ERP Settings'),
      permissions: [P.VIEW_ERP_SETTINGS, P.MANAGE_ERP_SETTINGS],
    },
    {
      title: t('roles.erp_dental_clinical', 'Dental Clinical'),
      permissions: [
        P.VIEW_DENTAL_PATIENTS, P.MANAGE_DENTAL_PATIENTS,
        P.VIEW_DENTAL_SCHEDULE, P.MANAGE_DENTAL_SCHEDULE,
        P.VIEW_DENTAL_CHART, P.EDIT_DENTAL_CHART, P.VIEW_PRIVATE_DENTAL_PROGRESS_NOTES,
        P.VIEW_DENTAL_IMAGING, P.MANAGE_DENTAL_IMAGING,
        P.VIEW_DENTAL_TREATMENT_PLANS, P.MANAGE_DENTAL_TREATMENT_PLANS,
        P.MANAGE_DENTAL_PRESCRIPTIONS, P.USE_DENTAL_AI,
      ],
    },
  ];
}

export function getRoleDefaultPermissions(
  role: 'admin' | 'agent',
  rolePermissions: Array<{ role: string; permissions: Record<string, boolean> }>
): Record<string, boolean> {
  const roleData = rolePermissions.find(rp => rp.role === role);
  const fallback = DEFAULT_ROLE_PERMISSIONS[role];
  return { ...fallback, ...(roleData?.permissions ?? {}) };
}

export type RoleSelection =
  | { kind: 'builtin'; role: 'admin' | 'agent' }
  | { kind: 'custom'; id: number };

export function roleSelectionToValue(selection: RoleSelection): string {
  return selection.kind === 'custom' ? `custom:${selection.id}` : selection.role;
}

export function parseRoleSelectionValue(value: string): RoleSelection | null {
  if (value === 'admin' || value === 'agent') {
    return { kind: 'builtin', role: value };
  }
  if (value.startsWith('custom:')) {
    const id = Number(value.slice('custom:'.length));
    if (Number.isInteger(id) && id > 0) {
      return { kind: 'custom', id };
    }
  }
  return null;
}

export function roleSelectionFromMember(member: {
  role: string;
  customRoleId?: number | null;
}): RoleSelection {
  if (member.customRoleId) {
    return { kind: 'custom', id: member.customRoleId };
  }
  return { kind: 'builtin', role: member.role === 'admin' ? 'admin' : 'agent' };
}

/** Resolve defaults for a built-in role or a company custom role (by numeric id). */
export function getSelectedRoleDefaultPermissions(
  selection: RoleSelection,
  rolePermissions: Array<{ role: string; permissions: Record<string, boolean> }>,
  customRoles: Array<{ id: number; permissions: Record<string, boolean> }>
): Record<string, boolean> {
  if (selection.kind === 'custom') {
    const custom = customRoles.find((role) => role.id === selection.id);
    return {
      ...DEFAULT_ROLE_PERMISSIONS.agent,
      ...(custom?.permissions ?? {}),
    };
  }
  return getRoleDefaultPermissions(selection.role, rolePermissions);
}

/** Hydrate custom-mode snapshot from additive team-member payloads. */
export function normalizeCustomPermissionsSnapshot(
  member: {
    customPermissions?: Record<string, boolean>;
    permissions?: Record<string, boolean>;
  }
): Record<string, boolean> {
  const snapshot = member.customPermissions ?? member.permissions;
  return snapshot ? { ...snapshot } : {};
}

export function hasSeededPermissionSnapshot(permissions: Record<string, boolean>): boolean {
  return Object.keys(permissions).length > 0;
}
