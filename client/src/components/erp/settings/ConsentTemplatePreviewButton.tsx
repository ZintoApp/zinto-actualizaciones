import { useEffect, useState } from 'react';
import { ExternalLink, Eye, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { consentTemplatePreviewSchema, type ConsentTemplatePreviewInput } from '@shared/dental-consent';

export function ConsentTemplatePreviewButton({ input, disabled }: { input: ConsentTemplatePreviewInput; disabled: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const valid = consentTemplatePreviewSchema.safeParse(input).success;
  // Replacing this child cancels ownership of an earlier request without remounting the editor.
  const request = JSON.stringify(input);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button data-tour="components-erp-settings-consenttemplatepreviewbutton.button.erp.dental.consent.preview" type="button" variant="outline" className="h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" disabled={disabled || !valid || open}>
      <Eye className="mr-1.5 h-3.5 w-3.5" />{t('erp.dental.consent.preview')}
    </Button></DialogTrigger>
    {open && <TemplatePreviewContent key={request} request={request} valid={valid} close={() => setOpen(false)} />}
  </Dialog>;
}

function TemplatePreviewContent({ request, valid, close }: { request: string; valid: boolean; close: () => void }) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true, ownedUrl: string | null = null;
    setUrl(null); setError(null); setBusy(valid);
    if (!valid) { setError('erp.dental.consent.errors.validation'); return; }
    void (async () => {
      try {
        const response = await apiRequest('POST', '/api/erp/dental/consent-templates/preview', JSON.parse(request));
        const blob = await response.blob();
        if (!active) return;
        ownedUrl = URL.createObjectURL(blob); setUrl(ownedUrl);
      } catch (cause) {
        if (active) { setError((cause as { errorCode?: string }).errorCode || 'erp.dental.consent.errors.preview'); setErrorParams((cause as { errorParams?: Record<string, string> }).errorParams ?? {}); }
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  }, [request, valid, attempt]);
  return <DialogContent data-tour="components-erp-settings-consenttemplatepreviewbutton.dialogcontent.erp.dental.consent.templatePreviewTitle" className="h-[90dvh] w-[calc(100%-1rem)] max-w-5xl [&>[data-slot=dialog-body]]:flex [&>[data-slot=dialog-body]]:flex-col [&>[data-slot=dialog-body]]:px-3 [&>[data-slot=dialog-body]]:pt-2" closeButtonLabel={t('common.close')}>
    <DialogHeader className="gap-1 px-3 py-3 text-left"><DialogTitle className="pr-8 text-base">{t('erp.dental.consent.templatePreviewTitle')}</DialogTitle><DialogDescription className="text-xs">{t('erp.dental.consent.templatePreviewHint')}</DialogDescription></DialogHeader>
    {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('erp.dental.consent.generating')}</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t(error, undefined, errorParams)}</p><Button data-tour="components-erp-settings-consenttemplatepreviewbutton.button.erp.dental.consent.retry" variant="outline" disabled={!valid} onClick={() => setAttempt(previous => previous + 1)}>{t('erp.dental.consent.retry')}</Button></div>}
    {url && <iframe src={url} title={t('erp.dental.consent.templatePreviewTitle')} className="min-h-0 w-full flex-1 rounded-md border bg-white" />}
    <DialogFooter className="flex-row flex-wrap items-center justify-end gap-3 px-3 py-2 sm:space-x-0">
      {url && <Button data-tour="components-erp-settings-consenttemplatepreviewbutton.button.erp.dental.consent.openPdfNewTab" type="button" variant="outline" aria-label={t('erp.dental.consent.openPdfNewTab')} title={t('erp.dental.consent.openPdfNewTab')} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}><ExternalLink aria-hidden="true" className="mr-1.5 h-4 w-4" />{t('erp.dental.consent.openPdfButton')}</Button>}
      <Button data-tour="components-erp-settings-consenttemplatepreviewbutton.button.common.close" variant="outline" onClick={close}>{t('common.close')}</Button>
    </DialogFooter>
  </DialogContent>;
}
