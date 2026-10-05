import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { assertAppSumoAccess } from './appsumo-policy';
import { getPool } from '../db';
import { storage } from '../storage';
import { channelManager } from './channel-manager';
import { getInstagramRecipientId } from '../../shared/instagram-contact';
import { renderDentalReminder } from '../../shared/types/dental-reminder-types';
import { dentalReminderMessageValues, dentalReminderTemplateComponents } from '../../shared/utils/dental-reminder-message';
import { DentalReminderDeferred, DentalReminderRejected, DentalReminderSkip, type DentalReminderJob, type PreparedDentalReminder } from './dental-reminder-engine';
import { selectDentalReminderDestination } from './dental-reminder-destination';
import { getDentalReminderOptions } from './dental-reminder-configuration';
import { DentalReminderTimezoneError, resolveDentalReminderTimezone } from './dental-reminder-timezone';
import { dentalReminderRepository } from './dental-reminder-worker-repository';
import { isBsuid } from './whatsapp-username-utils';
import type { DentalAutomaticReminders, DentalReminderRule } from '../../shared/types/dental-reminder-types';

export async function prepareDentalReminder(job: DentalReminderJob): Promise<PreparedDentalReminder> {
  const context = await dentalReminderRepository.loadDentalReminderContext(job);
  if (!context) throw new DentalReminderSkip('Appointment or reminder settings are no longer eligible');
  return prepareDentalReminderMessage(job, context);
}

/** Shared channel delivery; scheduling and eligibility remain owned by each queue. */
export async function prepareDentalReminderMessage(job: DentalReminderJob, context: {
  appointment: { contactId: number }; settings: DentalAutomaticReminders; rule: DentalReminderRule; timezone?: string;
  loadAppointment?: () => Promise<Parameters<typeof dentalReminderMessageValues>[0]['appointment'] | null>;
  loadDetails?: () => Promise<{provider?: string; office?: string}>;
}): Promise<PreparedDentalReminder> {
  await assertAppSumoAccess(job.companyId);
  const [appointment, contact, channels, conversations, company, timezone] = await Promise.all([
    context.loadAppointment ? context.loadAppointment() : storage.getDentalScheduleAppointment(job.companyId, job.appointmentId),
    storage.getContact(context.appointment.contactId), storage.getChannelConnectionsByCompany(job.companyId),
    storage.getConversationsByContact(context.appointment.contactId), storage.getCompany(job.companyId), resolveDentalReminderTimezone(job.companyId).then(zone => context.timezone || zone).catch(error => {
      if (error instanceof DentalReminderTimezoneError) throw new DentalReminderDeferred(error.code);
      throw error;
    }),
  ]);
  if (!appointment || !contact || contact.companyId !== job.companyId || !company) throw new DentalReminderSkip('Patient or appointment unavailable');
  const destination = selectDentalReminderDestination(job.companyId, contact.id, context.settings, channels, conversations);
  const { channel } = destination;
  let recipient = '';
  if (['whatsapp', 'whatsapp_unofficial', 'whatsapp_official', 'twilio_sms'].includes(channel.channelType)) {
    const raw = contact.phone || (['phone', 'whatsapp'].includes(contact.identifierType || '') ? contact.identifier : '') || '';
    const phone = parsePhoneNumberFromString(raw.startsWith('+') ? raw : `+${raw}`);
    if (phone?.isValid()) recipient = phone.number;
    else if (destination.conversation && channel.channelType === 'whatsapp_official') {
      const bsuid = (contact as any).whatsappBsuid || contact.identifier;
      if (isBsuid(bsuid)) recipient = bsuid;
    } else if (destination.conversation && ['whatsapp', 'whatsapp_unofficial'].includes(channel.channelType)) {
      const lid = (contact as any).whatsappLid || (/^\d+@lid$/.test(contact.identifier || '') ? contact.identifier : '');
      if (lid && /^\d+(?:@lid)?$/.test(lid)) recipient = `${String(lid).replace(/@lid$/, '')}@lid`;
    }
    if (!recipient) throw new DentalReminderSkip('Patient does not have a valid phone number or existing WhatsApp identity');
  } else if (channel.channelType === 'instagram') recipient = getInstagramRecipientId(contact) || '';
  else if (channel.channelType === 'webchat') {
    const service = (await import('./channels/webchat')).default;
    recipient = await service.resolveSessionIdForContact(channel.id, contact) || '';
  } else if (contact.identifierType === channel.channelType) recipient = contact.identifier || '';
  if (!recipient) throw new DentalReminderSkip('Patient identity is unavailable for the selected channel');

  const details = context.loadDetails ? { rows: [await context.loadDetails()] } : await getPool().query(`SELECT COALESCE(u.full_name,u.username) AS provider, d.name AS office
    FROM contact_appointments a LEFT JOIN users u ON u.id = a.provider_user_id AND u.company_id = $2
    LEFT JOIN dental_chairs d ON d.id = a.chair_id AND d.company_id = $2 WHERE a.id = $1`, [job.appointmentId, job.companyId]);
  const values = dentalReminderMessageValues({ appointment, contact, companyName: company.name, timezone,
    providerName: details.rows[0]?.provider, officeName: details.rows[0]?.office });

  let official: { templateName: string; language: string; components: any[] } | undefined;
  if (channel.channelType === 'whatsapp_official') {
    const mapping = context.rule.officialTemplates[String(channel.id)];
    const options = await getDentalReminderOptions(job.companyId);
    const template = options.templates.find(item => item.id === mapping?.templateId && item.connectionId === channel.id);
    if (!mapping || !template) throw new DentalReminderSkip('Approved WhatsApp template is missing or unavailable for this connection');
    try {
      official = { templateName: template.whatsappTemplateName || template.name, language: template.whatsappTemplateLanguage || 'en',
        components: dentalReminderTemplateComponents(template, mapping.values, values) };
    } catch { throw new DentalReminderSkip('Required WhatsApp template variables could not be resolved'); }
  }
  let conversation = destination.conversation;
  if (!conversation) {
    // Serialize first-contact creation for this patient and connection across workers/rules.
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('dental-reminder-chat'), hashtext($1))", [`${job.companyId}:${contact.id}:${channel.id}`]);
      conversation = (await storage.getConversationsByContact(contact.id)).find(item => item.companyId === job.companyId && item.channelId === channel.id && !item.isGroup);
      if (!conversation) conversation = await storage.createConversation({ companyId: job.companyId, contactId: contact.id,
        channelId: channel.id, channelType: channel.channelType, status: 'open', assignedToUserId: channel.userId });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const conversationId = conversation.id;
  const content = renderDentalReminder(context.rule.message, values);
  return {
    conversationId, channelConnectionId: channel.id,
    send: async () => {
      await assertAppSumoAccess(job.companyId);
      if (official) {
        const service = await import('./channels/whatsapp-official');
        try {
          const result = await service.sendTemplateMessage(channel.id, channel.userId, job.companyId, recipient,
            official.templateName, official.language, official.components, false, conversationId);
          return String(result.messageId || result.id || '');
        } catch (error: any) {
          const status = Number(error.providerStatus);
          if (status >= 400 && status < 500) throw new DentalReminderRejected(`WhatsApp rejected the reminder (HTTP ${status})`, status === 429);
          throw new Error('WhatsApp delivery response unavailable; outcome unknown');
        }
      }
      const result = await channelManager.sendDirectMessage(channel.channelType, recipient, 'text', content, undefined,
        appointment.title, job.companyId, channel.id, channel.userId, conversationId);
      if (!result.success) throw new Error('Channel did not confirm reminder delivery; outcome unknown');
      return String(result.messageId || '');
    },
  };
}
