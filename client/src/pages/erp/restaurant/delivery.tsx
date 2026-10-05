import Header from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

type DeliveryStatus = 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed';

type DispatchRow = {
  id: number;
  orderContextId: number;
  status: DeliveryStatus;
  assignedToUserId: number | null;
  driverName: string | null;
  driverPhone: string | null;
  providerReference: string | null;
  createdAt: string | null;
};

type OrderContextRow = {
  id: number;
  salesOrderId: number;
  status: string;
  notes: string | null;
};

type TeamMember = {
  id: number;
  fullName: string | null;
  username: string;
};

const COLUMNS: DeliveryStatus[] = ['pending', 'assigned', 'picked_up', 'delivered', 'failed'];
const NEXT_STATUS: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  pending: 'assigned',
  assigned: 'picked_up',
  picked_up: 'delivered',
};

function displayStatus(value: string) {
  return value.replace(/_/g, ' ');
}

function resolveAssignedUserId(value: string | undefined, fallback: number | null): number | null {
  if (value === '__none__') return null;
  if (value != null) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return fallback;
}

export default function RestaurantDeliveryPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isRestaurant, isLoading: businessTypeLoading } = useErpBusinessType();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [driverByDispatchId, setDriverByDispatchId] = useState<Record<number, string>>({});
  const [assigneeByDispatchId, setAssigneeByDispatchId] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!businessTypeLoading && !isRestaurant) {
      setLocation('/erp/dashboard');
    }
  }, [businessTypeLoading, isRestaurant, setLocation]);

  const dispatchesQuery = useQuery<{ data: DispatchRow[]; total: number }>({
    queryKey: ['/api/erp/restaurant/delivery'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/delivery?limit=200');
      const json = await res.json();
      return json.data ?? { data: [], total: 0 };
    },
    enabled: isRestaurant,
  });

  const contextsQuery = useQuery<OrderContextRow[]>({
    queryKey: ['/api/erp/restaurant/orders', 'delivery-contexts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/orders?serviceType=delivery&limit=200');
      const json = await res.json();
      return json.data?.data ?? [];
    },
    enabled: isRestaurant,
  });

  const teamMembersQuery = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members', 'restaurant-delivery'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      return res.json() as Promise<TeamMember[]>;
    },
    enabled: isRestaurant,
  });

  const userNameById = useMemo(
    () => new Map((teamMembersQuery.data ?? []).map((member) => [member.id, member.fullName || member.username])),
    [teamMembersQuery.data]
  );

  const contextById = useMemo(() => new Map((contextsQuery.data ?? []).map((context) => [context.id, context])), [contextsQuery.data]);
  const dispatchesByStatus = useMemo(() => {
    const map = new Map<DeliveryStatus, DispatchRow[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const dispatch of dispatchesQuery.data?.data ?? []) {
      if (map.has(dispatch.status)) map.get(dispatch.status)!.push(dispatch);
    }
    return map;
  }, [dispatchesQuery.data]);

  const updateDispatchMutation = useMutation({
    mutationFn: async ({ salesOrderId, body }: { salesOrderId: number; body: Record<string, unknown> }) => {
      const res = await apiRequest('PUT', `/api/erp/restaurant/delivery/sales-order/${salesOrderId}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.restaurant.delivery.dispatchUpdated', 'Dispatch updated') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/delivery'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const isLoading = businessTypeLoading || dispatchesQuery.isLoading || contextsQuery.isLoading || teamMembersQuery.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <h1 data-tour="pages-erp-restaurant-delivery.h1.erp.restaurant.delivery.title" className="text-2xl">{t('erp.restaurant.delivery.title', 'Delivery Dispatch')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('erp.restaurant.delivery.subtitle', 'Assign drivers and move delivery orders through fulfillment.')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center rounded-lg border py-16">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('erp.restaurant.delivery.loadingBoard', 'Loading delivery board...')}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            {COLUMNS.map((status) => (
              <section key={status} className="rounded-xl border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold capitalize">{displayStatus(status)}</h2>
                  <Badge variant="secondary">{dispatchesByStatus.get(status)?.length ?? 0}</Badge>
                </div>
                <div className="space-y-3">
                  {(dispatchesByStatus.get(status) ?? []).map((dispatch) => {
                    const context = contextById.get(dispatch.orderContextId);
                    const salesOrderId = context?.salesOrderId;
                    const nextStatus = NEXT_STATUS[dispatch.status];
                    return (
                      <article key={dispatch.id} className="rounded-lg border bg-card p-3 shadow-sm">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">
                              {t('erp.restaurant.delivery.orderLabel', 'Order {{order}}', {
                                order: salesOrderId ? `#${salesOrderId}` : t('erp.restaurant.delivery.pending', 'pending'),
                              })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t('erp.restaurant.delivery.dispatchLabel', 'Dispatch #{{id}}', { id: String(dispatch.id) })}
                            </div>
                          </div>
                          <Badge className="capitalize" variant="outline">{displayStatus(dispatch.status)}</Badge>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>{t('erp.restaurant.delivery.address', 'Address')}: {context?.notes ?? t('erp.restaurant.delivery.addressNotSet', 'Delivery address not set')}</div>
                          <div>
                            {t('erp.restaurant.delivery.driver', 'Driver')}: {dispatch.driverName ?? (
                              dispatch.assignedToUserId != null
                                ? userNameById.get(dispatch.assignedToUserId) ?? `#${dispatch.assignedToUserId}`
                                : t('erp.restaurant.delivery.unassigned', 'Unassigned')
                            )}
                          </div>
                          <div>
                            {t('erp.restaurant.delivery.eta', 'ETA')}: {dispatch.createdAt
                              ? new Date(dispatch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : t('erp.restaurant.delivery.tbd', 'TBD')}
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <Input data-tour="pages-erp-restaurant-delivery.input.erp.restaurant.delivery.driverName"
                            placeholder={t('erp.restaurant.delivery.driverName', 'Driver name')}
                            value={driverByDispatchId[dispatch.id] ?? dispatch.driverName ?? ''}
                            onChange={(event) => setDriverByDispatchId((current) => ({ ...current, [dispatch.id]: event.target.value }))}
                          />
                          <Select
                            value={assigneeByDispatchId[dispatch.id] ?? (dispatch.assignedToUserId != null ? String(dispatch.assignedToUserId) : '__none__')}
                            onValueChange={(value) => setAssigneeByDispatchId((current) => ({ ...current, [dispatch.id]: value }))}
                          >
                            <SelectTrigger data-tour="pages-erp-restaurant-delivery.selecttrigger.erp.restaurant.delivery.assignTeamMember">
                              <SelectValue placeholder={t('erp.restaurant.delivery.assignTeamMember', 'Assign to team member')} />
                            </SelectTrigger>
                            <SelectContent searchable>
                              <SelectItem value="__none__">{t('erp.restaurant.delivery.unassigned', 'Unassigned')}</SelectItem>
                              {(teamMembersQuery.data ?? []).map((member) => (
                                <SelectItem key={member.id} value={String(member.id)}>
                                  {member.fullName || member.username}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button data-tour="pages-erp-restaurant-delivery.button.erp.restaurant.delivery.assignDriver"
                              size="sm"
                              variant="outline"
                              disabled={
                                !salesOrderId ||
                                updateDispatchMutation.isPending ||
                                resolveAssignedUserId(assigneeByDispatchId[dispatch.id], dispatch.assignedToUserId) == null
                              }
                              onClick={() => salesOrderId && updateDispatchMutation.mutate({
                                salesOrderId,
                                body: {
                                  driverName: driverByDispatchId[dispatch.id] ?? dispatch.driverName ?? '',
                                  assignedToUserId: resolveAssignedUserId(assigneeByDispatchId[dispatch.id], dispatch.assignedToUserId),
                                  status: 'assigned',
                                  assignedAt: new Date().toISOString(),
                                },
                              })}
                            >
                              {t('erp.restaurant.delivery.assignDriver', 'Assign Driver')}
                            </Button>
                            {nextStatus ? (
                              <Button data-tour="pages-erp-restaurant-delivery.button.erp.restaurant.delivery.markStatus"
                                size="sm"
                                disabled={!salesOrderId || updateDispatchMutation.isPending}
                                onClick={() => salesOrderId && updateDispatchMutation.mutate({
                                  salesOrderId,
                                  body: {
                                    status: nextStatus,
                                    ...(nextStatus === 'picked_up' ? { pickedUpAt: new Date().toISOString() } : {}),
                                    ...(nextStatus === 'delivered' ? { deliveredAt: new Date().toISOString() } : {}),
                                  },
                                })}
                              >
                                {t('erp.restaurant.delivery.markStatus', 'Mark {{status}}', { status: displayStatus(nextStatus) })}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {(dispatchesByStatus.get(status) ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
                      {t('erp.restaurant.delivery.noDispatches', 'No dispatches.')}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
