import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import { googleCalendarAuth, type GoogleCalendarListItem } from '@/services/googleCalendarAuth';
import { cn } from '@/lib/utils';

export interface GoogleCalendarSelectorProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Placeholder for SelectValue (defaults via i18n). */
  placeholder?: string;
  compact?: boolean;
}

export function GoogleCalendarSelector({
  value,
  onChange,
  disabled = false,
  className,
  placeholder,
  compact = false,
}: GoogleCalendarSelectorProps) {
  const { t } = useTranslation();

  const defaultPlaceholder = t('calendar.select_calendar_placeholder', 'Select calendar');

  const {
    data: listResponse,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['google-calendar-list'],
    queryFn: () => googleCalendarAuth.listCalendars(),
    staleTime: 5 * 60 * 1000,
    enabled: !disabled,
  });

  const calendars = useMemo<GoogleCalendarListItem[]>(() => {
    if (!listResponse?.success || !Array.isArray(listResponse.calendars)) {
      return [];
    }
    return listResponse.calendars;
  }, [listResponse]);

  const listFailed = isError || listResponse?.success === false;

  useEffect(() => {
    if (disabled || isFetching || listFailed || calendars.length === 0) {
      return;
    }
    const primaryCalendar = calendars.find((c) => c.primary);
    const fallbackId = primaryCalendar?.id ?? 'primary';
    const selectedExists = calendars.some((c) => c.id === value);
    if (!selectedExists) {
      onChange(fallbackId);
    }
  }, [disabled, isFetching, listFailed, calendars, value, onChange]);

  if (disabled) {
    return (
      <div
        className={cn(
          'flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground',
          compact && 'h-8 text-xs',
          className
        )}
      >
        {placeholder ?? defaultPlaceholder}
      </div>
    );
  }

  if (isFetching) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground',
          compact && 'py-1',
          className
        )}
      >
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        <span>{t('calendar.calendars_loading', 'Loading calendars…')}</span>
      </div>
    );
  }

  if (listFailed) {
    return (
      <Select disabled value="__error__">
        <SelectTrigger className={cn(compact && 'h-8 text-xs text-muted-foreground', className)}>
          <SelectValue placeholder={t('calendar.calendars_load_failed', 'Failed to load calendars')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__error__" disabled>
            {t('calendar.calendars_load_failed', 'Failed to load calendars')}
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (calendars.length === 0) {
    return (
      <Select disabled value="__empty__">
        <SelectTrigger className={cn(compact && 'h-8 text-xs text-muted-foreground', className)}>
          <SelectValue placeholder={t('calendar.no_calendars', 'No calendars available')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__" disabled>
            {t('calendar.no_calendars', 'No calendars available')}
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(compact && 'h-8 text-xs text-muted-foreground', className)}>
        <SelectValue placeholder={placeholder ?? defaultPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {calendars.map((calendar) => {
          const label = calendar.summaryOverride || calendar.summary;
          return (
            <SelectItem key={calendar.id} value={calendar.id}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full border border-border',
                    !calendar.backgroundColor && 'bg-primary'
                  )}
                  style={
                    calendar.backgroundColor
                      ? { backgroundColor: calendar.backgroundColor }
                      : undefined
                  }
                />
                <span className="truncate">{label}</span>
                {calendar.primary ? (
                  <Badge variant="secondary" className="ml-1 shrink-0 text-[10px] font-normal">
                    {t('calendar.primary_calendar_badge', 'Primary')}
                  </Badge>
                ) : null}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
