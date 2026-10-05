import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RecentDocumentItem = {
  key: string;
  href: string;
  title: string;
  tag: string;
};

type RecentDocumentsListProps = {
  items: RecentDocumentItem[];
  className?: string;
};

export function RecentDocumentsList({ items, className }: RecentDocumentsListProps) {
  if (items.length === 0) return null;

  return (
    <ul className={cn('space-y-2', className)}>
      {items.map((item) => (
        <li key={item.key}>
          <a
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40"
          >
            <FileText className="h-4 w-4 shrink-0 text-foreground/80" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
            <span className="shrink-0 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
              {item.tag}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
