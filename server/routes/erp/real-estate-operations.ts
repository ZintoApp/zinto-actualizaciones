import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage,ErpValidationError } from '../../storage';
import { requireAnyPermission } from '../../middleware';
import { resolveContactViewScope } from '../../../shared/contact-access';
import { validateCustomFieldRecordValues } from '../../utils/product-custom-field-values';
import { realEstateLeaseSchema,realEstateMaintenanceSchema,realEstateInspectionSchema,REAL_ESTATE_OPERATION_TRANSITIONS } from '../../../shared/real-estate-operations';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';

const router=Router(),id=z.coerce.number().int().positive();
const configs={
 leases:{table:'real_estate_leases',entity:'real_estate_lease',schema:realEstateLeaseSchema,columns:{name:'name',assetId:'asset_id',tenantContactId:'tenant_contact_id',guarantorContactId:'guarantor_contact_id',startDate:'start_date',endDate:'end_date',currency:'currency',rentAmount:'rent_amount',depositAmount:'deposit_amount',dueDay:'due_day',terms:'terms',customFields:'custom_fields'}},
 maintenance:{table:'real_estate_maintenance',entity:'real_estate_maintenance',schema:realEstateMaintenanceSchema,columns:{assetId:'asset_id',title:'title',description:'description',priority:'priority',assignedUserId:'assigned_user_id',supplierId:'supplier_id',customFields:'custom_fields'}},
 inspections:{table:'real_estate_inspections',entity:'real_estate_inspection',schema:realEstateInspectionSchema,columns:{assetId:'asset_id',title:'title',scheduledAt:'scheduled_at',inspectorUserId:'inspector_user_id',checklist:'checklist',findings:'findings',customFields:'custom_fields'}},
} as const;
for(const section of ['leases','maintenance','inspections'] as const){
 const config=configs[section],read=[`view_real_estate_${section}`,`manage_real_estate_${section}`];
 router.get(`/${section}`,requireAnyPermission(read),async(req,res,next)=>{
  try{
   const filters=z.object({search:z.string().max(250).default(''),status:z.string().max(50).optional(),assetId:id.optional(),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query);
   const companyId=res.locals.companyId,args:unknown[]=[companyId,`%${filters.search}%`],where=[`r.company_id=$1`,`r.${section==='leases'?'name':'title'} ILIKE $2`];
   if(filters.status){args.push(filters.status);where.push(`r.status=$${args.length}`);}if(filters.assetId){args.push(filters.assetId);where.push(`r.asset_id=$${args.length}`);}
   if(section==='leases'){
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    const contactIds=(await getPool().query('SELECT DISTINCT tenant_contact_id FROM real_estate_leases WHERE company_id=$1',[companyId])).rows.map(row=>row.tenant_contact_id);
    const allowed=scope?await storage.getAccessibleContactIds(contactIds,{companyId,userId:req.user!.id,contactScope:scope}):[];
    args.push(allowed);where.push(`r.tenant_contact_id=ANY($${args.length}::int[])`);
   }
   const predicate=where.join(' AND '),count=await getPool().query(`SELECT count(*)::int total FROM ${config.table} r WHERE ${predicate}`,args);
   args.push(filters.limit,filters.offset);
   const records=(await getPool().query(`SELECT r.*${section==='leases'?',r.start_date::text,r.end_date::text':''},a.name asset_name,a.kind asset_kind FROM ${config.table} r JOIN real_estate_assets a ON a.id=r.asset_id AND a.company_id=r.company_id WHERE ${predicate} ORDER BY r.updated_at DESC,r.id DESC LIMIT $${args.length-1} OFFSET $${args.length}`,args)).rows;
   if(section==='leases'&&!res.locals.permissions.view_real_estate_financials)records.forEach(row=>{delete row.currency;delete row.rent_amount;delete row.deposit_amount;delete row.terms;});
   if(section==='leases'){const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),visible=scope?await storage.getAccessibleContactIds(records.map(r=>r.guarantor_contact_id).filter(Boolean),{companyId,userId:req.user!.id,contactScope:scope}):[];records.forEach(r=>{if(!visible.includes(r.guarantor_contact_id))r.guarantor_contact_id=null;});}
   records.forEach(row=>{const feature=row.asset_kind==='unit'?'units':'properties';if(!res.locals.permissions[`view_real_estate_${feature}`]&&!res.locals.permissions[`manage_real_estate_${feature}`]){delete row.asset_id;delete row.asset_name;}});
   res.json({data:records,total:count.rows[0].total});
  }catch(error){next(error);}
 });
 router.get(`/${section}/:id`,requireAnyPermission(read),async(req,res,next)=>{
  try{
   const companyId=res.locals.companyId,recordId=id.parse(req.params.id);
   const record=(await getPool().query(`SELECT r.*${section==='leases'?',r.start_date::text,r.end_date::text':''},a.name asset_name,a.kind asset_kind FROM ${config.table} r JOIN real_estate_assets a ON a.id=r.asset_id AND a.company_id=r.company_id WHERE r.company_id=$1 AND r.id=$2`,[companyId,recordId])).rows[0];
   if(!record){res.status(404).json({error:'Record not found'});return;}
   if(section==='leases'){
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),allowed=scope?await storage.getAccessibleContactIds([record.tenant_contact_id],{companyId,userId:req.user!.id,contactScope:scope}):[];
    if(!allowed.length){res.status(404).json({error:'Lease not found'});return;}
    if(!res.locals.permissions.view_real_estate_financials){delete record.currency;delete record.rent_amount;delete record.deposit_amount;delete record.terms;}
   }
   const tenant=section==='leases'?await storage.getContact(record.tenant_contact_id):null;
   let guarantor=null;
   if(section==='leases'&&record.guarantor_contact_id){const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),visible=scope?await storage.getAccessibleContactIds([record.guarantor_contact_id],{companyId,userId:req.user!.id,contactScope:scope}):[];if(visible.length)guarantor=await storage.getContact(record.guarantor_contact_id);else record.guarantor_contact_id=null;}
   const assetFeature=record.asset_kind==='unit'?'units':'properties';if(!res.locals.permissions[`view_real_estate_${assetFeature}`]&&!res.locals.permissions[`manage_real_estate_${assetFeature}`]){delete record.asset_id;delete record.asset_name;}
   const activity=(await getPool().query('SELECT action,details,created_at FROM real_estate_activity WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at DESC LIMIT 50',[companyId,config.entity,recordId])).rows;
   res.json({data:record,activity,tenant:tenant&&tenant.companyId===companyId?{id:tenant.id,name:tenant.name,email:tenant.email,customFields:tenant.customFields}:null,guarantor:guarantor&&guarantor.companyId===companyId?{id:guarantor.id,name:guarantor.name,email:guarantor.email,customFields:guarantor.customFields}:null});
  }catch(error){next(error);}
 });
 for(const method of ['post','patch'] as const){
  router[method](method==='post'?`/${section}`:`/${section}/:id`,requireAnyPermission([`manage_real_estate_${section}`]),async(req,res,next)=>{
   const client=await getPool().connect();
   try{
    const companyId=res.locals.companyId,recordId=method==='patch'?id.parse(req.params.id):null;
    if(section==='leases'&&!res.locals.permissions.view_real_estate_financials){res.status(403).json({error:'Financial permission required'});return;}
    const version=recordId?z.number().int().positive().parse(req.body.version):null;
    const {version:ignoredVersion,...fields}=req.body;
    const value=config.schema.parse(fields);
    await client.query('BEGIN');
    const old=recordId?(await client.query(`SELECT *${section==='leases'?',start_date::text,end_date::text':''} FROM ${config.table} WHERE company_id=$1 AND id=$2 FOR UPDATE`,[companyId,recordId])).rows[0]:null;
    if(recordId&&!old)throw new ErpValidationError('Record not found','not_found');
    if(old&&old.version!==version)throw new ErpValidationError('Record changed. Reload before saving.','version_conflict');
    if(old&&['completed','cancelled','archived','expired','terminated'].includes(old.status))throw new ErpValidationError('Closed records cannot be edited');
    if(section==='leases'&&old?.status!=='draft'&&old)throw new ErpValidationError('Active lease terms are immutable; terminate or renew the lease');
    const asset=(await client.query('SELECT kind,status,ownership_mode FROM real_estate_assets WHERE company_id=$1 AND id=$2',[companyId,value.assetId])).rows[0];
    if(!asset)throw new ErpValidationError('Property not found');
    const assetSection=asset.kind==='unit'?'units':'properties';
    if(!res.locals.permissions[`view_real_estate_${assetSection}`]&&!res.locals.permissions[`manage_real_estate_${assetSection}`])throw new ErpValidationError('Property access required');
    const userId='assignedUserId' in value?value.assignedUserId:'inspectorUserId' in value?value.inspectorUserId:null;
    if(userId&&!(await client.query('SELECT 1 FROM users WHERE company_id=$1 AND id=$2 AND active=true',[companyId,userId])).rowCount)throw new ErpValidationError('Select an active company user');
    if('supplierId' in value&&value.supplierId&&!(await client.query('SELECT 1 FROM suppliers WHERE company_id=$1 AND id=$2',[companyId,value.supplierId])).rowCount)throw new ErpValidationError('Supplier not found');
    if('tenantContactId' in value){
     const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),allowed=scope?await storage.getAccessibleContactIds([value.tenantContactId],{companyId,userId:req.user!.id,contactScope:scope}):[];
     if(!allowed.length)throw new ErpValidationError('Tenant contact not found');
     if(value.guarantorContactId){const visible=scope?await storage.getAccessibleContactIds([value.guarantorContactId],{companyId,userId:req.user!.id,contactScope:scope}):[];if(!visible.length)throw new ErpValidationError('Guarantor contact not found','not_found');}
     if(!(await client.query('SELECT 1 FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[companyId,value.currency])).rowCount)throw new ErpValidationError('Select an active ERP currency');
     if(value.terms.automaticRent===true){
      if(!res.locals.permissions.manage_real_estate_rent_collection||!res.locals.permissions.view_real_estate_financials)throw new ErpValidationError('Automatic rent requires financial billing permission');
      const item=await storage.getProduct(Number(value.terms.rentCatalogItemId));
      if(!item||item.companyId!==companyId||item.status!=='active')throw new ErpValidationError('Automatic rent requires an active company ERP Catalog item');
      const type=asset.ownership_mode==='managed'?'liability':'revenue',accountId=asset.ownership_mode==='managed'?value.terms.ownerFundsAccountId:value.terms.rentRevenueAccountId;
      if(!Number.isInteger(accountId)||!(await client.query('SELECT 1 FROM chart_of_accounts WHERE company_id=$1 AND id=$2 AND type=$3 AND is_active=true',[companyId,accountId,type])).rowCount)throw new ErpValidationError('Automatic rent requires an active ERP rent posting account');
     }
     await client.query("INSERT INTO real_estate_contact_roles(company_id,contact_id,role) VALUES($1,$2,'tenant') ON CONFLICT(company_id,contact_id,role) DO NOTHING",[companyId,value.tenantContactId]);
    }
    const definitions=await storage.getProductCustomFieldDefinitions(companyId,config.entity);
    value.customFields=validateCustomFieldRecordValues(definitions,value.customFields,old ? old.custom_fields ?? {} : undefined);
    const keys=Object.keys(config.columns),args:unknown[]=keys.map(key=>{const field=(value as Record<string,unknown>)[key];return ['customFields','terms','checklist','findings'].includes(key)?JSON.stringify(field):field??null;});args.push(companyId,recordId??req.user!.id);
    const columns=config.columns as Record<string,string>;
    const result=old?await client.query(`UPDATE ${config.table} SET ${keys.map((key,i)=>`${columns[key]}=$${i+1}`).join(',')},version=version+1,updated_at=now() WHERE company_id=$${args.length-1} AND id=$${args.length} RETURNING *${section==='leases'?',start_date::text,end_date::text':''}`,args):await client.query(`INSERT INTO ${config.table}(${keys.map(key=>columns[key]).join(',')},company_id,created_by) VALUES(${args.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *${section==='leases'?',start_date::text,end_date::text':''}`,args);
    await client.query('INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,$2,$3,$4,$5,$6)',[companyId,config.entity,result.rows[0].id,old?'updated':'created',req.user!.id,JSON.stringify({version:result.rows[0].version})]);
    await client.query('COMMIT');res.status(old?200:201).json({data:result.rows[0]});
   }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });
 }
 router.post(`/${section}/:id/transition`,requireAnyPermission([`manage_real_estate_${section}`]),async(req,res,next)=>{
  const client=await getPool().connect();
  try{
   const companyId=res.locals.companyId,recordId=id.parse(req.params.id),value=z.object({status:z.string(),version:z.number().int().positive()}).strict().parse(req.body);
   await client.query('BEGIN');
   const record=(await client.query(`SELECT *${section==='leases'?',start_date::text,end_date::text':''} FROM ${config.table} WHERE company_id=$1 AND id=$2 FOR UPDATE`,[companyId,recordId])).rows[0];
   let companyToday:string|null=null;
   if(!record)throw new ErpValidationError('Record not found','not_found');if(record.version!==value.version)throw new ErpValidationError('Record changed. Reload before saving.','version_conflict');
   const transitions=REAL_ESTATE_OPERATION_TRANSITIONS[section] as Record<string,readonly string[]>;
   if(!transitions[record.status]?.includes(value.status))throw new ErpValidationError('Invalid status transition');
   const linkedAsset=(await client.query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2',[companyId,record.asset_id])).rows[0];
   if(!linkedAsset)throw new ErpValidationError('Property not found');
   const linkedSection=linkedAsset.kind==='unit'?'units':'properties';
   if(!res.locals.permissions[`view_real_estate_${linkedSection}`]&&!res.locals.permissions[`manage_real_estate_${linkedSection}`])throw new ErpValidationError('Property access required');
   if(section==='inspections'&&value.status==='completed'&&record.checklist.some((item:{checked:boolean})=>!item.checked))throw new ErpValidationError('Complete every checklist item before completing the inspection');
   if(section==='leases'){
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),allowed=scope?await storage.getAccessibleContactIds([record.tenant_contact_id],{companyId,userId:req.user!.id,contactScope:scope}):[];
    if(!allowed.length)throw new ErpValidationError('Lease not found','not_found');
    if(!res.locals.permissions.view_real_estate_financials)throw new ErpValidationError('Financial permission required');
    const asset=(await client.query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,record.asset_id])).rows[0];
    const assetSection=asset.kind==='unit'?'units':'properties';
    if(!res.locals.permissions[`manage_real_estate_${assetSection}`])throw new ErpValidationError('Asset management required');
    companyToday=(await getErpCompanyCalendar(companyId)).today;
    if(value.status==='expired'&&record.end_date>=companyToday)throw new ErpValidationError('Lease has not expired');
    if(value.status==='active'){
     if(!['available','occupied','rented'].includes(asset.status))throw new ErpValidationError('This property cannot be leased');
     const overlap=await client.query("SELECT 1 FROM real_estate_leases WHERE company_id=$1 AND asset_id=$2 AND id<>$3 AND status='active' AND daterange(start_date,end_date,'[]') && daterange($4::date,$5::date,'[]')",[companyId,record.asset_id,recordId,record.start_date,record.end_date]);
     if(overlap.rowCount)throw new ErpValidationError('Another active lease overlaps this period','version_conflict');
    }
   }
   const result=await client.query(`UPDATE ${config.table} SET status=$3,version=version+1,updated_at=now()${section==='inspections'&&value.status==='completed'?',completed_at=now()':''} WHERE company_id=$1 AND id=$2 RETURNING *${section==='leases'?',start_date::text,end_date::text':''}`,[companyId,recordId,value.status]);
   if(section==='leases'&&['active','expired','terminated'].includes(value.status))await client.query("UPDATE real_estate_assets SET status=CASE WHEN EXISTS(SELECT 1 FROM real_estate_leases l WHERE l.company_id=$1 AND l.asset_id=$2 AND l.status='active' AND l.start_date<=$3::date AND l.end_date>=$3::date) THEN 'rented' WHEN status='rented' THEN 'available' ELSE status END,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[companyId,record.asset_id,companyToday]);
   await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,$2,$3,'status_changed',$4,$5)",[companyId,config.entity,recordId,req.user!.id,JSON.stringify({from:record.status,to:value.status})]);
   await client.query('COMMIT');res.json({data:result.rows[0]});
  }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
 });
}
export default router;
