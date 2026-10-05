import type { Contact, Deal } from '@shared/schema';
import { PERMISSIONS } from '@shared/schema';
import type { AiAssistantCustomFieldBinding } from '@shared/types/node-types';
import type { AICustomFieldRuntimeDefinition, AICustomFieldWrite } from '@shared/types/flow-execution';
import { customFieldBindingCanRead, customFieldBindingCanWrite, customFieldVariablePath } from '@shared/ai-assistant-custom-fields';
import { isCustomFieldFileReference, type CustomFieldFileReference } from '@shared/contact-custom-fields';
import { isDentalClinicalDocumentCategory } from '@shared/dental-clinical';
import { storage, logContactAudit } from '../storage';
import { getUserPermissions } from '../middleware';
import { validateEntityCustomFields } from './custom-field-value-service';
import { TextDocumentProcessor } from './document-processors/text-processor';
import { analyzeLocalImageFile } from './image-analysis-service';

const PER_FILE_LIMIT = 50_000;
const TOTAL_FILE_LIMIT = 100_000;

type PreparedCustomFields = {
  definitions: AICustomFieldRuntimeDefinition[];
  bindings: AiAssistantCustomFieldBinding[];
  deal: Deal | null;
  fileReferences: Map<string, CustomFieldFileReference>;
  currentValues: Map<string, unknown>;
  writableEntities: Set<'contact' | 'deal'>;
};

function referenceKey(reference: Pick<CustomFieldFileReference, 'source' | 'id'>): string {
  return `${reference.source}:${reference.id}`;
}

async function readableFileValue(
  reference: CustomFieldFileReference,
  companyId: number,
  ownerType: 'contact' | 'deal',
  ownerId: number,
  remaining: number,
): Promise<Record<string, unknown>> {
  const base = { name: reference.name, mimeType: reference.mimeType, size: reference.size };
  if (remaining <= 0) return { ...base, contentStatus: 'truncated', truncated: true };
  try {
    const row = reference.source === 'contact_document'
      ? await storage.getContactDocument(reference.id)
      : await storage.getCustomFieldAttachment(companyId, reference.id);
    const belongs = reference.source === 'contact_document'
      ? ownerType === 'contact' && row && (row as any).contactId === ownerId
      : row && (row as any).ownerType === ownerType &&
        (ownerType === 'contact' ? (row as any).contactId === ownerId : (row as any).dealId === ownerId);
    if (!row || !belongs) return { ...base, contentStatus: 'unavailable' };
    const filePath = String((row as any).filePath ?? '');
    if (!filePath) return { ...base, contentStatus: 'unavailable' };
    if (reference.mimeType.startsWith('image/')) {
      const analysis = await analyzeLocalImageFile(filePath, reference.mimeType, companyId, reference.name);
      const content = [analysis.ocrText, analysis.visualSummary, analysis.uncertaintyNotes].filter(Boolean).join('\n');
      return { ...base, contentStatus: 'extracted', content: content.slice(0, Math.min(PER_FILE_LIMIT, remaining)) };
    }
    const content = await TextDocumentProcessor.extractText(filePath, reference.mimeType, reference.name);
    const limit = Math.min(PER_FILE_LIMIT, remaining);
    return {
      ...base,
      contentStatus: 'extracted',
      content: content.slice(0, limit),
      truncated: content.length > limit,
    };
  } catch (error) {
    return { ...base, contentStatus: 'unavailable', error: error instanceof Error ? error.message : 'Extraction failed' };
  }
}

export async function prepareAICustomFieldRuntime(params: {
  bindings: AiAssistantCustomFieldBinding[];
  companyId: number;
  contact: Contact;
  userId: number;
}): Promise<PreparedCustomFields> {
  const { bindings, companyId, contact, userId } = params;
  const [contactFields, dealFields, deal, user] = await Promise.all([
    storage.getCompanyCustomFields(companyId, 'contact'),
    storage.getCompanyCustomFields(companyId, 'deal'),
    bindings.some((binding) => binding.entity === 'deal')
      ? storage.getActiveDealByContact(contact.id, companyId)
      : Promise.resolve(null),
    storage.getUser(userId),
  ]);
  const permissions = user && !user.isSuperAdmin ? await getUserPermissions(user) : {};
  const canReadClinical = !!user?.isSuperAdmin || permissions[PERMISSIONS.VIEW_DENTAL_IMAGING] === true;
  const writableEntities = new Set<'contact' | 'deal'>();
  if (user?.isSuperAdmin || permissions[PERMISSIONS.MANAGE_CONTACTS] === true) writableEntities.add('contact');
  if (user?.isSuperAdmin || user?.role === 'admin' || permissions[PERMISSIONS.EDIT_DEALS] === true) writableEntities.add('deal');
  const byKey = new Map([...contactFields, ...dealFields].map((field) => [`${field.entity}:${field.id}`, field]));
  const validBindings = bindings.filter((binding) => {
    const field = byKey.get(`${binding.entity}:${binding.customFieldId}`);
    return !!field && field.fieldName === binding.fieldName;
  });
  const fileReferences = new Map<string, CustomFieldFileReference>();
  const currentValues = new Map<string, unknown>();
  const ownerFiles = new Map<'contact' | 'deal', CustomFieldFileReference[]>();
  for (const entity of ['contact', 'deal'] as const) {
    const ownerId = entity === 'contact' ? contact.id : deal?.id;
    if (!ownerId || !validBindings.some((binding) => binding.entity === entity)) continue;
    const attachments = await storage.listCustomFieldAttachments(companyId, entity, ownerId);
    const refs: CustomFieldFileReference[] = attachments.map((row) => ({
      source: 'custom_field_attachment', id: row.id, name: row.originalName,
      url: row.fileUrl, mimeType: row.mimeType, size: row.fileSize,
    }));
    if (entity === 'contact') {
      const documents = await storage.getContactDocuments(ownerId);
      refs.push(...documents.filter((document) => canReadClinical || !isDentalClinicalDocumentCategory(document.category)).map((row) => ({
        source: 'contact_document' as const, id: row.id, name: row.originalName,
        url: row.fileUrl, mimeType: row.mimeType, size: row.fileSize,
      })));
    }
    refs.forEach((reference) => fileReferences.set(referenceKey(reference), reference));
    ownerFiles.set(entity, refs);
  }

  let contentUsed = 0;
  const definitions: AICustomFieldRuntimeDefinition[] = [];
  for (const binding of validBindings) {
    const field = byKey.get(`${binding.entity}:${binding.customFieldId}`)!;
    const owner = binding.entity === 'contact' ? contact : deal;
    const rawValue = owner?.customFields && typeof owner.customFields === 'object'
      ? (owner.customFields as Record<string, unknown>)[field.fieldName]
      : undefined;
    currentValues.set(customFieldVariablePath(binding.entity, field.fieldName), rawValue);
    let currentValue = customFieldBindingCanRead(binding.mode) ? rawValue : undefined;
    if (customFieldBindingCanRead(binding.mode) && field.fieldType === 'file_select' && isCustomFieldFileReference(rawValue) && owner) {
      const readable = ownerFiles.get(binding.entity)?.some((candidate) => referenceKey(candidate) === referenceKey(rawValue));
      if (readable) {
        currentValue = await readableFileValue(rawValue, companyId, binding.entity, owner.id, TOTAL_FILE_LIMIT - contentUsed);
        contentUsed += typeof (currentValue as any)?.content === 'string' ? (currentValue as any).content.length : 0;
      } else currentValue = { name: rawValue.name, mimeType: rawValue.mimeType, size: rawValue.size, contentStatus: 'unavailable' };
    }
    if (!customFieldBindingCanWrite(binding.mode) && !customFieldBindingCanRead(binding.mode)) continue;
    const writable = customFieldBindingCanWrite(binding.mode) && writableEntities.has(binding.entity) && !!owner;
    definitions.push({
      path: customFieldVariablePath(binding.entity, field.fieldName),
      entity: binding.entity,
      customFieldId: field.id,
      fieldName: field.fieldName,
      label: field.fieldLabel,
      fieldType: field.fieldType,
      options: field.options,
      readable: customFieldBindingCanRead(binding.mode),
      writable,
      unavailableReason: owner ? undefined : 'No active deal exists for this contact.',
      requiredForCompletion: binding.required,
      currentValue,
      availableFiles: writable && field.fieldType === 'file_select'
        ? (ownerFiles.get(binding.entity) ?? []).map((reference) => ({ key: referenceKey(reference), name: reference.name, mimeType: reference.mimeType, size: reference.size }))
        : undefined,
    });
  }
  return { definitions, bindings: validBindings, deal, fileReferences, currentValues, writableEntities };
}

export async function applyAICustomFieldWrites(params: {
  writes: AICustomFieldWrite[];
  runtime: PreparedCustomFields;
  companyId: number;
  contact: Contact;
  userId: number;
  setContextValue: (path: string, value: unknown) => void;
}): Promise<{ applied: number; errors: string[] }> {
  let applied = 0;
  const errors: string[] = [];
  const writable = new Map(params.runtime.definitions.filter((definition) => definition.writable).map((definition) => [definition.path, definition]));
  for (const write of params.writes) {
    const definition = writable.get(write.path);
    const binding = params.runtime.bindings.find((entry) =>
      entry.entity === definition?.entity && entry.customFieldId === definition?.customFieldId
    );
    if (!definition || !binding || !customFieldBindingCanWrite(binding.mode)) continue;
    const owner = definition.entity === 'contact' ? params.contact : params.runtime.deal;
    if (!owner) { errors.push(`${definition.label}: no active deal`); continue; }
    let value = write.value;
    if (definition.fieldType === 'file_select') {
      const allowedFileKeys = new Set((definition.availableFiles ?? []).map((file) => file.key));
      const reference = typeof value === 'string' && allowedFileKeys.has(value)
        ? params.runtime.fileReferences.get(value)
        : undefined;
      if (!reference) { errors.push(`${definition.label}: invalid file selection`); continue; }
      const matchesEntity = reference.source !== 'contact_document' || definition.entity === 'contact';
      if (!matchesEntity) { errors.push(`${definition.label}: invalid file owner`); continue; }
      value = reference;
    }
    try {
      const existing = owner.customFields && typeof owner.customFields === 'object' && !Array.isArray(owner.customFields)
        ? owner.customFields as Record<string, unknown> : {};
      const next = await validateEntityCustomFields({
        companyId: params.companyId, ownerType: definition.entity, ownerId: owner.id,
        input: { ...existing, [definition.fieldName]: value }, enforceRequired: false,
        existingValues: existing, allowClinicalContactDocuments: true,
      });
      if (definition.entity === 'contact') {
        await storage.updateContact(owner.id, { customFields: next });
        await logContactAudit({ companyId: params.companyId, contactId: owner.id, userId: params.userId,
          actionType: 'updated', actionCategory: 'custom_field', description: `AI Assistant updated ${definition.label}`,
          oldValues: { [definition.fieldName]: existing[definition.fieldName] ?? null }, newValues: { [definition.fieldName]: next[definition.fieldName] } });
      } else {
        await storage.updateDeal(owner.id, { customFields: next });
        await storage.createDealActivity({ dealId: owner.id, userId: params.userId, type: 'custom_field_update',
          content: `AI Assistant updated ${definition.label}`, metadata: { fieldName: definition.fieldName } });
      }
      owner.customFields = next;
      params.runtime.currentValues.set(definition.path, next[definition.fieldName]);
      params.setContextValue(definition.path, next[definition.fieldName]);
      applied += 1;
    } catch (error) {
      errors.push(`${definition.label}: ${error instanceof Error ? error.message : 'update failed'}`);
    }
  }
  return { applied, errors };
}
