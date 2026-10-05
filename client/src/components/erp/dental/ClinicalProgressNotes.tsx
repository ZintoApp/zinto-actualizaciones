import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DENTAL_CLINICAL_NOTE_TYPES } from '@shared/dental-clinical';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, History, Loader2, Lock, Pencil, Plus, Printer, XCircle } from 'lucide-react';

type Filter = 'all' | 'mine' | 'voided';
type Note = {
  kind: 'note'; id: number; noteType: string; body: string; toothRefs: string[] | null;
  treatmentPlanId: number | null; treatmentPlanTitleSnapshot: string | null; isPrivate: boolean;
  revisionNumber: number; voidedAt: string | null; voidReason: string | null; voidedBy: number | null;
  createdBy: number | null; authorName: string | null; createdAt: string; updatedAt: string;
};
type SystemEvent = {
  kind: 'system_event'; id: number; eventType: string; title: string; description: string | null;
  actorName: string | null; occurredAt: string;
};
type FeedEntry = Note | SystemEvent;
type Template = { id: number; name: string; specialtyId: string; body: string };
type Specialty = { id: string; label: string; source: 'system' | 'custom'; labelOverridden?: boolean };
type Plan = { id: number; title: string; status: string; estimatedTotal: string; currency: string };
type Revision = { id: number; revisionNumber: number; action: string; reason: string | null; actorName: string | null; actedAt: string; body: string };

const EMPTY = { noteType: 'note', body: '', toothRefs: '', treatmentPlanId: 'none', isPrivate: false, reason: '' };

export function ClinicalProgressNotes({ contactId }: { contactId: number }) {
  const { t, currentLanguage } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const qc = useQueryClient();
  const canEdit = hasPermission(PERMISSIONS.EDIT_DENTAL_CHART);
  const canViewPrivate = hasPermission(PERMISSIONS.VIEW_PRIVATE_DENTAL_PROGRESS_NOTES);
  const [filter, setFilter] = useState<Filter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [voiding, setVoiding] = useState<Note | null>(null);
  const [historyNote, setHistoryNote] = useState<Note | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [voidReason, setVoidReason] = useState('');

  const feedKey = ['/api/erp/dental/patients', contactId, 'clinical-feed', filter];
  const feedQuery = useQuery({
    queryKey: feedKey,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/clinical-feed?filter=${filter}&limit=100`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadFeed', 'Failed to load clinical progress notes'));
      return (json.data ?? []) as FeedEntry[];
    },
  });
  const plansQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'clinical-note-treatment-plans'],
    enabled: canEdit,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/clinical-note-treatment-plans`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadPlans', 'Failed to load treatment plans'));
      return (json.data ?? []) as Plan[];
    },
  });
  const templatesQuery = useQuery({
    queryKey: ['/api/erp/dental/clinical-note-templates'], enabled: canEdit,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/clinical-note-templates');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadTemplates', 'Failed to load templates'));
      return (json.data ?? []) as Template[];
    },
  });
  const specialtiesQuery = useQuery({
    queryKey: ['/api/erp/dental/clinical-note-specialties'], enabled: canEdit,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/clinical-note-specialties');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadSpecialties', 'Failed to load specialties'));
      return (json.data ?? []) as Specialty[];
    },
  });
  const historyQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'clinical-notes', historyNote?.id, 'history'],
    enabled: !!historyNote,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/clinical-notes/${historyNote!.id}/history`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadHistory', 'Failed to load note history'));
      return (json.data ?? []) as Revision[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-feed'] });
    qc.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'timeline'] });
    qc.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-notes'] });
  };
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        noteType: form.noteType, body: form.body.trim(),
        toothRefs: form.toothRefs.split(/[,\s]+/).map((v) => v.trim()).filter(Boolean),
        treatmentPlanId: form.treatmentPlanId === 'none' ? null : Number(form.treatmentPlanId),
      };
      if (editing) payload.reason = form.reason.trim() || null;
      else payload.isPrivate = form.isPrivate;
      const url = editing
        ? `/api/erp/dental/patients/${contactId}/clinical-notes/${editing.id}`
        : `/api/erp/dental/patients/${contactId}/clinical-notes`;
      const res = await apiRequest(editing ? 'PATCH' : 'POST', url, payload);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.saveNote', 'Failed to save clinical progress note'));
    },
    onSuccess: () => {
      setEditorOpen(false); setEditing(null); setForm({ ...EMPTY }); invalidate();
      toast({ title: t('erp.dental.clinical.noteSaved', 'Clinical progress note saved') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });
  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/erp/dental/patients/${contactId}/clinical-notes/${voiding!.id}/void`, { reason: voidReason.trim() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.voidNote', 'Failed to void note'));
    },
    onSuccess: () => { setVoiding(null); setVoidReason(''); invalidate(); toast({ title: t('erp.dental.clinical.noteVoided', 'Clinical note voided') }); },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const templatesBySpecialty = useMemo(() => {
    const labels = new Map((specialtiesQuery.data ?? []).map((s) => [
      s.id,
      s.source === 'system' && !s.labelOverridden ? t(`erp.dental.specialties.${s.id}`, s.label) : s.label,
    ]));
    const groups = new Map<string, Template[]>();
    for (const template of templatesQuery.data ?? []) {
      const label = labels.get(template.specialtyId) ?? template.specialtyId;
      groups.set(label, [...(groups.get(label) ?? []), template]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [templatesQuery.data, specialtiesQuery.data, t]);

  const locale = currentLanguage?.code?.replace('_', '-') || undefined;
  const formatDate = (value: string) => new Date(value).toLocaleString(locale);
  const noteTypeLabel = (value: string) => t(`erp.dental.clinical.noteType.${value}`, value);
  const eventTitle = (entry: SystemEvent) => t(`erp.dental.clinical.events.${entry.eventType}`, entry.title);
  const revisionAction = (value: string) => t(`erp.dental.clinical.revisionActions.${value}`, value);
  const planStatus = (value: string) => t(`erp.dental.clinical.planStatuses.${value}`, value);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY }); setEditorOpen(true); };
  const openEdit = (note: Note) => {
    setEditing(note);
    setForm({ noteType: note.noteType, body: note.body, toothRefs: note.toothRefs?.join(', ') ?? '', treatmentPlanId: note.treatmentPlanId ? String(note.treatmentPlanId) : 'none', isPrivate: note.isPrivate, reason: '' });
    setEditorOpen(true);
  };
  const useTemplate = (template: Template) => {
    if (form.body.trim() && !window.confirm(t('erp.dental.clinical.templateReplaceConfirm', 'Replace the current note text with this template?'))) return;
    setForm((current) => ({ ...current, body: template.body })); setTemplateOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(['all', 'mine', 'voided'] as Filter[]).map((value) => (
            <Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.filters.all" key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>
              {value === 'all' ? t('erp.dental.clinical.filters.all', 'All Notes') : value === 'mine' ? t('erp.dental.clinical.filters.mine', 'My Notes') : t('erp.dental.clinical.filters.voided', 'Voided Notes')}
            </Button>
          ))}
        </div>
        {canEdit && <Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.addNote" size="sm" className="gap-1.5" onClick={openCreate}><Plus className="h-4 w-4" />{t('erp.dental.clinical.addNote', 'Add progress note')}</Button>}
      </div>

      {feedQuery.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('erp.common.loading', 'Loading...')}</div>
        : !feedQuery.data?.length ? <p className="text-sm text-muted-foreground">{t('erp.dental.clinical.notesEmpty', 'No clinical progress notes yet.')}</p>
        : <div className="relative space-y-3 border-l pl-5 ml-2">
          {feedQuery.data.map((entry) => entry.kind === 'system_event' ? (
            <div key={`event-${entry.id}`} className="relative rounded-lg border bg-muted/30 p-3">
              <span className="absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full bg-muted-foreground" />
              <div className="flex justify-between gap-3"><strong className="text-sm">{eventTitle(entry)}</strong><span className="text-xs text-muted-foreground">{formatDate(entry.occurredAt)}</span></div>
              {entry.description && <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>}
              {entry.actorName && <p className="mt-1 text-xs text-muted-foreground">{entry.actorName}</p>}
            </div>
          ) : (
            <div key={`note-${entry.id}`} className={`relative rounded-lg border p-4 ${entry.voidedAt ? 'opacity-75 bg-muted/40' : 'bg-card'}`}>
              <span className="absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{noteTypeLabel(entry.noteType)}</Badge>
                  {entry.isPrivate && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />{t('erp.dental.clinical.private', 'Private')}</Badge>}
                  {entry.voidedAt && <Badge variant="destructive">{t('erp.dental.clinical.voided', 'Voided')}</Badge>}
                  {entry.revisionNumber > 1 && <Badge variant="secondary">v{entry.revisionNumber}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{entry.body}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{entry.authorName || t('erp.dental.clinical.unknownAuthor', 'Unknown author')}</span>
                {entry.treatmentPlanTitleSnapshot && <span>{entry.treatmentPlanTitleSnapshot}</span>}
                {!!entry.toothRefs?.length && <span>{entry.toothRefs.join(', ')}</span>}
                {entry.voidReason && <span>{t('erp.dental.clinical.voidReason', 'Reason')}: {entry.voidReason}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!entry.voidedAt && canEdit && <Button data-tour="components-erp-dental-clinicalprogressnotes.button.common.edit" size="sm" variant="outline" className="gap-1" onClick={() => openEdit(entry)}><Pencil className="h-3.5 w-3.5" />{t('common.edit', 'Edit')}</Button>}
                {!entry.voidedAt && canEdit && (entry.createdBy === user?.id || canViewPrivate) && <Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.void" size="sm" variant="destructive" className="gap-1" onClick={() => setVoiding(entry)}><XCircle className="h-3.5 w-3.5" />{t('erp.dental.clinical.void', 'Void')}</Button>}
                <Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.history" size="sm" variant="ghost" className="gap-1" onClick={() => setHistoryNote(entry)}><History className="h-3.5 w-3.5" />{t('erp.dental.clinical.history', 'History')}</Button>
                <Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.print" size="sm" variant="ghost" className="gap-1" onClick={() => window.open(`/api/erp/dental/patients/${contactId}/clinical-notes/${entry.id}/pdf`, '_blank', 'noopener,noreferrer')}><Printer className="h-3.5 w-3.5" />{t('erp.dental.clinical.print', 'Print')}</Button>
              </div>
            </div>
          ))}
        </div>}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent data-tour="components-erp-dental-clinicalprogressnotes.dialogcontent.erp.dental.clinical.editNote" className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('erp.dental.clinical.editNote', 'Amend progress note') : t('erp.dental.clinical.addNote', 'Add progress note')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t('erp.dental.clinical.noteTypeLabel', 'Type')}</Label><Select value={form.noteType} onValueChange={(noteType) => setForm((v) => ({ ...v, noteType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DENTAL_CLINICAL_NOTE_TYPES.map((v) => <SelectItem key={v} value={v}>{noteTypeLabel(v)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>{t('erp.dental.clinical.treatmentPlan', 'Treatment plan / budget')}</Label><Select value={form.treatmentPlanId} onValueChange={(treatmentPlanId) => setForm((v) => ({ ...v, treatmentPlanId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>{plansQuery.data?.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{plan.title} · {planStatus(plan.status)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>{t('erp.dental.clinical.toothRefs', 'Tooth refs (optional)')}</Label><Input data-tour="components-erp-dental-clinicalprogressnotes.input.erp.dental.clinical.toothRefsPlaceholder" value={form.toothRefs} onChange={(e) => setForm((v) => ({ ...v, toothRefs: e.target.value }))} placeholder={t('erp.dental.clinical.toothRefsPlaceholder', 'e.g. 11, 21, 36')} /></div>
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between"><Label>{t('erp.dental.clinical.noteBody', 'Note')}</Label>{!editing && <Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.useTemplate" size="sm" variant="outline" type="button" onClick={() => setTemplateOpen(true)}><FileText className="mr-1 h-3.5 w-3.5" />{t('erp.dental.clinical.useTemplate', 'Use Template')}</Button>}</div>
              <Textarea data-tour="components-erp-dental-clinicalprogressnotes.textarea.erp.dental.clinical.noteTypeLabel" rows={8} value={form.body} onChange={(e) => setForm((v) => ({ ...v, body: e.target.value }))} />
            </div>
            {editing ? <div className="space-y-1.5 sm:col-span-2"><Label>{t('erp.dental.clinical.editReason', 'Amendment reason (optional)')}</Label><Input data-tour="components-erp-dental-clinicalprogressnotes.input.erp.dental.clinical.editReason" value={form.reason} onChange={(e) => setForm((v) => ({ ...v, reason: e.target.value }))} /></div>
              : <div className="flex items-center gap-2 sm:col-span-2"><Switch checked={form.isPrivate} onCheckedChange={(isPrivate) => setForm((v) => ({ ...v, isPrivate }))} /><Label>{t('erp.dental.clinical.markPrivate', 'Mark as Private')}</Label></div>}
          </div>
          <DialogFooter><Button data-tour="components-erp-dental-clinicalprogressnotes.button.common.cancel" variant="outline" onClick={() => setEditorOpen(false)}>{t('common.cancel', 'Cancel')}</Button><Button data-tour="components-erp-dental-clinicalprogressnotes.button.common.save" disabled={!form.body.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t('common.save', 'Save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}><DialogContent data-tour="components-erp-dental-clinicalprogressnotes.dialogcontent.erp.dental.clinical.useTemplate" className="max-w-xl"><DialogHeader><DialogTitle>{t('erp.dental.clinical.useTemplate', 'Use Template')}</DialogTitle></DialogHeader><div className="max-h-[60vh] space-y-4 overflow-y-auto">{templatesBySpecialty.length === 0 ? <p className="text-sm text-muted-foreground">{t('erp.dental.clinical.templates.noActive', 'No active templates are available.')}</p> : templatesBySpecialty.map(([specialty, templates]) => <div key={specialty}><h3 className="mb-2 text-sm font-semibold">{specialty}</h3><div className="space-y-2">{templates.map((template) => <button key={template.id} type="button" className="w-full rounded-md border p-3 text-left hover:bg-muted" onClick={() => useTemplate(template)}><div className="font-medium">{template.name}</div><div className="line-clamp-2 text-xs text-muted-foreground">{template.body}</div></button>)}</div></div>)}</div></DialogContent></Dialog>

      <Dialog open={!!voiding} onOpenChange={(open) => !open && setVoiding(null)}><DialogContent data-tour="components-erp-dental-clinicalprogressnotes.dialogcontent.erp.dental.clinical.voidNote"><DialogHeader><DialogTitle>{t('erp.dental.clinical.voidNote', 'Void clinical note')}</DialogTitle></DialogHeader><div className="space-y-2"><Label>{t('erp.dental.clinical.voidReason', 'Reason')}</Label><Textarea data-tour="components-erp-dental-clinicalprogressnotes.textarea.erp.dental.clinical.voidReason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={4} /></div><DialogFooter><Button data-tour="components-erp-dental-clinicalprogressnotes.button.common.cancel" variant="outline" onClick={() => setVoiding(null)}>{t('common.cancel', 'Cancel')}</Button><Button data-tour="components-erp-dental-clinicalprogressnotes.button.erp.dental.clinical.void" variant="destructive" disabled={voidReason.trim().length < 3 || voidMutation.isPending} onClick={() => voidMutation.mutate()}>{t('erp.dental.clinical.void', 'Void')}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!historyNote} onOpenChange={(open) => !open && setHistoryNote(null)}><DialogContent data-tour="components-erp-dental-clinicalprogressnotes.dialogcontent.erp.dental.clinical.history" className="max-w-2xl"><DialogHeader><DialogTitle>{t('erp.dental.clinical.history', 'Amendment history')}</DialogTitle></DialogHeader>{historyQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !historyQuery.data?.length ? <p className="text-sm text-muted-foreground">{t('erp.dental.clinical.historyEmpty', 'No history is available.')}</p> : <div className="max-h-[65vh] space-y-3 overflow-y-auto">{historyQuery.data.map((revision) => <div key={revision.id} className="rounded-md border p-3"><div className="flex justify-between text-xs text-muted-foreground"><span>v{revision.revisionNumber} · {revisionAction(revision.action)} · {revision.actorName || '—'}</span><span>{formatDate(revision.actedAt)}</span></div>{revision.reason && <p className="mt-1 text-xs"><strong>{t('erp.dental.clinical.voidReason', 'Reason')}:</strong> {revision.reason}</p>}<p className="mt-2 whitespace-pre-wrap text-sm">{revision.body}</p></div>)}</div>}</DialogContent></Dialog>
    </div>
  );
}
