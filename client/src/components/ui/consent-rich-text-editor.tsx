import { useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, Underline, List, ListOrdered, Link, Image, Undo, Redo, Eraser, Unlink } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { ImageUploadDialog } from './image-upload-dialog';
import { ConsentImageInteraction } from './consent-image-interaction';
import { imageAnchor, imageLayout, layoutConsentImages } from './consent-image-layout';
import { useTranslation } from '@/hooks/use-translation';
import { CONSENT_IMAGE_WRAPS, escapeConsentHtml, safeConsentLink, sanitizeConsentHtml } from '@shared/dental-consent-rich-text';

export type ConsentEditorHandle = { insertText: (text: string) => void };
export type ConsentRichTextEditorProps = {
  value: string; onChange: (html: string) => void; id?: string; lang?: string; className?: string;
  disabled?: boolean; readOnly?: boolean; editorHandle?: Ref<ConsentEditorHandle>; toolbarActions?: ReactNode;
};

export function ConsentRichTextEditor({ value, onChange, id, lang, className = '', disabled, readOnly, editorHandle, toolbarActions }: ConsentRichTextEditorProps) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const history = useRef([sanitizeConsentHtml(value)]);
  const historyIndex = useRef(0);
  const [revision, setRevision] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageWidth, setImageWidth] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [active, setActive] = useState<Record<string, boolean>>({});
  const locked = !!disabled || !!readOnly;
  // Wrapped controls must leave a usable text viewport, even on short screens.
  useLayoutEffect(() => {
    const container = frame.current;
    if (!container) return;
    const controls = Array.from(container.querySelectorAll<HTMLElement>(':scope > [role="toolbar"], :scope > [data-consent-image-controls]'));
    const update = () => { container.style.minHeight = `${130 + controls.reduce((height, control) => height + control.getBoundingClientRect().height, 0)}px`; };
    const observer = new ResizeObserver(update);
    controls.forEach(control => observer.observe(control));
    update();
    return () => observer.disconnect();
  }, [readOnly, selectedImage]);
  const label = (key: string) => t(`erp.dental.consent.editor.${key}`);
  const decorate = () => {
    root.current?.querySelectorAll<HTMLElement>('[data-consent-placeholder]').forEach(node => { node.contentEditable = 'false'; });
    root.current?.querySelectorAll<HTMLImageElement>('img').forEach(node => {
      if (locked) { node.removeAttribute('tabindex'); node.removeAttribute('role'); node.removeAttribute('aria-label'); }
      else { node.tabIndex = 0; node.setAttribute('role', 'button'); node.setAttribute('aria-label', `${label('editImage')}${node.alt ? `: ${node.alt}` : ''}`); }
    });
    if (root.current) layoutConsentImages(root.current);
  };
  const saveRange = () => {
    const selection = window.getSelection();
    if (!root.current || !selection?.rangeCount || !root.current.contains(selection.anchorNode) || !root.current.contains(selection.focusNode)) return;
    savedRange.current = selection.getRangeAt(0).cloneRange();
    setActive(Object.fromEntries(['bold', 'italic', 'underline', 'insertOrderedList', 'insertUnorderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].map(command => [command, document.queryCommandState(command)])));
  };
  const restoreRange = () => {
    const editor = root.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const range = savedRange.current;
    selection?.removeAllRanges();
    if (range && editor.contains(range.commonAncestorContainer)) selection?.addRange(range);
    else { const end = document.createRange(); end.selectNodeContents(editor); end.collapse(false); selection?.addRange(end); }
  };
  const record = () => {
    if (!root.current || locked) return;
    if (selectedImage && !root.current.contains(selectedImage)) setSelectedImage(null);
    const html = sanitizeConsentHtml(root.current.innerHTML);
    if (history.current[historyIndex.current] !== html) {
      history.current = [...history.current.slice(0, historyIndex.current + 1), html].slice(-100);
      historyIndex.current = history.current.length - 1;
    }
    onChange(html); setRevision(previous => previous + 1); saveRange(); decorate();
  };
  const replace = (html: string) => {
    if (!root.current) return;
    root.current.innerHTML = sanitizeConsentHtml(html); decorate(); savedRange.current = null; setSelectedImage(null);
  };
  useEffect(() => {
    if (root.current && sanitizeConsentHtml(root.current.innerHTML) !== sanitizeConsentHtml(value)) {
      replace(value); history.current = [sanitizeConsentHtml(value)]; historyIndex.current = 0; setRevision(previous => previous + 1);
    }
    decorate();
  }, [value, locked, t]);
  useEffect(() => { document.addEventListener('selectionchange', saveRange); return () => document.removeEventListener('selectionchange', saveRange); }, []);
  useEffect(() => {
    const editor = root.current; if (!editor) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => layoutConsentImages(editor)); };
    const observer = new ResizeObserver(update); observer.observe(editor); editor.addEventListener('load', update, true);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); editor.removeEventListener('load', update, true); };
  }, []);
  const command = (name: string, argument?: string) => {
    if (locked) return;
    restoreRange(); document.execCommand(name, false, argument); record(); decorate();
  };
  const insertHtml = (html: string) => { command('insertHTML', sanitizeConsentHtml(html)); };
  useImperativeHandle(editorHandle, () => ({ insertText: text => {
    if (locked) return;
    restoreRange();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const fragment = range.createContextualFragment(sanitizeConsentHtml(escapeConsentHtml(text)));
    const last = fragment.lastChild;
    range.deleteContents(); range.insertNode(fragment);
    if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
    record(); decorate();
  } }));
  const undo = (direction: -1 | 1) => {
    if (locked) return;
    const next = historyIndex.current + direction;
    if (next < 0 || next >= history.current.length) return;
    historyIndex.current = next; replace(history.current[next]); onChange(history.current[next]); setRevision(previous => previous + 1); restoreRange();
  };
  const beginLink = () => {
    saveRange();
    const node = savedRange.current?.startContainer;
    const anchor = (node instanceof Element ? node : node?.parentElement)?.closest('a');
    if (anchor && savedRange.current?.collapsed) savedRange.current.selectNodeContents(anchor);
    setLinkUrl(anchor?.getAttribute('href') || ''); setLinkOpen(true);
  };
  const applyLink = () => {
    const url = safeConsentLink(linkUrl.trim());
    if (!url || locked) return;
    restoreRange();
    if (window.getSelection()?.isCollapsed) insertHtml(`<a href="${escapeConsentHtml(url)}">${escapeConsentHtml(url)}</a>`);
    else command('createLink', url);
    setLinkOpen(false);
  };
  const inspectImage = (image: HTMLImageElement) => {
    setSelectedImage(image); setImageWidth(image.getAttribute('width') || String(Math.min(680, image.naturalWidth || 320)));
    setImageAlt(image.alt);
  };
  const updateImage = (change: () => void) => {
    if (!selectedImage || locked || !root.current?.contains(selectedImage)) return;
    change(); record();
  };
  const images = Array.from(root.current?.querySelectorAll<HTMLImageElement>('img') || []);
  const clearFormatting = () => {
    if (locked) return;
    restoreRange();
    for (const list of ['insertOrderedList', 'insertUnorderedList']) {
      if (document.queryCommandState(list)) document.execCommand(list, false);
    }
    document.execCommand('removeFormat', false);
    document.execCommand('unlink', false);
    document.execCommand('formatBlock', false, 'p');
    document.execCommand('justifyLeft', false);
    record(); decorate();
  };
  const tool = (key: string, Icon: typeof Bold, action: () => void, selected = false, unavailable = false) =>
    <Button key={key} type="button" variant={selected ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 shrink-0" title={label(key)} aria-label={label(key)} aria-pressed={selected} disabled={locked || unavailable}
      onMouseDown={event => event.preventDefault()} onClick={action}><Icon className="h-4 w-4" /></Button>;
  return <div ref={frame} className={`wysiwyg-editor consent-rich-editor rounded-lg border border-input bg-background text-foreground ${className}`} data-revision={revision}>
    {!readOnly && <div role="toolbar" aria-label={label('toolbar')} className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-t-lg border-b border-border bg-muted p-1.5 sm:px-3">
      <div className="flex items-center border-r border-border pr-2"><Select value="" disabled={locked} onValueChange={tag => command('formatBlock', tag)}><SelectTrigger className="h-8 w-32 px-2 text-xs sm:w-36 sm:text-sm" aria-label={label('paragraphStyle')}><SelectValue placeholder={label('p')} /></SelectTrigger><SelectContent>{['p', 'h1', 'h2', 'h3'].map(tag => <SelectItem key={tag} value={tag}>{label(tag)}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-center gap-0.5 border-r border-border pr-2">
      {tool('bold', Bold, () => command('bold'), active.bold)}
      {tool('italic', Italic, () => command('italic'), active.italic)}
      {tool('underline', Underline, () => command('underline'), active.underline)}
      </div>
      <div className="flex items-center gap-0.5 border-r border-border pr-2">
      {tool('bullets', List, () => command('insertUnorderedList'), active.insertUnorderedList)}
      {tool('numbering', ListOrdered, () => command('insertOrderedList'), active.insertOrderedList)}
      </div>
      <div className="flex items-center gap-0.5 border-r border-border pr-2">
      <Select value={['justifyCenter', 'justifyRight', 'justifyFull'].find(key => active[key]) || 'justifyLeft'} disabled={locked} onValueChange={alignment => command(alignment)}><SelectTrigger className="h-8 w-14 border-0 bg-transparent px-2 shadow-none" aria-label={label('alignment')}><SelectValue /></SelectTrigger><SelectContent>{([['justifyLeft', AlignLeft], ['justifyCenter', AlignCenter], ['justifyRight', AlignRight], ['justifyFull', AlignJustify]] as const).map(([key, Icon]) => <SelectItem key={key} value={key} textValue={label(key)}><Icon aria-hidden="true" className="inline-block h-4 w-4" /><span className="ml-2 [[role=combobox]_&]:sr-only">{label(key)}</span></SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex items-center gap-0.5 border-r border-border pr-2">
      {tool('link', Link, beginLink)}{tool('unlink', Unlink, () => command('unlink'))}
      {tool('image', Image, () => { saveRange(); setImageOpen(true); })}
      </div>
      <div className="flex items-center gap-0.5">
      {tool('undo', Undo, () => undo(-1), false, historyIndex.current === 0)}
      {tool('redo', Redo, () => undo(1), false, historyIndex.current === history.current.length - 1)}
      {tool('clear', Eraser, clearFormatting)}
      </div>
      {!!images.length && <Select value="" disabled={locked} onValueChange={index => { const image = images[Number(index)]; inspectImage(image); image.scrollIntoView({ block: 'nearest' }); }}><SelectTrigger className="h-8 w-32 px-2 text-xs" aria-label={label('selectImage')}><SelectValue placeholder={label('selectImage')} /></SelectTrigger><SelectContent>{images.map((image, index) => <SelectItem key={index} value={String(index)}>{`${index + 1}. ${image.alt || label('image')}`}</SelectItem>)}</SelectContent></Select>}
      {toolbarActions && <div className="ml-auto flex min-w-0 max-w-full items-center">{toolbarActions}</div>}
    </div>}
    <div className="relative flex h-0 min-h-32 flex-1 flex-col">
    <div ref={root} id={id} lang={lang} role="textbox" aria-label={t('erp.dental.consent.body')} aria-multiline="true" aria-readonly={readOnly} aria-disabled={disabled}
      tabIndex={0} contentEditable={!locked} suppressContentEditableWarning
      className="consent-rich-content relative isolate max-h-[42vh] min-h-64 overflow-y-auto break-words p-3 text-sm leading-normal outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onInput={record} onBlur={saveRange} onMouseUp={saveRange} onKeyUp={saveRange}
      onClick={event => { const target = event.target as HTMLElement; if (target.tagName === 'IMG' && !locked) inspectImage(target as HTMLImageElement); else setSelectedImage(null); if (target.closest('a')) event.preventDefault(); }}
      onPaste={event => { event.preventDefault(); if (!locked) { saveRange(); const html = event.clipboardData.getData('text/html'); insertHtml(html || escapeConsentHtml(event.clipboardData.getData('text/plain')).replace(/\r?\n/g, '<br>')); } }}
      onDrop={event => event.preventDefault()}
      onKeyDown={event => {
        if (locked) return;
        if (event.target instanceof HTMLImageElement && ['Enter', ' '].includes(event.key)) {
          event.preventDefault(); inspectImage(event.target);
          requestAnimationFrame(() => document.getElementById(`${id}-alt`)?.focus()); return;
        }
        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1); }
        if (modifier && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { event.preventDefault(); command({ b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]!); }
        const caret = window.getSelection()?.anchorNode;
        const caretElement = caret instanceof Element ? caret : caret?.parentElement;
        if (event.key === 'Tab' && caretElement?.closest('li') && root.current?.contains(caretElement)) { event.preventDefault(); command(event.shiftKey ? 'outdent' : 'indent'); }
      }} />
    {selectedImage && !locked && root.current?.contains(selectedImage) && <ConsentImageInteraction image={selectedImage} root={root.current} label={label} onCommit={record} onResize={width => setImageWidth(String(width))} onCancel={html => { replace(html); setRevision(previous => previous + 1); }} />}
    </div>
    {selectedImage && !readOnly && <div data-consent-image-controls className="flex shrink-0 flex-wrap items-end gap-2 border-t border-border p-2 [&_label]:text-xs">
      <div className="space-y-1"><Label htmlFor={`${id}-alt`}>{label('alt')}</Label><Input id={`${id}-alt`} className="h-8 w-48" disabled={locked} value={imageAlt} maxLength={500} onChange={event => { const next = event.target.value; setImageAlt(next); updateImage(() => { selectedImage.alt = next; }); }} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-width`}>{label('width')}</Label><Input id={`${id}-width`} type="number" className="h-8 w-24" disabled={locked} min={24} max={680} value={imageWidth} onChange={event => { const next = event.target.value; setImageWidth(next); if (Number(next) >= 24 && Number(next) <= 680) updateImage(() => { selectedImage.width = Number(next); selectedImage.removeAttribute('height'); }); }} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-wrap`}>{label('textWrapping')}</Label><Select value={imageLayout(selectedImage).wrap} disabled={locked} onValueChange={wrap => updateImage(() => {
        const layout = imageLayout(selectedImage); selectedImage.dataset.consentWrap = wrap; selectedImage.dataset.consentX = String(layout.x); selectedImage.dataset.consentY = String(layout.y); selectedImage.dataset.consentGap = String(layout.gap);
        const anchor = imageAnchor(selectedImage, root.current!);
        if (wrap !== 'break' && anchor !== root.current && !anchor.textContent?.trim()) {
          const next = anchor.nextElementSibling;
          if (next?.matches('p,div,li,h1,h2,h3') && !next.hasAttribute('data-consent-decoration')) next.prepend(selectedImage);
        }
      })}><SelectTrigger id={`${id}-wrap`} className="h-8 w-40 text-xs" aria-label={label('textWrapping')}><SelectValue /></SelectTrigger><SelectContent>{CONSENT_IMAGE_WRAPS.map(wrap => <SelectItem key={wrap} value={wrap}>{label(`wrap.${wrap}`)}</SelectItem>)}</SelectContent></Select></div>
      {imageLayout(selectedImage).wrap === 'wrap' && <div className="space-y-1"><Label htmlFor={`${id}-gap`}>{label('textGap')}</Label><Input id={`${id}-gap`} type="number" className="h-8 w-24" min={0} max={48} disabled={locked} value={imageLayout(selectedImage).gap} onChange={event => { const gap = Number(event.target.value); if (gap >= 0 && gap <= 48) updateImage(() => { selectedImage.dataset.consentGap = String(gap); }); }} /></div>}
      <Select value="" disabled={locked} onValueChange={alignment => updateImage(() => { selectedImage.style.textAlign = alignment; if (selectedImage.dataset.consentWrap) selectedImage.dataset.consentX = String(alignment === 'center' ? 0.5 : alignment === 'right' ? 1 : 0); })}><SelectTrigger className="h-8 w-32" aria-label={label('imageAlignment')}><SelectValue placeholder={label('alignment')} /></SelectTrigger><SelectContent>{['left', 'center', 'right'].map(key => <SelectItem key={key} value={key}>{label(key)}</SelectItem>)}</SelectContent></Select>
      <Button size="sm" variant="outline" disabled={locked} onClick={() => updateImage(() => { selectedImage.remove(); setSelectedImage(null); })}>{label('removeImage')}</Button>
    </div>}
    <ImageUploadDialog isOpen={imageOpen && !locked} onClose={() => setImageOpen(false)} uploadUrl="/api/erp/dental/consent-assets" allowUrlInput={false}
      parseUploadResponse={response => { const data = response as { success?: boolean; data?: { url?: string }; errorCode?: string }; return { success: !!data.success, url: data.data?.url, error: t(data.errorCode || 'erp.dental.consent.errors.imageInvalid') }; }}
      onImageInsert={(url, alt) => { if (!locked) { insertHtml(`<div><img src="${escapeConsentHtml(url)}" width="320" alt="${escapeConsentHtml(alt || '')}"></div>`); setImageOpen(false); } }} />
    <Dialog open={linkOpen && !locked} onOpenChange={setLinkOpen}><DialogContent closeButtonLabel={t('common.close')} className="max-w-md"><DialogHeader><DialogTitle>{label('link')}</DialogTitle></DialogHeader>
      <div className="space-y-2"><Label htmlFor={`${id}-link`}>{label('linkUrl')}</Label><Input id={`${id}-link`} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://" />{linkUrl && !safeConsentLink(linkUrl.trim()) && <p role="alert" className="text-sm text-destructive">{label('invalidLink')}</p>}</div>
      <DialogFooter><Button variant="outline" onClick={() => setLinkOpen(false)}>{t('common.close')}</Button><Button disabled={!safeConsentLink(linkUrl.trim())} onClick={applyLink}>{label('apply')}</Button></DialogFooter></DialogContent></Dialog>
    <style>{`
      .consent-rich-content p,.consent-rich-content div{margin:0 0 .7em}
      .consent-rich-content h1{font-size:1.6em;font-weight:700;margin:.9em 0 .4em}
      .consent-rich-content h2{font-size:1.3em;font-weight:700;margin:.9em 0 .4em}
      .consent-rich-content h3{font-size:1.1em;font-weight:700;margin:.9em 0 .4em}
      .consent-rich-content ul{list-style:disc;padding-left:1.8em;margin:.5em 0}
      .consent-rich-content ol{list-style:decimal;padding-left:1.8em;margin:.5em 0}
      .consent-rich-content li{margin:.2em 0}
      .consent-rich-content a{color:hsl(var(--primary));text-decoration:underline}
      .consent-rich-content img{display:block;max-width:100%;height:auto;margin:.5em 0;cursor:pointer}
      .consent-rich-content img:focus{outline:2px solid hsl(var(--ring));outline-offset:2px}
      .consent-rich-content img[role="button"]{touch-action:none}
      .consent-rich-content img[style*="text-align: center"],.consent-rich-content img[style*="text-align:center"]{margin-left:auto;margin-right:auto}
      .consent-rich-content img[style*="text-align: right"],.consent-rich-content img[style*="text-align:right"]{margin-left:auto;margin-right:0}
      .consent-rich-content [data-consent-placeholder]{border-radius:3px;background:hsl(var(--muted));padding:0 2px}
    `}</style>
  </div>;
}
