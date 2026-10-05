import React from 'react';
import { useLocation } from 'wouter';
import { usePermissions, Permission, ERP_DASHBOARD_ROUTE_PERMISSIONS, ERP_REPORTS_ROUTE_PERMISSIONS } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallbackPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  permission,
  permissions,
  requireAll = false,
  fallbackPath = '/access-denied'
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading: permissionsLoading } = usePermissions();
  const [, setLocation] = useLocation();

  if (authLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation('/auth');
    return null;
  }

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    hasAccess = true;
  }

  if (!hasAccess) {
    setLocation(fallbackPath);
    return null;
  }

  return <>{children}</>;
};

export const withRouteProtection = (
  permission?: Permission,
  permissions?: Permission[],
  requireAll?: boolean,
  fallbackPath?: string
) => {
  return <P extends object>(Component: React.ComponentType<P>) => {
    const ProtectedComponent = (props: P) => {
      return (
        <ProtectedRoute
          permission={permission}
          permissions={permissions}
          requireAll={requireAll}
          fallbackPath={fallbackPath}
        >
          <Component {...props} />
        </ProtectedRoute>
      );
    };

    ProtectedComponent.displayName = `withRouteProtection(${Component.displayName || Component.name})`;

    return ProtectedComponent;
  };
};

export const AdminOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['manage_settings', 'manage_team']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const SettingsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_settings', 'manage_settings']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const AnalyticsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_analytics', 'view_detailed_analytics']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const TeamRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_team', 'manage_team']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const FlowsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_flows', 'manage_flows']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ContactsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_contacts', 'manage_contacts']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const TasksRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_tasks', 'manage_tasks']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const PipelineRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_pipeline', 'manage_pipeline']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CalendarRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_calendar', 'manage_calendar']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ChannelsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_channels', 'manage_channels']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CampaignsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={[
    'view_campaigns',
    'create_campaigns',
    'edit_campaigns',
    'delete_campaigns',
    'manage_templates',
    'manage_segments',
    'view_campaign_analytics',
    'manage_whatsapp_accounts',
    'configure_channels'
  ]} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const PagesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_pages', 'manage_pages']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const TemplatesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['manage_templates']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CallLogsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_call_logs', 'manage_call_logs']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ReportsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_reports', 'view_agent_reports', 'view_response_time_reports']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CapturedDataRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_captured_data', 'manage_captured_data']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPDashboardRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={ERP_DASHBOARD_ROUTE_PERMISSIONS} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPReportsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={ERP_REPORTS_ROUTE_PERMISSIONS} requireAll={false}>
    {children}
  </ProtectedRoute>
);

/** Product catalog & pricing (not inventory pickers). */
export const ERPProductsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_products', 'manage_products']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

/** Warehouses, stock, movements, transfers. */
export const ERPInventoryRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_inventory', 'manage_inventory']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPSalesOrdersRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders', 'create_quotations']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantFloorRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantPOSRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders', 'manage_invoices', 'record_payments']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantReservationsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantDeliveryRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantKitchenRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantDispatchRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'manage_sales_orders']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const RestaurantTableFloorsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_sales_orders', 'view_erp_settings', 'manage_erp_settings']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const DentalPatientsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_dental_patients', 'manage_dental_patients']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const DentalScheduleRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_dental_schedule', 'manage_dental_schedule']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const DentalChartRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_dental_chart', 'edit_dental_chart']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const DentalTreatmentPlansRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute
    permissions={[
      'view_dental_treatment_plans',
      'manage_dental_treatment_plans',
      'create_quotations',
      'manage_sales_orders',
      'view_sales_orders',
      'manage_invoices',
      'view_invoices',
    ]}
    requireAll={false}
  >
    {children}
  </ProtectedRoute>
);

export const ERPSuppliersRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_suppliers', 'manage_suppliers']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPPurchaseOrdersRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_purchase_orders', 'manage_purchase_orders']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPInvoicesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_invoices', 'manage_invoices', 'record_payments']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPAccountingRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_accounting', 'manage_accounting', 'post_journal_entries', 'close_fiscal_year']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPEmployeesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_hr', 'manage_hr']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPHRRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_hr', 'manage_hr', 'approve_leave']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPPayrollRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_payroll', 'manage_payroll']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ERPSettingsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_erp_settings', 'manage_erp_settings']} requireAll={false}>
    {children}
  </ProtectedRoute>
);