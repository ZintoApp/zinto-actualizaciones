import Header from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';

type DispatchStatus = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered';

type DispatchRow = {
  id: number;
  orderContextId: number;
  status: DispatchStatus;
  driverName: string | null;
  driverPhone: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
};

type OrderContextRow = {
  id: number;
  salesOrderId: number;
};

const STATUSES: DispatchStatus[] = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered'];
const NEXT_STATUS: Partial<Record<DispatchStatus, DispatchStatus>> = {
  pending: 'assigned',
  assigned: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
};

export default function RestaurantDispatchPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isRestaurant, isLoading: businessTypeLoading } = useErpBusinessType();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!businessTypeLoading && !isRestaurant) setLocation('/erp/dashboard');
  }, [businessTypeLoading, isRestaurant, setLocation]);

  const dispatchesQuery = useQuery<DispatchRow[]>({
    queryKey: ['/api/erp/restaurant/delivery', 'dispatch-board'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/delivery?limit=200');
      const json = await res.json();
      return (json.data?.data ?? []) as DispatchRow[];
    },
    refetchInterval: 20000,
    enabled: isRestaurant,
  });

  const contextsQuery = useQuery<OrderContextRow[]>({
    queryKey: ['/api/erp/restaurant/orders', 'dispatch-contexts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/orders?serviceType=delivery&limit=300');
      const json = await res.json();
      return (json.data?.data ?? []) as OrderContextRow[];
    },
    enabled: isRestaurant,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ salesOrderId, status }: { salesOrderId: number; status: DispatchStatus }) => {
      const res = await apiRequest('PUT', `/api/erp/restaurant/delivery/sales-order/${salesOrderId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/delivery'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const contextById = useMemo(
    () => new Map((contextsQuery.data ?? []).map((context) => [context.id, context])),
    [contextsQuery.data],
  );

  const byStatus = useMemo(() => {
    const map = new Map<DispatchStatus, DispatchRow[]>();
    for (const status of STATUSES) map.set(status, []);
    for (const row of dispatchesQuery.data ?? []) {
      if (map.has(row.status)) map.get(row.status)!.push(row);
    }
    return map;
  }, [dispatchesQuery.data]);

  const isLoading = businessTypeLoading || dispatchesQuery.isLoading || contextsQuery.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 data-tour="pages-erp-restaurant-dispatch.h1.erp.restaurant.dispatch.title" className="text-2xl">{t('erp.restaurant.dispatch.title', 'Dispatch Board')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('erp.restaurant.dispatch.subtitle', 'Track delivery assignment and completion states.')}
            </p>
          </div>
          <Button data-tour="pages-erp-restaurant-dispatch.button.ui.common.refresh" variant="outline" onClick={() => dispatchesQuery.refetch()} disabled={dispatchesQuery.isFetching}>
            {t('ui.common.refresh', 'Refresh')}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center rounded-lg border py-20">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('erp.restaurant.dispatch.loadingBoard', 'Loading dispatch board...')}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            {STATUSES.map((status) => (
              <Card key={status} className="min-h-[460px]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base capitalize">
                    <span>{status.replace('_', ' ')}</span>
                    <Badge variant="secondary">{(byStatus.get(status) ?? []).length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(byStatus.get(status) ?? []).map((dispatch) => {
                    const salesOrderId = contextById.get(dispatch.orderContextId)?.salesOrderId;
                    const nextStatus = NEXT_STATUS[dispatch.status];
                    return (
                      <article key={dispatch.id} className="rounded-lg border bg-card p-3">
                        <div className="mb-1 font-medium">
                          {t('erp.restaurant.dispatch.orderLabel', 'Order {{order}}', { order: salesOrderId ? `#${salesOrderId}` : '-' })}
                        </div>
                        <div className="mb-2 text-xs text-muted-foreground">
                          {t('erp.restaurant.dispatch.dispatchLabel', 'Dispatch #{{id}}', { id: String(dispatch.id) })}
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>{t('erp.restaurant.dispatch.driver', 'Driver')}: {dispatch.driverName ?? t('erp.restaurant.dispatch.unassigned', 'Unassigned')}</div>
                          <div>{t('erp.restaurant.dispatch.phone', 'Phone')}: {dispatch.driverPhone ?? '-'}</div>
                          <div>
                            {t('erp.restaurant.dispatch.times', 'Times')}: {dispatch.assignedAt ? new Date(dispatch.assignedAt).toLocaleTimeString() : '-'} /{' '}
                            {dispatch.pickedUpAt ? new Date(dispatch.pickedUpAt).toLocaleTimeString() : '-'} /{' '}
                            {dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleTimeString() : '-'}
                          </div>
                        </div>
                        {nextStatus && salesOrderId ? (
                          <Button data-tour="pages-erp-restaurant-dispatch.button.erp.restaurant.dispatch.markStatus"
                            size="sm"
                            className="mt-3"
                            onClick={() => updateMutation.mutate({ salesOrderId, status: nextStatus })}
                          >
                            {t('erp.restaurant.dispatch.markStatus', 'Mark {{status}}', { status: nextStatus.replace('_', ' ') })}
                          </Button>
                        ) : null}
                      </article>
                    );
                  })}
                  {(byStatus.get(status) ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {t('erp.restaurant.dispatch.noDispatches', 'No dispatches.')}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
