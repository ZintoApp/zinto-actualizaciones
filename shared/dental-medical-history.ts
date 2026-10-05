import { z } from 'zod';

export const DENTAL_CONDITION_KEYS = [
  'diabetes',
  'hypertension',
  'heartDisease',
  'bleedingDisorder',
  'pregnancy',
  'majorSurgeryHospitalization',
] as const;

export const DENTAL_CONDITION_STATUSES = ['yes', 'no', 'unknown', 'declined'] as const;
export const DENTAL_PREGNANCY_STATUSES = [...DENTAL_CONDITION_STATUSES, 'not_applicable'] as const;
export const DENTAL_SMOKING_STATUSES = ['never', 'former', 'current', 'unknown', 'declined'] as const;
export const DENTAL_INFECTIOUS_TEST_TYPES = ['hiv', 'hepatitis_b', 'hepatitis_c'] as const;
export const DENTAL_INFECTIOUS_TEST_STATUSES = ['positive', 'negative', 'unknown', 'declined'] as const;

export type DentalConditionKey = (typeof DENTAL_CONDITION_KEYS)[number];
export type DentalConditionStatus = (typeof DENTAL_CONDITION_STATUSES)[number];
export type DentalPregnancyStatus = (typeof DENTAL_PREGNANCY_STATUSES)[number];
export type DentalSmokingStatus = (typeof DENTAL_SMOKING_STATUSES)[number];
export type DentalInfectiousTestType = (typeof DENTAL_INFECTIOUS_TEST_TYPES)[number];
export type DentalInfectiousTestStatus = (typeof DENTAL_INFECTIOUS_TEST_STATUSES)[number];

const conditionAnswerSchema = z.object({
  status: z.enum(DENTAL_CONDITION_STATUSES),
  details: z.string().trim().max(2000).default(''),
});

const pregnancyAnswerSchema = z.object({
  status: z.enum(DENTAL_PREGNANCY_STATUSES),
  details: z.string().trim().max(2000).default(''),
});

export const dentalMedicalHistoryDetailsSchema = z.object({
  version: z.literal(1),
  conditions: z.object({
    diabetes: conditionAnswerSchema,
    hypertension: conditionAnswerSchema,
    heartDisease: conditionAnswerSchema,
    bleedingDisorder: conditionAnswerSchema,
    pregnancy: pregnancyAnswerSchema,
    majorSurgeryHospitalization: conditionAnswerSchema,
  }),
  smoking: z.object({
    status: z.enum(DENTAL_SMOKING_STATUSES),
    details: z.string().trim().max(2000).default(''),
  }),
});

export type DentalMedicalHistoryDetails = z.infer<typeof dentalMedicalHistoryDetailsSchema>;

export function defaultDentalMedicalHistoryDetails(): DentalMedicalHistoryDetails {
  return {
    version: 1,
    conditions: {
      diabetes: { status: 'unknown', details: '' },
      hypertension: { status: 'unknown', details: '' },
      heartDisease: { status: 'unknown', details: '' },
      bleedingDisorder: { status: 'unknown', details: '' },
      pregnancy: { status: 'unknown', details: '' },
      majorSurgeryHospitalization: { status: 'unknown', details: '' },
    },
    smoking: { status: 'unknown', details: '' },
  };
}

export function normalizeDentalMedicalHistoryDetails(value: unknown): DentalMedicalHistoryDetails {
  const parsed = dentalMedicalHistoryDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultDentalMedicalHistoryDetails();
}

export type AdultBloodPressureCategory = 'normal' | 'elevated' | 'stage_1' | 'stage_2' | 'crisis';

export function classifyAdultBloodPressure(systolic: number, diastolic: number): AdultBloodPressureCategory {
  if (systolic > 180 || diastolic > 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90) return 'stage_2';
  if (systolic >= 130 || diastolic >= 80) return 'stage_1';
  if (systolic >= 120 && diastolic < 80) return 'elevated';
  return 'normal';
}

export const dentalPatientVitalInputSchema = z.object({
  systolic: z.coerce.number().int().min(40).max(300),
  diastolic: z.coerce.number().int().min(20).max(200),
  pulse: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().int().min(20).max(250).nullable(),
  ).optional(),
  temperatureCelsius: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().min(30).max(45).nullable(),
  ).optional(),
  respiratoryRate: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().int().min(4).max(80).nullable(),
  ).optional(),
  oxygenSaturation: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().int().min(50).max(100).nullable(),
  ).optional(),
  weightKg: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().min(1).max(500).nullable(),
  ).optional(),
  heightCm: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().min(30).max(250).nullable(),
  ).optional(),
  painScore: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().int().min(0).max(10).nullable(),
  ).optional(),
  recordedAt: z.coerce.date(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();

export const dentalPatientInfectiousTestInputSchema = z.object({
  testType: z.enum(DENTAL_INFECTIOUS_TEST_TYPES),
  status: z.enum(DENTAL_INFECTIOUS_TEST_STATUSES),
  testDate: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.string().date().nullable(),
  ).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();
