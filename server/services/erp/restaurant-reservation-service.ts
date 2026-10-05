import type { InsertRestaurantReservation, RestaurantReservation, RestaurantTable } from '@shared/schema';
import type { PoolClient } from 'pg';
import { pool } from '../../db';
import { ErpConflictError, ErpValidationError, storage } from '../../storage';

export const RESTAURANT_RESERVATION_DEFAULT_DURATION_MINUTES = 90;
const MAX_DURATION_MINUTES = 24 * 60;
const BLOCKING_STATUSES = new Set(['booked', 'seated']);
const localTableLockQueues = new Map<string, Promise<void>>();

function normalizeDuration(value: unknown): number {
  const duration = Number(value ?? RESTAURANT_RESERVATION_DEFAULT_DURATION_MINUTES);
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_MINUTES) {
    throw new ErpValidationError('Reservation duration must be between 1 and 1440 minutes');
  }
  return duration;
}

function normalizeStart(value: unknown): Date {
  const start = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(start.getTime())) throw new ErpValidationError('A valid reservation date/time is required');
  return start;
}

async function hasOverlap(params: {
  companyId: number;
  tableId: number;
  reservationAt: Date;
  durationMinutes: number;
  excludeReservationId?: number;
}): Promise<boolean> {
  const searchStart = new Date(params.reservationAt.getTime() - MAX_DURATION_MINUTES * 60_000);
  const searchEnd = new Date(params.reservationAt.getTime() + params.durationMinutes * 60_000);
  const result = await storage.getRestaurantReservations(params.companyId, {
    tableId: params.tableId,
    dateFrom: searchStart,
    dateTo: searchEnd,
    limit: 500,
  });
  const requestedEnd = searchEnd.getTime();
  return result.data.some((reservation) => {
    if (reservation.id === params.excludeReservationId || !BLOCKING_STATUSES.has(reservation.status)) return false;
    const existingStart = new Date(reservation.reservationAt).getTime();
    const existingDuration = normalizeDuration(reservation.expectedDurationMinutes);
    const existingEnd = existingStart + existingDuration * 60_000;
    return params.reservationAt.getTime() < existingEnd && requestedEnd > existingStart;
  });
}

async function withTableLock<T>(companyId: number, tableId: number, callback: () => Promise<T>): Promise<T> {
  const key = `${companyId}:${tableId}`;
  const previous = localTableLockQueues.get(key) ?? Promise.resolve();
  let releaseLocalLock!: () => void;
  const current = new Promise<void>((resolve) => { releaseLocalLock = resolve; });
  localTableLockQueues.set(key, current);
  await previous;
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1, $2)', [companyId, tableId]);
    return await callback();
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [companyId, tableId]).catch(() => undefined);
      client.release();
    }
    releaseLocalLock();
    if (localTableLockQueues.get(key) === current) localTableLockQueues.delete(key);
  }
}

async function assertUsableTable(companyId: number, tableId: number, guestCount: number): Promise<RestaurantTable> {
  const table = await storage.getRestaurantTable(tableId);
  if (!table || table.companyId !== companyId || table.isActive === false || table.isReservable === false) {
    throw new ErpValidationError('Restaurant table is not active and reservable for this company');
  }
  if (table.capacity < guestCount) throw new ErpValidationError('Restaurant table does not have enough capacity');
  return table;
}

export async function findRestaurantReservationAvailability(params: {
  companyId: number;
  reservationAt: unknown;
  expectedDurationMinutes?: unknown;
  guestCount?: unknown;
}): Promise<Array<Pick<RestaurantTable, 'id' | 'label' | 'code' | 'capacity'>>> {
  const reservationAt = normalizeStart(params.reservationAt);
  const durationMinutes = normalizeDuration(params.expectedDurationMinutes);
  const guestCount = Math.max(1, Number(params.guestCount) || 1);
  const tables = await storage.getRestaurantTables(params.companyId);
  const candidates = tables.filter((table) => table.isActive !== false && table.isReservable !== false && table.capacity >= guestCount);
  const available = await Promise.all(candidates.map(async (table) => ({
    table,
    overlaps: await hasOverlap({ companyId: params.companyId, tableId: table.id, reservationAt, durationMinutes }),
  })));
  return available.filter((entry) => !entry.overlaps).map(({ table }) => ({ id: table.id, label: table.label, code: table.code, capacity: table.capacity }));
}

export async function createConflictSafeRestaurantReservation(
  input: InsertRestaurantReservation,
): Promise<RestaurantReservation> {
  const reservationAt = normalizeStart(input.reservationAt);
  const expectedDurationMinutes = normalizeDuration(input.expectedDurationMinutes);
  const guestCount = Math.max(1, Number(input.guestCount) || 1);
  let tableId = input.tableId ?? null;
  if (tableId == null) {
    const available = await findRestaurantReservationAvailability({ companyId: input.companyId, reservationAt, expectedDurationMinutes, guestCount });
    tableId = available[0]?.id ?? null;
    if (tableId == null) throw new ErpConflictError('No table is available for the requested time and party size');
  }
  if (!BLOCKING_STATUSES.has(input.status ?? 'booked')) {
    await assertUsableTable(input.companyId, tableId, guestCount);
    return storage.createRestaurantReservation({ ...input, tableId, reservationAt, expectedDurationMinutes, guestCount });
  }
  return withTableLock(input.companyId, tableId, async () => {
    await assertUsableTable(input.companyId, tableId!, guestCount);
    if (await hasOverlap({ companyId: input.companyId, tableId: tableId!, reservationAt, durationMinutes: expectedDurationMinutes })) {
      throw new ErpConflictError('The selected table is already reserved for the requested time');
    }
    return storage.createRestaurantReservation({ ...input, tableId, reservationAt, expectedDurationMinutes, guestCount });
  });
}

export async function updateConflictSafeRestaurantReservation(
  companyId: number,
  reservationId: number,
  updates: Partial<InsertRestaurantReservation>,
): Promise<RestaurantReservation> {
  const existing = await storage.getRestaurantReservation(reservationId);
  if (!existing || existing.companyId !== companyId) throw new ErpValidationError('Restaurant reservation not found');
  const tableId = updates.tableId ?? existing.tableId;
  if (tableId == null) return storage.updateRestaurantReservation(reservationId, updates);
  const reservationAt = normalizeStart(updates.reservationAt ?? existing.reservationAt);
  const expectedDurationMinutes = normalizeDuration(updates.expectedDurationMinutes ?? existing.expectedDurationMinutes);
  const guestCount = Math.max(1, Number(updates.guestCount ?? existing.guestCount) || 1);
  if (!BLOCKING_STATUSES.has(updates.status ?? existing.status)) {
    return storage.updateRestaurantReservation(reservationId, { ...updates, tableId, reservationAt, expectedDurationMinutes, guestCount });
  }
  return withTableLock(companyId, tableId, async () => {
    await assertUsableTable(companyId, tableId, guestCount);
    if (await hasOverlap({ companyId, tableId, reservationAt, durationMinutes: expectedDurationMinutes, excludeReservationId: reservationId })) {
      throw new ErpConflictError('The selected table is already reserved for the requested time');
    }
    return storage.updateRestaurantReservation(reservationId, { ...updates, tableId, reservationAt, expectedDurationMinutes, guestCount });
  });
}
