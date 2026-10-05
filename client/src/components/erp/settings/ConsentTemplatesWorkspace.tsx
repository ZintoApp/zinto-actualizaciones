import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  FileText,
  Info,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Languages as TabIconLanguages,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConsentRichTextEditor } from '@/components/ui/consent-rich-text-editor';
import { consentBodyHtml, consentBodyText } from '@shared/dental-consent-rich-text';
import { consentLanguage, consentTemplateInputSchema, type ConsentLanguage, type ConsentTemplate } from '@shared/dental-consent';

const CONTENT_TAB_ICONS = {
  en: TabIconLanguages,
  es: TabIconLanguages,
} as const;

type Props = {
  templates: ConsentTemplate[];
  loading: boolean;
  error: boolean;
  canManage: boolean;
  toggling: boolean;
  createdKey: string | null;
  onRetry: () => void;
  onEdit: (template: ConsentTemplate | null, language: ConsentLanguage) => void;
  onToggle: (template: ConsentTemplate) => void;
};
const ignoreChange = () => {};
const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function ConsentTemplatesWorkspace({ templates, loading, error, canManage, toggling, createdKey, onRetry, onEdit, onToggle }: Props) {
  const { t, currentLanguage } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [language, setLanguage] = useState<ConsentLanguage>(() => consentLanguage(currentLanguage?.code));
  const [showDetail, setShowDetail] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const listScroll = useRef<HTMLDivElement>(null);
  const savedListScroll = useRef(0);
  const uiLanguage = consentLanguage(currentLanguage?.code);
  const term = searchable(search.trim());
  const matching = templates.filter(template => (filter === 'all' || template.isActive === (filter === 'active')) &&
    Object.values(template.translations).some(translation => searchable(translation.title).includes(term)));
  const selected = matching.find(template => template.key === selectedKey) ?? matching[0];
  const translation = selected?.translations[language];
  const counts = { all: templates.length, active: templates.filter(template => template.isActive).length, inactive: templates.filter(template => !template.isActive).length };

  useEffect(() => {
    if (loading || error) return;
    setSelectedKey(selected?.key ?? null);
    if (!selected) setShowDetail(false);
  }, [selected?.key, loading, error]);
  useEffect(() => {
    if (!createdKey) return;
    setSearch(''); setFilter('all'); setSelectedKey(createdKey); setShowDetail(true);
  }, [createdKey]);

  const select = (template: ConsentTemplate) => {
    savedListScroll.current = listScroll.current?.scrollTop ?? 0;
    setSelectedKey(template.key); setShowDetail(true);
    if (!window.matchMedia('(min-width: 1024px)').matches) requestAnimationFrame(() => detailHeading.current?.focus());
  };
  const back = () => {
    setShowDetail(false);
    requestAnimationFrame(() => {
      if (listScroll.current) listScroll.current.scrollTop = savedListScroll.current;
      if (selected) rowRefs.current.get(selected.key)?.focus({ preventScroll: true });
    });
  };
  const title = (template: ConsentTemplate, lang: ConsentLanguage) => template.translations[lang].title || t('erp.dental.consent.untitled');
  const stateLabel = (active: boolean) => t(active ? 'erp.common.active' : 'erp.common.inactive');

  return <section className="min-w-0 space-y-3" aria-labelledby="consent-templates-heading" data-consent-workspace>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 data-tour="components-erp-settings-consenttemplatesworkspace.h2.consent-templates-heading" id="consent-templates-heading" className="text-xl font-semibold">{t('erp.dental.consent.settingsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('erp.dental.consent.settingsDescription')}</p>
      </div>
      {canManage && <Button data-tour="components-erp-settings-consenttemplatesworkspace.button.erp.dental.consent.add" data-consent-add variant="default" size="sm" className="max-w-full whitespace-normal" onClick={() => onEdit(null, uiLanguage)}><Plus aria-hidden="true" className="mr-1.5 h-4 w-4 shrink-0" />{t('erp.dental.consent.add')}</Button>}
    </div>
    {loading ? <p role="status" className="flex items-center gap-2 p-4 text-sm"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{t('erp.dental.consent.loading')}</p>
      : error ? <div role="alert" className="space-y-2 rounded-lg border p-4 text-sm"><p>{t('erp.dental.consent.errors.load')}</p><Button data-tour="components-erp-settings-consenttemplatesworkspace.button.erp.dental.consent.retry" variant="outline" onClick={onRetry}>{t('erp.dental.consent.retry')}</Button></div>
      : <div className="grid h-[max(540px,72dvh)] min-w-0 rounded-lg border border-border bg-card text-card-foreground lg:h-[min(72dvh,760px)] lg:min-h-[480px] lg:grid-cols-[clamp(320px,38%,440px)_minmax(0,1fr)]">
        <div data-consent-template-list className={`${showDetail ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-col lg:flex lg:border-r lg:border-border`}>
          <div className="shrink-0 space-y-3 p-3">
            <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input data-tour="components-erp-settings-consenttemplatesworkspace.input.search" type="search" className="h-9 pl-9 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('erp.dental.consent.list.search')} aria-label={t('erp.dental.consent.list.search')} /></div>
            <div role="group" aria-label={t('erp.dental.consent.list.filter')} className="inline-flex max-w-full rounded-md border border-border bg-muted/30 p-0.5">
              {(['all', 'active', 'inactive'] as const).map(value => <Button data-tour="components-erp-settings-consenttemplatesworkspace.button.erp.common.all" key={value} size="sm" variant="ghost" aria-pressed={filter === value} className={`h-8 gap-1.5 px-2 text-xs ${filter === value ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground'}`} onClick={() => setFilter(value)}>
                {value === 'all' ? t('erp.common.all') : stateLabel(value === 'active')}<span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{counts[value]}</span>
              </Button>)}
            </div>
          </div>
          <div ref={listScroll} data-consent-template-rows className="company-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
            {matching.length ? <ul aria-label={t('erp.dental.consent.settingsTitle')} className="divide-y divide-border/70">
              {matching.map(template => <li key={template.key}><button type="button" ref={node => { if (node) rowRefs.current.set(template.key, node); else rowRefs.current.delete(template.key); }} data-template-key={template.key} aria-current={selected?.key === template.key ? 'true' : undefined}
                className={`relative flex min-h-11 w-full items-center gap-2 rounded-md border-l-[3px] px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected?.key === template.key ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-muted/60'}`} onClick={() => select(template)}>
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={`min-w-0 flex-1 break-words ${selected?.key === template.key ? 'font-semibold' : ''}`}>{title(template, uiLanguage)}</span>
                <span className={`flex shrink-0 items-center gap-1.5 text-xs ${template.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${template.isActive ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />{stateLabel(template.isActive)}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button></li>)}
            </ul> : <p role="status" className="p-3 text-sm text-muted-foreground">{t(templates.length ? 'erp.dental.consent.list.noResults' : 'erp.dental.consent.list.empty')}</p>}
          </div>
          <p role="status" className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">{t('erp.dental.consent.list.count', undefined, { count: matching.length })}</p>
        </div>
        <div data-consent-template-detail className={`${showDetail ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col p-3 lg:flex lg:p-4`}>
          <Button data-tour="components-erp-settings-consenttemplatesworkspace.button.erp.dental.consent.list.back" variant="ghost" size="sm" className="mb-2 h-8 self-start px-1 text-xs lg:hidden" onClick={back}><ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />{t('erp.dental.consent.list.back')}</Button>
          {selected && translation ? <>
            <div className="flex shrink-0 flex-col flex-wrap items-start justify-between gap-3 border-b border-border pb-3 sm:flex-row">
              <div className="flex w-full min-w-0 flex-1 items-start gap-2.5 sm:w-auto sm:min-w-[180px]"><FileText aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" /><div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><h3 ref={detailHeading} tabIndex={-1} className="break-words text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{title(selected, language)}</h3><Badge variant="secondary" className={selected.isActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : ''}>{stateLabel(selected.isActive)}</Badge></div>
                <p className="text-xs text-muted-foreground">{t('erp.dental.consent.list.template')}</p>
              </div></div>
              <div className="flex max-w-full flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8 border-primary/40 px-2 text-xs" aria-label={t(canManage ? 'erp.dental.consent.edit' : 'erp.dental.consent.view')} onClick={() => onEdit(selected, language)}><Pencil aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />{t(canManage ? 'erp.dental.consent.list.edit' : 'erp.dental.consent.list.view')}</Button>
                {canManage && <Button variant="outline" size="sm" className="h-8 px-2 text-xs" disabled={toggling || (!selected.isActive && !consentTemplateInputSchema.safeParse({ ...selected, isActive: true }).success)} onClick={() => onToggle(selected)}>
                  {toggling ? <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : selected.isActive ? <Archive aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> : <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />}{t(selected.isActive ? 'erp.common.archive' : 'erp.common.activate')}
                </Button>}
              </div>
            </div>
            <Tabs value={language} onValueChange={value => setLanguage(value as ConsentLanguage)} className="flex min-h-0 flex-1 flex-col">
              <TabsList aria-label={t('erp.dental.consent.languages')} className="my-2 shrink-0">
                {(['en', 'es'] as const).map(lang => <TabsTrigger icon={CONTENT_TAB_ICONS[lang]} key={lang} value={lang}>{t(`erp.dental.consent.${lang === 'en' ? 'english' : 'spanish'}`)}</TabsTrigger>)}
              </TabsList>
              <TabsContent forceMount value={language} className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
                <p className="shrink-0 px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('erp.dental.consent.list.preview')}</p>
                {consentBodyText(translation).trim() || /<img\s/i.test(consentBodyHtml(translation)) ? <ConsentRichTextEditor key={`${selected.key}-${language}`} id="consent-saved-template-preview" value={consentBodyHtml(translation)} onChange={ignoreChange} lang={language} readOnly
                  className="flex min-h-0 flex-1 flex-col rounded-none border-0 bg-transparent [&_.consent-rich-content]:max-h-none [&_.consent-rich-content]:min-h-0 [&_.consent-rich-content]:flex-1 [&_.consent-rich-content]:text-sm [&_.consent-rich-content]:leading-relaxed" />
                  : <p role="status" className="p-3 text-sm text-muted-foreground">{t('erp.dental.consent.list.emptyTranslation')}</p>}
              </TabsContent>
            </Tabs>
            <p className="mt-3 flex shrink-0 items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t('erp.dental.consent.list.guidance')}</p>
          </> : <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground"><p>{t('erp.dental.consent.list.select')}</p></div>}
        </div>
      </div>}
  </section>;
}
