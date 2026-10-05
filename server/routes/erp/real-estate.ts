import {scopeRealEstateReportInvoices} from '../../services/erp/real-estate-report-invoice-scope';
import {accessibleInvoiceIds,loadAccessibleInvoice} from '../../services/erp/invoice-access';
import calendarRoutes from './real-estate-calendar';
import costSourceRoutes from './real-estate-cost-sources';
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage } from '../../storage';
import { getUserPermissions, requireAnyPermission } from '../../middleware';
import { getCompanyErpBusinessType } from './business-type';
import { listRealEstateAssets, saveRealEstateAsset } from '../../services/erp/real-estate-assets';
import { realEstateListSchema, updateRealEstateAssetSchema, realEstateOwnershipSchema } from '../../../shared/real-estate-contracts';
import { resolveContactViewScope } from '../../../shared/contact-access';
import { createErpImageUploadHandler } from './image-upload';
import {normalizeTimezone,validateTimezone} from '../../utils/timezone';
import projectRoutes from './real-estate-projects';
import contactRoutes from './real-estate-contacts';
import scheduleRoutes from './real-estate-schedule';
import operationRoutes from './real-estate-operations';
import receivableRoutes from './real-estate-receivables';
import reservationRoutes from './real-estate-reservations';
import dashboardRoutes from './real-estate-dashboard';
import vendorRoutes from './real-estate-vendors';
import documentRoutes from './real-estate-documents';
import expenseRoutes from './real-estate-expenses';
import reportRoutes from './real-estate-reports';
import paymentPlanRoutes from './real-estate-payment-plans';
import settlementRoutes from './real-estate-settlements';
import commissionRoutes from './real-estate-commissions';

const router = Router();
const idSchema = z.coerce.number().int().positive();
router.use(async (req, res, next) => {
  try {
    if (!req.user?.companyId || await getCompanyErpBusinessType(req.user.companyId) !== 'real_estate') {
      res.status(403).json({ error: 'Real Estate ERP is not enabled for this company' }); return;
    }
    res.locals.companyId = req.user.companyId;
    res.locals.permissions = await getUserPermissions(req.user);
    next();
  } catch (error) { next(error); }
});

router.use(costSourceRoutes);

router.use(calendarRoutes);

router.get('/context', requireAnyPermission(['view_erp','view_real_estate_properties','manage_real_estate_properties','view_real_estate_units','manage_real_estate_units','manage_real_estate_settings','manage_real_estate_leases','manage_real_estate_maintenance','manage_real_estate_inspections','manage_real_estate_projects','manage_real_estate_vendors','manage_real_estate_reservations','manage_real_estate_expenses']), async (req,res,next) => {
  try {
    const companyId = res.locals.companyId;
    const permissions = res.locals.permissions;
    const financial = permissions.view_real_estate_financials === true;
    const currencies = financial ? (await getPool().query('SELECT id,code,name,symbol,decimal_places FROM currencies WHERE company_id=$1 AND is_active=true ORDER BY code',[companyId])).rows : [];
    const taxonomy = (await getPool().query('SELECT * FROM real_estate_taxonomy WHERE company_id=$1 AND is_active=true ORDER BY sort_order,name',[companyId])).rows;
    const users = (await getPool().query('SELECT id,COALESCE(full_name,username) AS name FROM users WHERE company_id=$1 AND active=true ORDER BY full_name,username',[companyId])).rows;
    const baseCurrency = financial ? await storage.getBaseCurrency(companyId) : null;
    const configuredZone=(await storage.getCompanySetting(companyId,'defaultTimezone'))?.value,zone=typeof configuredZone==='string'?normalizeTimezone(configuredZone):null;
    res.json({ currencies, taxonomy, agents:users, baseCurrency:baseCurrency?.code ?? null, permissions,timezone:zone&&validateTimezone(zone)?zone:null });
  } catch(error) { next(error); }
});

router.post('/images/upload', requireAnyPermission(['manage_real_estate_properties','manage_real_estate_units','manage_real_estate_projects']), createErpImageUploadHandler('uploads/erp/real-estate/images'));

for (const kind of ['property','unit'] as const) {
  const section = kind === 'property' ? 'properties' : 'units';
  const read = [`view_real_estate_${section}`,`manage_real_estate_${section}`];
  router.get(`/${section}`,requireAnyPermission(read),async(req,res,next)=>{
    try { res.json(await listRealEstateAssets(res.locals.companyId,{...req.query,kind},res.locals.permissions.view_real_estate_financials===true)); }
    catch(error){next(error);}
  });
  router.get(`/${section}/:id`,requireAnyPermission(read),async(req,res,next)=>{
    try {
      const id=idSchema.parse(req.params.id);
      const result=await getPool().query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 AND kind=$3',[res.locals.companyId,id,kind]);
      const row=result.rows[0];
      if(!row){res.status(404).json({error:'Property not found'});return;}
      if(res.locals.permissions.view_real_estate_financials!==true){delete row.sale_price;delete row.rental_price;delete row.currency;}
      row.tag_ids=(await getPool().query('SELECT taxonomy_id FROM real_estate_asset_tags WHERE company_id=$1 AND asset_id=$2',[res.locals.companyId,id])).rows.map(value=>value.taxonomy_id);
      const metadata=(await getPool().query(`SELECT t.name property_type_name,COALESCE(u.full_name,u.username) assigned_agent_name,
        p.name project_name,b.name building_name,f.name floor_name
        FROM real_estate_assets a LEFT JOIN real_estate_taxonomy t ON t.id=a.property_type_id AND t.company_id=a.company_id
        LEFT JOIN users u ON u.id=a.assigned_agent_id AND u.company_id=a.company_id
        LEFT JOIN real_estate_projects p ON p.id=a.project_id AND p.company_id=a.company_id
        LEFT JOIN real_estate_buildings b ON b.id=a.building_id AND b.company_id=a.company_id
        LEFT JOIN real_estate_floors f ON f.id=a.floor_id AND f.company_id=a.company_id
        WHERE a.company_id=$1 AND a.id=$2`,[res.locals.companyId,id])).rows[0]??{};
      Object.assign(row,metadata);
      row.classifications=(await getPool().query('SELECT id,kind,name,color,is_active FROM real_estate_taxonomy WHERE company_id=$1 AND id=ANY($2::int[]) ORDER BY kind,name',[res.locals.companyId,row.tag_ids])).rows;
      if(!res.locals.permissions.view_real_estate_projects&&!res.locals.permissions.manage_real_estate_projects){delete row.project_name;delete row.building_name;delete row.floor_name;}
      const p=res.locals.permissions,c=res.locals.companyId,can=(feature:string)=>p[`view_real_estate_${feature}`]||p[`manage_real_estate_${feature}`];
      const scope=resolveContactViewScope(p,req.user!.isSuperAdmin===true),contactIds=(await getPool().query('SELECT tenant_contact_id id FROM real_estate_leases WHERE company_id=$1 AND asset_id=$2 UNION SELECT buyer_contact_id id FROM real_estate_reservations WHERE company_id=$1 AND asset_id=$2',[c,id])).rows.map(r=>r.id),allowed=scope?await storage.getAccessibleContactIds(contactIds,{companyId:c,userId:req.user!.id,contactScope:scope}):[];
      const related:any={};
      let seller=null;
      if(row.seller_contact_id){
        const visible=scope?await storage.getAccessibleContactIds([row.seller_contact_id],{companyId:c,userId:req.user!.id,contactScope:scope}):[];
        if(!visible.includes(row.seller_contact_id))row.seller_contact_id=null;
        else {
          const contact=await storage.getContact(row.seller_contact_id);
          if(contact&&contact.companyId===c)seller={id:contact.id,name:contact.name,email:contact.email,customFields:contact.customFields};
          else row.seller_contact_id=null;
        }
      }
      if(can('leases'))related.leases=(await getPool().query('SELECT l.id,l.name,l.status,l.start_date::text,l.end_date::text,c.name contact_name FROM real_estate_leases l JOIN contacts c ON c.id=l.tenant_contact_id AND c.company_id=l.company_id WHERE l.company_id=$1 AND l.asset_id=$2 AND l.tenant_contact_id=ANY($3::int[]) ORDER BY l.start_date DESC LIMIT 20',[c,id,allowed])).rows;
      if(can('reservations'))related.reservations=(await getPool().query('SELECT r.id,r.status,r.expires_at,c.name contact_name FROM real_estate_reservations r JOIN contacts c ON c.id=r.buyer_contact_id AND c.company_id=r.company_id WHERE r.company_id=$1 AND r.asset_id=$2 AND r.buyer_contact_id=ANY($3::int[]) ORDER BY r.created_at DESC LIMIT 20',[c,id,allowed])).rows;
      for(const feature of ['maintenance','inspections'])if(can(feature))related[feature]=(await getPool().query(`SELECT id,title,status,created_at FROM real_estate_${feature} WHERE company_id=$1 AND asset_id=$2 ORDER BY updated_at DESC LIMIT 20`,[c,id])).rows;
      if(can('documents'))related.documents=(await getPool().query('SELECT id,name,category,created_at FROM real_estate_documents WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at DESC LIMIT 20',[c,kind,id])).rows;
      if(can('schedule')){
        const appointmentContacts=(await getPool().query('SELECT a.contact_id FROM real_estate_appointments e JOIN contact_appointments a ON a.id=e.appointment_id AND a.company_id=e.company_id WHERE e.company_id=$1 AND e.asset_id=$2',[c,id])).rows.map(r=>r.contact_id);
        const visible=scope?await storage.getAccessibleContactIds(appointmentContacts,{companyId:c,userId:req.user!.id,contactScope:scope}):[];
        related.schedule=(await getPool().query('SELECT a.id,a.title,a.status,a.scheduled_at,c.name contact_name FROM real_estate_appointments e JOIN contact_appointments a ON a.id=e.appointment_id AND a.company_id=e.company_id JOIN contacts c ON c.id=a.contact_id AND c.company_id=a.company_id WHERE e.company_id=$1 AND e.asset_id=$2 AND a.contact_id=ANY($3::int[]) ORDER BY a.scheduled_at DESC LIMIT 20',[c,id,visible])).rows;
      }
      let financial=null;
      if(p.view_real_estate_financials){
        const types=[...(can('rent_collection')?['rent','security_deposit']:[]),...(can('reservations')?['reservation_deposit']:[]),...(can('payment_plans')?['installment']:[])];
        // Totals use stored ERP currencies and authorized invoice counterparties.
        // Do not combine currencies or include draft/void obligations.
        const invoiceIds=await accessibleInvoiceIds(req),financialQuery=(query:string,args:unknown[])=>{const scoped=scopeRealEstateReportInvoices(query,args,invoiceIds);return getPool().query(scoped.text,scoped.values);};
        financial={receivables:types.length?(await financialQuery("SELECT i.currency,count(*)::int invoices,COALESCE(sum(i.total_amount),0)::text billed,COALESCE(sum(i.amount_paid),0)::text paid,COALESCE(sum(i.amount_due),0)::text outstanding FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id WHERE i.company_id=$1 AND s.asset_id=$2 AND i.contact_id=ANY($3::int[]) AND s.source_type=ANY($4::text[]) AND i.status IN('sent','partially_paid','paid','overdue') GROUP BY i.currency ORDER BY i.currency",[c,id,allowed,types])).rows:[],expenses:can('expenses')?(await getPool().query("SELECT currency,count(*)::int records,COALESCE(sum(amount),0)::text amount FROM real_estate_expenses WHERE company_id=$1 AND asset_id=$2 AND status='posted' GROUP BY currency ORDER BY currency",[c,id])).rows:[]};
      }
      const activity=(await getPool().query('SELECT action,details,created_at FROM real_estate_activity WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at DESC LIMIT 50',[res.locals.companyId,kind==='property'?'real_estate_property':'real_estate_unit',id])).rows;
      for(const event of activity){
        if(!p.view_real_estate_financials||(event.action.startsWith('cost_source_')&&((!p.view_accounting&&!p.manage_accounting)||(!p.view_invoices&&!p.manage_invoices))))event.details={};
        else if(event.action.startsWith('cost_source_')&&event.details?.journalEntryId){
          const sourceJournal=(await getPool().query('SELECT reference_type,reference_id FROM journal_entries WHERE company_id=$1 AND id=$2',[c,event.details.journalEntryId])).rows[0];
          if(sourceJournal?.reference_type==='invoice'&&!await loadAccessibleInvoice(req,sourceJournal.reference_id))event.details={};
        }
      }
      res.json({data:row,activity,related,financial,seller});
    }catch(error){next(error);}
  });
  router.post(`/${section}`,requireAnyPermission([`manage_real_estate_${section}`]),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
    try {res.status(201).json({data:await saveRealEstateAsset(res.locals.companyId,req.user!.id,{...req.body,kind},undefined,undefined,{permissions:res.locals.permissions,isSuperAdmin:req.user!.isSuperAdmin===true})});}
    catch(error){next(error);}
  });
  router.patch(`/${section}/:id`,requireAnyPermission([`manage_real_estate_${section}`]),async(req,res,next)=>{
    try {
      const id=idSchema.parse(req.params.id);
      const {version,...body}=updateRealEstateAssetSchema.parse(req.body);
      if(body.kind&&body.kind!==kind){res.status(400).json({error:'Asset kind cannot change'});return;}
      if(res.locals.permissions.view_real_estate_financials!==true && ['salePrice','rentalPrice','currency'].some(key=>key in body)) {
        res.status(403).json({error:'Financial permission required'});return;
      }
      const type=await getPool().query('SELECT 1 FROM real_estate_assets WHERE company_id=$1 AND id=$2 AND kind=$3',[res.locals.companyId,id,kind]);
      if(!type.rowCount){res.status(404).json({error:'Property not found'});return;}
      const row=await saveRealEstateAsset(res.locals.companyId,req.user!.id,body,id,version,{permissions:res.locals.permissions,isSuperAdmin:req.user!.isSuperAdmin===true});
      const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
      if(row.seller_contact_id&&(!scope||!(await storage.getAccessibleContactIds([row.seller_contact_id],{companyId:res.locals.companyId,userId:req.user!.id,contactScope:scope})).includes(row.seller_contact_id)))row.seller_contact_id=null;
      if(res.locals.permissions.view_real_estate_financials!==true){delete row.sale_price;delete row.rental_price;delete row.currency;}
      res.json({data:row});
    }catch(error){next(error);}
  });
}

router.get('/assets/:id/ownership',requireAnyPermission(['view_real_estate_owners','manage_real_estate_owners']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
  try {
    const assetId=idSchema.parse(req.params.id),companyId=res.locals.companyId;
    const asset=(await getPool().query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2',[companyId,assetId])).rows[0];
    if(!asset){res.status(404).json({error:'Property not found'});return;}
    const section=asset.kind==='unit'?'units':'properties';
    if(!res.locals.permissions[`view_real_estate_${section}`]&&!res.locals.permissions[`manage_real_estate_${section}`]){res.status(403).json({error:'Asset access required'});return;}
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    const versions=(await getPool().query('SELECT id,effective_from::text,effective_to::text FROM real_estate_ownership_versions WHERE company_id=$1 AND asset_id=$2 ORDER BY effective_from DESC',[companyId,assetId])).rows;
    const shares=(await getPool().query('SELECT s.ownership_version_id,s.contact_id,s.percentage,c.name FROM real_estate_ownership_shares s JOIN real_estate_ownership_versions v ON v.id=s.ownership_version_id AND v.company_id=s.company_id JOIN contacts c ON c.id=s.contact_id AND c.company_id=s.company_id WHERE v.company_id=$1 AND v.asset_id=$2',[companyId,assetId])).rows;
    const allowed=scope?await storage.getAccessibleContactIds([...new Set(shares.map(share=>share.contact_id))],{companyId,userId:req.user!.id,contactScope:scope}):[];
    res.json({data:versions.map(version=>({...version,shares:shares.filter(share=>share.ownership_version_id===version.id).map(share=>allowed.includes(share.contact_id)?{contactId:share.contact_id,name:share.name,percentage:share.percentage}:{contactId:null,name:null,percentage:share.percentage})}))});
  }catch(error){next(error);}
});

router.patch('/assets/:id/ownership/:versionId',requireAnyPermission(['manage_real_estate_owners']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
  const client=await getPool().connect();
  try{
    const assetId=idSchema.parse(req.params.id),versionId=idSchema.parse(req.params.versionId),companyId=res.locals.companyId;
    const value=z.object({effectiveTo:z.string().date()}).strict().parse(req.body);
    await client.query('BEGIN');
    const asset=(await client.query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,assetId])).rows[0];
    if(!asset){await client.query('ROLLBACK');res.status(404).json({error:'Property not found'});return;}
    const section=asset.kind==='unit'?'units':'properties';
    if(!res.locals.permissions[`manage_real_estate_${section}`]){await client.query('ROLLBACK');res.status(403).json({error:'Asset management required'});return;}
    const existing=(await client.query('SELECT * FROM real_estate_ownership_versions WHERE company_id=$1 AND asset_id=$2 AND id=$3',[companyId,assetId,versionId])).rows[0];
    if(!existing){await client.query('ROLLBACK');res.status(404).json({error:'Ownership version not found'});return;}
    if(existing.effective_to){await client.query('ROLLBACK');res.status(409).json({error:'Ownership period is already closed'});return;}
    const updated=await client.query('UPDATE real_estate_ownership_versions SET effective_to=$4 WHERE company_id=$1 AND asset_id=$2 AND id=$3 AND effective_from<=$4::date RETURNING *',[companyId,assetId,versionId,value.effectiveTo]);
    if(!updated.rowCount){await client.query('ROLLBACK');res.status(400).json({error:'End date must follow start date'});return;}
    await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,$2,$3,'ownership_closed',$4,$5)",[companyId,asset.kind==='unit'?'real_estate_unit':'real_estate_property',assetId,req.user!.id,JSON.stringify({ownershipVersionId:versionId,effectiveTo:value.effectiveTo})]);
    await client.query('COMMIT');res.json({data:updated.rows[0]});
  }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
});

router.put('/assets/:id/ownership',requireAnyPermission(['manage_real_estate_owners']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
  const client=await getPool().connect();
  try {
    const id=idSchema.parse(req.params.id);
    const value=realEstateOwnershipSchema.parse(req.body);
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    if(!scope){res.status(403).json({error:'Contact visibility is required'});return;}
    const allowed=await storage.getAccessibleContactIds(value.shares.map(share=>share.contactId),{companyId:res.locals.companyId,userId:req.user!.id,contactScope:scope});
    if(allowed.length!==value.shares.length){res.status(404).json({error:'Owner contact not found'});return;}
    await client.query('BEGIN');
    const asset=await client.query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[res.locals.companyId,id]);
    if(!asset.rowCount){await client.query('ROLLBACK');res.status(404).json({error:'Property not found'});return;}
    const section=asset.rows[0].kind==='unit'?'units':'properties';
    if(!res.locals.permissions[`manage_real_estate_${section}`]){await client.query('ROLLBACK');res.status(403).json({error:'Asset management required'});return;}
    if(asset.rows[0].ownership_mode!=='managed'){throw new Error('OWNERSHIP_REQUIRES_MANAGED_ASSET');}
    const overlap=await client.query(`SELECT id FROM real_estate_ownership_versions WHERE company_id=$1 AND asset_id=$2
      AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange($3::date,COALESCE($4::date,'infinity'::date),'[]')`,[res.locals.companyId,id,value.effectiveFrom,value.effectiveTo??null]);
    if(overlap.rowCount){await client.query('ROLLBACK');res.status(409).json({error:'Ownership dates overlap an existing version'});return;}
    const version=await client.query('INSERT INTO real_estate_ownership_versions(company_id,asset_id,effective_from,effective_to,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[res.locals.companyId,id,value.effectiveFrom,value.effectiveTo??null,req.user!.id]);
    for(const share of value.shares){
      await client.query('INSERT INTO real_estate_ownership_shares(company_id,ownership_version_id,contact_id,percentage) VALUES($1,$2,$3,$4)',[res.locals.companyId,version.rows[0].id,share.contactId,share.percentage]);
      await client.query("INSERT INTO real_estate_contact_roles(company_id,contact_id,role) VALUES($1,$2,'owner') ON CONFLICT(company_id,contact_id,role) DO NOTHING",[res.locals.companyId,share.contactId]);
    }
    await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,$2,$3,'ownership_added',$4,$5)",[res.locals.companyId,asset.rows[0].kind==='unit'?'real_estate_unit':'real_estate_property',id,req.user!.id,JSON.stringify({ownershipVersionId:version.rows[0].id})]);
    await client.query('COMMIT');res.status(201).json({id:version.rows[0].id});
  }catch(error){await client.query('ROLLBACK');if((error as Error).message==='OWNERSHIP_REQUIRES_MANAGED_ASSET'){res.status(400).json({error:'Owner shares apply to managed properties'});}else next(error);}
  finally{client.release();}
});

router.get('/taxonomy',requireAnyPermission(['view_real_estate_settings','manage_real_estate_settings']),async(_req,res,next)=>{
  try{res.json({data:(await getPool().query('SELECT * FROM real_estate_taxonomy WHERE company_id=$1 ORDER BY kind,sort_order,name',[res.locals.companyId])).rows});}catch(error){next(error);}
});
router.patch('/taxonomy/:id',requireAnyPermission(['manage_real_estate_settings']),async(req,res,next)=>{
 const client=await getPool().connect();try{
  const c=res.locals.companyId,id=idSchema.parse(req.params.id),v=z.object({name:z.string().trim().min(1).max(100),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),isActive:z.boolean(),expectedName:z.string(),expectedActive:z.boolean(),expectedColor:z.string().nullable()}).strict().parse(req.body);
  await client.query('BEGIN');const old=(await client.query('SELECT * FROM real_estate_taxonomy WHERE company_id=$1 AND id=$2 FOR UPDATE',[c,id])).rows[0];
  if(!old){res.status(404).json({error:'Taxonomy record not found'});await client.query('ROLLBACK');return;}
  if(old.name!==v.expectedName||old.is_active!==v.expectedActive||(old.color??null)!==v.expectedColor){res.status(409).json({error:'Record changed. Reload before saving.'});await client.query('ROLLBACK');return;}
  const row=(await client.query('UPDATE real_estate_taxonomy SET name=$3,color=$4,is_active=$5 WHERE company_id=$1 AND id=$2 RETURNING *',[c,id,v.name,v.color,v.isActive])).rows[0];
  await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_taxonomy',$2,'updated',$3,$4)",[c,id,req.user!.id,JSON.stringify({previous:{name:old.name,color:old.color,isActive:old.is_active},current:{name:row.name,color:row.color,isActive:row.is_active}})]);
  await client.query('COMMIT');res.json({data:row});
 }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
});
router.post('/taxonomy',requireAnyPermission(['manage_real_estate_settings']),async(req,res,next)=>{
  try {
    const value=z.object({kind:z.enum(['property_type','feature','tag']),name:z.string().trim().min(1).max(100),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).strict().parse(req.body);
    const result=await getPool().query('INSERT INTO real_estate_taxonomy(company_id,kind,name,color) VALUES($1,$2,$3,$4) RETURNING *',[res.locals.companyId,value.kind,value.name,value.color??null]);
    res.status(201).json({data:result.rows[0]});
  }catch(error){next(error);}
});

router.get('/contact-roles/:role',requireAnyPermission(['view_real_estate_owners','manage_real_estate_owners','view_real_estate_tenants','manage_real_estate_tenants']),async(req,res,next)=>{
  try {
    const role=z.enum(['owner','tenant','buyer','seller','guarantor','developer']).parse(req.params.role);
    const feature=role==='tenant'?'tenants':'owners';
    if(!res.locals.permissions[`view_real_estate_${feature}`]&&!res.locals.permissions[`manage_real_estate_${feature}`]){res.status(403).json({error:'Permission required'});return;}
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    if(!scope){res.json({data:[],total:0});return;}
    const roleRows=await getPool().query('SELECT contact_id FROM real_estate_contact_roles WHERE company_id=$1 AND role=$2',[res.locals.companyId,role]);
    const allowed=await storage.getAccessibleContactIds(roleRows.rows.map(row=>row.contact_id),{companyId:res.locals.companyId,userId:req.user!.id,contactScope:scope});
    if(!allowed.length){res.json({data:[],total:0});return;}
    const query=realEstateListSchema.parse({search:req.query.search,limit:req.query.limit,offset:req.query.offset});
    const data=await getPool().query('SELECT id,name,email,avatar_url,custom_fields FROM contacts WHERE company_id=$1 AND id=ANY($2::int[]) AND name ILIKE $3 ORDER BY name LIMIT $4 OFFSET $5',[res.locals.companyId,allowed,`%${query.search??''}%`,query.limit,query.offset]);
    const count=await getPool().query('SELECT count(*)::int total FROM contacts WHERE company_id=$1 AND id=ANY($2::int[]) AND name ILIKE $3',[res.locals.companyId,allowed,`%${query.search??''}%`]);
    res.json({data:data.rows,total:count.rows[0].total});
  }catch(error){next(error);}
});

router.use(projectRoutes);
router.use(contactRoutes);
router.use(scheduleRoutes);
router.use(operationRoutes);
router.use(receivableRoutes);
router.use(reservationRoutes);
router.use(dashboardRoutes);
router.use(vendorRoutes);
router.use(documentRoutes);
router.use(expenseRoutes);
router.use(reportRoutes);
router.use(paymentPlanRoutes);
router.use(settlementRoutes);
router.use(commissionRoutes);

router.use((error:any,_req:any,res:any,_next:any)=>{
  if(error instanceof z.ZodError){res.status(400).json({error:error.issues.map(issue=>issue.message).join('; ')});return;}
  if(error?.code==='version_conflict'){res.status(409).json({error:error.message});return;}
  if(error?.code==='reservation_financial_resolution_required'){res.status(400).json({error:error.message,code:error.code});return;}
  if(error?.code==='not_found'){res.status(404).json({error:error.message});return;}
  if(error?.code==='23505'){res.status(409).json({error:'A record with this identifier already exists'});return;}
  if(error?.name==='ErpValidationError'){res.status(400).json({error:error.message});return;}
  console.error('[real-estate]',error);
  res.status(500).json({error:'Unable to complete the Real Estate request'});
});
export default router;
