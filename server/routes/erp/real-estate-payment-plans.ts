import {requireRealEstateInvoiceEvidence} from '../../services/erp/real-estate-invoice-evidence-access';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {erpMinorUnits} from '../../../shared/erp-carrying-amount';
import {roundErpDecimal,sumErpDecimals} from '../../services/erp/decimal-math';
import {calendarDateToDate} from '../../../shared/date-format';
import {isInvoiceFinanciallyResolved} from '../../services/erp/invoice-resolution';
import {loadAccessibleInvoice} from '../../services/erp/invoice-access';
import {Router} from 'express';
import {z} from 'zod';
import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';
import {requireAnyPermission} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {realEstatePaymentPlanSchema} from '../../../shared/real-estate-sales';
import {validateAndNormalizeCustomFieldValues,validateCustomFieldRecordValues} from '../../utils/product-custom-field-values';
import {calculateTax} from '../../services/erp/tax-service';
import {getInvoicePaymentOptions} from '../../services/erp-invoice-checkout-service';
const router=Router(),id=z.coerce.number().int().positive(),read=['view_real_estate_payment_plans','manage_real_estate_payment_plans'];
async function currencyDigits(client:any,companyId:number,code:string){const row=(await client.query('SELECT decimal_places FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[companyId,code])).rows[0];if(!row)throw new ErpValidationError('Select an active ERP currency');return erpCurrencyDigits(row.decimal_places);}

async function contacts(req:any,res:any,ids:number[]){const scope=resolveContactViewScope(res.locals.permissions,req.user.isSuperAdmin===true);return scope?storage.getAccessibleContactIds(ids,{companyId:res.locals.companyId,userId:req.user.id,contactScope:scope}):[];}
router.use('/payment-plans',requireAnyPermission(read),requireAnyPermission(['view_real_estate_financials']));
router.get('/payment-plans',async(req,res,next)=>{try{
 const c=res.locals.companyId,f=z.object({search:z.string().max(250).default(''),limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query),ids=(await getPool().query('SELECT DISTINCT buyer_contact_id FROM real_estate_sale_agreements WHERE company_id=$1',[c])).rows.map(r=>r.buyer_contact_id),allowed=await contacts(req,res,ids);
 const join='FROM real_estate_payment_plans p JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id JOIN contacts c ON c.id=s.buyer_contact_id AND c.company_id=s.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id',where='p.company_id=$1 AND s.buyer_contact_id=ANY($2::int[]) AND p.name ILIKE $3',args=[c,allowed,`%${f.search}%`];
 const total=(await getPool().query(`SELECT count(*)::int total ${join} WHERE ${where}`,args)).rows[0].total,data=(await getPool().query(`SELECT p.*,s.sale_amount,s.status sale_status,s.terms,c.name buyer_name,a.name asset_name,a.kind ${join} WHERE ${where} ORDER BY p.updated_at DESC,p.id DESC LIMIT $4 OFFSET $5`,[...args,f.limit,f.offset])).rows;
 data.forEach(r=>{if(!res.locals.permissions[`view_real_estate_${r.kind==='unit'?'units':'properties'}`]&&!res.locals.permissions[`manage_real_estate_${r.kind==='unit'?'units':'properties'}`])delete r.asset_name;});res.json({data,total});
}catch(e){next(e);}});
router.get('/payment-plans/:id',async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),row=(await getPool().query('SELECT p.*,s.sale_amount,s.status sale_status,s.buyer_contact_id,s.asset_id,s.terms,c.name buyer_name,c.custom_fields contact_custom_fields,a.name asset_name,a.kind FROM real_estate_payment_plans p JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id JOIN contacts c ON c.id=s.buyer_contact_id AND c.company_id=s.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id WHERE p.company_id=$1 AND p.id=$2',[c,recordId])).rows[0];
 if(!row||!(await contacts(req,res,[row.buyer_contact_id])).length)throw new ErpValidationError('Payment plan not found','not_found');if(!res.locals.permissions[`view_real_estate_${row.kind==='unit'?'units':'properties'}`]&&!res.locals.permissions[`manage_real_estate_${row.kind==='unit'?'units':'properties'}`]){delete row.asset_id;delete row.asset_name;}
 const invoiceRead=!!(res.locals.permissions.view_invoices||res.locals.permissions.manage_invoices);
 const installments=(await getPool().query("SELECT n.id,n.label,n.due_date::text,n.amount,n.milestone,n.invoice_id,i.currency_decimal_places,i.invoice_number,i.status invoice_status,i.amount_paid,i.amount_due,COALESCE((SELECT sum(a.amount) FROM erp_credit_note_allocations a WHERE a.company_id=i.company_id AND a.target_invoice_id=i.id AND a.status='posted'),0)::text allocated_amount FROM real_estate_installments n LEFT JOIN invoices i ON i.id=n.invoice_id AND i.company_id=n.company_id WHERE n.company_id=$1 AND n.payment_plan_id=$2 ORDER BY n.due_date,n.id",[c,recordId])).rows;
 for(const n of installments){n.checkoutOptions=[];if(n.invoice_id){const invoice=invoiceRead?await loadAccessibleInvoice(req,n.invoice_id):undefined;if(!invoice){n.billingUnavailable=true;for(const field of ['invoice_id','currency_decimal_places','invoice_number','invoice_status','amount_paid','amount_due','allocated_amount'])delete n[field];}else if(Number(n.amount_due)>0&&['sent','overdue','partially_paid'].includes(n.invoice_status))n.checkoutOptions=await getInvoicePaymentOptions(invoice,'');}}
 const depositCredits=(res.locals.permissions.view_real_estate_reservations||res.locals.permissions.manage_real_estate_reservations)?(await getPool().query("SELECT n.id,n.invoice_number,n.currency,n.total_amount,n.amount_due,n.status FROM invoices n JOIN real_estate_invoice_sources x ON x.invoice_id=n.parent_invoice_id AND x.company_id=n.company_id JOIN real_estate_sale_agreements s ON s.reservation_id=x.source_id AND s.company_id=x.company_id JOIN real_estate_payment_plans p ON p.sale_agreement_id=s.id AND p.company_id=s.company_id WHERE p.company_id=$1 AND p.id=$2 AND x.source_type='reservation_deposit' AND n.type='credit_note' AND n.status IN('sent','overdue','partially_paid','paid') ORDER BY n.id",[c,recordId])).rows:[];
 const authorizedCredits=[];for(const credit of depositCredits)if(invoiceRead&&await loadAccessibleInvoice(req,credit.id))authorizedCredits.push(credit);
 res.json({data:row,installments,depositCredits:authorizedCredits,activity:(await getPool().query("SELECT action,created_at FROM real_estate_activity WHERE company_id=$1 AND entity_type='real_estate_payment_plan' AND entity_id=$2 ORDER BY created_at DESC LIMIT 50",[c,recordId])).rows});
}catch(e){next(e);}});
router.post('/payment-plans',requireAnyPermission(['manage_real_estate_payment_plans']),requireAnyPermission(['manage_real_estate_reservations']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,v=realEstatePaymentPlanSchema.parse(req.body);await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78128,$1)',[c]);
 const r=(await client.query('SELECT * FROM real_estate_reservations WHERE company_id=$1 AND id=$2 FOR UPDATE',[c,v.reservationId])).rows[0];if(!r||!(await contacts(req,res,[r.buyer_contact_id])).length)throw new ErpValidationError('Reservation not found','not_found');if(r.version!==v.reservationVersion)throw new ErpValidationError('Reservation changed. Reload before conversion.','version_conflict');if(!['held','confirmed'].includes(r.status)||new Date(r.expires_at)<=new Date())throw new ErpValidationError('An unexpired reservation is required');
 const asset=(await client.query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[c,r.asset_id])).rows[0];if(!asset||!res.locals.permissions[`manage_real_estate_${asset.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');if(asset.status!=='reserved')throw new ErpValidationError('The reserved inventory is no longer available');
 const digits=await currencyDigits(client,c,r.currency);erpMinorUnits(v.saleAmount,digits);for(const n of v.installments)erpMinorUnits(n.amount,digits);
 if(!(await client.query("SELECT 1 FROM chart_of_accounts WHERE company_id=$1 AND id=$2 AND type='liability' AND is_active=true",[c,v.advanceAccountId])).rowCount)throw new ErpValidationError('Select an active ERP advance liability account');
 const item=await storage.getProduct(v.catalogItemId);if(!item||item.companyId!==c||item.status!=='active')throw new ErpValidationError('Select an active ERP Catalog billing item');
 const saleTaxGroupId=v.taxGroupId??null;
 if(saleTaxGroupId&&(item.isTaxable===false||!(await client.query('SELECT 1 FROM tax_groups WHERE company_id=$1 AND id=$2 AND is_active=true',[c,saleTaxGroupId])).rowCount))throw new ErpValidationError('Select an active ERP tax group for a taxable Catalog billing item');
 const installmentTaxes=[];for(const n of v.installments){const tax=saleTaxGroupId?await calculateTax(c,n.amount,saleTaxGroupId,undefined,{productType:item.type,decimalPlaces:digits}):{taxAmount:'0.00',effectiveRate:'0.00'};installmentTaxes.push({label:n.label,amount:n.amount,taxAmount:tax.taxAmount,currencyDecimalPlaces:digits});}
 // Fully credit the deposit obligation before billing full sale consideration.
 // Its remaining collected credit can then settle issued installments through
 // the shared ERP allocation workspace, retaining the original cash history.
 const deposits=(await client.query("SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='reservation_deposit' AND source_id=$2",[c,r.id])).rows;await requireRealEstateInvoiceEvidence(req,client,c,deposits.map(d=>d.invoice_id));for(const deposit of deposits)if(!await isInvoiceFinanciallyResolved(client,c,deposit.invoice_id,true))throw new ErpValidationError('Fully credit the collected reservation deposit through ERP before creating installments; apply the remaining credit to issued installments');
 const custom=validateAndNormalizeCustomFieldValues(await storage.getProductCustomFieldDefinitions(c,'real_estate_payment_plan'),v.customFields,{mode:'create'}),saleCustom=validateAndNormalizeCustomFieldValues(await storage.getProductCustomFieldDefinitions(c,'real_estate_sale_agreement'),v.saleCustomFields,{mode:'create'});
 const sale=(await client.query("INSERT INTO real_estate_sale_agreements(company_id,asset_id,buyer_contact_id,reservation_id,status,currency,sale_amount,finalized_at,terms,custom_fields,created_by)VALUES($1,$2,$3,$4,'finalized',$5,$6,now(),$7,$8,$9)RETURNING id",[c,r.asset_id,r.buyer_contact_id,r.id,r.currency,v.saleAmount,JSON.stringify({catalogItemId:v.catalogItemId,advanceAccountId:v.advanceAccountId,taxGroupId:saleTaxGroupId,installmentTaxes,currencyDecimalPlaces:digits}),JSON.stringify(saleCustom),req.user!.id])).rows[0];
 const plan=(await client.query("INSERT INTO real_estate_payment_plans(company_id,sale_agreement_id,name,currency,status,custom_fields,created_by)VALUES($1,$2,$3,$4,'active',$5,$6)RETURNING *",[c,sale.id,v.name,r.currency,JSON.stringify(custom),req.user!.id])).rows[0];
 for(const n of v.installments)await client.query('INSERT INTO real_estate_installments(company_id,payment_plan_id,label,due_date,amount,milestone)VALUES($1,$2,$3,$4,$5,$6)',[c,plan.id,n.label,n.dueDate,n.amount,n.milestone??null]);
 await client.query("UPDATE real_estate_reservations SET status='converted',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[c,r.id]);await client.query("UPDATE real_estate_assets SET status='sold',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[c,r.asset_id]);
 await client.query("UPDATE real_estate_jobs SET status='completed',completed_at=now() WHERE company_id=$1 AND source_key=$2",[c,`reservation_expiry:${r.id}`]);
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_payment_plan',$2,'created',$3,$4)",[c,plan.id,req.user!.id,JSON.stringify({saleAgreementId:sale.id,reservationId:r.id})]);await client.query('COMMIT');res.status(201).json({data:plan});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.post('/payment-plans/:id/cancel',requireAnyPermission(['manage_real_estate_payment_plans']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,planId=id.parse(req.params.id),v=z.object({version:z.number().int().positive(),reason:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78128,$1)',[c]);
 const p=(await client.query('SELECT p.*,s.buyer_contact_id,s.asset_id,s.id sale_id,s.status sale_status,a.kind FROM real_estate_payment_plans p JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id WHERE p.company_id=$1 AND p.id=$2 FOR UPDATE OF p,s,a',[c,planId])).rows[0];
 if(!p||!(await contacts(req,res,[p.buyer_contact_id])).length)throw new ErpValidationError('Payment plan not found','not_found');
 if(!res.locals.permissions[`manage_real_estate_${p.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 const linked=(await client.query("SELECT invoice_id FROM real_estate_installments WHERE company_id=$1 AND payment_plan_id=$2 AND invoice_id IS NOT NULL UNION SELECT x.invoice_id FROM real_estate_invoice_sources x JOIN real_estate_installments n ON n.id=x.source_id AND n.company_id=x.company_id WHERE n.company_id=$1 AND n.payment_plan_id=$2 AND x.source_type='installment'",[c,planId])).rows;await requireRealEstateInvoiceEvidence(req,client,c,linked.map(i=>i.invoice_id));
 if(p.status==='cancelled'){await client.query('COMMIT');res.json({data:p});return;}
 if(p.version!==v.version)throw new ErpValidationError('Plan changed. Reload before cancellation.','version_conflict');
 if(p.status!=='active'||p.sale_status!=='finalized')throw new ErpValidationError('A finalized undelivered sale is required');
 if((await client.query("SELECT 1 FROM real_estate_installments n JOIN real_estate_invoice_sources x ON x.company_id=n.company_id AND x.source_type='installment' AND x.source_id=n.id JOIN invoices i ON i.id=x.invoice_id AND i.company_id=x.company_id WHERE n.company_id=$1 AND n.payment_plan_id=$2 AND (i.status NOT IN('cancelled','void') OR i.amount_paid>0) LIMIT 1",[c,planId])).rowCount)throw new ErpValidationError('Resolve all installment invoices and refunds through ERP before cancelling the sale');
 const row=(await client.query("UPDATE real_estate_payment_plans SET status='cancelled',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING *",[c,planId])).rows[0];
 await client.query("UPDATE real_estate_sale_agreements SET status='cancelled',version=version+1,updated_at=now(),terms=terms||$3::jsonb WHERE company_id=$1 AND id=$2",[c,p.sale_id,JSON.stringify({cancellationReason:v.reason})]);
 await client.query("UPDATE real_estate_assets SET status='available',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 AND status='sold' AND NOT EXISTS(SELECT 1 FROM real_estate_sale_agreements s WHERE s.company_id=$1 AND s.asset_id=$2 AND s.status IN('finalized','handed_over'))",[c,p.asset_id]);
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_payment_plan',$2,'cancelled',$3,$4)",[c,planId,req.user!.id,JSON.stringify({reason:v.reason})]);await client.query('COMMIT');res.json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.patch('/payment-plans/:id',requireAnyPermission(['manage_real_estate_payment_plans']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,planId=id.parse(req.params.id),v=z.object({version:z.number().int().positive(),name:z.string().trim().min(1).max(250),customFields:z.record(z.unknown()),installments:z.array(z.object({id:id,label:z.string().trim().min(1).max(250),dueDate:z.string().date(),amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0),milestone:z.string().max(250).nullable()})).min(1).max(120)}).strict().parse(req.body);
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78128,$1)',[c]);
 const plan=(await client.query('SELECT p.*,s.sale_amount,s.buyer_contact_id,s.terms sale_terms,a.kind FROM real_estate_payment_plans p JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id WHERE p.company_id=$1 AND p.id=$2 FOR UPDATE OF p,s',[c,planId])).rows[0];
 if(!plan||!(await contacts(req,res,[plan.buyer_contact_id])).length)throw new ErpValidationError('Payment plan not found','not_found');
 if(!res.locals.permissions[`manage_real_estate_${plan.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 if(plan.status!=='active')throw new ErpValidationError('Only active plans can be edited');if(plan.version!==v.version)throw new ErpValidationError('Plan changed. Reload before saving.','version_conflict');
 const current=(await client.query('SELECT *,due_date::text date_key FROM real_estate_installments WHERE company_id=$1 AND payment_plan_id=$2 FOR UPDATE',[c,planId])).rows;
 await requireRealEstateInvoiceEvidence(req,client,c,current.filter(n=>n.invoice_id).map(n=>n.invoice_id));
 if(current.length!==v.installments.length||new Set(v.installments.map(n=>n.id)).size!==current.length||v.installments.some(n=>!current.some(o=>o.id===n.id)))throw new ErpValidationError('The installment set changed. Reload before saving.');
 if(v.installments.reduce((sum,n)=>sum+erpMinorUnits(n.amount,6),0n)!==erpMinorUnits(String(plan.sale_amount),6))throw new ErpValidationError('Installments must total the sale amount');
 const hasUnbilled=current.some(n=>!n.invoice_id);const digits=hasUnbilled?await currencyDigits(client,c,plan.currency):null;if(digits!==null)for(const n of v.installments){if(!current.find(o=>o.id===n.id)?.invoice_id)erpMinorUnits(n.amount,digits);}
 for(const n of v.installments){const old=current.find(o=>o.id===n.id);if(old.invoice_id&&(old.label!==n.label||old.date_key!==n.dueDate||erpMinorUnits(String(old.amount),6)!==erpMinorUnits(n.amount,6)||(old.milestone||null)!==(n.milestone||null)))throw new ErpValidationError('Billed installment terms are fixed. Use ERP corrections.');if(!old.invoice_id)await client.query('UPDATE real_estate_installments SET label=$3,due_date=$4,amount=$5,milestone=$6 WHERE company_id=$1 AND id=$2',[c,n.id,n.label,n.dueDate,n.amount,n.milestone]);}
 const taxSnapshots=[];
 const hasUnbilledTax=current.some(n=>!n.invoice_id)&&!!plan.sale_terms?.taxGroupId;
 const billingItem=hasUnbilledTax?await storage.getProduct(plan.sale_terms.catalogItemId):null;
 if(hasUnbilledTax&&(!billingItem||billingItem.companyId!==c||billingItem.status!=='active'||billingItem.isTaxable===false))throw new ErpValidationError('Select an active company taxable ERP Catalog billing item before reviewing unbilled tax');
 for(const n of v.installments){
  const old=current.find(o=>o.id===n.id);
  let taxAmount:string;let retainedDigits:number|null=null;
  if(old.invoice_id){
   // Issued financial evidence is authoritative even when an old sale preview
   // is absent. Never rewrite billed tax from today's mutable Catalog/rules.
   const invoice=(await client.query("SELECT i.tax_amount,i.currency_decimal_places FROM invoices i JOIN real_estate_invoice_sources x ON x.invoice_id=i.id AND x.company_id=i.company_id AND x.source_type='installment' AND x.source_id=$3 WHERE i.company_id=$1 AND i.id=$2 FOR SHARE OF i",[c,old.invoice_id,old.id])).rows[0];
   if(!invoice||invoice.tax_amount==null||!/^\d+(\.\d+)?$/.test(String(invoice.tax_amount)))throw new ErpValidationError('Billed installment ERP tax evidence is unavailable. Review the linked invoice before editing.');
   taxAmount=String(invoice.tax_amount);retainedDigits=erpCurrencyDigits(invoice.currency_decimal_places);
  }else{
   taxAmount=plan.sale_terms?.taxGroupId?(await calculateTax(c,n.amount,plan.sale_terms.taxGroupId,undefined,{productType:billingItem!.type,decimalPlaces:digits!})).taxAmount:'0.00';
  }
  taxSnapshots.push({label:n.label,amount:n.amount,taxAmount,currencyDecimalPlaces:old.invoice_id?retainedDigits:digits});
 }
 await client.query('UPDATE real_estate_sale_agreements SET terms=terms||$3::jsonb WHERE company_id=$1 AND id=$2',[c,plan.sale_agreement_id,JSON.stringify({installmentTaxes:taxSnapshots,...(digits!==null?{currencyDecimalPlaces:digits}:{})})]);
 const definitions=await storage.getProductCustomFieldDefinitions(c,'real_estate_payment_plan');
 const custom=validateCustomFieldRecordValues(definitions,v.customFields,plan.custom_fields??{});
 const row=(await client.query('UPDATE real_estate_payment_plans SET name=$3,custom_fields=$4,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING *',[c,planId,v.name,JSON.stringify(custom)])).rows[0];
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id)VALUES($1,'real_estate_payment_plan',$2,'updated',$3)",[c,planId,req.user!.id]);await client.query('COMMIT');res.json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.post('/payment-plans/:id/installments/:installmentId/invoice',requireAnyPermission(['manage_real_estate_payment_plans']),requireAnyPermission(['manage_invoices']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,planId=id.parse(req.params.id),nId=id.parse(req.params.installmentId);await client.query('SELECT pg_advisory_lock(78128,$1)',[c]);await client.query('BEGIN');
 const n=(await client.query('SELECT n.*,n.due_date::text due_date_key,p.status plan_status,s.status sale_status,s.buyer_contact_id,s.asset_id,s.currency,s.terms,a.kind FROM real_estate_installments n JOIN real_estate_payment_plans p ON p.id=n.payment_plan_id AND p.company_id=n.company_id JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id WHERE n.company_id=$1 AND n.payment_plan_id=$2 AND n.id=$3 FOR UPDATE OF n',[c,planId,nId])).rows[0];
 if(!n||!(await contacts(req,res,[n.buyer_contact_id])).length)throw new ErpValidationError('Installment not found','not_found');if(!res.locals.permissions[`manage_real_estate_${n.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');if(n.plan_status!=='active'||n.sale_status!=='finalized')throw new ErpValidationError('An active finalized sale is required');
 const source=(await client.query("SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='installment' AND source_id=$2",[c,nId])).rows[0];let invoice=source?await loadAccessibleInvoice(req,source.invoice_id,'manage'):null;
 if(source&&!invoice)throw new ErpValidationError('Installment invoice not found','not_found');
 if(!invoice){const product=await storage.getProduct(n.terms.catalogItemId);if(!product||product.companyId!==c||product.status!=='active')throw new ErpValidationError('The ERP Catalog billing item is inactive');const digits=await currencyDigits(client,c,n.currency);erpMinorUnits(String(n.amount),digits);const taxGroupId=n.terms.taxGroupId??null;
 if(taxGroupId&&(product.isTaxable===false||!(await client.query('SELECT 1 FROM tax_groups WHERE company_id=$1 AND id=$2 AND is_active=true',[c,taxGroupId])).rowCount))throw new ErpValidationError('The sale ERP tax group is inactive or the Catalog item is no longer taxable');
 const issueDate=new Date(),dueDate=calendarDateToDate(n.due_date_key);
 const netAmount=roundErpDecimal(String(n.amount),digits);
 const tax=taxGroupId?await calculateTax(c,netAmount,taxGroupId,undefined,{asOf:issueDate,productType:product.type,decimalPlaces:digits}):{taxAmount:'0.00',effectiveRate:'0.00'};
 const expectedTax=n.terms.installmentTaxes?.find((t:any)=>t.label===n.label&&erpMinorUnits(String(t.amount),6)===erpMinorUnits(String(n.amount),6));
 if(expectedTax&&((expectedTax.currencyDecimalPlaces!=null&&erpCurrencyDigits(expectedTax.currencyDecimalPlaces)!==digits)||erpMinorUnits(String(expectedTax.taxAmount),6)!==erpMinorUnits(tax.taxAmount,6)))throw new ErpValidationError('ERP tax rules changed since the sale terms were approved. Review the unbilled plan before invoicing.');
 const total=sumErpDecimals([netAmount,tax.taxAmount],digits);
 const description=`Installment / ${n.label}`;invoice=await storage.createDraftInvoiceWithLineItemsAtomic({companyId:c,contactId:n.buyer_contact_id,invoiceNumber:'',type:'sales_invoice',status:'draft',issueDate,dueDate,currency:n.currency,subtotal:n.amount,taxAmount:tax.taxAmount,totalAmount:total,amountPaid:'0',amountDue:total,createdBy:req.user!.id,notes:description},[{productId:n.terms.catalogItemId,description,quantity:'1',unitPrice:n.amount,discountType:'percentage',discountValue:'0',taxRate:tax.effectiveRate,taxGroupId,sortOrder:0}],{recalculateTotalsFromLines:true,postingContext:{netAccountId:n.terms.advanceAccountId,treatment:'advance',description},source:{sourceType:'installment',sourceId:nId,periodKey:'installment',assetId:n.asset_id,accountingContext:{paymentPlanId:planId,dueDate:n.due_date_key,advanceAccountId:n.terms.advanceAccountId,taxGroupId,taxAmount:tax.taxAmount,netAmount,currencyDecimalPlaces:digits}}});}
 if(!await loadAccessibleInvoice(req,invoice!.id,'manage'))throw new ErpValidationError('Installment invoice not found','not_found');
 await client.query('UPDATE real_estate_installments SET invoice_id=$3 WHERE company_id=$1 AND id=$2',[c,nId,invoice!.id]);await client.query('COMMIT');res.json({data:invoice});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{await client.query('SELECT pg_advisory_unlock(78128,$1)',[res.locals.companyId]).catch(()=>{});client.release();}
});
router.post('/payment-plans/:id/installments/:installmentId/send',requireAnyPermission(['manage_real_estate_payment_plans']),requireAnyPermission(['manage_invoices']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{
 const client=await getPool().connect();const c=res.locals.companyId;
 try{
  await client.query('SELECT pg_advisory_lock(78128,$1)',[c]);await client.query('BEGIN');
  const n=(await client.query(`SELECT n.invoice_id,p.status plan_status,s.status sale_status,s.buyer_contact_id,a.kind
   FROM real_estate_installments n JOIN real_estate_payment_plans p ON p.id=n.payment_plan_id AND p.company_id=n.company_id
   JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id
   JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id
   WHERE n.company_id=$1 AND n.payment_plan_id=$2 AND n.id=$3 FOR UPDATE OF p,s,n`,[c,id.parse(req.params.id),id.parse(req.params.installmentId)])).rows[0];
  if(!n?.invoice_id||!(await contacts(req,res,[n.buyer_contact_id])).length)throw new ErpValidationError('Installment invoice not found','not_found');
  if(!res.locals.permissions[`manage_real_estate_${n.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
  if(n.plan_status!=='active'||n.sale_status!=='finalized')throw new ErpValidationError('An active finalized sale is required');
  if(!await loadAccessibleInvoice(req,n.invoice_id,'manage'))throw new ErpValidationError('Installment invoice not found','not_found');
  const invoice=await storage.sendInvoice(n.invoice_id,c,req.user!.id);
  await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_payment_plan',$2,'invoice_issued',$3,$4)",[c,id.parse(req.params.id),req.user!.id,JSON.stringify({invoiceId:invoice.id})]);
  await client.query('COMMIT');res.json({data:invoice});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{await client.query('SELECT pg_advisory_unlock(78128,$1)',[c]).catch(()=>{});client.release();}
});
router.get('/payment-plan-handover-context',requireAnyPermission(['manage_real_estate_payment_plans']),requireAnyPermission(['view_real_estate_financials']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(_req,res,next)=>{try{res.json({accounts:(await getPool().query("SELECT id,name,type FROM chart_of_accounts WHERE company_id=$1 AND is_active=true AND type IN('revenue','expense','asset') ORDER BY account_code",[res.locals.companyId])).rows});}catch(e){next(e);}});
router.post('/payment-plans/:id/handover',requireAnyPermission(['manage_real_estate_payment_plans']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,planId=id.parse(req.params.id),v=z.object({version:z.number().int().positive(),revenueAccountId:id,costAmount:z.string().regex(/^\d{1,12}(\.\d{1,6})?$/),costAccountId:id.optional(),inventoryAccountId:id.optional()}).strict().parse(req.body);
 const r=(await getPool().query('SELECT s.buyer_contact_id,s.asset_id,a.kind FROM real_estate_payment_plans p JOIN real_estate_sale_agreements s ON s.id=p.sale_agreement_id AND s.company_id=p.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id WHERE p.company_id=$1 AND p.id=$2',[c,planId])).rows[0];if(!r||!(await contacts(req,res,[r.buyer_contact_id])).length)throw new ErpValidationError('Payment plan not found','not_found');if(!res.locals.permissions[`manage_real_estate_${r.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 const acquisitionInvoices=(await getPool().query("SELECT DISTINCT j.reference_id FROM real_estate_asset_cost_sources s JOIN journal_entries j ON j.id=s.journal_entry_id AND j.company_id=s.company_id WHERE s.company_id=$1 AND s.asset_id=$2 AND s.removed_at IS NULL AND j.reference_type='invoice'",[c,r.asset_id])).rows;
 for(const invoice of acquisitionInvoices)if(!(res.locals.permissions.view_invoices||res.locals.permissions.manage_invoices)||!await loadAccessibleInvoice(req,invoice.reference_id))throw new ErpValidationError('Acquisition invoice access required');
 res.json({data:await storage.handOverRealEstateSale(c,req.user!.id,planId,v.version,v.revenueAccountId,v.costAmount,v.costAccountId,v.inventoryAccountId,async invoiceId=>{await requireRealEstateInvoiceEvidence(req,getPool(),c,[invoiceId]);return true;})});
}catch(e){next(e);}});
export default router;
