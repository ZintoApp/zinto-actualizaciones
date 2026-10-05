import { Router } from 'express';
import { PERMISSIONS } from '../../shared/schema';
import { ensureActiveSubscription, ensureAuthenticated, getUserPermissions, requirePermission } from '../middleware';
import { storage } from '../storage';
import {
  ActiveWhatsAppContactSyncError,
  createWhatsAppContactSyncRun,
  getWhatsAppContactSyncRun,
  processWhatsAppContactSyncJobs,
  resolveWhatsAppContactSyncConnection,
} from '../services/whatsapp-contact-sync-worker';
import { syncContactFromWhatsApp } from '../services/whatsapp-contact-sync-service';
import { WhatsAppContactSyncTransientError } from '../services/whatsapp-contact-sync-service';

const router = Router();
const manageContacts = [ensureAuthenticated, ensureActiveSubscription, requirePermission(PERMISSIONS.MANAGE_CONTACTS)];

router.post('/whatsapp-sync-runs', ...manageContacts, async (req: any, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ code: 'COMPANY_REQUIRED' });
    const run = await createWhatsAppContactSyncRun(req.user.companyId, req.user.id);
    void processWhatsAppContactSyncJobs();
    return res.status(202).json(run);
  } catch (error) {
    if (error instanceof ActiveWhatsAppContactSyncError) {
      const run = await getWhatsAppContactSyncRun(req.user.companyId);
      return res.status(409).json({ code: 'SYNC_ALREADY_RUNNING', run });
    }
    console.error('Failed to create WhatsApp contact sync run:', error);
    return res.status(500).json({ code: 'SYNC_START_FAILED' });
  }
});

router.get('/whatsapp-sync-runs/latest', ...manageContacts, async (req: any, res) => {
  if (!req.user?.companyId) return res.status(403).json({ code: 'COMPANY_REQUIRED' });
  return res.json(await getWhatsAppContactSyncRun(req.user.companyId));
});

router.get('/whatsapp-sync-runs/:runId', ...manageContacts, async (req: any, res) => {
  if (!req.user?.companyId) return res.status(403).json({ code: 'COMPANY_REQUIRED' });
  const runId = Number(req.params.runId);
  if (!Number.isInteger(runId) || runId <= 0) return res.status(400).json({ code: 'INVALID_RUN_ID' });
  const run = await getWhatsAppContactSyncRun(req.user.companyId, runId);
  return run ? res.json(run) : res.status(404).json({ code: 'SYNC_RUN_NOT_FOUND' });
});

router.post('/:id/sync-whatsapp', ...manageContacts, async (req: any, res) => {
  const contactId = Number(req.params.id);
  const companyId = req.user?.companyId;
  if (!companyId || !Number.isInteger(contactId) || contactId <= 0) {
    return res.status(400).json({ code: 'INVALID_CONTACT' });
  }
  try {
    const contact = await storage.getContact(contactId);
    if (!contact || contact.companyId !== companyId) return res.status(404).json({ code: 'CONTACT_NOT_FOUND' });
    const requestedConnectionId = req.body?.connectionId == null ? null : Number(req.body.connectionId);
    const connectionId = Number.isInteger(requestedConnectionId) && Number(requestedConnectionId) > 0
      ? Number(requestedConnectionId)
      : await resolveWhatsAppContactSyncConnection(companyId, contactId);
    if (!connectionId) return res.status(422).json({ code: 'NO_ELIGIBLE_CONNECTION' });
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection || connection.companyId !== companyId) return res.status(404).json({ code: 'CONNECTION_NOT_FOUND' });
    const result = await syncContactFromWhatsApp(contact, connection);

    const permissions = await getUserPermissions(req.user);
    const canViewPhone = req.user.isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
    const safeContact = canViewPhone ? result.contact : { ...result.contact, phone: null, identifier: null };
    if ((global as any).broadcastToAllClients) {
      (global as any).broadcastToAllClients({ type: 'contactUpdated', data: safeContact });
    }
    return res.json({ ...result, contact: safeContact });
  } catch (error) {
    console.error('Failed to synchronize WhatsApp contact:', error);
    return res.status(error instanceof WhatsAppContactSyncTransientError ? 503 : 500).json({
      code: error instanceof WhatsAppContactSyncTransientError
        ? 'WHATSAPP_CONNECTION_UNAVAILABLE'
        : 'SYNC_CONTACT_FAILED',
    });
  }
});

export default router;
