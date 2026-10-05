import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { storage } from '../storage';
import { getUserPermissions } from '../middleware';
import { isCustomFieldFileReference } from '../../shared/contact-custom-fields';
import { isDentalClinicalDocumentCategory } from '../../shared/dental-clinical';
import { consentCustomFieldIds, customConsentToken, type ConsentCustomField } from '../../shared/dental-consent-custom-fields';
import type { ConsentPdfImages } from './dental-consent-rich-pdf';
import { escapeConsentHtml } from '../../shared/dental-consent-rich-text';

export class ConsentFieldError extends Error {
  constructor(public field: string, public code: 'customFieldUnavailable' | 'customFieldImageUnavailable' = 'customFieldUnavailable') { super(code); }
}
export async function consentFieldDefinitions(companyId: number): Promise<ConsentCustomField[]> {
  return (await storage.getCompanyCustomFields(companyId, 'contact')).map(row => ({ id: row.id, fieldName: row.fieldName, fieldLabel: row.fieldLabel, fieldType: row.fieldType as ConsentCustomField['fieldType'], options: row.options as ConsentCustomField['options'], displayOrder: row.displayOrder }))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
}
export async function validateConsentFields(companyId: number, bodies: string[], detailFieldIds: number[] = []) {
  const ids = [...new Set([...bodies.flatMap(consentCustomFieldIds), ...detailFieldIds])];
  if (!ids.length) return [];
  const definitions = await consentFieldDefinitions(companyId);
  for (const id of ids) if (!definitions.some(field => field.id === id)) throw new ConsentFieldError(`#${id}`);
  return definitions.filter(field => ids.includes(field.id));
}
export function formatConsentField(field: ConsentCustomField, value: unknown, language: 'en' | 'es'): string {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '________________';
  const locale = language === 'es' ? 'es-CO' : 'en-GB';
  if (field.fieldType === 'boolean') {
    const options = !Array.isArray(field.options) ? field.options : null;
    return value === true ? options?.trueLabel || (language === 'es' ? 'Sí' : 'Yes') : options?.falseLabel || (language === 'es' ? 'No' : 'No');
  }
  if (field.fieldType === 'number') return Number.isFinite(Number(value)) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(Number(value)) : '________________';
  if (field.fieldType === 'date') {
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date) : '________________';
  }
  if (field.fieldType === 'select' || field.fieldType === 'multi_select') return (Array.isArray(value) ? value : [value]).map(item => Array.isArray(field.options) ? field.options.find(option => option.value === item)?.label || String(item) : String(item)).join(', ');
  return typeof value === 'string' ? value : '________________';
}
async function fieldFile(companyId: number, contactId: number, field: ConsentCustomField, value: unknown, viewerUserId?: number, loadImage = true) {
  if (!isCustomFieldFileReference(value)) throw new ConsentFieldError(field.fieldLabel);
  let file: { originalName: string; filePath: string; mimeType: string; fileSize: number } | undefined;
  if (value.source === 'custom_field_attachment') {
    const attachment = await storage.getCustomFieldAttachment(companyId, value.id);
    if (!attachment || attachment.ownerType !== 'contact' || attachment.contactId !== contactId) throw new ConsentFieldError(field.fieldLabel);
    file = attachment;
  } else {
    const document = await storage.getContactDocument(value.id);
    if (!document || document.contactId !== contactId) throw new ConsentFieldError(field.fieldLabel);
    if (isDentalClinicalDocumentCategory(document.category)) {
      const viewer = viewerUserId ? await storage.getUser(viewerUserId) : undefined;
      if (!viewer || (viewer.companyId !== companyId && !viewer.isSuperAdmin) || (!viewer.isSuperAdmin && !(await getUserPermissions(viewer)).view_dental_imaging)) throw new ConsentFieldError(field.fieldLabel);
    }
    file = document;
  }
  if (!loadImage || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimeType)) return { text: file.originalName };
  try {
    const resolved = path.resolve(file.filePath);
    if (!['uploads', 'private'].some(root => { const relative = path.relative(path.resolve(root), resolved); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); }) || file.fileSize > 10 * 1024 * 1024) throw new Error();
    const buffer = await readFile(resolved); if (buffer.length > 10 * 1024 * 1024) throw new Error();
    const metadata = await sharp(buffer, { limitInputPixels: 25_000_000, pages: 1 }).metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) throw new Error();
    const image = await sharp(buffer, { limitInputPixels: 25_000_000, pages: 1 }).rotate().resize(960, 480, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    return { text: file.originalName, image: { content: image.data, width: image.info.width, height: image.info.height } };
  } catch { throw new ConsentFieldError(field.fieldLabel, 'customFieldImageUnavailable'); }
}
export async function consentFieldContextValues(companyId: number, contactId: number, definitions: ConsentCustomField[], values: Record<string, unknown>, viewerUserId: number) {
  const result: Record<number, string> = {};
  for (const field of definitions) {
    const value = values[field.fieldName];
    if (field.fieldType === 'file_select' && value != null && value !== '') {
      try { result[field.id] = (await fieldFile(companyId, contactId, field, value, viewerUserId, false)).text; } catch { /* Protected file names are not exposed. */ }
    } else result[field.id] = formatConsentField(field, value, 'en');
  }
  return result;
}
export async function resolveConsentFields(options: { companyId: number; contactId?: number; viewerUserId?: number; body: string; detailFieldIds?: number[]; values?: Record<string, unknown>; language: 'en' | 'es' }) {
  const definitions = await validateConsentFields(options.companyId, [options.body], options.detailFieldIds);
  const variables: Record<string, string> = {}, variableImages: Record<string, { id: string; width: number }> = {}, images: ConsentPdfImages = {};
  const details: Array<{ label: string; value: string; imageId?: string }> = [];
  for (const field of definitions) {
    const token = customConsentToken(field.id), sample = options.contactId === undefined;
    let value = options.values?.[field.fieldName];
    if (sample) value = field.fieldType === 'number' ? 123 : field.fieldType === 'boolean' ? true : field.fieldType === 'date' ? '2026-01-15' : ['select', 'multi_select'].includes(field.fieldType) && Array.isArray(field.options) ? field.options[0]?.value : `${options.language === 'es' ? 'Ejemplo' : 'Example'}: ${field.fieldLabel}`;
    let text = formatConsentField(field, value, options.language), imageId: string | undefined;
    if (field.fieldType === 'file_select' && value != null && value !== '') {
      const file = sample ? { text: String(value), image: { content: await sharp({ create: { width: 320, height: 120, channels: 3, background: '#e5e7eb' } }).png().toBuffer(), width: 320, height: 120 } } : await fieldFile(options.companyId, options.contactId!, field, value, options.viewerUserId);
      text = file.text;
      if (file.image) { imageId = `custom-${field.id}`; images[imageId] = file.image; variableImages[token] = { id: imageId, width: Math.min(320, 160 * file.image.width / file.image.height) }; }
    }
    variables[token] = text;
    if (options.detailFieldIds?.includes(field.id)) details.push({ label: field.fieldLabel, value: text, imageId });
  }
  const detailsHtml = definitions.filter(field => options.detailFieldIds?.includes(field.id)).map(field => `<p><strong>${escapeConsentHtml(field.fieldLabel)}: </strong>{{${customConsentToken(field.id)}}}</p>`).join('');
  return { variables, variableImages, images, details, detailsHtml };
}
