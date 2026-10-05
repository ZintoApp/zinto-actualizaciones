/**
 * Normalize availability slot strings to `YYYY-MM-DDTHH:mm` (24-hour) for comparison with
 * slot-match formatting from conversation booking times.
 *
 * Handles ISO prefixes and plain times; when a slot includes AM/PM (as produced by
 * Google Calendar `getAvailableTimeSlots`), converts to 24-hour clock first.
 */
export function normalizeAvailabilitySlotForMatch(slot: string, date: string): string | null {
  const value = String(slot || '').trim();
  if (!value) return null;

  const isoMinute = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (isoMinute) return `${isoMinute[1]}T${isoMinute[2]}`;

  const twelveHour = value.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (twelveHour) {
    let hour = parseInt(twelveHour[1], 10);
    const minute = twelveHour[2];
    const meridiem = twelveHour[3].toUpperCase();
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    const hh = String(hour).padStart(2, '0');
    return `${date}T${hh}:${minute}`;
  }

  const hourMinute = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hourMinute) {
    const hour = hourMinute[1].padStart(2, '0');
    return `${date}T${hour}:${hourMinute[2]}`;
  }

  return null;
}
