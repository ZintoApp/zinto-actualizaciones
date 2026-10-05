import type { AgentInboxAvailabilitySettings } from '@shared/schema';
import {
  DEFAULT_INBOX_AVAILABILITY_SCHEDULE,
  type AgentAvailabilityResult,
  type AgentScheduleConfig,
  type InboxAvailabilityDefaultSchedule,
} from '@shared/types/inbox-availability-types';
import {
  findNextScheduleOpenAt,
  isWithinSchedule,
  normalizeScheduleTimezone,
} from '@shared/utils/agent-schedule';

export function coerceDefaultSchedule(raw: unknown): InboxAvailabilityDefaultSchedule {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_INBOX_AVAILABILITY_SCHEDULE;
  }

  const value = raw as Partial<InboxAvailabilityDefaultSchedule>;
  return {
    scheduleMode: value.scheduleMode === 'simple' ? 'simple' : 'advanced',
    businessHoursStart: value.businessHoursStart || DEFAULT_INBOX_AVAILABILITY_SCHEDULE.businessHoursStart,
    businessHoursEnd: value.businessHoursEnd || DEFAULT_INBOX_AVAILABILITY_SCHEDULE.businessHoursEnd,
    isScheduleEnabled: value.isScheduleEnabled !== false,
    timezone: value.timezone || 'UTC',
    advancedSettings: value.advancedSettings || DEFAULT_INBOX_AVAILABILITY_SCHEDULE.advancedSettings,
  };
}

export function buildScheduleConfigFromAgentSettings(
  settings: AgentInboxAvailabilitySettings | null,
  defaultSchedule: InboxAvailabilityDefaultSchedule
): { scheduleConfig: AgentScheduleConfig; timezone: string; isOnDuty: boolean } {
  if (!settings) {
    return {
      isOnDuty: true,
      timezone: normalizeScheduleTimezone(defaultSchedule.timezone || 'UTC'),
      scheduleConfig: {
        scheduleMode: defaultSchedule.scheduleMode,
        businessHoursStart: defaultSchedule.businessHoursStart,
        businessHoursEnd: defaultSchedule.businessHoursEnd,
        advancedSettings: defaultSchedule.advancedSettings,
        isScheduleEnabled: defaultSchedule.isScheduleEnabled !== false,
      },
    };
  }

  return {
    isOnDuty: settings.isOnDuty !== false,
    timezone: normalizeScheduleTimezone(settings.timezone || defaultSchedule.timezone || 'UTC'),
    scheduleConfig: {
      scheduleMode: settings.scheduleMode === 'advanced' ? 'advanced' : 'simple',
      businessHoursStart: settings.businessHoursStart || defaultSchedule.businessHoursStart,
      businessHoursEnd: settings.businessHoursEnd || defaultSchedule.businessHoursEnd,
      advancedSettings: settings.advancedSettings ?? defaultSchedule.advancedSettings,
      isScheduleEnabled: settings.isScheduleEnabled !== false,
    },
  };
}

export function evaluateAgentAvailabilityFromConfig(
  companyEnabled: boolean,
  agentSettings: AgentInboxAvailabilitySettings | null,
  defaultSchedule: InboxAvailabilityDefaultSchedule,
  at: Date = new Date()
): AgentAvailabilityResult {
  if (!companyEnabled) {
    return { available: true, reason: 'company_disabled', isOnDuty: true, isScheduleEnabled: false };
  }

  const { scheduleConfig, timezone, isOnDuty } = buildScheduleConfigFromAgentSettings(
    agentSettings,
    defaultSchedule
  );

  if (!isOnDuty) {
    const nextOpen = scheduleConfig.isScheduleEnabled
      ? findNextScheduleOpenAt(scheduleConfig, at, timezone)
      : null;
    return {
      available: false,
      reason: 'off_duty',
      isOnDuty: false,
      isScheduleEnabled: scheduleConfig.isScheduleEnabled,
      nextAvailableAt: nextOpen?.toISOString(),
    };
  }

  if (!scheduleConfig.isScheduleEnabled) {
    return {
      available: true,
      reason: 'schedule_disabled',
      isOnDuty: true,
      isScheduleEnabled: false,
    };
  }

  const withinSchedule = isWithinSchedule(scheduleConfig, at, timezone);
  if (!withinSchedule) {
    const nextOpen = findNextScheduleOpenAt(scheduleConfig, at, timezone);
    return {
      available: false,
      reason: 'outside_hours',
      isOnDuty: true,
      isScheduleEnabled: true,
      nextAvailableAt: nextOpen?.toISOString(),
    };
  }

  return {
    available: true,
    isOnDuty: true,
    isScheduleEnabled: true,
  };
}

export function pickNextRoundRobinAgent<T extends { id: number }>(
  agents: T[],
  lastUserId: number | null | undefined
): T {
  const lastIndex = lastUserId != null ? agents.findIndex((agent) => agent.id === lastUserId) : -1;
  const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % agents.length : 0;
  return agents[nextIndex];
}

export function resolveHandoffAssignmentPool<T extends { id: number }>(
  fullPool: T[],
  availablePool: T[]
): T[] {
  return availablePool.length > 0 ? availablePool : fullPool;
}
