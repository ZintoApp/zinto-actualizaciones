import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import { insertPayrollRunSchema, insertPayrollItemSchema } from '@shared/schema';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_PAYROLL_READ_PERMISSIONS = ['view_payroll', 'manage_payroll'];
const ERP_PAYROLL_MANAGE_PERMISSIONS = ['manage_payroll'];

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
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505') {
    const messages: Record<string, string> = {
      unique_payroll_employee: 'Employee already has a payroll item for this run',
    };
    return res.status(400).json({
      success: false,
      error: messages[dbError.constraint ?? ''] ?? 'Duplicate record',
    });
  }
  if (error instanceof Error) {
    const businessMessages = [
      'Payroll period start must be before period end',
      'Base salary must be a non-negative finite amount',
      'Bonuses must be a non-negative finite amount',
      'Deductions must be a non-negative finite amount',
      'Net pay cannot be negative',
      'Payroll run is already completed',
      'Payroll run cannot be completed',
    ];
    if (businessMessages.includes(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
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

function coercePayrollItemBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const k of ['baseSalary', 'bonuses', 'deductions']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[k] = String(v);
    }
  }
  return o;
}

function preprocessPayrollRunBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const k of ['periodStart', 'periodEnd'] as const) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v === null || v === undefined) continue;
    if (v instanceof Date) continue;
    if (typeof v === 'string' && v.trim()) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) o[k] = d;
    }
  }
  return o;
}

const listRunsQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createRunBodySchema = z.preprocess(
  preprocessPayrollRunBody,
  insertPayrollRunSchema
    .omit({ companyId: true, status: true, totalGross: true, totalDeductions: true, totalNet: true, processedBy: true })
    .strict()
    .superRefine((data, ctx) => {
      if (new Date(data.periodStart).getTime() >= new Date(data.periodEnd).getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEnd'], message: 'Period end must be after period start' });
      }
    })
);

const updateRunBodySchema = z.preprocess(
  preprocessPayrollRunBody,
  insertPayrollRunSchema
    .omit({ companyId: true, status: true, totalGross: true, totalDeductions: true, totalNet: true, processedBy: true })
    .partial()
    .strict()
    .superRefine((data, ctx) => {
      if (data.periodStart && data.periodEnd && new Date(data.periodStart).getTime() >= new Date(data.periodEnd).getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEnd'], message: 'Period end must be after period start' });
      }
    })
);

function validatePayrollAmount(value: unknown, field: string, ctx: z.RefinementCtx) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must be a non-negative finite amount` });
  }
}

function deriveNetPay(data: { baseSalary: unknown; bonuses?: unknown; deductions?: unknown }): string {
  const baseSalary = Number(data.baseSalary ?? 0);
  const bonuses = Number(data.bonuses ?? 0);
  const deductions = Number(data.deductions ?? 0);
  return (baseSalary + bonuses - deductions).toFixed(2);
}

const createItemBodySchema = z.preprocess(
  coercePayrollItemBody,
  insertPayrollItemSchema
    .omit({ payrollRunId: true, netPay: true })
    .strict()
    .superRefine((data, ctx) => {
      validatePayrollAmount(data.baseSalary, 'baseSalary', ctx);
      validatePayrollAmount(data.bonuses, 'bonuses', ctx);
      validatePayrollAmount(data.deductions, 'deductions', ctx);
      const netPay = Number(data.baseSalary) + Number(data.bonuses) - Number(data.deductions);
      if (!Number.isFinite(netPay) || netPay < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deductions'], message: 'Net pay cannot be negative' });
      }
    })
);

const updateItemBodySchema = z.preprocess(
  coercePayrollItemBody,
  insertPayrollItemSchema
    .omit({ payrollRunId: true, employeeId: true, netPay: true })
    .partial()
    .strict()
    .superRefine((data, ctx) => {
      if (data.baseSalary !== undefined) validatePayrollAmount(data.baseSalary, 'baseSalary', ctx);
      if (data.bonuses !== undefined) validatePayrollAmount(data.bonuses, 'bonuses', ctx);
      if (data.deductions !== undefined) validatePayrollAmount(data.deductions, 'deductions', ctx);
    })
);

router.get('/', requireAnyPermission(ERP_PAYROLL_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listRunsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const result = await storage.getPayrollRuns(companyId, parsed.data);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing payroll runs:');
  }
});

router.post('/', requireAnyPermission(ERP_PAYROLL_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const created = await storage.createPayrollRun({
      ...parsed.data,
      companyId,
      status: 'draft',
      totalGross: '0',
      totalDeductions: '0',
      totalNet: '0',
      processedBy: null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating payroll run:');
  }
});

router.post('/:id/complete', requireAnyPermission(ERP_PAYROLL_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const run = await storage.getPayrollRun(id);
    if (!run || run.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Payroll run not found' });
    }
    const completed = await storage.completePayrollRun(id, companyId, userId);
    return res.json({ success: true, data: completed });
  } catch (error) {
    return handleRouteError(res, error, 'Error completing payroll run:');
  }
});

router.post('/:id/items', requireAnyPermission(ERP_PAYROLL_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const run = await storage.getPayrollRun(id);
    if (!run || run.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Payroll run not found' });
    }
    if (run.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot edit completed payroll run' });
    }
    const parsed = createItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp || emp.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Employee not found' });
    }
    const created = await storage.createPayrollItem({
      ...parsed.data,
      payrollRunId: id,
      netPay: deriveNetPay(parsed.data),
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating payroll item:');
  }
});

router.put('/:id/items/:itemId', requireAnyPermission(ERP_PAYROLL_MANAGE_PERMISSIONS), async (req, res) => {
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
    const run = await storage.getPayrollRun(id);
    if (!run || run.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Payroll run not found' });
    }
    if (run.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot edit completed payroll run' });
    }
    const items = await storage.getPayrollItems(id);
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Payroll item not found' });
    }
    const parsed = updateItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const updated = await storage.updatePayrollItem(itemId, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating payroll item:');
  }
});

router.delete('/:id/items/:itemId', requireAnyPermission(ERP_PAYROLL_MANAGE_PERMISSIONS), async (req, res) => {
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
    const run = await storage.getPayrollRun(id);
    if (!run || run.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Payroll run not found' });
    }
    if (run.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot edit completed payroll run' });
    }
    const items = await storage.getPayrollItems(id);
    if (!items.find((i) => i.id === itemId)) {
      return res.status(404).json({ success: false, error: 'Payroll item not found' });
    }
    await storage.deletePayrollItem(itemId);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting payroll item:');
  }
});

router.get('/:id', requireAnyPermission(ERP_PAYROLL_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const run = await storage.getPayrollRun(id);
    if (!run || run.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Payroll run not found' });
    }
    const items = await storage.getPayrollItems(id);
    const employeeDetails = await storage.getEmployeeEnrichment(items.map((it) => it.employeeId));
    const enrichedItems = items.map((it) => {
      const details = employeeDetails.get(it.employeeId);
      return { ...it, employeeName: details?.user?.fullName ?? null };
    });
    return res.json({ success: true, data: { run, items: enrichedItems } });
  } catch (error) {
    return handleRouteError(res, error, 'Error getting payroll run:');
  }
});

router.put('/:id', requireAnyPermission(ERP_PAYROLL_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getPayrollRun(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Payroll run not found' });
    }
    if (existing.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot edit completed payroll run' });
    }
    const parsed = updateRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const updated = await storage.updatePayrollRun(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating payroll run:');
  }
});

export default router;
