import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage, ErpValidationError } from '../../storage';
import { sendValidationError } from '../../utils/erp-zod-validation';
import { insertProductCustomFieldDefinitionSchema } from '@shared/schema';
import { erpCustomFieldReadPermissions, type ErpCustomFieldEntity } from '@shared/erp-custom-fields';
import { getCompanyErpBusinessType } from './business-type';

export function createErpCustomFieldRouter(entityType: ErpCustomFieldEntity = 'product') {
const router = Router();
router.use(async (req, res, next) => {
  try {
    if (entityType !== 'product' && await getCompanyErpBusinessType(req.user!.companyId!) !== 'real_estate') {
      res.status(403).json({ error: 'Real Estate ERP is not enabled' }); return;
    }
    next();
  } catch (error) { next(error); }
});
const writeAccess = entityType === 'product'
  ? [requireAnyPermission(['manage_products'])]
  : [requireAnyPermission(['manage_erp_settings']), requireAnyPermission(['manage_real_estate_settings'])];

/** Catalog reads; inventory roles can list products/variants for stock workflows only. */
const ERP_PRODUCT_READ_PERMISSIONS = erpCustomFieldReadPermissions(entityType);
const readAccess = entityType === 'product' ? [requireAnyPermission(ERP_PRODUCT_READ_PERMISSIONS)] : [
  (req: Parameters<ReturnType<typeof requireAnyPermission>>[0], res: Parameters<ReturnType<typeof requireAnyPermission>>[1], next: Parameters<ReturnType<typeof requireAnyPermission>>[2]) => {
    // Configuration readers may inspect definitions without receiving entity values.
    requireAnyPermission([...ERP_PRODUCT_READ_PERMISSIONS,'view_erp_settings','manage_erp_settings'])(req,res,next);
  },
];

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'] as const;

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
  if (error instanceof ErpValidationError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505' && dbError.constraint === 'unique_company_custom_field_key') {
    return res.status(409).json({ success: false, error: 'field key already exists' });
  }
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: getErrorMessage(error) });
}

function deriveFieldKey(name: string): string {
  const key = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!key) {
    throw new ErpValidationError('Field key cannot be derived from name');
  }
  return key;
}

function validateDefinitionShape(effective: {
  fieldType: string;
  options?: unknown;
  defaultValue?: string | null;
}): { options: string[] } {
  const { fieldType, defaultValue } = effective;
  let options: string[];

  if (fieldType === 'select') {
    if (!Array.isArray(effective.options) || effective.options.length === 0) {
      throw new ErpValidationError('Select fields require at least one option');
    }
    const stringOptions = effective.options.map((o) => String(o).trim());
    const nonEmpty = stringOptions.filter((s) => s.length > 0);
    if (nonEmpty.length === 0) {
      throw new ErpValidationError('Select options must be non-empty strings');
    }
    if (new Set(nonEmpty).size !== nonEmpty.length) {
      throw new ErpValidationError('Select options must be unique');
    }
    options = nonEmpty;
  } else {
    options = [];
  }

  if (defaultValue != null && defaultValue !== '') {
    if (fieldType === 'number') {
      const n = Number(defaultValue);
      if (!Number.isFinite(n)) {
        throw new ErpValidationError('Default value must be a finite number for number fields');
      }
    } else if (fieldType === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultValue)) {
        throw new ErpValidationError('Default value must be a valid date (YYYY-MM-DD) for date fields');
      }
      const d = new Date(defaultValue);
      if (Number.isNaN(d.getTime())) {
        throw new ErpValidationError('Default value must be a valid date (YYYY-MM-DD) for date fields');
      }
    } else if (fieldType === 'checkbox') {
      if (defaultValue !== 'true' && defaultValue !== 'false') {
        throw new ErpValidationError("Default value for checkbox fields must be 'true' or 'false'");
      }
    } else if (fieldType === 'select') {
      if (!options.includes(defaultValue)) {
        throw new ErpValidationError('Default value must be one of the select options');
      }
    }
  }

  return { options };
}

const nameSchema = z.string().trim().min(1);

const createBodySchema = insertProductCustomFieldDefinitionSchema
  .omit({ companyId: true, entityType: true })
  .extend({
    name: nameSchema,
    fieldKey: z.string().optional(),
    fieldType: z.enum(FIELD_TYPES),
    options: z.array(z.string()).optional(),
  })
  .strict();

const updateBodySchema = insertProductCustomFieldDefinitionSchema
  .omit({ companyId: true, fieldKey: true, entityType: true })
  .extend({
    name: nameSchema,
    fieldType: z.enum(FIELD_TYPES).optional(),
    options: z.array(z.string()).optional(),
  })
  .partial()
  .strict();

router.get('/', ...readAccess, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const data = await storage.getProductCustomFieldDefinitions(companyId, entityType);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing product custom field definitions:');
  }
});

router.post('/', ...writeAccess, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);

    let fieldKey: string;
    if (parsed.data.fieldKey) {
      if (!/^[a-z0-9_]+$/.test(parsed.data.fieldKey)) {
        throw new ErpValidationError('Field key must contain only lowercase letters, numbers, and underscores');
      }
      fieldKey = parsed.data.fieldKey;
    } else {
      fieldKey = deriveFieldKey(parsed.data.name);
    }

    const { options } = validateDefinitionShape({
      fieldType: parsed.data.fieldType,
      options: parsed.data.options,
      defaultValue: parsed.data.defaultValue,
    });

    const data = await storage.createProductCustomFieldDefinition({
      ...parsed.data,
      fieldKey,
      options,
      companyId,
      entityType,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating product custom field definition:');
  }
});

router.put('/:id', ...writeAccess, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductCustomFieldDefinition(id);
    if (!existing || existing.companyId !== companyId || existing.entityType !== entityType) {
      return res.status(404).json({ success: false, error: 'Custom field definition not found' });
    }

    const { fieldKey: _fieldKey, companyId: _companyId, ...bodyForUpdate } = req.body as Record<
      string,
      unknown
    >;
    const parsed = updateBodySchema.safeParse(bodyForUpdate);
    if (!parsed.success) return sendValidationError(res, parsed.error);

    const effectiveFieldType = parsed.data.fieldType ?? existing.fieldType;
    const effectiveOptions = parsed.data.options !== undefined ? parsed.data.options : existing.options;
    const effectiveDefaultValue =
      parsed.data.defaultValue !== undefined ? parsed.data.defaultValue : existing.defaultValue;

    const { options: normalizedOptions } = validateDefinitionShape({
      fieldType: effectiveFieldType,
      options: effectiveOptions,
      defaultValue: effectiveDefaultValue,
    });

    const updates = { ...parsed.data };
    if (effectiveFieldType !== 'select') {
      updates.options = [];
    } else {
      updates.options = normalizedOptions;
    }

    const data = await storage.updateProductCustomFieldDefinition(id, updates);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating product custom field definition:');
  }
});

router.delete('/:id', ...writeAccess, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getProductCustomFieldDefinition(id);
    if (!existing || existing.companyId !== companyId || existing.entityType !== entityType) {
      return res.status(404).json({ success: false, error: 'Custom field definition not found' });
    }
    await storage.deleteProductCustomFieldDefinition(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting product custom field definition:');
  }
});

return router;
}

export default createErpCustomFieldRouter();
