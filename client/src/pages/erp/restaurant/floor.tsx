import Header from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { apiRequest } from '@/lib/queryClient';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { usePermissions } from '@/hooks/usePermissions';

type SectionRow = {
  id: number;
  name: string;
  code: string;
  sortOrder: number | null;
  isActive: boolean | null;
};

type TableRow = {
  id: number;
  sectionId: number | null;
  label: string;
  code: string;
  capacity: number;
  sortOrder: number | null;
  isActive: boolean | null;
  posX?: number | null;
  posY?: number | null;
  layoutWidth?: number | null;
  layoutHeight?: number | null;
  rotation?: number | null;
  tableShape?: string | null;
  tableType?: string | null;
};

type OrderContextRow = {
  id: number;
  salesOrderId: number;
  tableId: number | null;
  serviceType: string;
  status: string;
  guestCount: number | null;
  notes: string | null;
  createdAt: string | null;
};

const ACTIVE_ORDER_STATUSES = ['open', 'submitted', 'in_preparation', 'ready'];
const NEXT_STATUS: Record<string, string> = {
  open: 'submitted',
  submitted: 'in_preparation',
  in_preparation: 'ready',
  ready: 'completed',
};
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 560;

function statusLabel(status?: string) {
  return (status ?? 'available').replace(/_/g, ' ');
}

export default function RestaurantFloorPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const { isRestaurant, isLoading: businessTypeLoading } = useErpBusinessType();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!businessTypeLoading && !isRestaurant) {
      setLocation('/erp/dashboard');
    }
  }, [businessTypeLoading, isRestaurant, setLocation]);

  const sectionsQuery = useQuery<SectionRow[]>({
    queryKey: ['/api/erp/restaurant/layout/sections'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/sections');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isRestaurant,
  });

  const tablesQuery = useQuery<TableRow[]>({
    queryKey: ['/api/erp/restaurant/layout/tables'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/tables');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isRestaurant,
  });

  const ordersQuery = useQuery<OrderContextRow[]>({
    queryKey: ['/api/erp/restaurant/orders', 'floor-active'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/orders?limit=200');
      const json = await res.json();
      return json.data?.data ?? [];
    },
    enabled: isRestaurant,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ salesOrderId, status }: { salesOrderId: number; status: string }) => {
      const res = await apiRequest('PUT', `/api/erp/restaurant/orders/sales-order/${salesOrderId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.restaurant.floor.tableStatusUpdated', 'Table status updated') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/orders'] });
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const activeOrderByTable = useMemo(() => {
    const map = new Map<number, OrderContextRow>();
    for (const order of ordersQuery.data ?? []) {
      if (order.tableId == null || !ACTIVE_ORDER_STATUSES.includes(order.status)) continue;
      const existing = map.get(order.tableId);
      if (!existing || new Date(order.createdAt ?? 0) > new Date(existing.createdAt ?? 0)) {
        map.set(order.tableId, order);
      }
    }
    return map;
  }, [ordersQuery.data]);

  const selectedTable = (tablesQuery.data ?? []).find((table) => table.id === selectedTableId) ?? null;
  const selectedSection = selectedTable
    ? (sectionsQuery.data ?? []).find((section) => section.id === selectedTable.sectionId) ?? null
    : null;
  const selectedOrder = selectedTable ? activeOrderByTable.get(selectedTable.id) ?? null : null;
  const selectedOrderNextStatus = selectedOrder ? NEXT_STATUS[selectedOrder.status] : null;
  const selectedSectionIsActive = selectedSection ? selectedSection.isActive !== false : true;
  const isLoading = businessTypeLoading || sectionsQuery.isLoading || tablesQuery.isLoading || ordersQuery.isLoading;
  const canManageLayouts = hasPermission(PERMISSIONS.MANAGE_ERP_SETTINGS);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 data-tour="pages-erp-restaurant-floor.h1.erp.restaurant.floor.title" className="text-2xl">{t('erp.restaurant.floor.title', 'Floor Plan')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('erp.restaurant.floor.subtitle', 'Track table service and move active orders through service statuses.')}
            </p>
          </div>
          <Button data-tour="pages-erp-restaurant-floor.button.ui.common.refresh"
            variant="outline"
            onClick={() => {
              sectionsQuery.refetch();
              tablesQuery.refetch();
              ordersQuery.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('ui.common.refresh', 'Refresh')}
          </Button>
          {canManageLayouts ? (
            <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.manageLayouts" variant="outline" onClick={() => setLocation('/erp/restaurant/table-floors')}>
              {t('erp.restaurant.floor.manageLayouts', 'Manage Table/Floors')}
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center rounded-lg border py-16">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('erp.restaurant.floor.loading', 'Loading floor...')}
          </div>
        ) : (
          <div className="space-y-6">
            {(sectionsQuery.data ?? [])
              .filter((section) => section.isActive !== false)
              .map((section) => {
              const sectionTables = (tablesQuery.data ?? [])
                .filter((table) => table.sectionId === section.id && table.isActive !== false)
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
              const hasSavedLayout = sectionTables.length > 0 && sectionTables.every((table) => table.posX != null && table.posY != null);
              return (
                <section key={section.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{section.name}</h2>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{section.code}</p>
                    </div>
                    <Badge variant="secondary">
                      {t('erp.restaurant.floor.tablesCount', '{{count}} tables', { count: String(sectionTables.length) })}
                    </Badge>
                  </div>
                  {hasSavedLayout ? (
                    <div className="overflow-auto rounded-lg border bg-muted/20">
                      <div className="relative min-w-[1200px]" style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }}>
                      {sectionTables.map((table) => {
                        const order = activeOrderByTable.get(table.id);
                        const nextStatus = order ? NEXT_STATUS[order.status] : null;
                        return (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() => setSelectedTableId(table.id)}
                            className="absolute border bg-background px-2 py-1 text-left text-xs shadow-sm"
                            style={{
                              left: `${table.posX ?? 24}px`,
                              top: `${table.posY ?? 24}px`,
                              width: `${table.layoutWidth ?? 96}px`,
                              height: `${table.layoutHeight ?? 60}px`,
                              transform: `rotate(${table.rotation ?? 0}deg)`,
                              borderRadius: table.tableShape === 'circle' ? '999px' : '6px',
                            }}
                          >
                            <div className="truncate font-medium">{table.label}</div>
                            <div className="truncate text-[10px] text-muted-foreground">{statusLabel(order?.status)}</div>
                            {order && nextStatus ? (
                              <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.markStatus"
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-2 h-6 px-2 text-[10px]"
                                disabled={updateStatusMutation.isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateStatusMutation.mutate({ salesOrderId: order.salesOrderId, status: nextStatus });
                                }}
                              >
                                {t('erp.restaurant.floor.markStatus', 'Mark {{status}}', { status: statusLabel(nextStatus) })}
                              </Button>
                            ) : null}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                    {sectionTables.map((table) => {
                      const order = activeOrderByTable.get(table.id);
                      const nextStatus = order ? NEXT_STATUS[order.status] : null;
                      return (
                        <button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.capacity"
                          key={table.id}
                          type="button"
                          onClick={() => setSelectedTableId(table.id)}
                          className="rounded-lg border bg-background p-4 text-left transition hover:border-primary hover:shadow-sm"
                        >
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{table.label}</div>
                              <div className="text-xs text-muted-foreground">{table.code}</div>
                            </div>
                            <Badge className="capitalize" variant={order ? 'default' : 'outline'}>
                              {statusLabel(order?.status)}
                            </Badge>
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Users className="mr-2 h-4 w-4" />
                            {t('erp.restaurant.floor.capacity', 'Capacity {{capacity}}', { capacity: String(table.capacity) })}
                          </div>
                          {order && nextStatus ? (
                            <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.markStatus"
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-4 w-full"
                              disabled={updateStatusMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateStatusMutation.mutate({ salesOrderId: order.salesOrderId, status: nextStatus });
                              }}
                            >
                              {t('erp.restaurant.floor.markStatus', 'Mark {{status}}', { status: statusLabel(nextStatus) })}
                            </Button>
                          ) : null}
                        </button>
                      );
                    })}
                    {sectionTables.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                        {t('erp.restaurant.floor.noActiveTablesInSection', 'No active tables in this section.')}
                      </div>
                    ) : null}
                    </div>
                  )}
                </section>
              );
            })}
            {(sectionsQuery.data ?? []).some((section) => section.isActive === false) ? (
              <section className="rounded-xl border border-dashed bg-muted/20 p-4">
                <h2 data-tour="pages-erp-restaurant-floor.h2.erp.restaurant.floor.closedFloors" className="text-sm font-medium">{t('erp.restaurant.floor.closedFloors', 'Closed floors')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('erp.restaurant.floor.closedFloorsHint', 'Closed floors are hidden from service and cannot start new orders.')}
                </p>
              </section>
            ) : null}
          </div>
        )}
      </main>

      <Sheet open={!!selectedTable} onOpenChange={(open) => !open && setSelectedTableId(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedTable?.label ?? t('erp.restaurant.floor.table', 'Table')}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('erp.common.status', 'Status')}</span>
                <Badge className="capitalize" variant={selectedOrder ? 'default' : 'outline'}>
                  {statusLabel(selectedOrder?.status)}
                </Badge>
              </div>
              <div className="text-sm">{t('erp.restaurant.floor.capacityLabel', 'Capacity')}: {selectedTable?.capacity ?? '-'}</div>
              {selectedOrder ? (
                <div className="mt-3 text-sm text-muted-foreground">
                  {t('erp.restaurant.floor.activeOrder', 'Active order #{{id}}', { id: String(selectedOrder.salesOrderId) })}
                  {selectedOrder.guestCount
                    ? t('erp.restaurant.floor.guestSuffix', ', {{count}} guests', { count: String(selectedOrder.guestCount) })
                    : ''}
                </div>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">{t('erp.restaurant.floor.noActiveOrderOnTable', 'No active order on this table.')}</div>
              )}
            </div>
            <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.floorClosed"
              className="w-full"
              disabled={!!selectedOrder || !selectedSectionIsActive}
              onClick={() => selectedTable && selectedSectionIsActive && setLocation(`/erp/restaurant/pos?tableId=${selectedTable.id}`)}
            >
              {!selectedSectionIsActive
                ? t('erp.restaurant.floor.floorClosed', 'Floor closed')
                : selectedOrder
                ? t('erp.restaurant.floor.tableOccupied', 'Table occupied')
                : t('erp.restaurant.floor.newOrder', 'New Order')}
            </Button>
            {selectedOrder ? (
              <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.markStatus"
                variant="outline"
                className="w-full"
                disabled={!selectedOrderNextStatus || updateStatusMutation.isPending}
                onClick={() => {
                  if (!selectedOrderNextStatus) return;
                  updateStatusMutation.mutate({ salesOrderId: selectedOrder.salesOrderId, status: selectedOrderNextStatus });
                }}
              >
                {selectedOrderNextStatus
                  ? t('erp.restaurant.floor.markStatus', 'Mark {{status}}', { status: statusLabel(selectedOrderNextStatus) })
                  : t('erp.restaurant.floor.tableOccupied', 'Table occupied')}
              </Button>
            ) : null}
            {selectedOrder ? (
              <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.viewOrder" variant="outline" className="w-full" asChild>
                <Link href={`/erp/sales-orders?detail=${selectedOrder.salesOrderId}`}>{t('erp.restaurant.floor.viewOrder', 'View Order')}</Link>
              </Button>
            ) : null}
            {selectedOrder ? (
              <Button data-tour="pages-erp-restaurant-floor.button.erp.restaurant.floor.continueOrder"
                variant="outline"
                className="w-full"
                onClick={() =>
                  setLocation(`/erp/restaurant/pos?salesOrderId=${selectedOrder.salesOrderId}`)
                }
              >
                {t('erp.restaurant.floor.continueOrder', 'Continue in POS')}
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
