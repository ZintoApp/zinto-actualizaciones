import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { getErpErrorResponse, storage } from '../../storage';
import { insertTaxRuleSchema, insertTaxGroupSchema } from '@shared/schema';
import * as taxService from '../../services/erp/tax-service';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_TAX_RULE_READ_PERMISSIONS = ['view_erp_settings', 'manage_erp_settings'];
const ERP_TAX_GROUP_READ_PERMISSIONS = ['view_erp_settings', 'manage_erp_settings'];
const ERP_SETTINGS_MANAGE_PERMISSIONS = ['manage_erp_settings'];
const ERP_TAX_CALC_PERMISSIONS = ['view_erp'];

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

function coerceTaxRuleBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  const v = o.rate;
  if (typeof v === 'number' && Number.isFinite(v)) o.rate = String(v);
  return o;
}

const createTaxRuleBodySchema = z.preprocess(
  coerceTaxRuleBody,
  insertTaxRuleSchema.omit({ companyId: true }).strict()
);
const updateTaxRuleBodySchema = z.preprocess(
  coerceTaxRuleBody,
  insertTaxRuleSchema.omit({ companyId: true }).partial().strict()
);

const createTaxGroupBodySchema = insertTaxGroupSchema.omit({ companyId: true }).strict();
const updateTaxGroupBodySchema = insertTaxGroupSchema.omit({ companyId: true }).partial().strict();

const replaceGroupRulesBodySchema = z.array(
  z
    .object({
      taxRuleId: z.number().int(),
      order: z.number().int(),
    })
    .strict()
);

const calculateTaxBodySchema = z
  .object({
    amount: z.string(),
    taxGroupId: z.number().int().nullable().optional(),
    taxRate: z.string().optional(),
  })
  .strict();

router.get('/rules', requireAnyPermission(ERP_TAX_RULE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const type = req.query.type != null ? String(req.query.type) : undefined;
    const country = req.query.country != null ? String(req.query.country) : undefined;
    const region = req.query.region != null ? String(req.query.region) : undefined;
    const appliesTo = req.query.appliesTo != null ? String(req.query.appliesTo) : undefined;
    const isActive =
      req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
    const data = await storage.getTaxRules(companyId, { type, country, region, appliesTo, isActive });
    return res.json({ success: true, data });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax rules list');
  }
});

router.post('/rules', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const parsed = createTaxRuleBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.createTaxRule({ ...parsed.data, companyId });
    return res.status(201).json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax rules create');
  }
});

router.put('/rules/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getTaxRule(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Tax rule not found' });
    }
    const parsed = updateTaxRuleBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.updateTaxRule(id, parsed.data);
    return res.json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax rules update');
  }
});

router.delete('/rules/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getTaxRule(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Tax rule not found' });
    }
    await storage.deleteTaxRule(id);
    return res.json({ success: true });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax rules delete');
  }
});

router.get('/groups', requireAnyPermission(ERP_TAX_GROUP_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const data = await storage.getTaxGroupsWithRuleCounts(companyId);
    return res.json({ success: true, data });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax groups list');
  }
});

router.post('/groups', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const parsed = createTaxGroupBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.createTaxGroup({ ...parsed.data, companyId });
    return res.status(201).json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax groups create');
  }
});

router.put('/groups/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getTaxGroup(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Tax group not found' });
    }
    const parsed = updateTaxGroupBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await storage.updateTaxGroup(id, parsed.data);
    return res.json({ success: true, data: row });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax groups update');
  }
});

router.delete('/groups/:id', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const existing = await storage.getTaxGroup(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Tax group not found' });
    }
    await storage.deleteTaxGroup(id);
    return res.json({ success: true });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax groups delete');
  }
});

router.get('/groups/:id/rules', requireAnyPermission(ERP_TAX_GROUP_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const group = await storage.getTaxGroup(id);
    if (!group || group.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Tax group not found' });
    }
    const enriched = await storage.getTaxGroupRulesWithDetails(id, companyId);
    return res.json({ success: true, data: enriched });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax group rules get');
  }
});

router.put('/groups/:id/rules', requireAnyPermission(ERP_SETTINGS_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
    const group = await storage.getTaxGroup(id);
    if (!group || group.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Tax group not found' });
    }
    const parsed = replaceGroupRulesBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const ruleIds = [...new Set(parsed.data.map((r) => r.taxRuleId))];
    const rules = await storage.getTaxRulesByIds(companyId, ruleIds);
    const validRuleIds = new Set(rules.map((rule) => rule.id));
    for (const ruleId of ruleIds) {
      if (!validRuleIds.has(ruleId)) {
        return res.status(400).json({ success: false, error: `Invalid tax rule ${ruleId}` });
      }
    }
    const inserts = parsed.data.map((r) => ({
      taxGroupId: id,
      taxRuleId: r.taxRuleId,
      order: r.order,
    }));
    const rows = await storage.replaceTaxGroupRules(id, inserts);
    return res.json({ success: true, data: rows });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax group rules replace');
  }
});

router.post('/calculate', requireAnyPermission(ERP_TAX_CALC_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company required' });
    const parsed = calculateTaxBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    if (parsed.data.taxGroupId != null) {
      const group = await storage.getTaxGroup(parsed.data.taxGroupId);
      if (!group || group.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Invalid tax group' });
      }
    }
    const result = await taxService.calculateTax(
      companyId,
      parsed.data.amount,
      parsed.data.taxGroupId ?? null,
      parsed.data.taxRate
    );
    return res.json({ success: true, data: result });
  } catch (e) {
    return handleRouteError(res, e, 'erp tax calculate');
  }
});

export default router;
