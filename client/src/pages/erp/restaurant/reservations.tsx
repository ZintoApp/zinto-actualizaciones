import Header from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  CalendarCheck as TabIconCalendarCheck,
  Clock as TabIconClock,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

type ReservationStatus = 'booked' | 'seated' | 'completed' | 'cancelled' | 'no_show';
type WaitlistStatus = 'waiting' | 'notified' | 'seated' | 'left';

type ReservationRow = {
  id: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestCount: number;
  tableId: number | null;
  status: ReservationStatus;
  reservationAt: string;
};

type WaitlistRow = {
  id: number;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  targetTableId: number | null;
  quotedWaitMinutes: number | null;
  status: WaitlistStatus;
  createdAt: string | null;
};

type TableRow = {
  id: number;
  label: string;
  isActive: boolean | null;
};

const RESERVATION_STATUSES: ReservationStatus[] = ['booked', 'seated', 'completed', 'cancelled', 'no_show'];
const WAITLIST_STATUSES: WaitlistStatus[] = ['waiting', 'notified', 'seated', 'left'];

function displayStatus(value: string) {
  return value.replace(/_/g, ' ');
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function RestaurantReservationsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isRestaurant, isLoading: businessTypeLoading } = useErpBusinessType();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayInputValue());
  const [newReservationOpen, setNewReservationOpen] = useState(false);
  const [form, setForm] = useState({
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    guestCount: '2',
    reservationAt: `${todayInputValue()}T19:00`,
    tableId: '',
  });

  useEffect(() => {
    if (!businessTypeLoading && !isRestaurant) {
      setLocation('/erp/dashboard');
    }
  }, [businessTypeLoading, isRestaurant, setLocation]);

  const tablesQuery = useQuery<TableRow[]>({
    queryKey: ['/api/erp/restaurant/layout/tables', 'reservations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/tables');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isRestaurant,
  });

  const reservationsQuery = useQuery<{ data: ReservationRow[]; total: number }>({
    queryKey: ['/api/erp/restaurant/reservations/reservations', date],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      const res = await apiRequest('GET', `/api/erp/restaurant/reservations/reservations?${params.toString()}`);
      const json = await res.json();
      return json.data ?? { data: [], total: 0 };
    },
    enabled: isRestaurant,
  });

  const waitlistQuery = useQuery<{ data: WaitlistRow[]; total: number }>({
    queryKey: ['/api/erp/restaurant/reservations/waitlist'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/reservations/waitlist?limit=100');
      const json = await res.json();
      return json.data ?? { data: [], total: 0 };
    },
    enabled: isRestaurant,
  });

  const tableById = useMemo(() => new Map((tablesQuery.data ?? []).map((table) => [table.id, table])), [tablesQuery.data]);
  const filteredReservations = useMemo(
    () => (reservationsQuery.data?.data ?? []).filter((row) => row.reservationAt.slice(0, 10) === date),
    [date, reservationsQuery.data]
  );

  const updateReservationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: ReservationStatus }) => {
      const body: Record<string, unknown> = { status };
      if (status === 'seated') body.seatedAt = new Date().toISOString();
      if (status === 'completed') body.completedAt = new Date().toISOString();
      if (status === 'cancelled') body.cancelledAt = new Date().toISOString();
      const res = await apiRequest('PUT', `/api/erp/restaurant/reservations/reservations/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.restaurant.reservations.toast.reservationUpdated', 'Reservation updated') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/reservations/reservations'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const updateWaitlistMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: WaitlistStatus }) => {
      const body: Record<string, unknown> = { status };
      if (status === 'seated') body.seatedAt = new Date().toISOString();
      if (status === 'left') body.leftAt = new Date().toISOString();
      const res = await apiRequest('PUT', `/api/erp/restaurant/reservations/waitlist/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.restaurant.reservations.toast.waitlistUpdated', 'Waitlist updated') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/reservations/waitlist'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/restaurant/reservations/reservations', {
        guestName: form.guestName,
        guestPhone: form.guestPhone,
        guestEmail: form.guestEmail || null,
        guestCount: Number(form.guestCount) || 1,
        reservationAt: new Date(form.reservationAt).toISOString(),
        tableId: form.tableId ? Number(form.tableId) : null,
        expectedDurationMinutes: 90,
        status: 'booked',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.restaurant.reservations.toast.reservationCreated', 'Reservation created') });
      setNewReservationOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/restaurant/reservations/reservations'] });
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const isLoading = businessTypeLoading || reservationsQuery.isLoading || waitlistQuery.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 data-tour="pages-erp-restaurant-reservations.h1.erp.restaurant.reservations.title" className="text-2xl">{t('erp.restaurant.reservations.title', 'Reservations & Waitlist')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('erp.restaurant.reservations.subtitle', 'Manage booked guests and seat waitlist parties.')}
            </p>
          </div>
          <Button data-tour="pages-erp-restaurant-reservations.button.erp.restaurant.reservations.newReservation" onClick={() => setNewReservationOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('erp.restaurant.reservations.newReservation', 'New Reservation')}
          </Button>
        </div>

        <Tabs defaultValue="reservations" className="space-y-4">
          <TabsList>
            <TabsTrigger icon={TabIconCalendarCheck} data-tour="pages-erp-restaurant-reservations.tabstrigger.reservations" value="reservations">{t('erp.restaurant.reservations.tabReservations', 'Reservations')}</TabsTrigger>
            <TabsTrigger icon={TabIconClock} data-tour="pages-erp-restaurant-reservations.tabstrigger.waitlist" value="waitlist">{t('erp.restaurant.reservations.tabWaitlist', 'Waitlist')}</TabsTrigger>
          </TabsList>
          <TabsContent data-tour="pages-erp-restaurant-reservations.tabscontent.reservations" value="reservations" className="rounded-xl border bg-card p-4">
            <div className="mb-4 max-w-xs">
              <Label>{t('erp.common.date', 'Date')}</Label>
              <Input data-tour="pages-erp-restaurant-reservations.input.erp.common.date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('erp.restaurant.reservations.loadingReservations', 'Loading reservations...')}
              </div>
            ) : (
              <Table data-tour="pages-erp-restaurant-reservations.table.erp.restaurant.reservations.table.guest">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('erp.restaurant.reservations.table.guest', 'Guest')}</TableHead>
                    <TableHead>{t('erp.restaurant.reservations.table.party', 'Party')}</TableHead>
                    <TableHead>{t('erp.restaurant.reservations.table.time', 'Time')}</TableHead>
                    <TableHead>{t('erp.restaurant.reservations.table.table', 'Table')}</TableHead>
                    <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReservations.map((reservation) => (
                    <TableRow key={reservation.id}>
                      <TableCell>
                        <div className="font-medium">{reservation.guestName}</div>
                        <div className="text-xs text-muted-foreground">{reservation.guestPhone}</div>
                      </TableCell>
                      <TableCell>{reservation.guestCount}</TableCell>
                      <TableCell>{new Date(reservation.reservationAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell>
                        {reservation.tableId
                          ? tableById.get(reservation.tableId)?.label ?? `#${reservation.tableId}`
                          : t('erp.restaurant.reservations.unassigned', 'Unassigned')}
                      </TableCell>
                      <TableCell>
                        <Select value={reservation.status} onValueChange={(status) => updateReservationMutation.mutate({ id: reservation.id, status: status as ReservationStatus })}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RESERVATION_STATUSES.map((status) => <SelectItem key={status} value={status}>{displayStatus(status)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredReservations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {t('erp.restaurant.reservations.noReservationsForDate', 'No reservations for this date.')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </TabsContent>
          <TabsContent data-tour="pages-erp-restaurant-reservations.tabscontent.waitlist" value="waitlist" className="rounded-xl border bg-card p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(waitlistQuery.data?.data ?? []).map((entry) => (
                <div key={entry.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{entry.guestName}</div>
                      <div className="text-sm text-muted-foreground">
                        {t('erp.restaurant.reservations.guests', '{{count}} guests', { count: String(entry.guestCount) })}
                      </div>
                    </div>
                    <Badge className="capitalize" variant={entry.status === 'waiting' ? 'default' : 'secondary'}>{displayStatus(entry.status)}</Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>
                      {t('erp.restaurant.reservations.waitTime', 'Wait time')}: {entry.quotedWaitMinutes ?? 0} {t('erp.common.minutes', 'minutes')}
                    </div>
                    <div>
                      {t('erp.restaurant.reservations.targetTable', 'Target table')}: {
                        entry.targetTableId
                          ? tableById.get(entry.targetTableId)?.label ?? `#${entry.targetTableId}`
                          : t('erp.restaurant.reservations.any', 'Any')
                      }
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button data-tour="pages-erp-restaurant-reservations.button.erp.restaurant.reservations.seatNow" size="sm" onClick={() => updateWaitlistMutation.mutate({ id: entry.id, status: 'seated' })}>
                      {t('erp.restaurant.reservations.seatNow', 'Seat Now')}
                    </Button>
                    <Select value={entry.status} onValueChange={(status) => updateWaitlistMutation.mutate({ id: entry.id, status: status as WaitlistStatus })}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WAITLIST_STATUSES.map((status) => <SelectItem key={status} value={status}>{displayStatus(status)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              {(waitlistQuery.data?.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {t('erp.restaurant.reservations.noWaitlistEntries', 'No waitlist entries.')}
                </div>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={newReservationOpen} onOpenChange={setNewReservationOpen}>
        <DialogContent data-tour="pages-erp-restaurant-reservations.dialogcontent.erp.restaurant.reservations.newReservation">
          <DialogHeader><DialogTitle>{t('erp.restaurant.reservations.newReservation', 'New Reservation')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label>{t('erp.restaurant.reservations.form.guestName', 'Guest name')}</Label><Input data-tour="pages-erp-restaurant-reservations.input.erp.restaurant.reservations.form.guestName" value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} /></div>
            <div><Label>{t('erp.restaurant.reservations.form.contactPhone', 'Contact phone')}</Label><LocalizedPhoneInput value={form.guestPhone} onChange={(guestPhone) => setForm({ ...form, guestPhone })} /></div>
            <div><Label>{t('erp.restaurant.reservations.form.email', 'Email')}</Label><Input data-tour="pages-erp-restaurant-reservations.input.erp.restaurant.reservations.form.guestName" value={form.guestEmail} onChange={(event) => setForm({ ...form, guestEmail: event.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>{t('erp.restaurant.reservations.form.partySize', 'Party size')}</Label><Input data-tour="pages-erp-restaurant-reservations.input.erp.restaurant.reservations.form.partySize" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: event.target.value })} /></div>
              <div><Label>{t('erp.restaurant.reservations.form.dateTime', 'Date/time')}</Label><Input data-tour="pages-erp-restaurant-reservations.input.erp.restaurant.reservations.form.partySize" type="datetime-local" value={form.reservationAt} onChange={(event) => setForm({ ...form, reservationAt: event.target.value })} /></div>
            </div>
            <div>
              <Label>{t('erp.restaurant.reservations.form.preferredTable', 'Preferred table')}</Label>
              <Select value={form.tableId || 'none'} onValueChange={(value) => setForm({ ...form, tableId: value === 'none' ? '' : value })}>
                <SelectTrigger data-tour="pages-erp-restaurant-reservations.selecttrigger.erp.restaurant.reservations.form.selectTable"><SelectValue placeholder={t('erp.restaurant.reservations.form.selectTable', 'Select table')} /></SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="none">{t('erp.restaurant.reservations.form.noPreference', 'No preference')}</SelectItem>
                  {(tablesQuery.data ?? []).filter((table) => table.isActive !== false).map((table) => <SelectItem key={table.id} value={String(table.id)}>{table.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-restaurant-reservations.button.ui.common.cancel" variant="outline" onClick={() => setNewReservationOpen(false)}>{t('ui.common.cancel', 'Cancel')}</Button>
            <Button data-tour="pages-erp-restaurant-reservations.button.ui.common.create" onClick={() => createReservationMutation.mutate()} disabled={createReservationMutation.isPending}>
              {createReservationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('ui.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
