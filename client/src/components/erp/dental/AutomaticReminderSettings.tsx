import { ReminderTemplateFields } from './ReminderTemplateFields';
import { useDentalTimezone } from '@/hooks/use-dental-timezone';
import { dentalReminderMessageValues } from '@shared/utils/dental-reminder-message';
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, Eye, FileText, History, Info, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChannelConnectionSelect } from '@/components/channels/ChannelConnectionSelect';
import { ReminderVariablePicker } from './ReminderVariablePicker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DENTAL_REMINDER_DEFAULT_MESSAGE,
  renderDentalReminder, isDentalReminderChannelSupported, type DentalAutomaticReminders, type DentalReminderOptions, type DentalReminderRule,
} from '@shared/types/dental-reminder-types';

function LeadTimeInput({ rule, disabled, onChange }: { rule: DentalReminderRule; disabled: boolean; onChange: (minutes: number) => void }) {
  const { t } = useTranslation();
  const [unit, setUnit] = useState(rule.leadMinutes % 1440 === 0 ? 1440 : rule.leadMinutes % 60 === 0 ? 60 : 1);
  return <div className="flex flex-wrap items-center gap-2">
    <Input data-tour="components-erp-dental-automaticremindersettings.input.erp.dental.reminders.leadTime" aria-label={t('erp.dental.reminders.leadTime', 'Reminder lead time')} className="h-9 w-24" type="number" min={1} step={1}
      value={rule.leadMinutes / unit} disabled={disabled} onChange={event => onChange(Number(event.target.value) * unit)} />
    <Select value={String(unit)} disabled={disabled} onValueChange={value => {
      const nextUnit = Number(value); onChange((rule.leadMinutes / unit) * nextUnit); setUnit(nextUnit);
    }}>
      <SelectTrigger data-tour="components-erp-dental-automaticremindersettings.selecttrigger.erp.dental.reminders.unit" className="h-9 w-28" aria-label={t('erp.dental.reminders.unit', 'Lead time unit')}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="1">{t('erp.dental.reminders.minutes', 'minutes')}</SelectItem>
        <SelectItem value="60">{t('erp.dental.reminders.hours', 'hours')}</SelectItem>
        <SelectItem value="1440">{t('erp.dental.reminders.days', 'days')}</SelectItem>
      </SelectContent>
    </Select>
    <span className="text-xs text-muted-foreground">{t('erp.dental.reminders.before', 'before the appointment')}</span>
  </div>;
}

export function AutomaticReminderSettings({ value, onChange, disabled, domain = 'dental', historyEnabled = true }: {
  value: DentalAutomaticReminders; onChange: (value: DentalAutomaticReminders) => void; disabled: boolean; domain?: 'dental' | 'real_estate'; historyEnabled?: boolean;
}) {
  const { t: translate, currentLanguage } = useTranslation();
  const t: typeof translate = (key, fallback, params) => translate(domain === 'real_estate' ? key.replace('erp.dental.reminders','erp.realEstate.reminders') : key, fallback, params);
  const optionsUrl = domain === 'dental' ? '/api/erp/dental/booking/reminder-options' : '/api/erp/real-estate/schedule/reminder-options';
  const deliveriesUrl = domain === 'dental' ? '/api/erp/dental/booking/reminder-deliveries' : '/api/erp/real-estate/schedule/reminder-deliveries';
  const timezoneQuery = useDentalTimezone(domain === 'dental' ? '/api/erp/dental/timezone' : '/api/erp/real-estate/schedule/reminder-timezone');
  const timezone = !timezoneQuery.isError && timezoneQuery.data?.status === 'valid' ? timezoneQuery.data.timezone : null;
  const timezoneMessage = timezoneQuery.isFetching
    ? t('erp.dental.reminders.timezoneLoading', 'Checking company timezone...')
    : t('erp.dental.reminders.timezoneRequired', 'Save a valid company timezone in General Settings before sending dental reminders.');
  const sampleValues = timezone ? dentalReminderMessageValues({
    appointment: { scheduledAt: '2030-09-20T09:00:00Z', durationMinutes: 30, title: domain === 'dental' ? 'Dental cleaning' : t('erp.realEstate.reminders.sampleAppointment','Property viewing'), status: 'confirmed' },
    contact: { name: 'Abid', phone: '+15551234567', email: 'abid@example.com' },
    locale: domain === 'real_estate' ? currentLanguage?.code : 'en', companyName: domain === 'dental' ? 'Dental Clinic' : t('erp.realEstate.reminders.sampleCompany','Property company'), timezone, providerName: domain === 'dental' ? 'Dr. Smith' : 'Alex', officeName: 'Office 1',
  }) : null;
  const [historyOpen, setHistoryOpen] = useState(true);
  const [reminderDeleteId, setReminderDeleteId] = useState<string | null>(null);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const deleteReturnFocus = useRef<string | null>(null);
  const reminderList = useRef<HTMLDivElement>(null);
  const reminderPanels = useRef(new Map<string, HTMLFieldSetElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const panel = reminderPanels.current.get(pendingFocus.current);
    const list = reminderList.current;
    if (!panel || !list) return;
    panel.querySelector('input')?.focus({ preventScroll: true });
    list.scrollTo({ top: list.scrollTop + panel.getBoundingClientRect().top - list.getBoundingClientRect().top });
    pendingFocus.current = null;
  }, [value.rules]);
  const options = useQuery<DentalReminderOptions>({
    queryKey: [optionsUrl],
    queryFn: async () => {
      const response = await apiRequest('GET', optionsUrl);
      if (!response.ok) throw new Error('Unable to load reminder channels and templates');
      return (await response.json()).data;
    },
  });
  const deliveries = useQuery<Array<{ appointmentId: number; ruleId: string; status: string; scheduledFor: string; lastError: string | null }>>({
    queryKey: [deliveriesUrl], enabled: historyEnabled && historyOpen,
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    refetchInterval: historyOpen ? 60_000 : false,
    queryFn: async () => {
      const response = await apiRequest('GET', deliveriesUrl);
      if (!response.ok) throw new Error('Unable to load reminder history');
      return (await response.json()).data;
    },
  });
  useEffect(() => {
    if (historyOpen) { void timezoneQuery.refetch(); if(historyEnabled) void deliveries.refetch(); }
  }, [historyOpen]);
  const editDisabled = disabled || !value.enabled;
  const reminderDeleteIndex = value.rules.findIndex(rule => rule.id === reminderDeleteId);
  useEffect(() => {
    if (reminderDeleteId !== null && (editDisabled || reminderDeleteIndex < 0)) setReminderDeleteId(null);
  }, [editDisabled, reminderDeleteId, reminderDeleteIndex]);
  const connections = (options.data?.connections ?? []).filter(channel => isDentalReminderChannelSupported(channel.channelType));
  const invalidConnection = options.isSuccess && value.channelMode === 'specific_connection' && value.channelConnectionId != null &&
    !connections.some(channel => channel.id === value.channelConnectionId);
  const updateRule = (id: string, patch: Partial<DentalReminderRule>) => onChange({
    ...value, rules: value.rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule),
  });
  const setEnabled = (enabled: boolean) => onChange({ ...value, enabled });
  const addReminder = () => {
    const id = crypto.randomUUID();
    pendingFocus.current = id;
    onChange({ ...value, rules: [...value.rules, {
      id, leadMinutes: 60, message: DENTAL_REMINDER_DEFAULT_MESSAGE, officialTemplates: {}, activatedAt: null,
    }] });
  };
  return <Card className="dental-reminder-card col-span-full min-w-0 w-full max-w-full rounded-xl" aria-labelledby="dental-reminder-title">
    <header className="dental-reminder-header flex flex-col items-start justify-between gap-4 border-b p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span className="dental-reminder-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"><CalendarClock className="h-6 w-6" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 data-tour="components-erp-dental-automaticremindersettings.h2.erp.dental.reminders.title" id="dental-reminder-title" className="text-base font-semibold">{t('erp.dental.reminders.title', 'Automatic appointment reminders')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('erp.dental.reminders.description', 'Choose when and how patients receive reminders for their dental appointments.')}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Switch id="dental-auto-reminders-header" className="dental-reminder-header-switch" checked={value.enabled} disabled={disabled}
          aria-label={t('erp.dental.reminders.enable', 'Send automatic appointment reminders')} onCheckedChange={setEnabled} />
        <Label htmlFor="dental-auto-reminders-header" className="text-xs">{value.enabled ? t('erp.dental.reminders.enabled', 'Enabled') : t('erp.dental.reminders.disabled', 'Disabled')}</Label>
      </div>
    </header>
    <div className="min-w-0 space-y-4 p-3 sm:space-y-5 sm:p-5">
    <p className="text-xs leading-relaxed text-muted-foreground">{t('erp.dental.reminders.help', 'Applies to all scheduled and confirmed dental appointments, including existing bookings. Missed reminder times are skipped. Rescheduling starts a fresh set of reminders.')}</p>
    {!timezone && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{timezoneMessage} <Button data-tour="components-erp-dental-automaticremindersettings.button.erp.dental.reminders.retry" type="button" variant="link" onClick={() => timezoneQuery.refetch()}>{t('erp.dental.reminders.retry', 'Retry')}</Button></p>}
    {options.isError && <p role="alert" className="text-sm text-destructive">{t('erp.dental.reminders.optionsError', 'Could not load channels and templates.')} <Button data-tour="components-erp-dental-automaticremindersettings.button.erp.dental.reminders.retry" variant="link" onClick={() => options.refetch()}>{t('erp.dental.reminders.retry', 'Retry')}</Button></p>}
    {options.isLoading && <p className="text-sm text-muted-foreground">{t('erp.dental.reminders.loading', 'Loading reminder channels and templates…')}</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
      <div className="space-y-2">
        <Label htmlFor="dental-reminder-channel-mode">{t('erp.dental.reminders.channel', 'Send through')}</Label>
        <Select value={value.channelMode} disabled={editDisabled} onValueChange={channelMode => onChange({ ...value, channelMode: channelMode as DentalAutomaticReminders['channelMode'] })}>
          <SelectTrigger data-tour="components-erp-dental-automaticremindersettings.selecttrigger.dental-reminder-channel-mode" id="dental-reminder-channel-mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="latest_conversation">{t('erp.dental.reminders.latest', "Patient’s latest conversation")}</SelectItem>
            <SelectItem value="specific_connection">{t('erp.dental.reminders.specific', 'Specific channel connection')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.channelMode === 'specific_connection' && <div className="space-y-2">
        <Label htmlFor="dental-reminder-connection">{t('erp.dental.reminders.connection', 'Channel connection')}</Label>
        <ChannelConnectionSelect id="dental-reminder-connection" channels={connections}
          value={value.channelConnectionId} disabled={editDisabled}
          onChange={channelConnectionId => onChange({ ...value, channelConnectionId })}
          placeholder={t('erp.dental.reminders.chooseChannel', 'Choose a channel')}
          aria-invalid={invalidConnection} aria-describedby={invalidConnection ? 'dental-reminder-connection-error' : undefined} />
        {invalidConnection && <p id="dental-reminder-connection-error" role="alert" className="text-xs text-destructive">
          {t('erp.dental.reminders.unsupportedConnection', 'This connection is unavailable or unsupported. Choose another channel. Email and TikTok are excluded from automatic reminders.')}
        </p>}
      </div>}
    </div>
    <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{t('erp.dental.reminders.channelHelp', 'A selected WhatsApp connection can start a chat using the patient’s phone number. Other channels require an existing conversation. Unavailable destinations are skipped. Reminders follow the exact lead times, including overnight.')}</p>
    </div>
    <div ref={reminderList} role="region" aria-label={t('erp.dental.reminders.list', 'Appointment reminders')} tabIndex={0}
      className="dental-reminder-list booking-settings-scrollbar min-w-0 space-y-3 overflow-y-auto overflow-x-hidden rounded-lg [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {value.rules.map((rule, index) => {
      let preview: string;
      try { preview = sampleValues ? renderDentalReminder(rule.message, sampleValues) : timezoneMessage; } catch { preview = t('erp.dental.reminders.invalidPreview', 'Choose supported placeholders to preview this message.'); }
      return <fieldset key={rule.id} ref={node => { if (node) reminderPanels.current.set(rule.id, node); else reminderPanels.current.delete(rule.id); }}
        className="dental-reminder-panel min-w-0 rounded-xl border">
        <legend className="sr-only">{t('erp.dental.reminders.reminder', 'Reminder')} {index + 1}</legend>
        <div className="flex items-center gap-3 border-b p-3">
          <span className="dental-reminder-number flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold" aria-hidden="true">{index + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
            <h3 className="text-sm font-semibold">{t('erp.dental.reminders.reminder', 'Reminder')} {index + 1}</h3>
            <p className="text-xs text-muted-foreground">{t('erp.dental.reminders.ruleDescription', 'Send this reminder before the appointment.')}</p>
          </div>
          <Button data-tour="components-erp-dental-automaticremindersettings.button.erp.dental.reminders.remove" type="button" variant="ghost" size="icon"
            ref={node => { if (node) deleteButtons.current.set(rule.id, node); else deleteButtons.current.delete(rule.id); }}
            className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={editDisabled}
            aria-label={`${t('erp.dental.reminders.remove', 'Remove reminder')} ${index + 1}`}
            onClick={() => { deleteReturnFocus.current = rule.id; setReminderDeleteId(rule.id); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-3">
        <LeadTimeInput rule={rule} disabled={editDisabled} onChange={leadMinutes => updateRule(rule.id, { leadMinutes })} />
        <div className="space-y-2">
          <div className="flex min-w-0 items-start justify-between gap-2 sm:items-center">
            <Label htmlFor={`reminder-message-${rule.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold">
              <span className="dental-reminder-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md"><FileText className="h-3.5 w-3.5" aria-hidden="true" /></span>
              {t('erp.dental.reminders.message', 'Message for channels other than WhatsApp Official')}
            </Label>
            <ReminderVariablePicker domain={domain} disabled={editDisabled} onInsert={text => updateRule(rule.id, { message: rule.message + text })} />
          </div>
          <Textarea data-tour="components-erp-dental-automaticremindersettings.textarea.erp.dental.reminders.message" id={`reminder-message-${rule.id}`} className="min-h-[64px] resize-y" rows={2} maxLength={8000} value={rule.message} disabled={editDisabled} onChange={event => updateRule(rule.id, { message: event.target.value })} />
          <div className="dental-reminder-preview flex items-start gap-3 rounded-lg p-3">
            <Eye className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className="block text-muted-foreground">{t('erp.dental.reminders.preview', 'Sample preview')}{timezone ? ` · ${timezone}` : ''}</span>{preview}
            </div>
          </div>
        </div>
        <ReminderTemplateFields domain={domain} rule={rule} options={options.data ?? { connections: [], templates: [] }}
          channelMode={value.channelMode} channelConnectionId={value.channelConnectionId} disabled={editDisabled}
          onChange={officialTemplates => updateRule(rule.id, { officialTemplates })} />
        </div>
      </fieldset>;
    })}
    </div>
    <Button data-tour="components-erp-dental-automaticremindersettings.button.erp.dental.reminders.add" ref={addButton} type="button" variant="outline" className="w-full border-dashed bg-transparent sm:w-auto" disabled={editDisabled || value.rules.length >= 20} onClick={addReminder}>
      <Plus className="mr-2 h-4 w-4" />{t('erp.dental.reminders.add', 'Add reminder')}
    </Button>
    {historyEnabled && <details open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)} className="dental-reminder-history group border-t pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="dental-reminder-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><History className="h-5 w-5" aria-hidden="true" /></span>
        <span className="flex-1">{t('erp.dental.reminders.history', 'Recent reminder activity')}{timezone && <span className="block text-xs font-normal text-muted-foreground">{timezone}</span>}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-2 min-w-0 sm:pl-[52px]">
      {deliveries.isError && <p role="alert" className="mt-2 text-sm text-destructive">{t('erp.dental.reminders.historyError', 'Could not load reminder activity.')}</p>}
      {deliveries.isLoading && historyOpen && <p className="mt-2 text-sm">{t('erp.common.loading', 'Loading...')}</p>}
      {deliveries.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t('erp.dental.reminders.noHistory', 'No automatic reminders have been scheduled yet.')}</p>}
      <ul tabIndex={0} aria-label={t('erp.dental.reminders.history', 'Recent reminder activity')} className="booking-settings-scrollbar mt-3 max-h-80 space-y-2 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-md pr-2 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{deliveries.data?.map((delivery, index) => <li key={index} className="rounded-md bg-muted p-2 text-xs break-words">
        #{delivery.appointmentId} · {t(`erp.dental.reminders.status.${delivery.status}`, delivery.status)} · {timezone ? new Date(delivery.scheduledFor).toLocaleString(currentLanguage?.code || 'en', { timeZone: timezone }) : timezoneMessage}
        {delivery.lastError && <span className="block text-muted-foreground">{delivery.lastError === 'DENTAL_TIMEZONE_REQUIRED' ? t('erp.dental.reminders.timezoneDeferred', 'Waiting for a valid company timezone in General Settings. Retrying every 60 seconds until the appointment starts.') : delivery.lastError}</span>}
      </li>)}</ul>
      </div>
    </details>}
    </div>
    <AlertDialog open={reminderDeleteId !== null} onOpenChange={open => { if (!open) setReminderDeleteId(null); }}>
      <AlertDialogContent onCloseAutoFocus={event => {
        event.preventDefault();
        const target = (deleteReturnFocus.current ? deleteButtons.current.get(deleteReturnFocus.current) : null) ?? addButton.current;
        if (target && !target.disabled) target.focus();
        else reminderList.current?.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('erp.dental.reminders.removeConfirmTitle', 'Remove appointment reminder?')}</AlertDialogTitle>
          <AlertDialogDescription>{t('erp.dental.reminders.removeConfirmBody',
            'Are you sure you want to remove Reminder {{number}}? This change will take effect after you save.',
            { number: reminderDeleteIndex >= 0 ? reminderDeleteIndex + 1 : '' })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={editDisabled || reminderDeleteIndex < 0}
            onClick={() => {
              if (editDisabled || reminderDeleteIndex < 0) return;
              deleteReturnFocus.current = value.rules[reminderDeleteIndex + 1]?.id ?? null;
              onChange({ ...value, rules: value.rules.filter(rule => rule.id !== reminderDeleteId) });
              setReminderDeleteId(null);
            }}>{t('erp.dental.reminders.remove', 'Remove reminder')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
