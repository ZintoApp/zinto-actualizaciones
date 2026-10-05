import { Router } from 'express';
import { createHash } from 'crypto';
import { campaignTemplates, PERMISSIONS } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { whatsappCallingConfigSchema } from '@shared/types/whatsapp-calling';
import { ensureAuthenticated, requirePermission } from '../middleware';
import { storage } from '../storage';
import {
  WhatsAppCallingError,
  answerWhatsAppCall,
  claimWhatsAppCall,
  declineWhatsAppCall,
  getActiveWhatsAppCalls,
  getCallEvents,
  handleWhatsAppAiGatewayEvent,
  getWhatsAppCallingConfig,
  isWhatsAppCallingGloballyEnabled,
  listCallChannels,
  persistEligibility,
  requestWhatsAppCallPermission,
  startWhatsAppCallingWorkers,
  terminateWhatsAppCall,
  touchWhatsAppCallAgentPresence,
  updateWhatsAppCallingSettings,
} from '../services/whatsapp-calling-service';

function sendError(res: any, error: unknown) {
  if (error instanceof WhatsAppCallingError) {
    return res.status(error.status).json({ error: error.message, code: error.code, errorCode: error.code, details: error.details });
  }
  console.error('[WhatsApp Calling]', error);
  return res.status(500).json({ error: 'WhatsApp Calling request failed', code: 'WHATSAPP_CALLING_INTERNAL_ERROR' });
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function gatewayTokenMatches(header: string | undefined, expected: string): boolean {
  const supplied = header?.replace(/^Bearer\s+/i, '') || '';
  return createHash('sha256').update(supplied).digest('hex') === createHash('sha256').update(expected).digest('hex');
}

function getBrowserIceServers() {
  try {
    const value = JSON.parse(process.env.WHATSAPP_CALL_ICE_SERVERS || '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: any) => {
      const urls = typeof entry?.urls === 'string'
        ? entry.urls
        : Array.isArray(entry?.urls) && entry.urls.every((url: unknown) => typeof url === 'string')
          ? entry.urls
          : undefined;
      if (!urls) return [];
      return [{
        urls,
        ...(typeof entry.username === 'string' ? { username: entry.username } : {}),
        ...(typeof entry.credential === 'string' ? { credential: entry.credential } : {}),
      }];
    });
  } catch {
    return [];
  }
}

export function createWhatsAppCallingRouter() {
  const router = Router();
  void startWhatsAppCallingWorkers().catch((error) => console.error('[WhatsApp Calling] failed to start workers:', error));

  router.post('/whatsapp-calling/media-gateway/events', async (req, res) => {
    try {
      const token = process.env.WHATSAPP_MEDIA_GATEWAY_TOKEN;
      if (!token) return res.status(503).json({ error: 'WhatsApp AI media gateway is not configured' });
      if (!gatewayTokenMatches(req.header('authorization'), token)) return res.status(401).json({ error: 'Invalid media gateway credentials' });
      const providerConversationId = typeof req.body?.providerConversationId === 'string' ? req.body.providerConversationId.trim() : '';
      const status = req.body?.status === 'completed' ? 'completed' : req.body?.status === 'failed' ? 'failed' : undefined;
      if (!providerConversationId || !status) return res.status(400).json({ error: 'Provider conversation ID and terminal status are required' });
      res.json({ success: true, ...(await handleWhatsAppAiGatewayEvent({
        providerConversationId,
        status,
        failureCode: typeof req.body?.failureCode === 'string' ? req.body.failureCode : undefined,
      })) });
    } catch (error) { sendError(res, error); }
  });

  router.get('/call-channels', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) return res.status(400).json({ error: 'Company context required' });
      let contactId = positiveInteger(req.query.contactId);
      const conversationId = positiveInteger(req.query.conversationId);
      if (!contactId && conversationId) {
        const conversation = await storage.getConversation(conversationId);
        if (!conversation || conversation.companyId !== companyId) return res.status(404).json({ error: 'Conversation not found' });
        contactId = conversation.contactId || undefined;
      }
      if (contactId) {
        const contact = await storage.getContact(contactId);
        if (!contact || contact.companyId !== companyId) return res.status(404).json({ error: 'Contact not found' });
      }
      res.json({ channels: await listCallChannels(companyId, contactId) });
    } catch (error) { sendError(res, error); }
  });

  router.get('/calls/active', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      if (!companyId || !userId) return res.status(400).json({ error: 'Company context required' });
      await touchWhatsAppCallAgentPresence(companyId, userId);
      res.json({ calls: await getActiveWhatsAppCalls(companyId, userId) });
    } catch (error) { sendError(res, error); }
  });

  router.get('/calls/events', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) return res.status(400).json({ error: 'Company context required' });
      res.json({ events: await getCallEvents(companyId, Math.max(0, Number(req.query.after) || 0)) });
    } catch (error) { sendError(res, error); }
  });

  router.get('/whatsapp-calling/webrtc-config', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), (_req, res) => {
    res.json({ iceServers: getBrowserIceServers() });
  });

  router.post('/calls/:callId/claim', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const callId = positiveInteger(req.params.callId);
      if (!callId || !req.user?.companyId || !req.user?.id) return res.status(400).json({ error: 'Invalid call' });
      res.json({ session: await claimWhatsAppCall(callId, req.user.companyId, req.user.id) });
    } catch (error) { sendError(res, error); }
  });

  router.post('/calls/:callId/answer', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const callId = positiveInteger(req.params.callId);
      const sdpAnswer = typeof req.body?.sdpAnswer === 'string' ? req.body.sdpAnswer : '';
      if (!callId || !req.user?.companyId || !req.user?.id || !sdpAnswer) return res.status(400).json({ error: 'Call and SDP answer are required' });
      await answerWhatsAppCall(callId, req.user.companyId, req.user.id, sdpAnswer, {
        recording: req.body?.recording,
        transcription: req.body?.transcription,
      });
      res.json({ success: true });
    } catch (error) { sendError(res, error); }
  });

  for (const action of ['reject', 'hangup'] as const) {
    router.post(`/calls/:callId/${action}`, ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
      try {
        const callId = positiveInteger(req.params.callId);
        if (!callId || !req.user?.companyId || !req.user?.id) return res.status(400).json({ error: 'Invalid call' });
        if (action === 'reject') await declineWhatsAppCall(callId, req.user.companyId, req.user.id);
        else await terminateWhatsAppCall(callId, req.user.companyId, req.user.id, 'completed');
        res.json({ success: true });
      } catch (error) { sendError(res, error); }
    });
  }

  router.get('/channel-connections/:channelId/whatsapp-calling', ensureAuthenticated, requirePermission(PERMISSIONS.VIEW_CHANNELS), async (req, res) => {
    try {
      const connection = await storage.getChannelConnection(Number(req.params.channelId));
      if (!connection || connection.companyId !== req.user?.companyId || connection.channelType !== 'whatsapp_official') return res.status(404).json({ error: 'WhatsApp channel not found' });
      res.json({
        config: getWhatsAppCallingConfig(connection),
        globallyEnabled: isWhatsAppCallingGloballyEnabled(),
      });
    } catch (error) { sendError(res, error); }
  });

  router.patch('/channel-connections/:channelId/whatsapp-calling', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CHANNELS), async (req, res) => {
    try {
      const connection = await storage.getChannelConnection(Number(req.params.channelId));
      if (!connection || connection.companyId !== req.user?.companyId || connection.channelType !== 'whatsapp_official') return res.status(404).json({ error: 'WhatsApp channel not found' });
      const parsed = whatsappCallingConfigSchema.removeDefault().partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid WhatsApp Calling configuration', details: parsed.error.flatten() });
      res.json({ config: await updateWhatsAppCallingSettings(connection, parsed.data) });
    } catch (error) { sendError(res, error); }
  });

  router.post('/channel-connections/:channelId/whatsapp-calling/refresh', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CHANNELS), async (req, res) => {
    try {
      const connection = await storage.getChannelConnection(Number(req.params.channelId));
      if (!connection || connection.companyId !== req.user?.companyId || connection.channelType !== 'whatsapp_official') return res.status(404).json({ error: 'WhatsApp channel not found' });
      res.json({ config: await persistEligibility(connection) });
    } catch (error) { sendError(res, error); }
  });

  router.post('/whatsapp-calling/permissions/request', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      const channelId = positiveInteger(req.body?.channelId);
      const contactId = positiveInteger(req.body?.contactId);
      const mode = req.body?.mode === 'template' ? 'template' : 'freeform';
      if (!companyId || !channelId || !contactId) return res.status(400).json({ error: 'Channel and contact are required' });
      if (mode === 'template' && !req.body?.templateName) return res.status(400).json({ error: 'An approved template is required' });
      const [channel, contact] = await Promise.all([storage.getChannelConnection(channelId), storage.getContact(contactId)]);
      if (!channel || channel.companyId !== companyId || channel.channelType !== 'whatsapp_official' || !contact || contact.companyId !== companyId) return res.status(404).json({ error: 'Channel or contact not found' });
      await requestWhatsAppCallPermission({ companyId, channel, contact, mode, templateName: req.body?.templateName, languageCode: req.body?.languageCode, message: req.body?.message });
      res.json({ success: true, status: 'pending' });
    } catch (error) { sendError(res, error); }
  });

  router.get('/whatsapp-calling/templates', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      const channelId = positiveInteger(req.query.channelId);
      if (!companyId || !channelId) return res.status(400).json({ error: 'Channel is required' });
      const templates = await db.select({
        id: campaignTemplates.id,
        name: campaignTemplates.name,
        remoteName: campaignTemplates.whatsappTemplateName,
        language: campaignTemplates.whatsappTemplateLanguage,
        components: campaignTemplates.whatsappTemplateComponents,
      }).from(campaignTemplates).where(and(
        eq(campaignTemplates.companyId, companyId), eq(campaignTemplates.connectionId, channelId),
        eq(campaignTemplates.whatsappTemplateStatus, 'approved'),
      ));
      res.json(templates.filter((template) => Array.isArray(template.components) && template.components.some((component: any) => String(component?.type || '').toLowerCase() === 'call_permission_request')).map(({ components: _components, ...template }) => template));
    } catch (error) { sendError(res, error); }
  });

  return router;
}
