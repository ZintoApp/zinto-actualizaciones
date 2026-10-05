/**
 * Pure helpers for calendar break windows (exclusion intervals inside daily work hours).
 */

import {
  isValidTimeFormat,
  type DaySchedule,
  type TimeWindow,
} from '../types/calendar-types';

export function parseTimeToMinutes(time: string): number | null {
  if (!isValidTimeFormat(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  const aStart = parseTimeToMinutes(a.startTime);
  const aEnd = parseTimeToMinutes(a.endTime);
  const bStart = parseTimeToMinutes(b.startTime);
  const bEnd = parseTimeToMinutes(b.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && aEnd > bStart;
}

export function isBreakFullyInsideWorkHours(
  work: { startTime: string; endTime: string },
  brk: TimeWindow
): boolean {
  const wStart = parseTimeToMinutes(work.startTime);
  const wEnd = parseTimeToMinutes(work.endTime);
  const bStart = parseTimeToMinutes(brk.startTime);
  const bEnd = parseTimeToMinutes(brk.endTime);
  if (wStart === null || wEnd === null || bStart === null || bEnd === null) return false;
  return bStart >= wStart && bEnd <= wEnd && bStart < bEnd;
}

export type BreakValidationError =
  | 'invalid_format'
  | 'start_not_before_end'
  | 'outside_work_hours'
  | 'overlaps';

/**
 * Validate a day's breaks against work hours. Empty list is valid.
 */
export function validateDayBreaks(
  work: { startTime: string; endTime: string },
  breaks: TimeWindow[] | undefined | null
): { ok: true } | { ok: false; error: BreakValidationError; index?: number } {
  const list = breaks ?? [];
  for (let i = 0; i < list.length; i++) {
    const brk = list[i];
    if (!isValidTimeFormat(brk.startTime) || !isValidTimeFormat(brk.endTime)) {
      return { ok: false, error: 'invalid_format', index: i };
    }
    const start = parseTimeToMinutes(brk.startTime)!;
    const end = parseTimeToMinutes(brk.endTime)!;
    if (end <= start) {
      return { ok: false, error: 'start_not_before_end', index: i };
    }
    if (!isBreakFullyInsideWorkHours(work, brk)) {
      return { ok: false, error: 'outside_work_hours', index: i };
    }
    for (let j = 0; j < i; j++) {
      if (windowsOverlap(list[j], brk)) {
        return { ok: false, error: 'overlaps', index: i };
      }
    }
  }
  return { ok: true };
}

export function getActiveBreaksForDay(day: DaySchedule | undefined | null): TimeWindow[] {
  if (!day || !day.enabled) return [];
  const breaks = day.breaks ?? [];
  return breaks.filter(
    (brk) =>
      isValidTimeFormat(brk.startTime) &&
      isValidTimeFormat(brk.endTime) &&
      isBreakFullyInsideWorkHours(day, brk)
  );
}

/**
 * True if [slotStartMinutes, slotEndMinutes) intersects any break window (minutes from midnight).
 */
export function slotIntersectsAnyBreak(
  slotStartMinutes: number,
  slotEndMinutes: number,
  breaks: TimeWindow[]
): boolean {
  for (const brk of breaks) {
    const bStart = parseTimeToMinutes(brk.startTime);
    const bEnd = parseTimeToMinutes(brk.endTime);
    if (bStart === null || bEnd === null) continue;
    if (slotStartMinutes < bEnd && slotEndMinutes > bStart) {
      return true;
    }
  }
  return false;
}
