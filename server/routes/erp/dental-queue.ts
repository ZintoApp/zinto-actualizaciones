import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage } from '../../storage';
import { requireAnyPermission } from '../../middleware';
import { ensureDentalBusinessType, getCompanyErpBusinessType } from './business-type';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { getDentalBookingPolicy } from '../../services/dental-booking-policy-service';
import { getDentalReminderTimezone } from '../../services/dental-reminder-timezone';
import { DentalQueueService, QueueError, type QueueContext } from '../../services/dental-queue-service';
import { QUEUE_SETTING_KEY, queueSettingsSchema } from '../../../shared/types/dental-queue';

async function context(companyId: number): Promise<QueueContext> {
  const [zone, policy, users, rooms, company, saved, businessType] = await Promise.all([
    getDentalReminderTimezone(companyId), getDentalBookingPolicy(companyId), storage.getUsersByCompany(companyId),
    storage.listDentalChairs(companyId, { activeOnly: true }), storage.getCompany(companyId), storage.getCompanySetting(companyId, QUEUE_SETTING_KEY),
    getCompanyErpBusinessType(companyId),
  ]);
  if (!company || company.active === false || businessType !== 'dental') throw new QueueError('clinic_unavailable', 'This clinic is unavailable.', 404);
  if (zone.status !== 'valid') throw new QueueError('timezone_required', 'Save a valid clinic timezone in General Settings before using Digital Turn.', 422);
  const settings = queueSettingsSchema.parse(saved?.value || {});
  return {
    timezone: zone.timezone, settings, clinicName: company?.name || '', logoUrl: settings.logoUrl || company?.logo || '',
    providers: users.filter(u => u.active !== false && policy.bookableDentistUserIds.includes(u.id)).map(u => {
      const profile = policy.specialistProfiles.find(p => p.userId === u.id);
      return { id: u.id, name: u.fullName, avatarUrl: u.avatarUrl || null, chairIds: profile?.allowedChairIds || [], specialtyIds: profile?.specialtyIds || [] };
    }),
    rooms: rooms.map(r => ({ id: r.id, name: r.name })),
    services: policy.bookableCatalog.filter(s => s.isActive).map(s => ({ id: s.id, label: s.label, durationMinutes: s.durationMinutes, specialtyId: s.specialtyId })),
  };
}
const service = new DentalQueueService({ connect: () => getPool().connect() } as any, context);
const router = Router();
const read = requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']);
const manage = requireAnyPermission(['manage_dental_schedule']);
const turnId = (req: Request) => z.coerce.number().int().positive().parse(req.params.turnId);
const handler = (fn: (req: Request, companyId: number) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await fn(req, companyId) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, code: 'invalid_request', error: 'Validation failed', details: error.flatten() });
    if (error instanceof QueueError) return res.status(error.status).json({ success: false, code: error.code, errorCode: error.code, error: error.message });
    if (req.path.endsWith('/digital-ticket')) console.error('Dental digital ticket request failed');
    else console.error('Dental queue request failed:', error);
    return res.status(500).json({ success: false, code: 'queue_unavailable', error: 'Digital Turn is unavailable. Please retry.' });
  }
};
router.get('/', read, handler((_req, companyId) => service.snapshot(companyId)));
router.get('/options', read, handler((_req, companyId) => service.options(companyId)));
router.get('/display', read, handler(async (req, companyId) => {
  const after = z.coerce.number().int().nonnegative().optional().parse(req.query.after);
  return (await service.snapshot(companyId, after)).display;
}));
router.get('/settings', read, handler(async (_req, companyId) => (await context(companyId)).settings));
router.put('/settings', manage, handler(async (req, companyId) => {
  const settings = queueSettingsSchema.parse(req.body);
  const saved = await storage.saveCompanySetting(companyId, QUEUE_SETTING_KEY, settings);
  return queueSettingsSchema.parse(saved.value);
}));
router.post('/turns', manage, handler((req, companyId) => service.issue(companyId, req.user!.id, req.body)));
router.post('/next', manage, handler((req, companyId) => service.next(companyId, req.user!.id, req.body)));
router.post('/turns/:turnId/actions', manage, handler((req, companyId) => service.action(companyId, req.user!.id, turnId(req), req.body)));
router.patch('/turns/:turnId/status', manage, handler((req, companyId) => service.changeStatus(companyId, req.user!.id, turnId(req), req.body)));
router.get('/turns/:turnId/ticket', read, handler((req, companyId) => service.ticket(companyId, turnId(req))));
router.post('/turns/:turnId/digital-ticket', read, handler(async (req, companyId) => {
  const { token, ...details } = await service.digitalTicket(companyId, turnId(req));
  // Like frontend website links, resolve this path against the browser origin.
  // The API host can be an internal proxy target with a different port.
  return { ...details, url: `/dental/ticket/${token}` };
}));

export const publicDentalTicketRouter = Router();
publicDentalTicketRouter.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
  next();
});
// The app trusts forwarded headers globally. Use the actual peer for the broad
// ceiling and a hashed token for polling limits, so spoofed headers cannot bypass them.
publicDentalTicketRouter.use(rateLimit({ windowMs: 60_000, limit: 10000, keyGenerator: req => req.socket.remoteAddress || 'unknown', standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'rate_limited', error: 'Please retry shortly.' } }));
const ticketPollingLimit = rateLimit({ windowMs: 60_000, limit: 120, keyGenerator: req => createHash('sha256').update(req.params.token).digest('hex'), standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'rate_limited', error: 'Please retry shortly.' } });
publicDentalTicketRouter.get('/:token', ticketPollingLimit, async (req, res) => {
  try {
    res.json({ success: true, data: await service.publicTicket(req.params.token) });
  } catch (error) {
    if (error instanceof QueueError) return res.status(error.status).json({ success: false, code: error.code });
    // Do not log database parameters, URLs, tokens, or ticket responses.
    console.error('Public dental ticket request failed');
    res.status(500).json({ success: false, code: 'queue_unavailable' });
  }
});
export default router;
