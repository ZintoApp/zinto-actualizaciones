import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse } from '../../storage';
import { insertRestaurantDeliveryDispatchSchema } from '@shared/schema';
import { ensureRestaurantBusinessType } from './business-type';

const router = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const listSchema = z.object({
  status: z.string().optional(),
  assignedToUserId: z.coerce.number().int().optional(),
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
    const data = await storage.getRestaurantDeliveryDispatches(companyId, query);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant delivery dispatches:');
  }
});

router.get('/:id', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const data = await storage.getRestaurantDeliveryDispatch(id);
    if (!data || data.companyId !== companyId) return res.status(404).json({ success: false, error: 'Restaurant delivery dispatch not found' });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading restaurant delivery dispatch:');
  }
});

router.put('/sales-order/:id', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id: salesOrderId } = idSchema.parse(req.params);
    const context = await storage.getRestaurantOrderContextBySalesOrder(companyId, salesOrderId);
    if (!context) return res.status(404).json({ success: false, error: 'Restaurant order context for sales order not found' });
    const body = insertRestaurantDeliveryDispatchSchema.omit({ companyId: true, orderContextId: true }).partial().parse(req.body);
    const data = await storage.upsertRestaurantDeliveryDispatch(companyId, {
      orderContextId: context.id,
      ...body,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error upserting restaurant delivery dispatch:');
  }
});

export default router;
