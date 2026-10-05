import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import multer from 'multer';
import { requireAnyPermission, getUserPermissions } from '../../middleware';
import { storage } from '../../storage';
import { ensureDentalBusinessType } from './business-type';
import { listConsentTemplates, saveConsentTemplate } from '../../services/dental-consent-template-service';
import { DEFAULT_CONSENT_TEMPLATES } from '../../../shared/dental-consent-defaults';
import { CONSENT_LANGUAGES, CONSENT_TEMPLATE_PREVIEW_SAMPLE, consentTemplatePreviewSchema, consentPreviewSchema, consentTranslationsSchema, consentDetailFieldsSchema, type ConsentContext } from '../../../shared/dental-consent';
import { ConsentFieldError, consentFieldDefinitions, consentFieldContextValues, resolveConsentFields } from '../../services/dental-consent-custom-fields';
import { getInvoiceTemplateSettings } from '../../services/erp-invoice-template-service';
import { generateDentalConsentPdf } from '../../services/dental-consent-pdf-service';
import { loadLogoBuffer } from '../../services/erp-invoice-pdf-service';
import { getDentalReminderTimezone } from '../../services/dental-reminder-timezone';
import { patientConsentContext, resolveConsentDocument } from '../../services/dental-consent-document-service';
import { createConsentProof } from '../../services/dental-consent-proof';
import { CONSENT_IMAGE_MAX_BYTES, ConsentAssetError, createConsentAsset, getConsentAsset, loadConsentBodyImages } from '../../services/dental-consent-asset-service';

const router = Router();
const patientAccess = ['view_dental_patients', 'manage_dental_patients'];
const settingsAccess = ['view_erp_settings', 'manage_erp_settings'];
const keySchema = z.string().min(1).max(100);
const contactIdSchema = z.coerce.number().int().positive();
const patchSchema = z.object({ translations: consentTranslationsSchema.partial().optional(), isActive: z.boolean().optional(), detailFieldIds: consentDetailFieldsSchema.optional() }).strict();
const errorResponse = (res: Response, status: number, code: string) => res.status(status).json({ success: false, errorCode: `erp.dental.consent.errors.${code}` });
const run = (handler: (req: Request, res: Response, companyId: number) => Promise<unknown>) =>
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (companyId) await handler(req, res, companyId);
    } catch (error) {
      if (error instanceof ConsentFieldError) { res.status(400).json({ success: false, errorCode: `erp.dental.consent.errors.${error.code}`, errorParams: { field: error.field } }); return; }
      if (error instanceof Error && error.message === 'signatureUnavailable') { errorResponse(res, 400, error.message); return; }
      if (error instanceof ConsentAssetError) { errorResponse(res, error.code === 'imageUnavailable' ? 404 : 400, error.code); return; }
      if (error instanceof Error && ['template', 'patient', 'providerUnavailable'].includes(error.message)) { errorResponse(res, error.message === 'providerUnavailable' ? 400 : 404, error.message); return; }
      if (error instanceof z.ZodError) { errorResponse(res, 400, 'validation'); return; }
      console.error('Dental consent request failed:', error);
      errorResponse(res, 500, 'request');
    }
  };

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CONSENT_IMAGE_MAX_BYTES, files: 1 } }).single('file');
router.post('/consent-assets', requireAnyPermission(['manage_erp_settings']), run(async (req, res, companyId) => {
  await new Promise<void>((resolve, reject) => imageUpload(req, res, error => error ? reject(new ConsentAssetError('imageInvalid')) : resolve()));
  if (!req.file) return errorResponse(res, 400, 'imageInvalid');
  const data = await createConsentAsset(companyId, req.file, req.user?.id ?? null);
  res.status(201).json({ success: true, data });
}));
router.get('/consent-assets/:assetId', requireAnyPermission([...patientAccess, ...settingsAccess]), run(async (req, res, companyId) => {
  const asset = await getConsentAsset(companyId, z.string().uuid().parse(req.params.assetId));
  if (!asset) return errorResponse(res, 404, 'imageUnavailable');
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(asset.content));
}));

router.get('/consent-custom-fields', requireAnyPermission(settingsAccess), run(async (_req, res, companyId) => {
  res.json({ success: true, data: await consentFieldDefinitions(companyId) });
}));
router.get('/consent-templates', requireAnyPermission([...patientAccess, ...settingsAccess]), run(async (req, res, companyId) => {
  const permissions = await getUserPermissions(req.user as any);
  const canViewSettings = req.user?.isSuperAdmin || settingsAccess.some(key => permissions[key]);
  const templates = await listConsentTemplates(companyId);
  res.json({ success: true, data: templates.filter(t => t.isActive || (req.query.includeInactive === 'true' && canViewSettings)) });
}));
router.post('/consent-templates', requireAnyPermission(['manage_erp_settings']), run(async (req, res, companyId) => {
  const data = await saveConsentTemplate(companyId, `custom-${randomUUID()}`, req.body, req.user?.id ?? null);
  res.status(201).json({ success: true, data });
}));
router.post('/consent-templates/preview', requireAnyPermission(settingsAccess), run(async (req, res, companyId) => {
  const { language, translation, detailFieldIds } = consentTemplatePreviewSchema.parse(req.body);
  const custom = await resolveConsentFields({ companyId, language, body: translation.body, detailFieldIds });
  const [company, branding, timezoneStatus, images] = await Promise.all([
    storage.getCompany(companyId), getInvoiceTemplateSettings(companyId), getDentalReminderTimezone(companyId),
    translation.bodyFormat === 'html' ? loadConsentBodyImages(companyId, translation.body) : Promise.resolve({}),
  ]);
  const header = branding.header, timezone = timezoneStatus.timezone ?? 'UTC';
  const pdf = await generateDentalConsentPdf({
    ...translation, ...CONSENT_TEMPLATE_PREVIEW_SAMPLE[language], language, samplePreview: true,
    templateKey: 'template-preview', patientReference: 'DEMO-001', patientIdentification: 'DEMO-ID-001',
    consentDate: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    timezone, companyName: header.businessName || company?.name || '', images: { ...images, ...custom.images },
    customVariables: custom.variables, variableImages: custom.variableImages, detailsHtml: custom.detailsHtml,
    logo: await loadLogoBuffer(header.logoUrl || company?.logo),
    address: [header.addressLine1, header.addressLine2, header.city, header.country].filter(Boolean).join(', '),
    phone: header.phone || company?.whatsappNumber || '', email: header.email || company?.companyEmail || '',
    taxId: header.taxId || company?.registerNumber || '',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="consent-template-preview-${language}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(pdf);
}));
router.patch('/consent-templates/:templateKey', requireAnyPermission(['manage_erp_settings']), run(async (req, res, companyId) => {
  const key = keySchema.parse(req.params.templateKey);
  const existing = (await listConsentTemplates(companyId)).find(t => t.key === key);
  if (!existing) return errorResponse(res, 404, 'template');
  const patch = patchSchema.parse(req.body);
  const data = await saveConsentTemplate(companyId, key, { ...existing, ...patch,
    translations: { ...existing.translations, ...patch.translations } }, req.user?.id ?? null);
  res.json({ success: true, data });
}));
router.post('/consent-templates/:templateKey/reset', requireAnyPermission(['manage_erp_settings']), run(async (req, res, companyId) => {
  const key = keySchema.parse(req.params.templateKey);
  const { language } = z.object({ language: z.enum(CONSENT_LANGUAGES) }).parse(req.body);
  const defaults = DEFAULT_CONSENT_TEMPLATES.find(t => t.key === key);
  const existing = (await listConsentTemplates(companyId)).find(t => t.key === key);
  if (!defaults || !existing) return errorResponse(res, 404, 'template');
  const data = await saveConsentTemplate(companyId, key, { ...existing,
    translations: { ...existing.translations, [language]: defaults.translations[language] } }, req.user?.id ?? null);
  res.json({ success: true, data });
}));

router.get('/patients/:contactId/consent-context', requireAnyPermission(patientAccess), run(async (req, res, companyId) => {
  const result = await patientConsentContext(companyId, contactIdSchema.parse(req.params.contactId));
  if (!result) return errorResponse(res, 404, 'patient');
  result.context.customFieldValues = await consentFieldContextValues(companyId, Number(req.params.contactId), result.context.customFields ?? [], (result.patient.contact.customFields ?? {}) as Record<string, unknown>, req.user!.id);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ success: true, data: result.context });
}));
router.post('/patients/:contactId/consent-preview', requireAnyPermission(patientAccess), run(async (req, res, companyId) => {
  const fields = consentPreviewSchema.parse(req.body);
  const contactId = contactIdSchema.parse(req.params.contactId);
  const { input, fingerprint, template } = await resolveConsentDocument(companyId, contactId, fields, req.user!.id);
  const pdf = await generateDentalConsentPdf(input);
  res.setHeader('X-Consent-Preview-Proof', createConsentProof({ companyId, contactId, userId: req.user!.id, fields, fingerprint }, pdf));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="consent-${template.key}-${fields.language}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}));
export default router;
