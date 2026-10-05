import { useEffect, useRef, useState } from 'react';

interface ImageResizeHandlesProps {
  image: HTMLImageElement;
  onResize: (width: number, height: number) => void;
  onResizeEnd: () => void;
  aspectRatioLocked?: boolean;
  /** Opt-in pointer controls for a scrollable consent editor; legacy callers are unchanged. */
  bounds?: HTMLElement;
  maxWidth?: number;
  onResizeStart?: () => void;
  onResizeCancel?: () => void;
  handleLabel?: (corner: string) => string;
}

export function ImageResizeHandles(props: ImageResizeHandlesProps) {
  return props.bounds ? <PointerImageResizeHandles {...props} bounds={props.bounds} /> : <LegacyImageResizeHandles {...props} />;
}

function PointerImageResizeHandles({ image, bounds, maxWidth = 680, onResize, onResizeEnd, onResizeStart, onResizeCancel, handleLabel }: ImageResizeHandlesProps & { bounds: HTMLElement }) {
  const [rect, setRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const gesture = useRef<{ x: number; y: number; width: number; height: number; corner: string; target: HTMLElement; pointerId: number } | null>(null);
  const callbacks = useRef({ onResize, onResizeEnd, onResizeCancel });
  callbacks.current = { onResize, onResizeEnd, onResizeCancel };
  useEffect(() => {
    const update = () => { const a = image.getBoundingClientRect(), b = bounds.getBoundingClientRect(); setRect({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height }); };
    update(); const observer = new ResizeObserver(update); observer.observe(image); observer.observe(bounds);
    bounds.addEventListener('scroll', update); window.addEventListener('resize', update);
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const current = gesture.current; gesture.current = null;
      current.target.releasePointerCapture(current.pointerId); callbacks.current.onResizeCancel?.();
    };
    window.addEventListener('keydown', cancel, true);
    return () => { observer.disconnect(); bounds.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.removeEventListener('keydown', cancel, true); if (gesture.current) callbacks.current.onResizeCancel?.(); };
  }, [image, bounds]);
  // Position changes need observation as well as dimension changes.
  useEffect(() => {
    const a = image.getBoundingClientRect(), b = bounds.getBoundingClientRect();
    if (a.left - b.left !== rect.left || a.top - b.top !== rect.top) setRect({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height });
  });
  return <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-consent-resize-overlay>
    <div className="absolute border border-primary" style={rect} />
    {['nw', 'ne', 'sw', 'se'].map(corner => <button key={corner} type="button" aria-label={handleLabel?.(corner)} data-consent-corner={corner}
      className="pointer-events-auto absolute flex h-6 w-6 touch-none items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ left: rect.left + (corner.endsWith('e') ? rect.width : 0) - 12, top: rect.top + (corner.startsWith('s') ? rect.height : 0) - 12, cursor: `${corner}-resize` }}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart?.(); gesture.current = { x: event.clientX, y: event.clientY, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, corner, target: event.currentTarget, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => {
        const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
        const ratio = current.width / Math.max(1, current.height);
        const dx = (event.clientX - current.x) * (current.corner.endsWith('e') ? 1 : -1);
        const dy = (event.clientY - current.y) * (current.corner.startsWith('s') ? 1 : -1) * ratio;
        const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
        const width = Math.round(Math.max(24, Math.min(maxWidth, bounds.clientWidth - 24, current.width + delta)));
        callbacks.current.onResize(width, Math.round(width / ratio));
      }}
      onPointerUp={event => { if (!gesture.current) return; gesture.current = null; event.currentTarget.releasePointerCapture(event.pointerId); callbacks.current.onResizeEnd(); }}
      onPointerCancel={() => { if (gesture.current) { gesture.current = null; callbacks.current.onResizeCancel?.(); } }}
      onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; callbacks.current.onResizeCancel?.(); } }}
      onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); onResizeStart?.(); const delta = (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 10 : 1); const width = Math.max(24, Math.min(maxWidth, bounds.clientWidth - 24, image.width + delta)); onResize(width, width * image.naturalHeight / image.naturalWidth); onResizeEnd(); }}
    ><span className="h-2 w-2 border border-background bg-primary" /></button>)}
  </div>;
}

function LegacyImageResizeHandles({ image, onResize, onResizeEnd, aspectRatioLocked = true }: ImageResizeHandlesProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });
  const aspectRatio = useRef(1);

  useEffect(() => {
    if (image) {
      aspectRatio.current = image.naturalWidth / image.naturalHeight;
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    setResizeHandle(handle);

    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = {
      width: image.offsetWidth,
      height: image.offsetHeight
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !resizeHandle) return;

    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    
    let newWidth = startSize.current.width;
    let newHeight = startSize.current.height;

    switch (resizeHandle) {
      case 'se': // Southeast corner
        newWidth = Math.max(20, startSize.current.width + deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height + deltaY);
        }
        break;
      case 'sw': // Southwest corner
        newWidth = Math.max(20, startSize.current.width - deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height + deltaY);
        }
        break;
      case 'ne': // Northeast corner
        newWidth = Math.max(20, startSize.current.width + deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height - deltaY);
        }
        break;
      case 'nw': // Northwest corner
        newWidth = Math.max(20, startSize.current.width - deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height - deltaY);
        }
        break;
      case 'e': // East side
        newWidth = Math.max(20, startSize.current.width + deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        }
        break;
      case 'w': // West side
        newWidth = Math.max(20, startSize.current.width - deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        }
        break;
      case 'n': // North side
        if (!aspectRatioLocked) {
          newHeight = Math.max(20, startSize.current.height - deltaY);
        }
        break;
      case 's': // South side
        if (!aspectRatioLocked) {
          newHeight = Math.max(20, startSize.current.height + deltaY);
        }
        break;
    }

    onResize(Math.round(newWidth), Math.round(newHeight));
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    setResizeHandle(null);
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    onResizeEnd();
  };

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: '#007cba',
    border: '1px solid #fff',
    borderRadius: '2px',
    width: '8px',
    height: '8px',
    cursor: 'pointer',
    zIndex: 10000,
    pointerEvents: 'auto',
    userSelect: 'none'
  };

  const getHandlePosition = (handle: string) => {
    const rect = image.getBoundingClientRect();
    const editor = image.closest('[contenteditable]') as HTMLElement;
    const editorRect = editor?.getBoundingClientRect();

    if (!editorRect || !editor) return {};

    const relativeRect = {
      top: rect.top - editorRect.top + editor.scrollTop,
      left: rect.left - editorRect.left + editor.scrollLeft,
      width: rect.width,
      height: rect.height
    };

    switch (handle) {
      case 'nw':
        return { top: relativeRect.top - 4, left: relativeRect.left - 4, cursor: 'nw-resize' };
      case 'n':
        return { top: relativeRect.top - 4, left: relativeRect.left + relativeRect.width / 2 - 4, cursor: 'n-resize' };
      case 'ne':
        return { top: relativeRect.top - 4, left: relativeRect.left + relativeRect.width - 4, cursor: 'ne-resize' };
      case 'e':
        return { top: relativeRect.top + relativeRect.height / 2 - 4, left: relativeRect.left + relativeRect.width - 4, cursor: 'e-resize' };
      case 'se':
        return { top: relativeRect.top + relativeRect.height - 4, left: relativeRect.left + relativeRect.width - 4, cursor: 'se-resize' };
      case 's':
        return { top: relativeRect.top + relativeRect.height - 4, left: relativeRect.left + relativeRect.width / 2 - 4, cursor: 's-resize' };
      case 'sw':
        return { top: relativeRect.top + relativeRect.height - 4, left: relativeRect.left - 4, cursor: 'sw-resize' };
      case 'w':
        return { top: relativeRect.top + relativeRect.height / 2 - 4, left: relativeRect.left - 4, cursor: 'w-resize' };
      default:
        return {};
    }
  };

  const handles = aspectRatioLocked 
    ? ['nw', 'ne', 'se', 'sw', 'e', 'w'] // Skip north and south handles when aspect ratio is locked
    : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <>
      {handles.map(handle => {
        const position = getHandlePosition(handle);
        return (
          <div
            key={handle}
            className="image-resize-handle"
            style={{
              ...handleStyle,
              ...position,
              cursor: position.cursor
            }}
            onMouseDown={(e) => handleMouseDown(e, handle)}
          />
        );
      })}
    </>
  );
}
