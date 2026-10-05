import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FilePenLine, Download, Upload, Plus, GripVertical, Trash2, Copy, MoreVertical, Eye, Sparkles, ArrowLeft, ArrowRight, ChevronDown, ListOrdered, Image, Info, Crosshair, Settings2, Globe, Link, Layers, PanelLeft, ArrowUp, ArrowDown } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/contexts/branding-context';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { EditorField as Field, EditorChoice as Choice, EditorCheck as Check } from '@/components/guided-tours/editor-controls';
import { EditorMediaPanel, type MediaAttachment } from '@/components/guided-tours/EditorMediaPanel';
import { TOUR_FEATURES, TOUR_SIGNALS } from '@shared/guided-tour-registry';
import { TOUR_TARGETS } from '@shared/guided-tour-targets';
import { normalizeTourMediaUrl, resolveTourText, tourDefinitionSchema, type GuidedTour, type GuidedTourSummary, type TourDefinition, type TourStep, type TourMedia } from '@shared/guided-tours';
import { AUTHORING_KEY, readAuthoring } from '@/components/guided-tours/TourAuthoringBar';
import { TourCatalog, createTourCatalogSearch } from '@/components/guided-tours/TourCatalog';
import { TourTransferDialog } from '@/components/guided-tours/TourTransferDialog';
import '@/components/guided-tours/editor.css';

type EditorTab = 'overview' | 'steps' | 'media';
type TourSelection = GuidedTourSummary | GuidedTour | 'new' | 'import';
type AuthoringReturn = NonNullable<ReturnType<typeof readAuthoring>>;
const newStep = (): TourStep => ({ id: `step-${crypto.randomUUID().slice(0, 8)}`, target: '[data-tour="help"]', title: { en: 'New step', es: 'Nuevo paso' }, content: { en: 'Describe this step.', es: 'Describe este paso.' }, placement: 'auto', completion: { type: 'next' }, prepare: [], media: [], consequential: false });
const newDefinition = (): TourDefinition => ({ slug: `tour-${crypto.randomUUID().slice(0, 8)}`, feature: 'flows', category: 'main', title: { en: 'New tour', es: 'Nuevo recorrido' }, description: { en: 'Describe the outcome.', es: 'Describe el objetivo.' }, routes: ['/flows'], order: 0, permissions: [], businessTypes: [], prerequisites: [], kind: 'task', media: [], steps: [newStep()] });

export default function AdminGuidedTours() {
  const { t, languages, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const { user, impersonateCompanyMutation } = useAuth();
  const queryClient = useQueryClient();
  const { branding } = useBranding();
  const label = (key: string, fallback: string) => t(`guided_tours.${key}`, fallback);
  const [selected, setSelected] = useState<GuidedTour | null>(null), [definition, setDefinition] = useState<TourDefinition | null>(null);
  const [language, setLanguage] = useState('en'), [stepId, setStepId] = useState(''), [tab, setTab] = useState<EditorTab>('steps');
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState('');
  const [catalogSearch] = useState(createTourCatalogSearch);
  const [drawer, setDrawer] = useState(false), [advanced, setAdvanced] = useState(false);
  const [launch, setLaunch] = useState<'pick' | 'preview' | null>(null), [companyId, setCompanyId] = useState('');
  const [confirmation, setConfirmation] = useState<'draft' | 'delete' | null>(null);
  const [pending, setPending] = useState<TourSelection | 'draft' | null>(null);
  const [transfer, setTransfer] = useState<'import' | 'export' | null>(null);
  const transferTrigger = useRef<HTMLElement | null>(null);
  const createTourTrigger = useRef<HTMLButtonElement | null>(null);
  const actionsTrigger = useRef<HTMLButtonElement | null>(null), transitionLock = useRef(false);
  const [loadingTour, setLoadingTour] = useState<GuidedTourSummary | GuidedTour | null>(null);
  const [detailError, setDetailError] = useState(false);
  const selectionRequest = useRef(0), returningAuthoring = useRef<AuthoringReturn>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const initialized = useRef(false), dialogReturnFocus = useRef<HTMLElement | null>(null);
  const tours = useQuery<GuidedTourSummary[]>({ queryKey: ['admin-guided-tours', user?.id, 'summaries'], queryFn: async () => (await apiRequest('GET', '/api/admin/guided-tours?summary=true')).json() });
  const detailKey = (tour: { id: number; version: number }) => ['admin-guided-tour-detail', user?.id, tour.id, tour.version] as const;
  const cacheTour = (tour: GuidedTour) => {
    queryClient.setQueryDefaults(['admin-guided-tour-detail', user?.id], { gcTime: 15 * 60_000 });
    queryClient.setQueryData(detailKey(tour), tour);
  };
  const companies = useQuery<{ id: number; name: string }[]>({ queryKey: ['tour-companies'], queryFn: async () => { const data = await (await apiRequest('GET', '/api/admin/companies')).json(); return Array.isArray(data) ? data : data.companies || []; }, enabled: !!launch });
  const accent = /^#[a-f\d]{6}$/i.test(branding.primaryColor) ? branding.primaryColor : '#17a132';
  const themeStyle = { '--tour-accent': accent } as CSSProperties;
  const direction = currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr';
  const sortedTours = useMemo(() => [...(tours.data || [])].sort((a, b) => a.definition.order - b.definition.order || a.id - b.id), [tours.data]);
  const stepIndex = Math.max(0, definition?.steps.findIndex(item => item.id === stepId) ?? 0), step = definition?.steps[stepIndex];
  const featureName = (id: string) => label(`feature_${id}`, TOUR_FEATURES.find(item => item.id === id)?.label || id);
  const targetOptions = useMemo(() => [{ value: 'custom', label: label('custom', 'Custom selector') }, ...TOUR_TARGETS.map(item => ({ value: item.id, label: t(item.labelKey, item.label) }))], [t]);
  const update = (patch: Partial<TourDefinition>) => { setDefinition(current => current && { ...current, ...patch }); setDirty(true); };
  const updateStep = (patch: Partial<TourStep>) => { if (definition && step) update({ steps: definition.steps.map(item => item.id === step.id ? { ...item, ...patch } : item) }); };
  const choose = async (tour: TourSelection, authoring?: AuthoringReturn) => {
    if (tour === 'import') { setTransfer('import'); return; }
    const request = ++selectionRequest.current;
    returningAuthoring.current = authoring;
    setDetailError(false); setDefinition(null); setSelected(null);
    setLoadingTour(tour === 'new' ? null : tour);
    setDirty(false); setError(''); setTab('steps'); setAdvanced(false); setDrawer(false);
    try {
      const loaded: GuidedTour | null = tour === 'new' ? null : 'steps' in tour.definition ? tour as GuidedTour : await queryClient.fetchQuery<GuidedTour>({
        queryKey: detailKey(tour),
        queryFn: async () => (await apiRequest('GET', `/api/admin/guided-tours/${tour.id}`)).json(),
        staleTime: 5 * 60_000, gcTime: 15 * 60_000, retry: false,
      });
      // A late response may populate its cache, but must never replace a newer selection.
      if (!mounted.current || request !== selectionRequest.current) return;
      if (loaded && tour !== 'new' && ('steps' in tour.definition || loaded.version !== tour.version)) cacheTour(loaded);
      const next = loaded ? structuredClone(loaded.definition) : newDefinition();
      if (authoring?.selector) {
        const picked = next.steps.find(item => item.id === authoring.stepId);
        if (picked) picked.target = authoring.selector;
      }
      setSelected(loaded); setDefinition(next); setLoadingTour(null);
      setStepId(next.steps.find(item => item.id === authoring?.stepId)?.id || next.steps[0].id);
      setDirty(tour === 'new' || !!authoring?.selector);
      if (authoring) {
        if (['overview', 'steps', 'media'].includes(authoring.editorTab || '')) setTab(authoring.editorTab as EditorTab);
        if (authoring.editingLanguage && ['en', 'es', ...languages.map(item => item.code)].includes(authoring.editingLanguage)) setLanguage(authoring.editingLanguage);
        sessionStorage.removeItem(AUTHORING_KEY);
      }
      returningAuthoring.current = undefined;
    } catch {
      if (mounted.current && request === selectionRequest.current) setDetailError(true);
    }
  };
  const requestChoose = (tour: TourSelection) => {
    if (busy || (typeof tour !== 'string' && tour.id === selected?.id && tour.version === selected.version)) { setDrawer(false); return; }
    if (dirty) { dialogReturnFocus.current = document.activeElement as HTMLElement; setPending(tour); }
    else choose(tour);
  };
  useEffect(() => {
    if (!tours.data || initialized.current) return;
    initialized.current = true;
    const authoring = readAuthoring(), returning = tours.data.find(item => item.id === authoring?.tourId);
    if (returning && authoring) {
      void choose(returning, authoring);
    } else if (sortedTours.length) choose(sortedTours[0]);
  }, [tours.data]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  const requestError = (e: any, fallback: string) => e.status === 409 ? label('conflict', 'This tour changed elsewhere. Reload it before saving again.') : e.message || fallback;
  const save = async (): Promise<GuidedTour | null> => {
    if (!definition) return null;
    setBusy(true); setError('');
    try {
      const parsed = tourDefinitionSchema.safeParse(definition);
      if (!parsed.success) throw new Error(`${label('invalid', 'Check the tour fields, selectors, and step configuration.')} (${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')})`);
      const result: GuidedTour = await (await apiRequest(selected ? 'PUT' : 'POST', selected ? `/api/admin/guided-tours/${selected.id}` : '/api/admin/guided-tours', selected ? { version: selected.version, definition: parsed.data } : parsed.data)).json();
      const mediaIds = (value: TourDefinition) => [...value.media, ...value.steps.flatMap(item => item.media)].filter(item => item.url.startsWith('/api/guided-tours/media/')).map(item => item.id);
      const retained = new Set(mediaIds(result.definition));
      // Published revisions keep their referenced assets; the API enforces retention.
      for (const id of new Set(selected ? mediaIds(selected.definition) : [])) if (!retained.has(id)) await apiRequest('DELETE', `/api/admin/guided-tours/media/${id}`).catch(() => {});
      cacheTour(result); setSelected(result); setDefinition(structuredClone(result.definition)); setDirty(false); await tours.refetch();
      toast({ title: label('saved', 'Tour draft saved') }); return result;
    } catch (e: any) { setError(requestError(e, label('save_failed', 'Could not save the tour.'))); return null; }
    finally { setBusy(false); }
  };
  const transition = async (action: 'publish' | 'draft' | 'delete', saved?: GuidedTour): Promise<boolean> => {
    if (transitionLock.current) return false;
    transitionLock.current = true;
    const current = saved || (action === 'publish' && (dirty || !selected) ? await save() : selected);
    if (!current) { transitionLock.current = false; return false; }
    setBusy(true); setError('');
    try {
      await apiRequest('POST', `/api/admin/guided-tours/${current.id}/${action}`, { version: current.version });
      queryClient.removeQueries({ queryKey: ['admin-guided-tour-detail', user?.id, current.id] });
      const updated: GuidedTour = { ...current, version: current.version + 1, status: action === 'publish' ? 'published' : 'draft', publishedRevision: action === 'publish' ? current.revision : current.publishedRevision };
      queryClient.setQueryData<GuidedTourSummary[]>(['admin-guided-tours', user?.id, 'summaries'], previous => action === 'delete'
        ? previous?.filter(tour => tour.id !== current.id)
        : previous?.map(tour => tour.id === current.id ? { ...tour, version: updated.version, status: updated.status, publishedRevision: updated.publishedRevision } : tour));
      if (action === 'delete') {
        const next = sortedTours.find(tour => tour.id !== current.id);
        setSelected(null); setDefinition(null); setDirty(false);
        if (next) await choose(next);
      } else {
        cacheTour(updated); setSelected(updated); setDefinition(structuredClone(updated.definition)); setDirty(false);
      }
      setConfirmation(null); setPending(null);
      await tours.refetch();
      toast({ title: action === 'delete' ? label('deleted', 'Tour deleted') : action === 'draft' ? label('moved_to_draft', 'Tour moved to draft') : label('updated', 'Tour updated') });
      return true;
    } catch (e: any) { setError(requestError(e, label('update_failed', 'Could not update the tour. Please try again.'))); return false; }
    finally { setBusy(false); transitionLock.current = false; }
  };
  const resolvePending = async (saveFirst: boolean) => {
    if (!pending) return;
    const current = saveFirst ? await save() : selected;
    if (saveFirst && !current) return;
    if (pending === 'draft') { if (current) await transition('draft', current); return; }
    if (pending === 'import' && !saveFirst) { setDefinition(selected ? structuredClone(selected.definition) : null); setDirty(false); }
    void choose(pending); setPending(null);
  };
  const requestTransition = (action: 'draft' | 'delete') => {
    setError(''); dialogReturnFocus.current = actionsTrigger.current;
    if (action === 'draft' && dirty) setPending('draft'); else setConfirmation(action);
  };
  const duplicate = async () => {
    const current = dirty || !selected ? await save() : selected; if (!current) return;
    setBusy(true);
    try { choose(await (await apiRequest('POST', `/api/admin/guided-tours/${current.id}/duplicate`, { version: current.version })).json()); await tours.refetch(); }
    catch (e: any) { setError(requestError(e, label('save_failed', 'Could not save the tour.'))); } finally { setBusy(false); }
  };
  const beginAuthoring = async () => {
    const current = dirty || !selected ? await save() : selected; if (!current || !companyId || !launch) return;
    setBusy(true);
    try {
      const captures = current.definition.steps.slice(0, stepIndex).flatMap(item => item.completion.type === 'signal' && item.completion.capture ? [item.completion.capture] : []);
      const state = { tourId: current.id, revision: current.revision, stepId: current.definition.steps[stepIndex].id, route: current.definition.routes[0], mode: launch, binding: captures.at(-1), editorTab: tab, editingLanguage: language };
      // Keep return context before switching accounts, including failed redirects.
      sessionStorage.setItem(AUTHORING_KEY, JSON.stringify(state));
      await impersonateCompanyMutation.mutateAsync({ companyId: Number(companyId), destination: state.route.includes(':') ? '/inbox' : state.route });
    } catch { setError(label('preview_failed', 'Could not enter the selected company.')); setBusy(false); }
  };
  const attach = async (scope: 'tour' | 'step', draft: MediaAttachment): Promise<boolean> => {
    const current = dirty || !selected ? await save() : selected; if (!current) return false;
    setBusy(true);
    try {
      let attachment: Pick<TourMedia, 'id' | 'url' | 'kind'>;
      if (draft.file) { const data = new FormData(); data.append('file', draft.file); attachment = await (await apiRequest('POST', `/api/admin/guided-tours/${current.id}/media`, data)).json(); }
      else { const url = normalizeTourMediaUrl(draft.url, draft.kind); if (!url) throw new Error(label('invalid_media', 'Use an HTTPS media URL or a valid YouTube link.')); attachment = { id: crypto.randomUUID(), url, kind: draft.kind }; }
      const media: TourMedia = { ...attachment, caption: { ...draft.replacing?.caption, [language]: draft.caption }, alt: { ...draft.replacing?.alt, [language]: draft.alt }, language: draft.replacing?.language || language };
      const next = structuredClone(current.definition), items = scope === 'tour' ? next.media : next.steps[stepIndex].media;
      const index = draft.replacing ? items.findIndex(item => item.id === draft.replacing!.id) : -1;
      if (index >= 0) items.splice(index, 1, media); else items.push(media);
      setDefinition(next); setDirty(true); return true;
    } catch (e: any) { setError(e.message || label('upload_invalid', 'Upload a supported file no larger than 30 MB.')); return false; }
    finally { setBusy(false); }
  };
  const move = (from: number, to: number) => {
    if (!definition || busy || to < 0 || to >= definition.steps.length) return;
    const items = [...definition.steps]; items.splice(to, 0, items.splice(from, 1)[0]); update({ steps: items });
  };
  const duplicateStep = (item: TourStep, index: number) => {
    if (!definition || definition.steps.length >= 100) return;
    const copy = { ...structuredClone(item), id: newStep().id }, items = [...definition.steps]; items.splice(index + 1, 0, copy); update({ steps: items }); setStepId(copy.id);
  };
  const removeStep = (item: TourStep, index: number) => {
    if (!definition || definition.steps.length === 1) return;
    const items = definition.steps.filter(value => value.id !== item.id); update({ steps: items });
    if (step?.id === item.id) setStepId(items[Math.min(index, items.length - 1)].id);
  };
  const mediaPanel = (scope: 'tour' | 'step') => {
    const items = scope === 'tour' ? definition!.media : step!.media;
    const change = (media: TourMedia[]) => scope === 'tour' ? update({ media }) : updateStep({ media });
    return <EditorMediaPanel key={scope === 'tour' ? 'tour' : step!.id} items={items} language={language} scopeLabel={scope === 'tour' ? label('tour_media_scope', 'Shown in the tour catalog') : `${label('step_media_scope', 'Shown in this step')} · ${stepIndex + 1}`} busy={busy} themeStyle={themeStyle}
      onAttach={draft => attach(scope, draft)} onUpdate={(id, patch) => change(items.map(item => item.id === id ? { ...item, ...patch } : item))} onDetach={id => change(items.filter(item => item.id !== id))} />;
  };
  const status = (tour: GuidedTour | null) => <span className={`tour-status tour-status-${tour?.status || 'draft'}`}>{label(tour?.status || 'draft', tour?.status === 'published' ? 'Published' : tour?.status === 'archived' ? 'Archived' : 'Draft')}</span>;
  const catalog = <TourCatalog tours={sortedTours} selectedId={loadingTour?.id ?? selected?.id} busy={busy} loading={tours.isLoading} failed={tours.isError} searchState={catalogSearch} onChoose={requestChoose} onRetry={() => { void tours.refetch(); }} />;
  const options = (values: string[]) => values.map(value => ({ value, label: label(value, value) }));
  const dialogProps = { className: 'tour-editor', style: themeStyle, dir: direction, closeButtonLabel: t('common.close', 'Close'), closeButtonDisabled: busy,
    onOpenAutoFocus: () => { dialogReturnFocus.current = document.activeElement as HTMLElement; },
    onCloseAutoFocus: (event: Event) => { event.preventDefault(); if (dialogReturnFocus.current?.isConnected) dialogReturnFocus.current.focus(); else createTourTrigger.current?.focus(); } };
  return <AdminLayout><div className="tour-editor tour-editor-page" style={themeStyle} dir={direction}>
    <header className="tour-page-heading"><div><h1>{label('title', 'Guided tours')}</h1><p>{label('editor_subtitle', 'Build helpful, interactive onboarding experiences.')}</p></div><div className="tour-transfer-actions"><Button variant="outline" disabled={busy} onClick={event => { transferTrigger.current = event.currentTarget; requestChoose('import'); }}><Upload />{label('import', 'Import')}</Button><Button variant="outline" disabled={busy || !sortedTours.length} onClick={event => { transferTrigger.current = event.currentTarget; setTransfer('export'); }}><Download />{label('export', 'Export')}</Button><Button ref={createTourTrigger} className="tour-primary" disabled={busy} onClick={() => requestChoose('new')}><Plus />{label('create', 'Create tour')}</Button></div></header>
    <Button variant="outline" className="tour-catalog-toggle" onClick={() => setDrawer(true)}><PanelLeft />{label('browse_tours', 'Browse tours')}<span className="tour-count">{sortedTours.length}</span></Button>
    <div className="tour-editor-layout"><aside className="tour-catalog tour-panel">{catalog}</aside>
      <section className="tour-workspace tour-panel" aria-label={label('details', 'Tour details')} aria-busy={busy || (!!loadingTour && !detailError)}>
        {definition ? <><div className="tour-workspace-heading"><div className="tour-title-group"><h2>{resolveTourText(definition.title, language) || label('untitled', 'Untitled tour')}</h2>{status(selected)}<span className={`tour-save-status ${dirty ? 'is-dirty' : ''}`} role="status">{dirty ? label('unsaved', 'Unsaved changes') : selected?.publishedRevision && selected.revision !== selected.publishedRevision ? label('saved_draft_changes', 'Saved draft changes') : label('all_saved', 'All changes saved')}</span></div>
          <div className="tour-toolbar"><Button variant="outline" disabled={busy} onClick={() => { setError(''); setLaunch('preview'); }}><Eye />{label('preview', 'Preview')}</Button><Button variant="outline" disabled={busy || (!dirty && !!selected)} onClick={() => save()}>{label('save_draft', 'Save draft')}</Button><Button className="tour-primary" disabled={busy} onClick={() => transition('publish')}><Sparkles />{label('publish_changes', 'Publish changes')}</Button><DropdownMenu dir={direction}><DropdownMenuTrigger asChild><Button ref={actionsTrigger} size="icon" variant="outline" disabled={busy} aria-label={label('tour_actions', 'Tour actions')}><MoreVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={duplicate}><Copy className="me-2 h-4 w-4" />{label('duplicate', 'Duplicate')}</DropdownMenuItem><DropdownMenuItem disabled={!dirty || !selected} onSelect={() => { if (selected) { setDefinition(structuredClone(selected.definition)); setDirty(false); setError(''); } }}>{label('discard', 'Discard changes')}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={!selected || selected.status === 'draft'} onSelect={() => requestTransition('draft')}><FilePenLine className="me-2 h-4 w-4" />{label('move_to_draft', 'Move to draft')}</DropdownMenuItem><DropdownMenuItem disabled={!selected} className="text-destructive focus:text-destructive" onSelect={() => requestTransition('delete')}><Trash2 className="me-2 h-4 w-4" />{label('delete_tour', 'Delete tour')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div>
          <fieldset disabled={busy} className="tour-editor-fields"><Tabs value={tab} onValueChange={value => setTab(value as EditorTab)} dir={direction}>
            <TabsList className="tour-tabs"><TabsTrigger value="overview"><Info />{label('overview', 'Overview')}</TabsTrigger><TabsTrigger value="steps"><ListOrdered />{label('steps_tab', 'Steps')}<span className="tab-count">{definition.steps.length}</span></TabsTrigger><TabsTrigger value="media"><Image />{label('media', 'Supporting media')}</TabsTrigger></TabsList>
            <div className="tour-workspace-body">
              {error && <p role="alert" className="tour-error">{error}</p>}
              <div className="tour-metadata"><div><Layers /><span><small>{label('feature', 'Feature')}</small><strong>{featureName(definition.feature)}</strong></span></div><div><Settings2 /><span><small>{label('kind', 'Tour type')}</small><strong>{label(definition.kind, definition.kind === 'task' ? 'Task' : 'Overview')}</strong></span></div><div className="tour-language"><Globe /><Choice label={label('language', 'Editing language')} value={language} options={[...new Set(['en', 'es', ...languages.map(item => item.code)])].map(code => ({ value: code, label: languages.find(item => item.code === code)?.name || code }))} onChange={setLanguage} /></div><div className="tour-route"><Link /><span><small>{label('route_label', 'Routes')}</small><code dir="ltr" title={definition.routes.join(', ')}>{definition.routes.join(', ')}</code></span></div><Button variant="ghost" className="tour-accent-link" onClick={() => setTab('overview')}>{label('edit_details', 'Edit details')}<ArrowRight /></Button></div>
              <TabsContent value="overview"><section className="tour-panel"><h3 className="tour-panel-heading">{label('details', 'Tour details')}</h3><div className="tour-panel-body tour-form-grid">
                <Field label={label('tour_title', 'Title')} value={definition.title[language] || ''} onChange={value => update({ title: { ...definition.title, [language]: value } })} />
                <Field label={label('tour_description', 'Description')} value={definition.description[language] || ''} onChange={value => update({ description: { ...definition.description, [language]: value } })} multiline />
                <Field label={label('slug', 'Stable name')} value={definition.slug} onChange={slug => update({ slug })} />
                <Choice searchable label={label('feature', 'Feature')} value={definition.feature} options={TOUR_FEATURES.map(item => ({ value: item.id, label: featureName(item.id) }))} onChange={value => { const feature = TOUR_FEATURES.find(item => item.id === value)!; update({ feature: value, routes: [feature.route], category: feature.category, businessTypes: [...feature.businessTypes] as TourDefinition['businessTypes'] }); }} />
                <Choice label={label('kind', 'Tour type')} value={definition.kind} options={options(['overview', 'task'])} onChange={value => update({ kind: value as TourDefinition['kind'] })} />
                <Field label={label('category', 'Category')} value={definition.category} onChange={category => update({ category })} />
                <Field label={label('order', 'Display order')} type="number" value={String(definition.order)} onChange={value => update({ order: Number(value) || 0 })} />
                <Field label={label('routes', 'Routes, one per line')} value={definition.routes.join('\n')} onChange={value => update({ routes: value.split('\n') })} multiline />
                <Field label={label('permissions', 'Required permissions, comma separated')} value={definition.permissions.join(',')} onChange={value => update({ permissions: value.split(',').map(item => item.trim()).filter(Boolean) })} />
                <fieldset className="tour-check-group"><legend>{label('business_types', 'Business types (empty means all)')}</legend>{(['standard', 'restaurant', 'dental'] as const).map(value => <Check key={value} label={label(value, value)} checked={definition.businessTypes.includes(value)} onChange={checked => update({ businessTypes: checked ? [...definition.businessTypes, value] : definition.businessTypes.filter(item => item !== value) })} />)}</fieldset>
                <fieldset className="tour-check-group"><legend>{label('prerequisites_plural', 'Prerequisites')}</legend>{(['channel', 'patient', 'product', 'conversation'] as const).map(value => <Check key={value} label={label(value, value)} checked={definition.prerequisites.includes(value)} onChange={checked => update({ prerequisites: checked ? [...definition.prerequisites, value] : definition.prerequisites.filter(item => item !== value) })} />)}</fieldset>
              </div></section></TabsContent>
              <TabsContent value="steps" className="tour-steps-tab"><div className="tour-steps-layout"><section className="tour-panel tour-step-list"><h3 className="tour-panel-heading">{label('tour_steps', 'Tour steps')}</h3><div className="tour-panel-body">
                <DragDropContext dragHandleUsageInstructions={label('drag_instructions', 'Press Space to lift a step, arrow keys to move, Space to drop, or Escape to cancel.')} onDragStart={(start, provided) => provided.announce(t('guided_tours.drag_position', 'Step position: {{position}}', { position: start.source.index + 1 }))} onDragUpdate={(result, provided) => { if (result.destination) provided.announce(t('guided_tours.drag_position', 'Step position: {{position}}', { position: result.destination.index + 1 })); }} onDragEnd={(result, provided) => { if (result.destination) move(result.source.index, result.destination.index); provided.announce(label('drag_finished', 'Reordering finished.')); }}><Droppable droppableId="tour-steps">{provided => <div ref={provided.innerRef} {...provided.droppableProps} className="tour-step-scroll">{definition.steps.map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={busy} disableInteractiveElementBlocking>{drag => <div ref={drag.innerRef} {...drag.draggableProps} className={`tour-step-row ${step?.id === item.id ? 'is-selected' : ''}`} data-step-id={item.id}><button type="button" {...drag.dragHandleProps} aria-label={`${label('reorder', 'Reorder')}: ${resolveTourText(item.title, language)}`} className="tour-drag"><GripVertical /></button><button type="button" className="tour-step-select" aria-current={step?.id === item.id ? 'step' : undefined} onClick={() => setStepId(item.id)}><span className="tour-step-number">{index + 1}</span><span>{resolveTourText(item.title, language) || label('untitled', 'Untitled tour')}</span></button><DropdownMenu dir={direction}><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`${label('step_actions', 'Step actions')}: ${index + 1}`}><MoreVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={index === 0} onSelect={() => move(index, index - 1)}><ArrowUp className="me-2 h-4 w-4" />{label('move_up', 'Move up')}</DropdownMenuItem><DropdownMenuItem disabled={index === definition.steps.length - 1} onSelect={() => move(index, index + 1)}><ArrowDown className="me-2 h-4 w-4" />{label('move_down', 'Move down')}</DropdownMenuItem><DropdownMenuItem disabled={definition.steps.length >= 100} onSelect={() => duplicateStep(item, index)}><Copy className="me-2 h-4 w-4" />{label('duplicate_step', 'Duplicate step')}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={definition.steps.length === 1} onSelect={() => removeStep(item, index)}><Trash2 className="me-2 h-4 w-4" />{label('remove_step', 'Remove step')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}</Draggable>)}{provided.placeholder}</div>}</Droppable></DragDropContext>
                <Button className="tour-add-step" variant="outline" disabled={definition.steps.length >= 100} onClick={() => { const item = newStep(); update({ steps: [...definition.steps, item] }); setStepId(item.id); }}><Plus />{label('add_step', 'Add step')}</Button>
              </div></section>
              {step && <section className="tour-panel tour-step-editor"><div className="tour-panel-heading"><h3>{label('step', 'Step')} {String(stepIndex + 1).padStart(2, '0')} <span aria-hidden>·</span> {resolveTourText(step.title, language)}</h3><div className="flex gap-2"><Button size="icon" variant="outline" disabled={stepIndex === 0} aria-label={label('previous_step', 'Previous step')} onClick={() => setStepId(definition.steps[stepIndex - 1].id)}><ArrowLeft /></Button><Button size="icon" variant="outline" disabled={stepIndex === definition.steps.length - 1} aria-label={label('next_step', 'Next step')} onClick={() => setStepId(definition.steps[stepIndex + 1].id)}><ArrowRight /></Button></div></div><div className="tour-panel-body space-y-4">
                <div className="tour-form-grid"><Field label={label('step_title', 'Step title')} value={step.title[language] || ''} onChange={value => updateStep({ title: { ...step.title, [language]: value } })} /><Field label={label('instructions', 'Instructions')} value={step.content[language] || ''} onChange={value => updateStep({ content: { ...step.content, [language]: value } })} multiline /></div>
                <fieldset className="tour-target"><legend>{label('target_element', 'Target element')}</legend><div className="tour-form-grid"><Choice searchable label={label('target_catalog', 'Registered target')} value={TOUR_TARGETS.find(item => item.selector === step.target)?.id || 'custom'} options={targetOptions} onChange={value => { const item = TOUR_TARGETS.find(item => item.id === value); if (item) updateStep({ target: item.selector }); }} /><Button variant="outline" className="tour-pick" onClick={() => { setError(''); setLaunch('pick'); }}><Crosshair />{label('pick', 'Pick element')}</Button></div><div className="tour-selector"><Field label={label('selector', 'Target selector')} value={step.target} onChange={target => updateStep({ target })} /><Button size="icon" variant="ghost" aria-label={label('copy_selector', 'Copy selector')} onClick={async () => { try { await navigator.clipboard.writeText(step.target); toast({ title: label('selector_copied', 'Selector copied') }); } catch { setError(label('copy_failed', 'Could not copy. Select the selector and copy it manually.')); } }}><Copy /></Button></div></fieldset>
                <div className="tour-form-grid"><Choice label={label('placement', 'Placement')} value={step.placement} options={options(['auto', 'top', 'bottom', 'left', 'right', 'center'])} onChange={value => updateStep({ placement: value as TourStep['placement'] })} /><Choice label={label('completion', 'Advance when')} value={step.completion.type} options={['next', 'click', 'change', 'route', 'signal'].map(value => ({ value, label: label(`completion_${value}`, value) }))} onChange={value => updateStep({ completion: value === 'signal' ? { type: 'signal', name: 'flow-saved' } : value === 'route' ? { type: 'route', path: definition.routes[0] } : value === 'change' ? { type: 'change', nonEmpty: true } : { type: value as 'next' | 'click' } })} /></div>
                {step.completion.type === 'signal' && <Choice searchable label={label('signal', 'Success signal')} value={step.completion.name} options={TOUR_SIGNALS.map(value => ({ value, label: label(`signal_${value}`, value) }))} onChange={value => updateStep({ completion: { ...step.completion as Extract<TourStep['completion'], { type: 'signal' }>, name: value } })} />}
                {step.completion.type === 'route' && <Field label={label('expected_route', 'Expected route')} value={step.completion.path} onChange={path => updateStep({ completion: { type: 'route', path } })} />}
                <Collapsible open={advanced} onOpenChange={setAdvanced} className="tour-advanced"><CollapsibleTrigger asChild><button type="button" className="tour-panel-toggle"><Settings2 /><strong>{label('advanced', 'Advanced settings')}</strong><span>{label('advanced_hint', 'Route, behavior and more')}</span><ChevronDown className={advanced ? 'rotate-180' : ''} /></button></CollapsibleTrigger><CollapsibleContent><div className="tour-form-grid tour-advanced-body">
                  <Field label={label('step_route', 'Navigate to route (optional)')} value={step.route || ''} onChange={value => updateStep({ route: value || undefined })} />
                  {(step.completion.type === 'click' || step.completion.type === 'change') && <Field label={label('condition_selector', 'Completion selector (optional)')} value={step.completion.selector || ''} onChange={value => updateStep({ completion: { ...step.completion as Extract<TourStep['completion'], { type: 'click' | 'change' }>, selector: value || undefined } })} />}
                  {step.completion.type === 'change' && <Check label={label('non_empty', 'Require a non-empty value')} checked={step.completion.nonEmpty} onChange={value => updateStep({ completion: { ...step.completion as Extract<TourStep['completion'], { type: 'change' }>, nonEmpty: value } })} />}
                  {step.completion.type === 'signal' && <><Field label={label('capture', 'Capture resource as (optional)')} value={step.completion.capture || ''} onChange={value => updateStep({ completion: { ...step.completion as Extract<TourStep['completion'], { type: 'signal' }>, capture: value || undefined } })} /><Field label={label('resource', 'Require captured resource (optional)')} value={step.completion.resource || ''} onChange={value => updateStep({ completion: { ...step.completion as Extract<TourStep['completion'], { type: 'signal' }>, resource: value || undefined } })} /></>}
                  <Check label={label('consequential', 'Show real-action notice')} checked={step.consequential} onChange={consequential => updateStep({ consequential })} /><Check label={label('follow_dialogs', 'Follow nested dialogs during this step')} checked={!!step.followDialogs} onChange={followDialogs => updateStep({ followDialogs })} />
                  {(['sidebar', 'erp-menu'] as const).map(value => <Check key={value} label={value === 'sidebar' ? label('expand_sidebar', 'Expand sidebar') : label('expand_erp', 'Expand ERP menu')} checked={step.prepare.includes(value)} onChange={checked => updateStep({ prepare: checked ? [...step.prepare, value] : step.prepare.filter(item => item !== value) })} />)
                  }
                </div></CollapsibleContent></Collapsible>
              </div></section>}
              </div>{step && mediaPanel('step')}</TabsContent>
              <TabsContent value="media">{mediaPanel('tour')}</TabsContent>
            </div>
          </Tabs></fieldset></> : <div className="tour-empty tour-workspace-empty"><ListOrdered /><h2>{label('title', 'Guided tours')}</h2>{detailError ? <div role="alert"><p>{label('detail_unavailable', 'Could not load this tour. Your other tours are still available.')}</p><Button variant="outline" onClick={() => { if (loadingTour) void choose(loadingTour, returningAuthoring.current); }}>{t('common.retry', 'Retry')}</Button></div> : <p role="status">{loadingTour ? label('loading_detail', 'Loading tour content…') : tours.isLoading ? label('loading', 'Loading tours…') : label('select_tour', 'Choose a tour or create one to start editing.')}</p>}</div>}
      </section>
    </div>
    {transfer && <TourTransferDialog triggerElement={transferTrigger.current} mode={transfer} tours={sortedTours} selected={selected} dirty={dirty} style={themeStyle} save={save} refresh={async () => { const result = await tours.refetch(); if (result.error) throw result.error; }} onClose={() => setTransfer(null)} onImported={async imported => {
      for (const tour of imported) { queryClient.removeQueries({ queryKey: ['admin-guided-tour-detail', user?.id, tour.id] }); cacheTour(tour); }
      if (imported[0]) await choose(imported[0]);
      await tours.refetch();
      toast({ title: label('package_imported', 'Tours imported as editable drafts') });
    }} />}
    <Dialog open={drawer} onOpenChange={setDrawer}><DialogContent {...dialogProps} className="tour-editor tour-catalog-drawer"><DialogHeader><DialogTitle>{label('browse_tours', 'Browse tours')}</DialogTitle><DialogDescription>{label('catalog_description', 'Choose a tour to edit its steps and supporting media.')}</DialogDescription></DialogHeader>{catalog}</DialogContent></Dialog>
    <Dialog open={!!pending} onOpenChange={value => { if (!value && !busy) setPending(null); }}><DialogContent {...dialogProps} onOpenAutoFocus={() => { if (pending === 'draft') dialogReturnFocus.current = actionsTrigger.current; else dialogReturnFocus.current = document.activeElement as HTMLElement; }}><DialogHeader><DialogTitle>{label('unsaved_title', 'Save your changes?')}</DialogTitle><DialogDescription>{pending === 'draft' ? label('unsaved_draft_notice', 'Save or discard your changes before moving this tour to draft. It will disappear from company Help.') : label('unsaved_description', 'This tour has unsaved changes. Save a draft before leaving, or discard your changes.')}</DialogDescription></DialogHeader>{error && <p role="alert" className="tour-error">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>{t('common.cancel', 'Cancel')}</Button><Button variant="outline" disabled={busy} onClick={() => resolvePending(false)}>{label('discard_short', 'Discard')}</Button><Button className="tour-primary" disabled={busy} onClick={() => resolvePending(true)}>{label('save_draft', 'Save draft')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!launch} onOpenChange={value => { if (!value && !busy) setLaunch(null); }}><DialogContent {...dialogProps}><DialogHeader><DialogTitle>{label('choose_company', 'Choose a company')}</DialogTitle><DialogDescription>{label('preview_notice', 'Author in the real application. Navigate to the desired page, then enable the picker. Preview actions affect this company normally.')}</DialogDescription></DialogHeader>{companies.isLoading ? <p role="status">{label('loading_companies', 'Loading companies…')}</p> : companies.isError ? <Button variant="outline" onClick={() => companies.refetch()}>{t('common.retry', 'Retry')}</Button> : companies.data?.length ? <Choice searchable label={label('company', 'Company')} value={companyId} options={companies.data.map(company => ({ value: String(company.id), label: company.name }))} onChange={setCompanyId} /> : <p>{label('no_companies', 'No companies are available for preview.')}</p>}{error && <p role="alert" className="tour-error">{error}</p>}<DialogFooter><Button className="tour-primary" disabled={!companyId || busy} onClick={beginAuthoring}>{label('open_workspace', 'Open workspace')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!confirmation} onOpenChange={value => { if (!value && !busy) setConfirmation(null); }}><DialogContent {...dialogProps} onOpenAutoFocus={() => { dialogReturnFocus.current = actionsTrigger.current; }}><DialogHeader><DialogTitle>{confirmation === 'delete' ? label('delete_tour', 'Delete tour') : label('move_to_draft', 'Move to draft')}</DialogTitle><DialogDescription><strong className="break-words">{selected && (resolveTourText(selected.definition.title, language) || label('untitled', 'Untitled tour'))}</strong><br />{confirmation === 'delete' ? label('delete_notice', 'Permanently delete this tour, all its revisions, translations, uploaded media, and unsaved edits? This cannot be undone. External attachments will not be deleted.') : label('draft_notice', 'Remove this tour from company Help and keep its revisions, translations, and media for editing. You can publish it again later.')}</DialogDescription></DialogHeader>{error && <p role="alert" className="tour-error">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>{t('common.cancel', 'Cancel')}</Button><Button variant={confirmation === 'delete' ? 'destructive' : 'default'} className={confirmation === 'delete' ? undefined : 'tour-primary'} disabled={busy} onClick={() => confirmation && transition(confirmation)}>{confirmation === 'delete' ? label('delete_tour', 'Delete tour') : label('move_to_draft', 'Move to draft')}</Button></DialogFooter></DialogContent></Dialog>
  </div></AdminLayout>;
}
