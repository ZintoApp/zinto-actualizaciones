import Header from '@/components/layout/Header';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

type DentalShellPageProps = {
  title: string;
  eyebrow?: string;
  description: string;
  titleIcon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  contentClassName?: string;
};

export function DentalShellPage({
  title,
  eyebrow,
  description,
  titleIcon,
  actions,
  children,
  contentClassName,
}: DentalShellPageProps) {
  const { t } = useTranslation();
  const { isDental, isLoading } = useErpBusinessType();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isDental) setLocation('/erp/dashboard');
  }, [isLoading, isDental, setLocation]);

  if (isLoading || !isDental) {
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 p-6 text-muted-foreground">{t('erp.common.loading', 'Loading...')}</main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <Header />
      <main className={cn('min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain p-3 sm:p-4 md:p-6', contentClassName)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-[11px] font-medium uppercase tracking-[.16em] text-muted-foreground">{eyebrow}</p>}
            {titleIcon ? (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm">
                  {titleIcon}
                </span>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              </div>
            ) : (
              <h1 className="text-2xl">{title}</h1>
            )}
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          {actions ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
