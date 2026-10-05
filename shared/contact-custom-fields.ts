export type ContactCustomFieldDefinition = {
  fieldName: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'boolean' | 'file_select';
  options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } | null;
  required?: boolean | null;
  displayOrder?: number | null;
};

export type CustomFieldFileReference = {
  source: 'custom_field_attachment' | 'contact_document';
  id: number;
  name: string;
  url: string;
  mimeType: string;
  size: number;
};

export type CustomFieldValue = string | number | boolean | string[] | CustomFieldFileReference;

export function isCustomFieldFileReference(value: unknown): value is CustomFieldFileReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomFieldFileReference>;
  return (
    (candidate.source === 'custom_field_attachment' || candidate.source === 'contact_document') &&
    Number.isInteger(candidate.id) && Number(candidate.id) > 0 &&
    typeof candidate.name === 'string' && candidate.name.length > 0 &&
    typeof candidate.url === 'string' && candidate.url.length > 0 &&
    typeof candidate.mimeType === 'string' && candidate.mimeType.length > 0 &&
    Number.isFinite(candidate.size) && Number(candidate.size) >= 0
  );
}

export class ContactCustomFieldValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldName?: string,
  ) {
    super(message);
    this.name = 'ContactCustomFieldValidationError';
  }
}

export function isEmptyContactCustomFieldValue(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
}

function allowedOptions(definition: ContactCustomFieldDefinition): Set<string> {
  return new Set(
    Array.isArray(definition.options)
      ? definition.options.map((option) => String(option.value))
      : [],
  );
}

function normalizeDate(value: unknown, definition: ContactCustomFieldDefinition): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must be a valid date`, definition.fieldName);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must be a valid date`, definition.fieldName);
  }
  return value;
}

export function normalizeContactCustomFieldValues(
  definitions: ContactCustomFieldDefinition[],
  input: unknown,
  options: { enforceRequired?: boolean } = {},
): Record<string, CustomFieldValue> {
  if (input == null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ContactCustomFieldValidationError('Custom fields must be an object');
  }

  const values = input as Record<string, unknown>;
  const definitionsByName = new Map(definitions.map((definition) => [definition.fieldName, definition]));
  for (const key of Object.keys(values)) {
    if (!definitionsByName.has(key)) {
      throw new ContactCustomFieldValidationError(`Unknown contact custom field: ${key}`, key);
    }
  }

  const normalized: Record<string, CustomFieldValue> = {};
  for (const definition of definitions) {
    const value = values[definition.fieldName];
    if (isEmptyContactCustomFieldValue(value)) {
      if (options.enforceRequired && definition.required) {
        throw new ContactCustomFieldValidationError(`${definition.fieldLabel} is required`, definition.fieldName);
      }
      continue;
    }

    switch (definition.fieldType) {
      case 'text':
        if (typeof value !== 'string') {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must be text`, definition.fieldName);
        }
        if (value.trim() === '') {
          if (options.enforceRequired && definition.required) {
            throw new ContactCustomFieldValidationError(`${definition.fieldLabel} is required`, definition.fieldName);
          }
          break;
        }
        normalized[definition.fieldName] = value.trim();
        break;
      case 'number': {
        if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must be a number`, definition.fieldName);
        }
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must be a number`, definition.fieldName);
        }
        normalized[definition.fieldName] = numberValue;
        break;
      }
      case 'select': {
        if (typeof value !== 'string' || !allowedOptions(definition).has(value)) {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} has an invalid option`, definition.fieldName);
        }
        normalized[definition.fieldName] = value;
        break;
      }
      case 'multi_select': {
        const allowed = allowedOptions(definition);
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} has an invalid option`, definition.fieldName);
        }
        normalized[definition.fieldName] = [...new Set(value)];
        break;
      }
      case 'date':
        normalized[definition.fieldName] = normalizeDate(value, definition);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must be true or false`, definition.fieldName);
        }
        normalized[definition.fieldName] = value;
        break;
      case 'file_select':
        if (!isCustomFieldFileReference(value)) {
          throw new ContactCustomFieldValidationError(`${definition.fieldLabel} must reference a valid file`, definition.fieldName);
        }
        normalized[definition.fieldName] = { ...value };
        break;
    }
  }
  return normalized;
}

export function missingRequiredContactCustomFields(
  definitions: ContactCustomFieldDefinition[],
  values: Record<string, unknown> | null | undefined,
): ContactCustomFieldDefinition[] {
  return definitions.filter(
    (definition) => definition.required && isEmptyContactCustomFieldValue(values?.[definition.fieldName]),
  );
}
