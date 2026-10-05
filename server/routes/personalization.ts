import { Router, type RequestHandler } from 'express';
import { QUICK_ACTION_SETTING_KEY, QUICK_ACTION_CATALOG, readPersonalization, personalizationSchema, destinationAvailable, shortcutAvailable } from '../../shared/quick-actions';
import { normalizeErpBusinessType } from '../../shared/erp-capabilities';

type SettingsStore = {
  getCompanySetting(companyId: number, key: string): Promise<{ value: unknown } | undefined | null>;
  saveCompanySetting(companyId: number, key: string, value: unknown): Promise<unknown>;
};
export function createPersonalizationRouter(store: SettingsStore, authenticate: RequestHandler, getPermissions: (user: any) => Promise<Record<string, boolean>>) {
  const router = Router();
  router.use(authenticate);
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control','no-store');
    if (!req.user?.companyId) return res.status(403).json({ code: 'company_required' });
    try {
      const [permissions, business] = await Promise.all([getPermissions(req.user),store.getCompanySetting(req.user.companyId,'erpBusinessType')]);
      res.locals.quickAccess = { permissions, superAdmin: req.user.isSuperAdmin === true, businessType: normalizeErpBusinessType(business?.value) };
      next();
    } catch { res.status(503).json({ code: 'personalization_unavailable' }); }
  });
  // Browsers supply their frontend origin even when the API uses a separate port.
  const frontendOrigin = (req: Parameters<RequestHandler>[0]) => {
    try { return new URL(req.get('origin') || req.get('referer') || `${req.protocol}://${req.get('host')}`).origin; }
    catch { return undefined; }
  };
  const read: RequestHandler = async (req,res) => {
    const access = res.locals.quickAccess;
    const canManage = access.superAdmin || access.permissions.manage_settings === true;
    const header = req.path === '/shortcuts';
    if (!header && !canManage && !access.permissions.view_settings) return res.status(403).json({ code: 'forbidden' });
    try {
      const settings = readPersonalization((await store.getCompanySetting(req.user!.companyId!,QUICK_ACTION_SETTING_KEY))?.value);
      res.json({ shortcuts: header ? settings.shortcuts.filter(s => shortcutAvailable(s,access,frontendOrigin(req))) : settings.shortcuts,
        availableIds: QUICK_ACTION_CATALOG.filter(d => destinationAvailable(d,access)).map(d => d.id), businessType: access.businessType, canManage });
    } catch { res.status(503).json({ code: 'personalization_unavailable' }); }
  };
  router.get('/shortcuts',read);
  router.get('/',read);
  router.put('/',async (req,res) => {
    const access = res.locals.quickAccess;
    if (!access.superAdmin && !access.permissions.manage_settings) return res.status(403).json({ code: 'forbidden' });
    const parsed = personalizationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 'invalid_personalization' });
    const origin = frontendOrigin(req);
    if (origin) for (const shortcut of parsed.data.shortcuts) {
      if (shortcut.kind !== 'url') continue;
      const url: URL = new URL(shortcut.url,origin);
      if (url.origin === origin) shortcut.url = url.pathname + url.search + url.hash;
    }
    if (!personalizationSchema.safeParse(parsed.data).success) return res.status(400).json({ code: 'invalid_personalization' });
    try {
      await store.saveCompanySetting(req.user!.companyId!,QUICK_ACTION_SETTING_KEY,parsed.data);
      res.json(parsed.data);
    } catch { res.status(503).json({ code: 'personalization_save_failed' }); }
  });
  return router;
}
