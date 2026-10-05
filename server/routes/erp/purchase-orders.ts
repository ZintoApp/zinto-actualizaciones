import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import {
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  type InsertPurchaseOrder,
} from '@shared/schema';
import { assertVariantBelongsToProductAndCompany, ErpProductScopeError } from '../../erp-product-scoping';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_PO_READ_PERMISSIONS = ['view_purchase_orders', 'manage_purchase_orders'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
};

function assertStatusTransition(current: string, next: string): void {
  const allowed = STATUS_TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    throw new Error(`Invalid status transition from ${current} to ${next}`);
  }
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) {
    return sendValidationError(res, error);
  }
  if (error instanceof ErpProductScopeError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof Error) {
    const m = error.message;
    if (
      /^Invalid status transition/.test(m) ||
      /^Only draft purchase orders can be deleted/.test(m) ||
      /^Receipt line quantities/.test(m) ||
      /^Could not allocate receipt/.test(m) ||
      /^Receipt exceeds remaining/.test(m) ||
      /^Invalid purchase order line/.test(m) ||
      /^Goods receipts are only allowed/.test(m) ||
      /^Purchase order does not belong/.test(m) ||
      /^Warehouse is required/.test(m) ||
      /^Purchase order cannot/.test(m) ||
      /^Purchase orders with received quantities cannot be cancelled/.test(m) ||
      /^Line item not found/.test(m) ||
      /cannot be updated/.test(m) ||
      /does not belong/.test(m)
    ) {
      return res.status(400).json({ success: false, error: m });
    }
  }
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: getErrorMessage(error) });
}

function optionalQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function optionalQueryDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function coerceNumericFieldsForOrderBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['subtotal', 'taxAmount', 'totalAmount'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

function coerceNumericFieldsForPOLineItemBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['quantity', 'unitCost', 'lineTotal', 'receivedQty'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

function computePOLineTotalString(body: Record<string, unknown>): string {
  const qty = Number(body.quantity ?? 1);
  const cost = Number(body.unitCost ?? 0);
  return (qty * cost).toFixed(2);
}

const listPurchaseOrdersQuerySchema = z.object({
  supplierId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  status: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.preprocess(optionalQueryDate, z.date().optional()),
  dateTo: z.preprocess(optionalQueryDate, z.date().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createPurchaseOrderBodySchema = z.preprocess(
  coerceNumericFieldsForOrderBody,
  insertPurchaseOrderSchema
    .omit({ companyId: true, orderNumber: true, createdBy: true, status: true })
    .partial({
      supplierId: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      currency: true,
      expectedDeliveryDate: true,
      notes: true,
    })
    .strict()
);

const updatePurchaseOrderBodySchema = z.preprocess(
  coerceNumericFieldsForOrderBody,
  insertPurchaseOrderSchema.omit({ companyId: true, orderNumber: true, createdBy: true }).partial().strict()
);

const createPOLineItemBodySchema = z.preprocess((raw) => {
  const coerced = coerceNumericFieldsForPOLineItemBody(raw);
  if (coerced == null || typeof coerced !== 'object' || Array.isArray(coerced)) return coerced;
  const o = { ...(coerced as Record<string, unknown>) };
  if (o.lineTotal == null || o.lineTotal === '') {
    o.lineTotal = computePOLineTotalString(o);
  }
  return o;
}, insertPurchaseOrderItemSchema.omit({ purchaseOrderId: true, receivedQty: true }).strict());

const updatePOLineItemBodySchema = z.preprocess(
  coerceNumericFieldsForPOLineItemBody,
  insertPurchaseOrderItemSchema.omit({ purchaseOrderId: true, receivedQty: true }).partial().strict()
);

const goodsReceiptLineSchema = z.object({
  purchaseOrderItemId: z.number().int(),
  quantity: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

const createGoodsReceiptBodySchema = z
  .object({
    warehouseId: z.number().int(),
    receiptNumber: z.string().optional(),
    receivedDate: z.coerce.date().optional(),
    items: z.array(goodsReceiptLineSchema).min(1),
    notes: z.string().optional(),
  })
  .strict();

const postStatusBodySchema = z
  .object({
    status: z.enum(['draft', 'sent', 'confirmed', 'cancelled']),
  })
  .strict();

async function loadPurchaseOrderForCompany(id: number, companyId: number) {
  const order = await storage.getPurchaseOrder(id);
  if (!order || order.companyId !== companyId) return undefined;
  return order;
}

function assertPoLinesEditable(order: { status: string }): void {
  if (order.status !== 'draft' && order.status !== 'sent') {
    throw new Error('Purchase order lines cannot be updated in the current status');
  }
}

function assertPoHeaderEditable(order: { status: string }): void {
  if (order.status === 'cancelled' || order.status === 'received') {
    throw new Error('Purchase order cannot be updated in its current status');
  }
}

router.get('/', requireAnyPermission(ERP_PO_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listPurchaseOrdersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const result = await storage.getPurchaseOrders(companyId, parsed.data);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing purchase orders:');
  }
});

router.post('/', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createPurchaseOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    if (data.supplierId != null) {
      const supplier = await storage.getSupplier(data.supplierId);
      if (!supplier || supplier.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Supplier does not belong to this company' });
      }
    }
    const created = await storage.createPurchaseOrder({
      ...data,
      companyId,
      orderNumber: '',
      createdBy: req.user?.id ?? null,
      supplierId: data.supplierId ?? null,
      status: 'draft',
      subtotal: data.subtotal ?? '0',
      taxAmount: data.taxAmount ?? '0',
      totalAmount: data.totalAmount ?? '0',
      currency: data.currency ?? 'USD',
      expectedDeliveryDate: data.expectedDeliveryDate ?? null,
      notes: data.notes ?? null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating purchase order:');
  }
});

router.get('/:id/items', requireAnyPermission(ERP_PO_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    const items = await storage.getPurchaseOrderItems(id);
    return res.json({ success: true, data: items });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading purchase order items:');
  }
});

router.post('/:id/items', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    try {
      assertPoLinesEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error creating line item:');
    }
    const parsed = createPOLineItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.productId != null) {
      const product = await storage.getProduct(parsed.data.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
      if (parsed.data.variantId != null) {
        await assertVariantBelongsToProductAndCompany(
          parsed.data.variantId,
          parsed.data.productId,
          companyId
        );
      }
    }
    const item = await storage.createPurchaseOrderItem({
      ...parsed.data,
      purchaseOrderId: id,
      receivedQty: '0',
    });
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating line item:');
  }
});

router.put('/:id/items/:itemId', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(id) || Number.isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    try {
      assertPoLinesEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating line item:');
    }
    const existingItem = (await storage.getPurchaseOrderItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const parsed = updatePOLineItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const nextProductId = parsed.data.productId ?? existingItem.productId;
    if (parsed.data.productId != null) {
      const product = await storage.getProduct(parsed.data.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
    }
    if (parsed.data.variantId != null && nextProductId != null) {
      await assertVariantBelongsToProductAndCompany(parsed.data.variantId, nextProductId, companyId);
    }
    const next = { ...parsed.data };
    if (next.quantity != null || next.unitCost != null) {
      const qty = Number(next.quantity ?? existingItem.quantity);
      const cost = Number(next.unitCost ?? existingItem.unitCost);
      next.lineTotal = (qty * cost).toFixed(2);
    }
    const item = await storage.updatePurchaseOrderItem(itemId, next);
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating line item:');
  }
});

router.delete('/:id/items/:itemId', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(id) || Number.isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    try {
      assertPoLinesEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error deleting line item:');
    }
    const existingItem = (await storage.getPurchaseOrderItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const ok = await storage.deletePurchaseOrderItem(itemId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting line item:');
  }
});

router.get('/:id/receipts', requireAnyPermission(ERP_PO_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    const receipts = await storage.getGoodsReceipts(id);
    return res.json({ success: true, data: receipts });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing goods receipts:');
  }
});

router.post('/:id/receipts', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    if (order.status !== 'confirmed' && order.status !== 'partially_received') {
      return res.status(400).json({
        success: false,
        error: 'Goods receipts are only allowed when the purchase order is confirmed or partially received',
      });
    }
    const parsed = createGoodsReceiptBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const warehouse = await storage.getWarehouse(parsed.data.warehouseId);
    if (!warehouse || warehouse.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Warehouse does not belong to this company' });
    }

    const poItems = await storage.getPurchaseOrderItems(id);
    const poItemById = new Map(poItems.map((p) => [p.id, p]));
    const productIds = [...new Set(poItems.map((item) => item.productId).filter((id): id is number => id != null))];
    const variantIds = [...new Set(poItems.map((item) => item.variantId).filter((id): id is number => id != null))];
    const [products, variants] = await Promise.all([
      storage.getProductsByIds(companyId, productIds),
      storage.getProductVariantsByIds(companyId, variantIds),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const qtyByLineId = new Map<number, number>();
    for (const line of parsed.data.items) {
      const q = Number(line.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid receipt quantity' });
      }
      qtyByLineId.set(line.purchaseOrderItemId, (qtyByLineId.get(line.purchaseOrderItemId) ?? 0) + q);
    }
    for (const [purchaseOrderItemId, sumQ] of qtyByLineId) {
      const poItem = poItemById.get(purchaseOrderItemId);
      if (!poItem) {
        return res.status(400).json({ success: false, error: 'Line item not found on purchase order' });
      }
      if (poItem.productId == null) {
        return res.status(400).json({
          success: false,
          error: `Purchase order line ${purchaseOrderItemId} has no product`,
        });
      }
      const product = productById.get(poItem.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
      if (poItem.variantId != null) {
        const variant = variantById.get(poItem.variantId);
        if (!variant || variant.productId !== poItem.productId || variant.companyId !== companyId) {
          return res.status(400).json({ success: false, error: 'Variant does not belong to this product' });
        }
      }
      const remaining = Math.max(0, Number(poItem.quantity) - Number(poItem.receivedQty));
      if (sumQ > remaining + 1e-9) {
        return res.status(400).json({
          success: false,
          error: `Received quantity exceeds remaining for line ${purchaseOrderItemId}`,
        });
      }
    }

    const receipt = await storage.createGoodsReceipt({
      purchaseOrderId: id,
      companyId,
      warehouseId: parsed.data.warehouseId,
      receiptNumber: parsed.data.receiptNumber ?? null,
      receivedDate: parsed.data.receivedDate ?? null,
      items: parsed.data.items.map((i) => ({
        purchaseOrderItemId: i.purchaseOrderItemId,
        quantity: i.quantity,
      })),
      notes: parsed.data.notes ?? null,
      receivedBy: req.user?.id ?? null,
    });
    return res.json({ success: true, data: receipt });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating goods receipt:');
  }
});

router.post('/:id/status', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    const parsed = postStatusBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.status === 'cancelled') {
      const items = await storage.getPurchaseOrderItems(id);
      const hasReceivedQty = items.some((item) => Number(item.receivedQty) > 0);
      if (hasReceivedQty) {
        return res.status(400).json({
          success: false,
          error: 'Purchase orders with received quantities cannot be cancelled',
        });
      }
    }
    assertStatusTransition(order.status, parsed.data.status);
    const updated = await storage.updatePurchaseOrder(id, {
      status: parsed.data.status as InsertPurchaseOrder['status'],
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating purchase order status:');
  }
});

router.get('/:id', requireAnyPermission(ERP_PO_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    const supplier =
      order.supplierId != null ? await storage.getSupplier(order.supplierId) : undefined;
    const [items, receipts] = await Promise.all([
      storage.getPurchaseOrderItems(id),
      storage.getGoodsReceipts(id),
    ]);
    const productIds = [...new Set(items.map((item) => item.productId).filter((productId): productId is number => productId != null))];
    const variantIds = [...new Set(items.map((item) => item.variantId).filter((variantId): variantId is number => variantId != null))];
    const [products, variants] = await Promise.all([
      storage.getProductsByIds(companyId, productIds),
      storage.getProductVariantsByIds(companyId, variantIds),
    ]);
    const productNameById = new Map(products.map((product) => [product.id, product.name]));
    const variantNameById = new Map(variants.map((variant) => [variant.id, variant.name]));
    return res.json({
      success: true,
      data: {
        order,
        supplier: supplier && supplier.companyId === companyId ? supplier : null,
        items: items.map((item) => ({
          ...item,
          productName: item.productId != null ? (productNameById.get(item.productId) ?? null) : null,
          variantName: item.variantId != null ? (variantNameById.get(item.variantId) ?? null) : null,
        })),
        receipts,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading purchase order:');
  }
});

router.put('/:id', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    try {
      assertPoHeaderEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating purchase order:');
    }
    const parsed = updatePurchaseOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    if (data.supplierId !== undefined && data.supplierId != null) {
      const supplier = await storage.getSupplier(data.supplierId);
      if (!supplier || supplier.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Supplier does not belong to this company' });
      }
    }
    if (data.status != null && data.status !== order.status) {
      assertStatusTransition(order.status, data.status);
    }
    await storage.updatePurchaseOrder(id, data);
    await storage.recalculatePurchaseOrderTotals(id);
    const finalOrder = await storage.getPurchaseOrder(id);
    if (!finalOrder) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    return res.json({ success: true, data: finalOrder });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating purchase order:');
  }
});

router.delete('/:id', requireAnyPermission(['manage_purchase_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadPurchaseOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    const ok = await storage.deletePurchaseOrder(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting purchase order:');
  }
});

export default router;
