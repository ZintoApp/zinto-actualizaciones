import path from 'path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, getErpErrorResponse } from '../../storage';
import {
  channelTypes,
  deliveryNoteItemsSchema,
  insertSalesOrderSchema,
  insertSalesOrderItemSchema,
  insertDeliveryNoteSchema,
  insertRestaurantOrderContextSchema,
  type DeliveryNoteItem,
  type InsertSalesOrder,
} from '@shared/schema';
import { assertVariantBelongsToProductAndCompany, ErpProductScopeError } from '../../erp-product-scoping';
import {
  getOrderNotificationSettings,
  notifyOrderStatusChange,
  ORDER_NOTIFICATION_MESSAGE_STATUSES,
  ERP_SALES_ORDER_STATUS_NOTIFICATIONS_KEY,
  type OrderNotificationMessageStatus,
} from '../../services/erp-order-notification-service';
import { notifyOrderPlacedInvoiceDelivery } from '../../services/erp-invoice-notification-service';
import { sendValidationError } from '../../utils/erp-zod-validation';
import {
  FALLBACK_POS_QUICK_MODIFIERS,
  derivePosObservationUnitPriceFromModifiers,
  type PosQuickModifierOption,
} from '../../lib/pos-observation-modifiers';
import { generateQuotationPdf } from '../../services/erp-quotation-pdf-service';
import { sendQuotationViaChannel } from '../../services/erp-quotation-notification-service';
import {
  handleGetQuotationNotificationSettings,
  handlePutQuotationNotificationSettings,
  ERP_QUOTATION_NOTIFICATION_READ_PERMISSIONS,
} from './quotation-notifications';
import { quotationSendFailureHttpStatus } from '@shared/erp-quotation-send-errors';

const router = Router();

const ERP_SALES_ORDER_READ_PERMISSIONS = [
  'view_sales_orders',
  'manage_sales_orders',
  'create_quotations',
];

/** Full sales-order management or quotation-only workflows (lines, header, confirm, cancel). */
const ERP_SALES_ORDER_MANAGE_OR_QUOTE = ['manage_sales_orders', 'create_quotations'];

const ERP_SALES_ORDER_DELETE_PERMISSIONS = ['manage_sales_orders', 'delete_sales_orders'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['quotation', 'confirmed'],
  quotation: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

const KANBAN_STATUSES = [
  'draft',
  'quotation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;

const SALES_ORDER_KANBAN_LABELS_SETTING_KEY = 'erp_sales_order_kanban_labels';

const ERP_ORDER_STATUS_NOTIFICATION_READ_PERMISSIONS = [
  'view_erp_settings',
  'manage_erp_settings',
];

const orderStatusNotificationsPutSchema = z
  .object({
    enabled: z.boolean(),
    messages: z
      .object(
        Object.fromEntries(
          ORDER_NOTIFICATION_MESSAGE_STATUSES.map((s) => [s, z.string().max(1000)])
        ) as Record<OrderNotificationMessageStatus, z.ZodString>
      )
      .strict(),
  })
  .strict();

const sendQuotationBodySchema = z
  .object({
    connectionId: z.number().int().positive().optional(),
    channelType: channelTypes.optional(),
    messageBody: z.string().trim().max(4000).optional(),
    emailSubject: z.string().trim().max(500).optional(),
  })
  .strict();

const kanbanLabelsSchema = z.object(
  Object.fromEntries(
    KANBAN_STATUSES.map((status) => [status, z.string().trim().max(60).optional()])
  ) as Record<(typeof KANBAN_STATUSES)[number], z.ZodOptional<z.ZodString>>
).partial().strict();

function normalizeKanbanLabels(value: unknown): Partial<Record<(typeof KANBAN_STATUSES)[number], string>> {
  const raw = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      })()
    : value;
  const parsed = kanbanLabelsSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  if (!parsed.success) return {};

  return Object.fromEntries(
    Object.entries(parsed.data)
      .map(([key, label]) => [key, typeof label === 'string' ? label.trim() : ''])
      .filter(([, label]) => label)
  );
}

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
  const mapped = getErpErrorResponse(error);
  if (mapped) {
    return res.status(mapped.status).json({ success: false, error: mapped.message });
  }
  if (error instanceof ErpProductScopeError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof Error) {
    const m = error.message;
    if (
      /^Invalid status transition/.test(m) ||
      /^Only draft or quotation/.test(m) ||
      /^Insufficient stock/.test(m) ||
      /No default warehouse/.test(m) ||
      /^Invalid quantity/.test(m) ||
      /cannot be updated/.test(m) ||
      /^Only notes, assigned user/.test(m) ||
      /cannot be deleted/.test(m) ||
      /cannot be cancelled/.test(m) ||
      /must contain at least one line item/.test(m) ||
      /^Delivery notes are only allowed/.test(m) ||
      /^Delivery note status/.test(m) ||
      /^Pending delivery notes/.test(m) ||
      /^Shipped delivery notes/.test(m) ||
      /^Delivered delivery notes/.test(m) ||
      /^Delivery note item/.test(m) ||
      /^Order is already cancelled/.test(m) ||
      /^Line item not found/.test(m) ||
      /^Delivery note not found/.test(m) ||
      /^Restaurant table does not belong/.test(m) ||
      /^Reservation does not belong/.test(m) ||
      /^QR token does not belong/.test(m) ||
      /^Warehouse does not belong/.test(m) ||
      /not a restaurant POS order/i.test(m) ||
      /Restaurant order context cannot be updated/i.test(m) ||
      /Order cannot be updated after checkout/i.test(m)
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
  for (const key of ['subtotal', 'taxAmount', 'discountAmount', 'totalAmount'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

/** JSON request bodies send ISO strings; drizzle-zod insert schemas expect Date for timestamps. */
function coerceValidUntilInOrderBody(o: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(o, 'validUntil')) return;
  const vu = o.validUntil;
  if (vu == null || vu instanceof Date) return;
  if (typeof vu === 'string' && vu.trim()) {
    const d = new Date(vu);
    if (!Number.isNaN(d.getTime())) o.validUntil = d;
  }
}

function coerceNumericFieldsForLineItemBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['quantity', 'unitPrice', 'discountPercent', 'taxRate', 'lineTotal'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

function computeLineTotalString(body: Record<string, unknown>): string {
  const qty = Number(body.quantity ?? 1);
  const price = Number(body.unitPrice ?? 0);
  const base = qty * price;
  const discPct = Number(body.discountPercent ?? 0);
  const lineDisc = base * (discPct / 100);
  const taxable = base - lineDisc;
  return taxable.toFixed(2);
}

const listSalesOrdersQuerySchema = z.object({
  status: z.string().optional(),
  contactId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  dealId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  assignedToUserId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  search: z.string().optional(),
  dateFrom: z.preprocess(optionalQueryDate, z.date().optional()),
  dateTo: z.preprocess(optionalQueryDate, z.date().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createLineItemBodySchema = z.preprocess((raw) => {
  const coerced = coerceNumericFieldsForLineItemBody(raw);
  if (coerced == null || typeof coerced !== 'object' || Array.isArray(coerced)) return coerced;
  const o = { ...(coerced as Record<string, unknown>) };
  if (o.lineTotal == null || o.lineTotal === '') {
    o.lineTotal = computeLineTotalString(o);
  }
  return o;
}, insertSalesOrderItemSchema
  .omit({ salesOrderId: true })
  .extend({
    modifierSelections: z.array(z.unknown()).optional(),
    specialInstructions: z.string().nullable().optional(),
  })
  .strict());

const updateLineItemBodySchema = z.preprocess(
  coerceNumericFieldsForLineItemBody,
  insertSalesOrderItemSchema
    .omit({ salesOrderId: true })
    .partial()
    .extend({
      modifierSelections: z.array(z.unknown()).optional(),
      specialInstructions: z.string().nullable().optional(),
    })
    .strict()
);

const ACTIVE_RESTAURANT_POS_CONTEXT_STATUSES = new Set([
  'open',
  'submitted',
  'in_preparation',
  'ready',
]);

const posObservationUpdateBodySchema = z
  .object({
    specialInstructions: z.string().nullable().optional(),
  })
  .strict();

function resolvePosQuickModifiersForProduct(
  productId: number,
  rawModifiers: unknown[] | null | undefined,
): PosQuickModifierOption[] {
  const productOptions = modifiersToPosQuickOptions(productId, rawModifiers);
  return productOptions.length > 0 ? productOptions : FALLBACK_POS_QUICK_MODIFIERS;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeLabelSlug(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

function derivePosGroupId(productId: number, groupIndex: number, explicitId?: string) {
  return explicitId ?? `pos-grp-${productId}-${groupIndex}`;
}

function derivePosOptionId(
  productId: number,
  groupIndex: number,
  optionIndex: number,
  label: string,
  explicitId?: string,
) {
  return explicitId ?? `pos-opt-${productId}-${groupIndex}-${optionIndex}-${normalizeLabelSlug(label)}`;
}

function modifiersToPosQuickOptions(
  productId: number,
  rawModifiers: unknown[] | null | undefined,
): PosQuickModifierOption[] {
  if (!Array.isArray(rawModifiers)) return [];

  const result: PosQuickModifierOption[] = [];

  for (let groupIndex = 0; groupIndex < rawModifiers.length; groupIndex += 1) {
    const entry = rawModifiers[groupIndex];
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const groupName = typeof source.name === 'string' ? source.name.trim() : '';
    const optionsRaw = Array.isArray(source.options) ? source.options : [];
    const explicitGroupId = typeof source.id === 'string' ? source.id : undefined;

    const parsedOptions: Array<{
      label: string;
      priceDelta: number;
      optionIndex: number;
      explicitId?: string;
    }> = [];

    for (let optionIndex = 0; optionIndex < optionsRaw.length; optionIndex += 1) {
      const option = optionsRaw[optionIndex];
      const opt = option && typeof option === 'object' ? (option as Record<string, unknown>) : {};
      const label = typeof opt.label === 'string' ? opt.label.trim() : '';
      if (!label) continue;
      parsedOptions.push({
        label,
        priceDelta: toFiniteNumber(opt.priceDelta, 0),
        optionIndex,
        explicitId: typeof opt.id === 'string' ? opt.id : undefined,
      });
    }

    if (!groupName && parsedOptions.length === 0) continue;

    const groupId = derivePosGroupId(productId, groupIndex, explicitGroupId);

    for (const option of parsedOptions) {
      const optionId = derivePosOptionId(
        productId,
        groupIndex,
        option.optionIndex,
        option.label,
        option.explicitId,
      );
      result.push({
        key: `${groupId}:${optionId}`,
        label: option.label,
        priceDelta: option.priceDelta,
      });
    }
  }

  return result;
}

const restaurantContextSchema = insertRestaurantOrderContextSchema
  .omit({ companyId: true, salesOrderId: true })
  .partial({
    serviceType: true,
    tableId: true,
    reservationId: true,
    qrTokenId: true,
    warehouseId: true,
    guestCount: true,
    notes: true,
    assignedToUserId: true,
    status: true,
    createdBy: true,
  })
  .extend({
    serviceType: z.enum(['dine_in', 'takeaway', 'delivery']).optional(),
  })
  .omit({ status: true, createdBy: true })
  .strict();

const createSalesOrderBodySchema = z.preprocess((raw) => {
  const coerced = coerceNumericFieldsForOrderBody(raw);
  if (coerced == null || typeof coerced !== 'object' || Array.isArray(coerced)) return coerced;
  const next = { ...(coerced as Record<string, unknown>) };
  if (next.initialLine != null && typeof next.initialLine === 'object' && !Array.isArray(next.initialLine)) {
    const line = { ...(coerceNumericFieldsForLineItemBody(next.initialLine) as Record<string, unknown>) };
    if (line.lineTotal == null || line.lineTotal === '') {
      line.lineTotal = computeLineTotalString(line);
    }
    next.initialLine = line;
  }
  coerceValidUntilInOrderBody(next);
  return next;
},
insertSalesOrderSchema
  .omit({ companyId: true, orderNumber: true, createdBy: true, source: true, flowId: true, channelConnectionId: true })
  .partial({
    subtotal: true,
    taxAmount: true,
    discountAmount: true,
    totalAmount: true,
    status: true,
    currency: true,
    notes: true,
    contactId: true,
    dealId: true,
    assignedToUserId: true,
    validUntil: true,
    shippingAddress: true,
    billingAddress: true,
  })
  .extend({
    initialLine: createLineItemBodySchema.optional(),
    lineItems: z.array(createLineItemBodySchema).optional(),
    restaurantContext: restaurantContextSchema.optional(),
  })
  .strict());

const updateSalesOrderBodySchema = z.preprocess(
  (raw) => {
    const coerced = coerceNumericFieldsForOrderBody(raw);
    if (coerced == null || typeof coerced !== 'object' || Array.isArray(coerced)) return coerced;
    const o = { ...(coerced as Record<string, unknown>) };
    coerceValidUntilInOrderBody(o);
    return o;
  },
  insertSalesOrderSchema
    .omit({ companyId: true, orderNumber: true, createdBy: true, source: true, flowId: true, channelConnectionId: true })
    .partial()
    .strict()
);

const createDeliveryNoteBodySchema = insertDeliveryNoteSchema
  .omit({ salesOrderId: true, companyId: true, createdBy: true })
  .strict();

const updateDeliveryNoteBodySchema = insertDeliveryNoteSchema
  .omit({ salesOrderId: true, companyId: true, createdBy: true })
  .partial()
  .strict();

async function loadOrderForCompany(id: number, companyId: number) {
  const order = await storage.getSalesOrder(id);
  if (!order || order.companyId !== companyId) return undefined;
  return order;
}

const ACTIVE_HEADER_ONLY_STATUSES = new Set(['confirmed', 'processing', 'shipped']);
const ACTIVE_HEADER_FIELDS = new Set([
  'notes',
  'assignedToUserId',
  'validUntil',
  'shippingAddress',
  'billingAddress',
]);

function assertOrderLinesEditable(order: { status: string }): void {
  if (order.status !== 'draft' && order.status !== 'quotation') {
    throw new Error('Order cannot be updated in its current status');
  }
}

function areFieldValuesEqual(currentValue: unknown, nextValue: unknown): boolean {
  if (currentValue instanceof Date && nextValue instanceof Date) {
    return currentValue.getTime() === nextValue.getTime();
  }
  return JSON.stringify(currentValue) === JSON.stringify(nextValue);
}

function assertOrderHeaderEditable(
  order: Record<string, unknown> & { status: string },
  updates: Record<string, unknown>
): void {
  if (order.status === 'delivered' || order.status === 'cancelled' || order.status === 'returned') {
    throw new Error('Order cannot be updated in its current status');
  }
  if (!ACTIVE_HEADER_ONLY_STATUSES.has(order.status)) {
    return;
  }
  const disallowedFields = Object.entries(updates)
    .filter(([key, value]) => value !== undefined && !areFieldValuesEqual(order[key], value))
    .map(([key]) => key)
    .filter((key) => !ACTIVE_HEADER_FIELDS.has(key));
  if (disallowedFields.length > 0) {
    throw new Error(
      'Only notes, assigned user, valid-until, shipping address, and billing address can be updated after confirmation'
    );
  }
}

async function assertSalesOrderHasLineItems(orderId: number, actionLabel: string) {
  const items = await storage.getSalesOrderItems(orderId);
  if (items.length === 0) {
    throw new Error(`Sales order must contain at least one line item before ${actionLabel}`);
  }
  return items;
}

function validateDeliveryNoteLifecycle(
  orderStatus: string,
  note: { status: string; shippedAt?: Date | null; deliveredAt?: Date | null }
): void {
  const requiredStatusByOrderStatus: Record<string, 'pending' | 'shipped' | 'delivered'> = {
    processing: 'pending',
    shipped: 'shipped',
    delivered: 'delivered',
  };
  const requiredStatus = requiredStatusByOrderStatus[orderStatus];
  if (!requiredStatus) {
    throw new Error('Delivery notes are only allowed once a sales order enters fulfillment');
  }
  if (note.status !== requiredStatus) {
    throw new Error(`Delivery note status ${note.status} is not valid while the sales order is ${orderStatus}`);
  }
  if (note.status === 'pending') {
    if (note.shippedAt != null || note.deliveredAt != null) {
      throw new Error('Pending delivery notes cannot include shipped or delivered timestamps');
    }
    return;
  }
  if (note.status === 'shipped') {
    if (note.shippedAt == null) {
      throw new Error('Shipped delivery notes require shippedAt');
    }
    if (note.deliveredAt != null) {
      throw new Error('Shipped delivery notes cannot include deliveredAt');
    }
    return;
  }
  if (note.shippedAt == null || note.deliveredAt == null) {
    throw new Error('Delivered delivery notes require both shippedAt and deliveredAt');
  }
  if (note.deliveredAt.getTime() < note.shippedAt.getTime()) {
    throw new Error('Delivered delivery notes must have deliveredAt on or after shippedAt');
  }
}

function assertDeliveryNoteItemsBelongToOrder(
  orderItems: Array<{ id: number }>,
  noteItems: DeliveryNoteItem[]
): void {
  const allowedIds = new Set(orderItems.map((item) => item.id));
  for (const noteItem of noteItems) {
    if (!allowedIds.has(noteItem.salesOrderItemId)) {
      throw new Error(`Delivery note item ${noteItem.salesOrderItemId} does not belong to this sales order`);
    }
  }
}

function resolveCreateSalesOrderStatus(
  req: Request,
  rawStatus: string | undefined
): { status: string } | { error: string } {
  const user = req.user as { isSuperAdmin?: boolean } | undefined;
  const perms = (req as Request & { userPermissions?: Record<string, boolean> }).userPermissions;
  const isSuper = !!user?.isSuperAdmin;
  const canManage = isSuper || !!perms?.manage_sales_orders;
  const onlyQuotationCreator = !canManage && !!perms?.create_quotations;
  if (onlyQuotationCreator) {
    const requested = rawStatus ?? 'quotation';
    if (requested !== 'draft' && requested !== 'quotation') {
      return {
        error: 'Quotation users may only create sales orders with status draft or quotation.',
      };
    }
    return { status: requested };
  }
  return { status: rawStatus ?? 'draft' };
}

router.get('/', requireAnyPermission(ERP_SALES_ORDER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listSalesOrdersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const result = await storage.getSalesOrders(companyId, parsed.data);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing sales orders:');
  }
});

router.get('/kanban-labels', requireAnyPermission(ERP_SALES_ORDER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const setting = await storage.getCompanySetting(companyId, SALES_ORDER_KANBAN_LABELS_SETTING_KEY);
    return res.json({ success: true, data: normalizeKanbanLabels(setting?.value) });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading sales order Kanban labels:');
  }
});

router.put('/kanban-labels', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = kanbanLabelsSchema.safeParse(req.body?.labels ?? {});
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const labels = normalizeKanbanLabels(parsed.data);
    await storage.saveCompanySetting(companyId, SALES_ORDER_KANBAN_LABELS_SETTING_KEY, labels);
    return res.json({ success: true, data: labels });
  } catch (error) {
    return handleRouteError(res, error, 'Error saving sales order Kanban labels:');
  }
});

router.get(
  '/status-notifications',
  requireAnyPermission(ERP_ORDER_STATUS_NOTIFICATION_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await getOrderNotificationSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading order status notifications:');
    }
  }
);

router.put(
  '/status-notifications',
  requireAnyPermission(['manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = orderStatusNotificationsPutSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      await storage.saveCompanySetting(companyId, ERP_SALES_ORDER_STATUS_NOTIFICATIONS_KEY, parsed.data);
      const data = await getOrderNotificationSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving order status notifications:');
    }
  }
);

router.get(
  '/quotation-notification-settings',
  requireAnyPermission(ERP_QUOTATION_NOTIFICATION_READ_PERMISSIONS),
  handleGetQuotationNotificationSettings,
);

router.put(
  '/quotation-notification-settings',
  requireAnyPermission(['manage_erp_settings']),
  handlePutQuotationNotificationSettings,
);

router.post(
  '/',
  requireAnyPermission(['manage_sales_orders', 'create_quotations']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = createSalesOrderBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      const data = parsed.data;
      if (data.contactId != null) {
        const contact = await storage.getContact(data.contactId);
        if (!contact || contact.companyId !== companyId) {
          return res.status(400).json({ success: false, error: 'Contact does not belong to this company' });
        }
      }
      if (data.dealId != null) {
        const deal = await storage.getDeal(data.dealId);
        if (!deal || deal.companyId !== companyId) {
          return res.status(400).json({ success: false, error: 'Deal does not belong to this company' });
        }
      }
      const statusResolved = resolveCreateSalesOrderStatus(req, data.status);
      if ('error' in statusResolved) {
        return res.status(400).json({ success: false, error: statusResolved.error });
      }
      const { initialLine, lineItems: lineItemsBody, restaurantContext, ...orderData } = data;
      const lineItems =
        lineItemsBody && lineItemsBody.length > 0
          ? lineItemsBody
          : initialLine
            ? [initialLine]
            : [];
      for (const line of lineItems) {
        if (line.productId == null) continue;
        const product = await storage.getProduct(line.productId);
        if (!product || product.companyId !== companyId) {
          return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
        }
        if (line.variantId != null) {
          await assertVariantBelongsToProductAndCompany(line.variantId, line.productId, companyId);
        }
      }
      if (restaurantContext) {
        const created = await storage.createRestaurantSalesOrderWithContext({
          order: {
            ...orderData,
            companyId,
            orderNumber: '',
            createdBy: req.user?.id ?? null,
            subtotal: orderData.subtotal ?? '0',
            taxAmount: orderData.taxAmount ?? '0',
            discountAmount: orderData.discountAmount ?? '0',
            totalAmount: orderData.totalAmount ?? '0',
            status: statusResolved.status as InsertSalesOrder['status'],
            currency: orderData.currency ?? 'USD',
            contactId: orderData.contactId ?? null,
            dealId: orderData.dealId ?? null,
            notes: orderData.notes ?? null,
            assignedToUserId: orderData.assignedToUserId ?? null,
            validUntil: orderData.validUntil ?? null,
            shippingAddress: orderData.shippingAddress ?? undefined,
            billingAddress: orderData.billingAddress ?? undefined,
            source: 'restaurant_qr',
            flowId: null,
            channelConnectionId: null,
          },
          lineItems,
          restaurantContext: {
            ...restaurantContext,
            createdBy: req.user?.id ?? null,
          },
        });
        const persistedItems = await storage.getSalesOrderItems(created.order.id);
        return res.json({
          success: true,
          data: created.order,
          items: persistedItems,
          restaurantContext: created.restaurantContext,
        });
      }

      const created = await storage.createSalesOrderWithLineItems({
        ...orderData,
        companyId,
        orderNumber: '',
        createdBy: req.user?.id ?? null,
        subtotal: orderData.subtotal ?? '0',
        taxAmount: orderData.taxAmount ?? '0',
        discountAmount: orderData.discountAmount ?? '0',
        totalAmount: orderData.totalAmount ?? '0',
        status: statusResolved.status as InsertSalesOrder['status'],
        currency: orderData.currency ?? 'USD',
        contactId: orderData.contactId ?? null,
        dealId: orderData.dealId ?? null,
        notes: orderData.notes ?? null,
        assignedToUserId: orderData.assignedToUserId ?? null,
        validUntil: orderData.validUntil ?? null,
        shippingAddress: orderData.shippingAddress ?? undefined,
        billingAddress: orderData.billingAddress ?? undefined,
        source: 'manual',
        flowId: null,
        channelConnectionId: null,
      }, lineItems);
      const persistedItems = await storage.getSalesOrderItems(created.id);
      return res.json({ success: true, data: created, items: persistedItems });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating sales order:');
    }
  }
);

router.get('/:id/items', requireAnyPermission(ERP_SALES_ORDER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    const items = await storage.getSalesOrderItems(id);
    return res.json({ success: true, data: items });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading line items:');
  }
});

router.get(
  '/:id/quotation-pdf',
  requireAnyPermission(ERP_SALES_ORDER_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }
      const order = await loadOrderForCompany(id, companyId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      const typeRaw = String(req.query.templateType ?? 'a4').toLowerCase();
      const templateType = typeRaw === 'thermal' ? 'thermal' : 'a4';
      const download =
        req.query.download === '1' ||
        req.query.download === 'true' ||
        String(req.query.download).toLowerCase() === 'yes';
      const accept = String(req.headers.accept ?? '');
      const wantsJson =
        accept.includes('application/json') ||
        String(req.query.format ?? '').toLowerCase() === 'json';

      const result = await generateQuotationPdf(id, companyId, templateType, {
        language: req.user?.languagePreference ?? 'en',
      });

      if (wantsJson) {
        return res.json({
          success: true,
          data: {
            pdfUrl: result.pdfUrl,
            fileName: result.fileName,
            templateType: result.templateType,
          },
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${download ? 'attachment' : 'inline'}; filename="${result.fileName.replace(/"/g, '')}"`
      );
      return res.sendFile(path.resolve(result.filePath));
    } catch (error) {
      return handleRouteError(res, error, 'Error generating quotation PDF:');
    }
  }
);

router.post(
  '/:id/send-quotation',
  requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }
      const order = await loadOrderForCompany(id, companyId);
      if (!order) {
        return res.status(404).json({ success: false, errorCode: 'sales_order_not_found' });
      }

      const parsed = sendQuotationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      if (parsed.data.connectionId != null) {
        const conn = await storage.getChannelConnection(parsed.data.connectionId);
        if (!conn || conn.companyId !== companyId) {
          return res
            .status(400)
            .json({ success: false, errorCode: 'channel_connection_not_found' });
        }
      }

      const result = await sendQuotationViaChannel(
        id,
        companyId,
        { ...parsed.data, language: req.user?.languagePreference ?? 'en' },
        req.user?.id ?? null
      );

      if (result.success) {
        return res.json({
          success: true,
          data: {
            channelType: result.channelType,
            recipient: result.recipient,
            pdfUrl: result.pdfUrl,
          },
        });
      }

      const status = quotationSendFailureHttpStatus(result.errorCode);
      return res.status(status).json({
        success: false,
        errorCode: result.errorCode,
        ...(result.errorParams ? { errorParams: result.errorParams } : {}),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error sending quotation:');
    }
  }
);

router.post('/:id/items', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    try {
      assertOrderLinesEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error creating line item:');
    }
    const parsed = createLineItemBodySchema.safeParse(req.body);
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
    const item = await storage.createSalesOrderItem({
      ...parsed.data,
      salesOrderId: id,
    });
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating line item:');
  }
});

router.patch(
  '/:id/items/:itemId/pos-observations',
  requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE),
  async (req, res) => {
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
      const order = await loadOrderForCompany(id, companyId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      if (order.status === 'delivered' || order.status === 'cancelled' || order.status === 'returned') {
        throw new Error('Order cannot be updated in its current status');
      }
      const restaurantContext = await storage.getRestaurantOrderContextBySalesOrder(companyId, id);
      if (!restaurantContext) {
        throw new Error('This is not a restaurant POS order');
      }
      if (!ACTIVE_RESTAURANT_POS_CONTEXT_STATUSES.has(restaurantContext.status)) {
        throw new Error('Restaurant order context cannot be updated in its current status');
      }
      const activeInvoice = await storage.getActiveInvoiceForSalesOrder(companyId, id);
      if (activeInvoice) {
        throw new Error('Order cannot be updated after checkout');
      }
      const existingItem = (await storage.getSalesOrderItems(id)).find((i) => i.id === itemId);
      if (!existingItem) {
        return res.status(404).json({ success: false, error: 'Line item not found' });
      }
      const parsed = posObservationUpdateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      const next: {
        specialInstructions?: string | null;
        unitPrice?: string;
        lineTotal?: string;
      } = {};
      const nextInstructions =
        parsed.data.specialInstructions !== undefined
          ? parsed.data.specialInstructions
          : existingItem.specialInstructions;
      if (parsed.data.specialInstructions !== undefined) {
        next.specialInstructions = parsed.data.specialInstructions;
      }

      if (existingItem.productId != null) {
        const product = await storage.getProduct(existingItem.productId);
        if (product && product.companyId === companyId) {
          const persistedUnitPrice = Number(existingItem.unitPrice ?? 0);
          const availableModifiers = resolvePosQuickModifiersForProduct(
            product.id,
            Array.isArray(product.modifiers) ? product.modifiers : undefined,
          );
          const derivedUnitPrice = derivePosObservationUnitPriceFromModifiers(
            Number.isFinite(persistedUnitPrice) ? persistedUnitPrice : 0,
            existingItem.specialInstructions,
            nextInstructions,
            availableModifiers,
          );
          if (derivedUnitPrice != null) {
            next.unitPrice = derivedUnitPrice;
          }
        }
      }
      const qty = Number(existingItem.quantity);
      const price = Number(next.unitPrice ?? existingItem.unitPrice);
      const discPct = Number(existingItem.discountPercent ?? 0);
      const base = qty * price;
      const lineDisc = base * (discPct / 100);
      const taxable = base - lineDisc;
      next.lineTotal = taxable.toFixed(2);
      const item = await storage.updateSalesOrderItem(itemId, next);
      return res.json({ success: true, data: item });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating POS line observations:');
    }
  },
);

router.put('/:id/items/:itemId', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
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
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    try {
      assertOrderLinesEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating line item:');
    }
    const existingItem = (await storage.getSalesOrderItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const parsed = updateLineItemBodySchema.safeParse(req.body);
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
    if (
      next.quantity != null ||
      next.unitPrice != null ||
      next.discountPercent != null ||
      next.taxRate != null
    ) {
      const qty = Number(next.quantity ?? existingItem.quantity);
      const price = Number(next.unitPrice ?? existingItem.unitPrice);
      const discPct = Number(next.discountPercent ?? existingItem.discountPercent ?? 0);
      const base = qty * price;
      const lineDisc = base * (discPct / 100);
      const taxable = base - lineDisc;
      next.lineTotal = taxable.toFixed(2);
    }
    const item = await storage.updateSalesOrderItem(itemId, next);
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating line item:');
  }
});

router.delete('/:id/items/:itemId', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
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
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    try {
      assertOrderLinesEditable(order);
    } catch (e) {
      return handleRouteError(res, e, 'Error deleting line item:');
    }
    const existingItem = (await storage.getSalesOrderItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const ok = await storage.deleteSalesOrderItemScoped(companyId, id, itemId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting line item:');
  }
});

router.get('/:id/deliveries', requireAnyPermission(ERP_SALES_ORDER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    const notes = await storage.getDeliveryNotes(id);
    return res.json({ success: true, data: notes });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing delivery notes:');
  }
});

router.post('/:id/deliveries', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    const parsed = createDeliveryNoteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const orderItems = await assertSalesOrderHasLineItems(id, 'creating delivery notes');
    validateDeliveryNoteLifecycle(order.status, {
      status: parsed.data.status ?? 'pending',
      shippedAt: parsed.data.shippedAt ?? null,
      deliveredAt: parsed.data.deliveredAt ?? null,
    });
    assertDeliveryNoteItemsBelongToOrder(orderItems, parsed.data.items);
    const note = await storage.createDeliveryNote({
      ...parsed.data,
      status: parsed.data.status ?? 'pending',
      salesOrderId: id,
      companyId,
      createdBy: req.user?.id ?? null,
    });
    return res.json({ success: true, data: note });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating delivery note:');
  }
});

router.put('/:id/deliveries/:dnId', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const dnId = parseInt(req.params.dnId, 10);
    if (Number.isNaN(id) || Number.isNaN(dnId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    const existing = await storage.getDeliveryNote(dnId);
    if (!existing || existing.salesOrderId !== id || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Delivery note not found' });
    }
    const parsed = updateDeliveryNoteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const nextItems = parsed.data.items ?? deliveryNoteItemsSchema.parse(existing.items ?? []);
    const nextStatus = parsed.data.status ?? existing.status;
    const nextShippedAt = parsed.data.shippedAt === undefined ? existing.shippedAt : parsed.data.shippedAt;
    const nextDeliveredAt =
      parsed.data.deliveredAt === undefined ? existing.deliveredAt : parsed.data.deliveredAt;
    const orderItems = await assertSalesOrderHasLineItems(id, 'updating delivery notes');
    validateDeliveryNoteLifecycle(order.status, {
      status: nextStatus,
      shippedAt: nextShippedAt,
      deliveredAt: nextDeliveredAt,
    });
    assertDeliveryNoteItemsBelongToOrder(orderItems, nextItems);
    const updated = await storage.updateDeliveryNote(dnId, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating delivery note:');
  }
});

router.post('/:id/confirm', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    await assertSalesOrderHasLineItems(id, 'confirmation');
    const updated = await storage.confirmSalesOrder(id, req.user?.id ?? null);
    void notifyOrderStatusChange(id, 'confirmed');
    void notifyOrderPlacedInvoiceDelivery(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error confirming sales order:');
  }
});

router.post('/:id/process', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    await assertSalesOrderHasLineItems(id, 'processing');
    assertStatusTransition(order.status, 'processing');
    const updated = await storage.updateSalesOrder(id, { status: 'processing' });
    void notifyOrderStatusChange(id, 'processing');
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating sales order:');
  }
});

router.post('/:id/ship', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    await assertSalesOrderHasLineItems(id, 'shipping');
    assertStatusTransition(order.status, 'shipped');
    const updated = await storage.updateSalesOrder(id, { status: 'shipped' });
    void notifyOrderStatusChange(id, 'shipped');
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating sales order:');
  }
});

router.post('/:id/deliver', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    await assertSalesOrderHasLineItems(id, 'delivery');
    assertStatusTransition(order.status, 'delivered');
    const updated = await storage.updateSalesOrder(id, { status: 'delivered' });
    void notifyOrderStatusChange(id, 'delivered');
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating sales order:');
  }
});

router.post('/:id/cancel', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    if (order.status === 'delivered') {
      return res.status(400).json({ success: false, error: 'Delivered orders cannot be cancelled' });
    }
    assertStatusTransition(order.status, 'cancelled');
    const updated = await storage.cancelSalesOrder(id, req.user?.id ?? null);
    void notifyOrderStatusChange(id, 'cancelled');
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error cancelling sales order:');
  }
});

router.post('/:id/return', requireAnyPermission(['manage_sales_orders']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    assertStatusTransition(order.status, 'returned');
    const updated = await storage.updateSalesOrder(id, { status: 'returned' });
    void notifyOrderStatusChange(id, 'returned');
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating sales order:');
  }
});

router.get('/:id', requireAnyPermission(ERP_SALES_ORDER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    const [items, deliveries, restaurantContext, activeInvoice, linkedContactRow] = await Promise.all([
      storage.getSalesOrderItems(id),
      storage.getDeliveryNotes(id),
      storage.getRestaurantOrderContextBySalesOrder(companyId, id),
      storage.getActiveInvoiceForSalesOrder(companyId, id),
      order.contactId != null ? storage.getContact(order.contactId) : Promise.resolve(undefined),
    ]);
    const linkedContact = linkedContactRow?.companyId === companyId
      ? { id: linkedContactRow.id, name: linkedContactRow.name, customFields: linkedContactRow.customFields ?? {} }
      : null;
    const hasInvoice = activeInvoice != null;
    const invoiceId = activeInvoice?.id ?? null;
    const observationsEditable =
      restaurantContext != null &&
      ACTIVE_RESTAURANT_POS_CONTEXT_STATUSES.has(restaurantContext.status) &&
      !hasInvoice;
    const productIds = [...new Set(items.map((item) => item.productId).filter((productId): productId is number => productId != null))];
    const variantIds = [...new Set(items.map((item) => item.variantId).filter((variantId): variantId is number => variantId != null))];
    const [products, variants] = await Promise.all([
      storage.getProductsByIds(companyId, productIds),
      storage.getProductVariantsByIds(companyId, variantIds),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantNameById = new Map(variants.map((variant) => [variant.id, variant.name]));
    return res.json({
      success: true,
      data: {
        order,
        linkedContact,
        items: items.map((item) => {
          const product = item.productId != null ? productById.get(item.productId) : undefined;
          return {
            ...item,
            productName: product?.name ?? null,
            variantName: item.variantId != null ? (variantNameById.get(item.variantId) ?? null) : null,
            product:
              product != null
                ? {
                    id: product.id,
                    name: product.name,
                    unitPrice: product.unitPrice,
                    modifiers: product.modifiers,
                  }
                : null,
          };
        }),
        deliveries,
        restaurantContext: restaurantContext ?? null,
        hasInvoice,
        invoiceId,
        checkoutCompleted: hasInvoice || restaurantContext?.status === 'completed',
        observationsEditable,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading sales order:');
  }
});

router.put('/:id', requireAnyPermission(ERP_SALES_ORDER_MANAGE_OR_QUOTE), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    const parsed = updateSalesOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    try {
      assertOrderHeaderEditable(order, data);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating sales order:');
    }
    if (data.contactId !== undefined && data.contactId != null) {
      const contact = await storage.getContact(data.contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to this company' });
      }
    }
    if (data.dealId !== undefined && data.dealId != null) {
      const deal = await storage.getDeal(data.dealId);
      if (!deal || deal.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Deal does not belong to this company' });
      }
    }
    if (data.status != null && data.status !== order.status) {
      if (data.status === 'confirmed') {
        return res.status(400).json({
          success: false,
          error: 'Use POST /confirm to confirm an order (applies stock deduction).',
        });
      }
      if (!(order.status === 'draft' && data.status === 'quotation')) {
        return res.status(400).json({
          success: false,
          error:
            'Status changes must use the action endpoints (process, ship, deliver, cancel, return), except draft → quotation which may be set here.',
        });
      }
      assertStatusTransition(order.status, data.status);
    }
    const updated = await storage.updateSalesOrder(id, data);
    if (data.status != null && data.status === 'quotation' && order.status === 'draft') {
      void notifyOrderStatusChange(id, 'quotation');
    }
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating sales order:');
  }
});

router.delete('/:id', requireAnyPermission(ERP_SALES_ORDER_DELETE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const order = await loadOrderForCompany(id, companyId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    if (order.status !== 'draft' && order.status !== 'quotation') {
      return res.status(400).json({
        success: false,
        error: 'Only draft or quotation orders can be deleted',
      });
    }
    const ok = await storage.deleteSalesOrder(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting sales order:');
  }
});

export default router;
