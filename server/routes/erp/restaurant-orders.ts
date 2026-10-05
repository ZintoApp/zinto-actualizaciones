import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse } from '../../storage';
import { insertRestaurantOrderContextSchema } from '@shared/schema';
import { ensureRestaurantBusinessType } from './business-type';

const router = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const listSchema = z.object({
  status: z.string().optional(),
  serviceType: z.string().optional(),
  tableId: z.coerce.number().int().optional(),
  salesOrderId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Validation failed', details: error.flatten() });
  const mapped = getErpErrorResponse(error);
  if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.message });
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

router.get('/', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const query = listSchema.parse(req.query);
    const data = await storage.getRestaurantOrderContexts(companyId, query);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant order contexts:');
  }
});

router.get('/:id', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const data = await storage.getRestaurantOrderContext(id);
    if (!data || data.companyId !== companyId) return res.status(404).json({ success: false, error: 'Restaurant order context not found' });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading restaurant order context:');
  }
});

router.put('/sales-order/:id', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id: salesOrderId } = idSchema.parse(req.params);
    const body = insertRestaurantOrderContextSchema
      .omit({ companyId: true, salesOrderId: true })
      .partial()
      .parse(req.body);
    const data = await storage.upsertRestaurantOrderContext(companyId, {
      salesOrderId,
      ...body,
      ...(body.createdBy === undefined ? { createdBy: req.user?.id ?? null } : {}),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error upserting restaurant order context:');
  }
});

export default router;
