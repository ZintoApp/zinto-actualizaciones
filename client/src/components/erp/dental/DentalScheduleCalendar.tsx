import { useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent } from 'react';
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  ArrowRight,
  BellRing,
  Pencil,
  Phone,
  Plus,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { enUS, es as esLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AppointmentMessageIcon } from '@/components/icons/AppointmentMessageIcon';
import { cn } from '@/lib/utils';
import {
  getDentalAppointmentColor,
  getDentalAppointmentColorStyle,
  isMutedDentalAppointment,
} from '@/lib/dentalAppointmentColors';
import {
  addDaysToDateKey,
  formatDentalCalendarHour,
  formatDentalCalendarTime,
  listDateKeys,
  type DentalCalendarView,
  type DentalDateRange,
} from '@shared/types/dental-schedule-calendar';
import type { DentalBookingPolicy } from '@shared/types/dental-booking-types';

export type DentalCalendarAppointment = {
  id: number;
  contactId: number;
  scheduledAt: string;
  durationMinutes: number | null;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  contactPhone: string | null;
  contactName: string | null;
  contactAvatarUrl: string | null;
  providerName: string | null;
  providerAvatarUrl: string | null;
  chairId: number | null;
  chairName: string | null;
  bookingServiceKey: string | null;
  bookingServiceLabel: string | null;
  calendarColor: string | null;
  isRecall: boolean;
};

type Chair = { id: number; name: string };

type Props = {
  /** Domain adapters may customize available views without changing Dental defaults. */
  views?: DentalCalendarView[];
  showAppointmentContext?: boolean;
  appointments: DentalCalendarAppointment[];
  upcomingAppointments?: DentalCalendarAppointment[];
  upcomingLoading?: boolean;
  upcomingError?: boolean;
  chairs: Chair[];
  policy?: DentalBookingPolicy;
  timezone: string;
  locale?: string;
  view: DentalCalendarView;
  range: DentalDateRange;
  selectedDate: string;
  rangeLabel: string;
  statusLabel: (status: string) => string;
  canEdit: boolean;
  canMessage?: boolean;
  onViewChange: (view: DentalCalendarView) => void;
  onSelectedDateChange: (date: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onEdit: (appointment: DentalCalendarAppointment) => void;
  onMessage?: (appointment: DentalCalendarAppointment) => void;
  onReminder?: (appointment: DentalCalendarAppointment) => void;
  onViewAllUpcoming?: () => void;
  onCreate: (date: string, time?: string, chairId?: number | null) => void;
  t: (key: string, fallback?: string, values?: Record<string, unknown>) => string;
};

// A generous hour height keeps real appointment durations legible and gives the
// timeline the same scan-friendly rhythm as full calendar applications.
const TIMELINE_HOUR_HEIGHT = 96;
const MIN_EVENT_HEIGHT = 32;
const TIMELINE_GUTTER_WIDTH = 76;
const CARD_CLICK_DELAY_MS = 220;

function eventColor(row: DentalCalendarAppointment): string {
  return cn('text-foreground', isMutedDentalAppointment(row) && 'opacity-55 grayscale-[35%]');
}

function dateAtNoon(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateKeyFromLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusClass(status: string): string {
  if (status === 'scheduled') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'confirmed') return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
  if (status === 'completed') return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
  if (status === 'cancelled' || status === 'no_show') return 'bg-red-500/15 text-red-600 dark:text-red-400';
  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
}

function localParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const rawHour = Number(get('hour'));
  const hour = rawHour === 24 ? 0 : rawHour;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
    time: `${String(hour).padStart(2, '0')}:${get('minute')}`,
  };
}

function formatDate(dateKey: string, locale?: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options ?? { weekday: 'short', month: 'short', day: 'numeric' }).format(dateAtNoon(dateKey));
}

function placeTimelineAppointments(rows: DentalCalendarAppointment[], timezone: string) {
  const sorted = [...rows].sort((left, right) => +new Date(left.scheduledAt) - +new Date(right.scheduledAt));
  const groups: Array<Array<{ row: DentalCalendarAppointment; lane: number; start: number; end: number }>> = [];
  let currentGroup: Array<{ row: DentalCalendarAppointment; lane: number; start: number; end: number }> = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];

  for (const row of sorted) {
    const parts = localParts(row.scheduledAt, timezone);
    const start = parts.hour * 60 + parts.minute;
    // Very short events still need enough visual room for their title. Treat
    // that minimum display height as occupied space when allocating lanes.
    const visualMinutes = Math.max(row.durationMinutes ?? 60, MIN_EVENT_HEIGHT / TIMELINE_HOUR_HEIGHT * 60);
    const end = start + visualMinutes;

    if (currentGroup.length > 0 && start >= groupEnd) {
      groups.push(currentGroup);
      currentGroup = [];
      laneEnds = [];
      groupEnd = -1;
    }

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    groupEnd = Math.max(groupEnd, end);
    currentGroup.push({ row, lane, start, end });
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups.flatMap((group) => {
    const laneCount = Math.max(1, ...group.map((item) => item.lane + 1));
    return group.map((item) => ({ ...item, laneCount }));
  });
}

export function DentalScheduleCalendar(props: Props) {
  const {
    appointments, upcomingAppointments = [], upcomingLoading, upcomingError, chairs, policy, timezone, locale, view, range, selectedDate, rangeLabel,
    statusLabel, canEdit, canMessage, onViewChange, onSelectedDateChange, onPrevious, onNext, onToday, onEdit, onMessage, onReminder, onViewAllUpcoming, onCreate, t,
  } = props;
  const calendarLocale = locale?.toLowerCase().startsWith('es') ? esLocale : enUS;
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [monthOverflowDate, setMonthOverflowDate] = useState<string | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
  }, []);

  useEffect(() => {
    setDetailsKey(null);
    setMonthOverflowDate(null);
  }, [range.from, range.to, view]);
  const byDate = useMemo(() => {
    const map = new Map<string, DentalCalendarAppointment[]>();
    for (const row of appointments) {
      const date = localParts(row.scheduledAt, timezone).date;
      map.set(date, [...(map.get(date) ?? []), row]);
    }
    for (const rows of map.values()) rows.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
    return map;
  }, [appointments, timezone]);

  const scheduleHours = useMemo(() => {
    const starts: number[] = [];
    const ends: number[] = [];
    for (const day of policy?.clinicHours ?? []) {
      if (!day.enabled) continue;
      starts.push(Number(day.startTime.split(':')[0]));
      ends.push(Math.ceil(Number(day.endTime.split(':')[0]) + Number(day.endTime.split(':')[1]) / 60));
    }
    for (const row of appointments) {
      const parts = localParts(row.scheduledAt, timezone);
      starts.push(parts.hour);
      ends.push(Math.ceil(parts.hour + (parts.minute + (row.durationMinutes ?? 60)) / 60));
    }
    return { start: Math.max(0, Math.min(8, ...(starts.length ? starts : [8]))), end: Math.min(24, Math.max(18, ...(ends.length ? ends : [18]))) };
  }, [appointments, policy, timezone]);

  const openDetailsAfterClick = (key: string) => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      setDetailsKey(key);
      clickTimerRef.current = null;
    }, CARD_CLICK_DELAY_MS);
  };

  const editAfterDoubleClick = (row: DentalCalendarAppointment) => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    setDetailsKey(null);
    setMonthOverflowDate(null);
    if (canEdit) onEdit(row);
  };

  const forwardVerticalWheelToPage = (event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    let scrollParent = event.currentTarget.parentElement;
    while (scrollParent) {
      const overflowY = window.getComputedStyle(scrollParent).overflowY;
      if (/(auto|scroll)/.test(overflowY) && scrollParent.scrollHeight > scrollParent.clientHeight) break;
      scrollParent = scrollParent.parentElement;
    }

    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const top = event.deltaY * multiplier;
    if (scrollParent) scrollParent.scrollBy({ top, behavior: 'auto' });
    else window.scrollBy({ top, behavior: 'auto' });
  };

  const renderDetailsPopover = (row: DentalCalendarAppointment, instanceKey: string, trigger: ReactNode) => {
    const startsAt = new Date(row.scheduledAt);
    const endsAt = new Date(startsAt.getTime() + (row.durationMinutes ?? 60) * 60_000);
    const dateLabel = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(startsAt);
    return (
      <Popover
        key={instanceKey}
        open={detailsKey === instanceKey}
        onOpenChange={(open) => setDetailsKey(open ? instanceKey : null)}
      >
        <PopoverAnchor asChild>{trigger}</PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="custom-scrollbar max-h-[min(80vh,36rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-0 shadow-xl"
        >
          <div className="flex items-start gap-3 border-b p-4">
            <span
              className="mt-1 h-4 w-4 shrink-0 rounded"
              style={{ backgroundColor: getDentalAppointmentColor(row) }}
            />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold">{row.bookingServiceLabel || row.title}</h3>
              {row.bookingServiceLabel && row.title !== row.bookingServiceLabel ? (
                <p className="truncate text-sm text-muted-foreground">{row.title}</p>
              ) : null}
            </div>
            {canEdit ? (
              <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.details.edit"
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label={t('erp.dental.schedule.details.edit', 'Edit appointment')}
                onClick={() => editAfterDoubleClick(row)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.details.close"
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label={t('erp.dental.schedule.details.close', 'Close appointment details')}
              onClick={() => setDetailsKey(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="font-medium">{dateLabel}</div>
                <div className="font-semibold tabular-nums">
                  {formatDentalCalendarTime(startsAt, timezone, locale)} – {formatDentalCalendarTime(endsAt, timezone, locale)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    ({t('erp.dental.schedule.details.minutes', '{{count}} min', { count: row.durationMinutes ?? 60 })})
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={row.contactAvatarUrl || undefined} alt={row.contactName || ''} />
                <AvatarFallback>{row.contactName?.slice(0, 2).toUpperCase() || '#'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{row.contactName || `#${row.id}`}</div>
                {row.contactPhone ? <div className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Phone className="h-3 w-3" />{row.contactPhone}</div> : null}
              </div>
              {canMessage ? <div className="flex shrink-0 gap-1">
                <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.messagePatient" type="button" size="icon" variant="outline" className="h-8 w-8 border-emerald-500/40 hover:bg-emerald-500/10" aria-label={t('erp.dental.schedule.messagePatient', 'Message patient')} onClick={() => onMessage?.(row)}>
                  <AppointmentMessageIcon className="h-4 w-4 text-black dark:text-white" />
                </Button>
                <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.sendReminder" type="button" size="icon" variant="outline" className="h-8 w-8 border-red-900 bg-red-900 text-white hover:bg-red-800 hover:text-white dark:border-red-950 dark:bg-red-950 dark:hover:bg-red-900" aria-label={t('erp.dental.schedule.sendReminder', 'Send appointment reminder')} onClick={() => onReminder?.(row)}>
                  <BellRing className="h-4 w-4" />
                </Button>
              </div> : null}
            </div>
            {row.providerName ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={row.providerAvatarUrl || undefined} alt={row.providerName} />
                  <AvatarFallback>{row.providerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0"><div className="text-xs text-muted-foreground">{t('erp.dental.schedule.provider', 'Provider')}</div><div className="truncate font-medium">{row.providerName}</div></div>
              </div>
            ) : (
              <div className="flex items-center gap-3"><UserRound className="h-4 w-4 text-muted-foreground" /><span>{t('erp.dental.schedule.unassigned', 'Unassigned')}</span></div>
            )}
            {row.chairName || row.location ? (
              <div className="flex items-start gap-3">
                {row.chairName ? <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 break-words">{[row.chairName, row.location].filter(Boolean).join(' · ')}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <Badge className={cn('border-0', statusClass(row.status))}>{statusLabel(row.status)}</Badge>
              {row.isRecall ? <Badge variant="outline">{t('erp.dental.schedule.recall', 'Recall visit')}</Badge> : null}
            </div>
            {row.description ? <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-muted-foreground">{row.description}</p> : null}
            {canEdit ? <p className="text-xs text-muted-foreground">{t('erp.dental.schedule.details.doubleClickHint', 'Double-click the appointment card to edit it directly.')}</p> : null}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderEvent = (row: DentalCalendarAppointment, instanceKey: string, compact = false, fill = false) => {
    const trigger = (
      <button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.details.open"
        type="button"
        onClick={(event) => { event.stopPropagation(); openDetailsAfterClick(instanceKey); }}
        onDoubleClick={(event) => { event.stopPropagation(); editAfterDoubleClick(row); }}
        aria-label={t('erp.dental.schedule.details.open', 'View appointment details')}
        title={canEdit ? t('erp.dental.schedule.details.doubleClickHint', 'Double-click the appointment card to edit it directly.') : undefined}
        style={getDentalAppointmentColorStyle(row)}
        className={cn(
          'w-full overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-[11px] shadow-sm transition hover:z-20 hover:brightness-95 dark:hover:brightness-110',
          fill && 'h-full min-h-0',
          eventColor(row),
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar className="h-6 w-6 shrink-0 border border-background/60 shadow-sm">
            <AvatarImage src={row.contactAvatarUrl || undefined} alt={row.contactName || ''} />
            <AvatarFallback className="bg-background/75 text-[9px] font-semibold text-foreground">
              {row.contactName?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '#'}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-xs font-bold tabular-nums">{formatDentalCalendarTime(row.scheduledAt, timezone, locale)}</span>
            <span className="block truncate font-semibold">{row.contactName || `#${row.id}`}</span>
            {!compact ? <span className="block truncate opacity-75">{row.bookingServiceLabel || row.title}</span> : null}
            {props.showAppointmentContext&&!compact&&<><span className="block truncate opacity-75">{row.title}</span>{row.location&&<span className="block truncate opacity-70">{row.location}</span>}</>}
          </span>
        </span>
      </button>
    );
    return renderDetailsPopover(row, instanceKey, trigger);
  };

  const timelineColumns = view === 'rooms'
    ? [{ id: 'unassigned', label: t('erp.dental.schedule.unassigned', 'Unassigned'), chairId: null }, ...chairs.map((chair) => ({ id: String(chair.id), label: chair.name, chairId: chair.id }))]
    : listDateKeys(range).map((date) => ({ id: date, label: formatDate(date, locale), date }));
  const hours = Array.from({ length: Math.max(1, scheduleHours.end - scheduleHours.start) }, (_, index) => scheduleHours.start + index);
  const timelineMinWidth = view === 'day'
    ? undefined
    : Math.max(720, TIMELINE_GUTTER_WIDTH + timelineColumns.length * (view === 'rooms' ? 160 : 110));
  const timelineTemplate = view === 'day'
    ? `${TIMELINE_GUTTER_WIDTH}px minmax(0, 1fr)`
    : `${TIMELINE_GUTTER_WIDTH}px repeat(${timelineColumns.length}, minmax(${view === 'rooms' ? 160 : 110}px, 1fr))`;

  const timeline = (
    <div
      className="custom-scrollbar min-h-[32rem] w-full flex-1 overflow-auto overscroll-x-contain overscroll-y-auto rounded-lg border bg-background/70"
      onWheel={forwardVerticalWheelToPage}
    >
      <div style={{ minWidth: timelineMinWidth }}>
      <div className="sticky top-0 z-30 grid border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85" style={{ gridTemplateColumns: timelineTemplate }}>
        <div className="border-r p-2" />
        {timelineColumns.map((column) => {
          const date = 'date' in column ? column.date : selectedDate;
          const chairId = 'chairId' in column ? column.chairId : undefined;
          const count = view === 'rooms'
            ? (byDate.get(selectedDate) ?? []).filter((row) => row.chairId === chairId).length
            : (byDate.get(date) ?? []).length;
          return (
            <button key={column.id} type="button" onClick={() => onSelectedDateChange(date)} className={cn('border-r px-2 py-2 text-center text-xs last:border-r-0', date === selectedDate && 'bg-primary/10 text-primary')}>
              <span className="block font-semibold">{column.label}</span>
              <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="grid" style={{ gridTemplateColumns: timelineTemplate }}>
        <div>
          {hours.map((hour) => <div key={hour} className="border-b border-r pr-2 pt-2 text-right text-xs font-bold text-foreground/75 tabular-nums sm:text-sm" style={{ height: TIMELINE_HOUR_HEIGHT }}>{formatDentalCalendarHour(hour, locale)}</div>)}
        </div>
        {timelineColumns.map((column) => {
          const date = 'date' in column ? column.date : selectedDate;
          const chairId = 'chairId' in column ? column.chairId : undefined;
          const rows = (byDate.get(date) ?? []).filter((row) => view !== 'rooms' || row.chairId === chairId);
          const placedRows = placeTimelineAppointments(rows, timezone);
          return (
            <div key={column.id} className="relative border-r last:border-r-0" style={{ height: hours.length * TIMELINE_HOUR_HEIGHT }}>
              {hours.map((hour) => (
                <button key={hour} type="button" aria-label={`${date} ${hour}:00`} className="block w-full border-b text-left hover:bg-primary/5" style={{ height: TIMELINE_HOUR_HEIGHT }} onClick={() => onCreate(date, `${String(hour).padStart(2, '0')}:00`, view === 'rooms' ? chairId : undefined)} />
              ))}
              {placedRows.map(({ row, lane, laneCount }) => {
                const parts = localParts(row.scheduledAt, timezone);
                const top = ((parts.hour - scheduleHours.start) * 60 + parts.minute) / 60 * TIMELINE_HOUR_HEIGHT;
                const height = Math.max(MIN_EVENT_HEIGHT, (row.durationMinutes ?? 60) / 60 * TIMELINE_HOUR_HEIGHT - 4);
                const compact = height < 58;
                return <div key={row.id} className="absolute z-10" style={{ top: Math.max(0, top), height, left: `calc(${lane / laneCount * 100}% + 3px)`, width: `calc(${100 / laneCount}% - 6px)` }}>{renderEvent(row, `timeline-${column.id}-${row.id}`, compact, true)}</div>;
              })}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );

  const monthStart = dateAtNoon(range.from).getDay();
  const monthOffset = (monthStart + 6) % 7;
  const monthCells = [...Array.from({ length: monthOffset }, () => null), ...listDateKeys(range)];
  while (monthCells.length % 7) monthCells.push(null);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(dateAtNoon(addDaysToDateKey('2026-09-07', index))),
  );
  const renderMonthOverflow = (date: string, rows: DentalCalendarAppointment[]) => {
    const remainingRows = rows.slice(4);
    if (remainingRows.length === 0) return null;
    return (
      <Popover
        open={monthOverflowDate === date}
        onOpenChange={(open) => setMonthOverflowDate(open ? date : null)}
      >
        <PopoverTrigger asChild>
          <button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.moreAppointmentsForDate"
            type="button"
            className="mt-1 rounded px-1 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('erp.dental.schedule.moreAppointmentsForDate', '{{count}} more appointments for {{date}}', {
              count: remainingRows.length,
              date: formatDate(date, locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
            })}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            +{remainingRows.length}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[min(22rem,calc(100vw-2rem))] p-3"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2">
            <div className="text-sm font-semibold">{t('erp.dental.schedule.moreAppointments', 'More appointments')}</div>
            <div className="text-xs text-muted-foreground">{formatDate(date, locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div className="custom-scrollbar max-h-[min(50vh,22rem)] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {remainingRows.map((row) => renderEvent(row, `month-overflow-${date}-${row.id}`, true))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };
  const monthGrid = (
    <div className="grid h-full min-w-[700px] grid-cols-7 overflow-hidden rounded-lg border bg-background/70">
      {weekdayLabels.map((day) => <div key={day} className="border-b border-r bg-muted/35 p-2 text-center text-xs font-semibold last:border-r-0">{day}</div>)}
      {monthCells.map((date, index) => (
        <div
          key={`${date ?? 'blank'}-${index}`}
          role={date ? 'button' : undefined}
          tabIndex={date ? 0 : undefined}
          onClick={() => date && onSelectedDateChange(date)}
          onDoubleClick={(event) => {
            if (!date) return;
            event.stopPropagation();
            onSelectedDateChange(date);
            onCreate(date);
          }}
          onKeyDown={(event) => {
            if (date && (event.key === 'Enter' || event.key === ' ')) onSelectedDateChange(date);
          }}
          className={cn('min-h-40 border-b border-r p-1.5 text-left align-top hover:bg-primary/5', date === selectedDate && 'bg-primary/10', !date && 'bg-muted/20')}
        >
          {date ? <><span className="mb-1 block text-xs font-medium">{Number(date.slice(-2))}</span><div className="space-y-1">{(byDate.get(date) ?? []).slice(0, 4).map((row) => renderEvent(row, `month-${date}-${row.id}`, true))}</div>{renderMonthOverflow(date, byDate.get(date) ?? [])}</> : null}
        </div>
      ))}
    </div>
  );

  const selectedAppointments = byDate.get(selectedDate) ?? [];
  return (
    <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-stretch">
      <div className="order-2 flex min-h-0 min-w-0 flex-col rounded-xl border bg-card/70 p-3 shadow-sm lg:order-1 lg:h-full">
        <div className="mb-3 flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.previousRange" size="icon" variant="outline" onClick={onPrevious} aria-label={t('erp.dental.schedule.previousRange', 'Previous period')}><ChevronLeft className="h-4 w-4" /></Button>
            <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.nextRange" size="icon" variant="outline" onClick={onNext} aria-label={t('erp.dental.schedule.nextRange', 'Next period')}><ChevronRight className="h-4 w-4" /></Button>
            <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.today" variant="outline" className="ml-auto sm:ml-0" onClick={onToday}>{t('erp.dental.schedule.today', 'Today')}</Button>
          </div>
          <div className="truncate text-center text-sm font-semibold sm:text-base">{rangeLabel}</div>
          <div className="grid w-full grid-cols-2 rounded-lg border bg-muted/30 p-1 sm:grid-cols-4 xl:w-auto">
            {(props.views ?? ['day', 'week', 'month', 'rooms'] as DentalCalendarView[]).map((item) => (
              <Button key={item} size="sm" variant={view === item ? 'default' : 'ghost'} className="h-8 min-w-0 px-2 sm:px-3" onClick={() => onViewChange(item)}><span className="truncate">{t(`erp.dental.schedule.views.${item}`, item)}</span></Button>
            ))}
          </div>
        </div>
        {view === 'month' ? <div className="custom-scrollbar min-h-[32rem] flex-1 overflow-x-auto overscroll-x-contain" onWheel={forwardVerticalWheelToPage}>{monthGrid}</div> : timeline}
      </div>

      <div className="order-1 grid min-h-0 min-w-0 gap-3 lg:order-2">
        <aside className="rounded-xl border bg-card/70 p-3 shadow-sm">
          <Calendar
            mode="single"
            locale={calendarLocale}
            weekStartsOn={1}
            selected={dateAtNoon(selectedDate)}
            {...(props.showAppointmentContext ? {month:dateAtNoon(selectedDate),onMonthChange:(date:Date)=>onSelectedDateChange(dateKeyFromLocalDate(date))} : {})}
            onSelect={(date) => date && onSelectedDateChange(dateKeyFromLocalDate(date))}
            className="mx-auto p-0"
            classNames={{
              day_selected: 'bg-brand-primary text-white hover:bg-brand-primary hover:text-white focus:bg-brand-primary focus:text-white',
            }}
          />
        </aside>
        <aside className="min-w-0 rounded-xl border bg-card/70 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t('erp.dental.schedule.upcoming.title', 'Upcoming Appointments')}</h3><Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.upcoming.viewAll" type="button" variant="ghost" size="sm" className="h-8 px-2 text-primary" onClick={onViewAllUpcoming}>{t('erp.dental.schedule.upcoming.viewAll', 'View all')}<ArrowRight className="h-3.5 w-3.5" /></Button></div>
          <div className="custom-scrollbar max-h-[22rem] space-y-1 overflow-y-auto pr-1">
            {upcomingLoading ? (
              <p className="py-5 text-center text-sm text-muted-foreground">{t('erp.dental.schedule.upcoming.loading', 'Loading upcoming appointments...')}</p>
            ) : upcomingError ? (
              <p className="py-5 text-center text-sm text-destructive">{t('erp.dental.schedule.upcoming.error', 'Unable to load upcoming appointments.')}</p>
            ) : upcomingAppointments.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted-foreground">{t('erp.dental.schedule.upcoming.empty', 'No upcoming appointments.')}</p>
            ) : upcomingAppointments.map((row) => renderDetailsPopover(row, `upcoming-${row.id}`, (
              <button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.details.open" type="button" onClick={(event) => { event.stopPropagation(); openDetailsAfterClick(`upcoming-${row.id}`); }} onDoubleClick={(event) => { event.stopPropagation(); editAfterDoubleClick(row); }} className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-1 py-2 text-left last:border-0 hover:bg-muted/50" aria-label={t('erp.dental.schedule.details.open', 'View appointment details')}>
                <Avatar className="h-8 w-8"><AvatarImage src={row.contactAvatarUrl || undefined} /><AvatarFallback>{row.contactName?.slice(0, 2).toUpperCase() || '#'}</AvatarFallback></Avatar>
                <span className="min-w-0 text-xs"><span className="block font-bold tabular-nums">{formatDate(localParts(row.scheduledAt, timezone).date, locale, { month: 'short', day: 'numeric' })} · {formatDentalCalendarTime(row.scheduledAt, timezone, locale)}</span><span className="block truncate font-medium">{row.contactName || `#${row.id}`}</span><span className="block truncate text-muted-foreground">{row.bookingServiceLabel || row.title}{row.chairName ? ` · ${row.chairName}` : ''}</span></span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getDentalAppointmentColor(row) }} aria-label={statusLabel(row.status)} />
              </button>
            )))}
          </div>
        </aside>
        <aside className="flex min-h-0 min-w-0 flex-col rounded-xl border bg-card/70 p-3 shadow-sm">
        <div className="flex min-h-0 flex-col">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" />{formatDate(selectedDate, locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <div className="custom-scrollbar max-h-[45vh] space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-[48vh]">
            {selectedAppointments.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t('erp.dental.schedule.empty', 'No appointments for this day.')}</p> : selectedAppointments.map((row) => renderDetailsPopover(row, `agenda-${row.id}`, (
              <button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.details.open"
                type="button"
                onClick={(event) => { event.stopPropagation(); openDetailsAfterClick(`agenda-${row.id}`); }}
                onDoubleClick={(event) => { event.stopPropagation(); editAfterDoubleClick(row); }}
                aria-label={t('erp.dental.schedule.details.open', 'View appointment details')}
                title={canEdit ? t('erp.dental.schedule.details.doubleClickHint', 'Double-click the appointment card to edit it directly.') : undefined}
                style={getDentalAppointmentColorStyle(row)}
                className={cn(
                  'grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 overflow-hidden rounded-lg border border-l-4 p-2 text-left text-foreground hover:brightness-95 dark:hover:brightness-110',
                  isMutedDentalAppointment(row) && 'opacity-55 grayscale-[35%]',
                )}
              >
                <Avatar className="h-8 w-8"><AvatarImage src={row.contactAvatarUrl || undefined} /><AvatarFallback>{row.contactName?.slice(0, 2).toUpperCase() || '#'}</AvatarFallback></Avatar>
                <span className="min-w-0 text-xs">
                  <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-sm font-bold tabular-nums">{formatDentalCalendarTime(row.scheduledAt, timezone, locale)}</span>
                    <Badge className={cn('h-fit max-w-full shrink-0 border-0 text-[10px]', statusClass(row.status))}>{statusLabel(row.status)}</Badge>
                  </span>
                  <span className="block truncate font-medium">{row.contactName || `#${row.id}`}</span>
                  <span className="block truncate text-muted-foreground">{row.bookingServiceLabel || row.title}</span>
                </span>
              </button>
            )))}
          </div>
          <Button data-tour="components-erp-dental-dentalschedulecalendar.button.erp.dental.schedule.addForDay" variant="outline" className="mt-3 w-full border-primary text-primary" onClick={() => onCreate(selectedDate)}><Plus className="h-4 w-4" />{t('erp.dental.schedule.addForDay', 'Add appointment for this day')}</Button>
        </div>
        </aside>
      </div>
    </section>
  );
}
