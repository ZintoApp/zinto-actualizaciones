import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import { insertSupplierSchema, insertSupplierProductSchema } from '@shared/schema';
import { ErpProductScopeError } from '../../erp-product-scoping';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_SUPPLIER_READ_PERMISSIONS = ['view_suppliers', 'manage_suppliers'];

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
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: getErrorMessage(error) });
}

function optionalQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function coerceNumericFieldsForSupplierProductBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  const v = o.supplierPrice;
  if (typeof v === 'number' && Number.isFinite(v)) {
    o.supplierPrice = String(v);
  }
  return o;
}

const listSuppliersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createSupplierBodySchema = insertSupplierSchema.omit({ companyId: true, createdBy: true }).strict();
const updateSupplierBodySchema = insertSupplierSchema.omit({ companyId: true, createdBy: true }).partial().strict();

const createSupplierProductBodySchema = z.preprocess(
  coerceNumericFieldsForSupplierProductBody,
  insertSupplierProductSchema.omit({ supplierId: true, companyId: true }).strict()
);

const updateSupplierProductBodySchema = z.preprocess(
  coerceNumericFieldsForSupplierProductBody,
  insertSupplierProductSchema.omit({ supplierId: true, companyId: true, productId: true }).partial().strict()
);

function isSupplierProductUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  const constraint = (error as Error & { constraint?: string }).constraint;
  return (
    code === '23505' &&
    (constraint === 'unique_supplier_product' || error.message.includes('unique_supplier_product'))
  );
}

function formatSupplierDeleteBlockers(usage: Awaited<ReturnType<typeof storage.getSupplierUsage>>): string {
  const parts: string[] = [];
  if (usage.openPurchaseOrders > 0) {
    parts.push(`${usage.openPurchaseOrders} open purchase order${usage.openPurchaseOrders === 1 ? '' : 's'}`);
  }
  if (usage.unpaidInvoices > 0) {
    parts.push(`${usage.unpaidInvoices} unpaid invoice${usage.unpaidInvoices === 1 ? '' : 's'}`);
  }
  if (usage.openAccountsPayable > 0) {
    parts.push(`${usage.openAccountsPayable} open accounts payable row${usage.openAccountsPayable === 1 ? '' : 's'}`);
  }
  return `Supplier has ${parts.join(' and ')}; cannot delete`;
}

router.get('/', requireAnyPermission(ERP_SUPPLIER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listSuppliersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const result = await storage.getSuppliers(companyId, parsed.data);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing suppliers:');
  }
});

router.post('/', requireAnyPermission(['manage_suppliers']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createSupplierBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const created = await storage.createSupplier({
      ...parsed.data,
      companyId,
      createdBy: req.user?.id ?? null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating supplier:');
  }
});

router.get('/:id/products', requireAnyPermission(ERP_SUPPLIER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const supplier = await storage.getSupplier(id);
    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const rows = await storage.getSupplierProductsWithProductLabels(id);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing supplier products:');
  }
});

router.post('/:id/products', requireAnyPermission(['manage_suppliers']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const supplier = await storage.getSupplier(id);
    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const parsed = createSupplierProductBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const product = await storage.getProduct(parsed.data.productId);
    if (!product || product.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
    }
    let created;
    try {
      created = await storage.createSupplierProduct({
        ...parsed.data,
        supplierId: id,
        companyId,
      });
    } catch (error) {
      if (isSupplierProductUniqueConstraintError(error)) {
        const existing = await storage.getSupplierProductBySupplierAndProduct(id, parsed.data.productId);
        if (existing) {
          return res.json({ success: true, data: existing });
        }
        return res.status(400).json({ success: false, error: 'Product is already linked to this supplier' });
      }
      throw error;
    }
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error linking supplier product:');
  }
});

router.put('/:id/products/:spId', requireAnyPermission(['manage_suppliers']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const spId = parseInt(req.params.spId, 10);
    if (Number.isNaN(id) || Number.isNaN(spId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const supplier = await storage.getSupplier(id);
    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const existing = (await storage.getSupplierProducts(id)).find((r) => r.id === spId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Supplier product not found' });
    }
    const parsed = updateSupplierProductBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    let updated;
    try {
      updated = await storage.updateSupplierProduct(spId, parsed.data);
    } catch (error) {
      if (isSupplierProductUniqueConstraintError(error)) {
        return res.status(400).json({ success: false, error: 'Product is already linked to this supplier' });
      }
      throw error;
    }
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating supplier product:');
  }
});

router.get('/:id/usage', requireAnyPermission(ERP_SUPPLIER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const supplier = await storage.getSupplier(id);
    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const usage = await storage.getSupplierUsage(companyId, id);
    return res.json({ success: true, data: usage });
  } catch (error) {
    return handleRouteError(res, error, 'Error getting supplier usage:');
  }
});

router.delete('/:id/products/:spId', requireAnyPermission(['manage_suppliers']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const spId = parseInt(req.params.spId, 10);
    if (Number.isNaN(id) || Number.isNaN(spId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const supplier = await storage.getSupplier(id);
    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const existing = (await storage.getSupplierProducts(id)).find((r) => r.id === spId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Supplier product not found' });
    }
    const ok = await storage.deleteSupplierProduct(spId);
    return res.json({ success: true, data: { deleted: ok } });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting supplier product:');
  }
});

router.get('/:id', requireAnyPermission(ERP_SUPPLIER_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const row = await storage.getSupplier(id);
    if (!row || row.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleRouteError(res, error, 'Error getting supplier:');
  }
});

router.put('/:id', requireAnyPermission(['manage_suppliers']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getSupplier(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const parsed = updateSupplierBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const updated = await storage.updateSupplier(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating supplier:');
  }
});

router.delete('/:id', requireAnyPermission(['manage_suppliers']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const force = String(req.query.force ?? '').toLowerCase() === 'true';
    const existing = await storage.getSupplier(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const usage = await storage.getSupplierUsage(companyId, id);
    if (!force && (usage.openPurchaseOrders > 0 || usage.unpaidInvoices > 0 || usage.openAccountsPayable > 0)) {
      return res.status(400).json({
        success: false,
        error: formatSupplierDeleteBlockers(usage),
        usage,
      });
    }
    const ok = await storage.deleteSupplier(id);
    return res.json({ success: true, data: { deleted: ok } });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting supplier:');
  }
});

export default router;
