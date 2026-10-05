import { z } from 'zod';
import { CONSENT_TOKEN_SOURCE, type ConsentCustomField } from './dental-consent-custom-fields';
import { consentBodyText, sanitizeConsentHtml, validRichConsentPlaceholders } from './dental-consent-rich-text';

export const CONSENT_LANGUAGES = ['en', 'es'] as const;
export type ConsentLanguage = typeof CONSENT_LANGUAGES[number];
export const CONSENT_PLACEHOLDERS = ['patientName', 'professionalName', 'guardianName', 'consentDate'] as const;
export function consentLanguage(code?: string | null): ConsentLanguage {
  return code?.split(/[-_]/)[0].toLowerCase() === 'es' ? 'es' : 'en';
}
export function isConsentLanguage(code?: string | null): boolean {
  return CONSENT_LANGUAGES.includes(code?.split(/[-_]/)[0].toLowerCase() as ConsentLanguage);
}
export function validConsentPlaceholders(value: string): boolean {
  const remaining = value.replace(new RegExp(`\\{\\{${CONSENT_TOKEN_SOURCE}\\}\\}`, 'g'), '');
  return !remaining.includes('{{') && !remaining.includes('}}');
}
const translationSchema = z.object({
  title: z.string().trim().max(200),
  body: z.string().trim().max(100000),
  bodyFormat: z.enum(['plain', 'html']).optional(),
}).transform(value => ({ ...value, body: value.bodyFormat === 'html' ? sanitizeConsentHtml(value.body) : value.body }))
  .refine(value => consentBodyText(value).length <= 30000 && (value.bodyFormat === 'html' ? validRichConsentPlaceholders(value.body) : validConsentPlaceholders(value.body)), 'Invalid consent text or placeholder');
export const consentTranslationsSchema = z.object({ en: translationSchema, es: translationSchema });
export type ConsentTranslations = z.infer<typeof consentTranslationsSchema>;
export const consentDetailFieldsSchema = z.array(z.number().int().positive()).max(100).refine(ids => new Set(ids).size === ids.length);
export const consentTemplatePreviewSchema = z.object({
  detailFieldIds: consentDetailFieldsSchema.optional(),
  language: z.enum(CONSENT_LANGUAGES),
  translation: translationSchema.refine(value => value.title.length > 0 && consentBodyText(value).trim().length > 0, 'A title and visible consent text are required'),
}).strict();
export type ConsentTemplatePreviewInput = z.infer<typeof consentTemplatePreviewSchema>;
export const CONSENT_TEMPLATE_PREVIEW_SAMPLE = {
  en: { patientName: 'Example patient', professionalName: 'Example professional', guardianName: 'Example guardian', label: 'Preview — sample data' },
  es: { patientName: 'Paciente de ejemplo', professionalName: 'Profesional de ejemplo', guardianName: 'Acudiente de ejemplo', label: 'Vista previa — datos de ejemplo' },
} as const;
export const consentTemplateInputSchema = z.object({
  detailFieldIds: consentDetailFieldsSchema.optional(),
  translations: consentTranslationsSchema,
  isActive: z.boolean(),
}).refine(value => !value.isActive || CONSENT_LANGUAGES.every(lang =>
  value.translations[lang].title.length > 0 && consentBodyText(value.translations[lang]).trim().length > 0), 'Both translations are required');
export type ConsentTemplate = z.infer<typeof consentTemplateInputSchema> & {
  key: string;
  isBuiltIn: boolean;
  updatedAt: string | null;
};
export const consentDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid date');
export const consentPreviewSchema = z.object({
  includeProviderSignature: z.boolean().optional(),
  detailFieldIds: consentDetailFieldsSchema.optional(),
  templateKey: z.string().min(1).max(100), language: z.enum(CONSENT_LANGUAGES),
  providerUserId: z.number().int().positive().optional(),
  professionalName: z.string().trim().max(200).default(''), consentDate: consentDateSchema,
  patientIdentification: z.string().trim().max(120).default(''),
  guardianName: z.string().trim().max(200).default(''),
}).refine(value => value.providerUserId !== undefined || value.professionalName.length > 0, { path: ['professionalName'], message: 'A professional is required' });
export type ConsentPreviewFields = z.infer<typeof consentPreviewSchema>;
export type ConsentProvider = { id: number; name: string; signatureRevision?: string | null };
export type ConsentContext = {
  patientName: string; patientReference: string; professionalName: string;
  patientAvatarUrl?: string | null;
  customFields?: ConsentCustomField[];
  customFieldValues?: Record<number, string>;
  providers: ConsentProvider[]; preferredProviderUserId: number | null;
  today: string; timezone: string; companyName: string;
};
export function fillConsentPlaceholders(body: string, values: Record<string, string>) {
  return body.replace(new RegExp(`\\{\\{${CONSENT_TOKEN_SOURCE}\\}\\}`, 'g'),
    (_, key: string) => values[key] || '________________');
}

export const CONSENT_DOCUMENT_LABELS = {
  en: { title: 'Informed Consent', patient: 'Patient', reference: 'Patient reference', identification: 'Identification',
    professional: 'Professional', consentDate: 'Consent date', printed: 'Printed', procedure: 'Procedure', guardian: 'Guardian',
    patientSignature: 'Patient signature', professionalSignature: 'Professional signature', guardianSignature: 'Guardian signature',
    page: 'Page', of: 'of', taxId: 'Tax ID', address: 'Address', phone: 'Phone', email: 'Email' },
  es: { title: 'Consentimiento informado', patient: 'Paciente', reference: 'Referencia del paciente', identification: 'Identificación',
    professional: 'Profesional', consentDate: 'Fecha del consentimiento', printed: 'Impresión', procedure: 'Procedimiento', guardian: 'Acudiente',
    patientSignature: 'Firma del paciente', professionalSignature: 'Firma del profesional', guardianSignature: 'Firma del acudiente',
    page: 'Página', of: 'de', taxId: 'Identificación fiscal', address: 'Dirección', phone: 'Teléfono', email: 'Correo' },
} as const;
