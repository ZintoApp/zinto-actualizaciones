import type { Request, Response } from 'express';
import { PERMISSIONS } from '@shared/schema';
import { getUserPermissions } from '../../middleware';
import { storage } from '../../storage';
import { normalizeErpBusinessType, type ErpBusinessType } from '@shared/erp-capabilities';

export { normalizeErpBusinessType } from '@shared/erp-capabilities';
export type { ErpBusinessType } from '@shared/erp-capabilities';

export { ERP_BUSINESS_TYPE_SETTING_KEY } from '@shared/erp-capabilities';
import { ERP_BUSINESS_TYPE_SETTING_KEY } from '@shared/erp-capabilities';
export const ERP_DEMO_SEED_STANDARD_KEY = 'erpDemoSeed:standard:v1';
export const ERP_DEMO_SEED_RESTAURANT_FASTFOOD_KEY = 'erpDemoSeed:restaurant-fastfood:v1';
export const ERP_DEMO_SEED_DENTAL_KEY = 'erpDemoSeed:dental:v1';
export const DENTAL_TOOTH_NUMBERING_SETTING_KEY = 'dentalToothNumberingSystem';
export type DentalToothNumberingSystem = 'FDI' | 'UNIVERSAL' | 'PALMER';

export const normalizeDentalToothNumberingSystem = (value: unknown): DentalToothNumberingSystem => {
  if (value === 'UNIVERSAL' || value === 'PALMER') return value;
  return 'FDI';
};

export async function getCompanyErpBusinessType(companyId: number): Promise<ErpBusinessType> {
  const setting = await storage.getCompanySetting(companyId, ERP_BUSINESS_TYPE_SETTING_KEY);
  return normalizeErpBusinessType(setting?.value);
}

export async function ensureRestaurantBusinessType(req: Request, res: Response): Promise<number | undefined> {
  const companyId = req.user?.companyId;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'Company ID required' });
    return undefined;
  }
  const businessType = await getCompanyErpBusinessType(companyId);
  if (businessType !== 'restaurant') {
    res.status(403).json({ success: false, error: 'Restaurant ERP mode is not enabled for this company' });
    return undefined;
  }
  return companyId;
}

export async function ensureDentalBusinessType(req: Request, res: Response): Promise<number | undefined> {
  const companyId = req.user?.companyId;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'Company ID required' });
    return undefined;
  }
  const businessType = await getCompanyErpBusinessType(companyId);
  if (businessType !== 'dental') {
    res.status(403).json({ success: false, error: 'Dental ERP mode is not enabled for this company' });
    return undefined;
  }
  return companyId;
}

/** Gate shared contact-appointment routes when the company is in dental mode. */
export async function ensureDentalScheduleContactAccess(
  req: Request,
  res: Response,
  mode: 'view' | 'manage',
): Promise<boolean> {
  const companyId = req.user?.companyId;
  if (!companyId) return true;
  const businessType = await getCompanyErpBusinessType(companyId);
  if (businessType !== 'dental') return true;
  const user = req.user as { isSuperAdmin?: boolean } | undefined;
  if (user?.isSuperAdmin) return true;
  const permissions = await getUserPermissions(user as any);
  if (mode === 'manage') {
    if (permissions[PERMISSIONS.MANAGE_DENTAL_SCHEDULE] === true) return true;
  } else if (
    permissions[PERMISSIONS.VIEW_DENTAL_SCHEDULE] === true
    || permissions[PERMISSIONS.MANAGE_DENTAL_SCHEDULE] === true
  ) {
    return true;
  }
  res.status(403).json({
    error: mode === 'manage'
      ? 'manage_dental_schedule permission required'
      : 'view_dental_schedule permission required',
  });
  return false;
}
