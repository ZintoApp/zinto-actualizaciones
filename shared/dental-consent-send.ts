import { z } from 'zod';
import { extractTemplateVariables, buildTemplateSendComponents, resolveTemplateVariableMapping, type WhatsAppTemplateComponentValues, type WhatsAppTemplateVariableMappings } from './whatsapp-template-variables';

export const CONSENT_MESSAGE_CATEGORY = 'dental_consent';
export const CONSENT_PDF_MAX_BYTES = 25 * 1024 * 1024;
export const CONSENT_MESSAGE_VARIABLES = ['patient.name', 'patient.reference', 'consent.procedure', 'consent.professional', 'consent.date', 'consent.language', 'consent.guardian', 'company.name'] as const;
export const CONSENT_STARTER_MESSAGES = {
  en: 'Hello {{patient.name}}, attached is your consent form for {{consent.procedure}}. Please review it before your treatment. Contact {{company.name}} if you have any questions.',
  es: 'Hola {{patient.name}}, adjuntamos su consentimiento para {{consent.procedure}}. Revíselo antes de su tratamiento. Si tiene alguna pregunta, contacte con {{company.name}}.',
};
export function renderConsentMessage(text: string, values: Record<string, string>): string {
  const remainder = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_token, name: string) => {
    if (!CONSENT_MESSAGE_VARIABLES.includes(name as any) || !Object.hasOwn(values, name)) throw new Error('messageVariables');
    return '';
  });
  if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('messageVariables');
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_token, name: string) => values[name]);
}
export const consentSendSchema = z.object({
  submissionId: z.string().uuid(), conversationId: z.number().int().positive(), proof: z.string().min(1).max(16000),
  content: z.string().trim().max(8000).default(''), subject: z.string().trim().max(200).default(''),
  quickTemplateId: z.number().int().positive().optional(), officialTemplateId: z.number().int().positive().optional(),
  templateValues: z.record(z.string().max(2000)).default({}), savePatientCopy: z.boolean().default(false),
}).strict();
export type ConsentSendInput = z.infer<typeof consentSendSchema>;
export type ConsentOfficialTemplate = { id: number; connectionId: number | null; name: string; content: string;
  whatsappTemplateName: string | null; whatsappTemplateLanguage: string | null; whatsappParameterFormat: string | null;
  whatsappTemplateComponents: any; whatsappTemplateVariableMappings?: WhatsAppTemplateVariableMappings | null };
export function consentDocumentTemplate(template: ConsentOfficialTemplate): boolean {
  const components = template.whatsappTemplateComponents;
  return Array.isArray(components) && components.some(c => String(c.type).toUpperCase() === 'HEADER' && String(c.format).toUpperCase() === 'DOCUMENT');
}
export function consentTemplateDefinitions(template: ConsentOfficialTemplate) {
  return extractTemplateVariables(template.whatsappTemplateComponents, template.whatsappParameterFormat).variables;
}
export function consentOfficialComponents(template: ConsentOfficialTemplate, mappings: Record<string, string>, values: Record<string, string>) {
  const extracted = extractTemplateVariables(template.whatsappTemplateComponents, template.whatsappParameterFormat);
  const components: WhatsAppTemplateComponentValues = { header: {}, body: {}, buttons: [] };
  for (const definition of extracted.variables) {
    const override = mappings[definition.id]?.trim();
    const text = override
      ? renderConsentMessage(override, values)
      : resolveTemplateVariableMapping(template.whatsappTemplateVariableMappings?.[definition.id], values) || '';
    if (!text.trim() || text.length > 1024) throw new Error('messageVariables');
    const key = definition.name || String(definition.position || 1);
    if (definition.component === 'button') {
      let button = components.buttons!.find(b => b.index === definition.buttonIndex && b.subType === definition.buttonSubType);
      if (!button) { button = { index: definition.buttonIndex!, subType: definition.buttonSubType!, values: {} }; components.buttons!.push(button); }
      (button.values as Record<string, string>)[key] = text;
    } else (components[definition.component] as Record<string, string>)[key] = text;
  }
  return buildTemplateSendComponents(extracted.variables, components, extracted.parameterFormat);
}
export function consentOfficialPreview(template: ConsentOfficialTemplate, mappings: Record<string, string>, values: Record<string, string>) {
  return (template.whatsappTemplateComponents as any[]).filter(c => ['BODY', 'FOOTER'].includes(String(c.type).toUpperCase()))
    .map(c => String(c.text || '').replace(/\{\{([^{}]+)\}\}/g, (_token, key) => {
      const id = `body:${key}`;
      const override = mappings[id]?.trim();
      return override ? renderConsentMessage(override, values)
        : resolveTemplateVariableMapping(template.whatsappTemplateVariableMappings?.[id], values) || `{{${key}}}`;
    })).join('\n');
}
export type ConsentSendChannel = { id: number; channelId: number; channelType: string; name: string; requiresApprovedTemplate: boolean };
export type ConsentSendContext = {
  patientName: string; patientReference: string; avatarUrl: string | null; procedure: string; language: 'en' | 'es';
  variables: Record<string, string>; conversations: ConsentSendChannel[]; defaultConversationId: number | null;
  availableChannels: Array<{ id: number; channelType: string; name: string }>;
  officialTemplates: ConsentOfficialTemplate[];
};
export type ConsentDeliveryResult = { id: string; status: 'sent' | 'unknown' | 'sending' | 'failed'; patientCopy: 'none' | 'saved' | 'failed'; documentId?: number | null };
