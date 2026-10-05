import { storage } from '../storage';
import { getDentalBookingPolicy } from './dental-booking-policy-service';
import { getCompanyErpBusinessType } from '../routes/erp/business-type';

/**
 * Contact-ingress auto-add: when a dental company has autoAddPatients on,
 * ensure a dental patient profile exists for the new contact (marked autoCreated).
 */
export async function ensureDentalPatientAutoCreatedFromIngress(
  companyId: number,
  contactId: number,
): Promise<'created' | 'exists' | 'skipped'> {
  const businessType = await getCompanyErpBusinessType(companyId);
  if (businessType !== 'dental') return 'skipped';

  const policy = await getDentalBookingPolicy(companyId);
  if (!policy.autoAddPatients) return 'skipped';

  return storage.ensureDentalPatientAutoCreated(companyId, contactId);
}

export type DentalAutoAddPolicyTransitionResult = {
  backfilled: number;
  unlinked: number;
  keptWithHistory: number;
};

/**
 * Runs side effects when `autoAddPatients` flips:
 * - false → true: backfill eligible contacts as auto-created patients
 * - true → false: unlink auto-created patients that have no clinical history
 */
export async function applyDentalAutoAddPolicyChange(
  companyId: number,
  previousAutoAdd: boolean,
  nextAutoAdd: boolean,
): Promise<DentalAutoAddPolicyTransitionResult> {
  if (!previousAutoAdd && nextAutoAdd) {
    const { created } = await storage.backfillDentalAutoAddPatients(companyId);
    return { backfilled: created, unlinked: 0, keptWithHistory: 0 };
  }
  if (previousAutoAdd && !nextAutoAdd) {
    const { removed, kept } = await storage.unlinkEmptyAutoCreatedDentalPatients(companyId);
    return { backfilled: 0, unlinked: removed, keptWithHistory: kept };
  }
  return { backfilled: 0, unlinked: 0, keptWithHistory: 0 };
}
