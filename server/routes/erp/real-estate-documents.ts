import {Router} from 'express';
import {z} from 'zod';
import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';
import {requireAnyPermission,getUserPermissions} from '../../middleware';
import path from 'path';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {createErpFileUploadHandler} from './image-upload';
const router=Router(),id=z.coerce.number().int().positive();
const entities={property:{table:'real_estate_assets',section:'properties'},unit:{table:'real_estate_assets',section:'units'},project:{table:'real_estate_projects',section:'projects'},lease:{table:'real_estate_leases',section:'leases',contact:'tenant_contact_id'},reservation:{table:'real_estate_reservations',section:'reservations',contact:'buyer_contact_id'},maintenance:{table:'real_estate_maintenance',section:'maintenance'},inspection:{table:'real_estate_inspections',section:'inspections'},expense:{table:'real_estate_expenses',section:'expenses'}} as const;
const entity=z.enum(['property','unit','project','lease','reservation','maintenance','inspection','expense']);
async function authorize(req:any,res:any,entityType:keyof typeof entities,entityId:number,write:boolean){
 const config=entities[entityType],p=res.locals.permissions;
 if(write?!p[`manage_real_estate_${config.section}`]:!p[`view_real_estate_${config.section}`]&&!p[`manage_real_estate_${config.section}`])throw new ErpValidationError('Record access required');
 const row=(await getPool().query(`SELECT * FROM ${config.table} WHERE company_id=$1 AND id=$2`,[res.locals.companyId,entityId])).rows[0];
 if(!row||(entityType==='property'&&row.kind!=='property')||(entityType==='unit'&&row.kind!=='unit'))throw new ErpValidationError('Record not found','not_found');
 if('contact' in config){const scope=resolveContactViewScope(p,req.user.isSuperAdmin===true),allowed=scope?await storage.getAccessibleContactIds([row[config.contact]],{companyId:res.locals.companyId,userId:req.user.id,contactScope:scope}):[];if(!allowed.length)throw new ErpValidationError('Record not found','not_found');}
 if(entityType==='expense'&&!p.view_real_estate_financials)throw new ErpValidationError('Financial access required');
 return row;
}
async function authorizedEntityPredicates(req:any,res:any,args:unknown[],write=false){
 const predicates:string[]=[];const p=res.locals.permissions;
 for(const [type,config] of Object.entries(entities)){
 if(write?!p[`manage_real_estate_${config.section}`]:!p[`view_real_estate_${config.section}`]&&!p[`manage_real_estate_${config.section}`])continue;
 if(type==='expense'&&!p.view_real_estate_financials)continue;
 let condition=`r.company_id=$1 AND r.id=d.entity_id`;
 if(type==='property'||type==='unit')condition+=` AND r.kind='${type}'`;
 if('contact' in config){const scope=resolveContactViewScope(p,req.user.isSuperAdmin===true);if(!scope)continue;
 const ids=(await getPool().query(`SELECT DISTINCT ${config.contact} contact_id FROM ${config.table} WHERE company_id=$1`,[res.locals.companyId])).rows.map(row=>row.contact_id);
 const allowed=await storage.getAccessibleContactIds(ids,{companyId:res.locals.companyId,userId:req.user.id,contactScope:scope});args.push(allowed);condition+=` AND r.${config.contact}=ANY($${args.length}::int[])`;}
 predicates.push(`(d.entity_type='${type}' AND EXISTS(SELECT 1 FROM ${config.table} r WHERE ${condition}))`);
 }
 return predicates.length?`(${predicates.join(' OR ')})`:'false';
}
router.get('/document-context',requireAnyPermission(['manage_real_estate_documents']),async(req,res,next)=>{try{
 const args:unknown[]=[res.locals.companyId],predicate=await authorizedEntityPredicates(req,res,args,true);
 const choices=Object.entries(entities).map(([type,config])=>`SELECT '${type}'::text entity_type,id entity_id,${['property','unit','project','lease'].includes(type)?'name':type==='reservation'?"'Reservation #'||id":'title'} name FROM ${config.table} WHERE company_id=$1 ${type==='property'||type==='unit'?`AND kind='${type}'`:''}`);
 const rows=(await getPool().query(`SELECT d.entity_type "entityType",d.entity_id "entityId",d.name FROM (${choices.join(' UNION ALL ')}) d WHERE ${predicate} ORDER BY d.entity_id DESC LIMIT 100`,args)).rows;res.json({data:rows});
}catch(e){next(e);}});
router.get('/documents',requireAnyPermission(['view_real_estate_documents','manage_real_estate_documents']),async(req,res,next)=>{try{
 const f=z.object({entityType:entity.optional(),entityId:id.optional(),search:z.string().max(250).default(''),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query);
 const args:unknown[]=[res.locals.companyId,`%${f.search}%`,f.entityType??null,f.entityId??null],authorization=await authorizedEntityPredicates(req,res,args),where=`d.company_id=$1 AND d.name ILIKE $2 AND ($3::text IS NULL OR d.entity_type=$3) AND ($4::int IS NULL OR d.entity_id=$4) AND ${authorization}`;
 const total=(await getPool().query(`SELECT count(*)::int total FROM real_estate_documents d WHERE ${where}`,args)).rows[0].total;args.push(f.limit,f.offset);
 const data=(await getPool().query(`SELECT d.* FROM real_estate_documents d WHERE ${where} ORDER BY d.created_at DESC,d.id DESC LIMIT $${args.length-1} OFFSET $${args.length}`,args)).rows;res.json({data,total});
}catch(e){next(e);}});
router.post('/documents/:entityType/:entityId/upload',requireAnyPermission(['manage_real_estate_documents']),async(req,res,next)=>{try{const type=entity.parse(req.params.entityType),recordId=id.parse(req.params.entityId);await authorize(req,res,type,recordId,true);res.locals.erpUploadComplete=async(file:{url:string;filename:string;size:number;mimetype:string})=>{const category=z.string().trim().min(1).max(100).parse(req.body.category??'general'),name=z.string().trim().min(1).max(250).parse(req.body.name||file.filename);await getPool().query('INSERT INTO real_estate_documents(company_id,entity_type,entity_id,name,category,media_path,mime_type,file_size,uploaded_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[res.locals.companyId,type,recordId,name,category,file.url,file.mimetype,file.size,req.user!.id]);};next();}catch(e){next(e);}},createErpFileUploadHandler('uploads/erp/real-estate/documents'));
router.get('/documents/:id/download',requireAnyPermission(['view_real_estate_documents','manage_real_estate_documents']),async(req,res,next)=>{try{const row=(await getPool().query('SELECT * FROM real_estate_documents WHERE company_id=$1 AND id=$2',[res.locals.companyId,id.parse(req.params.id)])).rows[0];if(!row||!(row.entity_type in entities))throw new ErpValidationError('Document not found','not_found');await authorize(req,res,row.entity_type,row.entity_id,false);res.redirect(row.media_path);}catch(e){next(e);}});
router.patch('/documents/:id',requireAnyPermission(['manage_real_estate_documents']),async(req,res,next)=>{try{
 const companyId=res.locals.companyId,documentId=id.parse(req.params.id);
 const body=z.object({name:z.string().trim().min(1).max(250),category:z.string().trim().min(1).max(100),expectedName:z.string(),expectedCategory:z.string()}).strict().parse(req.body);
 const row=(await getPool().query('SELECT * FROM real_estate_documents WHERE company_id=$1 AND id=$2',[companyId,documentId])).rows[0];
 if(!row||!(row.entity_type in entities))throw new ErpValidationError('Document not found','not_found');
 await authorize(req,res,row.entity_type,row.entity_id,true);
 const updated=await getPool().query(`WITH updated AS(
  UPDATE real_estate_documents SET name=$3,category=$4 WHERE company_id=$1 AND id=$2 AND name=$5 AND category=$6 RETURNING *
 ), audit AS(
  INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)
  SELECT company_id,'real_estate_document',id,'metadata_updated',$7,
   jsonb_build_object('previousName',$5::text,'previousCategory',$6::text,'name',name,'category',category) FROM updated RETURNING id
 ) SELECT * FROM updated`,[companyId,documentId,body.name,body.category,body.expectedName,body.expectedCategory,req.user!.id]);
 if(!updated.rowCount)throw new ErpValidationError('Document changed. Reload before saving.','version_conflict');
 res.json({data:updated.rows[0]});
}catch(e){next(e);}});
export async function realEstateDocumentMediaGuard(req:any,res:any,next:any){
 try{
  if(!req.user?.companyId){res.status(401).end();return;}
  res.locals.companyId=req.user.companyId;res.locals.permissions=await getUserPermissions(req.user);
  if(!res.locals.permissions.view_real_estate_documents&&!res.locals.permissions.manage_real_estate_documents&&!req.user.isSuperAdmin){res.status(403).end();return;}
  const normalized=path.posix.normalize(decodeURIComponent(req.path).replaceAll('\\','/'));
  if(normalized.includes(':')||normalized.split('/').some(s=>/[. ]$/.test(s))){res.status(404).end();return;}
  const publicPath=`/uploads/erp/real-estate/documents${normalized}`;
  const row=(await getPool().query('SELECT entity_type,entity_id FROM real_estate_documents WHERE company_id=$1 AND media_path=$2',[req.user.companyId,publicPath])).rows[0];
  if(!row||!(row.entity_type in entities)){res.status(404).end();return;}
  await authorize(req,res,row.entity_type,row.entity_id,false);
  res.setHeader('Cache-Control','private, no-store');next();
 }catch(e){if(e instanceof ErpValidationError){res.status(404).end();return;}next(e);}
}
export default router;
