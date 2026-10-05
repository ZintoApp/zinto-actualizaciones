import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from '@/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

type ErpKpi = {
  revenueLast30Days: number;
  pendingOrders: number;
  overdueInvoices: number;
};

export default function Dashboard() {
  const [_, setLocation] = useLocation();
  const { t } = useTranslation();
  const { hasPermission, hasAnyPermission, PERMISSIONS, isLoading: permissionsLoading } = usePermissions();

  const hasErpAccess =
    hasPermission(PERMISSIONS.VIEW_ERP) || hasPermission(PERMISSIONS.VIEW_ERP_DASHBOARD);
  const canViewErpRevenue = hasAnyPermission([
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.RECORD_PAYMENTS,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
  ]);
  const canViewSalesOrders = hasAnyPermission([
    PERMISSIONS.VIEW_SALES_ORDERS,
    PERMISSIONS.MANAGE_SALES_ORDERS,
    PERMISSIONS.CREATE_QUOTATIONS,
  ]);
  const canViewInvoices = hasAnyPermission([
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.RECORD_PAYMENTS,
  ]);
  const canViewErpSnapshot = canViewErpRevenue || canViewSalesOrders || canViewInvoices;

  const erpKpisQuery = useQuery({
    queryKey: ['/api/erp/dashboard/kpis'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dashboard/kpis');
      const json = await res.json();
      return json.data as ErpKpi;
    },
    enabled: hasErpAccess && canViewErpSnapshot && !permissionsLoading,
  });

  useEffect(() => {
    if (permissionsLoading) return;
    if (!hasErpAccess) {
      setLocation('/inbox');
    }
  }, [permissionsLoading, hasErpAccess, setLocation]);
  
  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-gray-800">
      <Header />
      
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl  mb-6">{t('nav.dashboard', 'Dashboard')}</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.total_conversations', 'Total Conversations')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">15</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.active_conversations', 'Active Conversations')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">8</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.response_time', 'Response Time')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">5m</p>
              </CardContent>
            </Card>
          </div>

          {hasErpAccess && erpKpisQuery.data && canViewErpSnapshot ? (
            <div className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">ERP snapshot</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {canViewErpRevenue ? (
                <Link href="/erp/dashboard">
                  <Card className="transition-colors hover:bg-muted/40 cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-base">Revenue (30d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                          erpKpisQuery.data.revenueLast30Days,
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Open ERP dashboard</p>
                    </CardContent>
                  </Card>
                </Link>
                ) : null}
                {canViewSalesOrders ? (
                <Link href="/erp/sales-orders">
                  <Card className="transition-colors hover:bg-muted/40 cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-base">Pending orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{erpKpisQuery.data.pendingOrders}</p>
                      <p className="text-xs text-muted-foreground mt-1">Sales pipeline</p>
                    </CardContent>
                  </Card>
                </Link>
                ) : null}
                {canViewInvoices ? (
                <Link href="/erp/invoices">
                  <Card className="transition-colors hover:bg-muted/40 cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-base">Overdue invoices</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{erpKpisQuery.data.overdueInvoices}</p>
                      <p className="text-xs text-muted-foreground mt-1">Accounts receivable</p>
                    </CardContent>
                  </Card>
                </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
