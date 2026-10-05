import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse, ErpValidationError } from '../../storage';
import {
  insertRestaurantKitchenStationSchema,
  insertRestaurantSectionSchema,
  insertRestaurantTableQrTokenSchema,
  insertRestaurantTableSchema,
} from '@shared/schema';
import { ensureRestaurantBusinessType } from './business-type';
import { findRestaurantReservationAvailability } from '../../services/erp/restaurant-reservation-service';

const router = Router();

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: error.flatten() });
  }
  const mapped = getErpErrorResponse(error);
  if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.message });
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const bulkCreateTablesSchema = z.object({
  sectionId: z.coerce.number().int().positive().nullable().optional(),
  prefix: z.string().min(1),
  startNumber: z.coerce.number().int().positive(),
  count: z.coerce.number().int().positive().max(500),
  capacity: z.coerce.number().int().positive().default(1),
  sortOrderStart: z.coerce.number().int().default(0),
  isActive: z.boolean().optional().default(true),
  isReservable: z.boolean().optional().default(true),
});
const tableTokenBodySchema = insertRestaurantTableQrTokenSchema
  .pick({ token: true, isActive: true, expiresAt: true, lastUsedAt: true, createdBy: true })
  .partial({ isActive: true, expiresAt: true, lastUsedAt: true, createdBy: true });

const MIN_LAYOUT_SIZE = 56;
const MAX_LAYOUT_WIDTH = 320;
const MAX_LAYOUT_HEIGHT = 240;
const ALLOWED_SHAPES = new Set(['rectangle', 'square', 'circle']);
const ALLOWED_TYPES = new Set(['dining', 'bar', 'booth', 'vip', 'outdoor']);

function normalizeRotation(value: unknown): number {
  const rotation = Number(value ?? 0);
  const normalized = Math.round(rotation % 360);
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeLayoutFields<T extends Record<string, unknown>>(payload: T): T {
  const next: Record<string, unknown> = { ...payload };
  if (next.layoutWidth != null) next.layoutWidth = Math.max(MIN_LAYOUT_SIZE, Math.min(MAX_LAYOUT_WIDTH, Number(next.layoutWidth) || MIN_LAYOUT_SIZE));
  if (next.layoutHeight != null) next.layoutHeight = Math.max(MIN_LAYOUT_SIZE, Math.min(MAX_LAYOUT_HEIGHT, Number(next.layoutHeight) || MIN_LAYOUT_SIZE));
  if (next.rotation != null) next.rotation = normalizeRotation(next.rotation);
  if (next.tableShape != null && !ALLOWED_SHAPES.has(String(next.tableShape))) {
    throw new ErpValidationError('Invalid table shape');
  }
  if (next.tableType != null && !ALLOWED_TYPES.has(String(next.tableType))) {
    next.tableType = 'dining';
  }
  return next as T;
}

router.get('/sections', requireAnyPermission(['view_sales_orders', 'manage_sales_orders', 'view_erp_settings', 'manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const data = await storage.getRestaurantSections(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant sections:');
  }
});

router.post('/sections', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const body = insertRestaurantSectionSchema.omit({ companyId: true }).parse(req.body);
    const data = await storage.createRestaurantSection({ ...body, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating restaurant section:');
  }
});

router.put('/sections/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const existing = await storage.getRestaurantSection(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Section not found' });
    const updates = insertRestaurantSectionSchema.omit({ companyId: true }).partial().parse(req.body);
    const data = await storage.updateRestaurantSection(id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating restaurant section:');
  }
});

router.delete('/sections/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const ok = await storage.deleteRestaurantSection(companyId, id);
    return res.json({ success: true, data: ok });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting restaurant section:');
  }
});

router.get('/tables', requireAnyPermission(['view_sales_orders', 'manage_sales_orders', 'view_erp_settings', 'manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const data = await storage.getRestaurantTables(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant tables:');
  }
});

router.get('/tables/availability', requireAnyPermission(['view_sales_orders', 'manage_sales_orders', 'view_erp_settings', 'manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    if (req.query.reservationAt) {
      const data = await findRestaurantReservationAvailability({
        companyId,
        reservationAt: req.query.reservationAt,
        expectedDurationMinutes: req.query.durationMinutes,
        guestCount: req.query.guestCount,
      });
      return res.json({ success: true, data });
    }
    const data = await storage.getRestaurantTableAvailability(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading restaurant table availability:');
  }
});

router.post('/tables', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const body = normalizeLayoutFields(insertRestaurantTableSchema.omit({ companyId: true }).parse(req.body));
    const data = await storage.createRestaurantTable({ ...body, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating restaurant table:');
  }
});

router.post('/tables/bulk', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const body = bulkCreateTablesSchema.parse(req.body);
    const payloads = Array.from({ length: body.count }).map((_, index) => {
      const sequence = body.startNumber + index;
      const suffix = String(sequence);
      const col = index % 8;
      const row = Math.floor(index / 8);
      return {
        companyId,
        sectionId: body.sectionId ?? null,
        code: `${body.prefix}${suffix}`,
        label: `${body.prefix} ${suffix}`,
        capacity: body.capacity,
        posX: 24 + col * 128,
        posY: 24 + row * 88,
        layoutWidth: 100,
        layoutHeight: 64,
        rotation: 0,
        tableShape: 'rectangle',
        tableType: 'dining',
        sortOrder: body.sortOrderStart + index,
        isActive: body.isActive ?? true,
        isReservable: body.isReservable ?? true,
      };
    });
    const data = await storage.createRestaurantTablesBulk(companyId, payloads);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error bulk creating restaurant tables:');
  }
});

router.put('/tables/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const existing = await storage.getRestaurantTable(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Table not found' });
    const updates = normalizeLayoutFields(insertRestaurantTableSchema.omit({ companyId: true }).partial().parse(req.body));
    const data = await storage.updateRestaurantTable(id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating restaurant table:');
  }
});

router.delete('/tables/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const ok = await storage.deleteRestaurantTable(companyId, id);
    return res.json({ success: true, data: ok });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting restaurant table:');
  }
});

router.get('/kitchen-stations', requireAnyPermission(['view_sales_orders', 'manage_sales_orders', 'view_erp_settings', 'manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const data = await storage.getRestaurantKitchenStations(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing restaurant kitchen stations:');
  }
});

router.post('/kitchen-stations', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const body = insertRestaurantKitchenStationSchema.omit({ companyId: true }).parse(req.body);
    const data = await storage.createRestaurantKitchenStation({ ...body, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating restaurant kitchen station:');
  }
});

router.put('/kitchen-stations/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const existing = await storage.getRestaurantKitchenStation(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Kitchen station not found' });
    const updates = insertRestaurantKitchenStationSchema.omit({ companyId: true }).partial().parse(req.body);
    const data = await storage.updateRestaurantKitchenStation(id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating restaurant kitchen station:');
  }
});

router.delete('/kitchen-stations/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const ok = await storage.deleteRestaurantKitchenStation(companyId, id);
    return res.json({ success: true, data: ok });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting restaurant kitchen station:');
  }
});

router.get('/tables/:id/qr-token', requireAnyPermission(['view_sales_orders', 'manage_sales_orders', 'view_erp_settings', 'manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const data = await storage.getRestaurantTableQrTokenByTable(companyId, id);
    return res.json({ success: true, data: data ?? null });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading table QR token:');
  }
});

router.put('/tables/:id/qr-token', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const body = tableTokenBodySchema.parse(req.body);
    const data = await storage.createOrReplaceRestaurantTableQrToken(companyId, id, {
      token: body.token!,
      isActive: body.isActive ?? true,
      expiresAt: body.expiresAt ?? null,
      lastUsedAt: body.lastUsedAt ?? null,
      createdBy: body.createdBy ?? req.user?.id ?? null,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error replacing table QR token:');
  }
});

router.delete('/qr-tokens/:id', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const { id } = idSchema.parse(req.params);
    const data = await storage.deactivateRestaurantTableQrToken(companyId, id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error deactivating table QR token:');
  }
});

export default router;
