import { Checkbox } from '@/components/ui/checkbox';
import { ConsentFieldControls } from './ConsentFieldControls';
import { consentCustomFieldIds } from '@shared/dental-consent-custom-fields';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Printer,
  Send,
  Eye as TabIconEye,
  Info as TabIconInfo,
} from 'lucide-react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { ConsentSendDialog, type ConsentSendPreview } from './ConsentSendDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { consentLanguage, isConsentLanguage, consentPreviewSchema, type ConsentContext, type ConsentPreviewFields, type ConsentTemplate } from '@shared/dental-consent';
import { ConsentProviderSelect } from './ConsentProviderSelect';
import { ConsentProcedureSelect } from './ConsentProcedureSelect';

export function ConsentFormsDialog({ contactId }: { contactId: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button data-tour="components-erp-dental-consentformsdialog.button.erp.dental.consent.action" size="sm" variant="outline" onClick={() => setOpen(true)}><FileText className="mr-1.5 h-4 w-4" />{t('erp.dental.consent.action')}</Button>
    {open && <ConsentFormContent key={contactId} contactId={contactId} close={() => setOpen(false)} />}
  </Dialog>;
}

function ConsentFormContent({ contactId, close }: { contactId: number; close: () => void }) {
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const canSend = hasPermission(PERMISSIONS.MANAGE_CONVERSATIONS);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSnapshot, setSendSnapshot] = useState<ConsentSendPreview | null>(null);
  const [sendSession, setSendSession] = useState(0);
  const sendButton = useRef<HTMLButtonElement>(null);
  const [language, setLanguage] = useState(() => consentLanguage(currentLanguage?.code));
  const [overrides, setOverrides] = useState<Partial<ConsentPreviewFields>>({});
  const [providerChoice, setProviderChoice] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [preview, setPreview] = useState<ConsentSendPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, string>>({});
  const [signatureIncluded, setSignatureIncluded] = useState(true);
  const [detailOverride, setDetailOverride] = useState<{ key: string; ids: number[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState('details');
  const [attempted, setAttempted] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const generation = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();
  const context = useQuery({ queryKey: ['/api/erp/dental/patients', contactId, 'consent-context'],
    queryFn: async () => (await (await apiRequest('GET', `/api/erp/dental/patients/${contactId}/consent-context`)).json()).data as ConsentContext });
  const templates = useQuery({ queryKey: ['/api/erp/dental/consent-templates'],
    queryFn: async () => (await (await apiRequest('GET', '/api/erp/dental/consent-templates')).json()).data as ConsentTemplate[] });
  const providers = context.data?.providers ?? [];
  useEffect(() => {
    if (!context.data || context.isError) return;
    if (providerChoice === null) {
      if (context.isFetching) return;
      const available = context.data.providers;
      const preferred = available.find(provider => provider.id === context.data?.preferredProviderUserId);
      setProviderChoice(preferred ? String(preferred.id) : available.length === 1 ? String(available[0].id) : available.length === 0 ? 'manual' : '');
    } else if (providerChoice && providerChoice !== 'manual' && !context.data.providers.some(provider => String(provider.id) === providerChoice)) {
      setProviderChoice(''); setProviderUnavailable(true);
    }
  }, [context.data, context.isError, context.isFetching, providerChoice]);
  const selectedProvider = providers.find(provider => String(provider.id) === providerChoice);
  const currentTemplateKey = overrides.templateKey ?? templates.data?.[0]?.key ?? '';
  const selectedTemplate = templates.data?.find(template => template.key === currentTemplateKey);
  const fields: ConsentPreviewFields = { templateKey: templates.data?.[0]?.key ?? '', language,
    consentDate: context.data?.today ?? '', patientIdentification: '', guardianName: '', ...overrides,
    providerUserId: selectedProvider?.id,
    includeProviderSignature: !!selectedProvider?.signatureRevision && signatureIncluded,
    detailFieldIds: detailOverride?.key === currentTemplateKey ? detailOverride.ids : selectedTemplate?.detailFieldIds ?? [],
    professionalName: providerChoice === 'manual' ? overrides.professionalName ?? '' : selectedProvider?.name ?? '' };
  const { patientAvatarUrl, providers: _providers, customFields, customFieldValues, ...documentContext } = context.data ?? {};
  const usedFieldIds = [...new Set([...(fields.detailFieldIds ?? []), ...consentCustomFieldIds(selectedTemplate?.translations[language].body ?? '')])];
  const key = JSON.stringify([fields, documentContext, selectedTemplate, fields.includeProviderSignature ? selectedProvider?.signatureRevision : null, (customFields ?? []).filter(field => usedFieldIds.includes(field.id)), usedFieldIds.map(id => customFieldValues?.[id])]);
  const latestKey = useRef(key); latestKey.current = key;
  const currentPreview = preview?.key === key ? preview : null;
  useEffect(() => { if (preview && preview.key !== key) { setPreview(null); setLoaded(false); } }, [key, preview]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const invalidate = () => { clearTimeout(previewTimer.current); generation.current++; setPreview(null); setLoaded(false); setBusy(false); setError(null); };
  const update = (name: keyof ConsentPreviewFields, value: string) => { if (fields[name] === value) return; invalidate(); setOverrides(previous => ({ ...previous, [name]: value })); };
  const generate = async (showPreview = true) => {
    clearTimeout(previewTimer.current);
    const request = ++generation.current;
    setBusy(true); setAttempted(true); setError(null); setPreview(null); setLoaded(false);
    try {
      const response = await apiRequest('POST', `/api/erp/dental/patients/${contactId}/consent-preview`, fields);
      const blob = await response.blob();
      if (request !== generation.current || key !== latestKey.current) return;
      setPreview({ url: URL.createObjectURL(blob), key, blob, contactId, proof: response.headers.get('X-Consent-Preview-Proof') || '', language, title: templates.data?.find(item => item.key === fields.templateKey)?.translations[language].title || '' });
      if (showPreview) setPanel('preview');
    } catch (cause) { if (request === generation.current && key === latestKey.current) {
      const code = (cause as { errorCode?: string }).errorCode || 'erp.dental.consent.errors.preview';
      if (code === 'erp.dental.consent.errors.providerUnavailable') { setProviderChoice(''); setProviderUnavailable(true); setPanel('details'); void context.refetch(); }
      else { setError(code); setErrorParams((cause as { errorParams?: Record<string, string> }).errorParams ?? {}); if (code === 'erp.dental.consent.errors.signatureUnavailable') void context.refetch(); if (showPreview) setPanel('preview'); }
    } }
    finally { if (request === generation.current) setBusy(false); }
  };
  const print = () => {
    try {
      if (!currentPreview || !loaded || !iframe.current?.contentWindow) return;
      flushSync(() => setPanel('preview'));
      iframe.current.contentWindow.focus(); iframe.current.contentWindow.print();
    } catch { toast({ title: t('erp.dental.consent.printFallback'), variant: 'destructive' }); }
  };
  const loadError = context.isError || templates.isError;
  const loading = context.isLoading || templates.isLoading || (providerChoice === null && context.isFetching);
  const valid = consentPreviewSchema.safeParse(fields).success && !!templates.data?.some(item => item.key === fields.templateKey && item.isActive);
  // Only document inputs/data schedule regeneration. UI state and failed requests
  // must not cause repeated requests or move focus away from mobile editing.
  const generateLatest = useRef(generate); generateLatest.current = generate;
  useEffect(() => {
    generation.current++;
    setPreview(null); setLoaded(false); setError(null);
    const canGenerate = valid && !loading && !loadError;
    setBusy(canGenerate);
    if (canGenerate) previewTimer.current = setTimeout(() => { void generateLatest.current(false); }, 300);
    return () => { clearTimeout(previewTimer.current); generation.current++; };
  }, [key, valid, loading, loadError]);
  const ready = !!currentPreview && loaded && !busy;
  return <><DialogContent data-tour="components-erp-dental-consentformsdialog.dialogcontent.erp.dental.consent.action" className="consent-forms-dialog h-[96dvh] max-h-[96dvh] w-[calc(100%-1rem)] max-w-[1400px] sm:w-[calc(100%-3rem)] [&>[data-slot=dialog-body]]:mr-0 [&>[data-slot=dialog-body]]:flex [&>[data-slot=dialog-body]]:overflow-hidden [&>[data-slot=dialog-body]]:p-0" closeButtonLabel={t('common.close')}>
    <DialogHeader className="space-y-1 px-3 py-3 text-left sm:px-4 dark:bg-transparent"><DialogTitle className="pr-8 text-lg font-semibold">{t('erp.dental.consent.action')}</DialogTitle>
      <DialogDescription className="pr-5 text-xs leading-relaxed">{t('erp.dental.consent.description')}</DialogDescription></DialogHeader>
    <Tabs value={panel} onValueChange={setPanel} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TabsList className="mx-3 my-2 shrink-0 lg:hidden" aria-label={t('erp.dental.consent.panelNavigation')}><TabsTrigger icon={TabIconInfo} data-tour="components-erp-dental-consentformsdialog.tabstrigger.details" value="details">{t('erp.dental.consent.detailsTab')}</TabsTrigger><TabsTrigger icon={TabIconEye} data-tour="components-erp-dental-consentformsdialog.tabstrigger.preview" value="preview">{t('erp.dental.consent.preview')}</TabsTrigger></TabsList>
      <div className="flex min-h-0 min-w-0 flex-1">
      <TabsContent data-tour="components-erp-dental-consentformsdialog.tabscontent.details" forceMount value="details" className="company-sidebar-scrollbar m-0 min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 data-[state=inactive]:hidden lg:basis-[320px] lg:grow-0 lg:shrink-0 xl:basis-[360px] lg:border-r lg:border-border lg:p-4 lg:data-[state=inactive]:block [&_label]:text-xs [&_input]:h-9 [&_input]:text-sm [&_button[role=combobox]]:min-h-9 [&_button[role=combobox]]:h-9">
      {loading ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('erp.dental.consent.loading')}</p>
        : loadError ? <div role="alert" className="space-y-2"><p>{t('erp.dental.consent.errors.load')}</p><Button data-tour="components-erp-dental-consentformsdialog.button.erp.dental.consent.retry" variant="outline" onClick={() => { void context.refetch(); void templates.refetch(); }}>{t('erp.dental.consent.retry')}</Button></div>
        : <>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs"><div className="shrink-0"><ContactAvatar contact={{ id: contactId, name: context.data?.patientName ?? '', avatarUrl: patientAvatarUrl }} size="sm" showRefreshButton={false} className="h-6 w-6" /></div><div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"><strong className="min-w-0 break-words">{context.data?.patientName}</strong><span className="border-l border-border pl-2 text-muted-foreground">{context.data?.patientReference}</span></div></div>
          {!isConsentLanguage(currentLanguage?.code) && <p role="status" className="text-sm text-muted-foreground">{t('erp.dental.consent.languageFallback')}</p>}
          {!templates.data?.length ? <p>{t('erp.dental.consent.empty')}</p> : <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t('erp.dental.consent.documentDetails')}</h3>
            <div className="space-y-1.5"><Label htmlFor="consent-procedure">{t('erp.dental.consent.procedure')}</Label>
              <ConsentProcedureSelect key={language} templates={templates.data ?? []} language={language} value={fields.templateKey} onChange={value => { setDetailOverride(null); update('templateKey', value); }} /></div>
            <div className="space-y-1.5"><Label htmlFor="consent-language">{t('erp.dental.consent.language')}</Label>
              <Select value={language} onValueChange={value => { if (value === language) return; invalidate(); setLanguage(consentLanguage(value)); }}><SelectTrigger data-tour="components-erp-dental-consentformsdialog.selecttrigger.consent-language" id="consent-language"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">{t('erp.dental.consent.english')}</SelectItem><SelectItem value="es">{t('erp.dental.consent.spanish')}</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="consent-professionalName">{t('erp.dental.consent.professionalName')}</Label>
              <ConsentProviderSelect providers={providers} value={providerChoice ?? ''} onChange={value => { if (value === providerChoice) return; invalidate(); setProviderChoice(value); setProviderUnavailable(false); }} />
              <div className="flex items-center gap-2 pt-1"><Checkbox id="consent-provider-signature" checked={!!fields.includeProviderSignature} disabled={!selectedProvider?.signatureRevision} onCheckedChange={value => { invalidate(); setSignatureIncluded(value === true); }} /><Label htmlFor="consent-provider-signature">{t('erp.dental.consent.signature.include')}</Label></div>
              {!selectedProvider?.signatureRevision && <p className="text-xs text-muted-foreground">{t('erp.dental.consent.signature.unavailable')}</p>}
              {!providers.length && <p className="text-xs text-muted-foreground">{t('erp.dental.consent.noProviders')}</p>}
              {providerUnavailable && <p role="alert" className="text-xs text-destructive">{t('erp.dental.consent.errors.providerUnavailable')}</p>}
              {providerChoice === 'manual' && <Input data-tour="components-erp-dental-consentformsdialog.input.consent-manualProfessionalName" id="consent-manualProfessionalName" aria-label={t('erp.dental.consent.manualProfessional')} placeholder={t('erp.dental.consent.professionalName')} maxLength={200} required value={overrides.professionalName ?? ''} onChange={event => update('professionalName', event.target.value)} />}
            </div>
            <div className="space-y-1.5"><Label htmlFor="consent-consentDate">{t('erp.dental.consent.consentDate')}</Label><Input data-tour="components-erp-dental-consentformsdialog.input.consent-consentDate" id="consent-consentDate" className="[color-scheme:light] dark:[color-scheme:dark]" type="date" required value={fields.consentDate} onChange={event => update('consentDate', event.target.value)} /></div>
            <div className="space-y-3 border-t border-border pt-3"><h3 className="text-sm font-semibold">{t('erp.dental.consent.additionalDetails')}</h3>
            <ConsentFieldControls fields={customFields ?? []} selected={fields.detailFieldIds ?? []} onFieldsChange={ids => { invalidate(); setDetailOverride({ key: currentTemplateKey, ids }); }} />
            {(['patientIdentification', 'guardianName'] as const).map(name => <div className="space-y-1.5" key={name}><Label htmlFor={`consent-${name}`}>{t(`erp.dental.consent.${name}`)}</Label><Input id={`consent-${name}`} maxLength={name === 'patientIdentification' ? 120 : 200} value={fields[name]} onChange={event => update(name, event.target.value)} /></div>)}
            </div>
          </div>}
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs leading-normal text-muted-foreground"><Info aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /><p>{t('erp.dental.consent.signatureHint')}</p></div>
        </>}
      </TabsContent>
      <TabsContent data-tour="components-erp-dental-consentformsdialog.tabscontent.preview" forceMount value="preview" className="m-0 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3 data-[state=inactive]:hidden lg:p-4 lg:data-[state=inactive]:flex">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t('erp.dental.consent.documentPreview')}</h3><Button data-tour="components-erp-dental-consentformsdialog.button.erp.dental.consent.openPdfNewTab" size="sm" variant="outline" disabled={!ready} aria-label={t('erp.dental.consent.openPdfNewTab')} title={t('erp.dental.consent.openPdfNewTab')} onClick={() => { if (ready) window.open(currentPreview!.url, '_blank', 'noopener,noreferrer'); }}><ExternalLink aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />{t('erp.dental.consent.openPdfButton')}</Button></div>
        <div className="relative flex min-h-32 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/40">
          {busy ? <div role="status" className="flex flex-1 items-center justify-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin" />{t('erp.dental.consent.generating')}</div>
            : error ? <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center text-sm"><p className="text-destructive">{t(error, undefined, errorParams)}</p><Button data-tour="components-erp-dental-consentformsdialog.button.erp.dental.consent.retry" variant="outline" disabled={loading || loadError || !valid} onClick={() => void generate()}>{t('erp.dental.consent.retry')}</Button></div>
            : currentPreview ? <><iframe ref={iframe} src={currentPreview.url} title={t('erp.dental.consent.previewTitle')} className="min-h-0 w-full flex-1 border-0 bg-white" onLoad={() => setLoaded(true)} />{!loaded && <p role="status" className="absolute inset-x-0 top-0 bg-background/95 p-3 text-center text-sm">{t('erp.dental.consent.loading')}</p>}</>
            : <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"><FileText aria-hidden="true" className="h-10 w-10 opacity-60" /><p>{t(attempted ? 'erp.dental.consent.previewChanged' : 'erp.dental.consent.previewEmpty')}</p></div>}
        </div>
      </TabsContent>
      </div>
    </Tabs>
    <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2 px-3 py-2 sm:space-x-0 sm:px-4">
      <div className="ml-auto flex flex-wrap justify-end gap-2"><Button data-tour="components-erp-dental-consentformsdialog.button.common.close" variant="outline" onClick={close}>{t('common.close')}</Button><Button data-tour="components-erp-dental-consentformsdialog.button.erp.dental.consent.send.button" ref={sendButton} variant="outline" disabled={!ready || !canSend || !currentPreview?.proof} onClick={() => { setSendSnapshot(currentPreview); setSendSession(value => value + 1); setSendOpen(true); }}><Send className="mr-2 h-4 w-4" />{t('erp.dental.consent.send.button')}</Button><Button data-tour="components-erp-dental-consentformsdialog.button.erp.dental.consent.print" data-consent-print variant="default" disabled={!ready} onClick={print}><Printer className="mr-2 h-4 w-4" />{t('erp.dental.consent.print')}</Button></div>
    </DialogFooter>
  </DialogContent>{sendSnapshot && <ConsentSendDialog key={sendSession} open={sendOpen} onClose={() => setSendOpen(false)} onReturnFocus={() => sendButton.current?.focus()} onRefreshPreview={() => { setSendOpen(false); void generate(false); }} preview={sendSnapshot} current={ready && currentPreview?.key === sendSnapshot.key} />}</>;
}
