import { storage } from '../storage';
import {
  buildTemplateSendComponents,
  mappingVariablePath,
  resolveTemplateVariableMapping,
  type WhatsAppParameterFormat,
  type WhatsAppTemplateComponentValues,
  type WhatsAppTemplateVariableDefinition,
  type WhatsAppTemplateVariableMappings,
} from '../../shared/whatsapp-template-variables';

const ACTIVE_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed', 'held', 'pending_request']);

async function companyTimezone(companyId: number): Promise<string> {
  const setting = await storage.getCompanySetting(companyId, 'defaultTimezone');
  const value = typeof setting?.value === 'string' && setting.value.trim() ? setting.value.trim() : 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date()); return value; }
  catch { return 'UTC'; }
}

function explicitValue(definition: WhatsAppTemplateVariableDefinition, values?: WhatsAppTemplateComponentValues): string | undefined {
  if (!values) return undefined;
  const source = definition.component === 'button'
    ? values.buttons?.find(item => item.index === definition.buttonIndex && item.subType === definition.buttonSubType)?.values
    : values[definition.component];
  const value = Array.isArray(source)
    ? source[(definition.position || 1) - 1]
    : source?.[definition.name || String(definition.position || 1)];
  return value == null || String(value).trim() === '' ? undefined : String(value).trim();
}

function assignComponentValue(target: WhatsAppTemplateComponentValues, definition: WhatsAppTemplateVariableDefinition, value: string) {
  const key = definition.name || String(definition.position || 1);
  if (definition.component === 'button') {
    target.buttons ||= [];
    let button = target.buttons.find(item => item.index === definition.buttonIndex && item.subType === definition.buttonSubType);
    if (!button) {
      button = { index: definition.buttonIndex || 0, subType: definition.buttonSubType!, values: {} };
      target.buttons.push(button);
    }
    (button.values as Record<string, string>)[key] = value;
  } else {
    target[definition.component] ||= {};
    (target[definition.component] as Record<string, string>)[key] = value;
  }
}

export function resolveWhatsAppTemplateComponents(input: {
  definitions: WhatsAppTemplateVariableDefinition[];
  parameterFormat?: WhatsAppParameterFormat | string | null;
  mappings?: WhatsAppTemplateVariableMappings | null;
  context?: Record<string, any>;
  explicitValues?: WhatsAppTemplateComponentValues | null;
}): any[] {
  const values: WhatsAppTemplateComponentValues = { header: {}, body: {}, buttons: [] };
  for (const definition of input.definitions) {
    const value = explicitValue(definition, input.explicitValues || undefined)
      ?? resolveTemplateVariableMapping(input.mappings?.[definition.id], input.context || {});
    if (value == null || value.trim() === '') throw new Error(`Template variable ${definition.id} could not be resolved`);
    assignComponentValue(values, definition, value);
  }
  return buildTemplateSendComponents(
    input.definitions,
    values,
    input.parameterFormat === 'named' ? 'named' : 'positional',
  );
}

export async function buildWhatsAppTemplateContext(input: {
  companyId: number;
  contact?: any;
  conversation?: any;
  appointmentId?: number | null;
  dealId?: number | null;
  mappings?: WhatsAppTemplateVariableMappings | null;
  definitions?: WhatsAppTemplateVariableDefinition[];
  explicitValues?: WhatsAppTemplateComponentValues | null;
  extraVariables?: Record<string, any> | null;
  locale?: string;
}): Promise<Record<string, any>> {
  const now = new Date();
  const company = await storage.getCompany(input.companyId);
  const timezone = await companyTimezone(input.companyId).catch(() => 'UTC');
  const requestedLocale = (input.locale || 'en').replace(/_/g, '-');
  let locale = requestedLocale;
  try { new Intl.DateTimeFormat(locale).format(now); }
  catch { locale = 'en'; }
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const context: Record<string, any> = {
    contact: input.contact ? {
      ...input.contact,
      username: input.contact.whatsappUsername || '',
      custom: input.contact.customFields || {},
    } : {},
    company: { ...(company || {}), timezone },
    conversation: input.conversation || {},
    current: {
      timestamp: now.toISOString(),
      date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
      time: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now),
    },
  };
  context.date = { today: new Intl.DateTimeFormat(locale, { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' }).format(now) };
  context.time = { now: new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now) };
  Object.assign(context, input.extraVariables || {});

  const neededIds = input.definitions
    ? new Set(input.definitions.filter(definition => !explicitValue(definition, input.explicitValues || undefined)).map(definition => definition.id))
    : null;
  const paths = Object.entries(input.mappings || {})
    .filter(([id]) => !neededIds || neededIds.has(id))
    .map(([, mapping]) => mappingVariablePath(mapping))
    .filter(Boolean) as string[];
  if (paths.some(path => path.startsWith('appointment.'))) {
    let appointment: any;
    let details: any;
    if (input.appointmentId) {
      appointment = await storage.getDentalScheduleAppointment(input.companyId, input.appointmentId);
      if (!appointment || (input.contact && appointment.contactId !== input.contact.id)) {
        throw new Error('The selected appointment is not available for this contact');
      }
      details = (await storage.listDentalSchedule(input.companyId, {})).find(item => item.id === appointment.id);
    } else {
      const candidates = (await storage.listDentalSchedule(input.companyId, { from: now }))
        .filter(item => (!input.contact || item.contactId === input.contact.id) && ACTIVE_APPOINTMENT_STATUSES.has(item.status));
      if (candidates.length > 1) throw new Error('Multiple upcoming appointments match this contact; an appointment context is required');
      details = candidates[0];
      appointment = candidates[0];
    }
    if (!appointment) throw new Error('No upcoming appointment is available for this contact');
    const startsAt = new Date(appointment.scheduledAt);
    const duration = appointment.durationMinutes || 60;
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const dateFormat = new Intl.DateTimeFormat(locale, { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' });
    const timeFormat = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
    context.appointment = {
      ...appointment,
      id: appointment.id,
      date: dateFormat.format(startsAt),
      start_time: timeFormat.format(startsAt),
      end_time: timeFormat.format(endsAt),
      duration: String(duration),
      service: appointment.bookingServiceLabel || appointment.title || '',
      provider: details?.providerName || '',
      office: details?.chairName || appointment.location || '',
      notes: appointment.description || '',
    };
  }

  if (paths.some(path => path.startsWith('deal.'))) {
    const deals = input.dealId
      ? [await storage.getDeal(input.dealId)].filter(Boolean)
      : input.contact ? await storage.getDealsByContact(input.contact.id, input.companyId) : [];
    if (deals.length > 1 && !input.dealId) throw new Error('Multiple deals match this contact; a deal context is required');
    const deal: any = deals[0];
    if (!deal || deal.companyId !== input.companyId || (input.contact && deal.contactId !== input.contact.id)) {
      throw new Error('A deal context is required for this template');
    }
    context.deal = { ...deal, custom: deal.customFields || {} };
  }

  return context;
}
