export type DentalCalendarView = 'day' | 'week' | 'month' | 'rooms';

export type DentalDateRange = { from: string; to: string };

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysToDateKey(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfMondayWeek(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDaysToDateKey(dateKey, -offset);
}

export function getDentalCalendarRange(view: DentalCalendarView, anchorDate: string): DentalDateRange {
  if (view === 'day' || view === 'rooms') return { from: anchorDate, to: anchorDate };
  if (view === 'week') {
    const from = startOfMondayWeek(anchorDate);
    return { from, to: addDaysToDateKey(from, 6) };
  }
  const [year, month] = anchorDate.split('-').map(Number);
  const from = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

export function getPreviousDentalCalendarRange(range: DentalDateRange): DentalDateRange {
  const from = parseDateKey(range.from);
  const to = parseDateKey(range.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return {
    from: addDaysToDateKey(range.from, -days),
    to: addDaysToDateKey(range.from, -1),
  };
}

export function listDateKeys(range: DentalDateRange): string[] {
  const values: string[] = [];
  for (let key = range.from; key <= range.to; key = addDaysToDateKey(key, 1)) values.push(key);
  return values;
}

export function appointmentTrend(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function escapeDentalScheduleCsv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function formatDentalCalendarTime(
  value: string | Date,
  timezone: string,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDentalCalendarHour(hour: number, locale?: string): string {
  const value = new Date(Date.UTC(2020, 0, 1, hour, 0));
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}
