import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../db';
import { storage } from '../storage';
import { decryptValue } from '../utils/crypto';
import { appSumoEventSchema, isCanonicalAppSumoRequest, requireAppSumoBrowser, verifyAppSumoSignature } from '../services/appsumo-protocol';
import { activationHash, appSumoConfig, appSumoRepository, beginAppSumoOAuth, linkAppSumoCompany, retryAppSumoEvent, saveAppSumoConfig } from '../services/appsumo-service';
import { appSumoCompanyPolicy } from '../services/appsumo-policy';

export function appSumoCookieHash(req: Request) {
  const token = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-appsumo='))?.slice('__Host-appsumo='.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? activationHash(token) : null;
}
export function appSumoDomainGuard(req: Request,res:Response,next:NextFunction) {
  if(!isCanonicalAppSumoRequest(req)) return res.status(404).json({error:'Not found'});
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  next();
}
export async function appSumoAccessMiddleware(req: Request,res:Response,next:NextFunction) {
  try {
    const user=req.user as any;
    if(!user?.companyId || user.isSuperAdmin) return next();
    const allow = ['/login','/logout','/user','/company/access-status','/company/register','/company/verify-email'];
    // Recovery screens use the same public translation reads as the rest of the app.
    if (req.method === 'GET' && (req.path === '/languages' || /^\/translations\/language\/[a-zA-Z0-9_-]+$/.test(req.path))) return next();
    if(allow.includes(req.path) || req.path.startsWith('/appsumo/')) return next();
    const policy = await appSumoCompanyPolicy(user.companyId);
    if(policy.suspended) return res.status(403).json({error:'APPSUMO_SUSPENDED',message:'Your AppSumo license is inactive. Reactivate through AppSumo to restore access.'});
    // Billing status remains readable; tier changes belong to AppSumo.
    if(policy.managed && !['GET','HEAD'].includes(req.method) && /^\/(payment\/checkout|enhanced-subscription|plan-renewal|subscription|trial)(\/|$)/.test(req.path)) {
      return res.status(409).json({error:'APPSUMO_MANAGED',message:'Manage your lifetime plan through AppSumo.'});
    }
    next();
  } catch { res.status(503).json({error:'Unable to verify company access'}); }
}

const router=Router();
router.use(appSumoDomainGuard);
// Presentation codes preserve the existing error field for API consumers.
export function appSumoErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return 'INVALID_CONFIGURATION';
  const message = error instanceof Error ? error.message : '';
  if (/expired|Start activation from/i.test(message)) return 'ACTIVATION_EXPIRED';
  if (/not active/i.test(message)) return 'LICENSE_INACTIVE';
  if (/another company|already.*license|already linked|ownership conflicts/i.test(message)) return 'COMPANY_CONFLICT';
  if (/awaiting approval|suspended/i.test(message)) return 'ACCOUNT_RESTRICTED';
  if (/API key is required|paid plan for tier|different plan/i.test(message)) return 'INVALID_CONFIGURATION';
  if (/Stripe|stop.*billing|expire checkout/i.test(message)) return 'BILLING_CANCELLATION_FAILED';
  if (/rate limit/i.test(message)) return 'RATE_LIMITED';
  if (/only at https|Invalid origin/i.test(message)) return 'INVALID_ORIGIN';
  if (/Confirm/i.test(message)) return 'CONFIRMATION_REQUIRED';
  return 'REQUEST_FAILED';
}
const run = (fn:(req:Request,res:Response)=>Promise<any>) => (req:Request,res:Response) => {
  void fn(req,res).catch(error=>res.status(error instanceof z.ZodError?400:409).json({error:error instanceof Error?error.message:'AppSumo request failed', ...(req.path === '/webhook' ? {} : {code:appSumoErrorCode(error)})}));
};
router.post('/webhook',run(async(req,res)=>{
  const config=await appSumoConfig();
  if(!config?.enabled || !config.api_key_encrypted) return res.status(503).json({error:'AppSumo is not configured'});
  if(!Buffer.isBuffer(req.body) || !verifyAppSumoSignature(req.body,String(req.headers['x-appsumo-timestamp']||''),String(req.headers['x-appsumo-signature']||''),decryptValue(config.api_key_encrypted))) {
    return res.status(401).json({error:'Invalid webhook signature'});
  }
  let payload: unknown;
  try { payload=JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({error:'Invalid JSON'}); }
  const e=appSumoEventSchema.parse(payload);
  if(e.test) return res.json({success:true,event:e.event});
  const receipt=await appSumoRepository.receive(e);
  try { await appSumoRepository.process(receipt.id); }
  catch { return res.status(503).json({success:false,event:e.event,error:'License event saved for retry'}); }
  res.json({success:true,event:e.event});
}));
router.get('/oauth/callback',run(async(req,res)=>{
  if(!req.query.code) return res.status(200).send('Talkzen AppSumo OAuth callback');
  if(typeof req.query.code!=='string' || req.query.code.length>2048) return res.status(400).send('Invalid authorization code');
  try {
    const token=await beginAppSumoOAuth(req.query.code);
    res.cookie('__Host-appsumo',token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:30*60_000});
    res.redirect(303,'/appsumo/activate');
  } catch {
    res.clearCookie('__Host-appsumo',{secure:true,httpOnly:true,sameSite:'lax',path:'/'});
    res.redirect(303,'/appsumo/activate?error=activation');
  }
}));
router.get('/activation',run(async(req,res)=>{
  const hash=appSumoCookieHash(req);
  if(!hash) return res.status(400).json({error:'Start activation from your AppSumo purchases page.',code:'ACTIVATION_EXPIRED'});
  const a=await appSumoRepository.activation(hash);
  const {rows:[plan]}=await getPool().query('SELECT p.name FROM appsumo_tiers t JOIN plans p ON p.id=t.plan_id WHERE t.tier=$1',[a.tier]);
  const user=req.user as any;
  const currentCompany=user?.companyId ? await storage.getCompany(user.companyId) : null;
  res.json({tier:a.tier,plan:plan?.name,currentCompanyName:currentCompany?.name,linked:Boolean(a.company_id),canContinue:Boolean(a.company_id && a.user_id),expiresAt:a.expires_at});
}));
router.post('/link',run(async(req,res)=>{
  requireAppSumoBrowser(req);
  const user=req.user as any;
  if(!user?.companyId || user.role!=='admin' || user.isSuperAdmin || user.active===false) return res.status(403).json({error:'Sign in as the company admin to link this license.',code:'ADMIN_REQUIRED'});
  if(req.body.confirm!==true) return res.status(400).json({error:'Confirm the billing change first.',code:'CONFIRMATION_REQUIRED'});
  const hash=appSumoCookieHash(req);
  if(!hash) throw new Error('Activation expired');
  await linkAppSumoCompany(hash,user.companyId,user.id);
  res.json({success:true});
}));
router.post('/continue',run(async(req,res)=>{
  requireAppSumoBrowser(req);
  if(req.body.confirm!==true) throw new Error('Confirm sign-in first');
  const hash=appSumoCookieHash(req);
  if(!hash) throw new Error('Activation expired');
  const a=await appSumoRepository.activation(hash);
  if(!a.user_id || !a.company_id) throw new Error('Sign up or sign in to link this license');
  const user=await storage.getUser(a.user_id);
  const company=await storage.getCompany(a.company_id);
  if(!user || !user.active || user.isSuperAdmin || user.companyId!==a.company_id || !company?.active || company.appsumoSuspended) throw new Error('Account is awaiting approval or is suspended. Contact support.');
  const consumed=await getPool().query('UPDATE appsumo_activations SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING token_hash',[hash]);
  if(!consumed.rows.length) throw new Error('Activation expired. Activate again from AppSumo.');
  await new Promise<void>((resolve,reject)=>req.login(user,error=>error?reject(error):resolve()));
  res.json({success:true});
}));
router.get('/status',run(async(req,res)=>{
  const user=req.user as any;
  if(!user?.companyId) return res.status(401).json({error:'Sign in first',code:'ADMIN_REQUIRED'});
  const {rows:[license]}=await getPool().query(`SELECT l.tier,l.status,l.management_url,p.name AS plan FROM appsumo_licenses l
    JOIN appsumo_tiers t ON t.tier=l.tier JOIN plans p ON p.id=t.plan_id WHERE l.company_id=$1 AND l.replacement_key IS NULL`,[user.companyId]);
  res.json(license??null);
}));
router.use('/admin',(req,res,next)=>{
  if(!(req.user as any)?.isSuperAdmin) return res.status(403).json({error:'Administrator access required',code:'ADMIN_REQUIRED'});
  if(!['GET','HEAD'].includes(req.method)) {try {requireAppSumoBrowser(req);} catch {return res.status(403).json({error:'Invalid origin',code:'INVALID_ORIGIN'});} }
  next();
});
router.get('/admin/config',run(async(_req,res)=>{
  const c=await appSumoConfig();
  const {rows:tiers}=await getPool().query('SELECT * FROM appsumo_tiers ORDER BY tier');
  const {rows:plans}=await getPool().query('SELECT id,name FROM plans WHERE is_active=true AND is_free=false ORDER BY id');
  res.json({enabled:c.enabled,clientId:c.client_id??'',hasApiKey:Boolean(c.api_key_encrypted),hasClientSecret:Boolean(c.client_secret_encrypted),tiers,plans});
}));
router.put('/admin/config',run(async(req,res)=>{
  const input=z.object({enabled:z.boolean(),apiKey:z.string().max(2048).optional(),clientId:z.string().max(2048).optional(),clientSecret:z.string().max(2048).optional(),tiers:z.object({'1':z.number().int().positive(),'2':z.number().int().positive(),'3':z.number().int().positive()})}).parse(req.body);
  await saveAppSumoConfig(input);res.json({success:true});
}));
router.get('/admin/licenses',run(async(req,res)=>{
  const search=String(req.query.search||'').slice(0,200);
  const {rows:licenses}=await getPool().query(`SELECT l.*,c.name AS company_name FROM appsumo_licenses l LEFT JOIN companies c ON c.id=l.company_id
    WHERE l.license_key::text ILIKE $1 OR c.name ILIKE $1 ORDER BY l.updated_at DESC LIMIT 100`,[`%${search}%`]);
  const {rows:events}=await getPool().query(`SELECT id,license_key,event,status,error,attempts,received_at FROM appsumo_events
    WHERE status<>'processed' ORDER BY received_at DESC LIMIT 100`);
  const {rows:billing}=await getPool().query('SELECT target_company_id,billing_error,created_at FROM appsumo_activations WHERE billing_error IS NOT NULL ORDER BY created_at DESC LIMIT 100');
  res.json({licenses,events,billing});
}));
router.post('/admin/events/:id/retry',run(async(req,res)=>{
  const id=z.coerce.number().int().positive().parse(req.params.id); await retryAppSumoEvent(id);res.json({success:true});
}));
export default router;
