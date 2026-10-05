'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { CHANGELOG_ENTRIES, type ChangelogEntry } from '@/lib/changelog-config';
import { useTranslation } from '@/hooks/use-translation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import pkg from '../../../../package.json';

const CATEGORY_COLOR_CLASSES = {
  green: {
    dot: 'bg-green-500',
    link: 'text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'
  },
  red: {
    dot: 'bg-red-500',
    link: 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300'
  },
  blue: {
    dot: 'bg-blue-500',
    link: 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'
  },
  purple: {
    dot: 'bg-purple-500',
    link: 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300'
  }
} as const;

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries?: ChangelogEntry[];
}

export function ChangelogDialog({ open, onOpenChange, entries = CHANGELOG_ENTRIES }: ChangelogDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent contentNoScroll className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 shrink-0 space-y-2 border-b border-border bg-background pb-5 text-center">
          <DialogTitle className="text-2xl font-bold text-foreground">
            {t('changelog.title', 'Changelog')} v{pkg.version}
          </DialogTitle>
          <DialogDescription
            id="changelog-description"
            className="text-center text-muted-foreground"
          >
            {t(
              'changelog.subtitle',
              'Stay up to date with the latest improvements and new features.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pt-5">
          <div className="relative">
            {entries.map((entry, index) => (
              <ChangelogRow
                key={index}
                entry={entry}
                isLast={index === entries.length - 1}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangelogRow({
  entry,
  isLast
}: {
  entry: ChangelogEntry;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const colorClasses = CATEGORY_COLOR_CLASSES[entry.categoryColor];

  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      <div className="relative flex w-3 shrink-0 justify-center">
        <div
          className={cn(
            'absolute left-1/2 -ml-px border-l-2 border-dashed border-border',
            isLast ? 'top-0 h-3' : 'inset-y-0'
          )}
          aria-hidden
        />
        <div className="relative z-10 mt-1.5 size-3 rounded-full border-2 border-background shadow-sm">
          <div className={cn('size-full rounded-full', colorClasses.dot)} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground mb-2">
          {entry.date} ·{' '}
          {entry.categoryKey
            ? t(entry.categoryKey, entry.category)
            : entry.category}
        </p>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="font-semibold text-foreground mb-2">
            {entry.titleKey ? t(entry.titleKey, entry.title) : entry.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {entry.descriptionKey
              ? t(entry.descriptionKey, entry.description)
              : entry.description}
          </p>
          {entry.learnMoreUrl && (
            <a
              href={entry.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center text-sm font-medium transition-colors',
                colorClasses.link
              )}
            >
              {t('changelog.learn_more', 'Learn More')}
              <ChevronRight className="h-4 w-4 ml-0.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
