/**
 * Shared type definitions for Calendar Advanced Settings
 * Used by both client and server for type safety and validation
 */

/**
 * Day of week index (0 = Sunday, 6 = Saturday)
 */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Time window in HH:MM (used for breaks)
 */
export interface TimeWindow {
  startTime: string;
  endTime: string;
}

/**
 * Day schedule configuration for a single day of the week
 */
export interface DaySchedule {
  /** Day name (e.g., "Monday", "Sunday") */
  dayName: string;
  /** Day index (0-6, where 0 = Sunday, 6 = Saturday) */
  dayIndex: number;
  /** Whether this day is enabled for appointments */
  enabled: boolean;
  /** Start time in HH:MM format (e.g., "09:00") */
  startTime: string;
  /** End time in HH:MM format (e.g., "17:00") */
  endTime: string;
  /**
   * Break windows carved out of [startTime, endTime].
   * Optional for backwards compatibility; treat missing as [].
   */
  breaks?: TimeWindow[];
}

/**
 * Advanced calendar settings with day-specific working hours
 */
export interface CalendarAdvancedSettings {
  /** Array of 7 day configurations (Sun-Sat) */
  weeklySchedule: DaySchedule[];
  /** Array of day indices (0-6) that are marked as off-days */
  offDays: number[];
  /** Google incremental reconciliation sync tokens keyed by Google calendar ID */
  googleSyncTokens?: Record<string, string>;
  /** Legacy primary-calendar sync token kept for backwards-compatible reads */
  googleSyncToken?: string;
}

export const DEFAULT_MAX_OFFERED_SLOTS = 5;
export const MIN_OFFERED_SLOTS_LIMIT = 1;
export const MAX_OFFERED_SLOTS_LIMIT = 10;

export const DEFAULT_REMINDER_LEAD_HOURS = 10;
export const DEFAULT_CLAMP_FLOOR_MINUTES = 30;

export const DEFAULT_REMINDER_MESSAGE_TEMPLATE =
  'Reminder: you have an appointment on {{date}} at {{time}} ({{timezone}}).';

export type ShortNoticePolicy = 'skip' | 'immediate' | 'clamp';

/** How many free slots the agent may offer in one message */
export interface CalendarOfferingSettings {
  maxOfferedSlots: number;
}

export interface CalendarReminderSettings {
  enabled: boolean;
  leadTimeHours: number;
  shortNoticePolicy: ShortNoticePolicy;
  /** Used when shortNoticePolicy is clamp */
  clampFloorMinutes?: number;
  /** Empty/null = same channel as booking conversation */
  channelOverride?: string | null;
  messageTemplate: string;
}

export function createDefaultOfferingSettings(): CalendarOfferingSettings {
  return { maxOfferedSlots: DEFAULT_MAX_OFFERED_SLOTS };
}

export function createDefaultReminderSettings(): CalendarReminderSettings {
  return {
    enabled: true,
    leadTimeHours: DEFAULT_REMINDER_LEAD_HOURS,
    shortNoticePolicy: 'skip',
    clampFloorMinutes: DEFAULT_CLAMP_FLOOR_MINUTES,
    channelOverride: null,
    messageTemplate: DEFAULT_REMINDER_MESSAGE_TEMPLATE,
  };
}

/**
 * Calendar settings supporting both simple and advanced modes
 */
export interface CalendarSettings {
  /** Mode: 'simple' uses global hours, 'advanced' uses day-specific hours */
  mode: 'simple' | 'advanced';
  /** Simple business hours (used when mode is 'simple' or as fallback) */
  businessHours?: {
    start: string;
    end: string;
  };
  /** Advanced settings (used when mode is 'advanced') */
  advancedSettings?: CalendarAdvancedSettings;
}

/**
 * Array of day names in order (Sunday to Saturday)
 */
export const DAY_NAMES: string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Default weekly schedule: Mon-Fri 9-5, weekends off
 */
export const DEFAULT_WEEKLY_SCHEDULE: DaySchedule[] = [
  { dayName: 'Sunday', dayIndex: 0, enabled: false, startTime: '09:00', endTime: '17:00', breaks: [] },
  { dayName: 'Monday', dayIndex: 1, enabled: true, startTime: '09:00', endTime: '17:00', breaks: [] },
  { dayName: 'Tuesday', dayIndex: 2, enabled: true, startTime: '09:00', endTime: '17:00', breaks: [] },
  { dayName: 'Wednesday', dayIndex: 3, enabled: true, startTime: '09:00', endTime: '17:00', breaks: [] },
  { dayName: 'Thursday', dayIndex: 4, enabled: true, startTime: '09:00', endTime: '17:00', breaks: [] },
  { dayName: 'Friday', dayIndex: 5, enabled: true, startTime: '09:00', endTime: '17:00', breaks: [] },
  { dayName: 'Saturday', dayIndex: 6, enabled: false, startTime: '09:00', endTime: '17:00', breaks: [] },
];

/**
 * Default simple business hours
 */
export const DEFAULT_BUSINESS_HOURS = {
  start: '09:00',
  end: '17:00'
};

/**
 * Validates if a time string is in HH:MM format
 * @param time Time string to validate
 * @returns true if valid, false otherwise
 */
export function isValidTimeFormat(time: string): boolean {
  if (!time || typeof time !== 'string') return false;
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Validates if a day index is between 0 and 6
 * @param index Day index to validate
 * @returns true if valid, false otherwise
 */
export function isValidDayIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= 6;
}

function isValidBreaksArray(breaks: unknown): boolean {
  if (breaks === undefined || breaks === null) return true;
  if (!Array.isArray(breaks)) return false;
  for (const brk of breaks) {
    if (!brk || typeof brk !== 'object') return false;
    const startTime = (brk as TimeWindow).startTime;
    const endTime = (brk as TimeWindow).endTime;
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) return false;
  }
  return true;
}

/**
 * Validates if a CalendarAdvancedSettings object has the correct structure
 * @param settings Advanced settings object to validate
 * @returns true if valid, false otherwise
 */
export function isValidAdvancedSettings(settings: any): boolean {
  if (!settings || typeof settings !== 'object') return false;
  
  if (!Array.isArray(settings.weeklySchedule) || settings.weeklySchedule.length !== 7) {
    return false;
  }
  
  if (!Array.isArray(settings.offDays)) {
    return false;
  }
  
  // Validate each day schedule
  for (let i = 0; i < settings.weeklySchedule.length; i++) {
    const day = settings.weeklySchedule[i];
    if (!day || typeof day !== 'object') return false;
    if (typeof day.dayName !== 'string') return false;
    if (!isValidDayIndex(day.dayIndex)) return false;
    if (typeof day.enabled !== 'boolean') return false;
    if (!isValidTimeFormat(day.startTime)) return false;
    if (!isValidTimeFormat(day.endTime)) return false;
    
    // Validate day index matches position
    if (day.dayIndex !== i) return false;

    if (!isValidBreaksArray(day.breaks)) {
      return false;
    }
    // Overlap / outside-hours breaks are sanitized at slot-generation time
    // via getActiveBreaksForDay — do not invalidate the whole advanced schedule.
  }
  
  // Validate offDays array contains only valid indices
  for (const offDay of settings.offDays) {
    if (!isValidDayIndex(offDay)) return false;
  }
  
  return true;
}

/**
 * Gets day name from day index
 * @param index Day index (0-6)
 * @returns Day name string
 */
export function getDayName(index: number): string {
  if (!isValidDayIndex(index)) {
    throw new Error(`Invalid day index: ${index}. Must be between 0 and 6.`);
  }
  return DAY_NAMES[index];
}

/**
 * Creates a default weekly schedule from simple business hours
 * @param startTime Start time in HH:MM format
 * @param endTime End time in HH:MM format
 * @returns Default schedule with Mon-Fri enabled, weekends disabled
 */
export function createDefaultScheduleFromHours(startTime: string, endTime: string): DaySchedule[] {
  return DAY_NAMES.map((dayName, index) => ({
    dayName,
    dayIndex: index,
    enabled: index >= 1 && index <= 5, // Mon-Fri
    startTime,
    endTime,
    breaks: [],
  }));
}
