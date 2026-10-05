import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse } from '../../storage';
import { insertRestaurantReservationSchema, insertRestaurantWaitlistEntrySchema } from '@shared/schema';
import { ensureRestaurantBusinessType } from './business-type';
import {
  createConflictSafeRestaurantReservation,
  updateConflictSafeRestaurantReservation,
} from '../../services/erp/restaurant-reservation-service';

const router = Router();

const listSchema = z.object({
  status: z.string().optional(),
  tableId: z.coerce.number().int().optional(),
  targetTableId: z.coerce.number().int().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Validation failed', details: error.flatten() });
  const mapped = getErpErrorResponse(error);
  if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.message });
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

router.get('/reservations', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const query = listSchema.parse(req.query);
    const data = await storage.getRestaurantReservations(companyId, query);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant reservations:');
  }
});

router.post('/reservations', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const body = insertRestaurantReservationSchema.omit({ companyId: true }).parse(req.body);
    const data = await createConflictSafeRestaurantReservation({ ...body, companyId, createdBy: body.createdBy ?? req.user?.id ?? null });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating restaurant reservation:');
  }
});

router.put('/reservations/:id', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const existing = await storage.getRestaurantReservation(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Reservation not found' });
    const updates = insertRestaurantReservationSchema.omit({ companyId: true }).partial().parse(req.body);
    const data = await updateConflictSafeRestaurantReservation(companyId, id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating restaurant reservation:');
  }
});

router.get('/waitlist', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const query = listSchema.parse(req.query);
    const data = await storage.getRestaurantWaitlistEntries(companyId, query);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant waitlist entries:');
  }
});

router.post('/waitlist', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const body = insertRestaurantWaitlistEntrySchema.omit({ companyId: true }).parse(req.body);
    const data = await storage.createRestaurantWaitlistEntry({ ...body, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating restaurant waitlist entry:');
  }
});

router.put('/waitlist/:id', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const existing = await storage.getRestaurantWaitlistEntry(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Waitlist entry not found' });
    const updates = insertRestaurantWaitlistEntrySchema.omit({ companyId: true }).partial().parse(req.body);
    const data = await storage.updateRestaurantWaitlistEntry(id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating restaurant waitlist entry:');
  }
});

export default router;
