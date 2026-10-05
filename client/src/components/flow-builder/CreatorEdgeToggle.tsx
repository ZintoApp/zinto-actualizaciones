import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CreatorEdgeToggleProps = {
  expanded: boolean;
  label: string;
  position: number;
  onPositionChange: (position: number) => void;
  onToggle: () => void;
  className?: string;
};

const MIN_POSITION = 8;
const MAX_POSITION = 92;
const DRAG_THRESHOLD_PX = 4;

export function CreatorEdgeToggle({
  expanded,
  label,
  position,
  onPositionChange,
  onToggle,
  className,
}: CreatorEdgeToggleProps) {
  const dragRef = useRef<{ pointerId: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  return (
    <Button
      type="button"
      variant="ghost"
      style={{ top: `${Math.min(MAX_POSITION, Math.max(MIN_POSITION, position))}%` }}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onToggle();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        suppressClickRef.current = false;
        dragRef.current = { pointerId: event.pointerId, startY: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (Math.abs(event.clientY - drag.startY) >= DRAG_THRESHOLD_PX) drag.moved = true;
        if (!drag.moved) return;
        const track = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!track?.height) return;
        const nextPosition = ((event.clientY - track.top) / track.height) * 100;
        onPositionChange(Math.min(MAX_POSITION, Math.max(MIN_POSITION, nextPosition)));
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        suppressClickRef.current = drag.moved;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        dragRef.current = null;
        suppressClickRef.current = true;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      className={cn(
        'creator-edge-toggle relative isolate flex h-16 w-10 -translate-y-1/2 touch-none select-none cursor-pointer flex-col gap-1 overflow-visible rounded-l-xl rounded-r-none border border-r-0 p-0 shadow-lg transition-[background-color,transform] duration-300 hover:scale-[1.03] motion-reduce:transform-none',
        className,
      )}
      aria-label={label}
      aria-pressed={expanded}
      title={label}
    >
      {!expanded && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -inset-0.5 !h-[68px] !w-[44px] overflow-visible text-primary-foreground"
          viewBox="0 0 44 68"
          preserveAspectRatio="none"
        >
          <path
            d="M42 2H14C7.4 2 2 7.4 2 14V54C2 60.6 7.4 66 14 66H42"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="creator-edge-toggle-snake"
            d="M42 2H14C7.4 2 2 7.4 2 14V54C2 60.6 7.4 66 14 66H42"
            fill="none"
            pathLength="100"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {expanded ? <ChevronRight className="relative z-10 h-4 w-4" strokeWidth={3} /> : <ChevronLeft className="relative z-10 h-4 w-4" strokeWidth={3} />}
      <Sparkles className="relative z-10 h-4 w-4 text-primary-foreground" strokeWidth={3} />
    </Button>
  );
}
