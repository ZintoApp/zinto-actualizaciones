import { Router, type Response } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import Papa from 'papaparse';
import path from 'path';
import { createErpImageUploadHandler } from './image-upload';
import fs from 'fs/promises';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import { dataUsageTracker } from '../../services/data-usage-tracker';
import {
  insertProductCategorySchema,
  insertProductBrandSchema,
  insertProductUnitSchema,
  insertProductTagMasterSchema,
  insertProductSchema,
  insertProductVariantSchema,
  insertProductPriceTierSchema,
} from '@shared/schema';
import {
  assertProductCategoryInCompany,
  assertVariantBelongsToProductAndCompany,
  ErpProductScopeError,
} from '../../erp-product-scoping';
import { ErpValidationError } from '../../storage';
import { sendValidationError } from '../../utils/erp-zod-validation';
import { validateAndNormalizeCustomFieldValues } from '../../utils/product-custom-field-values';
import { type ProductCustomFieldDefinition } from '@shared/schema';
import {
  buildProductIdentifierExportRows,
} from '../../utils/product-identifier-export';
import { parseExportFormat, sendTabularExport } from '../../utils/tabular-export';

const router = Router();
const PRODUCT_IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'erp', 'products', 'images');
const PRODUCT_IMAGE_URL_PREFIX = '/uploads/erp/products/images/';
const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const PRODUCT_IMAGE_MAX_SIZE = 10 * 1024 * 1024;

/** Catalog reads; inventory roles can list products/variants for stock workflows only. */
const ERP_PRODUCT_READ_PERMISSIONS = [
  'view_products',
  'manage_products',
  'view_inventory',
  'manage_inventory',
  'view_suppliers',
  'manage_suppliers',
];

export async function validateCategoryParentUpdate(params: {
  categoryId: number;
  companyId: number;
  parentCategoryId: number | null;
  getCategory: typeof storage.getProductCategory;
  assertCategoryInCompany: typeof assertProductCategoryInCompany;
}): Promise<void> {
  const { categoryId, companyId, parentCategoryId, getCategory, assertCategoryInCompany } = params;
  if (parentCategoryId == null) {
    return;
  }
  if (parentCategoryId === categoryId) {
    throw new Error('Category cannot be its own parent');
  }
  await assertCategoryInCompany(parentCategoryId, companyId);

  const visited = new Set<number>();
  let cursor: number | null = parentCategoryId;
  while (cursor != null) {
    if (cursor === categoryId) {
      throw new Error('Category parent would create a cycle');
    }
    if (visited.has(cursor)) {
      throw new Error('Category hierarchy contains a cycle');
    }
    visited.add(cursor);
    const row = await getCategory(cursor);
    if (!row) {
      break;
    }
    cursor = row.parentCategoryId;
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
  if (error instanceof ErpValidationError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof Error) {
    const m = error.message;
    if (
      /^Category cannot be its own parent/.test(m) ||
      /^Category parent would create a cycle/.test(m) ||
      /^Category hierarchy contains a cycle/.test(m) ||
      /^Kitchen station does not belong to this company$/.test(m) ||
      /^Brand does not belong to this company$/.test(m) ||
      /^Unit does not belong to this company$/.test(m)
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

function coerceNumericFieldsForProductBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['unitPrice', 'costPrice', 'weight', 'minStock'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

const estimatedDurationMinutesSchema = z
  .number()
  .int('erp.products.duration.validationWholeNumber')
  .positive('erp.products.duration.validationPositive')
  .nullable()
  .optional();

function normalizeEstimatedDurationForProduct<T extends { type?: string; estimatedDurationMinutes?: number | null }>(
  data: T,
  existingType?: string
): T {
  const effectiveType = data.type ?? existingType;
  if (effectiveType !== 'service') {
    return { ...data, estimatedDurationMinutes: null };
  }
  return data;
}

function coerceNumericFieldsForVariantBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['unitPrice', 'costPrice'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

function coerceNumericFieldsForTierBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  const v = o.unitPrice;
  if (typeof v === 'number' && Number.isFinite(v)) {
    o.unitPrice = String(v);
  }
  return o;
}

const listProductsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  categoryId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  isMenuItem: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase().trim();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return undefined;
  }, z.boolean().optional()),
  lowStock: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase().trim();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return undefined;
  }, z.boolean().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createProductCategoryBodySchema = insertProductCategorySchema.omit({ companyId: true }).strict();
const updateProductCategoryBodySchema = insertProductCategorySchema.omit({ companyId: true }).partial().strict();
const createProductBrandBodySchema = insertProductBrandSchema.omit({ companyId: true }).strict();
const updateProductBrandBodySchema = insertProductBrandSchema.omit({ companyId: true }).partial().strict();
const createProductUnitBodySchema = insertProductUnitSchema.omit({ companyId: true }).strict();
const updateProductUnitBodySchema = insertProductUnitSchema.omit({ companyId: true }).partial().strict();
const createProductTagBodySchema = insertProductTagMasterSchema.omit({ companyId: true }).strict();
const updateProductTagBodySchema = insertProductTagMasterSchema.omit({ companyId: true }).partial().strict();
const productImageUrlSchema = z
  .string()
  .trim()
  .max(512)
  .regex(
    /^\/uploads\/erp\/products\/images\/[A-Za-z0-9._-]+$/,
    'Product images must be uploaded product image URLs'
  );
const productImagesSchema = z
  .array(productImageUrlSchema)
  .max(20)
  .superRefine((images, ctx) => {
    if (new Set(images).size !== images.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Product image URLs must be unique',
      });
    }
  });

const expirationDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid expiration date',
  })
  .nullable()
  .optional();

const createProductBodySchema = z.preprocess(
  coerceNumericFieldsForProductBody,
  insertProductSchema
    .omit({ companyId: true, createdBy: true })
    .extend({
      estimatedDurationMinutes: estimatedDurationMinutesSchema,
      expirationDate: expirationDateSchema,
      images: productImagesSchema.optional(),
      modifiers: z.array(z.unknown()).optional(),
      comboItems: z.array(z.unknown()).optional(),
      recipeIngredients: z.array(z.unknown()).optional(),
    })
    .strict()
);
const updateProductBodySchema = z.preprocess(
  coerceNumericFieldsForProductBody,
  insertProductSchema
    .omit({ companyId: true, createdBy: true })
    .partial()
    .extend({
      estimatedDurationMinutes: estimatedDurationMinutesSchema,
      expirationDate: expirationDateSchema,
      images: productImagesSchema.optional(),
      modifiers: z.array(z.unknown()).optional(),
      comboItems: z.array(z.unknown()).optional(),
      recipeIngredients: z.array(z.unknown()).optional(),
    })
    .strict()
);

const createProductVariantBodySchema = z.preprocess(
  coerceNumericFieldsForVariantBody,
  insertProductVariantSchema.omit({ productId: true, companyId: true }).strict()
);
const updateProductVariantBodySchema = z.preprocess(
  coerceNumericFieldsForVariantBody,
  insertProductVariantSchema.omit({ productId: true, companyId: true }).partial().strict()
);

const createProductPriceTierBodySchema = z.preprocess(
  coerceNumericFieldsForTierBody,
  insertProductPriceTierSchema.omit({ productId: true, companyId: true }).strict()
);
const updateProductPriceTierBodySchema = z.preprocess(
  coerceNumericFieldsForTierBody,
  insertProductPriceTierSchema.omit({ productId: true, companyId: true }).partial().strict()
);

const PRODUCT_CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'];

const productCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    if (PRODUCT_CSV_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only CSV files are allowed'));
  },
});

const IMPORT_TEMPLATE_COLUMNS = [
  'Name',
  'SKU',
  'Description',
  'Type',
  'Status',
  'Sale Price',
  'Cost',
  'Barcode',
  'Weight',
  'Unit of Measure',
  'Is Taxable',
  'Min Stock',
  'Expiration Date',
  'Category',
  'Brand',
  'Variant Name',
  'Variant SKU',
  'Variant Price',
  'Variant Cost',
  'Variant Barcode',
];

const IMPORT_SAMPLE_ROW = [
  'Widget Pro',
  'WGT-001',
  'A sample product',
  'physical',
  'active',
  '29.99',
  '15.00',
  '012345678905',
  '0.5',
  'kg',
  'true',
  '10',
  '2027-12-31',
  'Electronics',
  'Acme',
  'Blue / Large',
  'WGT-001-BL',
  '29.99',
  '15.00',
  '012345678906',
];

const PRODUCT_IMPORT_TYPES = ['physical', 'service', 'digital'] as const;
const PRODUCT_IMPORT_STATUSES = ['active', 'inactive', 'draft', 'archived'] as const;

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

function hasVariantData(mapped: Record<string, string>): boolean {
  return !!(
    mapped.variantName?.trim() ||
    mapped.variantSku?.trim() ||
    mapped.variantUnitPrice?.trim() ||
    mapped.variantCostPrice?.trim()
  );
}

function parseOptionalFloat(value: string | undefined): number | undefined | null {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function parseIsTaxable(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const v = value.toLowerCase().trim();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

function parseExpirationDate(value: string | undefined): string | undefined | null {
  if (value === undefined || value.trim() === '') return undefined;
  const str = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return str;
}

function sampleValueForCustomFieldDefinition(def: ProductCustomFieldDefinition): string {
  if (def.defaultValue != null && def.defaultValue !== '') return def.defaultValue;
  switch (def.fieldType) {
    case 'text':
    case 'textarea':
      return 'Sample';
    case 'number':
      return '10';
    case 'date':
      return '2026-12-31';
    case 'checkbox':
      return 'true';
    case 'select': {
      const opts = Array.isArray(def.options) ? (def.options as string[]) : [];
      return opts[0] ?? '';
    }
    default:
      return '';
  }
}

function normalizeProductImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter((image): image is string => typeof image === 'string');
}

function productImageUrlToPath(url: string): string | null {
  const urlPath = url.split('?')[0];
  if (!urlPath.startsWith(PRODUCT_IMAGE_URL_PREFIX)) {
    return null;
  }
  const filename = urlPath.slice(PRODUCT_IMAGE_URL_PREFIX.length);
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  return path.join(PRODUCT_IMAGE_UPLOAD_DIR, filename);
}

async function cleanupProductImageUrls(companyId: number, imageUrls: string[]): Promise<void> {
  await Promise.all(
    imageUrls.map(async (url) => {
      const filePath = productImageUrlToPath(url);
      if (!filePath) return;
      try {
        const stats = await fs.stat(filePath);
        await fs.unlink(filePath);
        dataUsageTracker.trackFileDelete(companyId, stats.size).catch((err) => {
          console.error('Failed to track product image deletion:', err);
        });
      } catch (error) {
        console.error('Failed to clean up product image:', error);
      }
    })
  );
}

router.get('/', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }

    const { search, status, type, categoryId, isMenuItem, lowStock, limit, offset } = parsed.data;
    const result = await storage.getProducts(companyId, {
      search,
      status,
      type,
      categoryId,
      isMenuItem,
      lowStock,
      limit,
      offset,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing products:');
  }
});

router.post('/', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const parsed = createProductBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.categoryId != null) {
      await assertProductCategoryInCompany(parsed.data.categoryId, companyId);
    }
    if (parsed.data.kitchenStationId != null) {
      const station = await storage.getRestaurantKitchenStation(parsed.data.kitchenStationId);
      if (!station || station.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Kitchen station does not belong to this company' });
      }
    }
    const productPayload = normalizeEstimatedDurationForProduct(parsed.data);
    const definitions = await storage.getProductCustomFieldDefinitions(companyId);
    const hasActiveDefinitions = definitions.some((d) => d.isActive);
    let createPayload = { ...productPayload };
    if (parsed.data.customFields !== undefined || hasActiveDefinitions) {
      const normalizedCustomFields = validateAndNormalizeCustomFieldValues(
        definitions,
        (parsed.data.customFields as Record<string, unknown>) ?? {},
        { mode: 'create' }
      );
      createPayload = { ...createPayload, customFields: normalizedCustomFields };
    }
    const created = await storage.createProduct({
      ...createPayload,
      companyId,
      createdBy: req.user?.id ?? null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating product:');
  }
});

router.get('/categories', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const categories = await storage.getProductCategories(companyId);
    return res.json({ success: true, data: categories });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing product categories:');
  }
});

router.post('/categories', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const parsed = createProductCategoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.parentCategoryId != null) {
      await assertProductCategoryInCompany(parsed.data.parentCategoryId, companyId);
    }
    const created = await storage.createProductCategory({
      ...parsed.data,
      companyId,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating product category:');
  }
});

router.get('/brands', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const data = await storage.getProductBrands(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing product brands:');
  }
});

router.post('/brands', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const parsed = createProductBrandBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = await storage.createProductBrand({ ...parsed.data, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating product brand:');
  }
});

router.put('/brands/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductBrand(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Brand not found' });
    const parsed = updateProductBrandBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = await storage.updateProductBrand(id, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating product brand:');
  }
});

router.delete('/brands/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductBrand(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Brand not found' });
    const usageCount = await storage.countProductsByBrand(id);
    if (usageCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete brand while products still reference it',
      });
    }
    await storage.deleteProductBrand(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting product brand:');
  }
});

router.get('/units', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const data = await storage.getProductUnits(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing product units:');
  }
});

router.post('/units', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const parsed = createProductUnitBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = await storage.createProductUnit({ ...parsed.data, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating product unit:');
  }
});

router.put('/units/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductUnit(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Unit not found' });
    const parsed = updateProductUnitBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = await storage.updateProductUnit(id, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating product unit:');
  }
});

router.delete('/units/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductUnit(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Unit not found' });
    const usageCount = await storage.countProductsByUnit(id);
    if (usageCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete unit while products still reference it',
      });
    }
    await storage.deleteProductUnit(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting product unit:');
  }
});

router.get('/tags', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const data = await storage.getProductTagsMaster(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing product tags:');
  }
});

router.post('/tags', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const parsed = createProductTagBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = await storage.createProductTagMaster({ ...parsed.data, companyId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating product tag:');
  }
});

router.put('/tags/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductTagMaster(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Tag not found' });
    const parsed = updateProductTagBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = await storage.updateProductTagMaster(id, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating product tag:');
  }
});

router.delete('/tags/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductTagMaster(id);
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ success: false, error: 'Tag not found' });
    await storage.deleteProductTagMaster(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting product tag:');
  }
});

router.put('/categories/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductCategory(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const parsed = updateProductCategoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    await validateCategoryParentUpdate({
      categoryId: id,
      companyId,
      parentCategoryId: parsed.data.parentCategoryId ?? null,
      getCategory: storage.getProductCategory.bind(storage),
      assertCategoryInCompany: assertProductCategoryInCompany,
    });

    const updated = await storage.updateProductCategory(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating product category:');
  }
});

router.delete('/categories/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductCategory(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    await storage.deleteProductCategory(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting product category:');
  }
});

router.post('/images/upload', requireAnyPermission(['manage_products']), createErpImageUploadHandler('uploads/erp/products/images'));

router.get('/import/template', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const definitions = await storage.getProductCustomFieldDefinitions(companyId);
    const activeDefs = definitions.filter((d) => d.isActive);
    const columns = [...IMPORT_TEMPLATE_COLUMNS, ...activeDefs.map((d) => `CF: ${d.name}`)];
    const sampleValues = [
      ...IMPORT_SAMPLE_ROW,
      ...activeDefs.map((d) => sampleValueForCustomFieldDefinition(d)),
    ];

    const headerLine = columns.map(escapeCsvValue).join(',');
    const dataLine = sampleValues.map(escapeCsvValue).join(',');
    const csvBody = `${headerLine}\n${dataLine}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.csv"');
    return res.send(csvBody);
  } catch (error) {
    return handleRouteError(res, error, 'Error generating import template:');
  }
});

router.get('/export/identifiers', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const format = parseExportFormat(req.query.format);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });

    const [productsResult, variants] = await Promise.all([
      storage.getProducts(companyId, { limit: 100_000, offset: 0 }),
      storage.getProductVariantsByCompany(companyId),
    ]);

    const rows = buildProductIdentifierExportRows(
      productsResult.data.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        type: product.type,
      })),
      variants.map((variant) => ({
        productId: variant.productId,
        name: variant.name,
        sku: variant.sku,
      }))
    );

    return await sendTabularExport(res, {
      filename: 'product-identifiers',
      format,
      sheets: [{ name: 'Product Identifiers', columns: [
        { key: 'productId', header: 'Product ID', type: 'number', width: 14 },
        { key: 'sku', header: 'SKU', width: 20 },
        { key: 'variantSku', header: 'Variant SKU', width: 20 },
        { key: 'name', header: 'Name', width: 36 },
        { key: 'type', header: 'Type', width: 16 },
      ], rows }],
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error exporting product identifiers:');
  }
});

router.post('/import', requireAnyPermission(['manage_products']), (req, res) => {
  productCsvUpload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Product CSV upload error:', err);
      return res.status(400).json({
        success: false,
        error: 'UPLOAD_ERROR',
        message: err.message || 'Failed to upload file',
      });
    }

    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file was uploaded' });
      }

      let mapping: Record<string, string>;
      try {
        mapping = JSON.parse(req.body.mapping);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid mapping JSON' });
      }
      if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
        return res.status(400).json({ success: false, error: 'Mapping must be a plain object' });
      }

      const content = req.file.buffer.toString('utf-8');
      const result = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
      const fatalErrors = result.errors.filter((e) => e.type !== 'FieldMismatch');
      if (fatalErrors.length > 0) {
        return res.status(400).json({ success: false, error: fatalErrors[0].message });
      }

      const categories = await storage.getProductCategories(companyId);
      const brands = await storage.getProductBrands(companyId);
      const definitions = (await storage.getProductCustomFieldDefinitions(companyId)).filter(
        (d) => d.isActive
      );
      const categoryMap = new Map<string, number>(
        categories.map((c) => [c.name.toLowerCase(), c.id])
      );
      const brandMap = new Map<string, number>(brands.map((b) => [b.name.toLowerCase(), b.id]));

      type MappedRowEntry = { mapped: Record<string, string>; rowNumber: number };
      const groups = new Map<string, MappedRowEntry[]>();

      for (let i = 0; i < result.data.length; i++) {
        const csvRow = result.data[i];
        const mapped = applyMapping(csvRow, mapping);
        const groupKey =
          mapped.sku && mapped.sku.trim() !== '' ? mapped.sku.trim() : mapped.name?.trim() ?? '';
        if (!groupKey) continue;
        const entry: MappedRowEntry = { mapped, rowNumber: i + 2 };
        const existing = groups.get(groupKey);
        if (existing) {
          existing.push(entry);
        } else {
          groups.set(groupKey, [entry]);
        }
      }

      const productSkusToCheck = new Set<string>();
      const variantSkusToCheck = new Set<string>();
      for (const [, rows] of groups) {
        const productSku = rows[0].mapped.sku?.trim();
        if (productSku) productSkusToCheck.add(productSku);
        for (const { mapped } of rows) {
          const variantSku = mapped.variantSku?.trim();
          if (variantSku) variantSkusToCheck.add(variantSku);
        }
      }

      const variantSkusForLookup = new Set([...variantSkusToCheck, ...productSkusToCheck]);
      const [existingProductsBySku, existingVariantsBySku] = await Promise.all([
        storage.getProductsBySkus(companyId, [...productSkusToCheck]),
        storage.getVariantsBySkus(companyId, [...variantSkusForLookup]),
      ]);
      const takenProductSkus = new Set(
        existingProductsBySku.map((p) => p.sku).filter((s): s is string => !!s)
      );
      const takenVariantSkus = new Set(
        existingVariantsBySku.map((v) => v.sku).filter((s): s is string => !!s)
      );

      let imported = 0;
      let skipped = 0;
      let failed = 0;
      const errors: Array<{ row: number; sku?: string; name?: string; error: string }> = [];

      for (const [, rows] of groups) {
        const firstRow = rows[0].mapped;
        const primaryRowNumber = rows[0].rowNumber;
        const name = firstRow.name?.trim();
        const sku = firstRow.sku?.trim();

        if (!name) {
          failed++;
          errors.push({ row: primaryRowNumber, sku, error: 'Name is required' });
          continue;
        }

        const rawType = firstRow.type?.trim().toLowerCase();
        const type = rawType && (PRODUCT_IMPORT_TYPES as readonly string[]).includes(rawType)
          ? (rawType as (typeof PRODUCT_IMPORT_TYPES)[number])
          : 'physical';

        const rawStatus = firstRow.status?.trim().toLowerCase();
        const status = rawStatus && (PRODUCT_IMPORT_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as (typeof PRODUCT_IMPORT_STATUSES)[number])
          : 'draft';

        const unitPrice = parseOptionalFloat(firstRow.unitPrice);
        if (unitPrice === null) {
          failed++;
          errors.push({ row: primaryRowNumber, sku, name, error: 'Invalid Sale Price' });
          continue;
        }
        const costPrice = parseOptionalFloat(firstRow.costPrice);
        if (costPrice === null) {
          failed++;
          errors.push({ row: primaryRowNumber, sku, name, error: 'Invalid Cost Price' });
          continue;
        }
        const weight = parseOptionalFloat(firstRow.weight);
        if (weight === null) {
          failed++;
          errors.push({ row: primaryRowNumber, sku, name, error: 'Invalid Weight' });
          continue;
        }

        const minStock = parseOptionalFloat(firstRow.minStock);
        if (minStock === null) {
          failed++;
          errors.push({ row: primaryRowNumber, sku, name, error: 'Invalid Min Stock' });
          continue;
        }
        const expirationDate = parseExpirationDate(firstRow.expirationDate);
        if (expirationDate === null) {
          failed++;
          errors.push({ row: primaryRowNumber, sku, name, error: 'Invalid Expiration Date' });
          continue;
        }

        const rawCustomFields: Record<string, unknown> = {};
        for (const [internalField, value] of Object.entries(firstRow)) {
          if (internalField.startsWith('customField:')) {
            const fieldKey = internalField.slice('customField:'.length);
            if (fieldKey) {
              rawCustomFields[fieldKey] = value;
            }
          }
        }

        let normalizedCustomFields: Record<string, unknown>;
        try {
          normalizedCustomFields = validateAndNormalizeCustomFieldValues(definitions, rawCustomFields, {
            mode: 'create',
          });
        } catch (customFieldError) {
          if (customFieldError instanceof ErpValidationError) {
            failed++;
            errors.push({ row: primaryRowNumber, sku, name, error: customFieldError.message });
            continue;
          }
          throw customFieldError;
        }

        const isTaxable = parseIsTaxable(firstRow.isTaxable);
        const categoryName = firstRow.categoryName?.trim();
        const categoryId = categoryName
          ? (categoryMap.get(categoryName.toLowerCase()) ?? null)
          : null;
        const brandName = firstRow.brandName?.trim();
        const brandId = brandName ? (brandMap.get(brandName.toLowerCase()) ?? null) : null;

        if (sku) {
          if (takenProductSkus.has(sku) || takenVariantSkus.has(sku)) {
            skipped++;
            continue;
          }
        }

        try {
          const created = await storage.createProduct({
            name,
            sku: sku || null,
            description: firstRow.description?.trim() || null,
            type,
            status,
            unitPrice: unitPrice !== undefined ? String(unitPrice) : undefined,
            costPrice: costPrice !== undefined ? String(costPrice) : undefined,
            weight: weight !== undefined ? String(weight) : undefined,
            unitOfMeasure: firstRow.unitOfMeasure?.trim() || null,
            isTaxable,
            minStock: minStock !== undefined ? String(minStock) : undefined,
            expirationDate,
            customFields: normalizedCustomFields,
            categoryId,
            brandId,
            barcode: firstRow.barcode?.trim() || null,
            companyId,
            createdBy: req.user?.id ?? null,
          });

          imported++;
          if (sku) {
            takenProductSkus.add(sku);
          }

          for (const { mapped, rowNumber } of rows) {
            if (!hasVariantData(mapped)) {
              continue;
            }

            const variantSku = mapped.variantSku?.trim();
            if (variantSku) {
              if (takenVariantSkus.has(variantSku)) {
                skipped++;
                errors.push({
                  row: rowNumber,
                  sku: variantSku,
                  name,
                  error: 'Variant SKU already exists',
                });
                continue;
              }
            }

            const variantUnitPrice = parseOptionalFloat(mapped.variantUnitPrice);
            if (variantUnitPrice === null) {
              failed++;
              errors.push({ row: rowNumber, sku: variantSku, name, error: 'Invalid Variant Sale Price' });
              continue;
            }
            const variantCostPrice = parseOptionalFloat(mapped.variantCostPrice);
            if (variantCostPrice === null) {
              failed++;
              errors.push({ row: rowNumber, sku: variantSku, name, error: 'Invalid Variant Cost Price' });
              continue;
            }

            try {
              await storage.createProductVariant({
                name: mapped.variantName?.trim() || '',
                sku: variantSku || null,
                unitPrice: variantUnitPrice !== undefined ? String(variantUnitPrice) : undefined,
                costPrice: variantCostPrice !== undefined ? String(variantCostPrice) : undefined,
                barcode: mapped.variantBarcode?.trim() || null,
                productId: created.id,
                companyId,
              });
              if (variantSku) {
                takenVariantSkus.add(variantSku);
              }
            } catch (variantError) {
              failed++;
              errors.push({
                row: rowNumber,
                sku: variantSku,
                name,
                error: getErrorMessage(variantError),
              });
            }
          }
        } catch (productError) {
          failed++;
          errors.push({
            row: primaryRowNumber,
            sku,
            name,
            error: getErrorMessage(productError),
          });
        }
      }

      return res.json({
        success: true,
        data: { imported, skipped, failed, errors },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error importing products:');
    }
  });
});

router.get('/:id/variants', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const variants = await storage.getProductVariants(productId);
    return res.json({ success: true, data: variants });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing variants:');
  }
});

router.post('/:id/variants', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const parsed = createProductVariantBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const requestedSku = typeof parsed.data.sku === 'string' ? parsed.data.sku.trim() : '';
    if (requestedSku) {
      const [variantWithSku, productWithSku] = await Promise.all([
        storage.getVariantBySku(companyId, requestedSku),
        storage.getProductBySku(companyId, requestedSku),
      ]);
      if (variantWithSku || productWithSku) {
        return res.status(400).json({ success: false, error: 'SKU already exists in this company' });
      }
    }

    const created = await storage.createProductVariant({
      ...parsed.data,
      sku: requestedSku || null,
      productId,
      companyId,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating variant:');
  }
});

router.put('/:id/variants/:variantId', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const variantId = parseInt(req.params.variantId, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    await assertVariantBelongsToProductAndCompany(variantId, productId, companyId);

    const parsed = updateProductVariantBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const requestedSku = typeof parsed.data.sku === 'string' ? parsed.data.sku.trim() : '';
    if (requestedSku) {
      const [variantWithSku, productWithSku] = await Promise.all([
        storage.getVariantBySku(companyId, requestedSku, variantId),
        storage.getProductBySku(companyId, requestedSku),
      ]);
      if (variantWithSku || productWithSku) {
        return res.status(400).json({ success: false, error: 'SKU already exists in this company' });
      }
    }

    const updated = await storage.updateProductVariant(variantId, {
      ...parsed.data,
      ...(parsed.data.sku !== undefined ? { sku: requestedSku || null } : {}),
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating variant:');
  }
});

router.delete('/:id/variants/:variantId', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const variantId = parseInt(req.params.variantId, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    await assertVariantBelongsToProductAndCompany(variantId, productId, companyId);

    await storage.deleteProductVariant(variantId);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting variant:');
  }
});

router.get('/:id/price-tiers', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const tiers = await storage.getProductPriceTiers(productId);
    return res.json({ success: true, data: tiers });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing price tiers:');
  }
});

router.post('/:id/price-tiers', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const parsed = createProductPriceTierBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.variantId != null) {
      await assertVariantBelongsToProductAndCompany(parsed.data.variantId, productId, companyId);
    }

    const created = await storage.createProductPriceTier({
      ...parsed.data,
      productId,
      companyId,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating price tier:');
  }
});

router.put('/:id/price-tiers/:tierId', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const tierId = parseInt(req.params.tierId, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const tiers = await storage.getProductPriceTiers(productId);
    const existingTier = tiers.find((t) => t.id === tierId);
    if (!existingTier || existingTier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Price tier not found' });
    }

    const parsed = updateProductPriceTierBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }

    const updated = await storage.updateProductPriceTier(tierId, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating price tier:');
  }
});

router.delete('/:id/price-tiers/:tierId', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const productId = parseInt(req.params.id, 10);
    const tierId = parseInt(req.params.tierId, 10);
    const product = await storage.getProduct(productId);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const tiers = await storage.getProductPriceTiers(productId);
    const existingTier = tiers.find((t) => t.id === tierId);
    if (!existingTier || existingTier.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Price tier not found' });
    }

    await storage.deleteProductPriceTier(tierId);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting price tier:');
  }
});

router.get('/:id', requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    const product = await storage.getProduct(id);
    if (!product || product.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const [variants, priceTiers] = await Promise.all([
      storage.getProductVariants(id),
      storage.getProductPriceTiers(id),
    ]);

    return res.json({ success: true, data: { ...product, variants, priceTiers } });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching product:');
  }
});

router.put('/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProduct(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const parsed = updateProductBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.categoryId != null) {
      await assertProductCategoryInCompany(parsed.data.categoryId, companyId);
    }
    if (parsed.data.kitchenStationId != null) {
      const station = await storage.getRestaurantKitchenStation(parsed.data.kitchenStationId);
      if (!station || station.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Kitchen station does not belong to this company' });
      }
    }

    let productPayload = normalizeEstimatedDurationForProduct(parsed.data, existing.type);
    if (parsed.data.customFields !== undefined) {
      const definitions = await storage.getProductCustomFieldDefinitions(companyId);
      const activeKeys = new Set(
        definitions.filter((d) => d.isActive).map((d) => d.fieldKey)
      );
      const submittedCustomFields = parsed.data.customFields as Record<string, unknown>;
      const existingCustomFields = (existing.customFields as Record<string, unknown>) ?? {};

      // Reject unknown keys from the client-submitted payload only
      for (const key of Object.keys(submittedCustomFields)) {
        if (!activeKeys.has(key)) {
          throw new ErpValidationError(`Unknown custom field key: ${key}`);
        }
      }

      // Partition stored values into active vs stale (inactive/deleted definitions)
      const staleCustomFields: Record<string, unknown> = {};
      const existingActiveCustomFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(existingCustomFields)) {
        if (activeKeys.has(key)) {
          existingActiveCustomFields[key] = value;
        } else {
          staleCustomFields[key] = value;
        }
      }

      const mergedActiveCustomFields = {
        ...existingActiveCustomFields,
        ...submittedCustomFields,
      };
      const normalizedCustomFields = validateAndNormalizeCustomFieldValues(
        definitions,
        mergedActiveCustomFields,
        { mode: 'update' }
      );
      productPayload = {
        ...productPayload,
        customFields: { ...staleCustomFields, ...normalizedCustomFields },
      };
    }
    const updated = await storage.updateProduct(id, productPayload);
    if (parsed.data.images !== undefined) {
      const existingImages = normalizeProductImageUrls(existing.images);
      const submittedImages = normalizeProductImageUrls(parsed.data.images);
      const submittedSet = new Set(submittedImages);
      const removedImages = existingImages.filter((image) => !submittedSet.has(image));
      await cleanupProductImageUrls(companyId, removedImages);
    }
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating product:');
  }
});

router.delete('/:id', requireAnyPermission(['manage_products']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProduct(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    await storage.deleteProduct(id);
    await cleanupProductImageUrls(companyId, normalizeProductImageUrls(existing.images));
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting product:');
  }
});

export default router;
