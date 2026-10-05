import { useEffect, useRef, useState } from 'react';
import { Move } from 'lucide-react';
import { ImageResizeHandles } from './image-resize-handles';
import { imageAnchor, imageLayout, insertionRangeAtPoint, layoutConsentImages, paragraphAtPoint } from './consent-image-layout';
import { sanitizeConsentHtml } from '@shared/dental-consent-rich-text';

export function ConsentImageInteraction({ image, root, onCommit, onCancel, onResize, label }: {
  image: HTMLImageElement; root: HTMLElement; onCommit: () => void; onCancel: (html: string) => void;
  onResize: (width: number) => void; label: (key: string) => string;
}) {
  const callbacks = useRef({ onCommit, onCancel, onResize }); callbacks.current = { onCommit, onCancel, onResize };
  const snapshot = useRef('');
  const gesture = useRef<{ x: number; y: number; left: number; top: number; anchor: HTMLElement; target: HTMLElement; pointer: number; lastX: number; lastY: number; range: Range | null; moved: boolean } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [marker, setMarker] = useState<{ left: number; top: number; height: number } | null>(null);
  const updatePosition = () => { const a = image.getBoundingClientRect(), b = root.getBoundingClientRect(); setPosition({ left: a.left - b.left + Math.min(32, a.width / 2), top: a.top - b.top + 12 }); };
  const place = (anchor: HTMLElement, left: number, top: number) => {
    const bounds = anchor.getBoundingClientRect();
    const available = Math.max(0, anchor.clientWidth - (anchor === root ? 24 : 0) - image.getBoundingClientRect().width);
    image.dataset.consentX = String(Math.max(0, Math.min(1, (left - bounds.left - (anchor === root ? 12 : 0)) / (available || 1))));
    image.dataset.consentY = String(Math.round(Math.max(0, Math.min(680, top - bounds.top + (anchor === root ? root.scrollTop : 0)))));
    layoutConsentImages(root); updatePosition();
  };
  const begin = (event: PointerEvent | React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    snapshot.current = sanitizeConsentHtml(root.innerHTML);
    const rect = image.getBoundingClientRect(), target = event.currentTarget as HTMLElement;
    gesture.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, anchor: imageAnchor(image, root), target, pointer: event.pointerId, lastX: event.clientX, lastY: event.clientY, range: null, moved: false };
    target.setPointerCapture(event.pointerId);
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = gesture.current; if (!drag || drag.pointer !== event.pointerId) return;
      drag.lastX = event.clientX; drag.lastY = event.clientY;
      drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 3;
      if (!drag.moved) return;
      const bounds = root.getBoundingClientRect();
      if (event.clientY < bounds.top + 24) root.scrollTop -= 12;
      if (event.clientY > bounds.bottom - 24) root.scrollTop += 12;
      if (['inline', 'break'].includes(imageLayout(image).wrap)) {
        const range = insertionRangeAtPoint(root, event.clientX, event.clientY);
        if (range && !image.contains(range.startContainer)) {
          drag.range = range; const rect = range.getBoundingClientRect();
          setMarker({ left: rect.left - bounds.left, top: rect.top - bounds.top, height: Math.max(18, rect.height) });
        }
      } else place(drag.anchor, drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
    };
    const finish = (cancel: boolean) => {
      const drag = gesture.current; if (!drag) return; gesture.current = null; setMarker(null);
      if (drag.target.hasPointerCapture(drag.pointer)) drag.target.releasePointerCapture(drag.pointer);
      if (cancel) { callbacks.current.onCancel(snapshot.current); return; }
      if (!drag.moved) return;
      if (['inline', 'break'].includes(imageLayout(image).wrap)) {
        if (drag.range && root.contains(drag.range.startContainer) && !image.contains(drag.range.startContainer)) {
          drag.range.insertNode(image);
        }
      } else {
        const anchor = paragraphAtPoint(root, image, drag.lastX, drag.lastY);
        if (anchor !== drag.anchor) anchor.insertBefore(image, anchor.firstChild);
        place(anchor, drag.left + drag.lastX - drag.x, drag.top + drag.lastY - drag.y);
      }
      layoutConsentImages(root); callbacks.current.onCommit(); updatePosition();
    };
    const up = () => finish(false), cancel = () => finish(true);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
    image.addEventListener('pointerdown', begin); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', escape, true);
    const observer = new ResizeObserver(updatePosition); observer.observe(image); observer.observe(root); root.addEventListener('scroll', updatePosition); window.addEventListener('resize', updatePosition); updatePosition();
    return () => { image.removeEventListener('pointerdown', begin); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', escape, true); observer.disconnect(); root.removeEventListener('scroll', updatePosition); window.removeEventListener('resize', updatePosition); if (gesture.current) { gesture.current = null; callbacks.current.onCancel(snapshot.current); } };
  }, [image, root]);
  return <>
    <ImageResizeHandles image={image} bounds={root} maxWidth={680} handleLabel={corner => label(`resize.${corner}`)}
      onResizeStart={() => { snapshot.current = sanitizeConsentHtml(root.innerHTML); }}
      onResize={(width) => { image.width = width; image.removeAttribute('height'); layoutConsentImages(root); callbacks.current.onResize(width); updatePosition(); }}
      onResizeEnd={() => callbacks.current.onCommit()} onResizeCancel={() => callbacks.current.onCancel(snapshot.current)} />
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {marker && <span className="absolute w-0.5 bg-primary" style={marker} />}
      <button type="button" aria-label={label('moveImage')} title={label('moveImage')} onPointerDown={begin}
        className="pointer-events-auto absolute flex h-7 w-7 touch-none items-center justify-center rounded border border-primary bg-background text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
        style={position} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const delta = event.shiftKey ? 10 : 1;
          if (['inline', 'break'].includes(imageLayout(image).wrap)) {
            const anchor = imageAnchor(image, root), sibling = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? anchor.previousElementSibling : anchor.nextElementSibling;
            if (sibling && !sibling.hasAttribute('data-consent-decoration')) sibling.prepend(image);
          } else {
            const rect = image.getBoundingClientRect(); place(imageAnchor(image, root), rect.left + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0), rect.top + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0));
          }
          layoutConsentImages(root); callbacks.current.onCommit(); updatePosition();
        }}><Move className="h-4 w-4" /></button>
    </div>
  </>;
}
