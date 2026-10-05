import type { ReminderBatchInput } from '../../shared/types/dental-reminder-batches';
import { getZonedDateTimeParts } from '../../shared/utils/agent-schedule';

export function addBatchDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
// Minute-resolution search handles overlaps, gaps, fractional offsets and date-line changes.
// Cache per wall date/zone; neither the host timezone nor a guessed UTC offset is involved.
const days = new Map<string, Map<string, Date>>();
function wallMinutes(date: string, timezone: string): Map<string, Date> {
  const key = `${timezone}:${date}`;
  const cached = days.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const center = Date.parse(`${date}T00:00:00Z`);
  const result = new Map<string, Date>();
  for (let ms = center - 15 * 3600000; ms <= center + 39 * 3600000; ms += 60000) {
    const parts = formatter.formatToParts(ms);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    if (`${part('year')}-${part('month')}-${part('day')}` !== date) continue;
    const time = `${part('hour')}:${part('minute')}`;
    if (!result.has(time)) result.set(time, new Date(ms));
  }
  if (days.size >= 64) days.delete(days.keys().next().value!);
  days.set(key, result);
  return result;
}
export function batchWallTime(date: string, time: string, timezone: string, strict = false): Date {
  const minutes = wallMinutes(date, timezone);
  const exact = minutes.get(time);
  if (exact) return exact;
  if (!strict) {
    const next = [...minutes.keys()].sort().find(key => key > time);
    if (next) return minutes.get(next)!;
    // A completely skipped calendar date has no run; use the following day's first instant.
    return batchWallTime(addBatchDays(date, 1), '00:00', timezone);
  }
  throw new Error('This local send time does not exist in the clinic timezone. Choose another time.');
}
export function nextBatchTime(input: ReminderBatchInput, timezone: string, after: Date): Date {
  if (input.mode === 'once') return batchWallTime(input.sendDate!, input.time, timezone, true);
  let date = getZonedDateTimeParts(after, timezone).dateKey;
  let next = batchWallTime(date, input.time, timezone);
  if (next <= after) next = batchWallTime(addBatchDays(date, 1), input.time, timezone);
  return next;
}
export function batchTargetDate(input: ReminderBatchInput, sendDate: string): string {
  return input.mode === 'once' ? input.appointmentDate! : addBatchDays(sendDate, input.daysAhead);
}
