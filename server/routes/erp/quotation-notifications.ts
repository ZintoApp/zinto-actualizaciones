import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse } from '../../storage';
import { getQuotationNotificationSettings } from '../../services/erp-quotation-notification-service';
import { ERP_QUOTATION_NOTIFICATIONS_KEY } from '@shared/erp-quotation-notification-defaults';
import { sendValidationError } from '../../utils/erp-zod-validation';

export const quotationNotificationSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    messageBody: z.string().trim().max(4000).optional(),
    emailSubject: z.string().trim().max(500).optional(),
  })
  .strict();

/** Admins (settings UI) and quotation senders (Send Quotation dialog). */
export const ERP_QUOTATION_NOTIFICATION_READ_PERMISSIONS = [
  'view_erp_settings',
  'manage_erp_settings',
  'view_sales_orders',
  'manage_sales_orders',
  'create_quotations',
];

const ERP_QUOTATION_NOTIFICATION_MANAGE_PERMISSIONS = ['manage_erp_settings'];

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) {
    return sendValidationError(res, error);
  }
  const mapped = getErpErrorResponse(error);
  if (mapped) {
    return res.status(mapped.status).json({ success: false, error: mapped.message });
  }
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: 'Unexpected server error' });
}

export async function handleGetQuotationNotificationSettings(req: Request, res: Response) {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await getQuotationNotificationSettings(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading quotation notification settings:');
  }
}

export async function handlePutQuotationNotificationSettings(req: Request, res: Response) {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = quotationNotificationSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const current = await getQuotationNotificationSettings(companyId);
    const merged = {
      enabled: parsed.data.enabled ?? current.enabled,
      messageBody: parsed.data.messageBody ?? current.messageBody,
      emailSubject: parsed.data.emailSubject ?? current.emailSubject,
    };
    await storage.saveCompanySetting(companyId, ERP_QUOTATION_NOTIFICATIONS_KEY, merged);
    const data = await getQuotationNotificationSettings(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error saving quotation notification settings:');
  }
}

const router = Router();

router.get(
  '/',
  requireAnyPermission(ERP_QUOTATION_NOTIFICATION_READ_PERMISSIONS),
  handleGetQuotationNotificationSettings,
);

router.put(
  '/',
  requireAnyPermission(ERP_QUOTATION_NOTIFICATION_MANAGE_PERMISSIONS),
  handlePutQuotationNotificationSettings,
);

export default router;
