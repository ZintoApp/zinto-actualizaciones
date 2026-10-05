import { type ProductCustomFieldDefinition } from '@shared/schema';
import { ErpValidationError } from '../storage';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type ValidateOpts = { mode: 'create' } | { mode: 'update' };

/** Full-record forms retain historical inactive/deleted values from storage.
 * Submitted stale values cannot overwrite history or introduce unknown keys. */
export function validateCustomFieldRecordValues(
  definitions: ProductCustomFieldDefinition[],
  submitted: Record<string, unknown>,
  existing?: Record<string, unknown> | null
): Record<string, unknown> {
  const activeKeys = new Set(definitions.filter(field => field.isActive).map(field => field.fieldKey));
  const retained = Object.fromEntries(Object.entries(existing ?? {}).filter(([key]) => !activeKeys.has(key)));
  const activeInput = Object.fromEntries(Object.entries(submitted).filter(([key]) => activeKeys.has(key) || !Object.hasOwn(retained, key)));
  return { ...retained, ...validateAndNormalizeCustomFieldValues(definitions, activeInput, { mode: existing == null ? 'create' : 'update' }) };
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function getSelectOptions(definition: ProductCustomFieldDefinition): string[] {
  if (!Array.isArray(definition.options)) return [];
  return definition.options.map((o) => String(o));
}

function normalizeValueForType(
  fieldType: string,
  rawValue: unknown,
  definition: ProductCustomFieldDefinition
): unknown {
  switch (fieldType) {
    case 'number': {
      const n = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(n)) {
        throw new ErpValidationError(`Custom field "${definition.fieldKey}" must be a finite number`);
      }
      return n;
    }
    case 'date': {
      const str = String(rawValue).trim();
      if (!DATE_REGEX.test(str)) {
        throw new ErpValidationError(
          `Custom field "${definition.fieldKey}" must be a valid date (YYYY-MM-DD)`
        );
      }
      const d = new Date(str);
      if (Number.isNaN(d.getTime())) {
        throw new ErpValidationError(
          `Custom field "${definition.fieldKey}" must be a valid date (YYYY-MM-DD)`
        );
      }
      return str;
    }
    case 'checkbox': {
      if (typeof rawValue === 'boolean') return rawValue;
      const str = String(rawValue).toLowerCase().trim();
      if (str === 'true') return true;
      if (str === 'false') return false;
      throw new ErpValidationError(`Custom field "${definition.fieldKey}" must be true or false`);
    }
    case 'select': {
      const str = String(rawValue).trim();
      const options = getSelectOptions(definition);
      if (!options.includes(str)) {
        throw new ErpValidationError(`Custom field "${definition.fieldKey}" must be one of the allowed options`);
      }
      return str;
    }
    case 'text':
    case 'textarea':
      return String(rawValue);
    default:
      throw new ErpValidationError(`Unknown field type for "${definition.fieldKey}"`);
  }
}

function normalizeDefaultValue(definition: ProductCustomFieldDefinition): unknown | undefined {
  const { defaultValue } = definition;
  if (defaultValue == null || defaultValue === '') return undefined;
  return normalizeValueForType(definition.fieldType, defaultValue, definition);
}

export function validateAndNormalizeCustomFieldValues(
  definitions: ProductCustomFieldDefinition[],
  values: Record<string, unknown> = {},
  opts: ValidateOpts
): Record<string, unknown> {
  const activeDefs = definitions.filter((d) => d.isActive);
  const activeKeys = new Set(activeDefs.map((d) => d.fieldKey));

  for (const key of Object.keys(values)) {
    if (!activeKeys.has(key)) {
      throw new ErpValidationError(`Unknown custom field key: ${key}`);
    }
  }

  const result: Record<string, unknown> = {};

  for (const def of activeDefs) {
    const submitted = values[def.fieldKey];

    if (!isEmptyValue(submitted)) {
      result[def.fieldKey] = normalizeValueForType(def.fieldType, submitted, def);
      continue;
    }

    if (opts.mode === 'create') {
      const defaultNorm = normalizeDefaultValue(def);
      if (defaultNorm !== undefined) {
        result[def.fieldKey] = defaultNorm;
      } else if (def.isRequired) {
        throw new ErpValidationError(`Custom field "${def.fieldKey}" (${def.name}) is required`);
      }
      continue;
    }

    if (def.isRequired) {
      throw new ErpValidationError(`Custom field "${def.fieldKey}" (${def.name}) is required`);
    }
  }

  return result;
}
