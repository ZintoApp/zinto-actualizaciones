import type { Deal, PipelineStage } from '@shared/schema';

/** Group deals into stage buckets; unknown or missing stageId are omitted. */
export function groupDealsByStage(
  deals: Deal[],
  stages: PipelineStage[],
): Record<number, Deal[]> {
  const grouped: Record<number, Deal[]> = {};
  for (const stage of stages) {
    grouped[stage.id] = [];
  }
  for (const deal of deals) {
    if (deal.stageId != null && grouped[deal.stageId]) {
      grouped[deal.stageId].push(deal);
    }
  }
  return grouped;
}

/** Bucket scheduled reverts by deal id for O(1) lookup when enriching deals. */
export function groupRevertsByDealId<T extends { dealId: number }>(
  reverts: T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const revert of reverts) {
    const existing = map.get(revert.dealId);
    if (existing) {
      existing.push(revert);
    } else {
      map.set(revert.dealId, [revert]);
    }
  }
  return map;
}

export type PaginatedSliceResult<T> = {
  items: T[];
  hasMore: boolean;
  totalCount: number;
};

/** Pure pagination helper mirroring limit/offset applied in getDeals. */
export function applyDealsPagination<T>(
  items: T[],
  limit: number | undefined,
  offset: number | undefined,
): PaginatedSliceResult<T> {
  const safeOffset = Math.max(0, offset ?? 0);
  const totalCount = items.length;
  if (limit === undefined) {
    return { items, hasMore: false, totalCount };
  }
  const end = safeOffset + limit;
  return {
    items: items.slice(safeOffset, end),
    hasMore: end < totalCount,
    totalCount,
  };
}

/** Flatten grouped deals into a single array (preserves stage iteration order). */
export function flattenDealsByStage(
  dealsByStageId: Record<number, Deal[]>,
  stageIds: number[],
): Deal[] {
  const flat: Deal[] = [];
  for (const stageId of stageIds) {
    const stageDeals = dealsByStageId[stageId];
    if (stageDeals?.length) {
      flat.push(...stageDeals);
    }
  }
  return flat;
}
