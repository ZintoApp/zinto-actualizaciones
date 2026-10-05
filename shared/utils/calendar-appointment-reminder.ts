/**
 * Pure helpers for appointment reminder sendAt computation and short-notice policy.
 */

import {
  DEFAULT_CLAMP_FLOOR_MINUTES,
  DEFAULT_REMINDER_LEAD_HOURS,
  DEFAULT_REMINDER_MESSAGE_TEMPLATE,
  type CalendarReminderSettings,
  type ShortNoticePolicy,
} from '../types/calendar-types';

export function clampLeadTimeHours(hours: unknown): number {
  const num = typeof hours === 'number' ? hours : Number(hours);
  if (!Number.isFinite(num) || num < 1) return DEFAULT_REMINDER_LEAD_HOURS;
  return Math.floor(num);
}

export function clampFloorMinutes(minutes: unknown): number {
  const num = typeof minutes === 'number' ? minutes : Number(minutes);
  if (!Number.isFinite(num) || num < 1) return DEFAULT_CLAMP_FLOOR_MINUTES;
  return Math.floor(num);
}

export type ReminderScheduleOutcome =
  | { action: 'skip'; reason: 'disabled' | 'short_notice_skip' | 'past_start' | 'clamp_not_possible' }
  | { action: 'schedule'; sendAt: Date; mode: 'normal' | 'immediate' | 'clamp' };

/**
 * Compute when (and whether) to send an appointment reminder.
 * `now` and `appointmentStart` are absolute instants.
 */
export function computeReminderSendAt(params: {
  appointmentStart: Date;
  now?: Date;
  enabled: boolean;
  leadTimeHours: number;
  shortNoticePolicy: ShortNoticePolicy;
  clampFloorMinutes?: number;
}): ReminderScheduleOutcome {
  const now = params.now ?? new Date();
  if (!params.enabled) {
    return { action: 'skip', reason: 'disabled' };
  }

  const startMs = params.appointmentStart.getTime();
  if (!Number.isFinite(startMs) || startMs <= now.getTime()) {
    return { action: 'skip', reason: 'past_start' };
  }

  const leadHours = clampLeadTimeHours(params.leadTimeHours);
  const idealSendAt = new Date(startMs - leadHours * 60 * 60 * 1000);

  if (idealSendAt.getTime() >= now.getTime()) {
    return { action: 'schedule', sendAt: idealSendAt, mode: 'normal' };
  }

  // Short notice: ideal sendAt already passed
  switch (params.shortNoticePolicy) {
    case 'immediate':
      return { action: 'schedule', sendAt: new Date(now.getTime()), mode: 'immediate' };
    case 'clamp': {
      const floorMin = clampFloorMinutes(params.clampFloorMinutes);
      const floorAt = new Date(startMs - floorMin * 60 * 1000);
      // Spec: max(now, appointmentStart − clampFloorMinutes) if still before start
      const sendAt = new Date(Math.max(now.getTime(), floorAt.getTime()));
      if (sendAt.getTime() < startMs) {
        return { action: 'schedule', sendAt, mode: 'clamp' };
      }
      return { action: 'skip', reason: 'clamp_not_possible' };
    }
    case 'skip':
    default:
      return { action: 'skip', reason: 'short_notice_skip' };
  }
}

export function renderReminderTemplate(
  template: string,
  vars: { date: string; time: string; timezone: string; title?: string }
): string {
  const base = template?.trim() ? template : DEFAULT_REMINDER_MESSAGE_TEMPLATE;
  return base
    .replace(/\{\{\s*date\s*\}\}/gi, vars.date)
    .replace(/\{\{\s*time\s*\}\}/gi, vars.time)
    .replace(/\{\{\s*timezone\s*\}\}/gi, vars.timezone)
    .replace(/\{\{\s*title\s*\}\}/gi, vars.title ?? '');
}

export function normalizeReminderSettings(
  partial?: Partial<CalendarReminderSettings> | null
): CalendarReminderSettings {
  const policy = partial?.shortNoticePolicy;
  const shortNoticePolicy: ShortNoticePolicy =
    policy === 'immediate' || policy === 'clamp' || policy === 'skip' ? policy : 'skip';

  return {
    enabled: partial?.enabled !== false,
    leadTimeHours: clampLeadTimeHours(partial?.leadTimeHours ?? DEFAULT_REMINDER_LEAD_HOURS),
    shortNoticePolicy,
    clampFloorMinutes: clampFloorMinutes(
      partial?.clampFloorMinutes ?? DEFAULT_CLAMP_FLOOR_MINUTES
    ),
    channelOverride: partial?.channelOverride?.trim() ? partial.channelOverride.trim() : null,
    messageTemplate:
      partial?.messageTemplate?.trim() || DEFAULT_REMINDER_MESSAGE_TEMPLATE,
  };
}
