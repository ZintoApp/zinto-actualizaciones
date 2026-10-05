import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, Upload, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EditorField, EditorCheck, EditorChoice } from './editor-controls';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { resolveTourText, type GuidedTour, type GuidedTourSummary } from '@shared/guided-tours';
import { TOUR_PACKAGE_LIMITS, type TourImportPreview, type TourImportRequest } from '@shared/guided-tour-package';

interface Props {
  mode: 'import' | 'export'; tours: GuidedTourSummary[]; selected: GuidedTour | null; dirty: boolean;
  style: CSSProperties; save: () => Promise<GuidedTour | null>; onClose: () => void;
  refresh: () => Promise<void>;
  triggerElement: HTMLElement | null;
  onImported: (tours: GuidedTour[]) => Promise<void>;
}

export function TourTransferDialog({ mode, tours, selected, dirty, style, save, refresh, triggerElement, onClose, onImported }: Props) {
  const { t, currentLanguage } = useTranslation();
  const label = (key: string, fallback: string) => t(`guided_tours.${key}`, fallback);
  const language = currentLanguage?.code || 'en';
  const [search, setSearch] = useState(''), deferredSearch = useDeferredValue(search);
  const [ids, setIds] = useState<number[]>(selected ? [selected.id] : []);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [exportGuard, setExportGuard] = useState(false);
  const [preview, setPreview] = useState<TourImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, 'copy' | 'replace'>>({});
  const [confirmed, setConfirmed] = useState(false), [expired, setExpired] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const token = useRef<string | null>(null), active = useRef(true), input = useRef<HTMLInputElement>(null), lock = useRef(false);
  const returnFocus = useRef(triggerElement || document.activeElement as HTMLElement | null);
  useEffect(() => { setIds(previous => previous.filter(id => tours.some(tour => tour.id === id))); }, [tours]);
  useEffect(() => { active.current = true; return () => { active.current = false; if (token.current) void apiRequest('DELETE', `/api/admin/guided-tours/import/${token.current}`).catch(() => {}); }; }, []);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, preview.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  const shown = useMemo(() => tours.filter(tour => `${Object.values(tour.definition.title).join(' ')} ${tour.definition.feature}`.toLocaleLowerCase().includes(deferredSearch.trim().toLocaleLowerCase())), [tours, deferredSearch]);
  const describeError = (e: any) => e.status === 409 ? label('conflict', 'This tour changed elsewhere. Reload it before saving again.') : t(e.errorCode || '', label('package_failed', 'Could not complete this operation. Please try again.'));
  const download = async (saveFirst = false) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const updated = saveFirst ? await save() : null;
      if (saveFirst && !updated) { setError(label('save_failed', 'Could not save the tour.')); return; }
      const selections = tours.filter(tour => ids.includes(tour.id)).map(tour => ({ id: tour.id, version: updated?.id === tour.id ? updated.version : tour.version }));
      const response = await apiRequest('POST', '/api/admin/guided-tours/export', { tours: selections });
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'guided-tours.zip'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000); onClose();
    } catch (e) { setError(describeError(e)); } finally { lock.current = false; setBusy(false); }
  };
  const refreshList = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { await refresh(); setError(''); } catch (e) { setError(describeError(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  const upload = async (next: File) => {
    if (lock.current) return;
    const previousToken = token.current; token.current = null; setPreview(null); setChoices({});
    if (previousToken) void apiRequest('DELETE', `/api/admin/guided-tours/import/${previousToken}`).catch(() => {});
    setFile(next); setError(''); setExpired(false);
    if (!next.name.toLowerCase().endsWith('.zip') || next.size > TOUR_PACKAGE_LIMITS.zip) { setError(label('package_upload_hint', 'Choose a ZIP file up to 250 MB.')); return; }
    lock.current = true; setBusy(true);
    try {
      const data = new FormData(); data.append('file', next);
      const result: TourImportPreview = await (await apiRequest('POST', '/api/admin/guided-tours/import/preview', data)).json();
      if (!active.current) { void apiRequest('DELETE', `/api/admin/guided-tours/import/${result.token}`).catch(() => {}); return; }
      token.current = result.token; setPreview(result); setConfirmed(false);
      setChoices(Object.fromEntries(result.tours.filter(tour => !tour.errors.length).map(tour => [tour.index, tour.match ? 'replace' : 'copy'])));
    } catch (e) { setError(describeError(e)); } finally { lock.current = false; setBusy(false); }
  };
  const commit = async () => {
    if (lock.current || !preview || !token.current) return;
    lock.current = true; setBusy(true); setError('');
    const request: TourImportRequest = { token: token.current, confirmReplacements: confirmed, selections: preview.tours.filter(tour => choices[tour.index]).map(tour => ({ index: tour.index, action: choices[tour.index], ...(choices[tour.index] === 'replace' && tour.match ? { destination: { id: tour.match.id, version: tour.match.version } } : {}) })) };
    token.current = null;
    try {
      const imported: GuidedTour[] = await (await apiRequest('POST', '/api/admin/guided-tours/import/commit', request)).json();
      await onImported(imported); onClose();
    } catch (e) {
      // No automatic mutation retries. A lost response may have committed successfully.
      setExpired(true); setError(`${describeError(e)} ${label('package_check_catalog', 'Check the catalog before uploading again; the import may have completed. This review cannot be submitted twice.')}`);
    } finally { lock.current = false; setBusy(false); }
  };
  const replacing = Object.values(choices).includes('replace'), count = mode === 'export' ? ids.length : Object.keys(choices).length;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="tour-editor tour-transfer-dialog" bodyClassName="min-w-0 overflow-x-hidden" style={style} dir={currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr'} closeButtonDisabled={busy} closeButtonLabel={t('common.close', 'Close')}
    onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}
    onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{mode === 'export' ? label('export_tours', 'Export tours') : label('import_tours', 'Import tours')}</DialogTitle><DialogDescription>{mode === 'export' ? label('package_export_description', 'Download saved tours with all translations and uploaded media. External attachments remain links.') : label('package_import_description', 'Review a portable tour package and import editable drafts. Publishing is a separate action.')}</DialogDescription></DialogHeader>
    <fieldset disabled={busy} className="tour-transfer-body">
      {mode === 'export' ? exportGuard ? <div><p>{label('package_unsaved', 'The selected tour has unsaved changes. Choose which version to export.')}</p><div className="tour-transfer-actions"><Button variant="outline" onClick={() => setExportGuard(false)}>{t('common.cancel', 'Cancel')}</Button><Button variant="outline" onClick={() => download()}>{label('export_saved', 'Export saved version')}</Button><Button className="tour-primary" onClick={() => download(true)}>{label('save_export', 'Save draft and export')}</Button></div></div> : <>
        <EditorField label={label('search', 'Search tours…')} value={search} onChange={setSearch} />
        <EditorCheck label={label('package_select_all', 'Select all results')} checked={!!shown.length && shown.every(tour => ids.includes(tour.id))} onChange={checked => setIds(previous => checked ? [...new Set([...previous, ...shown.map(tour => tour.id)])] : previous.filter(id => !shown.some(tour => tour.id === id)))} />
        <div className="tour-transfer-list">{shown.map(tour => <div className="tour-transfer-row" key={tour.id}><EditorCheck label={resolveTourText(tour.definition.title, language)} checked={ids.includes(tour.id)} onChange={checked => setIds(previous => checked ? [...previous, tour.id] : previous.filter(id => id !== tour.id))} /><p>{label(`feature_${tour.definition.feature}`, tour.definition.feature)} · {tour.stepCount} {label('steps', 'Steps')} · {label(tour.status, tour.status)}</p></div>)}{!shown.length && <p>{label('no_results', 'No matching tours')}</p>}</div>
      </> : <>
        <input ref={input} type="file" accept=".zip,application/zip" className="sr-only" tabIndex={-1} aria-label={label('import_tours', 'Import tours')} onChange={event => { if (event.target.files?.[0]) void upload(event.target.files[0]); event.target.value = ''; }} />
        <button type="button" className="tour-transfer-drop" onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && event.dataTransfer.files[0]) void upload(event.dataTransfer.files[0]); }}><FileArchive aria-hidden="true" /><strong>{file?.name || label('package_drop', 'Drop a ZIP here or choose a file')}</strong><span>{label('package_upload_hint', 'Choose a ZIP file up to 250 MB.')}</span></button>
        {preview && <><div className="tour-transfer-list">{preview.tours.map(tour => <article className="tour-transfer-row" key={tour.index}>
          <fieldset disabled={!!tour.errors.length}><EditorCheck label={resolveTourText(tour.title, language) || label('untitled', 'Untitled tour')} checked={!!choices[tour.index]} onChange={checked => { setConfirmed(false); setChoices(previous => { const next = { ...previous }; if (checked) next[tour.index] = tour.match ? 'replace' : 'copy'; else delete next[tour.index]; return next; }); }} /></fieldset>
          <p>{tour.slug} · {label(`feature_${tour.feature}`, tour.feature)} · {tour.steps} {label('steps', 'Steps')} · {tour.media} {label('media', 'Supporting media')}</p>
          <p>{label('package_languages', 'Languages')}: {tour.languages.join(', ')}</p>
          {tour.errors.map(issue => <p className="tour-error" key={issue}>{label(issue, label('package_configuration', 'Unsupported tour configuration. Update this tour before importing.'))}</p>)}
          {tour.warnings.map(issue => <p key={issue}>{label(issue, label('package_warning', 'Additional content is required before publishing.'))}</p>)}
          {tour.match && <><p>{label('package_match', 'Existing tour')}: {resolveTourText(tour.match.title, language)} · {label(tour.match.status, tour.match.status)}</p>{choices[tour.index] && <EditorChoice label={label('package_action', 'Import action')} value={choices[tour.index]} options={[{ value: 'copy', label: label('create_copy', 'Create copy') }, { value: 'replace', label: label('replace_draft', 'Replace draft') }]} onChange={value => { setChoices(previous => ({ ...previous, [tour.index]: value as 'copy' | 'replace' })); setConfirmed(false); }} />}</>}
        </article>)}</div>{replacing && <EditorCheck label={label('package_confirm_replace', 'Replace the selected drafts. Their published versions will remain unchanged.')} checked={confirmed} onChange={setConfirmed} />}</>}
      </>}
    </fieldset>
    {error && <p role="alert" className="tour-error">{error}</p>}
    {error && mode === 'export' && <Button variant="outline" disabled={busy} onClick={refreshList}>{label('package_refresh', 'Refresh saved tour list')}</Button>}
    {expired && !error && <p role="alert">{label('package_expired', 'This review expired. Upload the package again.')}</p>}
    {mode === 'export' && ids.length > TOUR_PACKAGE_LIMITS.tours && <p role="alert">{label('package_limit', 'Select fewer tours to stay within the package limits.')}</p>}
    <p role="status">{busy ? label('package_working', 'Processing package…') : `${count} ${label('package_selected', 'selected')}`}</p>
    <DialogFooter className="flex-wrap gap-2 sm:space-x-0"><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
      {mode === 'export' ? !exportGuard && <Button className="tour-primary" disabled={busy || !ids.length || ids.length > TOUR_PACKAGE_LIMITS.tours} onClick={() => { if (dirty && selected && ids.includes(selected.id)) setExportGuard(true); else void download(); }}><Download />{label('download_zip', 'Download ZIP')}</Button> : <>
        {file && (expired || error) && <Button variant="outline" disabled={busy} onClick={() => upload(file)}>{label('package_review_again', 'Review file again')}</Button>}
        <Button className="tour-primary" disabled={busy || !preview || expired || !count || (replacing && !confirmed)} onClick={commit}><Upload />{label('import_drafts', 'Import drafts')}</Button>
      </>}
    </DialogFooter>
  </DialogContent></Dialog>;
}
