import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { dentalConsentTemplates } from '../../shared/schema';
import { DEFAULT_CONSENT_TEMPLATES } from '../../shared/dental-consent-defaults';
import { consentTemplateInputSchema, type ConsentTemplate } from '../../shared/dental-consent';
import { loadConsentBodyImages } from './dental-consent-asset-service';
import { validateConsentFields } from './dental-consent-custom-fields';

export function resolveConsentTemplates(rows: Array<typeof dentalConsentTemplates.$inferSelect>): ConsentTemplate[] {
  const templates = new Map(DEFAULT_CONSENT_TEMPLATES.map(template => [template.key, structuredClone(template)]));
  for (const row of rows) {
    templates.set(row.templateKey, { key: row.templateKey, isBuiltIn: templates.get(row.templateKey)?.isBuiltIn ?? false,
      ...consentTemplateInputSchema.parse(row), updatedAt: row.updatedAt.toISOString() });
  }
  return [...templates.values()];
}

export async function listConsentTemplates(companyId: number) {
  const rows = await db.select().from(dentalConsentTemplates).where(eq(dentalConsentTemplates.companyId, companyId));
  return resolveConsentTemplates(rows);
}

export async function saveConsentTemplate(companyId: number, key: string, input: unknown, userId: number | null) {
  const value = consentTemplateInputSchema.parse(input);
  await validateConsentFields(companyId, Object.values(value.translations).map(translation => translation.body), value.detailFieldIds);
  for (const translation of Object.values(value.translations)) {
    if (translation.bodyFormat === 'html') await loadConsentBodyImages(companyId, translation.body);
  }
  await db.insert(dentalConsentTemplates).values({ companyId, templateKey: key, ...value, createdBy: userId, updatedBy: userId })
    .onConflictDoUpdate({ target: [dentalConsentTemplates.companyId, dentalConsentTemplates.templateKey],
      set: { ...value, updatedBy: userId, updatedAt: new Date() },
      setWhere: and(eq(dentalConsentTemplates.companyId, companyId), eq(dentalConsentTemplates.templateKey, key)),
    });
  return (await listConsentTemplates(companyId)).find(template => template.key === key)!;
}
