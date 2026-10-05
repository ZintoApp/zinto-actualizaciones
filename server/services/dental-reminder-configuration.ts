import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { campaignTemplates } from '../../shared/schema';
import { isDentalReminderChannelSupported, isDentalReminderTemplateSupported, type DentalReminderOptions } from '../../shared/types/dental-reminder-types';

/** Return only configuration fields; never expose channel credentials through booking settings. */
export async function getDentalReminderOptions(companyId: number): Promise<DentalReminderOptions> {
  const connections = (await storage.getChannelConnectionsByCompany(companyId))
    .filter(channel => ['active', 'connected'].includes(channel.status || '') &&
      isDentalReminderChannelSupported(channel.channelType))
    .map(({ id, accountName, accountId, channelType, status }) => ({ id, accountName, accountId, channelType, status }));
  const templates = await db.select({
    id: campaignTemplates.id, connectionId: campaignTemplates.connectionId, name: campaignTemplates.name,
    content: campaignTemplates.content, isActive: campaignTemplates.isActive,
    whatsappTemplateStatus: campaignTemplates.whatsappTemplateStatus,
    whatsappTemplateName: campaignTemplates.whatsappTemplateName,
    whatsappTemplateLanguage: campaignTemplates.whatsappTemplateLanguage,
    whatsappTemplateComponents: campaignTemplates.whatsappTemplateComponents,
    whatsappTemplateVariables: campaignTemplates.whatsappTemplateVariables,
    whatsappTemplateVariableMappings: campaignTemplates.whatsappTemplateVariableMappings,
    whatsappParameterFormat: campaignTemplates.whatsappParameterFormat,
    mediaUrls: campaignTemplates.mediaUrls,
    mediaHandle: campaignTemplates.mediaHandle,
    variables: campaignTemplates.variables,
  }).from(campaignTemplates).where(and(eq(campaignTemplates.companyId, companyId),
    eq(campaignTemplates.whatsappChannelType, 'official'), eq(campaignTemplates.whatsappTemplateStatus, 'approved'), eq(campaignTemplates.isActive, true)));
  return { connections, templates: templates.map(template => ({
    ...template,
    whatsappTemplateVariableMappings: template.whatsappTemplateVariableMappings as any,
  })).filter(isDentalReminderTemplateSupported) };
}
