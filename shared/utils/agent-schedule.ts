import {
  isValidAdvancedSettings,
  type CalendarAdvancedSettings,
} from '../types/calendar-types';
import type { AgentScheduleConfig } from '../types/inbox-availability-types';

const TIMEZONE_ALIASES: Record<string, string> = {
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PKT: 'Asia/Karachi',
  IST: 'Asia/Kolkata',
  GMT: 'UTC',
  UTC: 'UTC',
};

export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayIndex: number;
  dateKey: string;
  timeMinutes: number;
}

export function normalizeScheduleTimezone(timezone: string): string {
  const upper = (timezone || 'UTC').toUpperCase();
  return TIMEZONE_ALIASES[upper] || timezone || 'UTC';
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function getZonedDateTimeParts(at: Date, timezone: string): ZonedDateTimeParts {
  const zone = normalizeScheduleTimezone(timezone);
  const safeZone = isValidTimezone(zone) ? zone : 'UTC';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);

  const weekday = parts.find((item) => item.type === 'weekday')?.value ?? 'Sun';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Some Intl implementations format midnight as 24:00 for en-US even when
  // hourCycle is h23. It still belongs to the calendar date returned above,
  // so normalize the hour without advancing the date.
  const parsedHour = get('hour');
  const hour = parsedHour === 24 ? 0 : parsedHour;
  const minute = get('minute');
  const second = get('second');

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayIndex: weekdayMap[weekday] ?? 0,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeMinutes: hour * 60 + minute,
  };
}

export function parseTimeToMinutes(time: string): number {
  const [hourPart, minutePart] = time.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? 0);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

export function getScheduleBoundsForDay(
  config: AgentScheduleConfig,
  dayIndex: number
): { startTime: string; endTime: string } | null {
  const useAdvanced =
    config.scheduleMode === 'advanced' &&
    config.advancedSettings &&
    isValidAdvancedSettings(config.advancedSettings);

  if (useAdvanced && config.advancedSettings) {
    const advanced = config.advancedSettings as CalendarAdvancedSettings;
    if (advanced.offDays.includes(dayIndex)) {
      return null;
    }
    const day = advanced.weeklySchedule[dayIndex];
    if (!day || !day.enabled) {
      return null;
    }
    return { startTime: day.startTime, endTime: day.endTime };
  }

  return {
    startTime: config.businessHoursStart || '09:00',
    endTime: config.businessHoursEnd || '17:00',
  };
}

export function isWithinSchedule(
  config: AgentScheduleConfig,
  at: Date,
  timezone: string
): boolean {
  if (!config.isScheduleEnabled) {
    return true;
  }

  const parts = getZonedDateTimeParts(at, timezone);
  const bounds = getScheduleBoundsForDay(config, parts.dayIndex);
  if (!bounds) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(bounds.startTime);
  const endMinutes = parseTimeToMinutes(bounds.endTime);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return parts.timeMinutes >= startMinutes && parts.timeMinutes < endMinutes;
  }

  // Overnight window (e.g. 22:00–06:00)
  return parts.timeMinutes >= startMinutes || parts.timeMinutes < endMinutes;
}

export function findNextScheduleOpenAt(
  config: AgentScheduleConfig,
  from: Date,
  timezone: string,
  maxDaysToScan = 14
): Date | null {
  if (!config.isScheduleEnabled) {
    return from;
  }

  const zone = normalizeScheduleTimezone(timezone);
  const cursor = new Date(from.getTime());

  for (let dayOffset = 0; dayOffset <= maxDaysToScan; dayOffset += 1) {
    const probe = new Date(cursor.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const parts = getZonedDateTimeParts(probe, zone);
    const bounds = getScheduleBoundsForDay(config, parts.dayIndex);
    if (!bounds) {
      continue;
    }

    const startMinutes = parseTimeToMinutes(bounds.startTime);
    const endMinutes = parseTimeToMinutes(bounds.endTime);
    if (startMinutes >= endMinutes) {
      continue;
    }

    if (dayOffset === 0) {
      if (parts.timeMinutes < startMinutes) {
        return buildZonedDateTime(parts.dateKey, bounds.startTime, zone);
      }
      if (parts.timeMinutes >= startMinutes && parts.timeMinutes < endMinutes) {
        return from;
      }
      continue;
    }

    return buildZonedDateTime(parts.dateKey, bounds.startTime, zone);
  }

  return null;
}

function buildZonedDateTime(dateKey: string, time: string, timezone: string): Date {
  const naive = `${dateKey}T${time}:00`;
  return parseNaiveLocalToUtc(naive, timezone);
}

function parseNaiveLocalToUtc(naiveIsoOrYmdHm: string, zone: string): Date {
  const normalizedTimezone = normalizeScheduleTimezone(zone);
  const normalizedInput = naiveIsoOrYmdHm.includes('T')
    ? naiveIsoOrYmdHm
    : naiveIsoOrYmdHm.replace(' ', 'T');
  const [datePart, timePart = '00:00:00'] = normalizedInput.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map((part) => Number(part));

  const getZonedWallTimeAsUtc = (date: Date): Date => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: normalizedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    return new Date(
      Date.UTC(
        part('year'),
        part('month') - 1,
        part('day'),
        part('hour'),
        part('minute'),
        part('second')
      )
    );
  };

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const localizedDate = getZonedWallTimeAsUtc(utcGuess);
  const intendedLocal = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = intendedLocal.getTime() - localizedDate.getTime();
  const firstResult = new Date(utcGuess.getTime() + offsetMs);
  const verificationOffsetMs =
    intendedLocal.getTime() - getZonedWallTimeAsUtc(firstResult).getTime();
  return verificationOffsetMs === 0
    ? firstResult
    : new Date(firstResult.getTime() + verificationOffsetMs);
}
