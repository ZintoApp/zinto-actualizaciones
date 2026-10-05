import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Plus,
  ArrowLeft,
  CalendarClock,
  Clock3,
  Globe2,
  CheckCircle2,
  Users,
  Loader2,
  Pencil,
  Pause,
  Play,
  Ban,
  Info,
  Trash2,
  Activity as TabIconActivity,
  CalendarClock as TabIconCalendarClock,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChannelConnectionSelect } from '@/components/channels/ChannelConnectionSelect';
import { ReminderVariablePicker } from './ReminderVariablePicker';
import { ReminderTemplateFields } from './ReminderTemplateFields';
import { ReminderMessageEditor } from './ReminderMessageEditor';
import { useDentalTimezone } from '@/hooks/use-dental-timezone';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { dentalReminderMessageValues } from '@shared/utils/dental-reminder-message';
import { renderDentalReminder, type DentalReminderOptions } from '@shared/types/dental-reminder-types';
import { reminderBatchSchema, type ReminderBatch, type ReminderBatchInput, type ReminderBatchOptions,
  type ReminderBatchPreview, type ReminderBatchRun, type ReminderBatchDelivery } from '@shared/types/dental-reminder-batches';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import { addDaysToDateKey } from '@shared/types/dental-schedule-calendar';
import { useBatchText, type BatchTextKey } from './batch-text';

const base = '/api/erp/dental/reminder-batches';
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await apiRequest(method, path, body);
  const json = await response.json();
  if (!response.ok || json.success === false) throw new Error(json.error || 'Request failed');
  return json.data;
}
function Section({ number, title, children, className = '' }: { number: string; title: string; children: React.ReactNode; className?: string }) {
  return <section className={`reminder-editor-section min-w-0 ${className}`}>
    <h3 className="flex items-center gap-3 text-base font-semibold"><span aria-hidden="true" className="reminder-editor-step">{number}</span>{title}</h3>{children}
  </section>;
}
function Choice({ id, label, value, options, onChange, disabled, className = '' }: { id: string; label: string; value: string;
  options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean; className?: string }) {
  return <div className={`min-w-0 space-y-2 ${className}`}><Label htmlFor={id}>{label}</Label>
    <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} className="min-w-0"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select></div>;
}
export function ReminderBatchesDialog({ open, onOpenChange, canManage }: { open: boolean; onOpenChange: (open: boolean) => void; canManage: boolean }) {
  const text = useBatchText();
  const { currentLanguage } = useTranslation();
  const { toast } = useToast();
  const client = useQueryClient();
  const timezoneQuery = useDentalTimezone();
  const timezone = timezoneQuery.data?.status === 'valid' && !timezoneQuery.isError ? timezoneQuery.data.timezone : null;
  const [draft, setDraft] = useState<ReminderBatchInput | null>(null);
  const [editing, setEditing] = useState<ReminderBatch | null>(null);
  const [tab, setTab] = useState('schedules');
  const [preview, setPreview] = useState<ReminderBatchPreview | null>(null);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ReminderBatch | null>(null);
  const keepBatchRef = useRef<HTMLButtonElement>(null);
  const deleteButtons = useRef(new Map<number, HTMLButtonElement>());
  const nameRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const schedulesTabRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const schedules = useQuery<ReminderBatch[]>({ queryKey: [base], enabled: open, queryFn: () => request(base), refetchInterval: open ? 60000 : false });
  const choices = useQuery<ReminderBatchOptions>({ queryKey: [base, 'options'], enabled: open, queryFn: () => request(`${base}/options`) });
  const channels = useQuery<DentalReminderOptions>({ queryKey: ['/api/erp/dental/booking/reminder-options'], enabled: open,
    queryFn: () => request('/api/erp/dental/booking/reminder-options') });
  const runs = useQuery<ReminderBatchRun[]>({ queryKey: [base, 'runs'], enabled: open && tab === 'activity', queryFn: () => request(`${base}/runs`), refetchInterval: open && tab === 'activity' ? 15000 : false });
  const deliveries = useQuery<ReminderBatchDelivery[]>({ queryKey: [base, 'deliveries', runId, offset], enabled: open && tab === 'activity' && runId !== null,
    queryFn: () => request(`${base}/runs/${runId}/deliveries?offset=${offset}`), refetchInterval: open && tab === 'activity' ? 15000 : false });
  const fail = (err: Error) => { setError(err.message); requestAnimationFrame(() => errorRef.current?.focus()); };
  const refresh = () => client.invalidateQueries({ queryKey: [base] });
  const save = useMutation({ mutationFn: async () => {
    const result = reminderBatchSchema.safeParse(draft);
    if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join(' '));
    return editing ? request(`${base}/${editing.id}`, 'PATCH', { version: editing.version, config: result.data }) : request(base, 'POST', result.data);
  }, onSuccess: () => { refresh(); setDraft(null); setEditing(null); setPreview(null); setError(''); toast({ title: text('saved') }); requestAnimationFrame(() => newRef.current?.focus()); }, onError: fail });
  const changeState = useMutation({ mutationFn: ({ row, state }: { row: ReminderBatch; state: string }) => request(`${base}/${row.id}`, 'PATCH', { version: row.version, state }),
    onSuccess: () => { refresh(); setError(''); toast({ title: text('updated') }); }, onError: fail });
  const deleteBatch = useMutation({
    mutationFn: (row: ReminderBatch) => request(`${base}/${row.id}`, 'DELETE', { version: row.version }),
    onSuccess: async (_data, row) => {
      await client.cancelQueries({ queryKey: [base] });
      client.setQueryData<ReminderBatch[]>([base], rows => rows?.filter(item => item.id !== row.id));
      setDeleteTarget(null); setRunId(null); setOffset(0); setError('');
      client.removeQueries({ queryKey: [base, 'deliveries'] });
      await client.resetQueries({ queryKey: [base, 'runs'] });
      await refresh();
      toast({ title: text('deleted') });
      requestAnimationFrame(() => {
        const target = newRef.current && !newRef.current.disabled ? newRef.current : schedulesTabRef.current;
        target?.focus();
      });
    },
    onError: fail,
  });
  const review = useMutation({ mutationFn: async () => {
    const result = reminderBatchSchema.safeParse(draft);
    if (!result.success) throw new Error(result.error.issues.map(i => i.message).join(' '));
    return request<ReminderBatchPreview>(`${base}/preview`, 'POST', { config: result.data, ...(editing ? { id: editing.id } : {}) });
  }, onSuccess: data => { setPreview(data); setError(''); requestAnimationFrame(() => document.getElementById('batch-preview')?.focus()); }, onError: fail });
  const busy = save.isPending || review.isPending || changeState.isPending || deleteBatch.isPending;
  useEffect(() => { if (deleteTarget) keepBatchRef.current?.focus(); }, [deleteTarget]);
  useEffect(() => { if (!open || tab !== 'schedules' || draft || !canManage) setDeleteTarget(null); }, [open, tab, draft, canManage]);
  const keepBatch = () => {
    const id = deleteTarget?.id;
    setDeleteTarget(null); setError('');
    requestAnimationFrame(() => { if (id != null) deleteButtons.current.get(id)?.focus(); });
  };
  const update = (patch: Partial<ReminderBatchInput>) => { setDraft(current => current ? { ...current, ...patch } : current); setPreview(null); setError(''); };
  const begin = (row?: ReminderBatch) => {
    setError(''); setPreview(null); setEditing(row ?? null);
    const date = getZonedDateTimeParts(new Date(), timezone || 'UTC').dateKey;
    setDraft(row ? reminderBatchSchema.parse(Object.fromEntries(Object.entries(row).filter(([key]) => !['id','state','timezone','nextRunAt','version','latestRunStatus'].includes(key)))) : {
      name: text('confirmation'), purpose: 'confirmation', mode: 'daily', time: '10:00', daysAhead: 1,
      sendDate: addDaysToDateKey(date, 1), appointmentDate: addDaysToDateKey(date, 2),
      providerUserId: null, chairId: null, serviceKey: null, statuses: ['scheduled'],
      channelMode: 'latest_conversation', channelConnectionId: null, message: text('starterConfirmation'), officialTemplates: {},
    });
    requestAnimationFrame(() => nameRef.current?.focus());
  };
  const back = () => { setDraft(null); setEditing(null); setPreview(null); setError(''); requestAnimationFrame(() => newRef.current?.focus()); };
  useEffect(() => { if (open) { void timezoneQuery.refetch(); void refresh(); } }, [open]);
  const format = (at: string, zone: string) => new Date(at).toLocaleString(currentLanguage?.code?.replace('_','-') || 'en', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' });
  const locale = currentLanguage?.code?.replace('_', '-') || 'en';
  // These are saved wall-clock values, not instants in the browser's timezone.
  const formatTime = (time: string) => new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString(locale, {
    timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: locale.startsWith('en'),
  });
  const formatDate = (date: string | null) => date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', dateStyle: 'medium' }) : '—';
  const status = (value: string) => text(value as BatchTextKey);
  const editorZone = draft?.mode === 'once' && editing?.mode === 'once' ? editing.timezone : timezone;
  let messagePreview = '';
  if (draft && editorZone) {
    try { messagePreview = renderDentalReminder(draft.message, dentalReminderMessageValues({
      appointment: { scheduledAt: `${preview?.appointmentDate || draft.appointmentDate || getZonedDateTimeParts(new Date(), editorZone).dateKey}T12:00:00Z`, durationMinutes: 30, title: 'Dental cleaning', status: 'scheduled' },
      contact: { name: 'Abid', phone: '+15551234567', email: 'abid@example.com' }, companyName: 'Dental Clinic', timezone: editorZone, providerName: 'Dr. Smith', officeName: 'Office 1',
    })); } catch { messagePreview = draft.message; }
  }
  const filterOptions = (items: Array<{ id: string | number; name: string }> | undefined, all: string, selected: string) => {
    const list = [{ value: 'all', label: all }, ...(items ?? []).map(i => ({ value: String(i.id), label: i.name }))];
    if (!list.some(i => i.value === selected)) list.push({ value: selected, label: text('unavailable') });
    return list;
  };
  const loadError = schedules.isError || choices.isError || channels.isError;
  const selectedName = (items: Array<{ id: string | number; name: string }> | undefined, selected: string | number | null, all: BatchTextKey) =>
    selected === null ? text(all) : items?.find(item => String(item.id) === String(selected))?.name || text('unavailable');
  const optionsReady = choices.isSuccess && channels.isSuccess && !loadError;
  const retry = () => { void schedules.refetch(); void choices.refetch(); void channels.refetch(); };
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent className={`reminder-batches-dialog${draft ? ' reminder-schedule-editor' : ''}`} closeButtonDisabled={busy} closeButtonLabel={text('close')}>
      <DialogHeader className="reminder-batches-header">
        <DialogTitle className="reminder-batches-title flex items-center gap-3 pr-5"><span className="reminder-batches-icon flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BellRing className="h-5 w-5" /></span>{draft ? text(editing ? 'edit' : 'new') : text('title')}</DialogTitle>
        <DialogDescription className="reminder-batches-description">{text(draft ? 'editorDescription' : 'description')}</DialogDescription>
      </DialogHeader>
      <div className={`min-w-0 space-y-5${draft ? ' reminder-editor-body' : ''}`}>
        {error && <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {loadError && <div role="alert" className="text-sm text-destructive">{text('error')} <Button variant="link" onClick={retry}>{text('retry')}</Button></div>}
        {!timezone && <div role="status" className="rounded-lg border bg-muted/50 p-3 text-sm">{timezoneQuery.isLoading ? text('loading') : text('timezoneRequired')} <Button variant="link" onClick={() => timezoneQuery.refetch()}>{text('retry')}</Button></div>}
        {choices.data?.relativeRemindersEnabled && <div className="reminder-batches-notice flex gap-2 rounded-lg border bg-muted/50 text-muted-foreground"><Info className="h-4 w-4 shrink-0" />{text('independent')}</div>}
        {draft ? <>
          <fieldset disabled={busy || !canManage} className="reminder-editor-grid min-w-0">
            <div className="reminder-editor-left company-sidebar-scrollbar min-w-0" role="region" aria-label={text('scheduleForm')} tabIndex={0}>
            <Section number="01" title={text('schedule')}>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="reminder-editor-inline sm:col-span-2"><Label htmlFor="batch-name">{text('name')}</Label><Input data-tour="components-erp-dental-reminderbatchesdialog.input.batch-name" ref={nameRef} id="batch-name" maxLength={120} value={draft.name} onChange={e => update({ name: e.target.value })} /></div>
                <Choice id="batch-purpose" label={text('purpose')} value={draft.purpose} disabled={busy} options={['reminder','confirmation'].map(v => ({ value:v,label:text(v as BatchTextKey) }))}
                  onChange={v => update({ purpose:v as ReminderBatchInput['purpose'], message:text(v === 'reminder' ? 'starterReminder' : 'starterConfirmation'), statuses:v === 'reminder' ? ['scheduled','confirmed'] : ['scheduled'] })} />
                <Choice id="batch-mode" label={text('mode')} value={draft.mode} disabled={busy} options={['daily','once'].map(v => ({ value:v,label:text(v as BatchTextKey) }))} onChange={v => update({mode:v as ReminderBatchInput['mode']})} />
                {draft.mode === 'daily' ? <div className="space-y-2"><Label htmlFor="batch-days">{text('daysAhead')}</Label><Input data-tour="components-erp-dental-reminderbatchesdialog.input.batch-days" id="batch-days" aria-describedby="batch-days-help" type="number" min={0} max={365} step={1} value={draft.daysAhead} onChange={e => update({daysAhead:Number(e.target.value)})} /></div>
                  : <div className="space-y-2"><Label htmlFor="batch-send-date">{text('sendDate')}</Label><Input data-tour="components-erp-dental-reminderbatchesdialog.input.batch-send-date" id="batch-send-date" type="date" value={draft.sendDate || ''} onChange={e => update({sendDate:e.target.value})} /></div>}
                <div className="space-y-2"><Label htmlFor="batch-time">{text('time')}</Label><Input data-tour="components-erp-dental-reminderbatchesdialog.input.batch-time" id="batch-time" type="time" value={draft.time} onChange={e => update({time:e.target.value})} /></div>
                {draft.mode === 'once' && <div className="space-y-2"><Label htmlFor="batch-target-date">{text('appointmentDate')}</Label><Input data-tour="components-erp-dental-reminderbatchesdialog.input.batch-target-date" id="batch-target-date" type="date" value={draft.appointmentDate || ''} onChange={e => update({appointmentDate:e.target.value})} /></div>}
              </div>
              <p id="batch-days-help" className="reminder-editor-timezone text-xs text-muted-foreground"><Globe2 aria-hidden="true" className="h-4 w-4 shrink-0" /><span>{draft.mode==='daily' && <>{text('calendarDays')} · </>}{text('timezone')}: <strong className="text-foreground">{editorZone || '—'}</strong></span></p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text('timingHelp')}</p>
            </Section>
            <Section number="02" title={text('recipients')}>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Choice id="batch-provider" label={text('provider')} disabled={busy} value={String(draft.providerUserId || 'all')} options={filterOptions(choices.data?.providers,text('allProviders'),String(draft.providerUserId || 'all'))} onChange={v => update({providerUserId:v==='all'?null:Number(v)})} />
                <Choice id="batch-office" label={text('office')} disabled={busy} value={String(draft.chairId || 'all')} options={filterOptions(choices.data?.offices,text('allOffices'),String(draft.chairId || 'all'))} onChange={v => update({chairId:v==='all'?null:Number(v)})} />
                <Choice id="batch-service" label={text('service')} disabled={busy} value={draft.serviceKey || 'all'} options={filterOptions(choices.data?.services,text('allServices'),draft.serviceKey || 'all')} onChange={v => update({serviceKey:v==='all'?null:v})} />
                <Choice id="batch-status" label={text('status')} disabled={busy} value={draft.statuses.length===2?'both':draft.statuses[0]} options={['both','scheduled','confirmed'].map(v=>({value:v,label:text(v as BatchTextKey)}))} onChange={v=>update({statuses:v==='both'?['scheduled','confirmed']:[v as 'scheduled'|'confirmed']})} />
              </div>
            </Section>
            <Section className="reminder-editor-message" number="03" title={text('messageSection')}>
              <div className="space-y-4">
                <div className={`reminder-editor-channels grid min-w-0 gap-4${draft.channelMode==='specific_connection' ? ' sm:grid-cols-2' : ''}`}>
                  <Choice className={draft.channelMode==='specific_connection' ? '' : 'reminder-editor-inline reminder-editor-delivery'} id="batch-channel-mode" label={text('channel')} disabled={busy} value={draft.channelMode} options={[{value:'latest_conversation',label:text('latest')},{value:'specific_connection',label:text('specific')}]}
                    onChange={v=>update({channelMode:v as ReminderBatchInput['channelMode']})} />
                  {draft.channelMode==='specific_connection' && <div className="min-w-0 space-y-2"><Label htmlFor="batch-connection">{text('connection')}</Label><ChannelConnectionSelect id="batch-connection" channels={channels.data?.connections ?? []} value={draft.channelConnectionId} disabled={busy}
                    onChange={channelConnectionId=>update({channelConnectionId})} placeholder={text('chooseChannel')} /></div>}
                </div>
                <div className="space-y-2"><div className="reminder-editor-message-label flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><Label htmlFor="batch-message">{text('messageOtherChannels')}</Label><p id="batch-message-help" className="text-xs text-muted-foreground">{text('excludesOfficial')}</p></div><ReminderVariablePicker showLabel disabled={busy} onInsert={value=>update({message:draft.message+value})} /></div>
                  <ReminderMessageEditor value={draft.message} disabled={busy || !canManage} onChange={message=>update({message})} /></div>
                {draft.purpose==='confirmation' && <p className="text-xs text-muted-foreground">{text('reply')}</p>}
                {channels.data?.connections.some(c=>c.channelType==='whatsapp_official'&&(draft.channelMode==='latest_conversation'||c.id===draft.channelConnectionId)) && <p className="text-xs text-muted-foreground">{text('templatePreview')}</p>}
                <ReminderTemplateFields rule={{id:'batch',officialTemplates:draft.officialTemplates}} options={channels.data ?? {connections:[],templates:[]}} channelMode={draft.channelMode} channelConnectionId={draft.channelConnectionId} disabled={busy}
                  onChange={officialTemplates=>update({officialTemplates})} />
              </div>
            </Section>
            </div>
            <aside className="reminder-editor-overview company-sidebar-scrollbar min-w-0" aria-labelledby="batch-overview-title" tabIndex={0}>
              <section id="batch-preview" tabIndex={-1} className="space-y-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <h3 id="batch-overview-title" className="reminder-overview-heading"><CalendarClock aria-hidden="true" />{text('scheduleOverview')}</h3>
                <p className="reminder-overview-purpose text-muted-foreground">{text(draft.purpose)}</p>
                <p className="reminder-overview-timing">{draft.mode==='daily' ? text('dailyTiming',{time:draft.time ? formatTime(draft.time) : '—'}) : text('onceTiming',{date:formatDate(draft.sendDate),time:draft.time ? formatTime(draft.time) : '—'})}</p>
                <p className="text-sm text-muted-foreground">{draft.mode==='once' ? text('targetDateSummary',{date:formatDate(draft.appointmentDate)}) : text(draft.daysAhead===0?'sameDay':draft.daysAhead===1?'oneDayBefore':'calendarDaysBefore',{days:draft.daysAhead})}</p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Globe2 aria-hidden="true" className="h-4 w-4 shrink-0" />{editorZone || '—'}</p>
                {preview && <div className="reminder-overview-estimate space-y-2 rounded-md border bg-muted/40 p-3"><p className="text-sm font-semibold">{text('matches',{count:preview.count})}</p><p className="text-xs text-muted-foreground">{text('next')}: {format(preview.nextRunAt,preview.timezone)} · {preview.timezone}</p></div>}
              </section>
              <section className="reminder-overview-recipients space-y-3">
                <h3 className="reminder-overview-heading"><Users aria-hidden="true" />{text('recipients')}</h3>
                <div className="space-y-1 text-sm text-muted-foreground"><p>{selectedName(choices.data?.providers,draft.providerUserId,'allProviders')} · {selectedName(choices.data?.offices,draft.chairId,'allOffices')}</p>
                  <p>{selectedName(choices.data?.services,draft.serviceKey,'allServices')} · {text(draft.statuses.length===2?'both':draft.statuses[0])}</p></div>
              </section>
              <section className="space-y-4">
                <div className="reminder-overview-message-heading"><h3 className="reminder-overview-heading"><InboxConversationIcon aria-hidden="true" />{text('messagePreview')}</h3><Badge variant="outline">{text('sampleData')}</Badge></div>
                <p className="reminder-editor-sample rounded-lg border bg-muted/40 p-4 whitespace-pre-wrap text-sm leading-relaxed">{messagePreview}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{text('estimate')}</p>
              </section>
            </aside>
          </fieldset>
        </> : <Tabs className="reminder-batches-tabs" value={tab} onValueChange={value=>{setTab(value);setError('');}}>
          <TabsList><TabsTrigger icon={TabIconCalendarClock} data-tour="components-erp-dental-reminderbatchesdialog.tabstrigger.schedules" ref={schedulesTabRef} value="schedules" disabled={busy}>{text('schedules')}{schedules.data && <Badge className="tab-count" variant="secondary">{schedules.data.length}</Badge>}</TabsTrigger><TabsTrigger icon={TabIconActivity} data-tour="components-erp-dental-reminderbatchesdialog.tabstrigger.activity" value="activity" disabled={busy}>{text('activity')}</TabsTrigger></TabsList>
          <TabsContent data-tour="components-erp-dental-reminderbatchesdialog.tabscontent.schedules" value="schedules" className="reminder-batches-schedules">
            {schedules.isLoading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{text('loading')}</p>}
            {schedules.data?.length===0 && <div className="rounded-xl border border-dashed px-6 py-12 text-center"><CalendarClock className="mx-auto mb-4 h-9 w-9 text-primary" /><h3 className="font-semibold">{text('empty')}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{text('emptyHelp')}</p></div>}
            {schedules.data?.map(row=><div key={row.id} className="reminder-batch-card min-w-0 border bg-card"><div className="reminder-batch-heading flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-4"><CalendarClock aria-hidden="true" className="reminder-batch-calendar shrink-0" /><h3 className="reminder-batch-name min-w-0 break-words font-semibold">{row.name}</h3></div>
              <Badge className="reminder-batch-status" variant="secondary">
                {row.state==='active' ? <span aria-hidden="true" className="reminder-batch-active-dot" /> : row.state==='paused' ? <Pause aria-hidden="true" /> : row.state==='cancelled' ? <Ban aria-hidden="true" /> : row.latestRunStatus==='processing' ? <Clock3 aria-hidden="true" /> : row.latestRunStatus==='failed'||row.latestRunStatus==='unknown' ? <Info aria-hidden="true" /> : row.latestRunStatus==='expired' ? <Clock3 aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                {status(row.state==='completed'&&row.latestRunStatus ? row.latestRunStatus : row.state)}
              </Badge>
              </div>
              <dl className="reminder-batch-fields">
                <div><dt>{text('mode')}</dt><dd>{text(row.mode==='daily'?'daily':'once')}</dd></div>
                <div><dt>{text('sendTime')}</dt><dd>{row.mode==='once' && <span className="block">{formatDate(row.sendDate)}</span>}{formatTime(row.time)}</dd></div>
                <div><dt>{text('total')}</dt><dd>{row.mode==='once' ? formatDate(row.appointmentDate) : text(row.daysAhead===0?'sameDay':row.daysAhead===1?'oneDayAhead':'calendarDaysAhead',{days:row.daysAhead})}</dd></div>
              </dl>
              <div className="reminder-batch-meta text-muted-foreground">
                {row.state==='active' && row.nextRunAt ? <><span><Clock3 aria-hidden="true" />{text('next')}: {format(row.nextRunAt,row.timezone)}</span><span>{row.timezone}</span></>
                  : <><span><Globe2 aria-hidden="true" />{row.timezone}</span>{row.state==='paused' && <span>{text('schedulePaused')}</span>}</>}
              </div>
              {canManage && row.state!=='cancelled' && (row.state!=='completed'||row.latestRunStatus==='processing') && <div className="reminder-batch-actions flex flex-wrap">
                {row.state!=='completed' && <><Button size="sm" variant="outline" disabled={busy} onClick={()=>begin(row)}><Pencil className="mr-2 h-3.5 w-3.5" />{text('edit')}</Button>
                  {row.mode==='daily' && <Button size="sm" variant="outline" disabled={busy} onClick={()=>changeState.mutate({row,state:row.state==='paused'?'active':'paused'})}>{row.state==='paused'?<Play className="mr-2 h-3.5 w-3.5" />:<Pause className="mr-2 h-3.5 w-3.5" />}{text(row.state==='paused'?'resume':'pause')}</Button>}</>}
                <Button size="sm" variant="ghost" className="reminder-batch-cancel text-destructive hover:text-destructive" disabled={busy} onClick={()=>changeState.mutate({row,state:'cancelled'})}><Ban className="mr-2 h-3.5 w-3.5" />{text('cancel')}</Button>
              </div>}
              {canManage && row.state==='cancelled' && <div className="reminder-batch-actions">
                {deleteTarget?.id===row.id ? <div role="group" aria-describedby={`batch-delete-${row.id}`} className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p id={`batch-delete-${row.id}`} className="text-sm leading-relaxed">{text('deleteConfirm')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button ref={keepBatchRef} size="sm" variant="outline" disabled={busy} onClick={keepBatch}>{text('keepBatch')}</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteBatch.mutate(deleteTarget)}>
                      {deleteBatch.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}{text(deleteBatch.isPending ? 'deleting' : 'deletePermanently')}
                    </Button>
                  </div>
                </div> : <Button ref={node => { if (node) deleteButtons.current.set(row.id,node); else deleteButtons.current.delete(row.id); }} size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}
                  onClick={() => { setError(''); setDeleteTarget(row); }}><Trash2 className="mr-2 h-3.5 w-3.5" />{text('delete')}</Button>}
              </div>}
            </div>)}
          </TabsContent>
          <TabsContent data-tour="components-erp-dental-reminderbatchesdialog.tabscontent.activity" value="activity" className="reminder-batches-activity space-y-3">
            {runs.isLoading && <p role="status">{text('loading')}</p>}
            {runs.isError && <p role="alert">{text('error')} <Button variant="link" onClick={()=>runs.refetch()}>{text('retry')}</Button></p>}
            {runs.data?.length===0 && <p className="py-10 text-center text-sm text-muted-foreground">{text('noActivity')}</p>}
            {runs.data?.map(run=><div key={run.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-semibold">{run.name}</h3><Badge variant="secondary">{status(run.status)}</Badge></div>
              <p className="mt-2 text-xs text-muted-foreground">{format(run.scheduledFor,run.timezone)} · {run.timezone} · {text('appointmentDate')}: {run.appointmentDate}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">{(['total','sent','pending','failed','skipped','unknown'] as const).map(key=><span key={key}>{text(key)}: <strong>{run[key]}</strong></span>)}</div>
              <Button className="mt-2" size="sm" variant="link" onClick={()=>{setRunId(runId===run.id?null:run.id);setOffset(0);}} aria-expanded={runId===run.id}>{text('details')}</Button>
              {runId===run.id && <div className="mt-2 space-y-2 border-t pt-3">
                {deliveries.isLoading && <p role="status">{text('loading')}</p>}
                {deliveries.isError && <p role="alert">{text('error')} <Button variant="link" onClick={()=>deliveries.refetch()}>{text('retry')}</Button></p>}
                {deliveries.data?.map(d=><div key={d.id} className="rounded-lg bg-muted/50 p-3 text-xs"><div className="flex justify-between gap-3"><span>{d.patientName || `#${d.appointmentId}`} · #{d.appointmentId}</span><span>{status(d.status)}</span></div>{d.lastError && <p className="mt-1 break-words text-muted-foreground">{d.lastError}</p>}</div>)}
                <div className="flex justify-between"><Button size="sm" variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>{text('previous')}</Button><Button size="sm" variant="outline" disabled={(deliveries.data?.length ?? 0)<100} onClick={()=>setOffset(offset+100)}>{text('more')}</Button></div>
              </div>}
            </div>)}
          </TabsContent>
        </Tabs>}
      </div>
      <DialogFooter className="reminder-batches-footer">
        <Button className={draft ? 'reminder-editor-back' : undefined} variant={draft ? 'ghost' : 'outline'} disabled={busy} onClick={()=>draft?back():onOpenChange(false)}>{draft && <ArrowLeft aria-hidden="true" className="h-4 w-4" />}{text(draft?'back':'close')}</Button>
        {canManage && (draft ? <><Button variant="outline" disabled={busy || !timezone || !optionsReady} onClick={()=>review.mutate()}>{review.isPending&&<Loader2 className="mr-2 h-4 w-4 animate-spin" />}{text('review')}</Button>
          <Button variant="brand" disabled={busy || !timezone || !optionsReady} onClick={()=>save.mutate()}>{save.isPending&&<Loader2 className="mr-2 h-4 w-4 animate-spin" />}{text(save.isPending?'saving':'save')}</Button></>
          : tab==='schedules' && <Button ref={newRef} variant="default" className="reminder-batches-create" disabled={busy || !timezone || !optionsReady} onClick={()=>begin()}><Plus className="mr-2 h-4 w-4" />{text('new')}</Button>)}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
