import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { sql, and, eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { storage } from '../../storage';
import { requireAnyPermission, getUserPermissions } from '../../middleware';
import { ensureDentalBusinessType } from './business-type';
import { CONSENT_PDF_MAX_BYTES, CONSENT_MESSAGE_CATEGORY, consentSendSchema } from '../../../shared/dental-consent-send';
import { quickReplyTemplates } from '../../../shared/schema';
import { getConsentSendContext, activeConsentChannel, consentRecipient, isWhatsApp } from '../../services/dental-consent-send-context';
import { sendConsentDelivery, getConsentDelivery, saveConsentPatientCopy, consentDeliveryResult } from '../../services/dental-consent-delivery-service';
import { readConsentPayload } from '../../services/dental-consent-proof';

const router = Router();
const idSchema = z.coerce.number().int().positive();
const proofSchema = z.object({ proof: z.string().min(1).max(16000) });
const allowedErrors = new Set(['validation', 'previewStale', 'patient', 'template', 'providerUnavailable', 'invalidChannel', 'channelUnavailable', 'missingIdentity', 'messageVariables', 'messageRequired', 'messageTooLong', 'subjectRequired', 'officialTemplateRequired', 'messageTemplateUnavailable', 'deliveryConflict', 'deliveryUnavailable']);
const handle = (fn: (req: Request, res: Response, companyId: number) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { const companyId = await ensureDentalBusinessType(req, res); if (companyId) await fn(req, res, companyId); }
  catch (error: any) {
    const code = error instanceof z.ZodError ? 'validation' : allowedErrors.has(error.message) ? error.message : 'request';
    res.status(code === 'request' ? 500 : code === 'deliveryConflict' || code === 'previewStale' ? 409 : 400).json({ success: false, errorCode: `erp.dental.consent.errors.${code}` });
  }
};
const patientAccess = requireAnyPermission(['view_dental_patients', 'manage_dental_patients']);
const messagingAccess = requireAnyPermission(['manage_conversations']);
router.get('/consent-message-templates', patientAccess, messagingAccess, handle(async (_req, res, companyId) => {
  const data = await db.select({ id: quickReplyTemplates.id, name: quickReplyTemplates.name, content: quickReplyTemplates.content, category: quickReplyTemplates.category })
    .from(quickReplyTemplates).where(and(eq(quickReplyTemplates.companyId, companyId), eq(quickReplyTemplates.category, CONSENT_MESSAGE_CATEGORY), eq(quickReplyTemplates.isActive, true)))
    .orderBy(asc(quickReplyTemplates.name));
  res.json({ success: true, data });
}));
router.post('/patients/:contactId/consent-send-context', patientAccess, messagingAccess, handle(async (req, res, companyId) => {
  const { proof } = proofSchema.parse(req.body);
  const data = await getConsentSendContext(companyId, idSchema.parse(req.params.contactId), req.user!.id, proof);
  res.setHeader('Cache-Control', 'private, no-store'); res.json({ success: true, data });
}));
router.post('/patients/:contactId/consent-conversation', patientAccess, messagingAccess, handle(async (req, res, companyId) => {
  const contactId = idSchema.parse(req.params.contactId);
  const { channelId, proof } = proofSchema.extend({ channelId: idSchema }).parse(req.body);
  await getConsentSendContext(companyId, contactId, req.user!.id, proof);
  const channel = await storage.getChannelConnection(channelId), contact = await storage.getContact(contactId);
  if (!activeConsentChannel(channel, companyId) || !isWhatsApp(channel!.channelType)) throw new Error('channelUnavailable');
  if (!contact || contact.companyId !== companyId || !await consentRecipient(channel, contact, false)) throw new Error('missingIdentity');
  const conversation = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('dental-consent-chat'), hashtext(${`${companyId}:${contactId}:${channelId}`}))`);
    const existing = (await storage.getConversationsByContact(contactId)).find(c => c.companyId === companyId && c.channelId === channelId && !c.isGroup);
    return existing || await storage.createConversation({ companyId, contactId, channelId, channelType: channel!.channelType, status: 'open', assignedToUserId: req.user!.id });
  });
  res.json({ success: true, data: { id: conversation.id } });
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CONSENT_PDF_MAX_BYTES, files: 1, fields: 1, fieldSize: 64000 } }).single('document');
router.post('/patients/:contactId/consent-send', patientAccess, messagingAccess, handle(async (req, res, companyId) => {
  await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(new Error('validation')) : resolve()));
  if (!req.file || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('previewStale');
  let payload: unknown;
  try { payload = JSON.parse(req.body.payload); } catch { throw new Error('messageRequired'); }
  const body = consentSendSchema.parse(payload);
  if (body.savePatientCopy && !req.user?.isSuperAdmin && !(await getUserPermissions(req.user as any)).manage_dental_imaging)
    return res.status(403).json({ success: false, errorCode: 'erp.dental.consent.send.copyPermission' });
  // Never build provider URLs from an untrusted Host header.
  const localPort = Number(process.env.PORT || 9000) + (process.env.NODE_ENV === 'development' ? 100 : 0);
  const baseUrl = process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL || (process.env.NODE_ENV !== 'production' ? `http://localhost:${localPort}` : '');
  if (!/^https?:\/\//.test(baseUrl)) throw new Error('request');
  const data = await sendConsentDelivery(companyId, idSchema.parse(req.params.contactId), req.user!.id, body, req.file.buffer, baseUrl);
  res.json({ success: true, data });
}));
router.post('/patients/:contactId/consent-deliveries/:deliveryId/patient-copy', patientAccess, messagingAccess, requireAnyPermission(['manage_dental_imaging']), handle(async (req, res, companyId) => {
  const id = z.string().uuid().parse(req.params.deliveryId);
  const delivery = await getConsentDelivery(companyId, id);
  if (!delivery || delivery.contactId !== idSchema.parse(req.params.contactId) || delivery.createdBy !== req.user!.id) throw new Error('deliveryUnavailable');
  res.json({ success: true, data: consentDeliveryResult(await saveConsentPatientCopy(companyId, id)) });
}));
router.get('/consent-deliveries/:deliveryId/pdf', requireAnyPermission(['view_dental_patients', 'manage_dental_patients', 'manage_conversations']), handle(async (req, res, companyId) => {
  const delivery = await getConsentDelivery(companyId, z.string().uuid().parse(req.params.deliveryId));
  if (!delivery) return res.sendStatus(404);
  return sendPdf(res, delivery);
}));
function sendPdf(res: Response, delivery: { filename: string; content: Buffer }) {
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${delivery.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.send(Buffer.from(delivery.content));
}
/** Provider-only URL: no public permanent document links or authenticated cookies required. */
export async function consentProviderMedia(req: Request, res: Response) {
  try {
    const proof = readConsentPayload(z.string().max(16000).parse(req.query.token));
    const id = z.string().uuid().parse(req.params.deliveryId);
    if (proof.purpose !== 'media' || proof.id !== id || !Number.isInteger(proof.companyId)) return res.sendStatus(404);
    const delivery = await getConsentDelivery(proof.companyId, id);
    if (!delivery) return res.sendStatus(404);
    return sendPdf(res, delivery);
  } catch { return res.sendStatus(404); }
}
export default router;
