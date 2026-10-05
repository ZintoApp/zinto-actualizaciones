import { and, eq } from 'drizzle-orm';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { db } from '../db';
import { storage } from '../storage';
import { campaignTemplates } from '../../shared/schema';
import { channelSupportsInvoicePdfAttachment } from './erp-invoice-channel-document';
import { isBsuid } from './whatsapp-username-utils';
import { consentDocumentTemplate, type ConsentSendContext } from '../../shared/dental-consent-send';
import { resolveConsentDocument } from './dental-consent-document-service';
import { ConsentFieldError } from './dental-consent-custom-fields';
import { verifyConsentProof } from './dental-consent-proof';

export const isWhatsApp = (type: string) => ['whatsapp', 'whatsapp_unofficial', 'whatsapp_official'].includes(type);
export const activeConsentChannel = (channel: any, companyId: number) => channel?.companyId === companyId && ['active', 'connected'].includes(channel.status) && channelSupportsInvoicePdfAttachment(channel.channelType);
export async function consentRecipient(channel: any, contact: any, existing = true): Promise<string> {
  if (isWhatsApp(channel.channelType)) {
    const raw = contact.phone || (['phone', 'whatsapp'].includes(contact.identifierType) ? contact.identifier : '') || '';
    const phone = parsePhoneNumberFromString(raw.startsWith('+') ? raw : `+${raw}`);
    if (phone?.isValid()) return phone.number;
    if (existing && channel.channelType === 'whatsapp_official' && isBsuid(contact.whatsappBsuid || contact.identifier)) return contact.whatsappBsuid || contact.identifier;
    const lid = contact.whatsappLid || contact.identifier;
    if (existing && channel.channelType !== 'whatsapp_official' && /^\d+@lid$/.test(lid || '')) return lid;
  } else if (channel.channelType === 'email') {
    const email = contact.email || (contact.identifierType === 'email' ? contact.identifier : '');
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return email;
  } else if (channel.channelType === 'webchat') {
    const service = (await import('./channels/webchat')).default;
    return await service.resolveSessionIdForContact(channel.id, contact) || '';
  } else if (contact.identifierType === channel.channelType) return contact.identifier || '';
  return '';
}
export async function consentNeedsApprovedTemplate(conversation: any) {
  if (conversation.channelType !== 'whatsapp_official') return false;
  const inbound = (await storage.getMessagesByConversation(conversation.id)).filter(m => m.direction === 'inbound')
    .sort((a, b) => new Date(b.sentAt || b.createdAt || 0).getTime() - new Date(a.sentAt || a.createdAt || 0).getTime())[0];
  return !inbound || Date.now() - new Date(inbound.sentAt || inbound.createdAt || 0).getTime() >= 24 * 60 * 60 * 1000;
}
export async function consentOfficialTemplates(companyId: number) {
  const rows = await db.select({ id: campaignTemplates.id, connectionId: campaignTemplates.connectionId, name: campaignTemplates.name,
    content: campaignTemplates.content, whatsappTemplateName: campaignTemplates.whatsappTemplateName,
    whatsappTemplateLanguage: campaignTemplates.whatsappTemplateLanguage, whatsappParameterFormat: campaignTemplates.whatsappParameterFormat,
    whatsappTemplateComponents: campaignTemplates.whatsappTemplateComponents,
    whatsappTemplateVariableMappings: campaignTemplates.whatsappTemplateVariableMappings,
  }).from(campaignTemplates).where(and(eq(campaignTemplates.companyId, companyId), eq(campaignTemplates.isActive, true),
    eq(campaignTemplates.whatsappChannelType, 'official'), eq(campaignTemplates.whatsappTemplateStatus, 'approved')));
  return rows.map(row => ({
    ...row,
    whatsappTemplateVariableMappings: row.whatsappTemplateVariableMappings as any,
  })).filter(consentDocumentTemplate);
}
export async function verifiedConsentSnapshot(companyId: number, contactId: number, userId: number, token: string, pdf?: Buffer) {
  const proof = verifyConsentProof(token, companyId, contactId, userId, pdf);
  const snapshot = await resolveConsentDocument(companyId, contactId, proof.fields, userId).catch(error => {
    if (error instanceof ConsentFieldError || error.message === 'signatureUnavailable') throw new Error('previewStale');
    throw error;
  });
  if (snapshot.fingerprint !== proof.fingerprint) throw new Error('previewStale');
  return { ...snapshot, proof };
}
export async function getConsentSendContext(companyId: number, contactId: number, userId: number, token: string): Promise<ConsentSendContext> {
  const { input } = await verifiedConsentSnapshot(companyId, contactId, userId, token);
  const contact = await storage.getContact(contactId);
  if (!contact || contact.companyId !== companyId) throw new Error('patient');
  const channels = (await storage.getChannelConnectionsByCompany(companyId)).filter(c => activeConsentChannel(c, companyId));
  const candidates = (await storage.getConversationsByContact(contactId)).filter(c => c.companyId === companyId && c.contactId === contactId && !c.isGroup && channels.some(channel => channel.id === c.channelId))
    .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
  const conversations: ConsentSendContext['conversations'] = [];
  for (const conversation of candidates) {
    const channel = channels.find(c => c.id === conversation.channelId)!;
    if (!await consentRecipient(channel, contact)) continue;
    conversations.push({ id: conversation.id, channelId: channel.id, channelType: channel.channelType,
      name: channel.accountName || channel.accountId || channel.channelType, requiresApprovedTemplate: await consentNeedsApprovedTemplate(conversation) });
  }
  const availableChannels: ConsentSendContext['availableChannels'] = [];
  for (const channel of channels) {
    if (isWhatsApp(channel.channelType) && !candidates.some(c => c.channelId === channel.id) && await consentRecipient(channel, contact, false))
      availableChannels.push({ id: channel.id, channelType: channel.channelType, name: channel.accountName || channel.accountId || channel.channelType });
  }
  const language = input.language;
  return { patientName: input.patientName, patientReference: input.patientReference, avatarUrl: contact.avatarUrl || null,
    procedure: input.title, language, conversations, availableChannels, defaultConversationId: conversations[0]?.id ?? null,
    officialTemplates: (await consentOfficialTemplates(companyId)).filter(t => channels.some(c => c.id === t.connectionId)),
    variables: { 'patient.name': input.patientName, 'contact.name': input.patientName, 'patient.reference': input.patientReference, 'consent.procedure': input.title,
      'consent.professional': input.professionalName, 'consent.guardian': input.guardianName,
      'consent.date': new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${input.consentDate}T12:00:00Z`)),
      'consent.language': language === 'es' ? 'Español' : 'English', 'company.name': input.companyName } };
}
