import {
  ContactCustomFieldValidationError,
  isCustomFieldFileReference,
  normalizeContactCustomFieldValues,
  type ContactCustomFieldDefinition,
  type CustomFieldFileReference,
  type CustomFieldValue,
} from '@shared/contact-custom-fields';
import { storage } from '../storage';
import { isDentalClinicalDocumentCategory } from '@shared/dental-clinical';
import fsExtra from 'fs-extra';
import { dataUsageTracker } from './data-usage-tracker';

type OwnerType = 'contact' | 'deal';

export async function removeUnreferencedCustomFieldAttachments(options: {
  companyId: number;
  ownerType: OwnerType;
  ownerId: number;
  customFields: Record<string, unknown> | null | undefined;
}): Promise<number[]> {
  const referencedIds = new Set(
    Object.values(options.customFields ?? {})
      .filter(isCustomFieldFileReference)
      .filter((reference) => reference.source === 'custom_field_attachment')
      .map((reference) => reference.id),
  );
  const attachments = await storage.listCustomFieldAttachments(
    options.companyId,
    options.ownerType,
    options.ownerId,
  );
  const removedIds: number[] = [];
  for (const attachment of attachments) {
    if (referencedIds.has(attachment.id)) continue;
    const deleted = await storage.deleteCustomFieldAttachment(options.companyId, attachment.id);
    if (!deleted) continue;
    await fsExtra.unlink(deleted.filePath).catch(() => undefined);
    void dataUsageTracker.trackFileDelete(options.companyId, deleted.fileSize);
    removedIds.push(deleted.id);
  }
  return removedIds;
}

function fileReference(source: CustomFieldFileReference['source'], row: {
  id: number;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
}): CustomFieldFileReference {
  return {
    source,
    id: row.id,
    name: row.originalName,
    url: row.fileUrl,
    mimeType: row.mimeType,
    size: row.fileSize,
  };
}

export async function validateEntityCustomFields(options: {
  companyId: number;
  ownerType: OwnerType;
  ownerId?: number;
  input: unknown;
  enforceRequired: boolean;
  allowMissingRequiredFiles?: boolean;
  existingValues?: Record<string, unknown> | null;
  allowClinicalContactDocuments?: boolean;
}): Promise<Record<string, CustomFieldValue | unknown>> {
  const rows = await storage.getCompanyCustomFields(options.companyId, options.ownerType);
  const definitions = rows.map((row) => ({
    fieldName: row.fieldName,
    fieldLabel: row.fieldLabel,
    fieldType: row.fieldType,
    options: row.options,
    required: row.required,
    displayOrder: row.displayOrder,
  })) as ContactCustomFieldDefinition[];

  const definitionsForValidation = options.allowMissingRequiredFiles
    ? definitions.map((definition) => definition.fieldType === 'file_select' ? { ...definition, required: false } : definition)
    : definitions;
  const rawValues = options.input && typeof options.input === 'object' && !Array.isArray(options.input)
    ? options.input as Record<string, unknown>
    : options.input;
  const activeNames = new Set(definitions.map((definition) => definition.fieldName));
  const existingUnknownNames = new Set(
    Object.keys(options.existingValues ?? {}).filter((name) => !activeNames.has(name)),
  );
  if (rawValues && typeof rawValues === 'object') {
    const unexpected = Object.keys(rawValues).find((name) => !activeNames.has(name) && !existingUnknownNames.has(name));
    if (unexpected) throw new ContactCustomFieldValidationError(`Unknown custom field: ${unexpected}`, unexpected);
  }
  const activeInput = rawValues && typeof rawValues === 'object'
    ? Object.fromEntries(Object.entries(rawValues).filter(([name]) => activeNames.has(name)))
    : rawValues;
  const normalized = normalizeContactCustomFieldValues(definitionsForValidation, activeInput, {
    enforceRequired: options.enforceRequired,
  });

  for (const definition of definitions) {
    if (definition.fieldType !== 'file_select') continue;
    const submitted = normalized[definition.fieldName];
    if (submitted == null) continue;
    if (!isCustomFieldFileReference(submitted) || !options.ownerId) {
      throw new ContactCustomFieldValidationError(
        `${definition.fieldLabel} must reference a file owned by this record`,
        definition.fieldName,
      );
    }

    if (submitted.source === 'contact_document') {
      if (options.ownerType !== 'contact') {
        throw new ContactCustomFieldValidationError('Deal file fields cannot use contact documents', definition.fieldName);
      }
      const document = await storage.getContactDocument(submitted.id);
      if (!document || document.contactId !== options.ownerId) {
        throw new ContactCustomFieldValidationError('Selected contact document was not found', definition.fieldName);
      }
      if (isDentalClinicalDocumentCategory(document.category) && !options.allowClinicalContactDocuments) {
        throw new ContactCustomFieldValidationError('Dental imaging permission is required', definition.fieldName);
      }
      normalized[definition.fieldName] = fileReference('contact_document', document);
      continue;
    }

    const attachment = await storage.getCustomFieldAttachment(options.companyId, submitted.id);
    const ownsAttachment = attachment && attachment.ownerType === options.ownerType && (
      options.ownerType === 'contact'
        ? attachment.contactId === options.ownerId
        : attachment.dealId === options.ownerId
    );
    if (!ownsAttachment || !attachment) {
      throw new ContactCustomFieldValidationError('Selected attachment was not found for this record', definition.fieldName);
    }
    normalized[definition.fieldName] = fileReference('custom_field_attachment', attachment);
  }

  // Values for definitions deleted after an earlier save are retained, but callers
  // cannot introduce new unknown keys because the shared normalizer rejects them.
  const retainedUnknown = Object.fromEntries(
    Object.entries(options.existingValues ?? {}).filter(([name]) => !activeNames.has(name)),
  );
  return { ...retainedUnknown, ...normalized };
}
