/**
 * Pure helpers for capping and paginating offered calendar time slots.
 */

import {
  DEFAULT_MAX_OFFERED_SLOTS,
  MAX_OFFERED_SLOTS_LIMIT,
  MIN_OFFERED_SLOTS_LIMIT,
} from '../types/calendar-types';

export function clampMaxOfferedSlots(n: unknown): number {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return DEFAULT_MAX_OFFERED_SLOTS;
  return Math.min(MAX_OFFERED_SLOTS_LIMIT, Math.max(MIN_OFFERED_SLOTS_LIMIT, Math.floor(num)));
}

export interface SlotBatchCursor {
  /** Date key (YYYY-MM-DD) or range key this cursor applies to */
  key: string;
  /** How many slots already offered for this key (from the earliest-sorted full list) */
  offset: number;
}

export interface OfferSlotsResult {
  offered: string[];
  nextOffset: number;
  remaining: number;
  hasMore: boolean;
}

/**
 * Take the next batch of earliest free slots from a sorted list.
 * `slots` must already be earliest-first for the requested day/range presentation unit.
 */
export function offerNextSlotBatch(
  slots: string[],
  maxOffered: number,
  offset: number = 0
): OfferSlotsResult {
  const n = clampMaxOfferedSlots(maxOffered);
  const start = Math.max(0, Math.floor(offset) || 0);
  const offered = slots.slice(start, start + n);
  const nextOffset = start + offered.length;
  const remaining = Math.max(0, slots.length - nextOffset);
  return {
    offered,
    nextOffset,
    remaining,
    hasMore: remaining > 0,
  };
}

/**
 * For multi-day results: flatten date→slots in date order into a single earliest stream
 * of `{ date, slot }` pairs, then batch. Prefer using per-date batching when presenting
 * one day; this helper caps total options in one message to N.
 */
export function offerNextDatedSlotBatch(
  timeSlots: Array<{ date: string; slots: string[] }>,
  maxOffered: number,
  offset: number = 0
): {
  offered: Array<{ date: string; slot: string }>;
  nextOffset: number;
  remaining: number;
  hasMore: boolean;
} {
  const flat: Array<{ date: string; slot: string }> = [];
  for (const day of timeSlots) {
    for (const slot of day.slots) {
      flat.push({ date: day.date, slot });
    }
  }
  const n = clampMaxOfferedSlots(maxOffered);
  const start = Math.max(0, Math.floor(offset) || 0);
  const offered = flat.slice(start, start + n);
  const nextOffset = start + offered.length;
  const remaining = Math.max(0, flat.length - nextOffset);
  return {
    offered,
    nextOffset,
    remaining,
    hasMore: remaining > 0,
  };
}
