export const DENTAL_CLINICAL_NOTE_TYPES = ['note', 'diagnosis', 'observation'] as const;
export type DentalClinicalNoteType = (typeof DENTAL_CLINICAL_NOTE_TYPES)[number];

export const DENTAL_CLINICAL_DOCUMENT_CATEGORIES = [
  'xray',
  'cbct',
  'intraoral',
  'consent',
  'clinical_report',
  'before_after',
] as const;
export type DentalClinicalDocumentCategory = (typeof DENTAL_CLINICAL_DOCUMENT_CATEGORIES)[number];

const CLINICAL_CATEGORY_SET = new Set<string>(DENTAL_CLINICAL_DOCUMENT_CATEGORIES);

export function isDentalClinicalDocumentCategory(value: unknown): value is DentalClinicalDocumentCategory {
  return typeof value === 'string' && CLINICAL_CATEGORY_SET.has(value);
}

export function normalizeDentalClinicalNoteType(value: unknown): DentalClinicalNoteType {
  if (value === 'diagnosis' || value === 'observation') return value;
  return 'note';
}

export const DENTAL_TREATMENT_PLAN_STATUSES = [
  'planned',
  'in_progress',
  'quoted',
  'approved',
  'invoiced',
  'completed',
  'cancelled',
] as const;
export type DentalTreatmentPlanStatus = (typeof DENTAL_TREATMENT_PLAN_STATUSES)[number];

/** Statuses editable via generic plan CRUD (billing statuses are action-only). */
export const DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type DentalTreatmentPlanClinicalStatus = (typeof DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES)[number];

export const DENTAL_TREATMENT_PROCEDURE_STATUSES = [
  'planned',
  'in_progress',
  'quoted',
  'invoiced',
  'completed',
  'cancelled',
] as const;
export type DentalTreatmentProcedureStatus = (typeof DENTAL_TREATMENT_PROCEDURE_STATUSES)[number];

/** Statuses editable via generic procedure CRUD while lines are unlocked. */
export const DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type DentalTreatmentProcedureClinicalStatus = (typeof DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES)[number];

export const DENTAL_PLAN_APPROVAL_DECISIONS = ['approved', 'rejected'] as const;
export type DentalPlanApprovalDecision = (typeof DENTAL_PLAN_APPROVAL_DECISIONS)[number];

const PLAN_STATUS_SET = new Set<string>(DENTAL_TREATMENT_PLAN_STATUSES);
const PROCEDURE_STATUS_SET = new Set<string>(DENTAL_TREATMENT_PROCEDURE_STATUSES);
const PLAN_CLINICAL_STATUS_SET = new Set<string>(DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES);
const PROCEDURE_CLINICAL_STATUS_SET = new Set<string>(DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES);

export function normalizeDentalTreatmentPlanStatus(value: unknown): DentalTreatmentPlanStatus {
  if (typeof value === 'string' && PLAN_STATUS_SET.has(value)) {
    return value as DentalTreatmentPlanStatus;
  }
  return 'planned';
}

export function normalizeDentalTreatmentPlanClinicalStatus(value: unknown): DentalTreatmentPlanClinicalStatus {
  if (typeof value === 'string' && PLAN_CLINICAL_STATUS_SET.has(value)) {
    return value as DentalTreatmentPlanClinicalStatus;
  }
  return 'planned';
}

export function normalizeDentalTreatmentProcedureStatus(value: unknown): DentalTreatmentProcedureStatus {
  if (typeof value === 'string' && PROCEDURE_STATUS_SET.has(value)) {
    return value as DentalTreatmentProcedureStatus;
  }
  return 'planned';
}

export function normalizeDentalTreatmentProcedureClinicalStatus(
  value: unknown,
): DentalTreatmentProcedureClinicalStatus {
  if (typeof value === 'string' && PROCEDURE_CLINICAL_STATUS_SET.has(value)) {
    return value as DentalTreatmentProcedureClinicalStatus;
  }
  return 'planned';
}

export function isDentalTreatmentPlanBillingLockedStatus(status: string): boolean {
  return status === 'quoted' || status === 'approved' || status === 'invoiced';
}

export function normalizeDentalPlanApprovalDecision(value: unknown): DentalPlanApprovalDecision {
  return value === 'rejected' ? 'rejected' : 'approved';
}
