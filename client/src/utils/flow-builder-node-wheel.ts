const REACT_FLOW_NODE_SELECTOR = '.react-flow__node';
const SCROLL_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

function hasScrollOverflowStyle(el: HTMLElement): boolean {
  const { overflowX, overflowY } = getComputedStyle(el);
  return SCROLL_OVERFLOW.has(overflowX) || SCROLL_OVERFLOW.has(overflowY);
}

/** True when the element has content that exceeds its visible area (active scrollbar). */
export function hasActiveScroll(el: HTMLElement): boolean {
  if (el.hasAttribute('data-radix-scroll-area-viewport')) {
    return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  }

  if (el.tagName === 'TEXTAREA') {
    return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  }

  if (!hasScrollOverflowStyle(el)) {
    return false;
  }

  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
}

function getRadixScrollViewportFromTarget(target: Element, stopAt: Element): HTMLElement | null {
  const scrollbar = target.closest('[data-radix-scroll-area-scrollbar]');
  if (!scrollbar || !stopAt.contains(scrollbar)) {
    return null;
  }
  const viewport = scrollbar.parentElement?.querySelector('[data-radix-scroll-area-viewport]');
  return viewport instanceof HTMLElement ? viewport : null;
}

/** Innermost actively scrollable region under the wheel target (including Radix scrollbar hits). */
function findActiveScrollTarget(target: Element, stopAt: Element): HTMLElement | null {
  const radixViewport = getRadixScrollViewportFromTarget(target, stopAt);
  if (radixViewport && hasActiveScroll(radixViewport)) {
    return radixViewport;
  }

  let el: Element | null = target;
  while (el && stopAt.contains(el)) {
    if (el instanceof HTMLElement && hasActiveScroll(el)) {
      return el;
    }
    el = el.parentElement;
  }

  return null;
}

/** Mark the scroll surface and any Radix scrollbar siblings so closest('.nowheel') matches everywhere. */
function markScrollWheelBlock(scrollTarget: HTMLElement): void {
  const marked = new Set<HTMLElement>();
  const mark = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement) || marked.has(el)) return;
    el.classList.add('nowheel');
    marked.add(el);
  };

  mark(scrollTarget);

  const radixViewport = scrollTarget.hasAttribute('data-radix-scroll-area-viewport')
    ? scrollTarget
    : scrollTarget.closest('[data-radix-scroll-area-viewport]');

  if (radixViewport instanceof HTMLElement) {
    mark(radixViewport);
    mark(radixViewport.parentElement);
    radixViewport.parentElement
      ?.querySelectorAll('[data-radix-scroll-area-scrollbar]')
      .forEach((scrollbar) => mark(scrollbar));
  }
}

/** Remove stale nowheel marks left from earlier implementations. */
export function cleanupNodeNowheelMarks(root: ParentNode): void {
  root.querySelectorAll(`${REACT_FLOW_NODE_SELECTOR} .nowheel`).forEach((el) => {
    if (el instanceof HTMLElement) {
      el.classList.remove('nowheel');
    }
  });
}

/** Mark actively scrollable areas before React Flow's wheel handler runs. */
export function handleFlowBuilderNodeWheelCapture(event: React.WheelEvent): void {
  if (!(event.target instanceof Element)) return;

  const node = event.target.closest(REACT_FLOW_NODE_SELECTOR);
  if (!node) return;

  node.querySelectorAll('.nowheel').forEach((el) => {
    if (el instanceof HTMLElement) {
      el.classList.remove('nowheel');
    }
  });

  const scrollTarget = findActiveScrollTarget(event.target, node);
  if (scrollTarget) {
    markScrollWheelBlock(scrollTarget);
  }
}
