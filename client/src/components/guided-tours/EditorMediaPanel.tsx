import { useRef, useState, type CSSProperties } from 'react';
import { FileText, Link, Plus, Trash2, Upload, RefreshCw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/use-translation';
import { normalizeTourMediaUrl, resolveTourText, TOUR_MEDIA_LIMIT, type TourMedia } from '@shared/guided-tours';
import { EditorChoice, EditorField } from './editor-controls';

export interface MediaAttachment {
  file?: File; url: string; kind: TourMedia['kind']; caption: string; alt: string; replacing?: TourMedia;
}
const fileTypes: Record<string, TourMedia['kind']> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'video/mp4': 'video', 'video/webm': 'video', 'application/pdf': 'pdf',
};

export function EditorMediaPanel({ items, language, scopeLabel, busy, themeStyle, onAttach, onUpdate, onDetach }: {
  items: TourMedia[]; language: string; scopeLabel: string; busy: boolean; themeStyle: CSSProperties;
  onAttach: (attachment: MediaAttachment) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<TourMedia>) => void; onDetach: (id: string) => void;
}) {
  const { t, currentLanguage } = useTranslation();
  const direction = currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr';
  const label = (key: string, fallback: string) => t(`guided_tours.${key}`, fallback);
  const [expanded, setExpanded] = useState(true), [open, setOpen] = useState(false), [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState('upload'), [error, setError] = useState('');
  const [draft, setDraft] = useState<MediaAttachment>({ url: '', kind: 'image', caption: '', alt: '' });
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const begin = (replacing?: TourMedia) => {
    setDraft({ replacing, url: replacing?.url || '', kind: replacing?.kind || 'image', caption: replacing?.caption[language] || '', alt: replacing?.alt[language] || '' });
    setMode('upload'); setError(''); setOpen(true);
  };
  const acceptFile = (file: File) => {
    if (!fileTypes[file.type] || file.size > TOUR_MEDIA_LIMIT) { setError(label('upload_invalid', 'Upload a supported file no larger than 30 MB.')); return; }
    setError(''); setDraft(current => ({ ...current, file, kind: fileTypes[file.type] })); setMode('upload'); setOpen(true);
  };
  const submit = async () => {
    if (!draft.caption.trim() || (draft.kind === 'image' && !draft.alt.trim())) { setError(label('media_description', 'Enter a caption and image alternative text.')); return; }
    if (mode === 'upload' && !draft.file) { setError(label('choose_file', 'Choose a file to upload.')); return; }
    if (mode === 'link' && !normalizeTourMediaUrl(draft.url, draft.kind)) { setError(label('invalid_media', 'Use an HTTPS media URL or a valid YouTube link.')); return; }
    if (await onAttach({ ...draft, file: mode === 'upload' ? draft.file : undefined })) setOpen(false);
    else setError(label('attach_failed', 'Could not attach media. Your entries are preserved. Close this dialog to review any save errors, then retry.'));
  };
  return <Collapsible open={expanded} onOpenChange={setExpanded} className="tour-panel tour-media-panel">
    <CollapsibleTrigger asChild><button className="tour-panel-heading tour-panel-toggle" type="button"><span>{label('media', 'Supporting media')}<small>{scopeLabel}</small></span><ChevronDown className={expanded ? '' : '-rotate-90'} /></button></CollapsibleTrigger>
    <CollapsibleContent><div className="tour-panel-body space-y-4">
      {items.length > 0 && <div className="tour-media-grid">{items.map(item => {
        const url = normalizeTourMediaUrl(item.url, item.kind), title = resolveTourText(item.caption, language);
        return <div className="tour-media-card" key={item.id}>
          <div className="tour-media-thumbnail">{item.kind === 'image' && url ? <img src={url} loading="lazy" decoding="async" alt={resolveTourText(item.alt, language)} />
            : item.kind === 'video' && url ? <video src={url} controls preload="none" aria-label={title} />
            : item.kind === 'youtube' && url ? <iframe src={url} title={title} loading="lazy" allow="fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" />
            : <a href={url || undefined} target="_blank" rel="noopener noreferrer"><FileText /><span>{label('open_pdf', 'Open PDF')}</span></a>}</div>
          <div className="min-w-0 space-y-3"><span className="tour-muted text-xs">{label(item.kind, item.kind)}</span>
            <EditorField label={label('caption', 'Caption')} value={item.caption[language] || ''} onChange={value => onUpdate(item.id, { caption: { ...item.caption, [language]: value } })} />
            {item.kind === 'image' && <EditorField label={label('alt', 'Image alternative text')} value={item.alt[language] || ''} onChange={value => onUpdate(item.id, { alt: { ...item.alt, [language]: value } })} />}
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => begin(item)}><RefreshCw />{label('replace', 'Replace')}</Button><Button type="button" variant="outline" className="tour-danger" size="icon" disabled={busy} onClick={() => onDetach(item.id)} aria-label={`${label('remove_media', 'Detach media')}: ${title}`}><Trash2 /></Button></div>
          </div>
        </div>;
      })}</div>}
      <button type="button" className={`tour-upload ${dragging ? 'is-dragging' : ''}`} disabled={busy}
        onClick={() => begin()}
        onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); if (busy) return; const file = event.dataTransfer.files[0]; if (file) { setDraft({ url: '', kind: 'image', caption: '', alt: '' }); acceptFile(file); } }}>
        <Upload /><span>{label('upload', 'Upload media (maximum 30 MB)')}<small>{label('drop_media', 'Choose a file or drag and drop')}</small></span>
      </button>
      {error && !open && <p role="alert" className="tour-error">{error}</p>}
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { begin(); setMode('link'); }}><Link />{label('attach_link', 'Attach an HTTPS or YouTube link')}</Button>
    </div></CollapsibleContent>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="tour-editor" style={themeStyle} dir={direction} closeButtonDisabled={busy} closeButtonLabel={t('common.close', 'Close')}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement; }}
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
      <DialogHeader><DialogTitle>{draft.replacing ? label('replace_media', 'Replace supporting media') : label('attach_media', 'Attach supporting media')}</DialogTitle><DialogDescription>{scopeLabel} · {language.toUpperCase()}</DialogDescription></DialogHeader>
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <Tabs value={mode} onValueChange={setMode} dir={direction}><TabsList><TabsTrigger value="upload"><Upload className="me-2 h-4 w-4" />{label('upload_file', 'Upload file')}</TabsTrigger><TabsTrigger value="link"><Link className="me-2 h-4 w-4" />{label('media_url', 'Media URL')}</TabsTrigger></TabsList>
          <TabsContent value="upload"><Input ref={input} type="file" accept={Object.keys(fileTypes).join(',')} aria-label={label('choose_file', 'Choose a file to upload.')} onChange={event => { const file = event.target.files?.[0]; if (file) acceptFile(file); event.target.value = ''; }} />{draft.file && <p className="tour-muted mt-2 text-sm break-all">{draft.file.name}</p>}</TabsContent>
          <TabsContent value="link" className="space-y-4"><EditorChoice label={label('media_kind', 'Media type')} value={draft.kind} options={['image', 'video', 'pdf', 'youtube'].map(value => ({ value, label: label(value, value) }))} onChange={value => setDraft({ ...draft, kind: value as TourMedia['kind'] })} /><EditorField label={label('media_url', 'Media URL')} value={draft.url} onChange={url => setDraft({ ...draft, url })} /></TabsContent>
        </Tabs>
        <EditorField label={label('caption', 'Caption')} value={draft.caption} onChange={caption => setDraft({ ...draft, caption })} />
        {draft.kind === 'image' && <EditorField label={label('alt', 'Image alternative text')} value={draft.alt} onChange={alt => setDraft({ ...draft, alt })} />}
        <p className="tour-muted text-xs">{label('media_formats', 'PNG, JPEG, WebP, GIF, MP4, WebM or PDF. Maximum 30 MB. English descriptions are required before publication.')}</p>
        {error && <p role="alert" className="tour-error">{error}</p>}
      </fieldset>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel', 'Cancel')}</Button><Button className="tour-primary" disabled={busy} onClick={submit}><Plus />{draft.replacing ? label('replace', 'Replace') : label('attach_media_action', 'Attach media')}</Button></DialogFooter>
    </DialogContent></Dialog>
  </Collapsible>;
}
