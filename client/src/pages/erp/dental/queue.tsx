import { emitTourSignal } from '@/components/guided-tours/signals';
import { useQuickAction } from '@/hooks/use-quick-action';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Plus, Settings2, Printer } from 'lucide-react';
import { type QueueOptions, type QueueSnapshot, type QueueTurn } from '@shared/types/dental-queue';
import { DentalShellPage } from './dental-shell';
import { queueDate, queueRequest, QUEUE_API } from '@/components/erp/dental/queue-api';
import { useQueueText, queueStatusErrorKeys } from '@/components/erp/dental/queue-text';
import { QueueSettings } from '@/components/erp/dental/QueueSettings';
import { QueueSelect } from '@/components/erp/dental/QueueSelect';
import { QueueReceptionBoard } from '@/components/erp/dental/QueueReceptionBoard';
import { QueueDigitalTicketButton } from '@/components/erp/dental/QueueDigitalTicket';
import { QueuePatientSelect } from '@/components/erp/dental/QueuePatientSelect';
import { AddDentalPatientDialog } from '@/components/erp/dental/AddDentalPatientDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';

const ticketHref = (id: number) => `/erp/dental/queue/ticket/${id}`;
type IssueForm = { appointmentId: string; contactId: string; patientName: string; providerUserId: string; chairId: string; serviceKey: string };
const blankForm = (): IssueForm => ({ appointmentId: '', contactId: '', patientName: '', providerUserId: '', chairId: '', serviceKey: '' });

export default function DentalQueuePage() {
  const { q, locale } = useQueueText();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const canRegister = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const { toast } = useToast();
  const client = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [mode, setMode] = useState<'appointment' | 'walkIn'>('appointment');
  const [form, setForm] = useState<IssueForm>(blankForm);
  const [lastIssued, setLastIssued] = useState<QueueTurn | null>(null);
  const [formError, setFormError] = useState('');
  const requests = useRef(new Map<string, string>());
  const initialAppointment = useRef(new URLSearchParams(window.location.search).get('appointmentId'));
  const snapshot = useQuery({ queryKey: [QUEUE_API], queryFn: () => queueRequest<QueueSnapshot>(), refetchInterval: 2000, refetchIntervalInBackground: false, retry: false });
  const options = useQuery({ queryKey: [QUEUE_API, 'options'], queryFn: () => queueRequest<QueueOptions>('/options'), refetchInterval: 10000, retry: false });
  const appointment = options.data?.appointments.find(a => String(a.id) === form.appointmentId);
  const fillAppointment = (id: string) => {
    const a = options.data?.appointments.find(a => String(a.id) === id);
    setForm(a ? { appointmentId: id, contactId: String(a.contactId), patientName: a.patientName, providerUserId: a.providerUserId ? String(a.providerUserId) : '', chairId: a.chairId ? String(a.chairId) : '', serviceKey: a.serviceKey || '' } : blankForm());
    setFormError('');
  };
  useEffect(() => {
    if (!options.data || !initialAppointment.current || !canManage) return;
    const id = initialAppointment.current; initialAppointment.current = null;
    fillAppointment(id); setMode('appointment'); setIssueOpen(true);
  }, [options.data, canManage]);

  const mutation = useMutation({
    mutationFn: async ({ path, body, method = 'POST' }: { path: string; body: Record<string, unknown>; method?: 'POST' | 'PATCH' }) => {
      const key = JSON.stringify({ path, body });
      const requestId = requests.current.get(key) || crypto.randomUUID();
      requests.current.set(key, requestId);
      try {
        const result = await queueRequest<QueueTurn | null>(path, method, { ...body, requestId });
        requests.current.delete(key); return result;
      } catch (error: any) {
        if (error.status >= 400 && error.status < 500) requests.current.delete(key);
        if (method === 'PATCH' && queueStatusErrorKeys[error.errorCode]) error.message = q(queueStatusErrorKeys[error.errorCode]);
        throw error;
      }
    },
    onSuccess: async (turn, args) => {
      if (args.path === '/turns' && turn) emitTourSignal('queue-updated', turn.id);
      const refreshed = client.invalidateQueries({ queryKey: [QUEUE_API] });
      if (args.method === 'PATCH') await refreshed;
      setFormError('');
      if (args.path === '/turns' && turn) { setLastIssued(turn); setIssueOpen(false); toast({ title: q('issuedSuccess') }); }
      if (args.method === 'PATCH' && turn) toast({ title: q('statusUpdated', { ticket: turn.number, status: q(turn.status) }) });
      if (args.path === '/next' && !turn) toast({ title: q('noEligible') });
    },
    onError: error => { setFormError(error.message); toast({ title: q('error'), description: error.message, variant: 'destructive' }); void client.invalidateQueries({ queryKey: [QUEUE_API] }); },
  });
  const data = snapshot.data;
  const allTurns = data?.turns || [];
  const activePatients = new Set(allTurns.filter(t => ['waiting', 'called', 'in_service', 'skipped'].includes(t.status)).map(t => t.contactId));
  const selectedProvider = options.data?.providers.find(p => String(p.id) === form.providerUserId);
  const rooms = options.data?.rooms.filter(r => !selectedProvider?.chairIds.length || selectedProvider.chairIds.includes(r.id)) || [];
  const services = options.data?.services.filter(s => !selectedProvider?.specialtyIds.length || selectedProvider.specialtyIds.includes(s.specialtyId)) || [];
  const setupMissing = options.data && (!options.data.providers.length || !options.data.rooms.length || !options.data.services.length);
  const stale = !!snapshot.error;
  const denied = [401, 403].includes((snapshot.error as any)?.status);
  useQuickAction('check-in', { open: issueOpen, onOpen: () => { setForm(blankForm()); setFormError(''); setIssueOpen(true); }, ready: !options.isLoading, unavailable: !!options.error || !!setupMissing });

  if (denied) return <DentalShellPage title={q('title')} description={q('sessionExpired')} />;
  return <DentalShellPage title={q('title')} description={q('receptionDescription')} contentClassName="queue-reception-page" actions={<>
    <Button asChild variant="outline"><a href="/erp/dental/queue/display" target="_blank" rel="noreferrer"><Monitor className="mr-2 h-4 w-4" />{q('openTV')}</a></Button>
    {canManage && <><Button variant="outline" onClick={() => setSettingsOpen(!settingsOpen)} disabled={!data}><Settings2 className="mr-2 h-4 w-4" />{q('settings')}</Button><Button data-tour="queue-check-in" disabled={!options.data} onClick={() => { setForm(blankForm()); setFormError(''); setIssueOpen(true); }}><Plus className="mr-2 h-4 w-4" />{q('checkIn')}</Button></>}
  </>}>
    {(snapshot.error || options.error) && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">{(snapshot.error || options.error)?.message}<Button size="sm" variant="ghost" onClick={() => void client.invalidateQueries({ queryKey: [QUEUE_API] })}>{q('retry')}</Button></div>}
    {setupMissing && <p className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-950">{q('setup')} <a className="underline" href="/erp/dental/booking-settings">{q('bookingSettings')}</a></p>}
    {settingsOpen && data && canManage && <QueueSettings display={data.display} onClose={() => setSettingsOpen(false)} />}
    {lastIssued && lastIssued.day === data?.display.day && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><div><strong className="mr-3 text-xl">{lastIssued.number}</strong><span>{lastIssued.patientName} · {lastIssued.chairName}</span></div><div className="flex flex-wrap gap-2"><QueueDigitalTicketButton turnId={lastIssued.id} number={lastIssued.number} /><Button asChild variant="outline"><a target="_blank" rel="noreferrer" href={ticketHref(lastIssued.id)}><Printer className="mr-2 h-4 w-4" />{q('print')}</a></Button></div></div>}
    <QueueReceptionBoard data={data} options={options.data} canManage={canManage} pending={mutation.isPending} stale={stale || !!options.error} loading={snapshot.isLoading} onNext={(provider, room) => mutation.mutate({ path: '/next', body: { providerUserId: provider, chairId: room } })} onStatusChange={(turn, status) => mutation.mutateAsync({ path: `/turns/${turn.id}/status`, method: 'PATCH', body: { status, expectedStatus: turn.status } })} onAction={(turn, action) => mutation.mutateAsync({ path: `/turns/${turn.id}/actions`, body: { action } })} />
    <Dialog open={issueOpen} onOpenChange={setIssueOpen}><DialogContent data-tour="queue-check-in-form" className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{q('checkIn')}</DialogTitle><DialogDescription>{q('checkInHelp')}</DialogDescription></DialogHeader>
      <div className="flex gap-2">{(['appointment', 'walkIn'] as const).map(m => <Button variant={mode === m ? 'default' : 'outline'} key={m} onClick={() => { setMode(m); setForm(blankForm()); setFormError(''); }}>{q(m)}</Button>)}</div>
      {mode === 'appointment' ? <QueueSelect id="queue-issue-appointment" label={q('appointment')} value={form.appointmentId} onValueChange={fillAppointment} emptyLabel={q('select')} options={(options.data?.appointments || []).filter(a => !activePatients.has(a.contactId)).map(a => ({ value: String(a.id), label: `${data ? queueDate(a.scheduledAt, data.display.timezone, locale) : ''} · ${a.patientName}` }))} /> : <div className="space-y-2 pt-2">
        <QueuePatientSelect value={form.contactId} name={form.patientName} excluded={activePatients} onSelect={patient => setForm({ ...form, contactId: String(patient.contactId), patientName: patient.name })} />
        {canRegister && <Button type="button" variant="link" className="h-auto px-0 py-1 text-sm" onClick={() => setRegisterOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />{q('newPatient')}</Button>}
      </div>}
      <QueueSelect id="queue-issue-provider" label={q('professional')} value={form.providerUserId} disabled={!!appointment?.providerUserId} onValueChange={value => setForm({ ...form, providerUserId: value, chairId: appointment?.chairId ? String(appointment.chairId) : '', serviceKey: appointment?.serviceKey || '' })} emptyLabel={q('select')} options={(options.data?.providers || []).map(p => ({ value: String(p.id), label: p.name }))} />
      <QueueSelect id="queue-issue-room" label={q('room')} value={form.chairId} disabled={!!appointment?.chairId} onValueChange={value => setForm({ ...form, chairId: value })} emptyLabel={q('select')} options={rooms.map(r => ({ value: String(r.id), label: r.name }))} />
      <QueueSelect id="queue-issue-service" label={q('service')} value={form.serviceKey} disabled={!!appointment?.serviceKey} onValueChange={value => setForm({ ...form, serviceKey: value })} emptyLabel={q('select')} searchable options={[
        ...services.map(s => ({ value: s.id, label: s.label })),
        ...(appointment?.serviceKey && !services.some(s => s.id === appointment.serviceKey) ? [{ value: appointment.serviceKey, label: appointment.serviceLabel || appointment.serviceKey }] : []),
      ]} />
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      <div className="flex justify-end pt-4"><Button disabled={mutation.isPending || !form.contactId || !form.providerUserId || !form.chairId || !form.serviceKey || (mode === 'appointment' && !appointment)} onClick={() => mutation.mutate({ path: '/turns', body: { contactId: Number(form.contactId), ...(form.appointmentId ? { appointmentId: Number(form.appointmentId) } : {}), providerUserId: Number(form.providerUserId), chairId: Number(form.chairId), serviceKey: form.serviceKey } })}>{q('issue')}</Button></div>
    </DialogContent></Dialog>
    <AddDentalPatientDialog open={registerOpen} onOpenChange={setRegisterOpen} initialMode="new" onSuccess={p => { setForm(f => ({ ...f, contactId: String(p.contactId), patientName: p.name })); setRegisterOpen(false); void client.invalidateQueries({ queryKey: [QUEUE_API, 'patients'] }); }} />
  </DentalShellPage>;
}
