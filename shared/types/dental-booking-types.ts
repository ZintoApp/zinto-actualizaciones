/**
 * Company-level dental booking policy: the single source of truth shared by the staff
 * schedule UI, the local booking provider and the AI assistant.
 *
 * Persisted as one JSON blob in `company_settings` under DENTAL_BOOKING_POLICY_SETTING_KEY.
 * Hours reuse the calendar `DaySchedule` / `TimeWindow` shapes so slot generation and break
 * handling stay identical to the Google-backed calendar path.
 */
import { z } from "zod";
import { dentalAutomaticRemindersSchema, defaultDentalAutomaticReminders } from './dental-reminder-types';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  type DaySchedule,
  type TimeWindow,
} from "./calendar-types";
import { getZonedDateTimeParts } from "../utils/agent-schedule";
import { getActiveBreaksForDay, parseTimeToMinutes, slotIntersectsAnyBreak } from "../utils/calendar-breaks";

export const DENTAL_BOOKING_POLICY_SETTING_KEY = 'dentalBookingPolicy';

export const DEFAULT_DENTAL_SLOT_STEP_MINUTES = 5;
export const dentalSlotStepMinutesSchema = z.number().int().min(5).max(60).multipleOf(5);

/* -------------------------------------------------------------------------- */
/* Appointment lifecycle vocabulary (mirrored by contact_appointments columns)  */
/* -------------------------------------------------------------------------- */

/** Statuses that existed before local dental booking; staff CRUD still owns these. */
export const CONTACT_APPOINTMENT_BASE_STATUSES = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
] as const;

/** Transient statuses introduced by the hold / request authority modes. */
export const DENTAL_BOOKING_APPOINTMENT_STATUSES = ['held', 'pending_request'] as const;

export const CONTACT_APPOINTMENT_STATUSES = [
  ...CONTACT_APPOINTMENT_BASE_STATUSES,
  ...DENTAL_BOOKING_APPOINTMENT_STATUSES,
] as const;

export type ContactAppointmentBaseStatus = (typeof CONTACT_APPOINTMENT_BASE_STATUSES)[number];
export type DentalBookingAppointmentStatus = (typeof DENTAL_BOOKING_APPOINTMENT_STATUSES)[number];
export type ContactAppointmentStatus = (typeof CONTACT_APPOINTMENT_STATUSES)[number];

/** Who created the appointment row. */
export const DENTAL_BOOKING_SOURCES = ['staff', 'ai_local'] as const;
export type DentalBookingSource = (typeof DENTAL_BOOKING_SOURCES)[number];
export const DEFAULT_DENTAL_BOOKING_SOURCE: DentalBookingSource = 'staff';

/** Staff-only exceptions that may be accepted with a reason and an audit record. */
export const DENTAL_SCHEDULE_OVERRIDE_KINDS = [
  'outside_working_hours',
  'provider_break',
  'past_time',
  'specialty_mismatch',
] as const;
export type DentalScheduleOverrideKind = (typeof DENTAL_SCHEDULE_OVERRIDE_KINDS)[number];

/* -------------------------------------------------------------------------- */
/* Policy vocabulary                                                           */
/* -------------------------------------------------------------------------- */

/** Which resources must be free for a slot to be bookable. */
export const DENTAL_CAPACITY_MODES = ['provider', 'provider_and_chair'] as const;
export type DentalCapacityMode = (typeof DENTAL_CAPACITY_MODES)[number];

/**
 * Default is provider-only: chairs are optional configuration, and requiring a free chair
 * on a clinic that never created one would make every slot unbookable.
 */
export const DEFAULT_DENTAL_CAPACITY_MODE: DentalCapacityMode = 'provider';

/** How much authority a booking request carries without staff involvement. */
export const DENTAL_AUTHORITY_MODES = ['instant', 'hold', 'request'] as const;
export type DentalAuthorityMode = (typeof DENTAL_AUTHORITY_MODES)[number];
export const DEFAULT_DENTAL_AUTHORITY_MODE: DentalAuthorityMode = 'instant';

export const DEFAULT_DENTAL_HOLD_TIMEOUT_MINUTES = 15;
export const DENTAL_HOLD_TIMEOUT_MIN_MINUTES = 1;
export const DENTAL_HOLD_TIMEOUT_MAX_MINUTES = 480;

export const DENTAL_CATALOG_MIN_DURATION_MINUTES = 5;
export const DENTAL_CATALOG_MAX_DURATION_MINUTES = 8 * 60;

/** Guardrails so a corrupt or hostile payload cannot blow up settings reads. */
export const DENTAL_POLICY_MAX_CATALOG_ITEMS = 200;
export const DENTAL_POLICY_MAX_ROSTER_ENTRIES = 200;
export const DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES = 50;
export const DENTAL_POLICY_MAX_SPECIALTIES_PER_PROFILE = 20;
export const DENTAL_POLICY_MAX_OFFICES_PER_PROFILE = 50;

/* -------------------------------------------------------------------------- */
/* Specialties                                                                 */
/* -------------------------------------------------------------------------- */

/** Built-in specialty ids shared across companies (AI matching keys). */
export const DENTAL_SYSTEM_SPECIALTY_IDS = [
  'general',
  'orthodontics',
  'endodontics',
  'oral_surgery',
  'periodontics',
  'pediatric',
  'prosthodontics',
] as const;

export type DentalSystemSpecialtyId = (typeof DENTAL_SYSTEM_SPECIALTY_IDS)[number];

export const DEFAULT_DENTAL_SPECIALTY_ID: DentalSystemSpecialtyId = 'general';

export const DENTAL_SYSTEM_SPECIALTIES: ReadonlyArray<{ id: DentalSystemSpecialtyId; label: string }> =
  [
    { id: 'general', label: 'General Dentistry' },
    { id: 'orthodontics', label: 'Orthodontics' },
    { id: 'endodontics', label: 'Endodontics' },
    { id: 'oral_surgery', label: 'Oral Surgery' },
    { id: 'periodontics', label: 'Periodontics' },
    { id: 'pediatric', label: 'Pediatric Dentistry' },
    { id: 'prosthodontics', label: 'Prosthodontics' },
  ];

export const dentalSpecialtyLabelOverridesSchema = z.record(
  z.enum(DENTAL_SYSTEM_SPECIALTY_IDS), z.string().trim().min(1).max(120),
);

const specialtyIdSchema = z.string().trim().min(1).max(64);

export const dentalCustomSpecialtySchema = z.object({
  id: specialtyIdSchema,
  label: z.string().trim().min(1).max(120),
});

export const dentalSpecialistProfileSchema = z.object({
  userId: z.number().int().positive(),
  specialtyIds: z
    .array(specialtyIdSchema)
    .max(DENTAL_POLICY_MAX_SPECIALTIES_PER_PROFILE)
    .default([]),
  allowedChairIds: z
    .array(z.number().int().positive())
    .max(DENTAL_POLICY_MAX_OFFICES_PER_PROFILE)
    .default([]),
});

export type DentalCustomSpecialty = z.infer<typeof dentalCustomSpecialtySchema>;
export type DentalSpecialistProfile = z.infer<typeof dentalSpecialistProfileSchema>;

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected time in HH:MM format');

export const dentalTimeWindowSchema = z.object({
  startTime: timeStringSchema,
  endTime: timeStringSchema,
});

export const dentalDayScheduleSchema = z.object({
  dayName: z.string().trim().min(1).max(32),
  dayIndex: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  breaks: z.array(dentalTimeWindowSchema).max(24).default([]),
});

/**
 * Seven day entries, Sunday-first and index-aligned — same invariant the calendar
 * advanced settings validator enforces.
 */
export const dentalWeeklyScheduleSchema = z
  .array(dentalDayScheduleSchema)
  .length(7)
  .refine((days) => days.every((day, index) => day.dayIndex === index), {
    message: 'weeklySchedule must contain day indices 0-6 in order',
  });

export const dentalBookableCatalogItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  durationMinutes: z
    .number()
    .int()
    .min(DENTAL_CATALOG_MIN_DURATION_MINUTES)
    .max(DENTAL_CATALOG_MAX_DURATION_MINUTES),
  /** Written to `contact_appointments.type` when this item is booked. */
  visitType: z.string().trim().min(1).max(64).optional(),
  /** Required specialty key (system or company custom). */
  specialtyId: specialtyIdSchema.default(DEFAULT_DENTAL_SPECIALTY_ID),
  isActive: z.boolean().default(true),
  /** Linked ERP product (type=service). Optional for legacy catalog rows. */
  productId: z.number().int().positive().optional(),
});

/** Providers absent from this list inherit `clinicHours`. */
export const dentalProviderHoursSchema = z.object({
  userId: z.number().int().positive(),
  weeklySchedule: dentalWeeklyScheduleSchema,
});

export type DentalTimeWindow = z.infer<typeof dentalTimeWindowSchema>;
export type DentalDaySchedule = z.infer<typeof dentalDayScheduleSchema>;
export type DentalBookableCatalogItem = z.infer<typeof dentalBookableCatalogItemSchema>;
export type DentalProviderHours = z.infer<typeof dentalProviderHoursSchema>;

export const dentalBookingPolicySchema = z
  .object({
    autoAddPatients: z.boolean().default(false),
    slotStepMinutes: dentalSlotStepMinutesSchema.default(DEFAULT_DENTAL_SLOT_STEP_MINUTES),
    automaticReminders: dentalAutomaticRemindersSchema.default(() => defaultDentalAutomaticReminders()),
    capacityMode: z.enum(DENTAL_CAPACITY_MODES).default(DEFAULT_DENTAL_CAPACITY_MODE),
    authorityMode: z.enum(DENTAL_AUTHORITY_MODES).default(DEFAULT_DENTAL_AUTHORITY_MODE),
    holdTimeoutMinutes: z
      .number()
      .int()
      .min(DENTAL_HOLD_TIMEOUT_MIN_MINUTES)
      .max(DENTAL_HOLD_TIMEOUT_MAX_MINUTES)
      .default(DEFAULT_DENTAL_HOLD_TIMEOUT_MINUTES),
    bookableCatalog: z
      .array(dentalBookableCatalogItemSchema)
      .max(DENTAL_POLICY_MAX_CATALOG_ITEMS)
      .default([]),
    bookableDentistUserIds: z
      .array(z.number().int().positive())
      .max(DENTAL_POLICY_MAX_ROSTER_ENTRIES)
      .default([]),
    specialtyLabelOverrides: dentalSpecialtyLabelOverridesSchema.default({}),
    customSpecialties: z
      .array(dentalCustomSpecialtySchema)
      .max(DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES)
      .default([]),
    specialistProfiles: z
      .array(dentalSpecialistProfileSchema)
      .max(DENTAL_POLICY_MAX_ROSTER_ENTRIES)
      .default([]),
    clinicHours: dentalWeeklyScheduleSchema.default(() => createDefaultClinicHours()),
    providerHours: z
      .array(dentalProviderHoursSchema)
      .max(DENTAL_POLICY_MAX_ROSTER_ENTRIES)
      .default([]),
  })
  .superRefine((policy, ctx) => {
    const catalogIds = new Set<string>();
    const knownSpecialtyIds = collectKnownSpecialtyIds(policy.customSpecialties);

    policy.customSpecialties.forEach((specialty, index) => {
      if ((DENTAL_SYSTEM_SPECIALTY_IDS as readonly string[]).includes(specialty.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customSpecialties', index, 'id'],
          message: `Custom specialty id "${specialty.id}" conflicts with a system specialty`,
        });
      }
    });

    const customIds = new Set<string>();
    policy.customSpecialties.forEach((specialty, index) => {
      if (customIds.has(specialty.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customSpecialties', index, 'id'],
          message: `Duplicate custom specialty id "${specialty.id}"`,
        });
      }
      customIds.add(specialty.id);
    });

    policy.bookableCatalog.forEach((item, index) => {
      if (catalogIds.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bookableCatalog', index, 'id'],
          message: `Duplicate catalog item id "${item.id}"`,
        });
      }
      catalogIds.add(item.id);

      if (!item.specialtyId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bookableCatalog', index, 'specialtyId'],
          message: 'Specialty is required for every bookable service',
        });
      } else if (!knownSpecialtyIds.has(item.specialtyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bookableCatalog', index, 'specialtyId'],
          message: `Unknown specialty "${item.specialtyId}"`,
        });
      }
    });

    const catalogProductIds = new Set<number>();
    policy.bookableCatalog.forEach((item, index) => {
      if (item.productId == null) return;
      if (catalogProductIds.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bookableCatalog', index, 'productId'],
          message: `Duplicate catalog productId ${item.productId}`,
        });
      }
      catalogProductIds.add(item.productId);
    });

    const providerIds = new Set<number>();
    policy.providerHours.forEach((entry, index) => {
      if (providerIds.has(entry.userId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['providerHours', index, 'userId'],
          message: `Duplicate providerHours entry for user ${entry.userId}`,
        });
      }
      providerIds.add(entry.userId);
    });

    const profileIds = new Set<number>();
    const roster = new Set(policy.bookableDentistUserIds);
    policy.specialistProfiles.forEach((profile, index) => {
      if (profileIds.has(profile.userId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['specialistProfiles', index, 'userId'],
          message: `Duplicate specialistProfiles entry for user ${profile.userId}`,
        });
      }
      profileIds.add(profile.userId);

      if (!roster.has(profile.userId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['specialistProfiles', index, 'userId'],
          message: `Specialist profile user ${profile.userId} is not on the bookable roster`,
        });
      }

      profile.specialtyIds.forEach((specialtyId, specialtyIndex) => {
        if (!knownSpecialtyIds.has(specialtyId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['specialistProfiles', index, 'specialtyIds', specialtyIndex],
            message: `Unknown specialty "${specialtyId}"`,
          });
        }
      });
    });
  });

export type DentalBookingPolicy = z.infer<typeof dentalBookingPolicySchema>;

export function collectKnownSpecialtyIds(
  customSpecialties: Array<{ id: string }> = [],
): Set<string> {
  return new Set<string>([
    ...DENTAL_SYSTEM_SPECIALTY_IDS,
    ...customSpecialties.map((specialty) => specialty.id),
  ]);
}

export function listResolvableSpecialties(
  policy: Pick<DentalBookingPolicy, 'customSpecialties'> & Partial<Pick<DentalBookingPolicy, 'specialtyLabelOverrides'>>,
): Array<{ id: string; label: string; source: 'system' | 'custom'; labelOverridden?: boolean }> {
  return [
    ...DENTAL_SYSTEM_SPECIALTIES.map((specialty) => ({
      id: specialty.id,
      label: policy.specialtyLabelOverrides?.[specialty.id] ?? specialty.label,
      source: 'system' as const,
      ...(policy.specialtyLabelOverrides?.[specialty.id] ? { labelOverridden: true } : {}),
    })),
    ...policy.customSpecialties.map((specialty) => ({
      id: specialty.id,
      label: specialty.label,
      source: 'custom' as const,
    })),
  ];
}

export function resolveSpecialtyLabel(
  policy: Pick<DentalBookingPolicy, 'customSpecialties'> & Partial<Pick<DentalBookingPolicy, 'specialtyLabelOverrides'>>,
  specialtyId: string,
): string {
  const system = DENTAL_SYSTEM_SPECIALTIES.find((entry) => entry.id === specialtyId);
  if (system) return policy.specialtyLabelOverrides?.[system.id] ?? system.label;
  const custom = policy.customSpecialties.find((entry) => entry.id === specialtyId);
  return custom?.label ?? specialtyId;
}

export type FormatProviderWithSpecialtiesOptions = {
  resolveLabel?: (specialtyId: string, fallbackLabel: string) => string;
  formatOne?: (name: string, specialty: string) => string;
  formatMore?: (name: string, specialty: string, extraCount: number) => string;
};

/**
 * Staff schedule label: name, or name plus the provider's first saved specialty
 * and a +N remainder when they have more than one.
 */
export function formatProviderWithSpecialties(
  name: string,
  userId: number | null | undefined,
  policy: (Pick<DentalBookingPolicy, 'specialistProfiles' | 'customSpecialties'> & Partial<Pick<DentalBookingPolicy, 'specialtyLabelOverrides'>>) | null | undefined,
  options?: FormatProviderWithSpecialtiesOptions,
): string {
  if (userId == null || !policy) return name;
  const profile = policy.specialistProfiles.find((entry) => entry.userId === userId);
  const specialtyIds = profile?.specialtyIds ?? [];
  if (specialtyIds.length === 0) return name;
  const fallbackLabel = resolveSpecialtyLabel(policy, specialtyIds[0]);
  const hasCustomName = Object.prototype.hasOwnProperty.call(policy.specialtyLabelOverrides ?? {}, specialtyIds[0]);
  const firstLabel = options?.resolveLabel && !hasCustomName
    ? options.resolveLabel(specialtyIds[0], fallbackLabel)
    : fallbackLabel;
  if (specialtyIds.length === 1) {
    return options?.formatOne
      ? options.formatOne(name, firstLabel)
      : `${name} — ${firstLabel}`;
  }
  const extraCount = specialtyIds.length - 1;
  return options?.formatMore
    ? options.formatMore(name, firstLabel, extraCount)
    : `${name} — ${firstLabel} +${extraCount}`;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                    */
/* -------------------------------------------------------------------------- */

export function createDefaultClinicHours(): DentalDaySchedule[] {
  return DEFAULT_WEEKLY_SCHEDULE.map((day) => ({
    dayName: day.dayName,
    dayIndex: day.dayIndex,
    enabled: day.enabled,
    startTime: day.startTime,
    endTime: day.endTime,
    breaks: (day.breaks ?? []).map((window) => ({ ...window })),
  }));
}

export function createDefaultDentalBookingPolicy(): DentalBookingPolicy {
  return {
    autoAddPatients: false,
    slotStepMinutes: DEFAULT_DENTAL_SLOT_STEP_MINUTES,
    automaticReminders: defaultDentalAutomaticReminders(),
    capacityMode: DEFAULT_DENTAL_CAPACITY_MODE,
    authorityMode: DEFAULT_DENTAL_AUTHORITY_MODE,
    holdTimeoutMinutes: DEFAULT_DENTAL_HOLD_TIMEOUT_MINUTES,
    bookableCatalog: [],
    bookableDentistUserIds: [],
    specialtyLabelOverrides: {},
    customSpecialties: [],
    specialistProfiles: [],
    clinicHours: createDefaultClinicHours(),
    providerHours: [],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * Frozen reference copy of the product defaults. Use `createDefaultDentalBookingPolicy()`
 * whenever you need an object you can mutate.
 */
export const DEFAULT_DENTAL_BOOKING_POLICY: Readonly<DentalBookingPolicy> = deepFreeze(
  createDefaultDentalBookingPolicy(),
);

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/** Strict validation for write paths (settings API). Returns the zod result as-is. */
export function validateDentalBookingPolicy(value: unknown) {
  return dentalBookingPolicySchema.safeParse(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseField<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  fallback: z.output<S>,
): z.output<S> {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

function parseValidEntries<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  limit: number,
): z.output<S>[] {
  if (!Array.isArray(value)) return [];
  const kept: z.output<S>[] = [];
  for (const entry of value) {
    if (kept.length >= limit) break;
    const result = schema.safeParse(entry);
    if (result.success) kept.push(result.data);
  }
  return kept;
}

/**
 * Lenient read used on every policy load: never throws, and salvages field by field so a
 * single malformed catalog entry cannot silently reset clinic hours or the roster.
 */
export function parseDentalBookingPolicy(value: unknown): DentalBookingPolicy {
  const strict = dentalBookingPolicySchema.safeParse(value ?? {});
  if (strict.success) return strict.data;

  const defaults = createDefaultDentalBookingPolicy();
  const source = isRecord(value) ? value : {};

  const catalog = parseValidEntries(
    dentalBookableCatalogItemSchema,
    source.bookableCatalog,
    DENTAL_POLICY_MAX_CATALOG_ITEMS,
  ).map((item) => ({
    ...item,
    specialtyId: item.specialtyId?.trim() ? item.specialtyId : DEFAULT_DENTAL_SPECIALTY_ID,
  }));
  const providerHours = parseValidEntries(
    dentalProviderHoursSchema,
    source.providerHours,
    DENTAL_POLICY_MAX_ROSTER_ENTRIES,
  );
  const customSpecialties = dedupeBy(
    parseValidEntries(
      dentalCustomSpecialtySchema,
      source.customSpecialties,
      DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES,
    ).filter((specialty) => !(DENTAL_SYSTEM_SPECIALTY_IDS as readonly string[]).includes(specialty.id)),
    (specialty) => specialty.id,
  );
  const knownSpecialtyIds = collectKnownSpecialtyIds(customSpecialties);
  const specialistProfiles = dedupeBy(
    parseValidEntries(
      dentalSpecialistProfileSchema,
      source.specialistProfiles,
      DENTAL_POLICY_MAX_ROSTER_ENTRIES,
    ).map((profile) => ({
      ...profile,
      specialtyIds: Array.from(
        new Set(profile.specialtyIds.filter((id) => knownSpecialtyIds.has(id))),
      ),
      allowedChairIds: Array.from(new Set(profile.allowedChairIds)),
    })),
    (profile) => profile.userId,
  );

  return {
    autoAddPatients: parseField(z.boolean(), source.autoAddPatients, defaults.autoAddPatients),
    slotStepMinutes: parseField(dentalSlotStepMinutesSchema, source.slotStepMinutes, defaults.slotStepMinutes),
    automaticReminders: parseField(dentalAutomaticRemindersSchema, source.automaticReminders, defaultDentalAutomaticReminders()),
    capacityMode: parseField(
      z.enum(DENTAL_CAPACITY_MODES),
      source.capacityMode,
      defaults.capacityMode,
    ),
    authorityMode: parseField(
      z.enum(DENTAL_AUTHORITY_MODES),
      source.authorityMode,
      defaults.authorityMode,
    ),
    holdTimeoutMinutes: parseField(
      z
        .number()
        .int()
        .min(DENTAL_HOLD_TIMEOUT_MIN_MINUTES)
        .max(DENTAL_HOLD_TIMEOUT_MAX_MINUTES),
      source.holdTimeoutMinutes,
      defaults.holdTimeoutMinutes,
    ),
    bookableCatalog: dedupeBy(catalog, (item) => item.id),
    bookableDentistUserIds: Array.from(
      new Set(
        parseValidEntries(
          z.number().int().positive(),
          source.bookableDentistUserIds,
          DENTAL_POLICY_MAX_ROSTER_ENTRIES,
        ),
      ),
    ),
    specialtyLabelOverrides: parseField(dentalSpecialtyLabelOverridesSchema, source.specialtyLabelOverrides, {}),
    customSpecialties,
    specialistProfiles,
    clinicHours: parseField(dentalWeeklyScheduleSchema, source.clinicHours, defaults.clinicHours),
    providerHours: dedupeBy(providerHours, (entry) => entry.userId),
  };
}

function dedupeBy<T, K>(entries: T[], keyOf: (entry: T) => K): T[] {
  const seen = new Set<K>();
  const kept: T[] = [];
  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }
  return kept;
}

/* -------------------------------------------------------------------------- */
/* Read helpers                                                                */
/* -------------------------------------------------------------------------- */

/** Provider-specific hours when configured, otherwise the clinic-wide schedule. */
export function resolveProviderDaySchedules(
  policy: DentalBookingPolicy,
  providerUserId: number,
): DaySchedule[] {
  const override = policy.providerHours.find((entry) => entry.userId === providerUserId);
  return override ? override.weeklySchedule : policy.clinicHours;
}

export function findBookableCatalogItem(
  policy: DentalBookingPolicy,
  catalogItemId: string,
): DentalBookableCatalogItem | undefined {
  return policy.bookableCatalog.find((item) => item.id === catalogItemId && item.isActive);
}

const DEFAULT_CATALOG_DURATION_FROM_PRODUCT_MINUTES = 30;

/**
 * Build catalog fields from an ERP service product.
 * Key uses SKU when unique in the catalog; otherwise `product-{id}`.
 */
export function catalogFieldsFromServiceProduct(
  product: {
    id: number;
    name: string;
    sku?: string | null;
    estimatedDurationMinutes?: number | null;
  },
  existingCatalog: Array<Pick<DentalBookableCatalogItem, 'id' | 'productId'>> = [],
  options?: { specialtyId?: string; visitType?: string; isActive?: boolean },
): DentalBookableCatalogItem {
  const takenIds = new Set(
    existingCatalog
      .filter((item) => item.productId !== product.id)
      .map((item) => item.id),
  );
  const sku = product.sku?.trim() ?? '';
  const id =
    sku.length > 0 && sku.length <= 64 && !takenIds.has(sku)
      ? sku
      : `product-${product.id}`;

  const rawDuration = product.estimatedDurationMinutes;
  let durationMinutes = DEFAULT_CATALOG_DURATION_FROM_PRODUCT_MINUTES;
  if (
    typeof rawDuration === 'number' &&
    Number.isInteger(rawDuration) &&
    rawDuration >= DENTAL_CATALOG_MIN_DURATION_MINUTES &&
    rawDuration <= DENTAL_CATALOG_MAX_DURATION_MINUTES
  ) {
    durationMinutes = rawDuration;
  }

  return {
    id,
    label: product.name.trim().slice(0, 120) || `Product ${product.id}`,
    durationMinutes,
    specialtyId: options?.specialtyId ?? DEFAULT_DENTAL_SPECIALTY_ID,
    visitType: options?.visitType,
    isActive: options?.isActive ?? true,
    productId: product.id,
  };
}

export function isBookableDentist(policy: DentalBookingPolicy, userId: number): boolean {
  return policy.bookableDentistUserIds.includes(userId);
}

export function findSpecialistProfile(
  policy: DentalBookingPolicy,
  userId: number,
): DentalSpecialistProfile | undefined {
  return policy.specialistProfiles.find((profile) => profile.userId === userId);
}

/** AI roster gate: on roster and profile has ≥1 specialty and ≥1 allowed office. */
export function isAiBookableSpecialist(policy: DentalBookingPolicy, userId: number): boolean {
  if (!isBookableDentist(policy, userId)) return false;
  const profile = findSpecialistProfile(policy, userId);
  return Boolean(
    profile && profile.specialtyIds.length > 0 && profile.allowedChairIds.length > 0,
  );
}

export function specialistMatchesSpecialty(
  policy: DentalBookingPolicy,
  userId: number,
  specialtyId: string,
): boolean {
  const profile = findSpecialistProfile(policy, userId);
  return Boolean(profile?.specialtyIds.includes(specialtyId));
}

export function getSpecialistAllowedChairIds(
  policy: DentalBookingPolicy,
  userId: number,
): number[] {
  const profile = findSpecialistProfile(policy, userId);
  return profile?.allowedChairIds ?? [];
}

/** Whether staff/AI assignment violates specialty or allowed-office rules. */
export function getSpecialistAssignmentViolations(
  policy: DentalBookingPolicy,
  params: {
    providerUserId: number | null | undefined;
    specialtyId?: string | null;
    chairId?: number | null;
  },
): string[] {
  const violations: string[] = [];
  const providerUserId = params.providerUserId;
  if (providerUserId == null || !Number.isFinite(providerUserId) || providerUserId <= 0) {
    return violations;
  }

  const profile = findSpecialistProfile(policy, providerUserId);
  if (!profile) {
    if (isBookableDentist(policy, providerUserId)) {
      violations.push('Specialist has no specialty/office profile configured');
    }
    return violations;
  }

  if (params.specialtyId && !profile.specialtyIds.includes(params.specialtyId)) {
    violations.push('Provider specialty does not match the selected service specialty');
  }

  if (
    params.chairId != null &&
    profile.allowedChairIds.length > 0 &&
    !profile.allowedChairIds.includes(params.chairId)
  ) {
    violations.push('Provider is not assigned to the selected office');
  }

  return violations;
}

export function filterAiEligibleDentistsForSpecialty(
  policy: DentalBookingPolicy,
  rosterUserIds: number[],
  specialtyId: string,
): number[] {
  return rosterUserIds.filter(
    (userId) =>
      isAiBookableSpecialist(policy, userId) &&
      specialistMatchesSpecialty(policy, userId, specialtyId),
  );
}

function normalizeBookableUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/** Intersect AI node roster constraints with the company bookable dentist list. */
export function resolveLocalBookableDentistIds(
  policy: DentalBookingPolicy,
  nodeData: { bookableAgentUserIds?: unknown; targetAgentUserId?: unknown },
): number[] {
  const policyIds = policy.bookableDentistUserIds.filter((id) => isBookableDentist(policy, id));
  const nodeIds = normalizeBookableUserIds(nodeData.bookableAgentUserIds);
  if (nodeIds.length > 0) {
    return nodeIds.filter((id) => policyIds.includes(id));
  }
  const target = Number(nodeData.targetAgentUserId);
  if (Number.isFinite(target) && target > 0 && policyIds.includes(target)) {
    return [target];
  }
  return policyIds;
}

/** Roster intersected with AI specialty/office gate (and optional specialty filter). */
export function resolveLocalSpecialtyEligibleDentistIds(
  policy: DentalBookingPolicy,
  nodeData: { bookableAgentUserIds?: unknown; targetAgentUserId?: unknown },
  specialtyId?: string | null,
): number[] {
  const roster = resolveLocalBookableDentistIds(policy, nodeData).filter((id) =>
    isAiBookableSpecialist(policy, id),
  );
  if (!specialtyId) return roster;
  return filterAiEligibleDentistsForSpecialty(policy, roster, specialtyId);
}

/** Resolve a provider without changing configured roster order. */
export function chooseLocalProviderCandidate(params: {
  eligible: number[];
  explicitUserId?: number | null;
  preferredUserId?: number | null;
  hideProviderDetails: boolean;
}): number | null {
  const explicit = Number(params.explicitUserId);
  if (Number.isFinite(explicit) && explicit > 0 && params.eligible.includes(explicit)) {
    return explicit;
  }
  if (params.hideProviderDetails) {
    return params.eligible[0] ?? null;
  }
  const preferred = Number(params.preferredUserId);
  if (Number.isFinite(preferred) && preferred > 0 && params.eligible.includes(preferred)) {
    return preferred;
  }
  return params.eligible.length === 1 ? params.eligible[0] : null;
}

export function resolveLocalCatalogItem(
  policy: DentalBookingPolicy,
  args: Record<string, unknown>,
): DentalBookableCatalogItem {
  const explicitIdRaw = args.catalog_item_id || args.catalogItemId || args.service_id || args.serviceId || '';
  const explicitId = String(explicitIdRaw).trim();
  let unresolvedExplicitId = false;
  if (explicitId) {
    const byCatalogId = findBookableCatalogItem(policy, explicitId);
    if (byCatalogId) {
      return byCatalogId;
    }
    const explicitAsNumber = Number(explicitId);
    if (Number.isFinite(explicitAsNumber) && explicitAsNumber > 0) {
      const byProductId = policy.bookableCatalog.find(
        (item) => item.isActive && Number(item.productId) === explicitAsNumber,
      );
      if (byProductId) {
        return byProductId;
      }
    }
    // Soft-ignore hallucinated/stale IDs so service_name / selection can still resolve.
    unresolvedExplicitId = true;
  }

  const serviceName = String(args.service_name || args.serviceName || args.title || '')
    .trim()
    .toLowerCase();
  if (serviceName) {
    const byName = policy.bookableCatalog.find(
      (item) => item.isActive && item.label.trim().toLowerCase() === serviceName,
    );
    if (byName) return byName;

    const partialMatches = policy.bookableCatalog.filter((item) => {
      if (!item.isActive) return false;
      const label = item.label.trim().toLowerCase();
      return label.includes(serviceName) || serviceName.includes(label);
    });
    if (partialMatches.length === 1) return partialMatches[0];
    if (partialMatches.length > 1) {
      throw new Error(
        `Ambiguous service "${serviceName}". Matches: ${partialMatches.map((item) => item.label).join(', ')}`,
      );
    }
    throw new Error(`Unknown service "${serviceName}"`);
  }

  const duration = Number(args.duration_minutes || args.duration);
  if (Number.isFinite(duration) && duration > 0) {
    const byDuration = policy.bookableCatalog.filter(
      (item) => item.isActive && item.durationMinutes === duration,
    );
    if (byDuration.length === 1) return byDuration[0];
  }

  if (unresolvedExplicitId) {
    throw new Error('Unknown or inactive catalog item');
  }

  const first = policy.bookableCatalog.find((item) => item.isActive);
  if (!first) {
    throw new Error('No bookable services are configured in dental booking settings');
  }
  return first;
}

/** Break windows for a given day index, defaulting to none. */
export function getDayBreaks(schedules: DaySchedule[], dayIndex: number): TimeWindow[] {
  return schedules.find((day) => day.dayIndex === dayIndex)?.breaks ?? [];
}

/* -------------------------------------------------------------------------- */
/* Booking engine vocabulary (T3+)                                             */
/* -------------------------------------------------------------------------- */

/** Statuses that reserve operatory capacity when active (see `isDentalBookingBlocking`). */
export const DENTAL_BOOKING_BLOCKING_STATUSES = [
  'scheduled',
  'confirmed',
  'held',
  'pending_request',
] as const;

export type DentalBookingBlockingStatus = (typeof DENTAL_BOOKING_BLOCKING_STATUSES)[number];

export const DEFAULT_DENTAL_AVAILABILITY_LIMIT = 20;
export const DENTAL_AVAILABILITY_MAX_LIMIT = 50;

export type DentalAvailableSlot = {
  scheduledAt: string;
  durationMinutes: number;
  providerUserId: number;
  chairId: number | null;
};

export type DentalBookAppointmentInput = {
  contactId: number;
  providerUserId: number;
  scheduledAt: string;
  catalogItemId: string;
  bookingSource: DentalBookingSource;
  chairId?: number | null;
};

export function appointmentEndsAt(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(scheduledAt.getTime() + durationMinutes * 60_000);
}

export function appointmentsOverlap(
  aStart: Date,
  aDurationMinutes: number,
  bStart: Date,
  bDurationMinutes: number,
): boolean {
  const aEnd = appointmentEndsAt(aStart, aDurationMinutes);
  const bEnd = appointmentEndsAt(bStart, bDurationMinutes);
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/** Patient duplication intentionally compares starts only; provider/office use interval overlap. */
export function appointmentStartsAtSameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/** Whether an appointment row currently blocks bookable capacity. */
export function isDentalBookingBlocking(
  status: string,
  holdExpiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status === 'held') {
    if (!holdExpiresAt) return true;
    const expires = holdExpiresAt instanceof Date ? holdExpiresAt : new Date(holdExpiresAt);
    return !Number.isNaN(expires.getTime()) && expires.getTime() > now.getTime();
  }
  return (DENTAL_BOOKING_BLOCKING_STATUSES as readonly string[]).includes(status);
}

export const DENTAL_AWAITING_STAFF_STATUSES = ['held', 'pending_request'] as const;
export type DentalAwaitingStaffStatus = (typeof DENTAL_AWAITING_STAFF_STATUSES)[number];

export function isDentalBookingAwaitingStaff(status: string): status is DentalAwaitingStaffStatus {
  return (DENTAL_AWAITING_STAFF_STATUSES as readonly string[]).includes(status);
}

export function isDentalBookingHoldActive(
  holdExpiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!holdExpiresAt) return true;
  const expires = holdExpiresAt instanceof Date ? holdExpiresAt : new Date(holdExpiresAt);
  return !Number.isNaN(expires.getTime()) && expires.getTime() > now.getTime();
}

export type DentalPendingBookingQuery = {
  providerUserId?: number;
  from?: string;
  to?: string;
  status?: DentalAwaitingStaffStatus | 'all';
};

/** True when `scheduledAt` falls on the provider-relative grid used by availability. */
export function isDentalSlotGridAligned(
  scheduledAt: Date,
  timezone: string,
  workStartMinutes: number,
  stepMinutes: number = DEFAULT_DENTAL_SLOT_STEP_MINUTES,
): boolean {
  if (scheduledAt.getUTCSeconds() !== 0 || scheduledAt.getUTCMilliseconds() !== 0) return false;
  const parts = getZonedDateTimeParts(scheduledAt, timezone);
  const offset = parts.timeMinutes - workStartMinutes;
  return offset >= 0 && offset % stepMinutes === 0;
}

export function getProviderWorkStartMinutes(
  schedules: DaySchedule[],
  dayIndex: number,
): number | null {
  const day = schedules.find((entry) => entry.dayIndex === dayIndex);
  if (!day?.enabled) return null;
  return parseTimeToMinutes(day.startTime);
}

export function getDentalHoursViolation(
  schedules: DaySchedule[],
  scheduledAt: Date,
  timezone: string,
  durationMinutes: number,
): Extract<DentalScheduleOverrideKind, 'outside_working_hours' | 'provider_break'> | null {
  const parts = getZonedDateTimeParts(scheduledAt, timezone);
  const day = schedules.find((entry) => entry.dayIndex === parts.dayIndex);
  if (!day?.enabled) return 'outside_working_hours';
  const workStart = parseTimeToMinutes(day.startTime);
  const workEnd = parseTimeToMinutes(day.endTime);
  const slotEnd = parts.timeMinutes + durationMinutes;
  if (
    workStart == null ||
    workEnd == null ||
    workEnd <= workStart ||
    parts.timeMinutes < workStart ||
    slotEnd > workEnd
  ) {
    return 'outside_working_hours';
  }
  return slotIntersectsAnyBreak(parts.timeMinutes, slotEnd, getActiveBreaksForDay(day))
    ? 'provider_break'
    : null;
}
