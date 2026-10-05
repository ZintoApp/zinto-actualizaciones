import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { getErpErrorResponse, storage } from '../../storage';
import { insertCurrencySchema, insertExchangeRateHistorySchema } from '../../../shared/schema';
import * as currencyService from '../../services/erp/currency-service';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_CURRENCY_LIST_PERMISSIONS = [
  'view_erp_settings',
  'manage_erp_settings',
  'view_suppliers',
  'manage_suppliers',
  'view_purchase_orders',
  'manage_purchase_orders',
  'view_invoices',
  'manage_invoices',
  'record_payments',
  'view_sales_orders',
  'manage_sales_orders',
];
const ERP_SETTINGS_MANAGE_PERMISSIONS = ['manage_erp_settings'];
const ERP_CONVERT_PERMISSIONS = ['view_erp'];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) return sendValidationError(res, error);
  const mapped = getErpErrorResponse(error);
  if (mapped) {
    return res.status(mapped.status).json({ success: false, error: mapped.message });
  }
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: 'Unexpected server error' });
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

function coerceCurrencyBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['exchangeRate'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) o[key] = String(v);
  }
  return o;
}

function coerceRateHistoryBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  const v = o.rate;
  if (typeof v === 'number' && Number.isFinite(v)) o.rate = String(v);
  const effectiveDate = o.effectiveDate;
  if (typeof effectiveDate === 'string') {
    const parsedDate = new Date(effectiveDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      o.effectiveDate = parsedDate;
    }
  }
  return o;
}

const positiveFiniteRateSchema = z.string().refine((value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}, 'Rate must be a positive number');

const createCurrencyBodySchema = z.preprocess(
  coerceCurrencyBody,
  insertCurrencySchema
    .omit({ companyId: true })
    .extend({ exchangeRate: positiveFiniteRateSchema })
    .strict()
);
const updateCurrencyBodySchema = z.preprocess(
  coerceCurrencyBody,
  insertCurrencySchema
    .omit({ companyId: true })
    .extend({ exchangeRate: positiveFiniteRateSchema })
    .partial()
    .strict()
);

const createExchangeRateBodySchema = z.preprocess(
  coerceRateHistoryBody,
  insertExchangeRateHistorySchema
    .omit({ companyId: true })
    .extend({ rate: positiveFiniteRateSchema })
    .strict()
);
const updateExchangeRateBodySchema = z.preprocess(
  coerceRateHistoryBody,
  insertExchangeRateHistorySchema
    .omit({ companyId: true })
    .extend({ rate: positiveFiniteRateSchema.optional() })
    .partial()
    .strict()
);

const convertBodySchema = z
  .object({
    amount: z.string(),
    fromCurrency: z.string().min(1),
    toCurrency: z.string().min(1),
  })
  .strict();

router.get('/', requireAnyPermission([...ERP_CURRENCY_LIST_PERMISSIONS, 'view_real_estate_financials']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const data = await storage.getCurrencies(companyId);
    return res.json({ success: true, data });
  } catch (e) {
    return handleRouteError(res, e, 'erp currencies list');
  }
});

router.post('/', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const parsed = createCurrencyBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.createCurrency({ ...parsed.data, companyId });
    return res.status(201).json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp currencies create');
  }
});

router.put('/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getCurrency(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Currency not found' });
    }
    const parsed = updateCurrencyBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.updateCurrency(id, parsed.data);
    return res.json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp currencies update');
  }
});

router.delete('/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getCurrency(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Currency not found' });
    }
    if (existing.isBaseCurrency) {
      return res.status(400).json({ success: false, error: 'Cannot delete base currency' });
    }
    const ok = await storage.deleteCurrency(id);
    if (!ok) return res.status(400).json({ success: false, error: 'Delete failed' });
    return res.json({ success: true });
  } catch (e) {
    return handleRouteError(res, e, 'erp currencies delete');
  }
});

router.post('/:id/set-base', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getCurrency(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Currency not found' });
    }
    const row = await storage.updateCurrency(id, { isBaseCurrency: true });
    return res.json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp currencies set-base');
  }
});

router.get('/exchange-rates', requireAnyPermission(ERP_CURRENCY_LIST_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const fromCurrency = req.query.fromCurrency != null ? String(req.query.fromCurrency) : undefined;
    const toCurrency = req.query.toCurrency != null ? String(req.query.toCurrency) : undefined;
    const dateFrom = optionalQueryDate(req.query.dateFrom);
    const dateTo = optionalQueryDate(req.query.dateTo);
    const limit = optionalQueryInt(req.query.limit);
    const offset = optionalQueryInt(req.query.offset);
    const result = await storage.getExchangeRateHistory(companyId, {
      fromCurrency,
      toCurrency,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    return res.json({ success: true, data: result.data, total: result.total });
  } catch (e) {
    return handleRouteError(res, e, 'erp exchange-rates list');
  }
});

router.post('/exchange-rates', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const parsed = createExchangeRateBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.createExchangeRateHistory({
      ...parsed.data,
      companyId,
      effectiveDate: parsed.data.effectiveDate instanceof Date ? parsed.data.effectiveDate : new Date(parsed.data.effectiveDate as unknown as string),
    });
    return res.status(201).json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp exchange-rates create');
  }
});

router.put('/exchange-rates/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const parsed = updateExchangeRateBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.updateExchangeRateHistory(id, companyId, parsed.data);
    return res.json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp exchange-rates update');
  }
});

router.post('/convert', requireAnyPermission(ERP_CONVERT_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const parsed = convertBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const converted = await currencyService.convertAmount(
      parsed.data.amount,
      parsed.data.fromCurrency,
      parsed.data.toCurrency,
      companyId
    );
    return res.json({ success: true, data: { amount: converted } });
  } catch (e) {
    return handleRouteError(res, e, 'erp currencies convert');
  }
});

export default router;
