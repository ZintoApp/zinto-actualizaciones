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

type KitchenTicket = {
  id: number;
  stationId: number;
  ticketNumber: string;
  status: 'queued' | 'in_progress' | 'ready' | 'served' | 'cancelled';
  priority: 'normal' | 'rush' | 'fire';
  orderContextId: number;
  firedAt: string | null;
};

type KitchenItem = {
  id: number;
  ticketId: number;
  productId?: number | null;
  quantity: string;
  status: string;
  notes?: string | null;
  productName?: string | null;
  description?: string | null;
};

type KitchenStation = {
  id: number;
  name: string;
  sortOrder: number | null;
};

type RestaurantOrderContext = {
  id: number;
  serviceType: string;
};

function minutesSince(ts: string | null): string {
  if (!ts) return '-';
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  return `${Math.floor(diff / 60000)}m`;
}

export default function RestaurantKitchenPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isRestaurant, isLoading: businessTypeLoading } = useErpBusinessType();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!businessTypeLoading && !isRestaurant) setLocation('/erp/dashboard');
  }, [businessTypeLoading, isRestaurant, setLocation]);

  const ticketsQuery = useQuery<KitchenTicket[]>({
    queryKey: ['/api/erp/restaurant/kitchen/tickets', 'kds-board'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/kitchen/tickets?status=queued,in_progress&limit=200');
      const json = await res.json();
      return (json.data?.data ?? []) as KitchenTicket[];
    },
    refetchInterval: 15000,
    enabled: isRestaurant,
  });

  const itemsQuery = useQuery<KitchenItem[]>({
    queryKey: ['/api/erp/restaurant/kitchen/items', 'kds-board'],
    queryFn: async () => {
      const tickets = ticketsQuery.data ?? [];
      const all: KitchenItem[] = [];
      for (const ticket of tickets) {
        const res = await apiRequest('GET', `/api/erp/restaurant/kitchen/tickets/${ticket.id}/items`);
        const json = await res.json();
        all.push(...((json.data ?? []) as KitchenItem[]));
      }
      return all;
    },
    enabled: isRestaurant && (ticketsQuery.data?.length ?? 0) > 0,
  });

  const stationsQuery = useQuery<KitchenStation[]>({
    queryKey: ['/api/erp/restaurant/layout/kitchen-stations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/kitchen-stations');
      const json = await res.json();
      return (json.data ?? []) as KitchenStation[];
    },
    enabled: isRestaurant,
  });

  const contextsQuery = useQuery<RestaurantOrderContext[]>({
    queryKey: ['/api/erp/restaurant/orders', 'kitchen-contexts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/orders?limit=300');
      const json = await res.json();
      return (json.data?.data ?? []) as RestaurantOrderContext[];
    },
    enabled: isRestaurant,
  });

  const mutateTicket = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/erp/restaurant/kitchen/tickets/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/kitchen/tickets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/kitchen/items'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/restaurant/kitchen/tickets/${id}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.restaurant.kitchen.ticketCompleted', 'Ticket completed') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/kitchen/tickets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/kitchen/items'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const contextById = useMemo(
    () => new Map((contextsQuery.data ?? []).map((context) => [context.id, context])),
    [contextsQuery.data],
  );
  const itemsByTicketId = useMemo(() => {
    const map = new Map<number, KitchenItem[]>();
    for (const item of itemsQuery.data ?? []) {
      const list = map.get(item.ticketId) ?? [];
      list.push(item);
      map.set(item.ticketId, list);
    }
    return map;
  }, [itemsQuery.data]);
  const ticketsByStation = useMemo(() => {
    const map = new Map<number, KitchenTicket[]>();
    for (const station of stationsQuery.data ?? []) map.set(station.id, []);
    for (const ticket of ticketsQuery.data ?? []) {
      const list = map.get(ticket.stationId) ?? [];
      list.push(ticket);
      map.set(ticket.stationId, list);
    }
    return map;
  }, [stationsQuery.data, ticketsQuery.data]);

  const isLoading = businessTypeLoading || ticketsQuery.isLoading || stationsQuery.isLoading || contextsQuery.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 data-tour="pages-erp-restaurant-kitchen.h1.erp.restaurant.kitchen.title" className="text-2xl">{t('erp.restaurant.kitchen.title', 'Kitchen Display')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('erp.restaurant.kitchen.subtitle', 'Track queued and in-progress tickets by station.')}
            </p>
          </div>
          <Button data-tour="pages-erp-restaurant-kitchen.button.ui.common.refresh" variant="outline" onClick={() => ticketsQuery.refetch()} disabled={ticketsQuery.isFetching}>
            {t('ui.common.refresh', 'Refresh')}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center rounded-lg border py-20">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('erp.restaurant.kitchen.loadingBoard', 'Loading kitchen board...')}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {(stationsQuery.data ?? []).map((station) => (
              <Card key={station.id} className="min-h-[480px]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{station.name}</span>
                    <Badge variant="secondary">{(ticketsByStation.get(station.id) ?? []).length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 overflow-y-auto">
                  {(ticketsByStation.get(station.id) ?? []).map((ticket) => {
                    const serviceType = contextById.get(ticket.orderContextId)?.serviceType ?? t('ui.common.unknown', 'unknown');
                    const items = itemsByTicketId.get(ticket.id) ?? [];
                    return (
                      <article key={ticket.id} className="rounded-lg border bg-card p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="font-medium">{ticket.ticketNumber || `Ticket #${ticket.id}`}</div>
                          <Badge variant={ticket.priority === 'normal' ? 'outline' : 'default'} className="capitalize">
                            {ticket.priority}
                          </Badge>
                        </div>
                        <div className="mb-2 text-xs text-muted-foreground">
                          {serviceType} · {ticket.status.replace('_', ' ')} · {minutesSince(ticket.firedAt)}
                        </div>
                        <div className="space-y-1 text-sm">
                          {items.map((item) => (
                            <div key={item.id} className="rounded bg-muted/40 px-2 py-1">
                              <div>
                                {item.quantity}x {item.productName ?? item.description ?? t('erp.products.productLabelWithId', 'Product #{{id}}', { id: String(item.productId ?? item.id) })}
                              </div>
                              {item.notes ? (
                                <div className="text-xs text-muted-foreground">{item.notes}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ticket.status === 'queued' ? (
                            <Button data-tour="pages-erp-restaurant-kitchen.button.erp.restaurant.kitchen.start"
                              size="sm"
                              onClick={() => mutateTicket.mutate({ id: ticket.id, body: { status: 'in_progress', firedAt: new Date().toISOString() } })}
                            >
                              {t('erp.restaurant.kitchen.start', 'Start')}
                            </Button>
                          ) : null}
                          {ticket.status === 'in_progress' ? (
                            <Button data-tour="pages-erp-restaurant-kitchen.button.erp.restaurant.kitchen.complete" size="sm" onClick={() => completeMutation.mutate(ticket.id)}>
                              {t('erp.restaurant.kitchen.complete', 'Complete')}
                            </Button>
                          ) : null}
                          <Button data-tour="pages-erp-restaurant-kitchen.button.ui.common.cancel"
                            size="sm"
                            variant="outline"
                            onClick={() => mutateTicket.mutate({ id: ticket.id, body: { status: 'cancelled' } })}
                          >
                            {t('ui.common.cancel', 'Cancel')}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                  {(ticketsByStation.get(station.id) ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {t('erp.restaurant.kitchen.noActiveTickets', 'No active tickets.')}
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
