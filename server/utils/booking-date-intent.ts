import { normalizeTimezone, validateTimezone } from './timezone';

export type BookingWeekdayOccurrence = 'this_or_next' | 'next';

export type BookingDateIntent =
  | { kind: 'absolute'; date: string }
  | { kind: 'relative_days'; days: number }
  | { kind: 'weekday'; weekday: number; occurrence?: BookingWeekdayOccurrence };

export type BookingExecutionClock = {
  instantUtc: string;
  companyTimezone: string;
  localDate: string;
  localTime: string;
  localWeekday: number;
  localWeekdayName: string;
  today: string;
  tomorrow: string;
  dayAfterTomorrow: string;
};

export type ResolvedAssistantTimezone = {
  timezone: string;
  source: 'assistant' | 'company' | 'utc_fallback';
  invalidAssistantTimezone?: string;
  invalidCompanyTimezone?: string;
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const LEGACY_MIDNIGHT_RE = /^24:00(?::00)?$/;

function normalizeLegacyMidnightTime(value: string): string {
  if (!LEGACY_MIDNIGHT_RE.test(value)) return value;
  return value.length === 8 ? '00:00:00' : '00:00';
}

function normalizeLegacyMidnightDateTime(value: string): string {
  return value.replace(
    /^(\d{4}-\d{2}-\d{2}T)24:00(:00)?((?:\.0+)?(?:Z|[+-]\d{2}:\d{2})?)$/,
    (_match, prefix, seconds, suffix) =>
      `${prefix}${seconds ? '00:00:00' : '00:00'}${suffix}`,
  );
}

export function resolveAssistantTimezone(
  assistantTimezone: unknown,
  companyTimezone: unknown,
): ResolvedAssistantTimezone {
  const assistant = typeof assistantTimezone === 'string' ? assistantTimezone.trim() : '';
  if (assistant) {
    const normalized = normalizeTimezone(assistant);
    if (validateTimezone(normalized)) return { timezone: normalized, source: 'assistant' };
  }
  const company = typeof companyTimezone === 'string' ? companyTimezone.trim() : '';
  if (company) {
    const normalized = normalizeTimezone(company);
    if (validateTimezone(normalized)) {
      return {
        timezone: normalized,
        source: 'company',
        ...(assistant ? { invalidAssistantTimezone: assistant } : {}),
      };
    }
  }
  return {
    timezone: 'UTC',
    source: 'utc_fallback',
    ...(assistant ? { invalidAssistantTimezone: assistant } : {}),
    ...(company ? { invalidCompanyTimezone: company } : {}),
  };
}

function zonedParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    weekday: 'long',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  return {
    year,
    month,
    day,
    hour: Number(get('hour')) === 24 ? 0 : Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekdayName: get('weekday'),
  };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateKey(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

function weekdayForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function createBookingExecutionClock(
  instant: Date = new Date(),
  requestedTimezone: string = 'UTC',
): BookingExecutionClock {
  const normalized = normalizeTimezone(requestedTimezone || 'UTC');
  const companyTimezone = validateTimezone(normalized) ? normalized : 'UTC';
  const parts = zonedParts(instant, companyTimezone);
  const today = formatDateKey(parts.year, parts.month, parts.day);
  return {
    instantUtc: instant.toISOString(),
    companyTimezone,
    localDate: today,
    localTime: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`,
    localWeekday: weekdayForDateKey(today),
    localWeekdayName: parts.weekdayName,
    today,
    tomorrow: addCalendarDays(today, 1),
    dayAfterTomorrow: addCalendarDays(today, 2),
  };
}

function validateDateKey(value: string): string {
  if (!DATE_KEY_RE.test(value)) throw new Error('Date must use YYYY-MM-DD format.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('Date is not a valid calendar date.');
  }
  return value;
}

export function resolveBookingDateIntent(
  intent: BookingDateIntent,
  clock: BookingExecutionClock,
): string {
  if (!intent || typeof intent !== 'object') throw new Error('A valid booking date is required.');
  if (intent.kind === 'absolute') return validateDateKey(String(intent.date || '').trim());
  if (intent.kind === 'relative_days') {
    if (!Number.isInteger(intent.days) || Math.abs(intent.days) > 3650) {
      throw new Error('Relative day offset must be a whole number within 3650 days.');
    }
    return addCalendarDays(clock.localDate, intent.days);
  }
  if (intent.kind === 'weekday') {
    if (!Number.isInteger(intent.weekday) || intent.weekday < 0 || intent.weekday > 6) {
      throw new Error('Weekday must be an integer from 0 (Sunday) through 6 (Saturday).');
    }
    const occurrence = intent.occurrence ?? 'this_or_next';
    if (occurrence !== 'this_or_next' && occurrence !== 'next') {
      throw new Error('Weekday occurrence must be this_or_next or next.');
    }
    let delta = (intent.weekday - clock.localWeekday + 7) % 7;
    if (occurrence === 'next' && delta === 0) delta = 7;
    return addCalendarDays(clock.localDate, delta);
  }
  throw new Error('Unsupported booking date intent.');
}

function parseIntent(value: unknown): BookingDateIntent | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'absolute') return { kind: 'absolute', date: String(raw.date ?? '') };
  if (raw.kind === 'relative_days') return { kind: 'relative_days', days: Number(raw.days) };
  if (raw.kind === 'weekday') {
    return {
      kind: 'weekday',
      weekday: Number(raw.weekday),
      occurrence: raw.occurrence as BookingWeekdayOccurrence | undefined,
    };
  }
  return undefined;
}

function resolveField(
  output: Record<string, unknown>,
  dateField: string,
  intentField: string,
  clock: BookingExecutionClock,
): string | undefined {
  const absolute = typeof output[dateField] === 'string' && output[dateField]
    ? validateDateKey(String(output[dateField]).trim())
    : undefined;
  const intent = parseIntent(output[intentField]);
  const resolved = intent ? resolveBookingDateIntent(intent, clock) : undefined;
  if (absolute && resolved && absolute !== resolved) {
    throw new Error('The supplied absolute and relative booking dates do not match. Please clarify the intended date.');
  }
  const date = resolved ?? absolute;
  if (date) output[dateField] = date;
  return date;
}

/** Normalize the language-neutral date intent emitted by the model before a booking tool runs. */
export function normalizeBookingToolArguments(
  args: Record<string, unknown> | undefined,
  clock: BookingExecutionClock,
): Record<string, unknown> {
  const output = { ...(args ?? {}) };
  const date = resolveField(output, 'date', 'date_intent', clock);
  resolveField(output, 'start_date', 'start_date_intent', clock);
  resolveField(output, 'end_date', 'end_date_intent', clock);

  for (const field of ['local_time', 'time', 'start_time', 'startTime']) {
    if (typeof output[field] === 'string') {
      output[field] = normalizeLegacyMidnightTime(output[field].trim());
    }
  }
  for (const field of ['start_datetime', 'scheduled_at']) {
    if (typeof output[field] === 'string') {
      output[field] = normalizeLegacyMidnightDateTime(output[field].trim());
    }
  }

  const localTime = typeof output.local_time === 'string' ? output.local_time : '';
  if (localTime && !LOCAL_TIME_RE.test(localTime)) {
    throw new Error('Local appointment time must use HH:MM or HH:MM:SS format.');
  }
  if (localTime) {
    if (!output.time) output.time = localTime.slice(0, 5);
    if (!output.start_time) output.start_time = localTime;
  }

  for (const field of ['start_datetime', 'scheduled_at']) {
    const current = typeof output[field] === 'string' ? output[field].trim() : '';
    if (date && current && /^\d{4}-\d{2}-\d{2}T/.test(current)) {
      const suppliedDate = current.slice(0, 10);
      if (suppliedDate !== date) {
        throw new Error('The appointment date and date intent do not match. Please clarify the intended date.');
      }
    } else if (date && current && LOCAL_TIME_RE.test(current)) {
      output[field] = `${date}T${current.length === 5 ? `${current}:00` : current}`;
    } else if (date && !current && localTime) {
      output[field] = `${date}T${localTime.length === 5 ? `${localTime}:00` : localTime}`;
    }
  }
  return output;
}

export function buildBookingClockPrompt(
  clock: BookingExecutionClock,
  includeBookingGuidance: boolean = true,
): string {
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const upcomingWeekdays = weekdayNames.map((name, weekday) => {
    let days = (weekday - clock.localWeekday + 7) % 7;
    if (days === 0) days = 7;
    return `- Upcoming ${name} (strictly after today): ${addCalendarDays(clock.localDate, days)}`;
  });
  const lines = [
    'AUTHORITATIVE CURRENT DATE AND TIME (server supplied):',
    `- UTC instant: ${clock.instantUtc}`,
    `- Company timezone: ${clock.companyTimezone}`,
    `- Company local date: ${clock.localDate}`,
    `- Company local time: ${clock.localTime}`,
    `- Company local weekday: ${clock.localWeekdayName}`,
    `- Relative calendar-day offset 0 = ${clock.today}`,
    `- Relative calendar-day offset 1 = ${clock.tomorrow}`,
    `- Relative calendar-day offset 2 = ${clock.dayAfterTomorrow}`,
    '- Weekday intent numbers: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.',
    ...upcomingWeekdays,
  ];
  if (includeBookingGuidance) {
    lines.push(
      '- Interpret the patient\'s date wording in any language, but send booking tools language-neutral date_intent data.',
      '- Prefer date_intent for relative dates. The server, not the model, performs relative calendar arithmetic.',
      '- A weekday by itself, “upcoming/coming [weekday],” or “next [weekday]” (and natural equivalents in any language) is actionable, not ambiguous. Use kind=weekday with occurrence=next and continue the booking flow. Never ask the patient to provide or calculate its calendar date.',
      '- “This [weekday]” uses kind=weekday with occurrence=this_or_next. If today has that weekday, it may mean today; otherwise it means the nearest occurrence.',
      '- A requested date does not require a requested time. Once the visit type and weekday/date are known, call availability and offer real slots instead of asking for an exact date.',
      '- Reuse date intent already stated anywhere in the current conversation. Do not ask for the same date again after collecting the service, identity, or other booking details.',
      '- If wording is genuinely ambiguous, ask one short natural clarification question instead of guessing.',
    );
  }
  return lines.join('\n');
}

export function formatInstantInBookingTimezone(instant: Date, timezone: string): string {
  const parts = zonedParts(instant, timezone);
  return `${formatDateKey(parts.year, parts.month, parts.day)}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}

export const BOOKING_DATE_INTENT_JSON_SCHEMA = {
  type: 'object',
  description: 'Language-neutral date intent resolved by the server in the assistant timezone. Ordinary weekday phrases such as Tuesday, upcoming Tuesday, or next Tuesday are sufficient and must not trigger a request for a calendar date.',
  properties: {
    kind: { type: 'string', enum: ['absolute', 'relative_days', 'weekday'] },
    date: { type: 'string', description: 'YYYY-MM-DD; only for kind=absolute.' },
    days: { type: 'integer', description: 'Calendar-day offset from company-local today; only for kind=relative_days.' },
    weekday: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sunday through 6=Saturday; only for kind=weekday.' },
    occurrence: { type: 'string', enum: ['this_or_next', 'next'], description: 'Only for kind=weekday. Use next for a bare/upcoming/coming/next weekday (nearest occurrence strictly after today). Use this_or_next only for “this weekday,” where today is allowed.' },
  },
  required: ['kind'],
} as const;
