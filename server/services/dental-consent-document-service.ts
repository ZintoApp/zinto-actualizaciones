import { storage } from '../storage';
import { getInvoiceTemplateSettings } from './erp-invoice-template-service';
import { getDentalReminderTimezone } from './dental-reminder-timezone';
import { getDentalBookingPolicy } from './dental-booking-policy-service';
import { listConsentTemplates } from './dental-consent-template-service';
import { loadLogoBuffer } from './erp-invoice-pdf-service';
import { loadConsentBodyImages } from './dental-consent-asset-service';
import { consentHash } from './dental-consent-proof';
import type { ConsentContext, ConsentPreviewFields } from '../../shared/dental-consent';
import { consentFieldDefinitions, resolveConsentFields } from './dental-consent-custom-fields';
import { getClinicSignature, listClinicSignatures } from './user-signature-service';

export async function patientConsentContext(companyId: number, contactId: number) {
  const patient = await storage.getDentalPatientByContactId(companyId, contactId);
  if (!patient) return null;
  const [company, branding, timezoneStatus, policy, users, signatures, customFields] = await Promise.all([
    storage.getCompany(companyId), getInvoiceTemplateSettings(companyId), getDentalReminderTimezone(companyId),
    getDentalBookingPolicy(companyId), storage.getUsersByCompany(companyId),
    listClinicSignatures(companyId), consentFieldDefinitions(companyId),
  ]);
  const providers = users.filter(user => user.companyId === companyId && user.active !== false && policy.bookableDentistUserIds.includes(user.id))
    .map(user => ({ id: user.id, name: user.fullName?.trim() || user.username, signatureRevision: signatures.find(signature => signature.userId === user.id)?.revision ?? null })).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const preferred = providers.find(provider => provider.id === patient.preferredProviderUserId);
  const timezone = timezoneStatus.timezone ?? 'UTC';
  const context: ConsentContext = { patientName: patient.contact.name, patientReference: `P-${String(patient.id).padStart(5, '0')}`,
    customFields,
    patientAvatarUrl: patient.contact.avatarUrl ?? null,
    professionalName: preferred?.name || (providers.length === 1 ? providers[0].name : ''), providers, preferredProviderUserId: preferred?.id ?? null,
    today: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    timezone, companyName: branding.header.businessName || company?.name || '' };
  return { context, company, header: branding.header, patient };
}
export async function resolveConsentDocument(companyId: number, contactId: number, fields: ConsentPreviewFields, viewerUserId?: number) {
  const template = (await listConsentTemplates(companyId)).find(t => t.key === fields.templateKey && t.isActive);
  if (!template) throw new Error('template');
  const result = await patientConsentContext(companyId, contactId);
  if (!result) throw new Error('patient');
  const { context, header, company } = result;
  const provider = fields.providerUserId === undefined ? undefined : context.providers.find(item => item.id === fields.providerUserId);
  if (fields.providerUserId !== undefined && !provider) throw new Error('providerUnavailable');
  const translation = template.translations[fields.language];
  const signature = fields.includeProviderSignature && provider ? await getClinicSignature(companyId, provider.id) : undefined;
  if (fields.includeProviderSignature && !signature) throw new Error('signatureUnavailable');
  const custom = await resolveConsentFields({ companyId, contactId, viewerUserId, body: translation.body, language: fields.language,
    detailFieldIds: fields.detailFieldIds ?? template.detailFieldIds, values: result.patient.contact.customFields as Record<string, unknown> | undefined });
  const logo = await loadLogoBuffer(header.logoUrl || company?.logo);
  const images = translation.bodyFormat === 'html' ? await loadConsentBodyImages(companyId, translation.body) : {};
  const { patientAvatarUrl: _patientAvatarUrl, customFields: _customFields, providers: _roster, ...documentContext } = context;
  const input = { ...documentContext, ...fields, ...translation, professionalName: provider?.name ?? fields.professionalName, logo, images: { ...images, ...custom.images },
    providerSignature: signature ? Buffer.from(signature.content) : null, providerSignatureRevision: signature?.revision ?? null, customVariables: custom.variables, variableImages: custom.variableImages, detailsHtml: custom.detailsHtml,
    address: [header.addressLine1, header.addressLine2, header.city, header.country].filter(Boolean).join(', '),
    phone: header.phone || company?.whatsappNumber || '', email: header.email || company?.companyEmail || '', taxId: header.taxId || company?.registerNumber || '' };
  // Fingerprint only data printed in this document, not unrelated roster changes or today's date.
  const { preferredProviderUserId: _preferred, today: _today, ...printed } = input;
  return { input, fingerprint: consentHash(JSON.stringify(printed)), template };
}
