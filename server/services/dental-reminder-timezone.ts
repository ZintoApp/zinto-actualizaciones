import { storage } from '../storage';
import { normalizeTimezone, validateTimezone } from '../utils/timezone';
import { DENTAL_TIMEZONE_ERROR, type DentalTimezoneStatus } from '../../shared/types/dental-timezone';

export function parseDentalReminderTimezone(value: unknown): DentalTimezoneStatus {
  if (value == null || (typeof value === 'string' && !value.trim())) return { status: 'missing', timezone: null };
  if (typeof value !== 'string') return { status: 'invalid', timezone: null };
  const timezone = normalizeTimezone(value.trim());
  return validateTimezone(timezone) ? { status: 'valid', timezone } : { status: 'invalid', timezone: null };
}

export class DentalReminderTimezoneError extends Error {
  readonly code = DENTAL_TIMEZONE_ERROR;
  constructor(public readonly status: 'missing' | 'invalid') {
    super('Save a valid company timezone in General Settings before sending dental reminders.');
  }
}

export async function getDentalReminderTimezone(companyId: number): Promise<DentalTimezoneStatus> {
  return parseDentalReminderTimezone((await storage.getCompanySetting(companyId, 'defaultTimezone'))?.value);
}

// Deliberately uncached: every send must validate the current saved company setting.
export async function resolveDentalReminderTimezone(companyId: number): Promise<string> {
  const result = await getDentalReminderTimezone(companyId);
  if (result.status !== 'valid') throw new DentalReminderTimezoneError(result.status);
  return result.timezone;
}
