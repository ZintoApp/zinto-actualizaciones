import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from './command';
import { useTranslation } from '@/hooks/use-translation';

export type SearchableSelectOption = { value: string; label: string };
const PAGE_SIZE = 50;

/** The shared Popover/Command picker pattern, with bounded initial rendering. */
export function SearchableSelect({ id, label, value, options, onChange, searchPlaceholder }: {
  id?: string; label: string; value: string; options: SearchableSelectOption[];
  onChange: (value: string) => void; searchPlaceholder: string;
}) {
  const { t, currentLanguage } = useTranslation();
  const [listId, setListId] = useState<string>();
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const term = deferredSearch.trim().toLocaleLowerCase();
  const list = useRef<HTMLDivElement | null>(null);
  const setListRef = useCallback((node: HTMLDivElement | null) => { list.current = node; setListId(node?.id); }, []);
  // Cache lives across closing/reopening, and is discarded when translated
  // options change. Limit cached terms so long authoring sessions stay bounded.
  const index = useMemo(() => ({
    entries: options.map(option => ({ option, text: option.label.toLocaleLowerCase() })),
    byValue: new Map(options.map(option => [option.value, option])),
    searches: new Map<string, SearchableSelectOption[]>(),
  }), [options]);
  const results = useMemo(() => {
    if (!term) return options;
    const cached = index.searches.get(term);
    if (cached) { index.searches.delete(term); index.searches.set(term, cached); return cached; }
    const matches = index.entries.filter(entry => entry.text.includes(term)).map(entry => entry.option);
    if (index.searches.size >= 20) index.searches.delete(index.searches.keys().next().value!);
    index.searches.set(term, matches);
    return matches;
  }, [index, options, term]);
  const [page, setPage] = useState<{ results: SearchableSelectOption[]; limit: number } | null>(null);
  const limit = page?.results === results ? page.limit : PAGE_SIZE;
  const selected = index.byValue.get(value);
  const batch = results.slice(0, limit);
  // Keep the current selection visible even when it is deep in the registry.
  const pinned = !term && selected && !batch.some(option => option.value === value) ? selected : null;
  const stale = search !== deferredSearch;
  const more = results.length > limit;
  const loadMore = () => setPage({ results, limit: Math.min(limit + PAGE_SIZE, results.length) });
  const toggle = (next: boolean) => { setOpen(next); setSearch(''); setPage(null); };
  const renderOption = (option: SearchableSelectOption) => <CommandItem key={option.value} value={option.value} disabled={stale}
    onSelect={() => { onChange(option.value); toggle(false); }} className="min-w-0 items-start" title={option.label}>
    <Check aria-hidden className={`mt-0.5 shrink-0 ${option.value === value ? 'opacity-100' : 'opacity-0'}`} />
    <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{option.label}</span>
  </CommandItem>;
  return <Popover open={open} onOpenChange={toggle}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-label={label}
      aria-expanded={open} aria-controls={open ? listId : undefined} className="h-10 w-full min-w-0 justify-between px-3 font-normal">
      <span className="min-w-0 truncate text-start">{selected?.label || value}</span><ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
    </Button></PopoverTrigger>
    {open && <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw_-_24px)] p-0" dir={currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr'}>
      <Command label={searchPlaceholder} shouldFilter={false} defaultValue={selected?.value}>
        <CommandInput aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search}
          onValueChange={next => { setSearch(next); if (list.current) list.current.scrollTop = 0; }} />
        <CommandList ref={setListRef} label={label} aria-busy={stale} className="max-h-64"
          onScroll={event => { const node = event.currentTarget; if (!stale && more && node.scrollHeight - node.scrollTop - node.clientHeight < 48) loadMore(); }}>
          <CommandEmpty>{t('common.no_results', 'No results')}</CommandEmpty>
          {pinned && renderOption(pinned)}{batch.map(renderOption)}
        </CommandList>
      </Command>
      {more && <Button type="button" variant="ghost" className="h-auto w-full whitespace-normal rounded-none border-t text-xs" disabled={stale} onClick={loadMore}>
        {t('common.show_more_results', 'Show more results')}
      </Button>}
    </PopoverContent>}
  </Popover>;
}
