import type { CalendarAdvancedSettings } from './calendar-types';
import {
  createDefaultScheduleFromHours,
  DEFAULT_BUSINESS_HOURS,
} from './calendar-types';

export type AvailabilityReason =
  | 'company_disabled'
  | 'off_duty'
  | 'outside_hours'
  | 'schedule_disabled';

export interface AgentAvailabilityResult {
  available: boolean;
  reason?: AvailabilityReason;
  nextAvailableAt?: string;
  isOnDuty?: boolean;
  isScheduleEnabled?: boolean;
}

export interface InboxAvailabilityDefaultSchedule {
  scheduleMode: 'simple' | 'advanced';
  businessHoursStart: string;
  businessHoursEnd: string;
  advancedSettings?: CalendarAdvancedSettings;
  timezone?: string;
  isScheduleEnabled?: boolean;
}

export interface AgentScheduleConfig {
  scheduleMode: 'simple' | 'advanced';
  businessHoursStart: string;
  businessHoursEnd: string;
  advancedSettings?: CalendarAdvancedSettings | null;
  isScheduleEnabled: boolean;
}

export const DEFAULT_INBOX_AVAILABILITY_SCHEDULE: InboxAvailabilityDefaultSchedule = {
  scheduleMode: 'advanced',
  businessHoursStart: DEFAULT_BUSINESS_HOURS.start,
  businessHoursEnd: DEFAULT_BUSINESS_HOURS.end,
  isScheduleEnabled: true,
  advancedSettings: {
    weeklySchedule: createDefaultScheduleFromHours(
      DEFAULT_BUSINESS_HOURS.start,
      DEFAULT_BUSINESS_HOURS.end
    ),
    offDays: [0, 6],
  },
};
