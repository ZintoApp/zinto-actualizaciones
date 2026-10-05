import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse } from '../../storage';
import { insertRestaurantKitchenTicketItemSchema, insertRestaurantKitchenTicketSchema } from '@shared/schema';
import { ensureRestaurantBusinessType } from './business-type';

const router = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const listSchema = z.object({
  status: z.string().optional(),
  stationId: z.coerce.number().int().optional(),
  orderContextId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});
const createTicketSchema = z.object({
  ticket: insertRestaurantKitchenTicketSchema.omit({ companyId: true }),
  items: z.array(insertRestaurantKitchenTicketItemSchema.omit({ companyId: true, ticketId: true })),
});

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Validation failed', details: error.flatten() });
  const mapped = getErpErrorResponse(error);
  if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.message });
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

router.get('/tickets', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const query = listSchema.parse(req.query);
    const data = await storage.getRestaurantKitchenTickets(companyId, query);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant kitchen tickets:');
  }
});

router.get('/stations/:id/tickets', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id: stationId } = idSchema.parse(req.params);
    const data = await storage.getRestaurantKitchenTicketsByStation(companyId, stationId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant kitchen tickets by station:');
  }
});

router.post('/tickets', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const parsed = createTicketSchema.parse(req.body);
    const orderContext = await storage.getRestaurantOrderContext(parsed.ticket.orderContextId);
    if (!orderContext || orderContext.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Restaurant order context not found' });
    }
    const data = await storage.createRestaurantKitchenTicketWithItems(
      { ...parsed.ticket, companyId, createdBy: parsed.ticket.createdBy ?? req.user?.id ?? null },
      parsed.items
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating restaurant kitchen ticket:');
  }
});

router.put('/tickets/:id', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const existing = await storage.getRestaurantKitchenTicket(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Kitchen ticket not found' });
    const updates = insertRestaurantKitchenTicketSchema.omit({ companyId: true }).partial().parse(req.body);
    const data = await storage.updateRestaurantKitchenTicket(id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating restaurant kitchen ticket:');
  }
});

router.post('/tickets/:id/complete', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const data = await storage.completeKitchenTicket(companyId, id, req.user?.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error completing restaurant kitchen ticket:');
  }
});

router.get('/tickets/:id/items', requireAnyPermission(['view_sales_orders', 'manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const ticket = await storage.getRestaurantKitchenTicket(id);
    if (!ticket || ticket.companyId !== companyId) return res.status(404).json({ success: false, error: 'Kitchen ticket not found' });
    const data = await storage.getRestaurantKitchenTicketItems(id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant kitchen ticket items:');
  }
});

router.put('/tickets/:id/items', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const items = z.array(insertRestaurantKitchenTicketItemSchema.omit({ companyId: true, ticketId: true })).parse(req.body?.items ?? []);
    const data = await storage.replaceRestaurantKitchenTicketItems(companyId, id, items);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error replacing restaurant kitchen ticket items:');
  }
});

export default router;
