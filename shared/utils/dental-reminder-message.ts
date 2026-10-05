import { buildTemplateSendComponents, resolveTemplateVariableMapping, type WhatsAppTemplateComponentValues } from '../whatsapp-template-variables';
import { dentalTemplateDefinitions, renderDentalReminder, type DentalReminderTemplateOption } from '../types/dental-reminder-types';
import { buildWhatsAppTemplateMediaHeader, getWhatsAppTemplateMediaSource } from '../whatsapp-template-media';

export function dentalReminderMessageValues(input: {
  appointment: { scheduledAt: Date | string; durationMinutes?: number | null; title: string; bookingServiceLabel?: string | null; location?: string | null; status: string; description?: string | null };
  contact: { name?: string | null; phone?: string | null; email?: string | null };
  companyName: string; timezone: string; locale?: string; providerName?: string | null; officeName?: string | null;
}): Record<string, string> {
  const { appointment, contact, timezone } = input;
  if (typeof timezone !== 'string' || !timezone.trim()) throw new Error('A saved company timezone is required for dental reminders');
  const startsAt = new Date(appointment.scheduledAt);
  const duration = appointment.durationMinutes || 60;
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const dateFormat = new Intl.DateTimeFormat(input.locale || 'en', { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat(input.locale || 'en', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true });
  return {
    'contact.name': contact.name || '', 'contact.phone': contact.phone || '', 'contact.email': contact.email || '',
    'appointment.date': dateFormat.format(startsAt), 'appointment.start_time': timeFormat.format(startsAt),
    'appointment.end_time': timeFormat.format(endsAt), 'appointment.duration': String(duration),
    'appointment.service': appointment.bookingServiceLabel || appointment.title || '',
    'appointment.provider': input.providerName || '', 'appointment.office': input.officeName || appointment.location || '',
    'appointment.status': appointment.status, 'appointment.notes': appointment.description || '',
    'company.name': input.companyName, 'company.timezone': timezone,
  };
}
export function dentalReminderTemplateComponents(template: DentalReminderTemplateOption, mappings: Record<string, string>, values: Record<string, string>) {
  const definitions = dentalTemplateDefinitions(template);
  const components: WhatsAppTemplateComponentValues = { header: {}, body: {}, buttons: [] };
  for (const definition of definitions) {
    const override = mappings[definition.id]?.trim();
    const text = override
      ? renderDentalReminder(override, values)
      : resolveTemplateVariableMapping(template.whatsappTemplateVariableMappings?.[definition.id], values);
    if (!text) throw new Error(`Missing template mapping: ${definition.id}`);
    const key = definition.name || String(definition.position || 1);
    if (definition.component === 'button') {
      let button = components.buttons!.find(item => item.index === definition.buttonIndex && item.subType === definition.buttonSubType);
      if (!button) { button = { index: definition.buttonIndex || 0, subType: definition.buttonSubType!, values: {} }; components.buttons!.push(button); }
      (button.values as Record<string, string>)[key] = text;
    } else (components[definition.component] as Record<string, string>)[key] = text;
  }
  const result = buildTemplateSendComponents(definitions, components, template.whatsappParameterFormat === 'named' ? 'named' : 'positional');
  const mediaSource = getWhatsAppTemplateMediaSource(template);
  if (mediaSource) result.unshift(buildWhatsAppTemplateMediaHeader(mediaSource));
  return result;
}
