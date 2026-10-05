import { mimeExtensions, signatureMatches } from '../services/guided-tour-media';
import { createTourPackageService, TourPackageError } from '../services/guided-tour-package';
import { TOUR_PACKAGE_LIMITS, tourExportSchema, tourImportSchema } from '../../shared/guided-tour-package';
import { tourConfigurationErrors } from '../services/guided-tour-validation';
import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db';
import { storage } from '../storage';
import { ensureSuperAdmin, getUserPermissions } from '../middleware';
import { getCompanyErpBusinessType } from './erp/business-type';
import { planLimitsService } from '../services/plan-limits-service';
import { createGuidedTourStore, TourConflict, TourNotFound } from '../services/guided-tour-store';
import { TOUR_FEATURES, TOUR_SIGNALS, canReadTour } from '../../shared/guided-tour-registry';
import { TOUR_MEDIA_LIMIT, tourWriteSchema, tourDefinitionSchema, tourVersionSchema, tourResumeSchema, tourPublicationErrors, type GuidedTour, type TourDefinition } from '../../shared/guided-tours';
import { INITIAL_GUIDED_TOURS } from '../../shared/guided-tour-catalog';
import { TOUR_TARGETS } from '../../shared/guided-tour-targets';
import { resolveOriginalAdmin } from './impersonation';

const root = path.resolve(process.cwd(), 'private', 'guided-tours');
const store = () => createGuidedTourStore(getPool());
const packages = createTourPackageService(root, store);
let seeding: Promise<void> | undefined;
function seed() {
  return seeding ||= (async () => { for (const definition of INITIAL_GUIDED_TOURS) await store().create(definition,null,true); })().catch(error => { seeding = undefined; throw error; });
}
const handled = (handler: RequestHandler): RequestHandler => (req,res,next) => {
  Promise.resolve(handler(req,res,next)).catch(error => {
    if (error instanceof TourPackageError) return res.status(400).json({ code: `guided_tours.${error.code}` });
    if (error instanceof TourConflict || error?.code === '23505') return res.status(409).json({ code: 'guided_tours.conflict' });
    if (error instanceof TourNotFound) return res.status(404).json({ code: 'guided_tours.not_found' });
    console.error('Guided tours:', error);
    res.status(503).json({ code: 'guided_tours.unavailable' });
  });
};
async function originalAdmin(req: Request) {
  return resolveOriginalAdmin(req, id => storage.getUser(id));
}
const verifyAdmin: RequestHandler = handled(async (req,res,next) => {
  const admin = await originalAdmin(req);
  if (!admin) return res.status(403).json({ code: 'guided_tours.forbidden' });
  res.locals.tourAdmin = admin; next();
});
async function available(req: Request, tours: GuidedTour[]) {
  const companyId = req.user?.companyId;
  if (!companyId) return [];
  const [permissions,businessType,subscription,channels,records,flowLimit] = await Promise.all([
    getUserPermissions(req.user!),getCompanyErpBusinessType(companyId),
    planLimitsService.checkSubscriptionExpiration(companyId),storage.getChannelConnectionsByCompany(companyId),
    getPool().query(`SELECT
      EXISTS(SELECT 1 FROM dental_patient_profiles WHERE company_id=$1) AS patient,
      EXISTS(SELECT 1 FROM products WHERE company_id=$1) AS product,
      EXISTS(SELECT 1 FROM conversations WHERE company_id=$1) AS conversation`,[companyId]),
    planLimitsService.checkPlanLimit(companyId,'flows'),
  ]);
  return tours.filter(tour => canReadTour(tour.definition,permissions,businessType,req.user?.isSuperAdmin === true)).map(tour => ({ ...tour,
    unavailable: [
      ...(subscription.isExpired && !subscription.isInGracePeriod ? ['subscription'] : []),
      ...(tour.definition.prerequisites.includes('channel') && !channels.some(channel => channel.status === 'active' || channel.status === 'connected') ? ['channel'] : []),
      ...tour.definition.prerequisites.filter(key=>key!=='channel' && !records.rows[0]?.[key]),
      ...(tour.definition.steps.some(step=>step.completion.type==='signal' && step.completion.name==='flow-saved' && step.completion.capture) && !flowLimit.allowed ? ['limit_flows'] : []),
    ],
  }));
}
async function validDefinition(definition: TourDefinition, tourId?: number) {
  if (tourConfigurationErrors(definition).some(error => ['unknown_feature', 'unsupported_route', 'invalid_selector', 'invalid_media'].includes(error))) return false;
  for (const media of [...definition.media,...definition.steps.flatMap(step => step.media)]) {
    if (media.url.startsWith('/api/guided-tours/media/')) {
      const asset = await store().media(media.url.split('/').pop()!);
      if (!asset || asset.tour_id !== tourId || asset.id !== media.id) return false;
    }
  }
  return true;
}
export const guidedToursRouter = Router();
guidedToursRouter.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
guidedToursRouter.get('/authoring', handled(async (req,res) => { res.json({ allowed: !!await originalAdmin(req) }); }));
guidedToursRouter.get('/', handled(async (req,res) => { await seed(); res.json(await available(req,await store().list())); }));
guidedToursRouter.get('/registry', (_req,res) => res.json({ features: TOUR_FEATURES, signals: TOUR_SIGNALS, targets: TOUR_TARGETS }));
guidedToursRouter.post('/:id/revisions/:revision/resume',handled(async(req,res)=>{
  const progress=tourResumeSchema.safeParse(req.body);
  const tour=await store().revision(Number(req.params.id),Number(req.params.revision));
  if(!tour || tour.status!=='published' || !tour.publishedAt)return res.sendStatus(404);
  if(!progress.success || progress.data.index>=tour.definition.steps.length)return res.sendStatus(400);
  const captures=new Map(tour.definition.steps.slice(0,progress.data.index).flatMap(step=>step.completion.type==='signal' && step.completion.capture?[[step.completion.capture,step.completion.name] as const]:[]));
  const tables:Record<string,string>={'flow-saved':'flows','contact-created':'contacts','patient-created':'contacts','conversation-selected':'conversations','product-created':'products'};
  for(const[key,id]of Object.entries(progress.data.bindings)){
    const signal=captures.get(key);if(!signal)return res.sendStatus(400);
    const table=tables[signal];
    if(table && (!/^\d+$/.test(id) || !(await getPool().query(`SELECT 1 FROM ${table} WHERE id=$1 AND company_id=$2`,[id,req.user?.companyId])).rows.length))return res.sendStatus(409);
  }
  const eligible=await available(req,[tour]);if(!eligible.length)return res.sendStatus(403);
  const result=eligible[0];
  if([...captures].some(([key,signal])=>signal==='flow-saved' && progress.data.bindings[key]))result.unavailable=result.unavailable?.filter(reason=>reason!=='limit_flows');
  res.json(result);
}));
guidedToursRouter.get('/:id/revisions/:revision', handled(async (req,res) => {
  const tour = await store().revision(Number(req.params.id),Number(req.params.revision));
  // Draft definitions require verified super-admin access. Retained published revisions may be resumed.
  if (!tour || (tour.status !== 'published' || !tour.publishedAt) && !await originalAdmin(req)) return res.status(404).json({ code:'guided_tours.not_found' });
  const allowed = await available(req,[tour]);
  if (!allowed.length) return res.status(403).json({ code:'guided_tours.forbidden' });
  res.json(allowed[0]);
}));
guidedToursRouter.get('/media/:id', handled(async (req,res) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return res.sendStatus(404);
  const media = await store().media(req.params.id);
  if (!media) return res.sendStatus(404);
  if (!await originalAdmin(req)) {
    const tours = await available(req,await store().publishedMediaReferences(media.id));
    if (!tours.length) return res.sendStatus(404);
  }
  res.setHeader('X-Content-Type-Options','nosniff');
  res.type(media.mime_type);
  res.sendFile(media.filename, { root }, error => { if (error && !res.headersSent) res.sendStatus(404); });
}));

export const adminGuidedToursRouter = Router();
adminGuidedToursRouter.use(ensureSuperAdmin,verifyAdmin);
adminGuidedToursRouter.post('/export', handled(async (req,res) => {
  const parsed = tourExportSchema.safeParse(req.body);
  if (!parsed.success) throw new TourPackageError();
  const archive = await packages.export(parsed.data.tours);
  res.setHeader('Cache-Control', 'private, no-store');
  res.download(archive.filename, 'guided-tours.zip', error => {
    void archive.dispose().catch(() => {});
    if (error && !res.headersSent) res.status(503).json({ code: 'guided_tours.unavailable' });
  });
}));
const uploadDirectories = new WeakMap<Request, string>();
const packageUpload = multer({ storage: multer.diskStorage({
  destination: (req,_file,callback) => { void packages.temporary().then(directory => { uploadDirectories.set(req,directory); callback(null,directory); }).catch(error => callback(error,'')); },
  filename: (_req,_file,callback) => callback(null,'upload.zip'),
}), limits: { fileSize: TOUR_PACKAGE_LIMITS.zip, files: 1, fields: 0, parts: 2 } });
adminGuidedToursRouter.post('/import/preview', (req,res,next) => {
  packageUpload.single('file')(req,res,error => {
    if (error) {
      const directory = uploadDirectories.get(req); uploadDirectories.delete(req);
      if (directory) void fs.rm(directory, { recursive: true, force: true }).catch(() => {});
      res.status(400).json({ code: error.code === 'LIMIT_FILE_SIZE' ? 'guided_tours.package_limit' : 'guided_tours.package_invalid' });
    } else next();
  });
}, handled(async (req,res) => {
  if (!req.file) throw new TourPackageError();
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await packages.preview(req.file.path,res.locals.tourAdmin.id));
  } finally { uploadDirectories.delete(req); await fs.rm(path.dirname(req.file.path), { recursive: true, force: true }); }
}));
adminGuidedToursRouter.post('/import/commit', handled(async (req,res) => {
  const parsed = tourImportSchema.safeParse(req.body);
  if (!parsed.success) throw new TourPackageError();
  res.status(201).json(await packages.commit(parsed.data,res.locals.tourAdmin.id));
}));
adminGuidedToursRouter.delete('/import/:token', handled(async (req,res) => {
  await packages.cancel(req.params.token,res.locals.tourAdmin.id);
  res.json({ success: true });
}));
adminGuidedToursRouter.get('/',handled(async (req,res) => {
  await seed();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(req.query.summary === 'true' ? await store().summaries() : await store().list(true));
}));
adminGuidedToursRouter.get('/:id',handled(async (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.sendStatus(400);
  const tour = await store().draft(id);
  if (!tour) throw new TourNotFound();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(tour);
}));
adminGuidedToursRouter.post('/',handled(async (req,res) => {
  const parsed = tourDefinitionSchema.safeParse(req.body);
  if (!parsed.success || !await validDefinition(parsed.data)) return res.status(400).json({ code:'guided_tours.invalid' });
  res.status(201).json(await store().create(parsed.data,res.locals.tourAdmin.id));
}));
adminGuidedToursRouter.put('/:id',handled(async (req,res) => {
  const parsed = tourWriteSchema.safeParse(req.body);
  if (!parsed.success || !await validDefinition(parsed.data.definition,Number(req.params.id))) return res.status(400).json({ code:'guided_tours.invalid' });
  res.json(await store().update(Number(req.params.id),parsed.data.version,parsed.data.definition));
}));
adminGuidedToursRouter.post('/:id/duplicate',handled(async(req,res)=>{
  const version=tourVersionSchema.safeParse(req.body);
  if(!version.success)return res.sendStatus(400);
  const source=(await store().list(true)).find(item=>item.id===Number(req.params.id));
  if(!source)throw new TourNotFound();
  if(source.version!==version.data.version)throw new TourConflict();
  const definition=structuredClone(source.definition);
  definition.slug=`${definition.slug.slice(0,65)}-${randomUUID().slice(0,8)}`;
  const empty={...definition,media:[],steps:definition.steps.map(step=>({...step,media:[]}))};
  const draft=(await store().create(empty,res.locals.tourAdmin.id))!;
  const copied=new Map<string,{id:string;url:string}>(),filenames:string[]=[];
  try{
    for(const item of [...definition.media,...definition.steps.flatMap(step=>step.media)]){
      if(!item.url.startsWith('/api/guided-tours/media/'))continue;
      if(!copied.has(item.id)){
        const original=await store().media(item.id);if(!original)throw new TourNotFound();
        const id=randomUUID(),filename=id+path.extname(original.filename);
        await fs.mkdir(root,{recursive:true});
        await fs.copyFile(path.join(root,path.basename(original.filename)),path.join(root,filename));filenames.push(filename);
        await store().addMedia(id,draft.id,filename,original.mime_type,original.size,res.locals.tourAdmin.id);
        copied.set(item.id,{id,url:`/api/guided-tours/media/${id}`});
      }
      Object.assign(item,copied.get(item.id));
    }
    res.status(201).json(await store().update(draft.id,draft.version,definition));
  }catch(error){
    await store().transition(draft.id,draft.version,'delete');
    for(const filename of filenames)await fs.unlink(path.join(root,filename)).catch(()=>{});
    throw error;
  }
}));
adminGuidedToursRouter.post('/:id/:action(publish|draft|archive|delete)',handled(async (req,res) => {
  const parsed = tourVersionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code:'guided_tours.invalid' });
  if (req.params.action === 'delete') await seed();
  if (req.params.action === 'publish') {
    const tour = (await store().list(true)).find(item => item.id === Number(req.params.id));
    if (!tour) throw new TourNotFound();
    const errors = tourPublicationErrors(tour.definition,TOUR_SIGNALS);
    if (errors.length || !await validDefinition(tour.definition,tour.id)) return res.status(400).json({ code:'guided_tours.invalid', details:errors });
  }
  const result = await store().transition(Number(req.params.id),parsed.data.version,req.params.action as 'publish'|'draft'|'archive'|'delete');
  for (const filename of result.filenames) await fs.unlink(path.join(root,path.basename(filename))).catch(() => {});
  res.json({ success:true });
}));
const upload = multer({ storage:multer.memoryStorage(),limits:{ fileSize:TOUR_MEDIA_LIMIT,files:1 },fileFilter:(_req,file,callback) => callback(null,!!mimeExtensions[file.mimetype]) });
adminGuidedToursRouter.post('/:id/media', (req,res,next) => {
  upload.single('file')(req,res,error => error ? res.status(400).json({ code:'guided_tours.upload_invalid' }) : next());
},handled(async (req,res) => {
  const tour = (await store().list(true)).find(item => item.id === Number(req.params.id));
  if (!tour) throw new TourNotFound();
  if (!req.file || !signatureMatches(req.file.buffer,req.file.mimetype)) return res.status(400).json({ code:'guided_tours.upload_invalid' });
  const id = randomUUID(), filename = id + mimeExtensions[req.file.mimetype];
  await fs.mkdir(root,{ recursive:true });
  await fs.writeFile(path.join(root,filename),req.file.buffer,{ flag:'wx' });
  try { await store().addMedia(id,tour.id,filename,req.file.mimetype,req.file.size,res.locals.tourAdmin.id); }
  catch (error) { await fs.unlink(path.join(root,filename)); throw error; }
  res.status(201).json({ id,url:`/api/guided-tours/media/${id}`,kind:req.file.mimetype.startsWith('image/') ? 'image' : req.file.mimetype.startsWith('video/') ? 'video' : 'pdf' });
}));
adminGuidedToursRouter.delete('/media/:id',handled(async (req,res) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return res.sendStatus(404);
  const filename = await store().removeUnusedMedia(req.params.id);
  await fs.unlink(path.join(root,path.basename(filename))).catch(() => {});
  res.json({ success:true });
}));
