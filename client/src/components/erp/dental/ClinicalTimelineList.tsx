import { cn } from '@/lib/utils';

export type ClinicalTimelineItem = {
  key: string;
  dateLabel: string;
  timeLabel: string;
  description: string;
  subDescription?: string | null;
};

type ClinicalTimelineListProps = {
  items: ClinicalTimelineItem[];
  className?: string;
};

export function ClinicalTimelineList({ items, className }: ClinicalTimelineListProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn('relative', className)}>
      {items.length > 1 ? (
        <div
          className="absolute left-[5px] top-[6px] bottom-[6px] w-px bg-border/80"
          aria-hidden
        />
      ) : null}
      <ul className="space-y-0">
        {items.map((item, index) => (
          <li
            key={item.key}
            className={cn('relative flex gap-3', index < items.length - 1 ? 'pb-5' : undefined)}
          >
            <div
              className={cn(
                'relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-background',
                index === 0 ? 'border-emerald-500' : 'border-muted-foreground/35',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight text-foreground">{item.dateLabel}</p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-muted-foreground">{item.description}</p>
                  {item.subDescription ? (
                    <p className="mt-0.5 text-xs text-muted-foreground/80">{item.subDescription}</p>
                  ) : null}
                </div>
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {item.timeLabel}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
