import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronsUpDown,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Variable,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useChannelInfo } from '@/contexts/ActiveChannelContext';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandEmpty, CommandList, CommandItem } from '@/components/ui/command';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { CONSENT_MESSAGE_CATEGORY, CONSENT_MESSAGE_VARIABLES, CONSENT_STARTER_MESSAGES, consentOfficialComponents, consentOfficialPreview, consentTemplateDefinitions, renderConsentMessage, type ConsentSendContext, type ConsentDeliveryResult, type ConsentSendInput } from '@shared/dental-consent-send';

export type ConsentSendPreview = { contactId: number; key: string; url: string; blob: Blob; proof: string; language: 'en' | 'es'; title: string };
type QuickTemplate = { id: number; name: string; content: string; category: string };
export function ConsentSendDialog({ open, onClose, onReturnFocus, onRefreshPreview, preview, current }: { open: boolean; onClose: () => void; onReturnFocus: () => void; onRefreshPreview: () => void; preview: ConsentSendPreview; current: boolean }) {
  const { t } = useTranslation(), { toast } = useToast(), client = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { getChannelIcon, getChannelTypeDisplay } = useChannelInfo();
  const canManage = hasPermission(PERMISSIONS.MANAGE_TEMPLATES);
  const canSaveCopy = hasPermission(PERMISSIONS.MANAGE_DENTAL_IMAGING);
  const canMessage = hasPermission(PERMISSIONS.MANAGE_CONVERSATIONS);
  const contactId = preview.contactId;
  const base = `/api/erp/dental/patients/${contactId}`;
  const [conversationId, setConversationId] = useState('');
  const [content, setContent] = useState<string>(CONSENT_STARTER_MESSAGES[preview.language]);
  const [subject, setSubject] = useState(preview.title);
  const [saveCopy, setSaveCopy] = useState(false);
  useEffect(() => { if (!canSaveCopy) setSaveCopy(false); }, [canSaveCopy]);
  const [quickId, setQuickId] = useState<number>();
  const [officialId, setOfficialId] = useState<number>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [officialPicker, setOfficialPicker] = useState(false);
  const [editing, setEditing] = useState<{ id?: number; name: string; content: string } | null>(null);
  const [deleting, setDeleting] = useState<QuickTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsentDeliveryResult | null>(null);
  const attempt = useRef<ConsentSendInput | null>(null);
  const sending = useRef(false);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const context = useQuery({ queryKey: ['dental-consent-send-context', contactId, preview.proof], enabled: open && current,
    queryFn: async () => (await (await apiRequest('POST', `${base}/consent-send-context`, { proof: preview.proof })).json()).data as ConsentSendContext,
    retry: false, staleTime: 0 });
  const templates = useQuery({ queryKey: ['quick-reply-templates', CONSENT_MESSAGE_CATEGORY], enabled: open,
    queryFn: async () => ((await (await apiRequest('GET', '/api/erp/dental/consent-message-templates')).json()).data || []).filter((item: QuickTemplate) => item.category === CONSENT_MESSAGE_CATEGORY) as QuickTemplate[] });
  useEffect(() => {
    if (!context.data) return;
    setConversationId(previous => previous || String(context.data!.defaultConversationId || ''));
  }, [context.data]);
  const selectedChannel = context.data?.conversations.find(c => String(c.id) === conversationId);
  const officialRequired = !!selectedChannel?.requiresApprovedTemplate;
  const officialTemplates = context.data?.officialTemplates.filter(item => item.connectionId === selectedChannel?.channelId) || [];
  const official = officialTemplates.find(item => item.id === officialId);
  const quick = templates.data?.find(item => item.id === quickId);
  let message = '', validation: string | null = null;
  try {
    if (officialRequired) {
      if (!official) validation = 'erp.dental.consent.errors.officialTemplateRequired';
      else { consentOfficialComponents(official, values, context.data?.variables || {}); message = consentOfficialPreview(official, values, context.data?.variables || {}); }
    } else message = renderConsentMessage(content, context.data?.variables || {});
    if (context.data && !message.trim() && !validation) validation = 'erp.dental.consent.errors.messageRequired';
    const limit = selectedChannel?.channelType === 'messenger' ? 2000 : ['telegram', 'whatsapp_official'].includes(selectedChannel?.channelType || '') ? 4096 : 8000;
    if (message.length > limit) validation = 'erp.dental.consent.errors.messageTooLong';
    if (selectedChannel?.channelType === 'email') {
      const renderedSubject = renderConsentMessage(subject, context.data?.variables || {});
      if (!renderedSubject.trim() || renderedSubject.length > 200 || /[\r\n]/.test(renderedSubject)) validation = 'erp.dental.consent.errors.subjectRequired';
    }
  } catch { if (context.data) validation = 'erp.dental.consent.errors.messageVariables'; }
  const complete = (data: ConsentDeliveryResult) => {
    setResult(data);
    if (data.status === 'sent') {
      void client.invalidateQueries({ queryKey: ['conversations', Number(conversationId), 'messages'] });
      if (data.patientCopy === 'saved') {
        void client.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-documents'] });
        void client.invalidateQueries({ queryKey: ['/api/contacts/documents', contactId] });
      }
      if (data.patientCopy !== 'failed') {
        attempt.current = null;
        toast({ title: t('erp.dental.consent.send.sent') }); onClose();
      }
    }
  };
  const sendMutation = useMutation({ mutationFn: async () => {
    if (sending.current) return null;
    sending.current = true;
    const payload = attempt.current || { submissionId: crypto.randomUUID(), conversationId: Number(conversationId), proof: preview.proof,
      content, subject, quickTemplateId: officialRequired ? undefined : quickId, officialTemplateId: officialRequired ? officialId : undefined,
      templateValues: officialRequired ? values : {}, savePatientCopy: saveCopy };
    attempt.current = payload;
    const data = new FormData(); data.append('payload', JSON.stringify(payload)); data.append('document', preview.blob, 'consent.pdf');
    try { return (await (await apiRequest('POST', `${base}/consent-send`, data)).json()).data as ConsentDeliveryResult; }
    finally { sending.current = false; }
  }, onSuccess: data => { if (data) { setError(null); complete(data); } }, onError: (cause: any) => {
    const code = cause.errorCode || 'erp.dental.consent.send.checkStatus';
    setError(code);
    if (cause.errorCode && !['erp.dental.consent.errors.request', 'erp.dental.consent.errors.deliveryConflict'].includes(code)) attempt.current = null;
    if (code === 'erp.dental.consent.errors.officialTemplateRequired' || code === 'erp.dental.consent.errors.channelUnavailable') void context.refetch();
  } });
  const copyMutation = useMutation({ mutationFn: async () => (await (await apiRequest('POST', `${base}/consent-deliveries/${result!.id}/patient-copy`)).json()).data as ConsentDeliveryResult,
    onSuccess: complete, onError: () => setError('erp.dental.consent.send.copyFailed') });
  const prepare = useMutation({ mutationFn: async (channelId: number) => (await (await apiRequest('POST', `${base}/consent-conversation`, { channelId, proof: preview.proof })).json()).data,
    onSuccess: async data => { await context.refetch(); setConversationId(String(data.id)); }, onError: () => setError('erp.dental.consent.errors.channelUnavailable') });
  const saveTemplate = useMutation({ mutationFn: async () => {
    const draft = editing!;
    renderConsentMessage(draft.content, context.data?.variables || {});
    return apiRequest(draft.id ? 'PUT' : 'POST', `/api/quick-replies${draft.id ? `/${draft.id}` : ''}`, { name: draft.name, content: draft.content, category: CONSENT_MESSAGE_CATEGORY, variables: CONSENT_MESSAGE_VARIABLES });
  }, onSuccess: async () => { setEditing(null); await templates.refetch(); toast({ title: t('erp.dental.consent.send.templateSaved') }); }, onError: () => setError('erp.dental.consent.send.templateError') });
  const deleteTemplate = useMutation({ mutationFn: async () => apiRequest('DELETE', `/api/quick-replies/${deleting!.id}`),
    onSuccess: async () => { if (quickId === deleting?.id) setQuickId(undefined); setDeleting(null); await templates.refetch(); }, onError: () => setError('erp.dental.consent.send.templateError') });
  const busy = sendMutation.isPending || copyMutation.isPending || prepare.isPending || saveTemplate.isPending || deleteTemplate.isPending;
  const locked = busy || !!attempt.current || result?.status === 'sent';
  const uncertain = result?.status === 'unknown' || result?.status === 'sending';
  const stale = !current || error === 'erp.dental.consent.errors.previewStale' || (context.error as any)?.errorCode === 'erp.dental.consent.errors.previewStale';
  const allowed = canMessage && !stale && !context.isError && !context.isFetching && !!selectedChannel && !validation && !busy && !uncertain && result?.status !== 'sent';
  const insertVariable = (variable: string) => {
    const input = messageInput.current, start = input?.selectionStart ?? content.length, end = input?.selectionEnd ?? start;
    const token = `{{${variable}}}`;
    setContent(content.slice(0, start) + token + content.slice(end));
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
  };
  return <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <DialogContent data-tour="components-erp-dental-consentsenddialog.dialogcontent.erp.dental.consent.send.title" className="max-h-[92dvh] w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl [&_[data-slot=dialog-body]]:min-w-0 [&_[data-slot=dialog-body]]:overflow-x-hidden" closeButtonLabel={t('common.close')} closeButtonDisabled={busy}
      onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}
      onEscapeKeyDown={event => { event.stopPropagation(); if (busy) event.preventDefault(); }}>
      <DialogHeader className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-4 pr-12">
        <DialogTitle className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Send className="h-5 w-5" /></span><span>{t('erp.dental.consent.send.title')}</span></DialogTitle>
        <DialogDescription className="pl-[3.25rem]">{t('erp.dental.consent.send.description')}</DialogDescription>
      </DialogHeader>
      <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
        {context.isLoading ? <p role="status" className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('erp.dental.consent.loading')}</p> : context.isError ? <div role="alert" className="space-y-2 text-sm"><p>{t((context.error as any)?.errorCode || 'erp.dental.consent.errors.load')}</p><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.retry" variant="outline" onClick={() => void context.refetch()}>{t('erp.dental.consent.retry')}</Button></div> : null}
        {!current && <p role="alert" className="text-sm text-destructive">{t('erp.dental.consent.errors.previewStale')}</p>}
        {stale && <Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.send.refreshPreview" variant="outline" disabled={busy} onClick={onRefreshPreview}>{t('erp.dental.consent.send.refreshPreview')}</Button>}
        {context.data && <>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><Avatar className="h-11 w-11 shrink-0 border border-primary/20"><AvatarImage src={context.data.avatarUrl || undefined} alt={context.data.patientName} /><AvatarFallback>{context.data.patientName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><div className="truncate font-semibold">{context.data.patientName}</div><p className="break-words text-xs text-muted-foreground">{context.data.patientReference} · {context.data.procedure} · {t(`erp.dental.consent.${preview.language === 'es' ? 'spanish' : 'english'}`)}</p></div></div>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 p-3"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-words text-sm font-medium">{preview.title}.pdf</p><p className="text-xs text-muted-foreground">{t('erp.dental.consent.send.attachment')}</p></div></div>
          <div className="grid min-w-0 gap-2"><Label htmlFor="consent-send-channel" className="flex items-center gap-2"><InboxConversationIcon className="h-4 w-4 text-muted-foreground" />{t('erp.dental.schedule.reminder.channel')}</Label>
            <Select value={conversationId} disabled={locked} onValueChange={value => { setConversationId(value); setOfficialId(undefined); setValues({}); setError(null); }}><SelectTrigger data-tour="components-erp-dental-consentsenddialog.selecttrigger.consent-send-channel" id="consent-send-channel" className="h-11 min-w-0 overflow-hidden"><SelectValue placeholder={t('erp.dental.schedule.reminder.selectChannel')} /></SelectTrigger><SelectContent>{context.data.conversations.map(c => <SelectItem key={c.id} value={String(c.id)}><span className="flex items-center gap-2">{getChannelIcon(c.channelType)}<span>{getChannelTypeDisplay(c.channelType)} ({c.name})</span></span></SelectItem>)}</SelectContent></Select>
            {conversationId && !selectedChannel && <p role="alert" className="text-xs text-destructive">{t('erp.dental.consent.errors.channelUnavailable')}</p>}
            {!context.data.conversations.length && <p className="text-xs text-muted-foreground">{t('erp.dental.consent.send.noChannels')}</p>}
            {context.data.availableChannels.map(c => <Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.send.startChannel" key={c.id} variant="outline" className="h-auto justify-start whitespace-normal text-left" disabled={locked} onClick={() => prepare.mutate(c.id)}>{getChannelIcon(c.channelType)}{t('erp.dental.consent.send.startChannel')} · {c.name}</Button>)}
          </div>
          {officialRequired ? <div className="grid min-w-0 gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"><p className="text-sm">{t('erp.dental.consent.send.officialHint')}</p>
            <Label htmlFor="consent-send-official">{t('erp.dental.consent.send.officialTemplate')}</Label>
            <Popover open={officialPicker} onOpenChange={setOfficialPicker}><PopoverTrigger asChild><Button data-tour="components-erp-dental-consentsenddialog.button.consent-send-official" id="consent-send-official" role="combobox" variant="outline" disabled={locked} className="min-w-0 justify-between"><span className="truncate">{official?.name || t('erp.dental.consent.send.selectOfficial')}</span><ChevronsUpDown className="h-4 w-4 shrink-0" /></Button></PopoverTrigger><PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"><Command><CommandInput placeholder={t('erp.dental.consent.send.searchTemplates')} /><CommandList><CommandEmpty>{t('erp.dental.consent.send.noOfficial')}</CommandEmpty>{officialTemplates.map(item => <CommandItem key={item.id} value={`${item.name} ${item.whatsappTemplateLanguage}`} onSelect={() => { setOfficialId(item.id); setValues({}); setOfficialPicker(false); }}>{item.name} · {item.whatsappTemplateLanguage}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>
            {official && consentTemplateDefinitions(official).map(def => <div key={def.id} className="grid gap-1"><Label htmlFor={`consent-send-${def.id}`}>{t('erp.dental.consent.send.templateVariable')} {def.name || def.position} ({t(`erp.dental.consent.send.component.${def.component}`)})</Label><Input data-tour="components-erp-dental-consentsenddialog.input.erp.dental.consent.send.templateVariable" id={`consent-send-${def.id}`} disabled={locked} maxLength={2000} value={values[def.id] || ''} onChange={e => setValues(previous => ({ ...previous, [def.id]: e.target.value }))} /><Select disabled={locked} value="" onValueChange={value => setValues(previous => ({ ...previous, [def.id]: `{{${value}}}` }))}><SelectTrigger data-tour="components-erp-dental-consentsenddialog.selecttrigger.erp.dental.consent.send.insertVariable" aria-label={t('erp.dental.consent.send.insertVariable')}><SelectValue placeholder={t('erp.dental.consent.send.insertVariable')} /></SelectTrigger><SelectContent>{CONSENT_MESSAGE_VARIABLES.map(variable => <SelectItem key={variable} value={variable}>{t(`erp.dental.consent.send.variable.${variable}`)}</SelectItem>)}</SelectContent></Select></div>)}
          </div> : <>
            <div className="grid min-w-0 gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{t('erp.dental.schedule.reminder.quickTemplate')}</Label>{canManage && <Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.schedule.reminder.createTemplate" size="sm" variant="ghost" className="h-8 text-primary" disabled={locked} onClick={() => setEditing({ name: '', content })}><Plus className="h-4 w-4" />{t('erp.dental.schedule.reminder.createTemplate')}</Button>}</div>
              <Popover open={picker} onOpenChange={setPicker}><PopoverTrigger asChild><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.send.selectTemplate" variant="outline" role="combobox" aria-label={t('erp.dental.consent.send.selectTemplate')} aria-expanded={picker} disabled={locked} className="h-auto min-h-11 w-full min-w-0 justify-between overflow-hidden px-3 py-2 text-left font-normal"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{quick?.name || t('erp.dental.consent.send.selectTemplate')}</span>{quick && <span className="block truncate text-xs text-muted-foreground">{quick.content}</span>}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0"><Command><CommandInput placeholder={t('erp.dental.consent.send.searchTemplates')} /><CommandList className="max-h-72 overflow-x-hidden"><CommandEmpty>{t('erp.dental.consent.send.noTemplates')}</CommandEmpty>{templates.data?.map(item => <CommandItem key={item.id} value={`${item.name} ${item.content}`} className="group min-w-0 items-start gap-2 py-2.5" onSelect={() => { setQuickId(item.id); setContent(item.content); setPicker(false); }}><Check className={`mt-0.5 h-4 w-4 shrink-0 ${quickId === item.id ? '' : 'opacity-0'}`} /><span className="min-w-0 flex-1"><span className="block break-words font-medium">{item.name}</span><span className="line-clamp-2 break-words text-xs text-muted-foreground">{item.content}</span></span>{canManage && <span className="flex shrink-0 gap-0.5"><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.send.editTemplate" size="icon" variant="ghost" className="h-7 w-7" aria-label={t('erp.dental.consent.send.editTemplate')} onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); setEditing(item); setPicker(false); }}><Pencil className="h-3.5 w-3.5" /></Button><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.send.deleteTemplate" size="icon" variant="ghost" className="h-7 w-7" aria-label={t('erp.dental.consent.send.deleteTemplate')} onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); setDeleting(item); setPicker(false); }}><Trash2 className="h-3.5 w-3.5" /></Button></span>}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>
              {templates.isError && <Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.retry" variant="outline" size="sm" onClick={() => void templates.refetch()}>{t('erp.dental.consent.retry')}</Button>}
            </div>
            {canManage && editing && <div className="grid min-w-0 gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="font-medium">{t(editing.id ? 'erp.dental.consent.send.editTemplate' : 'erp.dental.schedule.reminder.createTemplate')}</p><Input data-tour="components-erp-dental-consentsenddialog.input.editing.name" aria-label={t('erp.dental.schedule.reminder.templateName')} maxLength={120} value={editing.name} disabled={busy} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={t('erp.dental.schedule.reminder.templateName')} /><Textarea data-tour="components-erp-dental-consentsenddialog.textarea.editing.content" aria-label={t('erp.dental.consent.send.message')} value={editing.content} disabled={busy} rows={4} maxLength={8000} showExpandButton={false} onChange={e => setEditing({ ...editing, content: e.target.value })} /><div className="flex flex-wrap justify-end gap-2"><Button data-tour="components-erp-dental-consentsenddialog.button.ui.common.cancel" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>{t('ui.common.cancel')}</Button><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.schedule.reminder.saveTemplateAction" size="sm" disabled={busy || !editing.name.trim() || !editing.content.trim()} onClick={() => saveTemplate.mutate()}><Save className="h-4 w-4" />{t('erp.dental.schedule.reminder.saveTemplateAction')}</Button></div></div>}
            {selectedChannel?.channelType === 'email' && <div className="grid gap-2"><Label htmlFor="consent-send-subject">{t('erp.dental.consent.send.subject')}</Label><Input data-tour="components-erp-dental-consentsenddialog.input.consent-send-subject" id="consent-send-subject" required disabled={locked} maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></div>}
            <div className="grid min-w-0 gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="consent-send-message">{t('erp.dental.consent.send.message')}</Label><Popover><PopoverTrigger asChild><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.schedule.reminder.variables" size="sm" variant="outline" disabled={locked}><Variable className="h-4 w-4" />{t('erp.dental.schedule.reminder.variables')}</Button></PopoverTrigger><PopoverContent align="end" className="max-h-72 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-2"><div className="grid gap-1 sm:grid-cols-2">{CONSENT_MESSAGE_VARIABLES.map(variable => <Button key={variable} size="sm" variant="ghost" className="h-auto justify-start whitespace-normal text-left text-xs" onClick={() => insertVariable(variable)}>{t(`erp.dental.consent.send.variable.${variable}`)}</Button>)}</div></PopoverContent></Popover></div><div className="relative"><Textarea data-tour="components-erp-dental-consentsenddialog.textarea.consent-send-message" ref={messageInput} id="consent-send-message" disabled={locked} rows={6} maxLength={8000} value={content} onChange={e => setContent(e.target.value)} showExpandButton={false} className="min-h-36 min-w-0 resize-y break-words pb-7" /><span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-muted-foreground">{content.length}/8000</span></div></div>
          </>}
          <div className="min-w-0 overflow-hidden rounded-xl border bg-muted/20 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Eye className="h-4 w-4" />{t('erp.dental.schedule.reminder.preview')}</div><div className="ml-auto max-w-[92%] rounded-2xl rounded-br-sm border bg-background px-3 py-2.5 shadow-sm"><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message || t('erp.dental.consent.send.emptyMessage')}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3 shrink-0" />PDF</p></div></div>
          <div className="flex items-start gap-2"><Checkbox id="consent-send-copy" checked={saveCopy} disabled={locked || !canSaveCopy} onCheckedChange={value => setSaveCopy(value === true)} /><Label htmlFor="consent-send-copy" className="text-sm leading-normal">{t('erp.dental.consent.send.saveCopy')}</Label></div>{!canSaveCopy && <p className="text-xs text-muted-foreground">{t('erp.dental.consent.send.copyPermission')}</p>}
          {validation && <p role="status" className="text-xs text-muted-foreground">{t(validation)}</p>}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
        {result && result.status !== 'sent' && <p role="alert" className="text-sm text-destructive">{t(uncertain ? 'erp.dental.consent.send.unknown' : 'erp.dental.consent.send.failed')}</p>}
        {result?.status === 'sent' && result.patientCopy === 'failed' && <div role="alert" className="space-y-2 text-sm"><p>{t('erp.dental.consent.send.copyFailed')}</p><Button data-tour="components-erp-dental-consentsenddialog.button.erp.dental.consent.send.retryCopy" disabled={busy} variant="outline" onClick={() => copyMutation.mutate()}>{t('erp.dental.consent.send.retryCopy')}</Button></div>}
      </div>
      <DialogFooter className="flex-row flex-wrap gap-2 border-t bg-background/95 px-5 py-3 sm:space-x-0"><Button data-tour="components-erp-dental-consentsenddialog.button.ui.common.cancel" variant="outline" disabled={busy} onClick={onClose}>{t('ui.common.cancel')}</Button>{result?.status !== 'sent' && <Button disabled={!allowed} onClick={() => sendMutation.mutate()}>{sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t(attempt.current ? 'erp.dental.consent.send.retrySend' : 'erp.dental.consent.send.action')}</Button>}</DialogFooter>
    </DialogContent>
    <AlertDialog open={!!deleting} onOpenChange={next => { if (!next && !deleteTemplate.isPending) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('erp.dental.consent.send.deleteTemplate')}</AlertDialogTitle><AlertDialogDescription>{t('erp.dental.consent.send.deleteDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteTemplate.isPending}>{t('ui.common.cancel')}</AlertDialogCancel><AlertDialogAction disabled={deleteTemplate.isPending} onClick={e => { e.preventDefault(); deleteTemplate.mutate(); }}>{t('erp.dental.consent.send.deleteTemplate')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Dialog>;
}
