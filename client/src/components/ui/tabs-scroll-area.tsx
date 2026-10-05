import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

/** Scroll only the tab row, never its dialog or document. Radix owns keyboard selection. */
export function TabsScrollArea({ children }: { children: React.ReactNode }) {
  const root = React.useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const [edges, setEdges] = React.useState({ left: false, right: false });

  React.useLayoutEffect(() => {
    const frame = root.current!;
    const list = frame.querySelector<HTMLElement>('[data-slot="tabs-list"]');
    if (!list) return;
    let raf = 0;
    let revealPending = false;
    let activePending = false;
    let preferredTab: HTMLElement | null = null;
    const tabs = () => Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'))
      .filter(tab => tab.closest('[role="tablist"]') === list && tab.getClientRects().length);
    const measure = () => {
      const availableWidth = list.clientWidth + (frame.dataset.overflow ? 64 : 0);
      if (list.dataset.orientation === 'vertical' || !list.clientWidth || list.scrollWidth <= availableWidth + 1) {
        setEdges(old => old.left || old.right ? { left: false, right: false } : old);
        return;
      }
      const bounds = list.getBoundingClientRect();
      // Geometry works in either direction, independent of the browser's RTL scrollLeft model.
      const items = tabs();
      const left = items.some(tab => tab.getBoundingClientRect().left < bounds.left - 1);
      const right = items.some(tab => tab.getBoundingClientRect().right > bounds.right + 1);
      setEdges(old => old.left === left && old.right === right ? old : { left, right });
    };
    const reveal = (tab: HTMLElement | null) => {
      if (!tab || list.dataset.orientation === 'vertical') return;
      const outer = list.getBoundingClientRect(), inner = tab.getBoundingClientRect();
      const delta = inner.width > outer.width
        ? (getComputedStyle(list).direction === 'rtl' ? inner.right - outer.right : inner.left - outer.left)
        : inner.left < outer.left ? inner.left - outer.left : inner.right > outer.right ? inner.right - outer.right : 0;
      if (delta) list.scrollBy({ left: delta, behavior: 'instant' });
    };
    const schedule = (shouldReveal = false, preferActive = false) => {
      revealPending ||= shouldReveal;
      activePending ||= preferActive;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (revealPending) {
          if (activePending || !preferredTab || !list.contains(preferredTab) || !list.contains(document.activeElement)) {
            preferredTab = list.querySelector('[data-state="active"]');
          }
          reveal(preferredTab);
          revealPending = false;
          activePending = false;
        }
        measure();
      });
    };
    const onScroll = () => schedule();
    const onFocus = (event: FocusEvent) => {
      preferredTab = (event.target as HTMLElement).closest('[role="tab"]');
      reveal(preferredTab);
      schedule();
    };
    const resize = new ResizeObserver(() => schedule(true));
    const observeSizes = () => { resize.disconnect(); resize.observe(list); tabs().forEach(tab => resize.observe(tab)); };
    observeSizes();
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList')) observeSizes();
      schedule(true, records.some(record => record.attributeName === 'data-state'));
    });
    mutations.observe(list, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-state', 'data-orientation', 'dir', 'hidden', 'disabled', 'class'] });
    const direction = new MutationObserver(() => schedule(true));
    for (let parent: HTMLElement | null = list.parentElement; parent; parent = parent.parentElement) {
      direction.observe(parent, { attributes: true, attributeFilter: ['dir'] });
    }
    list.addEventListener('scroll', onScroll, { passive: true });
    list.addEventListener('focusin', onFocus);
    schedule(true);
    return () => { cancelAnimationFrame(raf); resize.disconnect(); mutations.disconnect(); direction.disconnect(); list.removeEventListener('scroll', onScroll); list.removeEventListener('focusin', onFocus); };
  }, []);

  const scroll = (direction: number) => {
    const list = root.current?.querySelector<HTMLElement>('[data-slot="tabs-list"]');
    if (list) list.scrollBy({ left: direction * list.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const overflow = edges.left || edges.right;
  return <div ref={root} className="tabs-scroll-area" data-overflow={overflow || undefined}>
    {children}
    {overflow && <>
      <button type="button" className="tabs-scroll-control tabs-scroll-left" disabled={!edges.left} onClick={() => scroll(-1)} aria-label={t('tabs.scroll_left', 'Scroll tabs left')}><ChevronLeft aria-hidden="true" size={16} /></button>
      <button type="button" className="tabs-scroll-control tabs-scroll-right" disabled={!edges.right} onClick={() => scroll(1)} aria-label={t('tabs.scroll_right', 'Scroll tabs right')}><ChevronRight aria-hidden="true" size={16} /></button>
    </>}
  </div>;
}
