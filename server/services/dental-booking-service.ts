import type { ContactAppointment, InsertContactAppointment } from '@shared/schema';
import type { DentalBookingPolicy } from '@shared/types/dental-booking-types';
import {
  DEFAULT_DENTAL_AVAILABILITY_LIMIT,
  DENTAL_AVAILABILITY_MAX_LIMIT,
  appointmentEndsAt,
  appointmentStartsAtSameInstant,
  appointmentsOverlap,
  findBookableCatalogItem,
  getProviderWorkStartMinutes,
  getDentalHoursViolation,
  getSpecialistAllowedChairIds,
  isAiBookableSpecialist,
  isBookableDentist,
  isDentalBookingBlocking,
  isDentalBookingAwaitingStaff,
  isDentalSlotGridAligned,
  resolveProviderDaySchedules,
  specialistMatchesSpecialty,
  type ContactAppointmentStatus,
  type DentalAvailableSlot,
  type DentalAwaitingStaffStatus,
  type DentalBookAppointmentInput,
  type DentalBookableCatalogItem,
  type DentalPendingBookingQuery,
  type DentalScheduleOverrideKind,
} from '@shared/types/dental-booking-types';
import { getActiveBreaksForDay, parseTimeToMinutes, slotIntersectsAnyBreak } from '@shared/utils/calendar-breaks';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import { ErpConflictError, ErpValidationError, storage } from '../storage';
import { getDentalBookingPolicy } from './dental-booking-policy-service';
import { normalizeTimezone, parseInZoneToUTC, validateTimezone } from '../utils/timezone';

export type DentalAvailabilityQuery = {
  providerUserId: number;
  catalogItemId: string;
  from: string;
  to: string;
  limit?: number;
};

export type DentalSlotProbeResult = {
  available: boolean;
  reason:
    | 'available'
    | 'outside_hours'
    | 'not_grid_aligned'
    | 'in_past'
    | 'provider_busy'
    | 'no_free_chair'
    | 'invalid_time';
  scheduledAt?: string;
  chairId?: number | null;
  displayTime?: string;
};

export type ManualDentalSlot = {
  scheduledAt: string;
  localTime: string;
  availableChairIds: number[];
};

export type ManualDentalAvailabilityResult = {
  timezone: string;
  date: string;
  durationMinutes: number;
  requiresChair: boolean;
  specialtyOverrideRequired: boolean;
  slots: ManualDentalSlot[];
};

export type ManualDentalSlotEvaluation = {
  scheduledAt: string;
  timezone: string;
  durationMinutes: number;
  requiresChair: boolean;
  availableChairIds: number[];
  hardConflicts: Array<{ code: string; message: string }>;
  overrideViolations: Array<{ code: DentalScheduleOverrideKind; message: string }>;
};

export type ManualDentalAppointmentInput = {
  contactId: number;
  providerUserId: number | null;
  catalogItemId: string;
  scheduledAt: string;
  chairId?: number | null;
  title?: string;
  description?: string | null;
  location?: string | null;
  status?: ContactAppointmentStatus;
  isRecall?: boolean;
  recallDueAt?: Date | null;
  calendarColor?: string | null;
  overrideReason?: string | null;
};

export type DentalOverrideAuditContext = {
  userId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type PreparedBookingSlot = {
  policy: DentalBookingPolicy;
  catalogItem: DentalBookableCatalogItem;
  scheduledAt: Date;
  chairId: number | null;
  bookingStatus: 'confirmed' | 'held' | 'pending_request';
  holdExpiresAt: Date | null;
};

export async function resolveDentalCompanyTimezone(companyId: number): Promise<string> {
  const setting = await storage.getCompanySetting(companyId, 'defaultTimezone');
  const raw = typeof setting?.value === 'string' ? setting.value : 'UTC';
  return normalizeTimezone(raw);
}

async function sweepExpiredBookings(companyId: number): Promise<void> {
  await storage.expireDentalBookingHolds(companyId);
}

function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function buildDateKeysInRange(from: Date, to: Date, timezone: string): string[] {
  if (to <= from) return [];
  const keys: string[] = [];
  let key = getZonedDateTimeParts(from, timezone).dateKey;
  const endKey = getZonedDateTimeParts(new Date(to.getTime() - 1), timezone).dateKey;
  while (key <= endKey) {
    keys.push(key);
    key = addDaysToDateKey(key, 1);
  }
  return keys;
}

function filterBlockingAppointments(
  appointments: ContactAppointment[],
  now: Date = new Date(),
): ContactAppointment[] {
  return appointments.filter((apt) => isDentalBookingBlocking(apt.status, apt.holdExpiresAt, now));
}

function isProviderFree(
  blockingAppointments: ContactAppointment[],
  providerUserId: number,
  slotStart: Date,
  durationMinutes: number,
): boolean {
  return !blockingAppointments.some(
    (apt) =>
      apt.providerUserId === providerUserId &&
      appointmentsOverlap(slotStart, durationMinutes, apt.scheduledAt, apt.durationMinutes ?? 60),
  );
}

function findFreeChairId(
  chairs: Array<{ id: number }>,
  blockingAppointments: ContactAppointment[],
  slotStart: Date,
  durationMinutes: number,
): number | null {
  for (const chair of chairs) {
    const chairBusy = blockingAppointments.some(
      (apt) =>
        apt.chairId === chair.id &&
        appointmentsOverlap(slotStart, durationMinutes, apt.scheduledAt, apt.durationMinutes ?? 60),
    );
    if (!chairBusy) return chair.id;
  }
  return null;
}

function isWithinProviderHours(
  schedules: ReturnType<typeof resolveProviderDaySchedules>,
  dayIndex: number,
  slotStartMinutes: number,
  durationMinutes: number,
): boolean {
  const day = schedules.find((entry) => entry.dayIndex === dayIndex);
  if (!day?.enabled) return false;
  const workStart = parseTimeToMinutes(day.startTime);
  const workEnd = parseTimeToMinutes(day.endTime);
  if (workStart == null || workEnd == null || workEnd <= workStart) return false;
  const slotEndMinutes = slotStartMinutes + durationMinutes;
  if (slotStartMinutes < workStart || slotEndMinutes > workEnd) return false;
  const breaks = getActiveBreaksForDay(day);
  return !slotIntersectsAnyBreak(slotStartMinutes, slotEndMinutes, breaks);
}

async function loadBlockingAppointmentsInRange(
  companyId: number,
  from: Date,
  to: Date,
): Promise<ContactAppointment[]> {
  const appointments = await storage.listDentalAppointmentsOverlapping(companyId, from, to);
  return filterBlockingAppointments(appointments);
}

async function pickAvailableChair(
  companyId: number,
  providerUserId: number,
  scheduledAt: Date,
  durationMinutes: number,
  allowedChairIds?: number[] | null,
): Promise<number | null> {
  let chairs = await storage.listDentalChairs(companyId, { activeOnly: true });
  if (allowedChairIds && allowedChairIds.length > 0) {
    const allowed = new Set(allowedChairIds);
    chairs = chairs.filter((chair) => allowed.has(chair.id));
  }
  for (const chair of chairs) {
    try {
      await storage.assertDentalAppointmentSlotAvailable(companyId, {
        scheduledAt,
        durationMinutes,
        providerUserId,
        chairId: chair.id,
        capacityMode: 'provider_and_chair',
      });
      return chair.id;
    } catch (error) {
      if (error instanceof ErpConflictError) continue;
      throw error;
    }
  }
  return null;
}

function resolveBookingStatus(policy: DentalBookingPolicy): {
  status: PreparedBookingSlot['bookingStatus'];
  holdExpiresAt: Date | null;
} {
  if (policy.authorityMode === 'instant') {
    return { status: 'confirmed', holdExpiresAt: null };
  }
  const holdExpiresAt = new Date(Date.now() + policy.holdTimeoutMinutes * 60_000);
  if (policy.authorityMode === 'hold') {
    return { status: 'held', holdExpiresAt };
  }
  return { status: 'pending_request', holdExpiresAt };
}

/** When the specialist has an allow-list, AI (and capacity) must use those offices. */
function resolveEffectiveChairConstraint(
  policy: DentalBookingPolicy,
  providerUserId: number,
  bookingSource: DentalBookAppointmentInput['bookingSource'],
): { requireChair: boolean; allowedChairIds: number[] | null } {
  const allowedChairIds = getSpecialistAllowedChairIds(policy, providerUserId);
  if (allowedChairIds.length > 0) {
    return { requireChair: true, allowedChairIds };
  }
  if (policy.capacityMode === 'provider_and_chair') {
    return { requireChair: true, allowedChairIds: null };
  }
  // AI bookings with incomplete profiles should already be rejected upstream; staff can still book provider-only.
  if (bookingSource === 'ai_local') {
    return { requireChair: false, allowedChairIds: null };
  }
  return { requireChair: false, allowedChairIds: null };
}

async function getManualChairPool(
  companyId: number,
  policy: DentalBookingPolicy,
  providerUserId: number,
): Promise<{ requiresChair: boolean; chairs: Array<{ id: number }> }> {
  const allowedChairIds = getSpecialistAllowedChairIds(policy, providerUserId);
  const requiresChair = policy.capacityMode === 'provider_and_chair' || allowedChairIds.length > 0;
  let chairs = await storage.listDentalChairs(companyId, { activeOnly: true });
  if (allowedChairIds.length > 0) {
    const allowed = new Set(allowedChairIds);
    chairs = chairs.filter((chair) => allowed.has(chair.id));
  }
  return { requiresChair, chairs };
}

function hasPatientStartConflict(
  appointments: ContactAppointment[],
  contactId: number,
  scheduledAt: Date,
): boolean {
  return appointments.some(
    (appointment) =>
      appointment.contactId === contactId &&
      appointmentStartsAtSameInstant(appointment.scheduledAt, scheduledAt),
  );
}

export async function getManualDentalAvailability(params: {
  companyId: number;
  contactId: number;
  providerUserId: number;
  catalogItemId: string;
  date: string;
  excludeAppointmentId?: number;
}): Promise<ManualDentalAvailabilityResult> {
  await sweepExpiredBookings(params.companyId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    throw new ErpValidationError('Invalid appointment date', 'invalid_date');
  }
  const policy = await getDentalBookingPolicy(params.companyId);
  const catalogItem = findBookableCatalogItem(policy, params.catalogItemId);
  if (!catalogItem) throw new ErpValidationError('Unknown or inactive catalog item', 'invalid_service');
  if (!isBookableDentist(policy, params.providerUserId)) {
    throw new ErpValidationError('Provider is not on the bookable roster', 'provider_not_rostered');
  }
  const patient = await storage.getDentalPatientByContactId(params.companyId, params.contactId);
  if (!patient) throw new ErpValidationError('Contact is not a dental patient', 'invalid_patient');

  if (params.excludeAppointmentId != null) {
    const current = await storage.getDentalScheduleAppointment(params.companyId, params.excludeAppointmentId);
    if (!current || current.contactId !== params.contactId) {
      throw new ErpValidationError('Appointment does not belong to the selected patient', 'invalid_appointment');
    }
  }

  const timezone = await resolveDentalCompanyTimezone(params.companyId);
  const schedules = resolveProviderDaySchedules(policy, params.providerUserId);
  const dayProbe = parseInZoneToUTC(`${params.date}T12:00:00`, timezone);
  const dayParts = getZonedDateTimeParts(dayProbe, timezone);
  if (dayParts.dateKey !== params.date) {
    throw new ErpValidationError('Invalid appointment date', 'invalid_date');
  }
  const dayIndex = dayParts.dayIndex;
  const day = schedules.find((entry) => entry.dayIndex === dayIndex);
  const { requiresChair, chairs } = await getManualChairPool(params.companyId, policy, params.providerUserId);
  const result: ManualDentalAvailabilityResult = {
    timezone,
    date: params.date,
    durationMinutes: catalogItem.durationMinutes,
    requiresChair,
    specialtyOverrideRequired: !specialistMatchesSpecialty(policy, params.providerUserId, catalogItem.specialtyId),
    slots: [],
  };
  if (!day?.enabled || (requiresChair && chairs.length === 0)) return result;

  const workStart = parseTimeToMinutes(day.startTime);
  const workEnd = parseTimeToMinutes(day.endTime);
  if (workStart == null || workEnd == null || workEnd <= workStart) return result;
  const dayStart = parseInZoneToUTC(`${params.date}T00:00:00`, timezone);
  const dayEnd = parseInZoneToUTC(`${addDaysToDateKey(params.date, 1)}T00:00:00`, timezone);
  const blockingAppointments = (await loadBlockingAppointmentsInRange(
    params.companyId,
    dayStart,
    appointmentEndsAt(dayEnd, catalogItem.durationMinutes),
  )).filter((appointment) => appointment.id !== params.excludeAppointmentId);
  const now = new Date();

  for (
    let startMinutes = workStart;
    startMinutes + catalogItem.durationMinutes <= workEnd;
    startMinutes += policy.slotStepMinutes
  ) {
    if (!isWithinProviderHours(schedules, dayIndex, startMinutes, catalogItem.durationMinutes)) continue;
    const localTime = formatMinutesAsTime(startMinutes);
    const scheduledAt = parseInZoneToUTC(`${params.date}T${localTime}:00`, timezone);
    if (scheduledAt < now) continue;
    if (!isProviderFree(blockingAppointments, params.providerUserId, scheduledAt, catalogItem.durationMinutes)) continue;
    if (hasPatientStartConflict(blockingAppointments, params.contactId, scheduledAt)) continue;

    const availableChairIds = chairs
      .filter((chair) => findFreeChairId([chair], blockingAppointments, scheduledAt, catalogItem.durationMinutes) != null)
      .map((chair) => chair.id);
    if (requiresChair && availableChairIds.length === 0) continue;
    result.slots.push({ scheduledAt: scheduledAt.toISOString(), localTime, availableChairIds });
  }
  return result;
}

export async function evaluateManualDentalSlot(params: {
  companyId: number;
  contactId: number;
  providerUserId: number;
  catalogItemId: string;
  scheduledAt: string;
  chairId?: number | null;
  excludeAppointmentId?: number;
}): Promise<ManualDentalSlotEvaluation> {
  await sweepExpiredBookings(params.companyId);
  const policy = await getDentalBookingPolicy(params.companyId);
  const catalogItem = findBookableCatalogItem(policy, params.catalogItemId);
  if (!catalogItem) throw new ErpValidationError('Unknown or inactive catalog item', 'invalid_service');
  if (!isBookableDentist(policy, params.providerUserId)) {
    throw new ErpValidationError('Provider is not on the bookable roster', 'provider_not_rostered');
  }
  const patient = await storage.getDentalPatientByContactId(params.companyId, params.contactId);
  if (!patient) throw new ErpValidationError('Contact is not a dental patient', 'invalid_patient');

  const scheduledAt = new Date(params.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ErpValidationError('Invalid scheduledAt', 'invalid_time');
  }
  const timezone = await resolveDentalCompanyTimezone(params.companyId);
  const schedules = resolveProviderDaySchedules(policy, params.providerUserId);
  const parts = getZonedDateTimeParts(scheduledAt, timezone);
  const workStart = getProviderWorkStartMinutes(schedules, parts.dayIndex);
  const hardConflicts: ManualDentalSlotEvaluation['hardConflicts'] = [];
  const overrideViolations: ManualDentalSlotEvaluation['overrideViolations'] = [];
  const gridAligned = workStart == null
    ? scheduledAt.getUTCSeconds() === 0 &&
      scheduledAt.getUTCMilliseconds() === 0 &&
      parts.timeMinutes % policy.slotStepMinutes === 0
    : isDentalSlotGridAligned(scheduledAt, timezone, workStart, policy.slotStepMinutes);
  if (!gridAligned) {
    hardConflicts.push({ code: 'slot_grid_mismatch', message: `Time must align to the ${policy.slotStepMinutes}-minute booking grid` });
  }
  const hoursViolationCode = getDentalHoursViolation(
    schedules,
    scheduledAt,
    timezone,
    catalogItem.durationMinutes,
  );
  if (hoursViolationCode) {
    overrideViolations.push({
      code: hoursViolationCode,
      message: hoursViolationCode === 'provider_break'
        ? 'Appointment overlaps a provider break'
        : 'Appointment is outside provider working hours',
    });
  }
  if (scheduledAt.getTime() < Date.now()) {
    overrideViolations.push({ code: 'past_time', message: 'Appointment is in the past' });
  }
  if (!specialistMatchesSpecialty(policy, params.providerUserId, catalogItem.specialtyId)) {
    overrideViolations.push({ code: 'specialty_mismatch', message: 'Provider specialty does not match the selected service' });
  }

  const { requiresChair, chairs } = await getManualChairPool(params.companyId, policy, params.providerUserId);
  const availableChairIds: number[] = [];
  try {
    await storage.assertDentalAppointmentSlotAvailable(
      params.companyId,
      {
        scheduledAt,
        durationMinutes: catalogItem.durationMinutes,
        providerUserId: params.providerUserId,
        chairId: null,
        contactId: params.contactId,
        capacityMode: 'provider',
      },
      params.excludeAppointmentId,
    );
  } catch (error) {
    if (error instanceof ErpConflictError) {
      hardConflicts.push({ code: error.code ?? 'appointment_conflict', message: error.message });
    } else {
      throw error;
    }
  }

  if (hardConflicts.length === 0) {
    for (const chair of chairs) {
      try {
        await storage.assertDentalAppointmentSlotAvailable(
          params.companyId,
          {
            scheduledAt,
            durationMinutes: catalogItem.durationMinutes,
            providerUserId: params.providerUserId,
            chairId: chair.id,
            contactId: params.contactId,
            capacityMode: 'provider_and_chair',
          },
          params.excludeAppointmentId,
        );
        availableChairIds.push(chair.id);
      } catch (error) {
        if (!(error instanceof ErpConflictError)) throw error;
      }
    }
  }

  if (params.chairId != null) {
    if (!chairs.some((chair) => chair.id === params.chairId)) {
      hardConflicts.push({ code: 'invalid_office', message: 'Office is inactive or not allowed for this provider' });
    } else if (hardConflicts.length === 0 && !availableChairIds.includes(params.chairId)) {
      hardConflicts.push({ code: 'office_overlap', message: 'Office is not available at the requested time' });
    }
  } else if (requiresChair) {
    hardConflicts.push({ code: 'office_required', message: 'A valid office is required for this appointment' });
  }

  return {
    scheduledAt: scheduledAt.toISOString(),
    timezone,
    durationMinutes: catalogItem.durationMinutes,
    requiresChair,
    availableChairIds,
    hardConflicts,
    overrideViolations: overrideViolations.filter(
      (violation, index, all) => all.findIndex((item) => item.code === violation.code) === index,
    ),
  };
}

export async function evaluateManualDentalLocalSlot(params: {
  companyId: number;
  contactId: number;
  providerUserId: number;
  catalogItemId: string;
  date: string;
  time: string;
  chairId?: number | null;
  excludeAppointmentId?: number;
}): Promise<ManualDentalSlotEvaluation> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(params.time)) {
    throw new ErpValidationError('Invalid appointment date or time', 'invalid_time');
  }
  const timezone = await resolveDentalCompanyTimezone(params.companyId);
  const scheduledAt = parseInZoneToUTC(`${params.date}T${params.time}:00`, timezone);
  const roundTrip = getZonedDateTimeParts(scheduledAt, timezone);
  if (roundTrip.dateKey !== params.date || roundTrip.timeMinutes !== parseTimeToMinutes(params.time)) {
    throw new ErpValidationError('The selected local time does not exist in the company timezone', 'invalid_time');
  }
  return evaluateManualDentalSlot({ ...params, scheduledAt: scheduledAt.toISOString() });
}

function assertManualEvaluationCanSave(
  evaluation: ManualDentalSlotEvaluation,
  overrideReason: string | null | undefined,
): { reason: string | null; kinds: DentalScheduleOverrideKind[] } {
  if (evaluation.hardConflicts.length > 0) {
    const first = evaluation.hardConflicts[0];
    const conflictCodes = new Set(['provider_overlap', 'office_overlap', 'patient_start_conflict']);
    if (conflictCodes.has(first.code)) {
      throw new ErpConflictError(first.message, first.code, { conflicts: evaluation.hardConflicts });
    }
    throw new ErpValidationError(first.message, first.code, { conflicts: evaluation.hardConflicts });
  }
  const kinds = evaluation.overrideViolations.map((violation) => violation.code);
  if (kinds.length === 0) return { reason: null, kinds: [] };
  const reason = overrideReason?.trim() ?? '';
  if (reason.length < 3 || reason.length > 500) {
    throw new ErpValidationError(
      'A 3–500 character override reason is required',
      'override_reason_required',
      { violations: evaluation.overrideViolations },
    );
  }
  return { reason, kinds };
}

function manualOverrideColumns(
  override: { reason: string | null; kinds: DentalScheduleOverrideKind[] },
  actorId?: number | null,
) {
  return override.kinds.length > 0
    ? {
        scheduleOverrideReason: override.reason,
        scheduleOverrideKinds: override.kinds,
        scheduleOverriddenBy: actorId ?? null,
        scheduleOverriddenAt: new Date(),
      }
    : {
        scheduleOverrideReason: null,
        scheduleOverrideKinds: null,
        scheduleOverriddenBy: null,
        scheduleOverriddenAt: null,
      };
}

export async function createManualDentalAppointment(
  companyId: number,
  input: ManualDentalAppointmentInput,
  audit: DentalOverrideAuditContext = {},
) {
  const policy = await getDentalBookingPolicy(companyId);
  const catalogItem = findBookableCatalogItem(policy, input.catalogItemId);
  if (!catalogItem) throw new ErpValidationError('Unknown or inactive catalog item', 'invalid_service');
  const status = input.status ?? 'scheduled';
  const blocking = isDentalBookingBlocking(status, null);
  if (blocking && input.providerUserId == null) {
    throw new ErpValidationError('Provider is required for an active appointment', 'provider_required');
  }

  let override = { reason: null as string | null, kinds: [] as DentalScheduleOverrideKind[] };
  if (blocking && input.providerUserId != null) {
    const evaluation = await evaluateManualDentalSlot({
      companyId,
      contactId: input.contactId,
      providerUserId: input.providerUserId,
      catalogItemId: input.catalogItemId,
      scheduledAt: input.scheduledAt,
      chairId: input.chairId,
    });
    override = assertManualEvaluationCanSave(evaluation, input.overrideReason);
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ErpValidationError('Invalid scheduledAt', 'invalid_time');
  }
  const capacityMode = input.chairId != null ? 'provider_and_chair' : policy.capacityMode;
  return storage.createDentalScheduleAppointment(
    {
      companyId,
      contactId: input.contactId,
      title: input.title?.trim() || catalogItem.label,
      description: input.description ?? null,
      location: input.location ?? null,
      scheduledAt,
      durationMinutes: catalogItem.durationMinutes,
      type: catalogItem.visitType ?? 'consultation',
      status,
      providerUserId: input.providerUserId,
      chairId: input.chairId ?? null,
      isRecall: input.isRecall ?? false,
      recallDueAt: input.recallDueAt ?? null,
      bookingSource: 'staff',
      bookingServiceKey: catalogItem.id,
      bookingServiceLabel: catalogItem.label,
      calendarColor: input.calendarColor ?? null,
      createdBy: audit.userId ?? null,
      ...manualOverrideColumns(override, audit.userId),
    },
    {
      capacityMode,
      overrideAudit: override.reason
        ? { ...audit, reason: override.reason, kinds: override.kinds }
        : undefined,
    },
  );
}

export type ManualDentalAppointmentUpdate = Partial<ManualDentalAppointmentInput>;

export async function updateManualDentalAppointment(
  companyId: number,
  appointmentId: number,
  input: ManualDentalAppointmentUpdate,
  audit: DentalOverrideAuditContext = {},
) {
  const existing = await storage.getDentalScheduleAppointment(companyId, appointmentId);
  if (!existing) throw new ErpValidationError('Appointment not found');
  const policy = await getDentalBookingPolicy(companyId);
  const nextStatus = input.status ?? (existing.status as ContactAppointmentStatus);
  const wasBlocking = isDentalBookingBlocking(existing.status, existing.holdExpiresAt);
  const willBlock = isDentalBookingBlocking(nextStatus, existing.holdExpiresAt);
  const nextScheduledAt = input.scheduledAt != null ? new Date(input.scheduledAt) : existing.scheduledAt;
  if (Number.isNaN(nextScheduledAt.getTime())) {
    throw new ErpValidationError('Invalid scheduledAt', 'invalid_time');
  }
  const nextProviderId = input.providerUserId !== undefined ? input.providerUserId : existing.providerUserId;
  const nextChairId = input.chairId !== undefined ? input.chairId : existing.chairId;
  const nextCatalogItemId = input.catalogItemId ?? existing.bookingServiceKey;
  const schedulingChanged =
    (input.scheduledAt != null && nextScheduledAt.getTime() !== existing.scheduledAt.getTime()) ||
    (input.providerUserId !== undefined && nextProviderId !== existing.providerUserId) ||
    (input.chairId !== undefined && nextChairId !== existing.chairId) ||
    (input.contactId !== undefined && input.contactId !== existing.contactId) ||
    (input.catalogItemId != null && input.catalogItemId !== existing.bookingServiceKey) ||
    (!wasBlocking && willBlock);

  let catalogItem = nextCatalogItemId ? findBookableCatalogItem(policy, nextCatalogItemId) : undefined;
  if (schedulingChanged && !catalogItem) {
    throw new ErpValidationError(
      'Select an active booking service before rescheduling this appointment',
      'service_required_for_reschedule',
    );
  }
  if (willBlock && schedulingChanged && nextProviderId == null) {
    throw new ErpValidationError('Provider is required for an active appointment', 'provider_required');
  }

  let override = { reason: null as string | null, kinds: [] as DentalScheduleOverrideKind[] };
  if (willBlock && schedulingChanged && catalogItem && nextProviderId != null) {
    const evaluation = await evaluateManualDentalSlot({
      companyId,
      contactId: input.contactId ?? existing.contactId,
      providerUserId: nextProviderId,
      catalogItemId: catalogItem.id,
      scheduledAt: nextScheduledAt.toISOString(),
      chairId: nextChairId,
      excludeAppointmentId: appointmentId,
    });
    override = assertManualEvaluationCanSave(evaluation, input.overrideReason);
  }

  const updates: Partial<InsertContactAppointment> = {};
  if (input.contactId !== undefined) updates.contactId = input.contactId;
  if (input.title !== undefined) updates.title = input.title.trim() || catalogItem?.label || existing.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.location !== undefined) updates.location = input.location;
  if (input.scheduledAt !== undefined) updates.scheduledAt = nextScheduledAt;
  if (input.status !== undefined) updates.status = input.status;
  if (input.providerUserId !== undefined) updates.providerUserId = input.providerUserId;
  if (input.chairId !== undefined) updates.chairId = input.chairId;
  if (input.isRecall !== undefined) updates.isRecall = input.isRecall;
  if (input.recallDueAt !== undefined) updates.recallDueAt = input.recallDueAt;
  if (input.calendarColor !== undefined) updates.calendarColor = input.calendarColor;
  if (input.catalogItemId !== undefined && catalogItem) {
    updates.durationMinutes = catalogItem.durationMinutes;
    updates.type = catalogItem.visitType ?? 'consultation';
    updates.bookingServiceKey = catalogItem.id;
    updates.bookingServiceLabel = catalogItem.label;
    if (input.title === undefined && !existing.title.trim()) updates.title = catalogItem.label;
  }
  if (schedulingChanged || !willBlock) Object.assign(updates, manualOverrideColumns(override, audit.userId));

  const capacityMode = nextChairId != null ? 'provider_and_chair' : policy.capacityMode;
  return storage.updateDentalScheduleAppointment(companyId, appointmentId, updates, {
    capacityMode,
    overrideAudit: override.reason
      ? { ...audit, reason: override.reason, kinds: override.kinds }
      : undefined,
  });
}

async function prepareDentalBookingSlot(
  companyId: number,
  input: DentalBookAppointmentInput,
): Promise<PreparedBookingSlot> {
  const policy = await getDentalBookingPolicy(companyId);

  const patient = await storage.getDentalPatientByContactId(companyId, input.contactId);
  if (!patient) {
    throw new ErpValidationError('Contact is not a dental patient');
  }

  const catalogItem = findBookableCatalogItem(policy, input.catalogItemId);
  if (!catalogItem) {
    throw new ErpValidationError('Unknown or inactive catalog item');
  }
  if (!isBookableDentist(policy, input.providerUserId)) {
    throw new ErpValidationError('Provider is not bookable');
  }

  if (input.bookingSource === 'ai_local') {
    if (!isAiBookableSpecialist(policy, input.providerUserId)) {
      throw new ErpValidationError(
        'Provider is missing specialty or allowed office configuration for online booking',
      );
    }
    if (!specialistMatchesSpecialty(policy, input.providerUserId, catalogItem.specialtyId)) {
      throw new ErpValidationError('Provider specialty does not match the selected service');
    }
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ErpValidationError('Invalid scheduledAt');
  }
  if (scheduledAt.getTime() < Date.now()) {
    throw new ErpValidationError('Cannot book an appointment in the past');
  }

  const timezone = await resolveDentalCompanyTimezone(companyId);
  const parts = getZonedDateTimeParts(scheduledAt, timezone);
  const schedules = resolveProviderDaySchedules(policy, input.providerUserId);
  if (!isWithinProviderHours(schedules, parts.dayIndex, parts.timeMinutes, catalogItem.durationMinutes)) {
    throw new ErpValidationError('Requested time is outside provider working hours');
  }
  const workStartMinutes = getProviderWorkStartMinutes(schedules, parts.dayIndex);
  if (workStartMinutes == null || !isDentalSlotGridAligned(scheduledAt, timezone, workStartMinutes, policy.slotStepMinutes)) {
    throw new ErpValidationError('Requested time does not align with available booking slots');
  }

  const chairConstraint = resolveEffectiveChairConstraint(
    policy,
    input.providerUserId,
    input.bookingSource,
  );
  let chairId: number | null = input.chairId ?? null;

  if (chairConstraint.requireChair) {
    if (chairId != null) {
      const chair = await storage.getDentalChair(companyId, chairId);
      if (!chair?.isActive) {
        throw new ErpValidationError('Office is not active');
      }
      if (
        chairConstraint.allowedChairIds &&
        !chairConstraint.allowedChairIds.includes(chairId)
      ) {
        throw new ErpValidationError('Provider is not assigned to the selected office');
      }
    } else {
      chairId = await pickAvailableChair(
        companyId,
        input.providerUserId,
        scheduledAt,
        catalogItem.durationMinutes,
        chairConstraint.allowedChairIds,
      );
      if (chairId == null) {
        throw new ErpConflictError('No office available at the requested time');
      }
    }
  } else {
    chairId = null;
  }

  const { status, holdExpiresAt } = resolveBookingStatus(policy);
  return {
    policy,
    catalogItem,
    scheduledAt,
    chairId,
    bookingStatus: status,
    holdExpiresAt,
  };
}

/**
 * Probe one exact local HH:MM on a date against the same rules as availability listing.
 * Used by AI booking so a requested time is never silently dropped from a truncated day list.
 */
export async function probeDentalSlotAvailability(params: {
  companyId: number;
  providerUserId: number;
  catalogItemId: string;
  date: string;
  time: string;
  interpretationTimezone?: string;
}): Promise<DentalSlotProbeResult> {
  await sweepExpiredBookings(params.companyId);

  const timeMatch = String(params.time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date) || !timeMatch) {
    return { available: false, reason: 'invalid_time' };
  }
  const displayTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;

  const policy = await getDentalBookingPolicy(params.companyId);
  const catalogItem = findBookableCatalogItem(policy, params.catalogItemId);
  if (!catalogItem) {
    return { available: false, reason: 'invalid_time' };
  }
  if (!isBookableDentist(policy, params.providerUserId)) {
    return { available: false, reason: 'outside_hours' };
  }

  const companyTimezone = await resolveDentalCompanyTimezone(params.companyId);
  const requestedTimezone = params.interpretationTimezone && validateTimezone(normalizeTimezone(params.interpretationTimezone))
    ? normalizeTimezone(params.interpretationTimezone)
    : companyTimezone;
  const scheduledAt = parseInZoneToUTC(`${params.date}T${displayTime}:00`, requestedTimezone);
  const now = new Date();
  if (scheduledAt < now) {
    return { available: false, reason: 'in_past', displayTime };
  }

  const parts = getZonedDateTimeParts(scheduledAt, companyTimezone);
  const schedules = resolveProviderDaySchedules(policy, params.providerUserId);
  if (!isWithinProviderHours(schedules, parts.dayIndex, parts.timeMinutes, catalogItem.durationMinutes)) {
    return { available: false, reason: 'outside_hours', displayTime, scheduledAt: scheduledAt.toISOString() };
  }
  const workStartMinutes = getProviderWorkStartMinutes(schedules, parts.dayIndex);
  if (workStartMinutes == null || !isDentalSlotGridAligned(scheduledAt, companyTimezone, workStartMinutes, policy.slotStepMinutes)) {
    return { available: false, reason: 'not_grid_aligned', displayTime, scheduledAt: scheduledAt.toISOString() };
  }

  const from = parseInZoneToUTC(`${parts.dateKey}T00:00:00`, companyTimezone);
  const to = parseInZoneToUTC(`${parts.dateKey}T23:59:59`, companyTimezone);
  const blockingAppointments = await loadBlockingAppointmentsInRange(
    params.companyId,
    from,
    appointmentEndsAt(to, catalogItem.durationMinutes),
  );
  if (!isProviderFree(blockingAppointments, params.providerUserId, scheduledAt, catalogItem.durationMinutes)) {
    return { available: false, reason: 'provider_busy', displayTime, scheduledAt: scheduledAt.toISOString() };
  }

  const allowedChairIds = getSpecialistAllowedChairIds(policy, params.providerUserId);
  const requireChair =
    policy.capacityMode === 'provider_and_chair' || allowedChairIds.length > 0;
  let chairId: number | null = null;
  if (requireChair) {
    let chairs = await storage.listDentalChairs(params.companyId, { activeOnly: true });
    if (allowedChairIds.length > 0) {
      const allowed = new Set(allowedChairIds);
      chairs = chairs.filter((chair) => allowed.has(chair.id));
    }
    chairId = findFreeChairId(chairs, blockingAppointments, scheduledAt, catalogItem.durationMinutes);
    if (chairId == null) {
      return { available: false, reason: 'no_free_chair', displayTime, scheduledAt: scheduledAt.toISOString() };
    }
  }

  return {
    available: true,
    reason: 'available',
    displayTime,
    scheduledAt: scheduledAt.toISOString(),
    chairId,
  };
}

export async function getDentalAvailableSlots(
  companyId: number,
  query: DentalAvailabilityQuery,
): Promise<DentalAvailableSlot[]> {
  await sweepExpiredBookings(companyId);

  const policy = await getDentalBookingPolicy(companyId);
  const catalogItem = findBookableCatalogItem(policy, query.catalogItemId);
  if (!catalogItem) {
    throw new ErpValidationError('Unknown or inactive catalog item');
  }
  if (!isBookableDentist(policy, query.providerUserId)) {
    throw new ErpValidationError('Provider is not bookable');
  }

  const from = new Date(query.from);
  const to = new Date(query.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ErpValidationError('Invalid availability range');
  }
  if (to <= from) {
    throw new ErpValidationError('`to` must be after `from`');
  }

  const timezone = await resolveDentalCompanyTimezone(companyId);
  const limit = Math.min(
    query.limit ?? DEFAULT_DENTAL_AVAILABILITY_LIMIT,
    DENTAL_AVAILABILITY_MAX_LIMIT,
  );
  const durationMinutes = catalogItem.durationMinutes;
  const schedules = resolveProviderDaySchedules(policy, query.providerUserId);
  const now = new Date();

  const rangeEnd = appointmentEndsAt(to, durationMinutes);
  const blockingAppointments = await loadBlockingAppointmentsInRange(
    companyId,
    from,
    rangeEnd,
  );

  let chairs: Array<{ id: number }> = [];
  const allowedChairIds = getSpecialistAllowedChairIds(policy, query.providerUserId);
  const requireChair =
    policy.capacityMode === 'provider_and_chair' || allowedChairIds.length > 0;
  if (requireChair) {
    chairs = await storage.listDentalChairs(companyId, { activeOnly: true });
    if (allowedChairIds.length > 0) {
      const allowed = new Set(allowedChairIds);
      chairs = chairs.filter((chair) => allowed.has(chair.id));
    }
    if (chairs.length === 0) return [];
  }

  const slots: DentalAvailableSlot[] = [];
  const dateKeys = buildDateKeysInRange(from, to, timezone);

  for (const dateKey of dateKeys) {
    const dayProbe = parseInZoneToUTC(`${dateKey}T12:00:00`, timezone);
    const dayIndex = getZonedDateTimeParts(dayProbe, timezone).dayIndex;
    const day = schedules.find((entry) => entry.dayIndex === dayIndex);
    if (!day?.enabled) continue;

    const workStart = parseTimeToMinutes(day.startTime);
    const workEnd = parseTimeToMinutes(day.endTime);
    if (workStart == null || workEnd == null || workEnd <= workStart) continue;

    for (
      let slotStartMinutes = workStart;
      slotStartMinutes + durationMinutes <= workEnd;
      slotStartMinutes += policy.slotStepMinutes
    ) {
      if (!isWithinProviderHours(schedules, dayIndex, slotStartMinutes, durationMinutes)) continue;

      const scheduledAt = parseInZoneToUTC(
        `${dateKey}T${formatMinutesAsTime(slotStartMinutes)}:00`,
        timezone,
      );
      if (scheduledAt < from || scheduledAt >= to || scheduledAt < now) continue;
      if (!isProviderFree(blockingAppointments, query.providerUserId, scheduledAt, durationMinutes)) {
        continue;
      }

      let chairId: number | null = null;
      if (requireChair) {
        chairId = findFreeChairId(chairs, blockingAppointments, scheduledAt, durationMinutes);
        if (chairId == null) continue;
      }

      slots.push({
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes,
        providerUserId: query.providerUserId,
        chairId,
      });
      if (slots.length >= limit) return slots;
    }
  }

  return slots;
}

export async function bookDentalAppointment(
  companyId: number,
  input: DentalBookAppointmentInput,
  createdBy?: number,
) {
  await sweepExpiredBookings(companyId);

  const prepared = await prepareDentalBookingSlot(companyId, input);
  const capacityMode =
    prepared.chairId != null ? 'provider_and_chair' : prepared.policy.capacityMode;

  return storage.createDentalScheduleAppointment(
    {
      companyId,
      contactId: input.contactId,
      title: prepared.catalogItem.label,
      description: null,
      location: null,
      scheduledAt: prepared.scheduledAt,
      durationMinutes: prepared.catalogItem.durationMinutes,
      type: prepared.catalogItem.visitType ?? 'consultation',
      status: prepared.bookingStatus,
      providerUserId: input.providerUserId,
      chairId: prepared.chairId,
      isRecall: false,
      recallDueAt: null,
      holdExpiresAt: prepared.holdExpiresAt,
      bookingSource: input.bookingSource,
      bookingServiceKey: prepared.catalogItem.id,
      bookingServiceLabel: prepared.catalogItem.label,
      createdBy: createdBy ?? null,
    },
    { capacityMode },
  );
}

export async function listPendingDentalBookings(
  companyId: number,
  query: DentalPendingBookingQuery = {},
) {
  await sweepExpiredBookings(companyId);

  const statuses: DentalAwaitingStaffStatus[] | undefined =
    query.status && query.status !== 'all' ? [query.status] : undefined;

  let from: Date | undefined;
  let to: Date | undefined;
  if (query.from) {
    from = new Date(query.from);
    if (Number.isNaN(from.getTime())) throw new ErpValidationError('Invalid `from` date');
  }
  if (query.to) {
    to = new Date(query.to);
    if (Number.isNaN(to.getTime())) throw new ErpValidationError('Invalid `to` date');
  }

  return storage.listPendingDentalBookings(companyId, {
    providerUserId: query.providerUserId,
    from,
    to,
    statuses,
  });
}

export async function confirmDentalBooking(companyId: number, appointmentId: number) {
  await sweepExpiredBookings(companyId);
  const policy = await getDentalBookingPolicy(companyId);
  return storage.confirmDentalScheduleBooking(companyId, appointmentId, 'held', policy.capacityMode);
}

export async function approveDentalBookingRequest(companyId: number, appointmentId: number) {
  await sweepExpiredBookings(companyId);
  const policy = await getDentalBookingPolicy(companyId);
  return storage.confirmDentalScheduleBooking(
    companyId,
    appointmentId,
    'pending_request',
    policy.capacityMode,
  );
}

export async function declineDentalBooking(companyId: number, appointmentId: number) {
  const existing = await storage.getDentalScheduleAppointment(companyId, appointmentId);
  if (!existing) throw new ErpValidationError('Appointment not found');
  if (!isDentalBookingAwaitingStaff(existing.status)) {
    throw new ErpValidationError('Appointment cannot be declined in its current status');
  }
  return storage.declineDentalScheduleBooking(companyId, appointmentId, ['held', 'pending_request']);
}

export async function expireDentalBookingHolds(companyId?: number): Promise<{ expiredCount: number }> {
  const expiredCount = await storage.expireDentalBookingHolds(companyId);
  return { expiredCount };
}
