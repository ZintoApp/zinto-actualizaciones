import { consentImageLayout } from '@shared/dental-consent-rich-text';

export const imageLayout = (image: HTMLImageElement) => consentImageLayout(Object.fromEntries(Array.from(image.attributes, attr => [attr.name, attr.value])));
export function imageAnchor(image: HTMLImageElement, root: HTMLElement): HTMLElement {
  const parent = image.parentElement?.closest<HTMLElement>('p,div,li,h1,h2,h3');
  return parent && parent !== root && root.contains(parent) ? parent : root;
}

/** Browser-only geometry. Sanitization removes these styles and exclusion spacers. */
export function layoutConsentImages(root: HTMLElement) {
  type Exclusion = { side: 'left' | 'right'; width: number; top: number; bottom: number };
  const exclusions = new Map<HTMLElement, Exclusion[]>();
  root.querySelectorAll('[data-consent-decoration]').forEach(node => node.remove());
  root.querySelectorAll<HTMLElement>('[data-consent-anchor]').forEach(node => { node.style.position = ''; node.removeAttribute('data-consent-anchor'); });
  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    const layout = imageLayout(image);
    const alignment = image.style.textAlign;
    image.removeAttribute('style'); image.style.textAlign = alignment;
    image.draggable = false;
    if (layout.wrap === 'break') continue;
    image.style.margin = '0';
    if (layout.wrap === 'inline') { image.style.display = 'inline-block'; image.style.verticalAlign = 'baseline'; continue; }
    const anchor = imageAnchor(image, root);
    anchor.dataset.consentAnchor = 'true'; anchor.style.position = 'relative';
    const rootPadding = anchor === root ? 24 : 0;
    const available = Math.max(24, anchor.clientWidth - rootPadding);
    const width = Math.min(Number(image.getAttribute('width')) || image.naturalWidth || 320, available);
    const height = width * (image.naturalHeight || 1) / (image.naturalWidth || 1);
    const x = (available - width) * layout.x;
    image.style.position = 'absolute'; image.style.left = `${x + (anchor === root ? 12 : 0)}px`;
    image.style.top = `${layout.y}px`; image.style.width = `${width}px`;
    image.style.zIndex = layout.wrap === 'behind' ? '-1' : layout.wrap === 'front' ? '2' : '1';
    if (layout.wrap === 'wrap') {
      // Flow on the larger side of an interior image, returning to full width below it.
      const side = layout.x <= 0.5 ? 'left' : 'right';
      const exclusionWidth = (side === 'left' ? x : available - x - width) + width + layout.gap;
      const regions = exclusions.get(anchor) || [];
      regions.push({ side, width: Math.min(available, exclusionWidth), top: Math.max(0, layout.y - layout.gap), bottom: layout.y + height + layout.gap });
      exclusions.set(anchor, regions);
    }
  }
  for (const [anchor, original] of exclusions) {
    const available = anchor.clientWidth - (anchor === root ? 24 : 0);
    const leftWidth = Math.max(0, ...original.filter(region => region.side === 'left').map(region => region.width));
    const rightWidth = Math.max(0, ...original.filter(region => region.side === 'right').map(region => region.width));
    // When opposing exclusion boxes cannot fit on a narrow screen, text clears both.
    const regions: Exclusion[] = leftWidth + rightWidth > available ? [{ side: 'left', width: available, top: Math.min(...original.map(region => region.top)), bottom: Math.max(...original.map(region => region.bottom)) }] : original;
    for (const side of ['left', 'right'] as const) {
      const group = regions.filter(region => region.side === side); if (!group.length) continue;
      const width = Math.max(...group.map(region => region.width)), bottom = Math.max(...group.map(region => region.bottom));
      const stops = [...new Set([0, ...group.flatMap(region => [region.top, region.bottom])])].sort((a, b) => a - b);
      const outer = side === 'left' ? 0 : width;
      const points = [`${outer}px 0px`];
      for (let i = 0; i < stops.length - 1; i++) {
        const edge = Math.max(0, ...group.filter(region => region.top < stops[i + 1] && region.bottom > stops[i]).map(region => region.width));
        const x = side === 'left' ? edge : width - edge;
        points.push(`${x}px ${stops[i]}px`, `${x}px ${stops[i + 1]}px`);
      }
      points.push(`${outer}px ${bottom}px`);
      const spacer = document.createElement('span');
      spacer.dataset.consentDecoration = 'wrap'; spacer.contentEditable = 'false'; spacer.setAttribute('aria-hidden', 'true');
      Object.assign(spacer.style, { cssFloat: side, width: `${width}px`, height: `${bottom}px`, shapeOutside: `polygon(${points.join(',')})`, pointerEvents: 'none' });
      anchor.insertBefore(spacer, anchor.firstChild);
    }
  }
  const clear = document.createElement('span'); clear.dataset.consentDecoration = 'clear'; clear.contentEditable = 'false'; clear.setAttribute('aria-hidden', 'true');
  Object.assign(clear.style, { display: 'block', clear: 'both', height: '0', pointerEvents: 'none' }); root.append(clear);
}

export function paragraphAtPoint(root: HTMLElement, image: HTMLImageElement, x: number, y: number): HTMLElement {
  const paragraphs = Array.from(root.querySelectorAll<HTMLElement>('p,div,li,h1,h2,h3')).filter(node => !node.hasAttribute('data-consent-decoration') && !node.contains(image));
  const containing = paragraphs.filter(node => { const rect = node.getBoundingClientRect(); return y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right; });
  return containing.at(-1) || imageAnchor(image, root);
}

export function insertionRangeAtPoint(root: HTMLElement, x: number, y: number): Range | null {
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let range = doc.caretRangeFromPoint?.(x, y);
  if (!range) {
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) { range = document.createRange(); range.setStart(position.offsetNode, position.offset); range.collapse(true); }
  }
  if (!range || !root.contains(range.startContainer)) return null;
  const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  return element?.closest('[data-consent-decoration]') ? null : range;
}
