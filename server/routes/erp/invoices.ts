import {erpMinorUnits} from '../../../shared/erp-carrying-amount';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {loadAccessibleInvoice, resolveInvoiceAccess, invoiceContactAllowed, accessibleInvoiceIds} from '../../services/erp/invoice-access';
import path from 'path';
import crypto from 'crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage,getErpErrorResponse } from '../../storage';
import {assertDomainInvoiceTermsEditable} from '../../services/erp/domain-invoice-edit-guard';
import { insertInvoiceSchema, insertInvoiceItemSchema } from '@shared/schema';
import { ErpProductScopeError } from '../../erp-product-scoping';
import { ensureRestaurantBusinessType, getCompanyErpBusinessType } from './business-type';
import {
  ERP_INVOICE_TEMPLATE_SETTINGS_KEY,
  getInvoiceTemplateSettings,
  invoiceTemplateSettingsSchema,
} from '../../services/erp-invoice-template-service';
import {
  DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES,
  ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY,
} from '@shared/erp-invoice-notification-defaults';
import { generateInvoicePdf } from '../../services/erp-invoice-pdf-service';
import {
  getInvoicePaymentNotificationSettings,
  notifyInvoicePaymentStatusChange,
} from '../../services/erp-invoice-notification-service';
import { invoiceHeaderDiscountAmount, invoiceLineDiscountAmount } from '../../invoice-discount-math';
import { sendValidationError } from '../../utils/erp-zod-validation';
import { assertErpPaymentMethodAllowed } from '../../services/erp-invoice-payment-options-service';
import { electronicInvoicingService } from '../../services/erp/electronic-invoicing/service';
import { ElectronicInvoicingUserError } from '../../services/erp/electronic-invoicing/types';
import '../../services/erp/electronic-invoicing/providers/factus';
import { FactusProvider } from '../../services/erp/electronic-invoicing/providers/factus';
import { getFactusRuntimeSettings, resolveFactusSecretsForTest, saveFactusSettings } from '../../services/erp/electronic-invoicing/factus-settings';
import { factusSettingsInputSchema } from '@shared/factus';
import serverI18n from '../../utils/server-i18n';
import { db } from '../../db';
import { electronicInvoices } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import creditRefundRoutes from './credit-note-refunds';
import {invoiceSupportsWorkflow} from '../../../shared/erp-invoice-workflows';

// Shared payment method values - matches paymentMethodEnum in schema.ts
const PAYMENT_METHODS = [
  'cash',
  'check',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'stripe',
  'paypal',
  'mercadopago',
  'moyasar',
  'mpesa',
  'paystack',
  'other',
] as const;

const router = Router();

const ERP_INVOICE_READ_PERMISSIONS = ['view_invoices', 'manage_invoices', 'record_payments'];
const ERP_INVOICE_MANAGE_PERMISSIONS = ['manage_invoices'];
const ERP_PAYMENT_PERMISSIONS = ['manage_invoices', 'record_payments'];

router.use(creditRefundRoutes);
const ERP_INVOICE_TEMPLATE_READ_PERMISSIONS = [
  'view_invoices',
  'manage_invoices',
  'record_payments',
  'view_erp_settings',
  'manage_erp_settings',
];
const ERP_INVOICE_TEMPLATE_MANAGE_PERMISSIONS = ['manage_erp_settings'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['void'],
  partially_paid: ['void'],
  paid: ['void'],
  overdue: ['void'],
  cancelled: [],
  void: [],
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
  const mapped=getErpErrorResponse(error);
  if(mapped)return res.status(mapped.status).json({success:false,error:mapped.message,...(mapped.code?{code:mapped.code,details:mapped.details}:{})});
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
      /^Only draft invoices/.test(m) ||
      /^Invoice not found/.test(m) ||
      /^Sales order not found/.test(m) ||
      /^Purchase order not found/.test(m) ||
      /^Line item not found/.test(m) ||
      /does not belong/.test(m) ||
      /cannot be updated/.test(m) ||
      /^Payment amount/.test(m) ||
      /^Payment correction/.test(m) ||
      /^Reconcile the .*receipt/.test(m) ||
      /^Invoice must be/.test(m) ||
      /^Invoice type .* is not supported/.test(m) ||
      /^Invoice accounting configuration is incomplete$/.test(m) ||
      /^Payment accounting configuration is incomplete$/.test(m) ||
      /^Invoices with recorded payments cannot be voided$/.test(m) ||
      /^Only draft invoices can be cancelled$/.test(m) ||
      /^Only pre-posting invoices can be cancelled$/.test(m) ||
      /^Accounts receivable record not found/.test(m) ||
      /^Accounts payable record not found/.test(m) ||
      /^Exactly one of/.test(m) ||
      /^Product does not belong/.test(m) ||
      /^Sales order does not belong/.test(m) ||
      /^Purchase order does not belong/.test(m) ||
      /^Source invoice not found/.test(m) ||
      /^Source invoice has already been split/.test(m)
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

function optionalQueryDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : raw;
}

function normalizeInvoiceDateInput(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value === '' ? null : value;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

function normalizeInvoiceFilterDate(value: string | undefined, boundary: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return boundary === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function coerceNumericFieldsForInvoiceBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of [
    'subtotal',
    'taxAmount',
    'discountAmount',
    'discountValue',
    'tipAmount',
    'serviceChargeAmount',
    'totalAmount',
  ] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  o.issueDate = normalizeInvoiceDateInput(o.issueDate);
  o.dueDate = normalizeInvoiceDateInput(o.dueDate);
  return o;
}

function coerceNumericFieldsForInvoiceItemBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['quantity', 'unitPrice', 'discountPercent', 'discountValue', 'taxRate'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

function computeInvoiceLineTotalString(body: Record<string, unknown>): string {
  const qty = Number(body.quantity ?? 1);
  const price = Number(body.unitPrice ?? 0);
  const base = qty * price;
  const discountValueExplicit = Object.prototype.hasOwnProperty.call(body, 'discountValue');
  const disc = invoiceLineDiscountAmount({
    quantity: qty,
    unitPrice: price,
    discountType: body.discountType != null ? String(body.discountType) : undefined,
    discountValue: discountValueExplicit ? Number(body.discountValue ?? 0) : undefined,
    discountPercent: Number(body.discountPercent ?? 0),
  });
  return (base - disc).toFixed(2);
}

function assertSupportedInvoiceWorkflowType(type: string, action: 'send' | 'payment'): void {
  if (!invoiceSupportsWorkflow(type,action)) {
    throw new Error(`Invoice type ${type} is not supported for ${action} workflow`);
  }
}

function deriveServiceChargeAmount(params: {
  subtotal: string | number | null | undefined;
  serviceChargeRate: string | number | null | undefined;
  serviceChargeAmount: string | number | null | undefined;
},digits=2): string {
  if (params.serviceChargeAmount != null && params.serviceChargeAmount !== '') {
    const parsed = Number(params.serviceChargeAmount);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : '0.00';
  }
  const rate = Number(params.serviceChargeRate ?? 0);
  if (!Number.isFinite(rate) || rate === 0) return '0.00';
  const subtotal = Number(params.subtotal ?? 0);
  if (!Number.isFinite(subtotal)) return '0.00';
  return ((subtotal * rate) / 100).toFixed(digits);
}

const listInvoicesQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  contactId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  supplierId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  salesOrderId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  purchaseOrderId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  search: z.string().optional(),
  dateFrom: z.preprocess(optionalQueryDate, z.string().optional()),
  dateTo: z.preprocess(optionalQueryDate, z.string().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createInvoiceBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceBody,
  insertInvoiceSchema
    .omit({ companyId: true, invoiceNumber: true, createdBy: true, status: true, amountPaid: true, amountDue: true })
    .partial({
      contactId: true,
      supplierId: true,
      salesOrderId: true,
      purchaseOrderId: true,
      type: true,
      issueDate: true,
      dueDate: true,
      subtotal: true,
      taxAmount: true,
      discountAmount: true,
      discountType: true,
      discountValue: true,
      tipAmount: true,
      serviceChargeAmount: true,
      serviceChargeRate: true,
      totalAmount: true,
      splitBillGroupId: true,
      splitBillSeatLabel: true,
      currency: true,
      notes: true,
      adjustmentReason: true,
      parentInvoiceId: true,
      termsAndConditions: true,
      pdfUrl: true,
    })
    .strict()
);

const updateInvoiceBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceBody,
  insertInvoiceSchema
    .omit({ companyId: true, invoiceNumber: true, createdBy: true, status: true, amountPaid: true, amountDue: true })
    .extend({
      tipAmount: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
      serviceChargeAmount: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
      serviceChargeRate: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
    })
    .partial()
    .strict()
);

const splitInvoiceBodySchema = z.object({
  sourceInvoiceId: z.number().int().positive(),
  splits: z.array(
    z.object({
      seatLabel: z.string().trim().min(1),
      itemIds: z.array(z.number().int()).min(1),
    }).strict()
  ).min(1),
}).strict();

const createInvoiceItemBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceItemBody,
  insertInvoiceItemSchema.omit({ invoiceId: true, lineTotal: true }).strict()
);

const updateInvoiceItemBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceItemBody,
  insertInvoiceItemSchema.omit({ invoiceId: true, lineTotal: true }).partial().strict()
);

const recordPaymentBodySchema = z
  .object({
    amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
    paymentDate: z.coerce.date().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
    referenceNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .strict();

const generateFromOrderBodySchema = z
  .object({
    salesOrderId: z.number().int().optional(),
    purchaseOrderId: z.number().int().optional(),
  })
  .strict()
  .refine(
    (b) =>
      (b.salesOrderId != null && b.purchaseOrderId == null) ||
      (b.purchaseOrderId != null && b.salesOrderId == null),
    { message: 'Exactly one of salesOrderId or purchaseOrderId is required' }
  );

const invoicePaymentNotificationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    messages: z
      .object({
        paid: z.string(),
        placed: z.string().optional(),
      })
      .strict(),
  })
  .strict();

async function assertInvoiceEditable(invoice: { id:number;companyId:number;status: string }): Promise<void> {
  if (invoice.status !== 'draft' && invoice.status !== 'sent') {
    throw new Error('Invoice cannot be updated in the current status');
  }
  await assertDomainInvoiceTermsEditable(invoice);
}

async function assertInvoiceLinesEditable(invoice: { id:number;companyId:number;status: string }): Promise<void> {
  if (invoice.status !== 'draft' && invoice.status !== 'sent') {
    throw new Error('Invoice line items cannot be updated in the current status');
  }
  await assertDomainInvoiceTermsEditable(invoice);
}

router.get('/', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    // Refresh overdue statuses before listing
    await storage.refreshOverdueForCompany(companyId);
    const parsed = listInvoicesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const result = await storage.getInvoices(companyId, {
      ...parsed.data,
      access: await resolveInvoiceAccess(req),
      dateFrom: normalizeInvoiceFilterDate(parsed.data.dateFrom, 'start'),
      dateTo: normalizeInvoiceFilterDate(parsed.data.dateTo, 'end'),
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing invoices:');
  }
});

router.post('/', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    if (data.contactId != null) {
      const contact = await storage.getContact(data.contactId);
      if (!contact || contact.companyId !== companyId || !await invoiceContactAllowed(req, data.contactId)) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to this company' });
      }
    }
    if (data.supplierId != null) {
      const supplier = await storage.getSupplier(data.supplierId);
      if (!supplier || supplier.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Supplier does not belong to this company' });
      }
    }
    if (data.salesOrderId != null) {
      const order = await storage.getSalesOrder(data.salesOrderId);
      if (!order || order.companyId !== companyId || !await invoiceContactAllowed(req, order.contactId)) {
        return res.status(400).json({ success: false, error: 'Sales order does not belong to this company' });
      }
    }
    if (data.purchaseOrderId != null) {
      const order = await storage.getPurchaseOrder(data.purchaseOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Purchase order does not belong to this company' });
      }
    }
    const subtotal = Number(data.subtotal ?? 0);
    const taxAmount = Number(data.taxAmount ?? 0);
    const typeSentCreate = data.discountType !== undefined;
    const valueSentCreate = data.discountValue !== undefined;
    const amountSentCreate = data.discountAmount !== undefined;
    let effCreateDiscType = 'fixed_amount';
    let effCreateDiscValueNum = 0;
    if (typeSentCreate || valueSentCreate) {
      effCreateDiscType = String(data.discountType ?? 'fixed_amount').trim();
      effCreateDiscValueNum = Number(data.discountValue ?? 0);
    } else if (amountSentCreate) {
      effCreateDiscType = 'fixed_amount';
      effCreateDiscValueNum = Number(data.discountAmount ?? 0);
    }
    if (!['none', 'percentage', 'fixed_amount'].includes(effCreateDiscType)) effCreateDiscType = 'fixed_amount';
    if (!Number.isFinite(effCreateDiscValueNum)) effCreateDiscValueNum = 0;
    const parentPrecision=data.parentInvoiceId!=null?await loadAccessibleInvoice(req,data.parentInvoiceId,'manage'):null;
    const digits=erpCurrencyDigits(parentPrecision?.currencyDecimalPlaces??(await storage.getCurrencyByCode(companyId,data.currency??'USD'))?.decimalPlaces);
    const computedCreateDiscountAmt = invoiceHeaderDiscountAmount(subtotal, effCreateDiscType, effCreateDiscValueNum);
    const tipAmount = Number(data.tipAmount ?? 0);
    const normalizedServiceChargeAmount = deriveServiceChargeAmount({
      subtotal: data.subtotal,
      serviceChargeRate: data.serviceChargeRate,
      serviceChargeAmount: data.serviceChargeAmount,
    },digits);
    const serviceChargeAmount = Number(normalizedServiceChargeAmount);
    const totalAmount = (subtotal + taxAmount - computedCreateDiscountAmt + tipAmount + serviceChargeAmount).toFixed(digits);
    
    if (data.parentInvoiceId != null) {
      const parent = await loadAccessibleInvoice(req, data.parentInvoiceId, 'manage');
      if (!parent || parent.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Parent invoice not found' });
      }
      if (data.type === 'credit_note') {
        const remaining = Number(parent.amountDue ?? 0);
        const currentTotal = Number(totalAmount);
        // Basic validation: credit note shouldn't exceed remaining balance if we want to be strict,
        // but for now we allow it (could be a full refund of a paid invoice).
        // We just ensure the currency matches.
        if (parent.currency !== (data.currency ?? 'USD')) {
          return res.status(400).json({ success: false, error: 'Credit note currency must match parent invoice' });
        }
      }
    }

    const created = await storage.createInvoice({
      ...data,
      companyId,
      invoiceNumber: '',
      createdBy: req.user?.id ?? null,
      type: data.type ?? 'sales_invoice',
      status: 'draft',
      contactId: data.contactId ?? null,
      supplierId: data.supplierId ?? null,
      salesOrderId: data.salesOrderId ?? null,
      purchaseOrderId: data.purchaseOrderId ?? null,
      issueDate: data.issueDate ?? new Date(),
      dueDate: data.dueDate ?? null,
      subtotal: data.subtotal ?? '0',
      taxAmount: data.taxAmount ?? '0',
      discountType: effCreateDiscType as 'none' | 'percentage' | 'fixed_amount',
      discountValue: effCreateDiscValueNum.toFixed(digits),
      discountAmount: computedCreateDiscountAmt.toFixed(digits),
      tipAmount: data.tipAmount ?? null,
      serviceChargeAmount: normalizedServiceChargeAmount,
      serviceChargeRate: data.serviceChargeRate ?? null,
      totalAmount,
      splitBillGroupId: data.splitBillGroupId ?? null,
      splitBillSeatLabel: data.splitBillSeatLabel ?? null,
      parentInvoiceId: data.parentInvoiceId ?? null,
      adjustmentReason: data.adjustmentReason ?? null,
      amountPaid: '0',
      amountDue: totalAmount,
      currency: data.currency ?? 'USD',
      notes: data.notes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfUrl: data.pdfUrl ?? null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating invoice:');
  }
});

router.post('/generate-from-order', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = generateFromOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { salesOrderId, purchaseOrderId } = parsed.data;
    if (salesOrderId != null) {
      const order = await storage.getSalesOrder(salesOrderId);
      if (!order || order.companyId !== companyId || !await invoiceContactAllowed(req, order.contactId)) {
        return res.status(400).json({ success: false, error: 'Sales order not found' });
      }
      const invoice = await storage.generateInvoiceFromSalesOrder(
        salesOrderId,
        companyId,
        req.user?.id ?? null
      );
      return res.json({ success: true, data: invoice });
    }
    if (purchaseOrderId != null) {
      const order = await storage.getPurchaseOrder(purchaseOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Purchase order not found' });
      }
      const invoice = await storage.generateInvoiceFromPurchaseOrder(
        purchaseOrderId,
        companyId,
        req.user?.id ?? null
      );
      return res.json({ success: true, data: invoice });
    }
    return res.status(400).json({ success: false, error: 'Exactly one of salesOrderId or purchaseOrderId is required' });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating invoice from order:');
  }
});

router.get(
  '/template-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await getInvoiceTemplateSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading invoice template settings:');
    }
  }
);

router.put(
  '/template-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_MANAGE_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = invoiceTemplateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      const businessType = await getCompanyErpBusinessType(companyId);
      await storage.saveCompanySetting(companyId, ERP_INVOICE_TEMPLATE_SETTINGS_KEY, parsed.data);
      const data = await getInvoiceTemplateSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving invoice template settings:');
    }
  }
);

router.get(
  '/payment-notification-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await getInvoicePaymentNotificationSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading invoice payment notification settings:');
    }
  }
);

router.put(
  '/payment-notification-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_MANAGE_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = invoicePaymentNotificationSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      const normalizedPaymentNotificationSettings = {
        enabled: parsed.data.enabled,
        messages: {
          paid: parsed.data.messages.paid,
          placed:
            parsed.data.messages.placed ?? DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES.placed,
        },
      };
      await storage.saveCompanySetting(companyId, ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY, normalizedPaymentNotificationSettings);
      const data = await getInvoicePaymentNotificationSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving invoice payment notification settings:');
    }
  }
);

async function electronicInvoiceMessage(
  req: any,
  key: string,
  fallback: string,
  variables?: Record<string, unknown>
): Promise<string> {
  return serverI18n.t(key, req.user?.languagePreference ?? 'en', fallback, variables);
}

router.get(
  '/electronic-invoicing-status',
  requireAnyPermission(['view_contacts', 'manage_contacts']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const settings = await electronicInvoicingService.getRuntimeConfiguration(companyId);
      return res.json({
        success: true,
        data: { enabled: settings?.provider === 'factus' && settings.enabled === true },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading electronic invoicing status:');
    }
  }
);

router.get(
  '/electronic-invoicing-settings',
  requireAnyPermission(['view_erp_settings', 'manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await electronicInvoicingService.getConfiguration(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading electronic invoicing settings:');
    }
  }
);

router.put(
  '/electronic-invoicing-settings',
  requireAnyPermission(['manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = factusSettingsInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      const current = await getFactusRuntimeSettings(companyId);
      const resolved = resolveFactusSecretsForTest(parsed.data, current);
      let verifiedAt: string | null = null;
      if (resolved.enabled) {
        const provider = new FactusProvider();
        const context = await electronicInvoicingService.getContext(companyId, resolved);
        const ranges = await provider.listNumberingRanges(context);
        if (!ranges.some((range) => range.id === resolved.numberingRangeId && range.isActive && (!range.document || range.document === '01'))) {
          return res.status(400).json({ success: false, error: await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.activeRangeRequired', 'Select an active Factus sales-invoice numbering range') });
        }
        verifiedAt = new Date().toISOString();
      }
      const data = await saveFactusSettings(companyId, resolved, verifiedAt);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving electronic invoicing settings:');
    }
  }
);

router.post('/electronic-invoicing-settings/test', requireAnyPermission(['manage_erp_settings']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const parsed = factusSettingsInputSchema.safeParse({ ...req.body, enabled: false });
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const current = await getFactusRuntimeSettings(companyId);
    const settings = resolveFactusSecretsForTest(parsed.data, current);
    const provider = new FactusProvider();
    const context = await electronicInvoicingService.getContext(companyId, settings);
    const ranges = await provider.listNumberingRanges(context);
    return res.json({ success: true, data: { ranges, verifiedAt: new Date().toISOString() } });
  } catch (error) {
    return handleRouteError(res, error, 'Error testing Factus connection:');
  }
});

router.get('/electronic-invoicing-numbering-ranges', requireAnyPermission(['view_erp_settings', 'manage_erp_settings']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const settings = await getFactusRuntimeSettings(companyId);
    if (!settings) return res.status(400).json({ success: false, error: await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.notConfigured', 'Factus is not configured') });
    const provider = new FactusProvider();
    const ranges = await provider.listNumberingRanges(await electronicInvoicingService.getContext(companyId, settings));
    return res.json({ success: true, data: ranges });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading Factus numbering ranges:');
  }
});

router.get(
  '/:id/pdf',
  requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS),
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
      const invoice = await loadAccessibleInvoice(req, id, 'view');
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      const typeRaw = String(req.query.type ?? 'a4').toLowerCase();
      const templateType = typeRaw === 'thermal' ? 'thermal' : 'a4';
      const download =
        req.query.download === '1' ||
        req.query.download === 'true' ||
        String(req.query.download).toLowerCase() === 'yes';
      const accept = String(req.headers.accept ?? '');
      const wantsJson =
        accept.includes('application/json') ||
        String(req.query.format ?? '').toLowerCase() === 'json';

      const result = await generateInvoicePdf(id, companyId, templateType, {
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
      return res.sendFile(path.resolve(result.absolutePath));
    } catch (error) {
      return handleRouteError(res, error, 'Error generating invoice PDF:');
    }
  }
);

router.get('/:id/items', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'view');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const items = await storage.getInvoiceItems(id);
    return res.json({ success: true, data: items });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading invoice items:');
  }
});

router.post('/:id/items', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      await assertInvoiceLinesEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error creating line item:');
    }
    const parsed = createInvoiceItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    let productFiscalProfile = parsed.data.colombiaFiscalProfile;
    if (parsed.data.productId != null) {
      const product = await storage.getProduct(parsed.data.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
      productFiscalProfile ??= product.colombiaFiscalProfile as typeof productFiscalProfile;
    }
    const item = await storage.createInvoiceItem({
      ...parsed.data,
      colombiaFiscalProfile: productFiscalProfile ?? null,
      invoiceId: id,
      lineTotal: computeInvoiceLineTotalString(parsed.data as Record<string, unknown>),
    });
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating line item:');
  }
});

router.put('/:id/items/:itemId', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
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
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      await assertInvoiceLinesEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating line item:');
    }
    const existingItem = (await storage.getInvoiceItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const parsed = updateInvoiceItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    let updateData = parsed.data;
    if (parsed.data.productId != null) {
      const product = await storage.getProduct(parsed.data.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
      if (parsed.data.colombiaFiscalProfile === undefined) {
        updateData = { ...parsed.data, colombiaFiscalProfile: product.colombiaFiscalProfile as typeof parsed.data.colombiaFiscalProfile };
      }
    }
    const item = await storage.updateInvoiceItem(itemId, updateData);
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating line item:');
  }
});

router.delete('/:id/items/:itemId', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
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
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      await assertInvoiceLinesEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error deleting line item:');
    }
    const existingItem = (await storage.getInvoiceItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const ok = await storage.deleteInvoiceItem(itemId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting line item:');
  }
});

router.get('/:id/noncash-settlements',requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS),async(req,res)=>{try{
 const invoice=await loadAccessibleInvoice(req,Number(req.params.id));if(!invoice){res.status(404).json({error:'Invoice not found'});return;}
 const rows=await storage.getInvoiceNoncashSettlements(req.user!.companyId!,invoice.id),p=(await resolveInvoiceAccess(req)).permissions;
 const canSeeOwner=p.view_real_estate_financials&&(p.view_real_estate_owner_settlements||p.manage_real_estate_owner_settlements);
 res.json({data:rows.map((r:any)=>({...r,source_id:r.source_type==='owner_settlement'&&!canSeeOwner?null:r.source_id,reason:r.source_type==='owner_settlement'&&!canSeeOwner?null:r.reason}))});
}catch(e){handleRouteError(res,e,'Error fetching noncash invoice settlements');}});
router.get('/:id/payments', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'view');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const payments = await storage.getInvoicePayments(id);
    return res.json({ success: true, data: payments });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing payments:');
  }
});

router.post('/:id/payments', requireAnyPermission(ERP_PAYMENT_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'payment');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invoice must be in sent, partially_paid, or overdue status to record payments',
      });
    }
    const parsed = recordPaymentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    try {
      assertSupportedInvoiceWorkflowType(invoice.type, 'payment');
    } catch (e) {
      return handleRouteError(res, e, 'Error recording payment:');
    }
    let amountUnits: bigint;
    try { amountUnits=erpMinorUnits(parsed.data.amount,erpCurrencyDigits(invoice.currencyDecimalPlaces)); }
    catch { return res.status(400).json({success:false,error:'Payment amount exceeds retained ERP currency precision'}); }
    if(amountUnits<=0n)return res.status(400).json({success:false,error:'Payment amount must be positive'});
    if(amountUnits>erpMinorUnits(String(invoice.amountDue??0),erpCurrencyDigits(invoice.currencyDecimalPlaces))) {
      return res.status(400).json({success:false,error:'Payment amount cannot exceed remaining balance'});
    }
    await assertErpPaymentMethodAllowed(companyId, parsed.data.paymentMethod);
    const prevStatus = invoice.status;
    const payment = await storage.recordInvoicePayment({
      invoiceId: id,
      companyId,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate ?? new Date(),
      paymentMethod: parsed.data.paymentMethod ?? null,
      referenceNumber: parsed.data.referenceNumber ?? null,
      notes: parsed.data.notes ?? null,
      recordedBy: req.user?.id ?? null,
    });
    const refreshed = await storage.getInvoice(id);
    if (refreshed?.status === 'paid' && prevStatus !== 'paid') {
      void notifyInvoicePaymentStatusChange(id);
    }
    return res.json({ success: true, data: payment });
  } catch (error) {
    return handleRouteError(res, error, 'Error recording payment:');
  }
});

router.put('/:id/payments/:paymentId', requireAnyPermission(ERP_PAYMENT_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (Number.isNaN(id) || Number.isNaN(paymentId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'payment');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    if (!['sent', 'partially_paid', 'paid', 'overdue'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invoice must be in sent, partially_paid, paid, or overdue status to edit payments',
      });
    }
    const scopedPayments=await storage.getInvoicePayments(id);
    if(!scopedPayments.some(payment=>payment.id===paymentId&&payment.companyId===companyId)) {
      return res.status(404).json({success:false,error:'Payment not found'});
    }
    const parsed = recordPaymentBodySchema.extend({correctionReason:z.string().trim().max(1000).optional()}).safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    try {
      assertSupportedInvoiceWorkflowType(invoice.type, 'payment');
    } catch (e) {
      return handleRouteError(res, e, 'Error updating payment:');
    }
    const retained=scopedPayments.find(payment=>payment.id===paymentId)!;
    let amountUnits:bigint;
    try{amountUnits=erpMinorUnits(parsed.data.amount,erpCurrencyDigits(invoice.currencyDecimalPlaces));}
    catch{return res.status(400).json({success:false,error:'Payment amount exceeds retained ERP currency precision'});}
    const permissions=(await resolveInvoiceAccess(req)).permissions;
    const canPostAccounting=!!(permissions.manage_accounting||permissions.post_journal_entries);
    const changesAccounting=amountUnits!==erpMinorUnits(retained.amount,erpCurrencyDigits(invoice.currencyDecimalPlaces))||
      (parsed.data.paymentDate!==undefined&&parsed.data.paymentDate.getTime()!==new Date(retained.paymentDate!).getTime());
    if(changesAccounting){
      if(!canPostAccounting)return res.status(403).json({success:false,error:'Accounting posting permission required'});
    }
    await assertErpPaymentMethodAllowed(companyId, parsed.data.paymentMethod);
    const prevStatus = invoice.status;
    const payment = await storage.updateInvoicePayment(paymentId, companyId, {
      amount: String(parsed.data.amount),
      paymentDate: parsed.data.paymentDate ?? undefined,
      paymentMethod: parsed.data.paymentMethod ?? null,
      referenceNumber: parsed.data.referenceNumber ?? null,
      notes: parsed.data.notes ?? null,
    }, id, {actorId:req.user!.id,reason:parsed.data.correctionReason??'',canPostAccounting});
    const refreshed = await storage.getInvoice(id);
    if (refreshed?.status === 'paid' && prevStatus !== 'paid') {
      void notifyInvoicePaymentStatusChange(id);
    }
    return res.json({ success: true, data: payment });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating payment:');
  }
});

router.post('/:id/send', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const invoiceStatus = String(invoice.status ?? '').trim().toLowerCase();
    if (invoiceStatus !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft invoices can be sent' });
    }
    try {
      assertSupportedInvoiceWorkflowType(invoice.type, 'send');
    } catch (e) {
      return handleRouteError(res, e, 'Error sending invoice:');
    }

    const config = await electronicInvoicingService.getRuntimeConfiguration(companyId);
    if (config?.enabled) {
      const invProvider = await electronicInvoicingService.getInvoiceProvider(companyId);
      if (!invProvider) return res.status(400).json({ success: false, error: await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.providerUnavailable', 'Factus provider is unavailable') });
      const reservation = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(electronicInvoices)
          .where(eq(electronicInvoices.invoiceId, id)).limit(1).for('update');
        if (existing?.status === 'validated') return { state: 'validated' as const, referenceCode: existing.providerReferenceCode };
        if (existing?.status === 'pending') return { state: 'busy' as const, referenceCode: existing.providerReferenceCode };

        const referenceCode = existing?.providerReferenceCode || `pc-${companyId}-${id}-${crypto.randomUUID()}`;
        if (existing) {
          const rows = await tx.update(electronicInvoices).set({ provider: 'factus', status: 'pending', providerReferenceCode: referenceCode, errors: [], updatedAt: new Date() })
            .where(and(eq(electronicInvoices.id, existing.id), inArray(electronicInvoices.status, ['draft', 'rejected', 'failed']))).returning();
          return { state: rows.length === 1 ? 'reserved' as const : 'busy' as const, referenceCode };
        }
        const rows = await tx.insert(electronicInvoices).values({ invoiceId: id, companyId, country: 'CO', provider: 'factus', status: 'pending', providerReferenceCode: referenceCode })
          .onConflictDoNothing({ target: electronicInvoices.invoiceId }).returning();
        return { state: rows.length === 1 ? 'reserved' as const : 'busy' as const, referenceCode };
      });

      if (reservation.state === 'validated') {
        const updated = await storage.sendInvoice(id, companyId, req.user?.id ?? null);
        return res.json({ success: true, data: updated });
      }
      if (reservation.state === 'busy') {
        return res.status(409).json({ success: false, error: await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.submissionInProgress', 'This invoice already has a Factus submission in progress') });
      }
      const referenceCode = reservation.referenceCode!;

      let valResult;
      try {
        const submission = await electronicInvoicingService.loadInvoiceSubmission(companyId, id, referenceCode);
        valResult = await invProvider.emitInvoice(await electronicInvoicingService.getContext(companyId, config), submission);
      } catch (error) {
        const errorText = error instanceof ElectronicInvoicingUserError
          ? await electronicInvoiceMessage(req, error.translationKey, error.message, error.variables)
          : error instanceof Error ? error.message : await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.validationFailed', 'Factus validation failed');
        await db.update(electronicInvoices).set({ status: 'failed', errors: [errorText], updatedAt: new Date() }).where(eq(electronicInvoices.invoiceId, id));
        return res.status(400).json({ success: false, error: errorText, errors: [errorText] });
      }

      await db.update(electronicInvoices).set({
        status: valResult.status, provider: 'factus', providerDocumentNumber: valResult.documentNumber || null,
        cufe: valResult.cufe || null, xmlUrl: valResult.xmlUrl || null, publicUrl: valResult.publicUrl || null,
        qrCodeText: valResult.qrCodeText || null, errors: valResult.errors || [], metadata: valResult.metadata || {},
        validatedAt: valResult.validatedAt || null, updatedAt: new Date(),
      }).where(eq(electronicInvoices.invoiceId, id));

      if (valResult.status === 'validated') {
        const updated = await storage.sendInvoice(id, companyId, req.user?.id ?? null);
        return res.json({ success: true, data: updated });
      }
      const statusCode = valResult.status === 'pending' ? 409 : valResult.status === 'rejected' ? 400 : 503;
      return res.status(statusCode).json({
        success: false,
        error: await electronicInvoiceMessage(req, valResult.status === 'rejected' ? 'erp.electronicInvoicing.errors.validationRejected' : 'erp.electronicInvoicing.errors.validationFailed', valResult.status === 'rejected' ? 'Electronic invoice validation was rejected by Factus.' : 'Electronic invoice validation failed or remains pending in Factus.'),
        errors: valResult.errors,
      });
    }

    assertStatusTransition(invoice.status, 'sent');
    const updated = await storage.sendInvoice(id, companyId, req.user?.id ?? null);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error sending invoice:');
  }
});

router.post('/:id/void', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    assertStatusTransition(invoice.status, 'void');
    const updated = await storage.voidInvoice(id, companyId, req.user?.id ?? null);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error voiding invoice:');
  }
});

router.post('/:id/cancel', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    assertStatusTransition(invoice.status, 'cancelled');
    const updated = await storage.cancelInvoice(id, companyId, req.user?.id ?? null);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error cancelling invoice:');
  }
});

router.post('/:id/recover-posting', requireAnyPermission(ERP_PAYMENT_PERMISSIONS), async(req,res)=>{
  try {
    const id=Number(req.params.id);
    const invoice=await loadAccessibleInvoice(req,id,'payment');
    if(!invoice)return res.status(404).json({success:false,error:'Invoice not found'});
    const permissions=(await resolveInvoiceAccess(req)).permissions;
    if(!permissions.manage_accounting && !permissions.post_journal_entries)return res.status(403).json({success:false,error:'Accounting posting permission required'});
    const body=z.object({reason:z.string().trim().min(1).max(1000)}).strict().safeParse(req.body);
    if(!body.success)return sendValidationError(res,body.error);
    const noncashOwners=(await db.execute(sql`SELECT DISTINCT s.owner_contact_id FROM erp_invoice_noncash_settlements n JOIN real_estate_settlements s ON s.company_id=n.company_id AND s.id=n.source_id WHERE n.company_id=${req.user!.companyId!} AND n.invoice_id=${id} AND n.status='posted' AND n.source_type='owner_settlement'`)).rows.map((row:any)=>Number(row.owner_contact_id));
    if(noncashOwners.length && (!permissions.manage_real_estate_owner_settlements || !permissions.view_real_estate_financials))return res.status(403).json({success:false,error:'Owner settlement management permission required'});
    const owners:number[]=[];for(const owner of noncashOwners)if(await invoiceContactAllowed(req,owner))owners.push(owner);
    if(owners.length!==noncashOwners.length)return res.status(404).json({success:false,error:'Invoice not found'});
    const result=await storage.recoverInvoicePosting(req.user!.companyId!,id,req.user!.id,body.data.reason,await accessibleInvoiceIds(req,'payment'),owners);
    return res.json({success:true,data:result});
  } catch(error){return handleRouteError(res,error,'Error recovering ERP invoice posting:');}
});

router.get('/:id', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'view');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const refreshedInvoice = await storage.refreshInvoiceOverdueStatus(id, companyId);
    const [items, payments, relatedNotes, electronicInvoice, linkedContactRow, noncash] = await Promise.all([
      storage.getInvoiceItems(id),
      storage.getInvoicePayments(id),
      storage.getInvoices(companyId, { parentInvoiceId: id, access: await resolveInvoiceAccess(req) }),
      db.select().from(electronicInvoices).where(eq(electronicInvoices.invoiceId, id)).limit(1).then((rows) => rows[0] ?? null),
      invoice.contactId != null ? storage.getContact(invoice.contactId) : Promise.resolve(undefined),
      storage.getInvoiceNoncashSettlements(companyId,id),
    ]);
    const linkedContact = linkedContactRow?.companyId === companyId
      ? { id: linkedContactRow.id, name: linkedContactRow.name, customFields: linkedContactRow.customFields ?? {} }
      : null;
    return res.json({
      success: true,
      data: { invoice: refreshedInvoice ?? invoice, items, payments, relatedNotes: relatedNotes.data, electronicInvoice, linkedContact, hasNoncashSettlements: noncash.some((r:any)=>r.status==='posted') },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading invoice:');
  }
});

router.put('/:id', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      await assertInvoiceEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating invoice:');
    }
    const parsed = updateInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    if (data.contactId !== undefined && data.contactId != null) {
      const contact = await storage.getContact(data.contactId);
      if (!contact || contact.companyId !== companyId || !await invoiceContactAllowed(req, data.contactId)) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to this company' });
      }
    }
    if (data.supplierId !== undefined && data.supplierId != null) {
      const supplier = await storage.getSupplier(data.supplierId);
      if (!supplier || supplier.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Supplier does not belong to this company' });
      }
    }
    if (data.salesOrderId !== undefined && data.salesOrderId != null) {
      const order = await storage.getSalesOrder(data.salesOrderId);
      if (!order || order.companyId !== companyId || !await invoiceContactAllowed(req, order.contactId)) {
        return res.status(400).json({ success: false, error: 'Sales order does not belong to this company' });
      }
    }
    if (data.purchaseOrderId !== undefined && data.purchaseOrderId != null) {
      const order = await storage.getPurchaseOrder(data.purchaseOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Purchase order does not belong to this company' });
      }
    }
    const subtotal = Number(data.subtotal ?? invoice.subtotal ?? 0);
    const taxAmount = Number(data.taxAmount ?? invoice.taxAmount ?? 0);
    const typeSentUpd = data.discountType !== undefined;
    const valueSentUpd = data.discountValue !== undefined;
    const amountSentUpd = data.discountAmount !== undefined;
    let effUpdDiscType: string;
    let effUpdDiscValueNum: number;
    if (typeSentUpd || valueSentUpd) {
      effUpdDiscType = String(data.discountType ?? invoice.discountType ?? 'fixed_amount').trim();
      effUpdDiscValueNum = Number(data.discountValue ?? invoice.discountValue ?? 0);
    } else if (amountSentUpd) {
      effUpdDiscType = 'fixed_amount';
      effUpdDiscValueNum = Number(data.discountAmount ?? 0);
    } else {
      effUpdDiscType = String(invoice.discountType ?? 'fixed_amount').trim();
      effUpdDiscValueNum = Number(invoice.discountValue ?? 0);
    }
    if (!['none', 'percentage', 'fixed_amount'].includes(effUpdDiscType)) effUpdDiscType = 'fixed_amount';
    if (!Number.isFinite(effUpdDiscValueNum)) effUpdDiscValueNum = 0;
    const digits=erpCurrencyDigits(invoice.status==='draft'&&data.currency!=null&&data.currency!==invoice.currency?(await storage.getCurrencyByCode(companyId,data.currency))?.decimalPlaces:invoice.currencyDecimalPlaces);
    const computedUpdDiscountAmt = invoiceHeaderDiscountAmount(subtotal, effUpdDiscType, effUpdDiscValueNum);
    const tipAmount = Number(data.tipAmount ?? invoice.tipAmount ?? 0);
    const normalizedServiceChargeAmount = deriveServiceChargeAmount({
      subtotal: data.subtotal ?? invoice.subtotal,
      serviceChargeRate: data.serviceChargeRate ?? invoice.serviceChargeRate,
      serviceChargeAmount: data.serviceChargeAmount,
    },digits);
    const serviceChargeAmount = Number(normalizedServiceChargeAmount);
    const totalAmount = (subtotal + taxAmount - computedUpdDiscountAmt + tipAmount + serviceChargeAmount).toFixed(digits);
    const updated = await storage.updateInvoice(id, {
      ...data,
      discountType: effUpdDiscType as 'none' | 'percentage' | 'fixed_amount',
      discountValue: effUpdDiscValueNum.toFixed(digits),
      discountAmount: computedUpdDiscountAmt.toFixed(digits),
      serviceChargeAmount: normalizedServiceChargeAmount,
      totalAmount,
    });
    await storage.recalculateInvoiceTotals(id);
    const finalInv = await storage.getInvoice(id);
    return res.json({ success: true, data: finalInv ?? updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating invoice:');
  }
});

router.post('/split', requireAnyPermission(['manage_invoices']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;

    const parsed = splitInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }

    const sourceInvoice = await loadAccessibleInvoice(req, parsed.data.sourceInvoiceId, 'manage');
    if (!sourceInvoice) {
      return res.status(404).json({ success: false, error: 'Source invoice not found' });
    }
    if (sourceInvoice.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Source invoice not found' });
    }
    const createdInvoices = await storage.splitDraftInvoice(
      companyId,
      sourceInvoice.id,
      parsed.data.splits,
      req.user?.id ?? null
    );

    return res.json({ success: true, data: createdInvoices });
  } catch (error) {
    return handleRouteError(res, error, 'Error splitting invoice:');
  }
});

router.delete('/:id', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadAccessibleInvoice(req, id, 'manage');
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      const ok = await storage.deleteInvoice(id);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      return res.json({ success: true });
    } catch (e) {
      return handleRouteError(res, e, 'Error deleting invoice:');
    }
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting invoice:');
  }
});

export default router;
