import { Router, type Response } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import Papa from 'papaparse';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import {
  insertWarehouseSchema,
  insertStockLevelSchema,
  type InsertStockTransfer,
} from '@shared/schema';
import { assertVariantBelongsToProductAndCompany, ErpProductScopeError } from '../../erp-product-scoping';
import { ErpInventoryBusinessError } from '../../storage';
import { sendValidationError } from '../../utils/erp-zod-validation';
import { resolveInventoryImportWarehouseId } from '../../utils/inventory-import-warehouse';

const router = Router();

const ERP_INVENTORY_READ_PERMISSIONS = ['view_inventory', 'manage_inventory'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_transit', 'cancelled'],
  in_transit: ['cancelled'],
  completed: [],
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
  if (error instanceof ErpInventoryBusinessError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof Error) {
    const m = error.message;
    if (
      /^Invalid status transition/.test(m) ||
      /^Warehouses and items cannot be edited once a transfer leaves draft/.test(m) ||
      /^Transfers must include at least one valid line item/.test(m)
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

function optionalQueryBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

const listStockLevelsQuerySchema = z.object({
  warehouseId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  productId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  lowStockOnly: z.preprocess(optionalQueryBool, z.boolean().optional()),
  search: z.string().optional(),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const listStockMovementsQuerySchema = z.object({
  warehouseId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  productId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  movementType: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const listTransfersQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

function coerceNumericFieldsStockLevel(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['quantity', 'reservedQty', 'reorderPoint', 'reorderQty'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

const createWarehouseBodySchema = insertWarehouseSchema.omit({ companyId: true }).strict();
const updateWarehouseBodySchema = insertWarehouseSchema.omit({ companyId: true }).partial().strict();

const updateStockLevelBodySchema = z.preprocess(
  coerceNumericFieldsStockLevel,
  insertStockLevelSchema
    .omit({ companyId: true, productId: true, variantId: true, warehouseId: true, quantity: true, reservedQty: true })
    .partial()
    .strict()
);

const stockAdjustmentBodySchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int().optional(),
  warehouseId: z.number().int(),
  quantity: z.union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => v.trim() !== '' && Number.isFinite(Number(v)), { message: 'Quantity must be a valid number' })
    .refine((v) => Number(v) !== 0, { message: 'Quantity must not be zero' }),
  notes: z.string().optional(),
});

const transferItemSchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int().nullable().optional(),
  quantity: z.union([z.string(), z.number()]).transform((v) => String(v)),
  notes: z.string().optional(),
});

const createTransferBodySchema = z
  .object({
    fromWarehouseId: z.number().int(),
    toWarehouseId: z.number().int(),
    transferNumber: z.string().optional(),
    items: z.array(transferItemSchema).min(1, 'At least one line item is required'),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    data.items.forEach((item, i) => {
      const q = Number(item.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quantity must be a positive number',
          path: ['items', i, 'quantity'],
        });
      }
    });
  });

const updateTransferBodySchema = z
  .object({
    fromWarehouseId: z.number().int().optional(),
    toWarehouseId: z.number().int().optional(),
    status: z.enum(['draft', 'in_transit', 'completed', 'cancelled']).optional(),
    items: z.array(transferItemSchema).optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.items) return;
    data.items.forEach((item, i) => {
      const q = Number(item.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quantity must be a positive number',
          path: ['items', i, 'quantity'],
        });
      }
    });
  });

function bodyTouchesTransferDraftLockedFields(body: z.infer<typeof updateTransferBodySchema>): boolean {
  return 'fromWarehouseId' in body || 'toWarehouseId' in body || 'items' in body;
}

function hasValidTransferItems(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }
  return items.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const candidate = item as { productId?: unknown; quantity?: unknown };
    return Number.isInteger(candidate.productId) && Number.isFinite(Number(candidate.quantity)) && Number(candidate.quantity) > 0;
  });
}

function assertTransferReadyForTransit(items: unknown): void {
  if (!hasValidTransferItems(items)) {
    throw new Error('Transfers must include at least one valid line item before moving to in_transit');
  }
}

const INVENTORY_CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'];

const inventoryCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    if (INVENTORY_CSV_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only CSV files are allowed'));
  },
});

const INVENTORY_IMPORT_TEMPLATE_COLUMNS = [
  'Product ID',
  'SKU',
  'Variant SKU',
  'Warehouse ID',
  'Quantity',
  'Notes',
];

const INVENTORY_IMPORT_SAMPLE_ROW = [
  '1',
  'WGT-001',
  'WGT-001-BL',
  '1',
  '100',
  'Initial stock count',
];

const INVENTORY_IMPORT_MODES = ['set_quantity', 'adjust_quantity'] as const;
type InventoryImportMode = (typeof INVENTORY_IMPORT_MODES)[number];

type InventoryImportRowError = {
  row: number;
  productId?: string;
  sku?: string;
  variantSku?: string;
  errorCode: string;
  errorParams?: Record<string, string>;
};

function importJsonError(
  res: Response,
  status: number,
  errorCode: string,
  errorParams?: Record<string, string>
) {
  return res.status(status).json({
    success: false,
    errorCode,
    ...(errorParams ? { errorParams } : {}),
  });
}

function pushRowImportError(
  errors: InventoryImportRowError[],
  context: { row: number; productId?: string; sku?: string; variantSku?: string },
  errorCode: string,
  errorParams?: Record<string, string>
) {
  errors.push({
    ...context,
    errorCode,
    ...(errorParams ? { errorParams } : {}),
  });
}

function mapRowCatchError(error: unknown): { errorCode: string; errorParams?: Record<string, string> } {
  if (error instanceof ErpProductScopeError) {
    if (error.message === 'Variant does not belong to this product') {
      return { errorCode: 'variant_does_not_belong_to_product' };
    }
    return { errorCode: 'row_error' };
  }
  if (error instanceof ErpInventoryBusinessError) {
    const movementQty = error.message.match(
      /^Invalid stock movement quantity for product (\d+)(?: \(variant (\d+)\))?$/
    );
    if (movementQty) {
      return {
        errorCode: 'invalid_stock_movement_quantity',
        errorParams: {
          productId: movementQty[1],
          ...(movementQty[2] ? { variantId: movementQty[2] } : {}),
        },
      };
    }
    const invalidLevel = error.message.match(
      /^Invalid stock level at warehouse for product (\d+)(?: \(variant (\d+)\))?$/
    );
    if (invalidLevel) {
      return {
        errorCode: 'invalid_stock_level_at_warehouse',
        errorParams: {
          productId: invalidLevel[1],
          ...(invalidLevel[2] ? { variantId: invalidLevel[2] } : {}),
        },
      };
    }
    const insufficient = error.message.match(
      /^Insufficient stock at warehouse for product (\d+)(?: \(variant (\d+)\))?$/
    );
    if (insufficient) {
      return {
        errorCode: 'insufficient_stock_at_warehouse',
        errorParams: {
          productId: insufficient[1],
          ...(insufficient[2] ? { variantId: insufficient[2] } : {}),
        },
      };
    }
    const invalidCount = error.message.match(
      /^Invalid stock count quantity for product (\d+)(?: \(variant (\d+)\))?$/
    );
    if (invalidCount) {
      return {
        errorCode: 'invalid_stock_count_quantity',
        errorParams: {
          productId: invalidCount[1],
          ...(invalidCount[2] ? { variantId: invalidCount[2] } : {}),
        },
      };
    }
  }
  return { errorCode: 'row_error' };
}

function applyMapping(
  csvRow: Record<string, string>,
  mapping: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [csvColumn, internalField] of Object.entries(mapping)) {
    if (internalField && csvRow[csvColumn] !== undefined) {
      result[internalField] = csvRow[csvColumn];
    }
  }
  return result;
}

function escapeCsvValue(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
    ? `"${escaped}"`
    : escaped;
}

function parseStrictImportInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) return null;
  return n;
}

function parseImportQuantity(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function optionalFormInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const trimmed = String(value).trim();
  if (trimmed === '') return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) return undefined;
  return n;
}

function isInventoryImportRowEmpty(mapped: Record<string, string>): boolean {
  return !(
    mapped.productId?.trim() ||
    mapped.sku?.trim() ||
    mapped.variantSku?.trim() ||
    mapped.warehouseId?.trim() ||
    mapped.quantity?.trim() ||
    mapped.notes?.trim()
  );
}

router.get('/import/template', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const headerLine = INVENTORY_IMPORT_TEMPLATE_COLUMNS.join(',');
    const dataLine = INVENTORY_IMPORT_SAMPLE_ROW.map(escapeCsvValue).join(',');
    const csvBody = `${headerLine}\n${dataLine}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_import_template.csv"');
    return res.send(csvBody);
  } catch (error) {
    return handleRouteError(res, error, 'Error generating inventory import template:');
  }
});

router.post('/import', requireAnyPermission(['manage_inventory']), (req, res) => {
  inventoryCsvUpload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Inventory CSV upload error:', err);
      const isInvalidType = err instanceof Error && err.message === 'Only CSV files are allowed';
      return importJsonError(
        res,
        400,
        isInvalidType ? 'invalid_file_type' : 'upload_failed'
      );
    }

    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return importJsonError(res, 400, 'company_required');
      }
      if (!req.file) {
        return importJsonError(res, 400, 'no_file_uploaded');
      }

      const rawMode = req.body.mode;
      if (!rawMode || !(INVENTORY_IMPORT_MODES as readonly string[]).includes(String(rawMode))) {
        return importJsonError(res, 400, 'invalid_mode');
      }
      const mode = rawMode as InventoryImportMode;

      let mapping: Record<string, string>;
      try {
        mapping = JSON.parse(req.body.mapping);
      } catch {
        return importJsonError(res, 400, 'invalid_mapping_json');
      }
      if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
        return importJsonError(res, 400, 'invalid_mapping_object');
      }

      const uploadWarehouseId = optionalFormInt(req.body.warehouseId);
      if (req.body.warehouseId != null && req.body.warehouseId !== '' && uploadWarehouseId == null) {
        return importJsonError(res, 400, 'invalid_upload_warehouse_id');
      }

      const content = req.file.buffer.toString('utf-8');
      const result = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
      const fatalErrors = result.errors.filter((e) => e.type !== 'FieldMismatch');
      if (fatalErrors.length > 0) {
        return importJsonError(res, 400, 'csv_parse_error');
      }

      type MappedRowEntry = { mapped: Record<string, string>; rowNumber: number };
      const entries: MappedRowEntry[] = [];
      let skipped = 0;

      for (let i = 0; i < result.data.length; i++) {
        const mapped = applyMapping(result.data[i], mapping);
        if (isInventoryImportRowEmpty(mapped)) {
          skipped++;
          continue;
        }
        entries.push({ mapped, rowNumber: i + 2 });
      }

      const productIdsToLoad = new Set<number>();
      const productSkusToLoad = new Set<string>();
      const variantSkusToLoad = new Set<string>();

      for (const { mapped } of entries) {
        const rawProductId = mapped.productId?.trim();
        if (rawProductId) {
          const n = parseStrictImportInt(rawProductId);
          if (n != null) productIdsToLoad.add(n);
        }
        const sku = mapped.sku?.trim();
        if (sku) productSkusToLoad.add(sku);
        const variantSku = mapped.variantSku?.trim();
        if (variantSku) variantSkusToLoad.add(variantSku);
      }

      const [productsByIdList, productsBySkuList, variantsBySkuList, warehouses] = await Promise.all([
        storage.getProductsByIds(companyId, [...productIdsToLoad]),
        storage.getProductsBySkus(companyId, [...productSkusToLoad]),
        storage.getVariantsBySkus(companyId, [...variantSkusToLoad]),
        storage.getWarehouses(companyId),
      ]);

      for (const variant of variantsBySkuList) {
        productIdsToLoad.add(variant.productId);
      }

      const productsById = new Map(productsByIdList.map((p) => [p.id, p]));
      const missingProductIds = [...productIdsToLoad].filter((id) => !productsById.has(id));
      if (missingProductIds.length > 0) {
        const extraProducts = await storage.getProductsByIds(companyId, missingProductIds);
        for (const product of extraProducts) {
          productsById.set(product.id, product);
        }
      }
      for (const product of productsBySkuList) {
        productsById.set(product.id, product);
      }

      const productsBySku = new Map(
        productsBySkuList.filter((p): p is typeof p & { sku: string } => !!p.sku).map((p) => [p.sku, p])
      );
      const variantsBySku = new Map(
        variantsBySkuList.filter((v): v is typeof v & { sku: string } => !!v.sku).map((v) => [v.sku, v])
      );
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

      if (uploadWarehouseId != null) {
        const uploadWarehouse = warehouseMap.get(uploadWarehouseId);
        if (!uploadWarehouse || uploadWarehouse.companyId !== companyId) {
          return importJsonError(res, 400, 'warehouse_not_found');
        }
      }

      const referencedProductIds = new Set<number>([
        ...productsById.keys(),
        ...variantsBySkuList.map((v) => v.productId),
      ]);
      const productHasVariants = new Map<number, boolean>();
      await Promise.all(
        [...referencedProductIds].map(async (productId) => {
          const variants = await storage.getProductVariants(productId);
          productHasVariants.set(productId, variants.length > 0);
        })
      );

      let imported = 0;
      let failed = 0;
      const errors: InventoryImportRowError[] = [];

      for (const { mapped, rowNumber } of entries) {
        const rowProductIdRaw = mapped.productId?.trim();
        const rowSku = mapped.sku?.trim();
        const rowVariantSku = mapped.variantSku?.trim();
        const rowErrorContext = {
          row: rowNumber,
          productId: rowProductIdRaw,
          sku: rowSku,
          variantSku: rowVariantSku,
        };

        let resolvedProductId: number | undefined;
        let resolvedVariantId: number | undefined;

        if (rowVariantSku) {
          const variant = variantsBySku.get(rowVariantSku);
          if (!variant) {
            failed++;
            pushRowImportError(errors, rowErrorContext, 'variant_not_found');
            continue;
          }
          resolvedProductId = variant.productId;
          resolvedVariantId = variant.id;
        }

        if (rowProductIdRaw) {
          const parsedProductId = parseStrictImportInt(rowProductIdRaw);
          if (parsedProductId == null) {
            failed++;
            pushRowImportError(errors, rowErrorContext, 'invalid_product_id');
            continue;
          }
          const productById = productsById.get(parsedProductId);
          if (!productById) {
            failed++;
            pushRowImportError(errors, rowErrorContext, 'product_not_found');
            continue;
          }
          if (resolvedProductId != null && resolvedProductId !== parsedProductId) {
            failed++;
            pushRowImportError(errors, rowErrorContext, 'product_id_variant_mismatch');
            continue;
          }
          resolvedProductId = parsedProductId;
        }

        if (rowSku) {
          const productBySku = productsBySku.get(rowSku);
          if (!productBySku) {
            failed++;
            pushRowImportError(errors, rowErrorContext, 'product_not_found_for_sku');
            continue;
          }
          if (resolvedProductId != null && resolvedProductId !== productBySku.id) {
            failed++;
            pushRowImportError(errors, rowErrorContext, 'sku_identifier_mismatch');
            continue;
          }
          resolvedProductId = productBySku.id;
        }

        if (resolvedProductId == null) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'product_identifier_required');
          continue;
        }

        const product = productsById.get(resolvedProductId);
        if (!product || product.companyId !== companyId) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'product_not_found');
          continue;
        }

        if (resolvedVariantId != null) {
          try {
            await assertVariantBelongsToProductAndCompany(resolvedVariantId, resolvedProductId, companyId);
          } catch (variantError) {
            failed++;
            const mapped = mapRowCatchError(variantError);
            pushRowImportError(errors, rowErrorContext, mapped.errorCode, mapped.errorParams);
            continue;
          }
        }

        if (productHasVariants.get(resolvedProductId) && resolvedVariantId == null) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'variant_required_for_product');
          continue;
        }

        const warehouseResolve = resolveInventoryImportWarehouseId({
          rowWarehouseIdRaw: mapped.warehouseId,
          uploadWarehouseId,
        });
        if (!warehouseResolve.ok) {
          failed++;
          pushRowImportError(errors, rowErrorContext, warehouseResolve.errorCode);
          continue;
        }
        const resolvedWarehouseId = warehouseResolve.warehouseId;

        const warehouse = warehouseMap.get(resolvedWarehouseId);
        if (!warehouse || warehouse.companyId !== companyId) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'warehouse_not_found');
          continue;
        }

        const quantity = parseImportQuantity(mapped.quantity);
        if (quantity == null) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'quantity_required_invalid');
          continue;
        }

        if (mode === 'adjust_quantity' && quantity === 0) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'quantity_must_not_be_zero');
          continue;
        }

        if (mode === 'set_quantity' && quantity < 0) {
          failed++;
          pushRowImportError(errors, rowErrorContext, 'quantity_cannot_be_negative');
          continue;
        }

        try {
          if (mode === 'set_quantity') {
            await storage.recordStockSet(companyId, {
              productId: resolvedProductId,
              variantId: resolvedVariantId,
              warehouseId: resolvedWarehouseId,
              quantity: String(quantity),
              notes: mapped.notes?.trim() || undefined,
              userId: req.user?.id,
            });
          } else {
            await storage.recordStockAdjustment(companyId, {
              productId: resolvedProductId,
              variantId: resolvedVariantId,
              warehouseId: resolvedWarehouseId,
              quantity: String(quantity),
              notes: mapped.notes?.trim() || undefined,
              userId: req.user?.id,
            });
          }
          imported++;
        } catch (rowError) {
          failed++;
          const mapped = mapRowCatchError(rowError);
          pushRowImportError(errors, rowErrorContext, mapped.errorCode, mapped.errorParams);
        }
      }

      return res.json({
        success: true,
        data: { imported, skipped, failed, errors },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error importing inventory:');
    }
  });
});

router.get('/warehouses', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await storage.getWarehouses(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing warehouses:');
  }
});

router.post('/warehouses', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createWarehouseBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const created = await storage.createWarehouse({
      ...parsed.data,
      companyId,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating warehouse:');
  }
});

router.get('/warehouses/:id', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const row = await storage.getWarehouse(id);
    if (!row || row.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Warehouse not found' });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleRouteError(res, error, 'Error getting warehouse:');
  }
});

router.put('/warehouses/:id', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getWarehouse(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Warehouse not found' });
    }
    const parsed = updateWarehouseBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const updated = await storage.updateWarehouse(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating warehouse:');
  }
});

router.delete('/warehouses/:id', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getWarehouse(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Warehouse not found' });
    }
    const ok = await storage.deleteWarehouse(id);
    return res.json({ success: true, data: { deleted: ok } });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting warehouse:');
  }
});

router.get('/summary', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const summary = await storage.getInventorySummary(companyId);
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading inventory summary:');
  }
});

router.get('/stock-levels', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listStockLevelsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    // lowStockOnly now reflects product-level minStock using company-wide stock totals.
    const { warehouseId, productId, lowStockOnly, search, limit, offset } = parsed.data;
    const result = await storage.getStockLevels(companyId, {
      warehouseId,
      productId,
      lowStockOnly,
      search,
      limit,
      offset,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing stock levels:');
  }
});

router.put('/stock-levels/:id', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getStockLevel(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Stock level not found' });
    }
    const parsed = updateStockLevelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const updated = await storage.updateStockLevel(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating stock level:');
  }
});

router.get('/stock-movements', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listStockMovementsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { warehouseId, productId, movementType, dateFrom, dateTo, limit, offset } = parsed.data;
    const result = await storage.getStockMovements(companyId, {
      warehouseId,
      productId,
      movementType,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing stock movements:');
  }
});

router.post('/stock-adjustments', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = stockAdjustmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { productId, variantId, warehouseId, quantity, notes } = parsed.data;
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Product not found' });
    }
    const warehouse = await storage.getWarehouse(warehouseId);
    if (!warehouse || warehouse.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Warehouse not found' });
    }
    const variants = await storage.getProductVariants(productId);
    if (variants.length > 0 && variantId == null) {
      return res.status(400).json({
        success: false,
        error: 'Variant is required for products that use variants',
      });
    }
    if (variantId != null) {
      await assertVariantBelongsToProductAndCompany(variantId, productId, companyId);
    }
    const movement = await storage.recordStockAdjustment(companyId, {
      productId,
      variantId,
      warehouseId,
      quantity,
      notes,
      userId: req.user?.id,
    });
    return res.json({ success: true, data: movement });
  } catch (error) {
    return handleRouteError(res, error, 'Error recording stock adjustment:');
  }
});

router.get('/transfers', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listTransfersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { status, limit, offset } = parsed.data;
    const result = await storage.getStockTransfers(companyId, { status, limit, offset });
    const warehouses = await storage.getWarehouses(companyId);
    const whMap = new Map(warehouses.map((w) => [w.id, w]));
    const enriched = result.data.map((t) => ({
      ...t,
      fromWarehouseName: whMap.get(t.fromWarehouseId)?.name ?? null,
      toWarehouseName: whMap.get(t.toWarehouseId)?.name ?? null,
    }));
    return res.json({ success: true, data: { data: enriched, total: result.total } });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing transfers:');
  }
});

router.post('/transfers', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createTransferBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { fromWarehouseId, toWarehouseId, transferNumber, items, notes } = parsed.data;
    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ success: false, error: 'Warehouses must differ' });
    }
    const fromWh = await storage.getWarehouse(fromWarehouseId);
    const toWh = await storage.getWarehouse(toWarehouseId);
    if (!fromWh || fromWh.companyId !== companyId || !toWh || toWh.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Invalid warehouse' });
    }
    for (const item of items) {
      const p = await storage.getProduct(item.productId);
      if (!p || p.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Invalid product in transfer' });
      }
      const variants = await storage.getProductVariants(item.productId);
      if (variants.length > 0 && item.variantId == null) {
        return res.status(400).json({
          success: false,
          error: 'Variant is required for transfer lines when the product has variants',
        });
      }
      if (item.variantId != null) {
        await assertVariantBelongsToProductAndCompany(item.variantId, item.productId, companyId);
      }
    }
    const created = await storage.createStockTransfer({
      companyId,
      transferNumber: transferNumber ?? null,
      fromWarehouseId,
      toWarehouseId,
      status: 'draft',
      items: items as InsertStockTransfer['items'],
      notes: notes ?? null,
      createdBy: req.user?.id ?? null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating transfer:');
  }
});

router.get('/transfers/:id', requireAnyPermission(ERP_INVENTORY_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const row = await storage.getStockTransfer(id);
    if (!row || row.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Transfer not found' });
    }
    const warehouses = await storage.getWarehouses(companyId);
    const whMap = new Map(warehouses.map((w) => [w.id, w]));
    return res.json({
      success: true,
      data: {
        ...row,
        fromWarehouseName: whMap.get(row.fromWarehouseId)?.name ?? null,
        toWarehouseName: whMap.get(row.toWarehouseId)?.name ?? null,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error getting transfer:');
  }
});

router.put('/transfers/:id', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getStockTransfer(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Transfer not found' });
    }
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Transfer cannot be updated' });
    }
    const parsed = updateTransferBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (existing.status !== 'draft' && bodyTouchesTransferDraftLockedFields(parsed.data)) {
      return res.status(400).json({
        success: false,
        error: 'Warehouses and items cannot be edited once a transfer leaves draft',
      });
    }
    const { fromWarehouseId, toWarehouseId, status, items, notes } = parsed.data;
    if (fromWarehouseId != null && toWarehouseId != null && fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ success: false, error: 'Warehouses must differ' });
    }
    const nextFrom = fromWarehouseId ?? existing.fromWarehouseId;
    const nextTo = toWarehouseId ?? existing.toWarehouseId;
    if (nextFrom === nextTo) {
      return res.status(400).json({ success: false, error: 'Warehouses must differ' });
    }
    if (fromWarehouseId != null) {
      const w = await storage.getWarehouse(fromWarehouseId);
      if (!w || w.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Invalid warehouse' });
      }
    }
    if (toWarehouseId != null) {
      const w = await storage.getWarehouse(toWarehouseId);
      if (!w || w.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Invalid warehouse' });
      }
    }
    if (items) {
      for (const item of items) {
        const p = await storage.getProduct(item.productId);
        if (!p || p.companyId !== companyId) {
          return res.status(400).json({ success: false, error: 'Invalid product in transfer' });
        }
        const variants = await storage.getProductVariants(item.productId);
        if (variants.length > 0 && item.variantId == null) {
          return res.status(400).json({
            success: false,
            error: 'Variant is required for transfer lines when the product has variants',
          });
        }
        if (item.variantId != null) {
          await assertVariantBelongsToProductAndCompany(item.variantId, item.productId, companyId);
        }
      }
    }
    const updates: Record<string, unknown> = {};
    if (fromWarehouseId !== undefined) updates.fromWarehouseId = fromWarehouseId;
    if (toWarehouseId !== undefined) updates.toWarehouseId = toWarehouseId;
    if (status !== undefined) {
      if (status === 'completed') {
        return res.status(400).json({ success: false, error: 'Use the complete endpoint to finish a transfer' });
      }
      assertStatusTransition(existing.status, status);
      if (status === 'in_transit') {
        assertTransferReadyForTransit(items ?? existing.items);
      }
      updates.status = status;
    }
    if (items !== undefined) updates.items = items;
    if (notes !== undefined) updates.notes = notes;

    const updated = await storage.updateStockTransfer(id, updates as Partial<InsertStockTransfer>);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating transfer:');
  }
});

router.post('/transfers/:id/complete', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getStockTransfer(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Transfer not found' });
    }
    const uid = req.user?.id;
    if (uid == null) {
      return res.status(400).json({ success: false, error: 'User required' });
    }
    const updated = await storage.completeStockTransfer(id, uid);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error completing transfer:');
  }
});

router.post('/transfers/:id/cancel', requireAnyPermission(['manage_inventory']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getStockTransfer(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Transfer not found' });
    }
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Transfer cannot be cancelled' });
    }
    const updated = await storage.updateStockTransfer(id, { status: 'cancelled' });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error cancelling transfer:');
  }
});

export default router;
