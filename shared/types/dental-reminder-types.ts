import { z } from 'zod';
import {
  assertValidWhatsAppTemplateVariables,
  extractTemplateVariables,
  type WhatsAppTemplateVariableDefinition,
  type WhatsAppTemplateVariableMappings,
} from '../whatsapp-template-variables';
import { getWhatsAppTemplateMediaSource } from '../whatsapp-template-media';

export const DENTAL_REMINDER_VARIABLES = [
  'contact.name', 'contact.phone', 'contact.email', 'appointment.date',
  'appointment.start_time', 'appointment.end_time', 'appointment.duration',
  'appointment.service', 'appointment.provider', 'appointment.office',
  'appointment.status', 'appointment.notes', 'company.name', 'company.timezone',
] as const;
export const DENTAL_REMINDER_DEFAULT_MESSAGE =
  'Hello {{contact.name}}, a reminder of your {{appointment.service}} appointment on {{appointment.date}} at {{appointment.start_time}} ({{company.timezone}}).';
export const DENTAL_REMINDER_CHANNEL_TYPES = [
  'whatsapp', 'whatsapp_unofficial', 'whatsapp_official', 'instagram', 'messenger',
  'telegram', 'twilio_sms', 'webchat',
] as const;

export function isDentalReminderChannelSupported(channelType: string): boolean {
  return (DENTAL_REMINDER_CHANNEL_TYPES as readonly string[]).includes(channelType);
}

export function unsupportedReminderVariables(text: string): string[] {
  return Array.from(text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g), m => m[1].trim())
    .filter(key => !(DENTAL_REMINDER_VARIABLES as readonly string[]).includes(key));
}
const messageSchema = z.string().trim().min(1).max(8000).refine(
  text => unsupportedReminderVariables(text).length === 0,
  'Use the supported patient and appointment placeholders.',
);
export const dentalReminderRuleSchema = z.object({
  id: z.string().min(1).max(100),
  leadMinutes: z.number().int().min(1).max(525600),
  message: messageSchema,
  officialTemplates: z.record(z.string().regex(/^\d+$/), z.object({
    templateId: z.number().int().positive(),
    values: z.record(z.string(), messageSchema).default({}),
  })).default({}),
  /** Server-owned; changing text or channel must not repeat previously sent reminders. */
  activatedAt: z.string().datetime().nullable().default(null),
});
export const dentalAutomaticRemindersSchema = z.object({
  enabled: z.boolean().default(false),
  channelMode: z.enum(['latest_conversation', 'specific_connection']).default('latest_conversation'),
  channelConnectionId: z.number().int().positive().nullable().default(null),
  rules: z.array(dentalReminderRuleSchema).max(20).default(() => defaultDentalReminderRules()),
}).superRefine((value, ctx) => {
  if (value.enabled && !value.rules.length) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Add at least one reminder.' });
  if (value.enabled && value.channelMode === 'specific_connection' && !value.channelConnectionId) {
    ctx.addIssue({ code: 'custom', path: ['channelConnectionId'], message: 'Select a channel connection.' });
  }
  const ids = new Set<string>();
  const times = new Set<number>();
  value.rules.forEach((rule, index) => {
    if (ids.has(rule.id)) ctx.addIssue({ code: 'custom', path: ['rules', index, 'id'], message: 'Reminder IDs must be unique.' });
    if (times.has(rule.leadMinutes)) ctx.addIssue({ code: 'custom', path: ['rules', index, 'leadMinutes'], message: 'Each reminder must have a different lead time.' });
    ids.add(rule.id); times.add(rule.leadMinutes);
  });
});
export type DentalAutomaticReminders = z.infer<typeof dentalAutomaticRemindersSchema>;
export type DentalReminderRule = z.infer<typeof dentalReminderRuleSchema>;
export function defaultDentalReminderRules(): DentalReminderRule[] {
  return [{ id: 'day-before', leadMinutes: 1440 }, { id: 'two-hours-before', leadMinutes: 120 }]
    .map(rule => ({ ...rule, message: DENTAL_REMINDER_DEFAULT_MESSAGE, officialTemplates: {}, activatedAt: null }));
}
export function defaultDentalAutomaticReminders(): DentalAutomaticReminders {
  return { enabled: false, channelMode: 'latest_conversation', channelConnectionId: null, rules: defaultDentalReminderRules() };
}
export function stampDentalReminderActivation(next: DentalAutomaticReminders, previous: DentalAutomaticReminders, now: Date): DentalAutomaticReminders {
  return { ...next, rules: next.rules.map(rule => {
    const old = previous.rules.find(item => item.id === rule.id);
    const unchanged = previous.enabled && old?.leadMinutes === rule.leadMinutes && old.activatedAt;
    return { ...rule, activatedAt: unchanged ? old.activatedAt : now.toISOString() };
  }) };
}
export function renderDentalReminder(text: string, values: Record<string, string>): string {
  if (unsupportedReminderVariables(text).length) throw new Error('Unsupported reminder variable');
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => {
    if (values[key.trim()] == null) throw new Error(`Missing reminder variable: ${key.trim()}`);
    return values[key.trim()];
  });
}
export interface DentalReminderTemplateOption {
  id: number; connectionId: number | null; name: string; content: string;
  whatsappTemplateName?: string | null; whatsappTemplateLanguage?: string | null;
  whatsappTemplateStatus?: string | null; isActive?: boolean | null;
  whatsappTemplateComponents?: unknown; whatsappTemplateVariables?: unknown;
  whatsappTemplateVariableMappings?: WhatsAppTemplateVariableMappings | null;
  whatsappParameterFormat?: string | null; variables?: unknown;
  mediaUrls?: unknown; mediaHandle?: unknown;
}
export function dentalTemplateDefinitions(template: DentalReminderTemplateOption): WhatsAppTemplateVariableDefinition[] {
  const canonical = template.whatsappTemplateVariables;
  if (Array.isArray(canonical) && canonical.length) {
    const definitions = canonical as WhatsAppTemplateVariableDefinition[];
    assertValidWhatsAppTemplateVariables(definitions);
    return definitions;
  }
  if (Array.isArray(template.whatsappTemplateComponents) && template.whatsappTemplateComponents.length) {
    const inferred = extractTemplateVariables(template.whatsappTemplateComponents, template.whatsappParameterFormat).variables;
    if (inferred.length) return inferred;
  }
  return (Array.isArray(template.variables) ? template.variables : []).map(key => ({
    id: `body:${key}`, component: 'body',
    ...(/^\d+$/.test(String(key)) ? { position: Number(key) } : { name: String(key) }),
  }));
}
/** Text headers, bodies and supported buttons are fully configurable without media assets. */
export function isDentalReminderTemplateSupported(template: DentalReminderTemplateOption): boolean {
  try { dentalTemplateDefinitions(template); } catch { return false; }
  const components = Array.isArray(template.whatsappTemplateComponents) ? template.whatsappTemplateComponents : [];
  const unsupported = components.some((component: any) =>
    (String(component.type).toUpperCase() === 'HEADER' && component.format
      && !['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(component.format).toUpperCase())) ||
    ['CAROUSEL', 'LIMITED_TIME_OFFER', 'AUTHENTICATION'].includes(String(component.type).toUpperCase()) ||
    (String(component.type).toUpperCase() === 'BUTTONS' && (component.buttons || []).some((button: any) =>
      !['URL', 'PHONE_NUMBER', 'QUICK_REPLY', 'COPY_CODE'].includes(String(button.type).toUpperCase()))));
  if (unsupported) return false;
  const hasMediaHeader = components.some((component: any) =>
    String(component.type).toUpperCase() === 'HEADER'
    && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(component.format).toUpperCase()));
  const mediaSource = getWhatsAppTemplateMediaSource(template);
  return !hasMediaHeader || Boolean(mediaSource && (mediaSource.url || mediaSource.mediaId));
}

export interface DentalReminderOptions {
  connections: Array<{ id: number; accountName: string; accountId?: string; channelType: string; status: string | null }>;
  templates: DentalReminderTemplateOption[];
}
export function validateDentalReminderDeliverySettings(settings: DentalAutomaticReminders, options: DentalReminderOptions): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  if (!settings.enabled) return errors;
  if (settings.channelMode === 'specific_connection' && !options.connections.some(channel =>
    channel.id === settings.channelConnectionId && isDentalReminderChannelSupported(channel.channelType))) {
    errors.push({ path: 'automaticReminders.channelConnectionId', message: 'Select an active channel belonging to this clinic.' });
  }
  const officials = options.connections.filter(channel => channel.channelType === 'whatsapp_official' &&
    (settings.channelMode === 'latest_conversation' || channel.id === settings.channelConnectionId));
  settings.rules.forEach((rule, index) => {
    for (const channel of officials) {
      const mapping = rule.officialTemplates[String(channel.id)];
      const template = options.templates.find(item => item.id === mapping?.templateId && item.connectionId === channel.id &&
        item.whatsappTemplateStatus === 'approved' && item.isActive !== false && isDentalReminderTemplateSupported(item));
      const path = `automaticReminders.rules.${index}.officialTemplates.${channel.id}`;
      if (!mapping || !template) { errors.push({ path, message: `Select an approved text template for ${channel.accountName}.` }); continue; }
      for (const definition of dentalTemplateDefinitions(template)) {
        if (!mapping.values[definition.id]?.trim() && !template.whatsappTemplateVariableMappings?.[definition.id]) errors.push({ path: `${path}.values.${definition.id}`, message: `Map template variable ${definition.id}.` });
      }
    }
    // Reject forged mappings even if a different channel is selected now.
    for (const [connectionId, mapping] of Object.entries(rule.officialTemplates)) {
      if (!options.templates.some(template => template.id === mapping.templateId && template.connectionId === Number(connectionId))) {
        errors.push({ path: `automaticReminders.rules.${index}.officialTemplates.${connectionId}`, message: 'Template is unavailable or belongs to another connection.' });
      }
    }
  });
  return errors;
}
