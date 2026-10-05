import {scopeRealEstateSettlements} from '../../services/erp/real-estate-settlement-access';
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage,ErpValidationError } from '../../storage';
import { requireAnyPermission } from '../../middleware';
import { resolveContactViewScope } from '../../../shared/contact-access';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';
import {accessibleInvoiceIds} from '../../services/erp/invoice-access';
import {loadOwnerRentReport} from '../../services/erp/real-estate-owner-rent-report';
import {loadOwnerRentForecast} from '../../services/erp/real-estate-owner-rent-forecast';

const router=Router();
const roles=z.enum(['owner','tenant','buyer','seller','guarantor','developer']);
router.get('/owners/:id/rent-summary',requireAnyPermission(['view_real_estate_owners','manage_real_estate_owners']),requireAnyPermission(['view_real_estate_financials']),requireAnyPermission(['view_real_estate_rent_collection','manage_real_estate_rent_collection']),async(req,res,next)=>{
 const client=await getPool().connect();
 try{
   const companyId=res.locals.companyId,ownerId=z.coerce.number().int().positive().parse(req.params.id),p=res.locals.permissions;
   const {today,timezone}=await getErpCompanyCalendar(companyId);
   const {period}=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(today.slice(0,7))}).strict().parse(req.query);
   const scope=resolveContactViewScope(p,req.user!.isSuperAdmin===true);
   if(!scope||!(await storage.getAccessibleContactIds([ownerId],{companyId,userId:req.user!.id,contactScope:scope})).length){res.status(404).json({error:'Owner not found'});return;}
   const linked=await client.query("SELECT 1 FROM real_estate_contact_roles WHERE company_id=$1 AND contact_id=$2 AND role='owner'",[companyId,ownerId]);
   if(!linked.rowCount){res.status(404).json({error:'Owner not found'});return;}
   const kinds=['property','unit'].filter(kind=>p[`view_real_estate_${kind==='unit'?'units':'properties'}`]||p[`manage_real_estate_${kind==='unit'?'units':'properties'}`]);
   const invoiceIds=await accessibleInvoiceIds(req);
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const data=await loadOwnerRentReport(client,{companyId,ownerId,period,timezone,kinds,invoiceIds});
   let forecast:null|Awaited<ReturnType<typeof loadOwnerRentForecast>>=null;
   if(p.view_real_estate_leases||p.manage_real_estate_leases){
     const tenantIds=(await client.query('SELECT DISTINCT tenant_contact_id FROM real_estate_leases WHERE company_id=$1',[companyId])).rows.map((row:any)=>Number(row.tenant_contact_id));
     const contactIds=await storage.getAccessibleContactIds(tenantIds,{companyId,userId:req.user!.id,contactScope:scope});
     forecast=await loadOwnerRentForecast(client,{companyId,ownerId,period,kinds,contactIds,invoiceIds});
   }
   await client.query('COMMIT');res.json({...data,forecast});
 }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
});
const read=['view_real_estate_properties','manage_real_estate_properties','view_real_estate_units','manage_real_estate_units','view_real_estate_owners','manage_real_estate_owners','view_real_estate_tenants','manage_real_estate_tenants','view_real_estate_projects','manage_real_estate_projects','view_real_estate_leases','manage_real_estate_leases','view_real_estate_reservations','manage_real_estate_reservations','view_real_estate_payment_plans','manage_real_estate_payment_plans','view_real_estate_schedule','manage_real_estate_schedule'];
router.get('/contacts/search',requireAnyPermission(read),async(req,res,next)=>{
  try {
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    if(!scope){res.json({data:[],total:0});return;}
    const search=z.string().max(250).parse(req.query.search??'');
    const page=z.coerce.number().int().positive().default(1).parse(req.query.page);
    const result=await storage.getContacts({companyId:res.locals.companyId,userId:req.user!.id,contactScope:scope,search,page,limit:25});
    res.json({data:result.contacts.map(contact=>({id:contact.id,name:contact.name,email:contact.email,avatar_url:contact.avatarUrl})),total:result.total});
  }catch(error){next(error);}
});
router.get('/contacts/field-definitions',requireAnyPermission(read),async(req,res,next)=>{
  try {
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    res.json({data:scope?await storage.getCompanyCustomFields(res.locals.companyId,'contact'):[]});
  }catch(error){next(error);}
});
router.get('/contacts/:id',requireAnyPermission(read),async(req,res,next)=>{
 try{
  const companyId=res.locals.companyId,contactId=z.coerce.number().int().positive().parse(req.params.id);
  const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
  if(!scope||!(await storage.getAccessibleContactIds([contactId],{companyId,userId:req.user!.id,contactScope:scope})).includes(contactId))throw new ErpValidationError('Contact not found','not_found');
  const contact=await storage.getContact(contactId);
  if(!contact||contact.companyId!==companyId)throw new ErpValidationError('Contact not found','not_found');
  res.json({data:{id:contact.id,name:contact.name,email:contact.email,customFields:contact.customFields}});
 }catch(error){next(error);}
});
router.post('/contact-roles/:role',requireAnyPermission(['manage_real_estate_owners','manage_real_estate_tenants']),async(req,res,next)=>{
  try {
    const role=roles.parse(req.params.role),value=z.object({contactId:z.number().int().positive()}).strict().parse(req.body);
    const feature=role==='tenant'?'tenants':'owners';
    if(!res.locals.permissions[`manage_real_estate_${feature}`]){res.status(403).json({error:'Permission required'});return;}
    const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
    const allowed=scope?await storage.getAccessibleContactIds([value.contactId],{companyId:res.locals.companyId,userId:req.user!.id,contactScope:scope}):[];
    if(!allowed.length){res.status(404).json({error:'Contact not found'});return;}
    const result=await getPool().query('INSERT INTO real_estate_contact_roles(company_id,contact_id,role) VALUES($1,$2,$3) ON CONFLICT(company_id,contact_id,role) DO UPDATE SET role=EXCLUDED.role RETURNING *',[res.locals.companyId,value.contactId,role]);
    res.status(201).json({data:result.rows[0]});
  }catch(error){next(error);}
});
for(const feature of ['owners','tenants'] as const){
  router.get(`/${feature}/:id`,requireAnyPermission([`view_real_estate_${feature}`,`manage_real_estate_${feature}`]),async(req,res,next)=>{
    try {
      const contactId=z.coerce.number().int().positive().parse(req.params.id),companyId=res.locals.companyId;
      const permissions=res.locals.permissions,scope=resolveContactViewScope(permissions,req.user!.isSuperAdmin===true);
      const allowed=scope?await storage.getAccessibleContactIds([contactId],{companyId,userId:req.user!.id,contactScope:scope}):[];
      if(!allowed.length){res.status(404).json({error:'Contact not found'});return;}
      const role=feature==='owners'?'owner':'tenant';
      const linked=await getPool().query('SELECT 1 FROM real_estate_contact_roles WHERE company_id=$1 AND contact_id=$2 AND role=$3',[companyId,contactId,role]);
      if(!linked.rowCount){res.status(404).json({error:'Contact role not found'});return;}
      const contact=(await getPool().query('SELECT id,name,email,avatar_url,custom_fields FROM contacts WHERE company_id=$1 AND id=$2',[companyId,contactId])).rows[0];
      const financial=permissions.view_real_estate_financials===true;
      const invoiceIds=financial?await accessibleInvoiceIds(req):[];
      const financialQuery=(query:string,args:unknown[])=>{const scoped=scopeRealEstateSettlements(query,args,invoiceIds);return getPool().query(scoped.text,scoped.values);};
      const can=(section:string)=>permissions[`view_real_estate_${section}`]||permissions[`manage_real_estate_${section}`];
      const summary={assets:0,leases:0,openMaintenance:0};
      const {today}=await getErpCompanyCalendar(companyId);
      let currentLeases:any[]=[],activity:any[]=[];
      let visibleLeaseTenants:number[]=[];
      let settlementSummary:any[]=[];
      let assets:any[]=[],leases:any[]=[],maintenance:any[]=[],appointments:any[]=[],settlements:any[]=[];
      if(feature==='owners'){
        if(can('properties')||can('units'))assets=(await getPool().query(`SELECT a.id,a.kind,a.name,a.code,a.status,a.location,a.images${financial?',a.currency,a.rental_price,s.percentage':''}
          FROM real_estate_assets a JOIN real_estate_ownership_versions v ON v.asset_id=a.id AND v.company_id=a.company_id
          JOIN real_estate_ownership_shares s ON s.ownership_version_id=v.id AND s.company_id=v.company_id
          WHERE a.company_id=$1 AND s.contact_id=$2 AND v.effective_from<=$5::date AND (v.effective_to IS NULL OR v.effective_to>=$5::date)
          AND ((a.kind='property' AND $3::boolean) OR (a.kind='unit' AND $4::boolean)) ORDER BY a.name`,[companyId,contactId,!!can('properties'),!!can('units'),today])).rows;
        if(assets.length&&can('leases')){
          const tenantIds=(await getPool().query('SELECT DISTINCT tenant_contact_id FROM real_estate_leases WHERE company_id=$1 AND asset_id=ANY($2::int[])',[companyId,assets.map(asset=>asset.id)])).rows.map(row=>Number(row.tenant_contact_id));
          const visibleTenants=await storage.getAccessibleContactIds(tenantIds,{companyId,userId:req.user!.id,contactScope:scope!});
          visibleLeaseTenants=visibleTenants;
          const args=[companyId,assets.map(asset=>asset.id),visibleTenants];
          summary.leases=(await getPool().query('SELECT count(*)::int total FROM real_estate_leases WHERE company_id=$1 AND asset_id=ANY($2::int[]) AND tenant_contact_id=ANY($3::int[])',args)).rows[0].total;
          leases=(await getPool().query(`SELECT l.id,l.name,l.status,l.start_date::text,l.end_date::text,l.asset_id,l.tenant_contact_id${financial?',l.currency,l.rent_amount,l.deposit_amount':''},a.name asset_name,a.kind
            FROM real_estate_leases l JOIN real_estate_assets a ON a.id=l.asset_id AND a.company_id=l.company_id
            WHERE l.company_id=$1 AND l.asset_id=ANY($2::int[]) AND l.tenant_contact_id=ANY($3::int[]) ORDER BY l.start_date DESC,l.id DESC LIMIT 100`,args)).rows;
        }
        if(financial&&can('owner_settlements')){
          settlements=(await financialQuery('SELECT id,period_key,currency,collected,fees,expenses,payable,paid,status FROM real_estate_settlements WHERE company_id=$1 AND owner_contact_id=$2 ORDER BY period_key DESC LIMIT 50',[companyId,contactId])).rows;
          settlementSummary=(await financialQuery(`SELECT currency,count(*)::int count,sum(collected)::text collected,sum(fees)::text fees,sum(expenses)::text expenses,sum(payable)::text payable,sum(paid)::text paid,sum(payable-paid)::text outstanding
            FROM real_estate_settlements WHERE company_id=$1 AND owner_contact_id=$2 AND status IN('posted','partially_paid','paid') GROUP BY currency ORDER BY currency`,[companyId,contactId])).rows;
        }
      }else if(can('leases')){
        visibleLeaseTenants=[contactId];
        summary.leases=(await getPool().query('SELECT count(*)::int total FROM real_estate_leases WHERE company_id=$1 AND tenant_contact_id=$2',[companyId,contactId])).rows[0].total;
        leases=(await getPool().query(`SELECT l.id,l.name,l.status,l.start_date::text,l.end_date::text,l.asset_id${financial?',l.currency,l.rent_amount,l.deposit_amount':''},a.name asset_name,a.kind
          FROM real_estate_leases l JOIN real_estate_assets a ON a.id=l.asset_id AND a.company_id=l.company_id
          WHERE l.company_id=$1 AND l.tenant_contact_id=$2 ORDER BY l.start_date DESC LIMIT 50`,[companyId,contactId])).rows;
        const assetIds=(await getPool().query('SELECT DISTINCT asset_id FROM real_estate_leases WHERE company_id=$1 AND tenant_contact_id=$2',[companyId,contactId])).rows.map(row=>row.asset_id);
        if(assetIds.length&&(can('properties')||can('units')))assets=(await getPool().query(`SELECT id,kind,name,code,status,location,images${financial?',currency,rental_price':''} FROM real_estate_assets WHERE company_id=$1 AND id=ANY($2::int[]) AND ((kind='property' AND $3::boolean) OR (kind='unit' AND $4::boolean))`,[companyId,assetIds,!!can('properties'),!!can('units')])).rows;
      }
      summary.assets=assets.length;
      if(can('leases')&&visibleLeaseTenants.length){
        currentLeases=(await getPool().query(`SELECT l.id,l.name,l.asset_id,l.start_date::text,l.end_date::text,a.name asset_name,a.kind
          FROM real_estate_leases l JOIN real_estate_assets a ON a.id=l.asset_id AND a.company_id=l.company_id
          WHERE l.company_id=$1 AND l.tenant_contact_id=ANY($2::int[]) AND l.status='active' AND l.start_date<=$3::date AND l.end_date>=$3::date
          AND l.asset_id=ANY($4::int[]) ORDER BY a.name,l.id`,[companyId,visibleLeaseTenants,today,assets.map(asset=>asset.id)])).rows;
      }
      if(assets.length){
        activity=(await getPool().query(`SELECT e.id,e.action,e.created_at,a.id asset_id,a.name asset_name,a.kind
          FROM real_estate_activity e JOIN real_estate_assets a ON a.company_id=e.company_id AND a.id=e.entity_id
          WHERE e.company_id=$1 AND a.id=ANY($2::int[]) AND e.action IN('created','updated','status_changed','ownership_added','ownership_closed')
          AND ((e.entity_type='real_estate_property' AND a.kind='property') OR (e.entity_type='real_estate_unit' AND a.kind='unit'))
          ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,[companyId,assets.map(asset=>asset.id)])).rows;
      }
      if(assets.length&&can('maintenance')){
        summary.openMaintenance=(await getPool().query("SELECT count(*)::int total FROM real_estate_maintenance WHERE company_id=$1 AND asset_id=ANY($2::int[]) AND status NOT IN('completed','cancelled')",[companyId,assets.map(asset=>asset.id)])).rows[0].total;
        maintenance=(await getPool().query('SELECT id,title,asset_id,priority,status,created_at FROM real_estate_maintenance WHERE company_id=$1 AND asset_id=ANY($2::int[]) ORDER BY created_at DESC LIMIT 50',[companyId,assets.map(asset=>asset.id)])).rows;
      }
      if(can('schedule'))appointments=(await getPool().query(`SELECT a.id,a.title,a.scheduled_at,a.duration_minutes,a.status,e.appointment_type,e.asset_id FROM contact_appointments a JOIN real_estate_appointments e ON e.appointment_id=a.id AND e.company_id=a.company_id WHERE a.company_id=$1 AND a.contact_id=$2 ORDER BY a.scheduled_at DESC LIMIT 50`,[companyId,contactId])).rows;
      const receivables=financial&&can('rent_collection')&&feature==='tenants'?(await financialQuery(`SELECT i.id,i.invoice_number,i.currency,i.total_amount,i.amount_paid,i.amount_due,i.due_date,i.status,s.source_type
        FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
        WHERE i.company_id=$1 AND i.contact_id=$2 AND s.source_type IN('rent','security_deposit') AND i.status IN('sent','partially_paid','paid','overdue') ORDER BY i.due_date DESC,i.id DESC LIMIT 100`,[companyId,contactId])).rows:[];
      const payments=receivables.length?(await financialQuery(`SELECT p.id,p.amount,p.payment_date,p.payment_method,p.reference_number,i.invoice_number,i.currency FROM invoice_payments p
        JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id
        JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
        WHERE p.company_id=$1 AND i.contact_id=$2 AND s.source_type IN('rent','security_deposit') AND i.status IN('sent','partially_paid','paid','overdue') ORDER BY p.payment_date DESC,p.id DESC LIMIT 100`,[companyId,contactId])).rows:[];
      const expenses=financial&&can('expenses')&&feature==='owners'&&assets.length?(await getPool().query('SELECT id,title,expense_date,currency,amount,status,owner_chargeable FROM real_estate_expenses WHERE company_id=$1 AND asset_id=ANY($2::int[]) ORDER BY expense_date DESC LIMIT 100',[companyId,assets.map(a=>a.id)])).rows:[];
      const documents=can('documents')?(await getPool().query(`SELECT d.id,d.name,d.category,d.entity_type FROM real_estate_documents d WHERE d.company_id=$1 AND (
        (d.entity_type='property' AND d.entity_id=ANY($2::int[])) OR (d.entity_type='unit' AND d.entity_id=ANY($3::int[]))
        OR (d.entity_type='lease' AND d.entity_id=ANY($4::int[]))) ORDER BY d.created_at DESC LIMIT 100`,[companyId,assets.filter(a=>a.kind==='property').map(a=>a.id),assets.filter(a=>a.kind==='unit').map(a=>a.id),leases.map(l=>l.id)])).rows:[];
      res.json({contact,assets,leases,maintenance,appointments,settlements,receivables,payments,expenses,documents,summary,settlementSummary,currentLeases,activity,asOf:today});
    }catch(error){next(error);}
  });
}
export default router;
