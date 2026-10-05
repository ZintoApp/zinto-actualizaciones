import { storage } from '../storage';
import type { AgentInboxAvailabilitySettings } from '@shared/schema';
import {
  type AgentAvailabilityResult,
  type InboxAvailabilityDefaultSchedule,
} from '@shared/types/inbox-availability-types';
import { normalizeScheduleTimezone } from '@shared/utils/agent-schedule';
import {
  coerceDefaultSchedule,
  evaluateAgentAvailabilityFromConfig,
  pickNextRoundRobinAgent,
  resolveHandoffAssignmentPool,
} from '@shared/utils/agent-availability-logic';

const INBOX_AVAILABILITY_ENABLED_KEY = 'inbox_availability_enabled';
const INBOX_AVAILABILITY_DEFAULT_SCHEDULE_KEY = 'inbox_availability_default_schedule';

export interface AgentWithAvailability {
  id: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  username: string;
  isAvailable: boolean;
  availabilityReason?: AgentAvailabilityResult['reason'];
  isOnDuty: boolean;
  isScheduleEnabled: boolean;
  timezone: string;
}

function coerceDefaultScheduleFromStorage(raw: unknown): InboxAvailabilityDefaultSchedule {
  return coerceDefaultSchedule(raw);
}

export async function isInboxAvailabilityEnabled(companyId: number): Promise<boolean> {
  const setting = await storage.getCompanySetting(companyId, INBOX_AVAILABILITY_ENABLED_KEY);
  return setting?.value === true;
}

export async function getCompanyDefaultInboxSchedule(
  companyId: number
): Promise<InboxAvailabilityDefaultSchedule> {
  const companyTimezoneSetting = await storage.getCompanySetting(companyId, 'defaultTimezone');
  const companyTimezone =
    typeof companyTimezoneSetting?.value === 'string' && companyTimezoneSetting.value.trim()
      ? companyTimezoneSetting.value.trim()
      : 'UTC';

  const setting = await storage.getCompanySetting(companyId, INBOX_AVAILABILITY_DEFAULT_SCHEDULE_KEY);
  const schedule = coerceDefaultScheduleFromStorage(setting?.value);
  return {
    ...schedule,
    timezone: schedule.timezone || companyTimezone,
  };
}

export async function evaluateAgentAvailability(
  companyId: number,
  userId: number,
  at: Date = new Date(),
  options?: {
    agentSettings?: AgentInboxAvailabilitySettings | null;
    companyEnabled?: boolean;
    defaultSchedule?: InboxAvailabilityDefaultSchedule;
  }
): Promise<AgentAvailabilityResult> {
  const companyEnabled =
    options?.companyEnabled ?? (await isInboxAvailabilityEnabled(companyId));

  const defaultSchedule =
    options?.defaultSchedule ?? (await getCompanyDefaultInboxSchedule(companyId));
  const agentSettings =
    options?.agentSettings !== undefined
      ? options.agentSettings
      : await storage.getAgentInboxAvailabilitySettings(userId, companyId);

  return evaluateAgentAvailabilityFromConfig(companyEnabled, agentSettings, defaultSchedule, at);
}

export async function getAgentsWithAvailability(
  companyId: number,
  agentIds?: number[]
): Promise<AgentWithAvailability[]> {
  const userSummaries = await storage.getCompanyUserSummaries(companyId);
  let agents = userSummaries.filter(
    (agent) => (agent.role === 'agent' || agent.role === 'admin') && !agent.isSuperAdmin
  );

  if (agentIds != null && agentIds.length > 0) {
    const allowed = new Set(agentIds);
    agents = agents.filter((agent) => allowed.has(agent.id));
  }

  const companyEnabled = await isInboxAvailabilityEnabled(companyId);
  const defaultSchedule = await getCompanyDefaultInboxSchedule(companyId);
  const allSettings = await storage.getAllAgentInboxAvailabilitySettings(companyId);
  const settingsByUserId = new Map(allSettings.map((row) => [row.userId, row]));

  const results: AgentWithAvailability[] = [];

  for (const agent of agents) {
    const availability = await evaluateAgentAvailability(companyId, agent.id, new Date(), {
      agentSettings: settingsByUserId.get(agent.id) ?? null,
      companyEnabled,
      defaultSchedule,
    });

    const agentSettings = settingsByUserId.get(agent.id) ?? null;
    const timezone = normalizeScheduleTimezone(
      agentSettings?.timezone || defaultSchedule.timezone || 'UTC'
    );

    results.push({
      id: agent.id,
      fullName: agent.fullName,
      email: agent.email,
      avatarUrl: agent.avatarUrl,
      role: agent.role,
      username: agent.username,
      isAvailable: availability.available,
      availabilityReason: availability.reason,
      isOnDuty: availability.isOnDuty !== false,
      isScheduleEnabled: availability.isScheduleEnabled !== false,
      timezone,
    });
  }

  return results;
}

export async function filterAvailableAgentIds(
  companyId: number,
  agentIds: number[],
  at: Date = new Date()
): Promise<number[]> {
  if (agentIds.length === 0) {
    return [];
  }

  const companyEnabled = await isInboxAvailabilityEnabled(companyId);
  if (!companyEnabled) {
    return agentIds;
  }

  const defaultSchedule = await getCompanyDefaultInboxSchedule(companyId);
  const allSettings = await storage.getAllAgentInboxAvailabilitySettings(companyId);
  const settingsByUserId = new Map(allSettings.map((row) => [row.userId, row]));

  const available: number[] = [];
  for (const agentId of agentIds) {
    const availability = await evaluateAgentAvailability(companyId, agentId, at, {
      agentSettings: settingsByUserId.get(agentId) ?? null,
      companyEnabled,
      defaultSchedule,
    });
    if (availability.available) {
      available.push(agentId);
    }
  }

  return available;
}

export async function pickHandoffAutoAssignAgentId(
  companyId: number,
  agents: Array<{ id: number }>,
  allowedAgentIds?: number[] | null
): Promise<number | null> {
  if (agents.length === 0) {
    return null;
  }

  let pool = agents;
  if (allowedAgentIds != null && allowedAgentIds.length > 0) {
    const allowedSet = new Set(allowedAgentIds);
    pool = agents.filter((agent) => allowedSet.has(agent.id));
  }

  if (pool.length === 0) {
    return null;
  }

  const companyEnabled = await isInboxAvailabilityEnabled(companyId);
  let assignmentPool = pool;

  if (companyEnabled) {
    const availableIds = await filterAvailableAgentIds(
      companyId,
      pool.map((agent) => agent.id)
    );
    const availablePool = pool.filter((agent) => availableIds.includes(agent.id));
    assignmentPool = resolveHandoffAssignmentPool(pool, availablePool);
  }

  const pickedAgent = pickNextRoundRobinAgent(assignmentPool, await getHandoffRoundRobinLastUserId(companyId));
  await storage.saveCompanySetting(companyId, 'handoff_round_robin_last_agent', {
    lastUserId: pickedAgent.id,
  });
  return pickedAgent.id;
}

async function getHandoffRoundRobinLastUserId(companyId: number): Promise<number | null> {
  const setting = await storage.getCompanySetting(companyId, 'handoff_round_robin_last_agent');
  const raw = setting?.value;
  const lastData = (typeof raw === 'string'
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
    : raw) as { lastUserId?: number } | null;
  return lastData?.lastUserId ?? null;
}

export const inboxAvailabilityKeys = {
  enabled: INBOX_AVAILABILITY_ENABLED_KEY,
  defaultSchedule: INBOX_AVAILABILITY_DEFAULT_SCHEDULE_KEY,
} as const;
