import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { storage,ErpValidationError } from '../../storage';
import { requireAnyPermission } from '../../middleware';
import { resolveContactViewScope } from '@shared/contact-access';
import { createLeaseReceivable } from '../../services/erp/real-estate-receivables';
import { getEnabledErpPaymentMethods } from '../../services/erp-payment-gateway-service';
import { assertErpPaymentMethodAllowed } from '../../services/erp-invoice-payment-options-service';
import { getInvoicePaymentOptions } from '../../services/erp-invoice-checkout-service';
import { notifyInvoicePaymentStatusChange } from '../../services/erp-invoice-notification-service';
import {scopeRealEstateReportInvoices} from '../../services/erp/real-estate-report-invoice-scope';
import {accessibleInvoiceIds,loadAccessibleInvoice} from '../../services/erp/invoice-access';

const router=Router(),id=z.coerce.number().int().positive();
async function assertContact(req:any,res:any,contactId:number){
 const scope=resolveContactViewScope(res.locals.permissions,req.user.isSuperAdmin===true);
 const allowed=scope?await storage.getAccessibleContactIds([contactId],{companyId:res.locals.companyId,userId:req.user.id,contactScope:scope}):[];
 if(!allowed.length)throw new ErpValidationError('Receivable not found','not_found');
}
router.get('/rent-collection',requireAnyPermission(['view_real_estate_rent_collection','manage_real_estate_rent_collection']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
 try{
  const companyId=res.locals.companyId;
  const invoiceIds=await accessibleInvoiceIds(req),invoiceQuery=(query:string,args:unknown[])=>{const scoped=scopeRealEstateReportInvoices(query,args,invoiceIds);return getPool().query(scoped.text,scoped.values);};
  const value=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
  const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true);
  const contactIds=(await invoiceQuery("SELECT DISTINCT i.contact_id FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id WHERE i.company_id=$1 AND s.source_type IN('rent','security_deposit')",[companyId])).rows.map(row=>row.contact_id);
  const allowed=scope?await storage.getAccessibleContactIds(contactIds,{companyId,userId:req.user!.id,contactScope:scope}):[];
  const rows=(await invoiceQuery(`SELECT i.id,i.invoice_number,i.contact_id,i.currency,i.currency_decimal_places,i.total_amount,i.amount_paid,i.amount_due,i.issue_date,i.due_date,i.status,i.payment_token,
    s.source_type,s.source_id,s.period_key,a.name asset_name,a.kind asset_kind,c.name contact_name FROM invoices i
    JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
    LEFT JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id
    JOIN contacts c ON c.id=i.contact_id AND c.company_id=i.company_id
    WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND s.source_type IN('rent','security_deposit') ORDER BY i.due_date DESC,i.id DESC LIMIT $3 OFFSET $4`,[companyId,allowed,value.limit,value.offset])).rows;
  const count=(await invoiceQuery("SELECT count(*)::int total FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND s.source_type IN('rent','security_deposit')",[companyId,allowed])).rows[0].total;
  const methods=await getEnabledErpPaymentMethods(companyId);
  for(const row of rows){
   row.checkout_options=[];
   if(row.payment_token&&['sent','overdue','partially_paid'].includes(row.status)&&Number(row.amount_due)>0){
    const invoice=await loadAccessibleInvoice(req,row.id);
    if(invoice)row.checkout_options=await getInvoicePaymentOptions(invoice,'');
   }
   const assetFeature=row.asset_kind==='unit'?'units':'properties';
   if(!res.locals.permissions[`view_real_estate_${assetFeature}`]&&!res.locals.permissions[`manage_real_estate_${assetFeature}`])delete row.asset_name;
  }
  res.json({data:rows,total:count,paymentMethods:methods});
 }catch(error){next(error);}
});
router.get('/billing-context',requireAnyPermission(['manage_real_estate_leases','manage_real_estate_rent_collection','manage_real_estate_reservations','manage_real_estate_payment_plans']),requireAnyPermission(['view_real_estate_financials']),async(_req,res,next)=>{
 try{
  const companyId=res.locals.companyId;
  const items=(await getPool().query("SELECT id,name,type FROM products WHERE company_id=$1 AND status='active' ORDER BY name LIMIT 500",[companyId])).rows;
  const accounts=(await getPool().query("SELECT id,name,account_code,type FROM chart_of_accounts WHERE company_id=$1 AND is_active=true AND type IN('revenue','liability') ORDER BY account_code",[companyId])).rows;
  const taxGroups=(await getPool().query('SELECT id,name FROM tax_groups WHERE company_id=$1 AND is_active=true ORDER BY name',[companyId])).rows;res.json({items,accounts,taxGroups});
 }catch(error){next(error);}
});
router.post('/leases/:id/receivables',requireAnyPermission(['manage_real_estate_rent_collection']),requireAnyPermission(['manage_invoices']),requireAnyPermission(['view_real_estate_financials']),requireAnyPermission(['view_real_estate_leases','manage_real_estate_leases']),async(req,res,next)=>{
 try{
  const leaseId=id.parse(req.params.id),companyId=res.locals.companyId;
  const lease=(await getPool().query('SELECT l.tenant_contact_id,a.kind FROM real_estate_leases l JOIN real_estate_assets a ON a.company_id=l.company_id AND a.id=l.asset_id WHERE l.company_id=$1 AND l.id=$2',[companyId,leaseId])).rows[0];
  if(!lease){res.status(404).json({error:'Lease not found'});return;}
  await assertContact(req,res,lease.tenant_contact_id);
  const assetFeature=lease.kind==='unit'?'units':'properties';
  if(!res.locals.permissions[`view_real_estate_${assetFeature}`]&&!res.locals.permissions[`manage_real_estate_${assetFeature}`]){res.status(404).json({error:'Lease not found'});return;}
  const value=z.object({periodKey:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),sourceType:z.enum(['rent','security_deposit'])}).strict().parse(req.body);
  const invoice=await createLeaseReceivable(companyId,req.user!.id,leaseId,value.periodKey,value.sourceType,invoiceId=>loadAccessibleInvoice(req,invoiceId,'manage'));
  res.status(201).json({data:invoice});
 }catch(error){next(error);}
});
router.post('/rent-collection/:id/send',requireAnyPermission(['manage_real_estate_rent_collection']),requireAnyPermission(['manage_invoices']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
 try{
  const invoiceId=id.parse(req.params.id),companyId=res.locals.companyId;
  const source=await getPool().query("SELECT 1 FROM real_estate_invoice_sources WHERE company_id=$1 AND invoice_id=$2 AND source_type IN('rent','security_deposit')",[companyId,invoiceId]);
  const invoice=await loadAccessibleInvoice(req,invoiceId,'manage');
  if(!source.rowCount||!invoice||invoice.companyId!==companyId||!invoice.contactId){res.status(404).json({error:'Invoice not found'});return;}
  await assertContact(req,res,invoice.contactId);
  res.json({data:await storage.sendInvoice(invoiceId,companyId,req.user!.id)});
 }catch(error){next(error);}
});
router.post('/rent-collection/:id/payments',requireAnyPermission(['record_real_estate_payments']),requireAnyPermission(['manage_invoices','record_payments']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
 try{
  const invoiceId=id.parse(req.params.id),companyId=res.locals.companyId;
  const source=await getPool().query("SELECT 1 FROM real_estate_invoice_sources WHERE company_id=$1 AND invoice_id=$2 AND source_type IN('rent','security_deposit')",[companyId,invoiceId]);
  const invoice=await loadAccessibleInvoice(req,invoiceId,'payment');
  if(!source.rowCount||!invoice||invoice.companyId!==companyId||!invoice.contactId){res.status(404).json({error:'Invoice not found'});return;}
  await assertContact(req,res,invoice.contactId);
  const value=z.object({amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/),paymentMethod:z.enum(['cash','check','credit_card','debit_card','bank_transfer','other']),referenceNumber:z.string().max(250).optional(),notes:z.string().max(2000).optional()}).strict().parse(req.body);
  await assertErpPaymentMethodAllowed(companyId,value.paymentMethod);
  const payment=await storage.recordInvoicePayment({...value,companyId,invoiceId,recordedBy:req.user!.id,paymentDate:new Date()});
  void notifyInvoicePaymentStatusChange(invoiceId);
  res.status(201).json({data:payment});
 }catch(error){next(error);}
});
export default router;
