import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Pencil, Trash2 } from 'lucide-react';
import { DEFAULT_SIGNATURE_SETTINGS, SIGNATURE_MAX_BYTES, SIGNATURE_MAX_DIMENSION, signatureCropPixels, signatureSettingsSchema, enhanceSignaturePixels, type SignatureSettings, type UserSignatureMetadata } from '@shared/user-signature';

const queryKey = ['/api/users/me/signature'];
type Draft = { file: Blob; settings: SignatureSettings };
export function UserSignatureCard() {
  const { t } = useTranslation(); const { toast } = useToast(); const qc = useQueryClient();
  const label = (key: string) => t(`profile.signature.${key}`);
  const signature = useQuery({ queryKey, queryFn: async () => (await (await apiRequest('GET', queryKey[0])).json()).data as UserSignatureMetadata | null });
  const [draft, setDraft] = useState<Draft | null>(null), [opening, setOpening] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const refreshConsents = () => void qc.invalidateQueries({ predicate: query => query.queryKey.includes('consent-context') });
  const remove = useMutation({ mutationFn: () => apiRequest('DELETE', queryKey[0]), onSuccess: () => { qc.setQueryData(queryKey, null); refreshConsents(); toast({ title: label('removed') }); }, onError: () => toast({ title: label('errors.save'), variant: 'destructive' }) });
  const choose = (file?: File) => {
    if (!file) return;
    if (file.size > SIGNATURE_MAX_BYTES || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { toast({ title: label(file.size > SIGNATURE_MAX_BYTES ? 'errors.tooLarge' : 'errors.invalid'), variant: 'destructive' }); return; }
    setDraft({ file, settings: structuredClone(DEFAULT_SIGNATURE_SETTINGS) });
  };
  const edit = async () => {
    if (!signature.data) return; setOpening(true);
    try { const response = await apiRequest('GET', signature.data.originalUrl); setDraft({ file: await response.blob(), settings: signature.data.settings }); }
    catch { toast({ title: label('errors.load'), variant: 'destructive' }); } finally { setOpening(false); }
  };
  return <Card className="profile-card profile-signature-card min-w-0 overflow-hidden"><CardHeader className="profile-card-header"><CardTitle className="profile-card-title">{label('title')}</CardTitle><CardDescription>{label('description')}</CardDescription></CardHeader>
    <CardContent className="profile-card-content space-y-3">
      {signature.isLoading ? <p role="status">{label('loading')}</p> : signature.isError ? <div role="alert"><p>{label('errors.load')}</p><Button variant="outline" onClick={() => void signature.refetch()}>{t('erp.dental.consent.retry')}</Button></div> : <>
        <div className="profile-signature-layout">
          <div className="min-w-0 space-y-2">
            <div className="profile-signature-preview flex min-h-24 items-center justify-center rounded-md border bg-white p-3">{signature.data ? <img src={signature.data.imageUrl} alt={label('savedImage')} className="max-h-full max-w-full object-contain" /> : <p className="text-sm text-slate-500">{label('empty')}</p>}</div>
            <p className="text-xs text-muted-foreground">{label('formats')}</p>
          </div>
          <div className="profile-signature-actions flex flex-wrap gap-2"><input ref={picker} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={label('upload')} onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />
            <Button size="sm" variant="outline" disabled={opening || remove.isPending} onClick={() => picker.current?.click()}><Upload aria-hidden="true" />{label(signature.data ? 'replace' : 'upload')}</Button>
            {signature.data && <><Button size="sm" variant="outline" disabled={opening || remove.isPending} onClick={() => void edit()}><Pencil aria-hidden="true" />{label('edit')}</Button><Button size="sm" variant="outline" className="profile-signature-remove" disabled={opening || remove.isPending} onClick={() => { if (window.confirm(label('removeConfirm'))) remove.mutate(); }}><Trash2 aria-hidden="true" />{label('remove')}</Button></>}
          </div>
        </div>
      </>}
    </CardContent>
    {draft && <SignatureEditor draft={draft} close={() => setDraft(null)} saved={data => { qc.setQueryData(queryKey, data); refreshConsents(); setDraft(null); toast({ title: label('saved') }); }} />}
  </Card>;
}
function SignatureEditor({ draft, close, saved }: { draft: Draft; close: () => void; saved: (data: UserSignatureMetadata) => void }) {
  const { t } = useTranslation(); const label = (key: string) => t(`profile.signature.${key}`);
  const [settings, setSettings] = useState(draft.settings), [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [rotated, setRotated] = useState(''), [processed, setProcessed] = useState(''), [error, setError] = useState<string | null>(null);
  const save = useMutation({ mutationFn: async () => {
    const form = new FormData(); form.append('original', draft.file, 'signature'); form.append('settings', JSON.stringify(settings));
    const response = await fetch(queryKey[0], { method: 'POST', body: form, credentials: 'include' });
    const body = await response.json(); if (!response.ok) throw new Error(body.errorCode || 'profile.signature.errors.save'); return body.data as UserSignatureMetadata;
  }, onSuccess: saved, onError: cause => setError(cause.message) });
  useEffect(() => {
    let active = true;
    void createImageBitmap(draft.file).then(bitmap => {
      try {
        if (bitmap.width * bitmap.height > 25_000_000) throw new Error('invalid');
        const scale = Math.min(1, SIGNATURE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); if (active) setSource(canvas);
      } finally { bitmap.close(); }
    }).catch(() => { if (active) setError('profile.signature.errors.invalid'); });
    return () => { active = false; };
  }, [draft.file]);
  useEffect(() => {
    if (!source || !signatureSettingsSchema.safeParse(settings).success) return;
    const canvas = document.createElement('canvas'), quarter = settings.rotation % 180 !== 0;
    canvas.width = quarter ? source.height : source.width; canvas.height = quarter ? source.width : source.height;
    const ctx = canvas.getContext('2d')!; ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(settings.rotation * Math.PI / 180); ctx.drawImage(source, -source.width / 2, -source.height / 2);
    setRotated(canvas.toDataURL('image/png'));
    const crop = signatureCropPixels(settings.crop, canvas.width, canvas.height), pixels = ctx.getImageData(crop.left, crop.top, crop.width, crop.height);
    enhanceSignaturePixels(pixels.data, settings);
    const result = document.createElement('canvas'); result.width = crop.width; result.height = crop.height; result.getContext('2d')!.putImageData(pixels, 0, 0); setProcessed(result.toDataURL('image/png'));
  }, [source, settings]);
  const change = <K extends keyof SignatureSettings>(key: K, value: SignatureSettings[K]) => { setError(null); setSettings(previous => ({ ...previous, [key]: value })); };
  const crop: PercentCrop = { unit: '%', ...settings.crop };
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) close(); }}><DialogContent className="max-h-[96dvh] w-[calc(100%-1rem)] max-w-3xl" closeButtonDisabled={save.isPending} closeButtonLabel={t('common.close')}>
    <DialogHeader><DialogTitle>{label('edit')}</DialogTitle><DialogDescription>{label('editHint')}</DialogDescription></DialogHeader>
    <div className="space-y-4">
      {!source && !error && <p role="status">{label('loading')}</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0 space-y-2"><h3 className="text-sm font-medium">{label('original')}</h3><div className="overflow-hidden rounded border bg-white p-2">{rotated && <ReactCrop ariaLabels={{ cropArea: label('cropArea'), nwDragHandle: label('nwDragHandle'), nDragHandle: label('nDragHandle'), neDragHandle: label('neDragHandle'), eDragHandle: label('eDragHandle'), seDragHandle: label('seDragHandle'), sDragHandle: label('sDragHandle'), swDragHandle: label('swDragHandle'), wDragHandle: label('wDragHandle') }} crop={crop} minWidth={1} minHeight={1} disabled={save.isPending} onChange={(_pixels, percent) => { if (percent.width >= 1 && percent.height >= 1) change('crop', { x: percent.x, y: percent.y, width: percent.width, height: percent.height }); }}><img src={rotated} alt={label('cropImage')} className="max-h-64 max-w-full" /></ReactCrop>}</div></div>
      <div className="min-w-0 space-y-2"><h3 className="text-sm font-medium">{label('preview')}</h3><div className="flex min-h-32 items-center justify-center rounded border bg-white p-3">{processed && <img src={processed} alt={label('previewImage')} className="max-h-64 max-w-full object-contain" />}</div></div></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!source || save.isPending} onClick={() => setSettings(previous => ({ ...previous, rotation: ((previous.rotation + 90) % 360) as SignatureSettings['rotation'], crop: DEFAULT_SIGNATURE_SETTINGS.crop }))}>{label('rotate')}</Button><Button variant="outline" size="sm" disabled={save.isPending} onClick={() => { setError(null); setSettings(structuredClone(DEFAULT_SIGNATURE_SETTINGS)); }}>{label('reset')}</Button></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['x', 'y', 'width', 'height'] as const).map(key => <div key={key} className="space-y-1"><Label htmlFor={`signature-crop-${key}`}>{label(`crop.${key}`)}</Label><Input id={`signature-crop-${key}`} type="number" min={key === 'x' || key === 'y' ? 0 : 1} max={100} step={1} disabled={save.isPending} value={Math.round(settings.crop[key] * 100) / 100} onChange={event => { const next = { ...settings.crop, [key]: Number(event.target.value) }; if (signatureSettingsSchema.safeParse({ ...settings, crop: next }).success) change('crop', next); }} /></div>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{(['brightness', 'contrast'] as const).map(key => <div key={key} className="space-y-1"><Label htmlFor={`signature-${key}`}>{label(key)} ({settings[key]})</Label><Input id={`signature-${key}`} type="range" min={-100} max={100} value={settings[key]} disabled={save.isPending} onChange={event => change(key, Number(event.target.value))} /></div>)}</div>
      <div className="flex items-center gap-2"><Checkbox id="signature-remove-background" checked={settings.removeBackground} disabled={save.isPending} onCheckedChange={value => change('removeBackground', value === true)} /><Label htmlFor="signature-remove-background">{label('removeBackground')}</Label></div>
      {settings.removeBackground && <div><Label htmlFor="signature-threshold">{label('strength')} ({255 - settings.threshold})</Label><Input id="signature-threshold" type="range" min={1} max={105} value={255 - settings.threshold} disabled={save.isPending} onChange={event => change('threshold', 255 - Number(event.target.value))} /></div>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    </div><DialogFooter><Button variant="outline" disabled={save.isPending} onClick={close}>{t('common.close')}</Button><Button disabled={!processed || save.isPending || !signatureSettingsSchema.safeParse(settings).success} onClick={() => save.mutate()}>{label(save.isPending ? 'saving' : 'save')}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
