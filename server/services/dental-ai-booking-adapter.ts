/**
 * Adapts AI Assistant shared calendar tool calls onto the local dental booking stack.
 * Google path stays in flow-executor; this module is Local-only.
 */
import type { DentalBookingPolicy, DentalBookableCatalogItem } from '@shared/types/dental-booking-types';
import {
  DENTAL_AVAILABILITY_MAX_LIMIT,
  chooseLocalProviderCandidate,
  getSpecialistAllowedChairIds,
  resolveLocalBookableDentistIds,
  resolveLocalCatalogItem as resolveLocalCatalogItemShared,
  resolveLocalSpecialtyEligibleDentistIds,
  resolveSpecialtyLabel,
} from '@shared/types/dental-booking-types';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import { ErpValidationError, storage } from '../storage';
import { getDentalBookingPolicy } from './dental-booking-policy-service';
import { bookDentalAppointment, getDentalAvailableSlots, probeDentalSlotAvailability } from './dental-booking-service';
import { normalizeTimezone, parseInZoneToUTC, validateTimezone } from '../utils/timezone';
import { assertDentalAppointmentOwnedByContact } from './calendar-contact-privacy';

export type LocalDentalEligibility =
  | { ok: true; contactId: number }
  | { ok: false; code: 'NOT_A_PATIENT'; message: string };

export type LocalDentalSlotOffer = {
  date: string;
  timezone: string;
  durationMinutes: number;
  providerUserId: number;
  catalogItemId: string;
  catalogLabel: string;
  /** Display times HH:MM in company timezone */
  displayTimes: string[];
  /** ISO scheduledAt values matching displayTimes order */
  scheduledAts: string[];
  /** Preferred HH:MM from the patient/tool args when provided */
  preferredTime?: string | null;
  /** True when preferredTime was probed and is bookable right now */
  preferredAvailable?: boolean;
  /** Machine reason when preferredTime was requested but not bookable */
  preferredUnavailableReason?: string | null;
};

export type LocalDentalBookableDentist = {
  userId: number;
  displayName: string;
  specialtyIds: string[];
  specialtyLabels: string[];
  allowedChairIds: number[];
};

export {
  chooseLocalProviderCandidate,
  resolveLocalBookableDentistIds,
  resolveLocalSpecialtyEligibleDentistIds,
} from '@shared/types/dental-booking-types';

export function resolveLocalCatalogItem(
  policy: DentalBookingPolicy,
  args: Record<string, unknown>,
): DentalBookableCatalogItem {
  try {
    return resolveLocalCatalogItemShared(policy, args);
  } catch (error) {
    throw new ErpValidationError(error instanceof Error ? error.message : 'Invalid catalog item');
  }
}

async function resolveBookingTimezone(companyId: number, override?: string): Promise<string> {
  const normalizedOverride = normalizeTimezone(String(override || '').trim());
  if (normalizedOverride && validateTimezone(normalizedOverride)) return normalizedOverride;
  const setting = await storage.getCompanySetting(companyId, 'defaultTimezone');
  const raw = typeof setting?.value === 'string' ? setting.value : 'UTC';
  const normalized = normalizeTimezone(raw);
  return validateTimezone(normalized) ? normalized : 'UTC';
}

export async function ensureLocalDentalBookingEligibility(
  companyId: number,
  contactId: number,
): Promise<LocalDentalEligibility> {
  const existing = await storage.getDentalPatientByContactId(companyId, contactId);
  if (existing) {
    return { ok: true, contactId };
  }

  const policy = await getDentalBookingPolicy(companyId);
  if (policy.autoAddPatients) {
    await storage.ensureDentalPatientAutoCreated(companyId, contactId);
    const created = await storage.getDentalPatientByContactId(companyId, contactId);
    if (created) return { ok: true, contactId };
  }

  return {
    ok: false,
    code: 'NOT_A_PATIENT',
    message:
      'This contact is not registered as a dental patient. Please ask a staff member to add them as a patient before booking.',
  };
}

function formatEligibleDentistsMessage(
  dentists: Array<{ userId: number; displayName?: string }>,
): string {
  if (dentists.length === 0) {
    return 'No specialists are configured for this service specialty. Please update Specialists in Booking settings.';
  }
  return (
    'Please choose a specialist for this service:\n' +
    dentists
      .map((d) => `- ${d.displayName || `Dentist #${d.userId}`} (id ${d.userId})`)
      .join('\n')
  );
}

/**
 * Resolve a provider for AI booking using specialty eligibility.
 * Preferred provider is used only when specialty-eligible.
 * When multiple remain and none preferred / explicit, requires patient choice (throws).
 */
export async function resolveLocalProviderUserId(params: {
  companyId: number;
  nodeData: any;
  args: Record<string, unknown>;
  preferredUserId?: number | null;
  /** When omitted, catalog is resolved from args. */
  specialtyId?: string | null;
}): Promise<number> {
  const policy = await getDentalBookingPolicy(params.companyId);
  const specialtyId =
    params.specialtyId ??
    (() => {
      try {
        return resolveLocalCatalogItem(policy, params.args).specialtyId;
      } catch {
        return null;
      }
    })();

  const eligible = resolveLocalSpecialtyEligibleDentistIds(policy, params.nodeData, specialtyId);
  if (eligible.length === 0) {
    throw new ErpValidationError(
      specialtyId
        ? `No specialists are available for specialty "${resolveSpecialtyLabel(policy, specialtyId)}". Configure specialties and offices under Booking settings → Specialists.`
        : 'No bookable specialists are configured. Each specialist needs at least one specialty and one allowed office in Booking settings.',
    );
  }

  const fromArgs = Number(params.args.provider_user_id || params.args.providerUserId || params.args.dentist_user_id);
  if (Number.isFinite(fromArgs) && fromArgs > 0 && !eligible.includes(fromArgs)) {
      throw new ErpValidationError(
        'That dentist is not available for this service specialty. Ask the patient to choose from the eligible specialists.',
      );
  }
  const selected = chooseLocalProviderCandidate({
    eligible,
    explicitUserId: fromArgs,
    preferredUserId: params.preferredUserId,
    hideProviderDetails: params.nodeData?.localDentalProviderDetailsSharingEnabled === false,
  });
  if (selected != null) {
    return selected;
  }

  const users = await storage.getUsersByCompany(params.companyId);
  const named = eligible.map((userId) => {
    const user = users.find((u) => u.id === userId);
    return {
      userId,
      displayName: user?.fullName || user?.username || `Dentist #${userId}`,
    };
  });
  throw new ErpValidationError(formatEligibleDentistsMessage(named));
}

export async function localDentalCheckAvailability(params: {
  companyId: number;
  nodeData: any;
  args: Record<string, unknown>;
  preferredUserId?: number | null;
  timezone?: string;
}): Promise<LocalDentalSlotOffer> {
  const date = String(params.args.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ErpValidationError('date is required in YYYY-MM-DD format');
  }

  const policy = await getDentalBookingPolicy(params.companyId);
  const catalogItem = resolveLocalCatalogItem(policy, params.args);
  const providerUserId = await resolveLocalProviderUserId({
    ...params,
    specialtyId: catalogItem.specialtyId,
  });
  const timezone = await resolveBookingTimezone(params.companyId, params.timezone);

  const from = parseInZoneToUTC(`${date}T00:00:00`, timezone);
  const to = parseInZoneToUTC(`${date}T23:59:59`, timezone);

  const preferredRaw = String(params.args.start_time || params.args.startTime || params.args.time || '').trim();
  const preferredMatch = preferredRaw.match(/^(\d{1,2}):(\d{2})$/);
  const preferredTime = preferredMatch
    ? `${preferredMatch[1].padStart(2, '0')}:${preferredMatch[2]}`
    : null;

  const slots = await getDentalAvailableSlots(params.companyId, {
    providerUserId,
    catalogItemId: catalogItem.id,
    from: from.toISOString(),
    to: to.toISOString(),
    // AI booking must see the full day grid so morning/afternoon options are not truncated.
    limit: DENTAL_AVAILABILITY_MAX_LIMIT,
  });

  let displayTimes = slots.map((slot) => {
    const parts = getZonedDateTimeParts(new Date(slot.scheduledAt), timezone);
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  });
  let scheduledAts = slots.map((s) => s.scheduledAt);

  let preferredAvailable: boolean | undefined;
  let preferredUnavailableReason: string | null | undefined;

  if (preferredTime) {
    const probe = await probeDentalSlotAvailability({
      companyId: params.companyId,
      providerUserId,
      catalogItemId: catalogItem.id,
      date,
      time: preferredTime,
      interpretationTimezone: timezone,
    });
    preferredAvailable = probe.available;
    preferredUnavailableReason = probe.available ? null : probe.reason;

    // Never miss a bookable preferred time even if it fell outside a truncated list.
    if (probe.available && probe.displayTime && !displayTimes.includes(probe.displayTime)) {
      displayTimes = [probe.displayTime, ...displayTimes];
      scheduledAts = [probe.scheduledAt!, ...scheduledAts];
    }
  }

  return {
    date,
    timezone,
    durationMinutes: catalogItem.durationMinutes,
    providerUserId,
    catalogItemId: catalogItem.id,
    catalogLabel: catalogItem.label,
    displayTimes,
    scheduledAts,
    preferredTime,
    preferredAvailable,
    preferredUnavailableReason,
  };
}

export async function localDentalBookAppointment(params: {
  companyId: number;
  contactId: number;
  nodeData: any;
  args: Record<string, unknown>;
  preferredUserId?: number | null;
  createdBy?: number;
  timezone?: string;
}) {
  const eligibility = await ensureLocalDentalBookingEligibility(params.companyId, params.contactId);
  if (!eligibility.ok) {
    throw new ErpValidationError(eligibility.message);
  }

  const policy = await getDentalBookingPolicy(params.companyId);
  const catalogItem = resolveLocalCatalogItem(policy, params.args);
  const providerUserId = await resolveLocalProviderUserId({
    ...params,
    specialtyId: catalogItem.specialtyId,
  });
  const timezone = await resolveBookingTimezone(params.companyId, params.timezone);

  let startDateTime = String(
    params.args.start_datetime ||
      params.args.startDateTime ||
      params.args.start_time ||
      params.args.time ||
      '',
  ).trim();
  const date = String(params.args.date || '').trim();
  if (startDateTime && !startDateTime.includes('T') && date) {
    startDateTime = `${date}T${startDateTime}`;
  }
  if (!startDateTime) {
    throw new ErpValidationError('start_datetime is required to book an appointment');
  }

  const scheduledAt =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startDateTime) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(startDateTime)
      ? parseInZoneToUTC(startDateTime.length === 16 ? `${startDateTime}:00` : startDateTime, timezone)
      : new Date(startDateTime);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ErpValidationError('Invalid start_datetime');
  }

  const chairFromArgs = Number(params.args.chair_id || params.args.chairId);
  const chairId =
    Number.isFinite(chairFromArgs) && chairFromArgs > 0 ? chairFromArgs : undefined;

  return bookDentalAppointment(
    params.companyId,
    {
      contactId: params.contactId,
      providerUserId,
      scheduledAt: scheduledAt.toISOString(),
      catalogItemId: catalogItem.id,
      bookingSource: 'ai_local',
      chairId: chairId ?? null,
    },
    params.createdBy,
  );
}

export async function localDentalCancelAppointment(params: {
  companyId: number;
  appointmentId: number;
  contactId: number;
  capacityMode?: 'provider' | 'provider_and_chair';
}) {
  const existing = await storage.getDentalScheduleAppointment(params.companyId, params.appointmentId);
  if (!existing || !assertDentalAppointmentOwnedByContact(existing, params.contactId)) {
    throw new ErpValidationError('Appointment not found');
  }
  if (existing.status === 'cancelled') {
    return existing;
  }
  const policy = await getDentalBookingPolicy(params.companyId);
  return storage.updateDentalScheduleAppointment(
    params.companyId,
    params.appointmentId,
    { status: 'cancelled' },
    { capacityMode: params.capacityMode ?? policy.capacityMode },
  );
}

export async function localDentalRescheduleAppointment(params: {
  companyId: number;
  appointmentId: number;
  contactId: number;
  scheduledAt: unknown;
  timezone?: string;
}) {
  const existing = await storage.getDentalScheduleAppointment(params.companyId, params.appointmentId);
  if (!existing || !assertDentalAppointmentOwnedByContact(existing, params.contactId)) {
    throw new ErpValidationError('Appointment not found');
  }
  const rawScheduledAt = String(params.scheduledAt ?? '').trim();
  const timezone = await resolveBookingTimezone(params.companyId, params.timezone);
  const nextScheduledAt = params.scheduledAt instanceof Date
    ? params.scheduledAt
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawScheduledAt) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(rawScheduledAt)
      ? parseInZoneToUTC(rawScheduledAt, timezone)
      : new Date(rawScheduledAt);
  if (Number.isNaN(nextScheduledAt.getTime())) {
    throw new ErpValidationError('A valid scheduledAt value is required');
  }
  const policy = await getDentalBookingPolicy(params.companyId);
  return storage.updateDentalScheduleAppointment(
    params.companyId,
    params.appointmentId,
    { scheduledAt: nextScheduledAt },
    { capacityMode: policy.capacityMode },
  );
}

export async function listLocalDentalAppointmentsForContact(params: {
  companyId: number;
  contactId: number;
}): Promise<
  Array<{
    id: number;
    title: string;
    scheduledAt: string;
    durationMinutes: number | null;
    status: string;
    bookingServiceLabel: string | null;
  }>
> {
  const appointments = await storage.getContactAppointments(params.contactId);
  return appointments
    .filter((apt) => apt.companyId === params.companyId && apt.status !== 'cancelled')
    .map((apt) => ({
      id: apt.id,
      title: apt.title,
      scheduledAt:
        apt.scheduledAt instanceof Date
          ? apt.scheduledAt.toISOString()
          : String(apt.scheduledAt),
      durationMinutes: apt.durationMinutes ?? null,
      status: apt.status,
      bookingServiceLabel: apt.bookingServiceLabel ?? null,
    }));
}

export async function listLocalBookableDentists(
  companyId: number,
  nodeData: any,
  options?: { specialtyId?: string | null },
): Promise<LocalDentalBookableDentist[]> {
  const policy = await getDentalBookingPolicy(companyId);
  const ids = resolveLocalSpecialtyEligibleDentistIds(policy, nodeData, options?.specialtyId);
  const users = await storage.getUsersByCompany(companyId);
  return ids.map((userId) => {
    const user = users.find((u) => u.id === userId);
    const displayName = user?.fullName || user?.username || `Dentist #${userId}`;
    const profile = policy.specialistProfiles.find((entry) => entry.userId === userId);
    const specialtyIds = profile?.specialtyIds ?? [];
    return {
      userId,
      displayName,
      specialtyIds,
      specialtyLabels: specialtyIds.map((id) => resolveSpecialtyLabel(policy, id)),
      allowedChairIds: getSpecialistAllowedChairIds(policy, userId),
    };
  });
}

export async function listLocalBookableCatalog(companyId: number) {
  const policy = await getDentalBookingPolicy(companyId);
  return policy.bookableCatalog.filter((item) => item.isActive);
}
