import type { User } from '@shared/schema';
import { userCanAccessFlow, type FlowAccessRecord } from '../utils/flow-access';

export function normalizeFlowExecutionHistoryLimit(requestedLimit: unknown, defaultLimit = 20): number {
  if (typeof requestedLimit !== 'number' || !Number.isFinite(requestedLimit)) {
    return defaultLimit;
  }

  return Math.min(Math.max(Math.trunc(requestedLimit), 1), 50);
}

export function canAccessFlowExecutionHistory(
  flow: { userId: number | null; companyId: number | null },
  user: { id?: number | null; companyId?: number | null; isSuperAdmin?: boolean } | null | undefined
): boolean {
  return userCanAccessFlow(flow as FlowAccessRecord, user as User);
}