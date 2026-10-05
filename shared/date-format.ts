export type DateFormatOptions = { locale?: string; calendarDate?: boolean };

/** ERP timestamp columns represent contractual date-only values at UTC noon. */
export function calendarDateToDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new RangeError('Enter a valid calendar date');
  const date = new Date(`${key}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new RangeError('Enter a valid calendar date');
  return date;
}

/** Contractual calendar dates have no timezone; timestamps keep the caller's
 * browser timezone and the existing date/time presentation. */
export function formatDate(dateString: string, options: DateFormatOptions = {}): string {
  try {
    if (options.calendarDate) {
      const key = dateString.slice(0, 10);
      const date = calendarDateToDate(key);
      return new Intl.DateTimeFormat(options.locale ?? 'en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
    }
    return new Date(dateString).toLocaleDateString(options.locale ?? 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return options.calendarDate ? dateString : 'Invalid date';
  }
}
