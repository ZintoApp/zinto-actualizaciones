import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Loader2, Pencil, Plus } from 'lucide-react';

type Template = { id: number; name: string; specialtyId: string; body: string; isActive: boolean };
type Specialty = { id: string; label: string; source: 'system' | 'custom'; labelOverridden?: boolean };

export default function DentalProgressNoteTemplatesPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', specialtyId: 'general', body: '', isActive: true });
  const templatesQuery = useQuery({
    queryKey: ['/api/erp/dental/clinical-note-templates', 'settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/clinical-note-templates?includeInactive=true');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadTemplates', 'Failed to load templates'));
      return (json.data ?? []) as Template[];
    },
  });
  const specialtiesQuery = useQuery({
    queryKey: ['/api/erp/dental/clinical-note-specialties'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/clinical-note-specialties');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.loadSpecialties', 'Failed to load specialties'));
      return (json.data ?? []) as Specialty[];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const url = editing ? `/api/erp/dental/clinical-note-templates/${editing.id}` : '/api/erp/dental/clinical-note-templates';
      const res = await apiRequest(editing ? 'PATCH' : 'POST', url, form);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.saveTemplate', 'Failed to save template'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/erp/dental/clinical-note-templates'] });
      setOpen(false); setEditing(null);
      toast({ title: t('erp.dental.clinical.templates.saved', 'Progress-note template saved') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });
  const toggle = useMutation({
    mutationFn: async (template: Template) => {
      const res = await apiRequest('PATCH', `/api/erp/dental/clinical-note-templates/${template.id}`, { isActive: !template.isActive });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('erp.dental.clinical.errors.updateTemplate', 'Failed to update template'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/erp/dental/clinical-note-templates'] }),
  });
  const labels = new Map((specialtiesQuery.data ?? []).map((s) => [
    s.id,
    s.source === 'system' && !s.labelOverridden ? t(`erp.dental.specialties.${s.id}`, s.label) : s.label,
  ]));
  const create = () => { setEditing(null); setForm({ name: '', specialtyId: 'general', body: '', isActive: true }); setOpen(true); };
  const edit = (template: Template) => { setEditing(template); setForm({ name: template.name, specialtyId: template.specialtyId, body: template.body, isActive: template.isActive }); setOpen(true); };

  return <>
    <Card><CardContent className="space-y-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 data-tour="components-erp-settings-dentalprogressnotetemplatespanel.h2.erp.dental.clinical.templates.title" className="text-lg font-semibold">{t('erp.dental.clinical.templates.title', 'Progress Note Templates')}</h2><p className="text-sm text-muted-foreground">{t('erp.dental.clinical.templates.description', 'Create reusable clinical text grouped by dental specialty.')}</p></div>
        {canManage && <Button data-tour="components-erp-settings-dentalprogressnotetemplatespanel.button.erp.dental.clinical.templates.add" size="sm" onClick={create}><Plus className="mr-1 h-4 w-4" />{t('erp.dental.clinical.templates.add', 'Add template')}</Button>}
      </div>
      {templatesQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !templatesQuery.data?.length ? <p className="text-sm text-muted-foreground">{t('erp.dental.clinical.templates.empty', 'No progress-note templates configured.')}</p> : <div className="grid gap-3 md:grid-cols-2">{templatesQuery.data.map((template) => <div key={template.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><FileText className="h-4 w-4" /><strong>{template.name}</strong>{!template.isActive && <Badge variant="secondary">{t('erp.common.inactive', 'Inactive')}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{labels.get(template.specialtyId) ?? template.specialtyId}</p></div>{canManage && <Button data-tour="components-erp-settings-dentalprogressnotetemplatespanel.button.erp.dental.clinical.templates.edit" size="icon" variant="ghost" aria-label={t('erp.dental.clinical.templates.edit', 'Edit template')} onClick={() => edit(template)}><Pencil className="h-4 w-4" /></Button>}</div><p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{template.body}</p>{canManage && <Button data-tour="components-erp-settings-dentalprogressnotetemplatespanel.button.erp.common.archive" className="mt-3" size="sm" variant="outline" onClick={() => toggle.mutate(template)}>{template.isActive ? t('erp.common.archive', 'Archive') : t('erp.common.activate', 'Activate')}</Button>}</div>)}</div>}
    </CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent data-tour="components-erp-settings-dentalprogressnotetemplatespanel.dialogcontent.erp.dental.clinical.templates.edit" className="max-w-xl"><DialogHeader><DialogTitle>{editing ? t('erp.dental.clinical.templates.edit', 'Edit template') : t('erp.dental.clinical.templates.add', 'Add template')}</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>{t('erp.common.name', 'Name')}</Label><Input data-tour="components-erp-settings-dentalprogressnotetemplatespanel.input.erp.common.name" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} /></div><div className="space-y-1.5"><Label>{t('erp.dental.clinical.templates.specialty', 'Specialty')}</Label><Select value={form.specialtyId} onValueChange={(specialtyId) => setForm((v) => ({ ...v, specialtyId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{specialtiesQuery.data?.map((specialty) => <SelectItem key={specialty.id} value={specialty.id}>{specialty.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>{t('erp.dental.clinical.noteBody', 'Note')}</Label><Textarea data-tour="components-erp-settings-dentalprogressnotetemplatespanel.textarea.erp.common.name" rows={10} value={form.body} onChange={(e) => setForm((v) => ({ ...v, body: e.target.value }))} /></div></div><DialogFooter><Button data-tour="components-erp-settings-dentalprogressnotetemplatespanel.button.common.cancel" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel', 'Cancel')}</Button><Button data-tour="components-erp-settings-dentalprogressnotetemplatespanel.button.common.save" disabled={!form.name.trim() || !form.body.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t('common.save', 'Save')}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
