import { ConsentFieldControls } from '../dental/ConsentFieldControls';
import type { ConsentCustomField } from '@shared/dental-consent-custom-fields';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, FileText, Globe, Loader2, RotateCcw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ConsentTemplatesWorkspace } from './ConsentTemplatesWorkspace';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WysiwygEditor } from '@/components/ui/wysiwyg-editor';
import { ConsentTemplatePreviewButton } from './ConsentTemplatePreviewButton';
import type { ConsentEditorHandle } from '@/components/ui/consent-rich-text-editor';
import { consentBodyHtml, consentBodyText } from '@shared/dental-consent-rich-text';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONSENT_PLACEHOLDERS, consentLanguage, consentTemplateInputSchema, type ConsentLanguage, type ConsentTemplate, type ConsentTranslations } from '@shared/dental-consent';

export default function DentalConsentTemplatesPanel({ canManage }: { canManage: boolean }) {
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ConsentTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [language, setLanguage] = useState<ConsentLanguage>('en');
  const [translations, setTranslations] = useState<ConsentTranslations>({ en: { title: '', body: '' }, es: { title: '', body: '' } });
  const [active, setActive] = useState(false);
  const [detailFieldIds, setDetailFieldIds] = useState<number[]>([]);
  const customFields = useQuery({ queryKey: ['/api/erp/dental/consent-custom-fields'], queryFn: async () => (await (await apiRequest('GET', '/api/erp/dental/consent-custom-fields')).json()).data as ConsentCustomField[] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const bodyRef = useRef<ConsentEditorHandle>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const templates = useQuery({ queryKey: ['/api/erp/dental/consent-templates', 'settings'],
    queryFn: async () => (await (await apiRequest('GET', '/api/erp/dental/consent-templates?includeInactive=true')).json()).data as ConsentTemplate[] });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['/api/erp/dental/consent-templates'] });
  const save = useMutation({ mutationFn: async () => {
    const changed = editing ? Object.fromEntries((['en', 'es'] as const).filter(lang =>
      JSON.stringify(editing.translations[lang]) !== JSON.stringify(translations[lang])).map(lang => [lang, translations[lang]])) : translations;
    return (await (await apiRequest(editing ? 'PATCH' : 'POST', `/api/erp/dental/consent-templates${editing ? `/${editing.key}` : ''}`,
      { translations: changed, isActive: active, detailFieldIds })).json()).data as ConsentTemplate;
  }, onSuccess: data => {
    qc.setQueryData<ConsentTemplate[]>(['/api/erp/dental/consent-templates', 'settings'], previous =>
      previous?.some(template => template.key === data.key) ? previous.map(template => template.key === data.key ? data : template) : [...(previous ?? []), data]);
    if (!editing) setCreatedKey(data.key);
    void invalidate(); setOpen(false); toast({ title: t('erp.dental.consent.saved') });
  },
  onError: (error: Error & { errorCode?: string; errorParams?: Record<string, string> }) => toast({ title: t(error.errorCode || 'erp.dental.consent.errors.save', undefined, error.errorParams), variant: 'destructive' }) });
  const toggle = useMutation({ mutationFn: async (template: ConsentTemplate) => {
    await apiRequest('PATCH', `/api/erp/dental/consent-templates/${template.key}`, { isActive: !template.isActive });
  }, onSuccess: () => invalidate(), onError: () => toast({ title: t('erp.dental.consent.errors.activation'), variant: 'destructive' }) });
  const reset = useMutation({ mutationFn: async () => {
    return (await (await apiRequest('POST', `/api/erp/dental/consent-templates/${editing!.key}/reset`, { language })).json()).data as ConsentTemplate;
  }, onSuccess: data => {
    setEditorRevision(previous => previous + 1);
    setTranslations(previous => ({ ...previous, [language]: data.translations[language] }));
    setEditing(data); void invalidate(); toast({ title: t('erp.dental.consent.restored') });
  }, onError: (error: Error & { errorCode?: string; errorParams?: Record<string, string> }) => toast({ title: t(error.errorCode || 'erp.dental.consent.errors.save', undefined, error.errorParams), variant: 'destructive' }) });
  const edit = (template: ConsentTemplate | null, selectedLanguage: ConsentLanguage = consentLanguage(currentLanguage?.code)) => {
    setSettingsOpen(false);
    setDetailFieldIds(template?.detailFieldIds ?? []);
    setEditorRevision(previous => previous + 1);
    setEditing(template); setTranslations(template ? structuredClone(template.translations) : { en: { title: '', body: '' }, es: { title: '', body: '' } });
    setActive(template?.isActive ?? false); setLanguage(selectedLanguage); setOpen(true);
  };
  const change = (field: 'title' | 'body', value: string) => setTranslations(previous => ({ ...previous, [language]: { ...previous[language], [field]: value } }));
  const insert = (name: string) => {
    bodyRef.current?.insertText(`{{${name}}}`);
  };
  const valid = consentTemplateInputSchema.safeParse({ translations, isActive: active, detailFieldIds }).success && detailFieldIds.every(id => customFields.data?.some(field => field.id === id));
  const busy = save.isPending || reset.isPending;
  const settingsInvalid = (active && !valid) || (!translations[language].title.trim() && !!consentBodyText(translations[language]).trim());
  useEffect(() => { if (open && settingsInvalid) setSettingsOpen(true); }, [open, settingsInvalid]);
  const placeholders = <ConsentFieldControls fields={customFields.data ?? []} onInsert={insert} disabled={busy} />;
  return <>
    <ConsentTemplatesWorkspace templates={templates.data ?? []} loading={templates.isLoading} error={templates.isError}
      canManage={canManage} toggling={toggle.isPending} createdKey={createdKey} onRetry={() => { void templates.refetch(); }}
      onEdit={edit} onToggle={template => toggle.mutate(template)} />
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent data-tour="consent-template-editor" className="consent-template-dialog h-[96dvh] max-h-[96dvh] w-[calc(100%-1rem)] max-w-[1400px] sm:w-[calc(100%-3rem)] [&>[data-slot=dialog-body]]:mr-0 [&>[data-slot=dialog-body]]:p-0" closeButtonLabel={t('common.close')}>
        <DialogHeader className="flex-row items-center gap-3 dark:bg-transparent px-3 py-3 text-left sm:gap-4 sm:px-6 sm:py-4">
          <FileText aria-hidden="true" className="h-7 w-7 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1 pr-8"><DialogTitle className="text-base sm:text-xl">{t(!canManage ? 'erp.dental.consent.view' : editing ? 'erp.dental.consent.edit' : 'erp.dental.consent.add')}</DialogTitle><DialogDescription className="text-xs leading-snug sm:text-sm">{t('erp.dental.consent.editorDescription')}</DialogDescription></div>
        </DialogHeader>
        <div className="flex h-full min-h-[360px] flex-col lg:flex-row">
          <Collapsible open={desktop || settingsOpen} onOpenChange={setSettingsOpen} className="shrink-0 border-b border-border lg:w-[280px] lg:overflow-y-auto lg:border-b-0 lg:border-r xl:w-[320px]">
            <CollapsibleTrigger asChild><Button data-tour="components-erp-settings-dentalconsenttemplatespanel.button.erp.dental.consent.templateSettings" variant="ghost" className="h-auto w-full justify-between whitespace-normal rounded-none px-3 py-3 text-left lg:hidden" aria-label={t('erp.dental.consent.templateSettings')}><span className="space-y-0.5"><span className="block text-sm font-medium">{t('erp.dental.consent.templateSettings')}</span><span className="block text-xs font-normal text-muted-foreground">{t(`erp.dental.consent.${language === 'en' ? 'english' : 'spanish'}`)} · {t(active ? 'erp.common.active' : 'erp.common.inactive')}</span></span><ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} /></Button></CollapsibleTrigger>
            <CollapsibleContent forceMount className={`${desktop || settingsOpen ? '' : 'hidden'} space-y-5 p-3 lg:p-5`}>
              <h3 className="hidden text-lg font-semibold lg:block">{t('erp.dental.consent.templateSettings')}</h3>
              <div className="space-y-2"><Label className="text-sm" htmlFor="consent-template-title">{t('erp.dental.consent.templateTitle')}</Label><Input data-tour="components-erp-settings-dentalconsenttemplatespanel.input.consent-template-title" className="h-10" id="consent-template-title" lang={language} readOnly={!canManage} disabled={busy || !canManage} maxLength={200} value={translations[language].title} onChange={event => change('title', event.target.value)} /></div>
              <div className="space-y-2 border-t border-border pt-4"><h4 className="text-sm font-medium">{t('erp.dental.consent.fields.defaults')}</h4>
                <ConsentFieldControls fields={customFields.data ?? []} selected={detailFieldIds} onFieldsChange={setDetailFieldIds} disabled={busy || !canManage || customFields.isLoading} />
                <p className="text-xs text-muted-foreground">{t('erp.dental.consent.fields.defaultsHint')}</p>
                {customFields.isError && <Button data-tour="components-erp-settings-dentalconsenttemplatespanel.button.erp.dental.consent.retry" variant="outline" size="sm" onClick={() => void customFields.refetch()}>{t('erp.dental.consent.retry')}</Button>}
              </div>
              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-sm font-medium">{t('erp.dental.consent.languages')}</h4>
                <Tabs orientation="vertical" value={language} onValueChange={value => setLanguage(value as ConsentLanguage)}><TabsList  aria-label={t('erp.dental.consent.languages')}>{(['en', 'es'] as const).map(lang => <TabsTrigger key={lang} value={lang} disabled={busy}><Globe aria-hidden="true" className="h-5 w-5 shrink-0" /><span>{t(`erp.dental.consent.${lang === 'en' ? 'english' : 'spanish'}`)}</span>{lang === language && <Check aria-hidden="true" className="ml-auto h-5 w-5 text-primary" />}</TabsTrigger>)}</TabsList></Tabs>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('erp.dental.consent.languageGuidance')}</p>
              </div>
              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-sm font-medium">{t('erp.dental.consent.templateStatus')}</h4>
                <div className="flex items-center gap-2"><Switch id="consent-template-active" checked={active} disabled={busy || !canManage} onCheckedChange={setActive} /><Label className="text-sm" htmlFor="consent-template-active">{t('erp.common.active')}</Label></div>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('erp.dental.consent.activationGuidance')}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:p-5">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><Label className="text-base font-semibold sm:text-lg" htmlFor="consent-template-body">{t('erp.dental.consent.body')}</Label><span className="text-xs text-muted-foreground sm:text-sm">{t(`erp.dental.consent.${language === 'en' ? 'editingEnglish' : 'editingSpanish'}`)}</span></div>
              <ConsentTemplatePreviewButton key={`${editing?.key || 'new'}-${language}-${editorRevision}`} input={{ language, translation: translations[language], detailFieldIds }} disabled={busy} />
            </div>
            <WysiwygEditor className="flex min-h-0 flex-1 flex-col [&_.consent-rich-content]:max-h-none [&_.consent-rich-content]:min-h-32 [&_.consent-rich-content]:flex-1 [&_.consent-rich-content]:p-4 [&_.consent-rich-content]:text-sm [&_.consent-rich-content]:leading-relaxed sm:[&_.consent-rich-content]:p-5 sm:[&_.consent-rich-content]:text-base" key={`${editing?.key || "new"}-${language}-${editorRevision}`} preset="consent" toolbarActions={canManage ? placeholders : undefined} editorHandle={bodyRef} id="consent-template-body" lang={language} readOnly={!canManage} disabled={busy} value={consentBodyHtml(translations[language])} onChange={body => setTranslations(previous => ({ ...previous, [language]: { ...previous[language], body, bodyFormat: "html" } }))} />
            {!valid && <p role="alert" className="shrink-0 text-xs text-destructive">{t('erp.dental.consent.errors.validation')}</p>}
          </div>
        </div>
        <DialogFooter className="flex-row flex-wrap justify-end gap-2 px-3 py-2 sm:space-x-0 sm:px-6">
          {canManage && editing?.isBuiltIn && <Button data-tour="components-erp-settings-dentalconsenttemplatespanel.button.erp.dental.consent.resetConfirm" className="mr-auto gap-2 text-xs sm:text-sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm(t('erp.dental.consent.resetConfirm'))) reset.mutate(); }}><RotateCcw aria-hidden="true" className="h-4 w-4" />{t('erp.dental.consent.restore')}</Button>}
          <div className="ml-auto flex items-center gap-2"><Button data-tour="components-erp-settings-dentalconsenttemplatespanel.button.common.close" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t('common.close')}</Button>{canManage && <Button data-tour="components-erp-settings-dentalconsenttemplatespanel.button.erp.dental.consent.saveChanges" variant="default" data-consent-save disabled={!valid || busy} onClick={() => save.mutate()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('erp.dental.consent.saveChanges')}</Button>}</div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
