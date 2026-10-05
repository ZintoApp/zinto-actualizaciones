import { and, eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db';
import { storage } from '../storage';
import { dentalConsentDeliveries, contactDocuments, quickReplyTemplates } from '../../shared/schema';
import { CONSENT_MESSAGE_CATEGORY, consentOfficialComponents, consentOfficialPreview, renderConsentMessage, type ConsentSendInput, type ConsentDeliveryResult } from '../../shared/dental-consent-send';
import { consentHash, signConsentPayload } from './dental-consent-proof';
import { activeConsentChannel, consentRecipient, consentNeedsApprovedTemplate, consentOfficialTemplates, verifiedConsentSnapshot, getConsentSendContext } from './dental-consent-send-context';

type Delivery = typeof dentalConsentDeliveries.$inferSelect;
const whereDelivery = (companyId: number, id: string) => and(eq(dentalConsentDeliveries.companyId, companyId), eq(dentalConsentDeliveries.id, id));
export async function getConsentDelivery(companyId: number, id: string) {
  return (await db.select().from(dentalConsentDeliveries).where(whereDelivery(companyId, id)))[0];
}
export function consentDeliveryResult(row: Delivery): ConsentDeliveryResult {
  return { id: row.id, status: row.status as ConsentDeliveryResult['status'],
    patientCopy: row.copyStatus === 'saved' ? 'saved' : ['pending', 'failed', 'saving'].includes(row.copyStatus) ? 'failed' : 'none', documentId: row.documentId };
}
export function consentMediaPath(companyId: number, id: string) { return `/api/erp/dental/consent-deliveries/${id}/pdf`; }
function providerMediaUrl(baseUrl: string, companyId: number, id: string) {
  const token = signConsentPayload({ purpose: 'media', companyId, id, expires: Date.now() + 15 * 60 * 1000 });
  return `${baseUrl.replace(/\/$/, '')}/api/dental-consent-media/${id}?token=${encodeURIComponent(token)}`;
}
export async function saveConsentPatientCopy(companyId: number, id: string): Promise<Delivery> {
  const row = await getConsentDelivery(companyId, id);
  if (!row || row.status !== 'sent') throw new Error('deliveryUnavailable');
  if (!['pending', 'failed'].includes(row.copyStatus)) return row;
  try {
    await db.transaction(async tx => {
      // Lock and insert in one transaction: process interruption rolls back the
      // claim, and concurrent copy retries cannot create duplicate documents.
      const [locked] = await tx.select().from(dentalConsentDeliveries).where(whereDelivery(companyId, id)).for('update');
      if (!['pending', 'failed'].includes(locked.copyStatus)) return;
      const directory = path.resolve('private', 'consent-documents', String(companyId));
      await mkdir(directory, { recursive: true });
      const filePath = path.join(directory, `${id}.pdf`);
      await writeFile(filePath, Buffer.from(row.content));
      const [document] = await tx.insert(contactDocuments).values({ contactId: row.contactId, filename: `${id}.pdf`, originalName: row.filename,
        mimeType: 'application/pdf', fileSize: row.content.length, filePath, fileUrl: consentMediaPath(companyId, id),
        category: 'consent', description: row.providerSigned ? 'Provider signature included; patient not signed / Firma del profesional incluida; sin firma del paciente' : 'Unsigned consent / Consentimiento sin firmar', uploadedBy: row.createdBy }).returning();
      await tx.update(dentalConsentDeliveries).set({ copyStatus: 'saved', documentId: document.id, updatedAt: new Date() }).where(whereDelivery(companyId, id));
    });
  } catch {
    await db.update(dentalConsentDeliveries).set({ copyStatus: 'failed', updatedAt: new Date() })
      .where(and(whereDelivery(companyId, id), eq(dentalConsentDeliveries.copyStatus, row.copyStatus)));
  }
  return (await getConsentDelivery(companyId, id))!;
}

// A provider call is deliberately separated from the durable claim. An interrupted
// process leaves 'sending', which must be checked in the Inbox, never blindly retried.
export async function executeConsentParts(row: Delivery, send: (part: string) => Promise<string>, persist: (patch: Partial<Delivery>) => Promise<void>) {
  for (const part of Object.keys(row.parts)) {
    if (row.parts[part].status === 'sent') continue;
    if (!['pending', 'rejected'].includes(row.parts[part].status)) return;
    row.parts[part] = { status: 'sending' };
    await persist({ parts: { ...row.parts }, updatedAt: new Date() });
    try {
      const messageId = await send(part);
      row.parts[part] = { status: 'sent', messageId };
      await persist({ parts: { ...row.parts }, updatedAt: new Date() });
    } catch (error: any) {
      const rejected = error?.definitelyRejected === true;
      row.parts[part] = { status: rejected ? 'rejected' : 'unknown' };
      row.status = rejected ? 'failed' : 'unknown';
      await persist({ parts: { ...row.parts }, status: row.status, updatedAt: new Date() });
      return;
    }
  }
  row.status = 'sent';
  await persist({ status: 'sent', updatedAt: new Date() });
}

export async function sendConsentDelivery(companyId: number, contactId: number, userId: number, body: ConsentSendInput, pdf: Buffer, baseUrl: string) {
  const { proof: _proof, ...request } = body;
  const requestHash = consentHash(JSON.stringify({ ...request, pdfHash: consentHash(pdf) }));
  let row = await getConsentDelivery(companyId, body.submissionId);
  if (row) {
    if (row.contactId !== contactId || row.createdBy !== userId || row.requestHash !== requestHash) throw new Error('deliveryConflict');
    if (row.status === 'sent') return consentDeliveryResult(await saveConsentPatientCopy(companyId, row.id));
    if (row.status !== 'failed') return consentDeliveryResult(row);
  }
  const { input } = await verifiedConsentSnapshot(companyId, contactId, userId, body.proof, pdf);
  const context = await getConsentSendContext(companyId, contactId, userId, body.proof);
  const conversation = await storage.getConversation(body.conversationId);
  if (!conversation || conversation.companyId !== companyId || conversation.contactId !== contactId || conversation.isGroup) throw new Error('invalidChannel');
  const channel = await storage.getChannelConnection(conversation.channelId);
  if (!activeConsentChannel(channel, companyId)) throw new Error('channelUnavailable');
  const contact = await storage.getContact(contactId);
  if (!contact || contact.companyId !== companyId) throw new Error('patient');
  const recipient = await consentRecipient(channel, contact);
  if (!recipient) throw new Error('missingIdentity');
  if (body.quickTemplateId) {
    const [template] = await db.select().from(quickReplyTemplates).where(and(eq(quickReplyTemplates.id, body.quickTemplateId), eq(quickReplyTemplates.companyId, companyId), eq(quickReplyTemplates.isActive, true), eq(quickReplyTemplates.category, CONSENT_MESSAGE_CATEGORY)));
    if (!template) throw new Error('messageTemplateUnavailable');
  }
  const official = body.officialTemplateId ? (await consentOfficialTemplates(companyId)).find(t => t.id === body.officialTemplateId && t.connectionId === channel!.id) : undefined;
  if (body.officialTemplateId && (channel!.channelType !== 'whatsapp_official' || !official)) throw new Error('officialTemplateRequired');
  if (await consentNeedsApprovedTemplate(conversation) && !official) throw new Error('officialTemplateRequired');
  const components = official ? consentOfficialComponents(official, body.templateValues, context.variables) : undefined;
  const content = official ? consentOfficialPreview(official, body.templateValues, context.variables) : renderConsentMessage(body.content, context.variables);
  if (!content.trim()) throw new Error('messageRequired');
  const subject = renderConsentMessage(body.subject, context.variables);
  if (channel!.channelType === 'email' && (!subject || subject.length > 200 || /[\r\n]/.test(subject))) throw new Error('subjectRequired');
  const type = channel!.channelType;
  const textLimit = type === 'messenger' ? 2000 : type === 'telegram' || type === 'whatsapp_official' ? 4096 : 8000;
  if (content.length > textLimit) throw new Error('messageTooLong');
  const separate = !official && (type === 'messenger' || (['telegram', 'whatsapp', 'whatsapp_unofficial', 'whatsapp_official'].includes(type) && content.length > 1024));
  const filename = `consent-${input.templateKey}-${input.language}.pdf`;
  if (!row) {
    const inserted = await db.insert(dentalConsentDeliveries).values({ id: body.submissionId, companyId, contactId,
      conversationId: conversation.id, createdBy: userId, requestHash, filename, content: pdf,
      providerSigned: !!input.includeProviderSignature,
      parts: separate ? { message: { status: 'pending' }, document: { status: 'pending' } } : { document: { status: 'pending' } },
      copyStatus: body.savePatientCopy ? 'pending' : 'none' }).onConflictDoNothing().returning();
    if (!inserted[0]) {
      const existing = (await getConsentDelivery(companyId, body.submissionId))!;
      if (existing.requestHash !== requestHash || existing.createdBy !== userId || existing.contactId !== contactId) throw new Error('deliveryConflict');
      return consentDeliveryResult(existing);
    }
    row = inserted[0];
  } else {
    const [claimed] = await db.update(dentalConsentDeliveries).set({ status: 'sending', updatedAt: new Date() }).where(and(whereDelivery(companyId, row.id), eq(dentalConsentDeliveries.status, 'failed'))).returning();
    if (!claimed) return consentDeliveryResult((await getConsentDelivery(companyId, row.id))!);
    row = claimed;
  }
  const delivery = row;
  const mediaUrl = providerMediaUrl(baseUrl, companyId, row.id);
  await executeConsentParts(delivery, async part => {
    let result: any;
    if (official) {
      const service = await import('./channels/whatsapp-official');
      try {
        result = await service.sendTemplateMessage(channel!.id, userId, companyId, recipient, official.whatsappTemplateName || official.name,
          official.whatsappTemplateLanguage || 'en', [{ type: 'header', parameters: [{ type: 'document', document: { link: mediaUrl, filename } }] }, ...components!], false, conversation.id);
      } catch (error: any) {
        const status = Number(error.providerStatus);
        if (status >= 400 && status < 500) error.definitelyRejected = true;
        throw error;
      }
    } else {
      const { channelManager } = await import('./channel-manager');
      result = await channelManager.sendDirectMessage(type, recipient, part === 'message' ? 'text' : 'document',
        part === 'message' || !separate ? content : '', part === 'document' ? mediaUrl : undefined,
        subject, companyId, channel!.id, userId, conversation.id, filename);
      if (!result.success) throw new Error('Delivery outcome is unknown');
    }
    const messageId = String(result.messageId || result.id || result.data?.id || '');
    if (!messageId) throw new Error('Delivery outcome is unknown');
    // Replace the provider-only expiring URL with the authenticated Inbox attachment.
    if (part === 'document') {
      const messages = await storage.getMessagesByConversation(conversation.id);
      const saved = messages.find(m => m.externalId === messageId || String(m.id) === messageId || m.id === result.data?.id);
      if (!saved) throw new Error('Sent attachment history could not be confirmed');
      const privateUrl = consentMediaPath(companyId, delivery.id);
      const metadata = { ...(typeof saved.metadata === 'string' ? JSON.parse(saved.metadata || '{}') : saved.metadata || {}),
        filename, mimeType: 'application/pdf', consentDeliveryId: delivery.id,
        ...(official ? { headerDocument: privateUrl, documentFilename: filename, templateComponents: [{ type: 'header', parameters: [{ type: 'document', document: { link: privateUrl, filename } }] }, ...components!] } : {}) };
      const updated = await storage.updateMessage(saved.id, { mediaUrl: privateUrl, content, metadata: JSON.stringify(metadata) });
      (global as any).broadcastToAllClients?.({ type: 'messageUpdated', data: updated }, companyId);
    }
    return messageId;
  }, async patch => { await db.update(dentalConsentDeliveries).set(patch).where(whereDelivery(companyId, delivery.id)); });
  if (delivery.status === 'sent') {
    await storage.updateConversation(conversation.id, { lastMessageAt: new Date() });
    return consentDeliveryResult(await saveConsentPatientCopy(companyId, delivery.id));
  }
  return consentDeliveryResult((await getConsentDelivery(companyId, delivery.id))!);
}
