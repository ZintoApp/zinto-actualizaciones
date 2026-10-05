import { memo, useDeferredValue, useMemo, useSyncExternalStore } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/use-translation';
import { resolveTourText, type GuidedTourSummary } from '@shared/guided-tours';

// Only catalog subscribers update while typing. The editor, target registry,
// media and admin shell stay untouched. Both responsive catalogs share the term.
export function createTourCatalogSearch() {
  let value = '';
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (next: string) => {
      if (value === next) return;
      value = next;
      listeners.forEach(listener => listener());
    },
  };
}

type CatalogEntry = { tour: GuidedTourSummary; title: string; searchableText: string };
type CatalogProps = {
  tours: GuidedTourSummary[];
  selectedId?: number;
  busy: boolean;
  loading: boolean;
  failed: boolean;
  searchState: ReturnType<typeof createTourCatalogSearch>;
  onChoose: (tour: GuidedTourSummary) => void;
  onRetry: () => void;
};

export function TourCatalog({ tours, searchState, ...props }: CatalogProps) {
  const { t, currentLanguage } = useTranslation();
  const search = useSyncExternalStore(searchState.subscribe, searchState.getSnapshot, searchState.getSnapshot);
  const deferredSearch = useDeferredValue(search);
  const index = useMemo(() => tours.map(tour => {
    const title = resolveTourText(tour.definition.title, currentLanguage?.code);
    return { tour, title, searchableText: `${title} ${tour.definition.feature}`.toLocaleLowerCase() };
  }), [tours, currentLanguage?.code]);

  return <div className="tour-catalog-content">
    <div className="tour-search">
      <Search />
      <Input value={search} onChange={event => searchState.set(event.target.value)} placeholder={t('guided_tours.search', 'Search tours')} aria-label={t('guided_tours.search', 'Search tours')} />
      {search && <Button variant="ghost" size="icon" onClick={() => searchState.set('')} aria-label={t('guided_tours.clear_search', 'Clear search')}><X /></Button>}
    </div>
    <CatalogResults {...props} index={index} search={deferredSearch} />
  </div>;
}

const CatalogResults = memo(function CatalogResults({ index, search, selectedId, busy, loading, failed, onChoose, onRetry }: Omit<CatalogProps, 'tours' | 'searchState'> & { index: CatalogEntry[]; search: string }) {
  const { t } = useTranslation();
  const term = search.toLocaleLowerCase().trim();
  const filtered = useMemo(() => term ? index.filter(entry => entry.searchableText.includes(term)) : index, [index, term]);
  return <>
    <div className="tour-catalog-heading"><h2>{t('guided_tours.all_tours', 'All tours')}</h2><span className="tour-count" role="status" aria-label={t('guided_tours.result_count', 'Tour results')}>{filtered.length}</span></div>
    {loading ? <p className="tour-empty" role="status">{t('guided_tours.loading', 'Loading tours…')}</p>
      : failed ? <div className="tour-empty" role="alert"><p>{t('guided_tours.unavailable', 'Could not load guided tours.')}</p><Button variant="outline" onClick={onRetry}>{t('common.retry', 'Retry')}</Button></div>
      : !filtered.length ? <p className="tour-empty">{search ? t('guided_tours.no_results', 'No tours match your search.') : t('guided_tours.empty_catalog', 'No tours yet. Create your first tour to get started.')}</p>
      : <nav className="tour-catalog-list" aria-label={t('guided_tours.all_tours', 'All tours')}>
        {filtered.map(entry => <CatalogRow key={entry.tour.id} entry={entry} selected={selectedId === entry.tour.id} busy={busy} onChoose={onChoose} />)}
      </nav>}
  </>;
});

const CatalogRow = memo(function CatalogRow({ entry: { tour, title }, selected, busy, onChoose }: { entry: CatalogEntry; selected: boolean; busy: boolean; onChoose: CatalogProps['onChoose'] }) {
  const { t } = useTranslation();
  return <button type="button" disabled={busy} aria-current={selected ? 'true' : undefined} className={`tour-catalog-item ${selected ? 'is-selected' : ''}`} onClick={() => onChoose(tour)}>
    <span className={`tour-dot tour-dot-${tour.status}`} />
    <span className="min-w-0"><strong>{title}</strong><span className="tour-catalog-meta">
      <span className={`tour-status tour-status-${tour.status}`}>{t(`guided_tours.${tour.status}`, tour.status === 'published' ? 'Published' : tour.status === 'archived' ? 'Archived' : 'Draft')}</span>
      <span>{tour.stepCount} {t('guided_tours.steps', 'Steps').toLocaleLowerCase()}</span>
    </span></span>
    <ChevronRight className="tour-chevron" />
  </button>;
});
