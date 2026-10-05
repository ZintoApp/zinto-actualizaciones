import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  File,
  FileText,
  Image,
  Play,
  ArrowLeft,
  ArrowUpFromLine,
  ArrowDownToLine,
  Loader2,
  Music,
  Search,
  ChevronDown,
  X,
  AudioLines as TabIconAudioLines,
  Files as TabIconFiles,
  Images as TabIconImages,
} from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import useSocket from '@/hooks/useSocket';
import { downloadConversationMedia } from '@/utils/downloadConversationMedia';
import { formatMediaDate, formatMediaSize, formatMediaTime, mediaDateKey } from '@/utils/conversationMediaPresentation';
import type { ConversationMediaItem, ConversationMediaPage, MediaCategory, MediaDirection, MediaSort } from '@shared/conversation-media';
import './ConversationMediaGallery.css';

const CONTENT_TAB_ICONS = {
  media: TabIconImages,
  documents: TabIconFiles,
  audio: TabIconAudioLines,
} as const;

export function MediaDownloadButton({ url, compact = false, className }: { url: string; compact?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  return <Button data-tour="components-conversations-conversationmediagallery.button.message_bubble.download" type="button" size={compact ? 'icon' : 'sm'} variant="ghost" className={className} disabled={busy}
    title={t('message_bubble.download', 'Download')} aria-label={t('message_bubble.download', 'Download')}
    onClick={async event => {
      event.stopPropagation();
      setBusy(true);
      try { await downloadConversationMedia(url); }
      catch (error: any) { toast({ title: t('media.download_failed', 'Download failed'), description: error.message, variant: 'destructive' }); }
      finally { setBusy(false); }
    }}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    {!compact && <span className="ml-2">{t('message_bubble.download', 'Download')}</span>}
  </Button>;
}

function mediaIcon(item: ConversationMediaItem) {
  if (item.type === 'video') return Play;
  if (['voice', 'audio'].includes(item.type)) return Music;
  if (item.type === 'document') return /\.pdf$/i.test(item.filename) ? FileText : File;
  return Image;
}

function Thumbnail({ item }: { item: ConversationMediaItem }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.thumbnailUrl]);
  if (item.thumbnailUrl && !failed) return <div className="cm-thumbnail"><img src={item.thumbnailUrl} loading="lazy" alt="" onError={() => setFailed(true)} /></div>;
  const Icon = mediaIcon(item);
  return <div className="cm-thumbnail cm-placeholder"><Icon aria-hidden="true" />{item.type === 'document' && <span>{item.filename.split('.').pop()?.slice(0, 8).toUpperCase()}</span>}</div>;
}

function ConversationMediaGalleryContent({ conversationId, companyId }: { conversationId: number; companyId: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MediaCategory>('media');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<MediaDirection>('all');
  const [sort, setSort] = useState<MediaSort>('newest');
  const [selected, setSelected] = useState<ConversationMediaItem | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const previewBackRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { t, currentLanguage } = useTranslation();
  const language = currentLanguage?.code?.replace(/_/g, '-') || 'en';
  const queryClient = useQueryClient();
  const { onMessage } = useSocket('/ws');
  const prefix = useMemo(() => ['conversation-media', companyId, conversationId], [companyId, conversationId]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const searchPending = searchInput.trim() !== search;

  // Revisiting a filter begins at its first page, rather than restoring old cursors.
  const resetCursor = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: prefix });
    queryClient.removeQueries({ queryKey: prefix, type: 'inactive' });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [prefix, queryClient]);
  useEffect(() => {
    if (!searchPending) return;
    const timer = window.setTimeout(() => { resetCursor(); setSearch(searchInput.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchPending, resetCursor]);
  useEffect(() => () => { void queryClient.cancelQueries({ queryKey: prefix }); }, [prefix, queryClient]);
  useEffect(() => {
    setPreviewError(false);
    if (selected) previewBackRef.current?.focus();
  }, [selected]);
  useEffect(() => {
    const refresh = (event: any) => {
      const data = event.data || event;
      if (Number(data.conversationId ?? data.message?.conversationId) !== conversationId) return;
      void queryClient.resetQueries({ queryKey: prefix });
      setSelected(null);
    };
    const unsubscribes = ['newMessage', 'messageUpdated', 'messageDeleted', 'conversationHistoryCleared'].map(name => onMessage(name, event => {
      const data = event.data || event;
      if (name === 'newMessage' && !['image', 'video', 'sticker', 'audio', 'voice', 'document', 'email'].includes(data.type)) return;
      refresh(event);
    }));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [conversationId, prefix, onMessage, queryClient]);

  const query = useInfiniteQuery<ConversationMediaPage>({
    queryKey: [...prefix, category, search, direction, sort, timeZone],
    enabled: open && !!conversationId,
    staleTime: 30_000,
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ category, limit: '24', direction, sort, timeZone });
      if (search) params.set('q', search);
      if (pageParam) params.set('cursor', String(pageParam));
      else params.set('includeSummary', '1');
      const response = await fetch(`/api/conversations/${conversationId}/media?${params}`, { signal, credentials: 'include' });
      if (!response.ok) throw new Error('Unable to load conversation media.');
      return response.json();
    },
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  const summary = query.data?.pages[0]?.summary;
  const total = summary?.totalCount ?? (!query.isPending && !query.hasNextPage ? items.length : undefined);
  const groups = useMemo(() => {
    const grouped = new Map<string, ConversationMediaItem[]>();
    for (const item of query.data?.pages.flatMap(page => page.items) || []) {
      const key = mediaDateKey(item.createdAt, timeZone);
      const group = grouped.get(key) || [];
      group.push(item);
      grouped.set(key, group);
    }
    return [...grouped];
  }, [query.data, timeZone]);
  const fileCount = (count: number) => t(count === 1 ? 'media.file_count_one' : 'media.file_count', count === 1 ? '{{count}} file' : '{{count}} files', { count });
  const categoryLabels = { media: t('media.tab.media', 'Media'), documents: t('media.tab.documents', 'Documents'), audio: t('media.tab.audio', 'Audio') };
  const openPreview = (item: ConversationMediaItem) => { scrollPosition.current = scrollRef.current?.scrollTop || 0; setSelected(item); };
  const closePreview = () => {
    const id = selected?.id;
    setSelected(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollPosition.current;
        scrollRef.current.querySelector<HTMLButtonElement>(`[data-media-id="${id}"]`)?.focus({ preventScroll: true });
      }
    });
  };
  const onOpenChange = (value: boolean) => {
    if (value) void queryClient.resetQueries({ queryKey: prefix });
    else { setSelected(null); void queryClient.cancelQueries({ queryKey: prefix }); }
    setOpen(value);
  };

  return <>
    <div className="p-4 border-b border-border">
      <Button data-tour="components-conversations-conversationmediagallery.button.contacts.details.conversation_media" ref={triggerRef} variant="ghost" className="w-full justify-start h-auto whitespace-normal text-left" onClick={() => onOpenChange(true)}>
        <Image className="h-5 w-5 mr-2 shrink-0" />{t('contacts.details.conversation_media', 'Media, documents and audio')}
      </Button>
    </div>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-conversations-conversationmediagallery.dialogcontent.contacts.details.conversation_media" className="conversation-media-dialog" contentNoScroll bodyClassName="cm-shell" showCloseButton={false}
        onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <header className="cm-header">
          <div className="cm-header-icon"><Image aria-hidden="true" /></div>
          <div><DialogTitle className="cm-title">{t('contacts.details.conversation_media', 'Media, documents and audio')}</DialogTitle>
            <DialogDescription className="cm-description">{t('media.conversation_only', 'Sent and received in this conversation.')}</DialogDescription></div>
        </header>
        <DialogClose asChild><button data-tour="components-conversations-conversationmediagallery.button.common.close" type="button" className="cm-close" aria-label={t('common.close', 'Close')}><X size={21} /></button></DialogClose>

        <Tabs className="cm-view" hidden={!!selected} value={category} onValueChange={value => { resetCursor(); setCategory(value as MediaCategory); }}>
          <div className="cm-tabs">
            <TabsList  aria-label={t('media.categories', 'File categories')}>
              {(['media', 'documents', 'audio'] as const).map(value => <TabsTrigger icon={CONTENT_TAB_ICONS[value]} key={value} value={value}>
                {categoryLabels[value]}{category === value && <span className="tab-count">{summary?.categoryCounts[value] ?? '…'}</span>}
              </TabsTrigger>)}
            </TabsList>
          </div>
          <div className="cm-toolbar">
            <label className="cm-search">
              {searchPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              <input data-tour="components-conversations-conversationmediagallery.input.media.search_files" type="search" value={searchInput} maxLength={200} onChange={event => setSearchInput(event.target.value)} placeholder={t('media.search_files', 'Search files...')} aria-label={t('media.search_files', 'Search files...')} />
            </label>
            <div className="cm-filters">
              <div className="cm-select"><select data-tour="components-conversations-conversationmediagallery.select.media.direction" value={direction} aria-label={t('media.direction', 'Direction')} onChange={event => { resetCursor(); setDirection(event.target.value as MediaDirection); }}>
                <option value="all">{t('media.all_directions', 'All directions')}</option><option value="outbound">{t('media.sent', 'Sent')}</option><option value="inbound">{t('media.received', 'Received')}</option>
              </select><ChevronDown aria-hidden="true" /></div>
              <div className="cm-select"><select data-tour="components-conversations-conversationmediagallery.select.media.sort" value={sort} aria-label={t('media.sort', 'Sort order')} onChange={event => { resetCursor(); setSort(event.target.value as MediaSort); }}>
                <option value="newest">{t('media.newest_first', 'Newest first')}</option><option value="oldest">{t('media.oldest_first', 'Oldest first')}</option>
              </select><ChevronDown aria-hidden="true" /></div>
            </div>
          </div>
          <TabsContent value={category} ref={scrollRef} className="cm-results" aria-label={categoryLabels[category]} aria-busy={query.isFetching || searchPending}>
            {query.isPending && <p className="cm-feedback" role="status">{t('common.loading', 'Loading...')}</p>}
            {query.isError && <div className="cm-feedback" role="alert"><p>{t('media.load_failed', 'Unable to load media.')}</p><Button data-tour="components-conversations-conversationmediagallery.button.common.retry" className="cm-load-more" variant="outline" onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>{t('common.retry', 'Retry')}</Button></div>}
            {!query.isPending && !query.isError && !items.length && <p className="cm-feedback">{search || direction !== 'all' ? t('media.no_matches', 'No files match your search or filters.') : t('media.no_items', 'No media in this category yet.')}</p>}
            {groups.map(([day, entries]) => <section key={day} className="cm-date-group" aria-labelledby={`media-day-${conversationId}-${day}`}>
              <div className="cm-date-heading"><h3 id={`media-day-${conversationId}-${day}`}>{formatMediaDate(entries[0].createdAt, timeZone, language)}</h3>
                <span>{summary?.dateCounts[day] !== undefined ? fileCount(summary.dateCounts[day]) : t('media.count_loaded', '{{count}} loaded', { count: entries.length })}</span></div>
              <div className="cm-grid">{entries.map(item => {
                const Icon = mediaIcon(item);
                const DirectionIcon = item.direction === 'outbound' ? ArrowUpFromLine : ArrowDownToLine;
                const directionLabel = item.direction === 'outbound' ? t('media.sent', 'Sent') : t('media.received', 'Received');
                const details = `${formatMediaTime(item.createdAt, timeZone, language)} · ${directionLabel}${item.size !== null ? ` · ${formatMediaSize(item.size)}` : ''}`;
                return <article key={item.id} className="cm-card">
                  <button data-tour="components-conversations-conversationmediagallery.button.message_bubble.open" type="button" className="cm-card-open" data-media-id={item.id} onClick={() => openPreview(item)} aria-label={`${t('message_bubble.open', 'Open')} ${item.filename}`}>
                    <Thumbnail item={item} />
                    <span className={`cm-file-badge${item.type === 'document' && /\.pdf$/i.test(item.filename) ? ' cm-pdf' : ''}`} aria-hidden="true"><Icon /></span>
                    <p className="cm-filename" title={item.filename}>{item.filename}</p>
                    <p className="cm-file-meta" title={details}><DirectionIcon aria-hidden="true" /><span>{details}</span></p>
                  </button>
                  <MediaDownloadButton compact className="cm-card-download" url={item.downloadUrl} />
                </article>;
              })}</div>
            </section>)}
          </TabsContent>
          <footer className="cm-footer">
            <span role="status" aria-live="polite">{query.isPending ? t('common.loading', 'Loading...') : query.isError ? t('media.load_failed', 'Unable to load media.') : query.hasNextPage
              ? total === undefined ? t('media.count_loaded', '{{count}} loaded', { count: items.length }) : t('media.loaded_of_total', '{{loaded}} of {{total}} files loaded', { loaded: items.length, total })
              : t('media.end_results', 'All media in this category is shown.')}</span>
            {query.hasNextPage && <Button data-tour="components-conversations-conversationmediagallery.button.common.loading" variant="outline" className="cm-load-more" disabled={query.isFetching || searchPending} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? t('common.loading', 'Loading...') : t('common.load_more', 'Load more')}</Button>}
            <span>{total !== undefined ? fileCount(total) : '—'}</span>
          </footer>
        </Tabs>

        {selected && <div className="cm-preview">
          <div className="cm-preview-toolbar"><Button data-tour="components-conversations-conversationmediagallery.button.common.back" ref={previewBackRef} variant="ghost" onClick={closePreview}><ArrowLeft className="mr-2 h-4 w-4" />{t('common.back', 'Back')}</Button><MediaDownloadButton url={selected.downloadUrl} /></div>
          <p className="cm-preview-name">{selected.filename}</p>
          <div className="cm-preview-content">{previewError ? <p role="alert">{t('media.unavailable', 'This media is no longer available. You can try downloading it again.')}</p>
            : ['image', 'sticker'].includes(selected.type) ? <img src={selected.previewUrl} alt={selected.filename} onError={() => setPreviewError(true)} />
            : selected.type === 'video' ? <video controls preload="metadata" src={selected.previewUrl} onError={() => setPreviewError(true)} />
            : ['audio', 'voice'].includes(selected.type) ? <audio controls preload="metadata" src={selected.previewUrl} onError={() => setPreviewError(true)} />
            : <Button data-tour="components-conversations-conversationmediagallery.button.message_bubble.open" asChild variant="outline"><a href={selected.previewUrl} target="_blank" rel="noopener noreferrer">{t('message_bubble.open', 'Open')}</a></Button>}</div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

export default function ConversationMediaGallery({ conversationId }: { conversationId: number }) {
  const { user } = useAuth();
  return <ConversationMediaGalleryContent key={`${user?.companyId}:${conversationId}`} conversationId={conversationId} companyId={user?.companyId} />;
}
