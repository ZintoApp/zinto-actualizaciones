import {erpMinorUnits} from '../../../shared/erp-carrying-amount';
import {accessibleInvoiceIds} from '../../services/erp/invoice-access';
import {scopeRealEstateReportInvoices} from '../../services/erp/real-estate-report-invoice-scope';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';
import {commissionFundingDateSql} from '../../services/erp/commission-funding-calendar';
import {Router} from 'express';
import {z} from 'zod';
import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';
import {requireAnyPermission} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {realEstateCommissionAgreementSchema} from '../../../shared/real-estate-commissions';
const router=Router(),read=['view_real_estate_commissions','manage_real_estate_commissions'];
async function commissionQuery(req:any,query:string,args:unknown[]){
 const scoped=scopeRealEstateReportInvoices(query,args,await accessibleInvoiceIds(req));
 return getPool().query(scoped.text,scoped.values);
}
async function requireCommissionSource(req:any,companyId:number,commissionId:number){
 const result=await commissionQuery(req,`SELECT c.id FROM real_estate_commissions c
 JOIN real_estate_commission_funding f ON f.company_id=c.company_id AND
 ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 WHERE c.company_id=$1 AND c.id=$2 AND NOT EXISTS(
  SELECT 1 FROM real_estate_commissions sibling JOIN public.real_estate_commission_funding original ON original.company_id=sibling.company_id
  AND ((original.funding_type='receipt' AND original.funding_id=sibling.invoice_payment_id) OR (original.funding_type='credit_allocation' AND original.funding_id=sibling.credit_allocation_id))
  WHERE sibling.company_id=c.company_id AND sibling.agreement_id=c.agreement_id AND sibling.status<>'reversed' AND original.invoice_id=f.invoice_id
  AND NOT EXISTS(SELECT 1 FROM real_estate_commission_funding visible WHERE visible.company_id=original.company_id
   AND visible.funding_type=original.funding_type AND visible.funding_id=original.funding_id AND visible.invoice_id=original.invoice_id))`,[companyId,commissionId]);
 if(!result.rows.length)throw new ErpValidationError('Commission not found','not_found');
}
router.use('/commissions',requireAnyPermission(read),requireAnyPermission(['view_real_estate_financials']));
router.get('/commissions',async(req,res,next)=>{try{
 const c=res.locals.companyId,f=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query);
 const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),ids=(await getPool().query('SELECT id FROM contacts WHERE company_id=$1',[c])).rows.map(r=>r.id),allowed=scope?await storage.getAccessibleContactIds(ids,{companyId:c,userId:req.user!.id,contactScope:scope}):[];
 const join='FROM real_estate_commissions c JOIN real_estate_commission_agreements a ON a.id=c.agreement_id AND a.company_id=c.company_id JOIN real_estate_commission_funding p ON p.company_id=c.company_id AND ((p.funding_type=\'receipt\' AND p.funding_id=c.invoice_payment_id) OR (p.funding_type=\'credit_allocation\' AND p.funding_id=c.credit_allocation_id)) JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id JOIN users u ON u.id=a.agent_user_id AND u.company_id=a.company_id',where='c.company_id=$1 AND i.contact_id=ANY($2::int[])';
 const total=(await commissionQuery(req,`SELECT count(*)::int total ${join} WHERE ${where}`,[c,allowed])).rows[0].total,data=(await commissionQuery(req,`SELECT c.*,COALESCE((SELECT j.transaction_decimal_places FROM journal_entries j WHERE j.company_id=c.company_id AND j.id=c.journal_entry_id),(c.accounting_snapshot->>'transactionDecimalPlaces')::int,2) retained_decimal_places,COALESCE(u.full_name,u.username) agent_name,i.invoice_number ${join} WHERE ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT $3 OFFSET $4`,[c,allowed,f.limit,f.offset])).rows;
 const agreements=(await getPool().query("SELECT a.*,COALESCE(u.full_name,u.username) agent_name,  (SELECT count(*)::int FROM real_estate_jobs j WHERE j.company_id=a.company_id AND j.job_type='commission_accrual' AND j.payload->>'agreementId'=a.id::text AND j.status='failed') failed_jobs,  (SELECT count(*)::int FROM real_estate_jobs j WHERE j.company_id=a.company_id AND j.job_type='commission_accrual' AND j.payload->>'agreementId'=a.id::text AND j.status='pending') pending_jobs  FROM real_estate_commission_agreements a JOIN users u ON u.id=a.agent_user_id AND u.company_id=a.company_id WHERE a.company_id=$1 ORDER BY a.id DESC LIMIT 100",[c])).rows;res.json({data,total,agreements});
}catch(e){next(e);}});
router.get('/commission-context',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['view_real_estate_financials']),async(_req,res,next)=>{try{const c=res.locals.companyId;res.json({agents:(await getPool().query('SELECT id,COALESCE(full_name,username) name FROM users WHERE company_id=$1 AND active=true ORDER BY name',[c])).rows,accounts:(await getPool().query("SELECT id,name,type FROM chart_of_accounts WHERE company_id=$1 AND is_active=true AND type IN('expense','liability','asset') ORDER BY account_code",[c])).rows,currencies:(await getPool().query('SELECT code,name FROM currencies WHERE company_id=$1 AND is_active=true ORDER BY code',[c])).rows});}catch(e){next(e);}});
router.post('/commissions/agreements',requireAnyPermission(['manage_real_estate_commissions']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,v=realEstateCommissionAgreementSchema.parse(req.body);await client.query('BEGIN');
 const asset=(await client.query('SELECT kind FROM real_estate_assets WHERE company_id=$1 AND id=$2',[c,v.assetId])).rows[0];if(!asset||!res.locals.permissions[`manage_real_estate_${asset.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');if(!(await client.query('SELECT 1 FROM users WHERE company_id=$1 AND id=$2 AND active=true',[c,v.agentUserId])).rowCount)throw new ErpValidationError('Select an active company agent');const currencyRow=(await client.query('SELECT decimal_places FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[c,v.currency])).rows[0];if(!currencyRow)throw new ErpValidationError('Select an active ERP currency');if(v.calculation==='fixed'){try{erpMinorUnits(v.value,currencyRow.decimal_places);}catch{throw new ErpValidationError('Fixed commission exceeds ERP currency precision');}}
 for(const [account,type] of [[v.expenseAccountId,'expense'],[v.payableAccountId,'liability']])if(!(await client.query('SELECT 1 FROM chart_of_accounts WHERE company_id=$1 AND id=$2 AND type=$3 AND is_active=true',[c,account,type])).rowCount)throw new ErpValidationError('Select active ERP commission accounts');
 const row=(await client.query('INSERT INTO real_estate_commission_agreements(company_id,agent_user_id,asset_id,calculation,value,currency,effective_from,effective_to,expense_account_id,payable_account_id,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)RETURNING *',[c,v.agentUserId,v.assetId,v.calculation,v.value,v.currency,v.effectiveFrom,v.effectiveTo??null,v.expenseAccountId,v.payableAccountId,req.user!.id])).rows[0];await client.query('COMMIT');res.status(201).json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.patch('/commissions/agreements/:id/automation',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,agreementId=z.coerce.number().int().positive().parse(req.params.id),v=z.object({enabled:z.boolean(),expected:z.boolean()}).strict().parse(req.body);
 await client.query('BEGIN');const a=(await client.query('SELECT a.*,s.kind FROM real_estate_commission_agreements a JOIN real_estate_assets s ON s.id=a.asset_id AND s.company_id=a.company_id WHERE a.company_id=$1 AND a.id=$2 FOR UPDATE OF a',[c,agreementId])).rows[0];
 if(!a||!res.locals.permissions[`manage_real_estate_${a.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Commission agreement not found','not_found');
 if(a.automatic_accrual!==v.expected)throw new ErpValidationError('Agreement automation changed. Reload before saving.','version_conflict');
 const row=(await client.query('UPDATE real_estate_commission_agreements SET automatic_accrual=$3,automatic_actor_id=$4 WHERE company_id=$1 AND id=$2 RETURNING *',[c,agreementId,v.enabled,req.user!.id])).rows[0];
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_commission_agreement',$2,'automation_updated',$3,$4)",[c,agreementId,req.user!.id,JSON.stringify({enabled:v.enabled})]);
 await client.query('COMMIT');res.json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.patch('/commissions/agreements/:id/end',requireAnyPermission(['manage_real_estate_commissions']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,agreementId=z.coerce.number().int().positive().parse(req.params.id),v=z.object({effectiveTo:z.string().date(),expectedEffectiveTo:z.string().date().nullable()}).strict().parse(req.body);
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78130,$1)',[c]);
 const a=(await client.query('SELECT a.*,s.kind,a.effective_from::text start_key,a.effective_to::text end_key FROM real_estate_commission_agreements a JOIN real_estate_assets s ON s.id=a.asset_id AND s.company_id=a.company_id WHERE a.company_id=$1 AND a.id=$2 FOR UPDATE OF a',[c,agreementId])).rows[0];
 if(!a||!res.locals.permissions[`manage_real_estate_${a.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Commission agreement not found','not_found');
 if(a.end_key!==v.expectedEffectiveTo)throw new ErpValidationError('Agreement changed. Reload before saving.','version_conflict');
 if(v.effectiveTo<a.start_key)throw new ErpValidationError('End date precedes the agreement start');
 const {timezone}=await getErpCompanyCalendar(c);
 if((await client.query(`SELECT 1 FROM real_estate_commissions c JOIN real_estate_commission_funding p ON p.company_id=c.company_id AND ((p.funding_type='receipt' AND p.funding_id=c.invoice_payment_id) OR (p.funding_type='credit_allocation' AND p.funding_id=c.credit_allocation_id)) WHERE c.company_id=$1 AND c.agreement_id=$2 AND COALESCE((c.accounting_snapshot->>'fundingCalendarDate')::date,${commissionFundingDateSql('p','$4')})>$3::date LIMIT 1`,[c,agreementId,v.effectiveTo,timezone])).rowCount)throw new ErpValidationError('The end date cannot invalidate commissions already accrued');
 const row=(await client.query('UPDATE real_estate_commission_agreements SET effective_to=$3 WHERE company_id=$1 AND id=$2 RETURNING *',[c,agreementId,v.effectiveTo])).rows[0];
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_commission_agreement',$2,'ended',$3,$4)",[c,agreementId,req.user!.id,JSON.stringify({effectiveTo:v.effectiveTo})]);
 await client.query('COMMIT');res.json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
router.post('/commissions/agreements/:id/accrue',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,agreementId=z.coerce.number().int().positive().parse(req.params.id),agreement=(await getPool().query('SELECT a.*,s.kind FROM real_estate_commission_agreements a JOIN real_estate_assets s ON s.id=a.asset_id AND s.company_id=a.company_id WHERE a.company_id=$1 AND a.id=$2',[c,agreementId])).rows[0];if(!agreement||!res.locals.permissions[`manage_real_estate_${agreement.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Commission agreement not found','not_found');
 const {timezone}=await getErpCompanyCalendar(c);
 const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),receipts=(await commissionQuery(req,"SELECT p.funding_id id,p.funding_type,p.amount,i.contact_id,i.subtotal,i.total_amount,i.currency,i.id invoice_id,s.source_type FROM real_estate_commission_funding p JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id WHERE p.company_id=$1 AND s.asset_id=$2 AND i.currency=$3 AND (CASE WHEN p.funding_type='receipt' THEN (p.funding_date AT TIME ZONE 'UTC' AT TIME ZONE $6)::date ELSE p.funding_date::date END)>=$4::date AND ($5::date IS NULL OR (CASE WHEN p.funding_type='receipt' THEN (p.funding_date AT TIME ZONE 'UTC' AT TIME ZONE $6)::date ELSE p.funding_date::date END)<=$5::date) AND s.source_type IN('rent','installment') AND i.status NOT IN('cancelled','void') AND p.posting_status='posted' AND p.funding_status='posted' ORDER BY p.funding_date,p.funding_type,p.funding_id",[c,agreement.asset_id,agreement.currency,agreement.effective_from,agreement.effective_to,timezone])).rows,allowed=scope?await storage.getAccessibleContactIds(receipts.map(r=>r.contact_id),{companyId:c,userId:req.user!.id,contactScope:scope}):[];
 const eligible=receipts.filter(r=>allowed.includes(r.contact_id));
 const siblings=(await getPool().query(`SELECT c.id FROM real_estate_commissions c JOIN real_estate_commission_funding f ON f.company_id=c.company_id
 AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 WHERE c.company_id=$1 AND c.agreement_id=$2 AND c.status<>'reversed' AND f.invoice_id=ANY($3::int[])`,[c,agreementId,eligible.map(r=>r.invoice_id)])).rows;
 for(const sibling of siblings)await requireCommissionSource(req,c,Number(sibling.id));
 const ids=[];for(const r of eligible)ids.push(await storage.accrueRealEstateCommission(c,req.user!.id,agreementId,r.id,undefined,r.funding_type));res.json({data:ids});
}catch(e){next(e);}});
async function accessibleCommission(req:any,res:any){
 const c=res.locals.companyId,commissionId=z.coerce.number().int().positive().parse(req.params.id),row=(await getPool().query("SELECT i.contact_id,a.kind FROM real_estate_commissions c JOIN real_estate_commission_funding f ON f.company_id=c.company_id AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id)) JOIN invoices i ON i.id=f.invoice_id AND i.company_id=f.company_id JOIN real_estate_commission_agreements g ON g.company_id=c.company_id AND g.id=c.agreement_id JOIN real_estate_assets a ON a.company_id=g.company_id AND a.id=g.asset_id WHERE c.company_id=$1 AND c.id=$2",[c,commissionId])).rows[0];
 await requireCommissionSource(req,c,commissionId);
 const scope=resolveContactViewScope(res.locals.permissions,req.user.isSuperAdmin===true);
 if(!row||!scope||!(await storage.getAccessibleContactIds([row.contact_id],{companyId:c,userId:req.user.id,contactScope:scope})).length||!res.locals.permissions[`manage_real_estate_${row.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Commission not found','not_found');return commissionId;
}
router.get('/commissions/:id/credit-preview',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{res.json({data:await storage.previewRealEstateCommissionCredits(res.locals.companyId,await accessibleCommission(req,res))});}catch(e){next(e);}});
router.post('/commissions/:id/reconcile-credits',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=await accessibleCommission(req,res),v=z.object({expected:z.string().max(200000),reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
 res.json({data:await storage.reconcileRealEstateCommissionCredits(res.locals.companyId,req.user!.id,recordId,v.expected,v.reason)});
}catch(e){next(e);}});
router.post('/commissions/:id/payout',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['record_real_estate_payments']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,commissionId=z.coerce.number().int().positive().parse(req.params.id),v=z.object({amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0),cashAccountId:z.number().int().positive(),reference:z.string().trim().min(1).max(250)}).strict().parse(req.body);
 const row=(await getPool().query('SELECT i.contact_id FROM real_estate_commissions c JOIN real_estate_commission_funding p ON p.company_id=c.company_id AND ((p.funding_type=\'receipt\' AND p.funding_id=c.invoice_payment_id) OR (p.funding_type=\'credit_allocation\' AND p.funding_id=c.credit_allocation_id)) JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id WHERE c.company_id=$1 AND c.id=$2',[c,commissionId])).rows[0],scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),allowed=row&&scope?await storage.getAccessibleContactIds([row.contact_id],{companyId:c,userId:req.user!.id,contactScope:scope}):[];if(!allowed.length)throw new ErpValidationError('Commission not found','not_found');await requireCommissionSource(req,c,commissionId);res.json({data:await storage.payRealEstateCommission(c,req.user!.id,commissionId,v.amount,v.cashAccountId,v.reference)});
}catch(e){next(e);}});
router.post('/commissions/:id/reverse',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,commissionId=z.coerce.number().int().positive().parse(req.params.id),body=z.object({reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
 const row=(await getPool().query('SELECT i.contact_id,a.kind FROM real_estate_commissions c JOIN real_estate_commission_funding p ON p.company_id=c.company_id AND ((p.funding_type=\'receipt\' AND p.funding_id=c.invoice_payment_id) OR (p.funding_type=\'credit_allocation\' AND p.funding_id=c.credit_allocation_id)) JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id JOIN real_estate_commission_agreements g ON g.id=c.agreement_id AND g.company_id=c.company_id JOIN real_estate_assets a ON a.id=g.asset_id AND a.company_id=g.company_id WHERE c.company_id=$1 AND c.id=$2',[c,commissionId])).rows[0];
 const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),allowed=row&&scope?await storage.getAccessibleContactIds([row.contact_id],{companyId:c,userId:req.user!.id,contactScope:scope}):[];
 if(!allowed.length)throw new ErpValidationError('Commission not found','not_found');
 await requireCommissionSource(req,c,commissionId);
 if(!res.locals.permissions[`manage_real_estate_${row.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 res.json({data:await storage.reverseRealEstateCommission(c,req.user!.id,commissionId,body.reason)});
}catch(e){next(e);}});
router.post('/commissions/:id/payouts/:journalId/recover',requireAnyPermission(['manage_real_estate_commissions']),requireAnyPermission(['record_real_estate_payments']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,commissionId=z.coerce.number().int().positive().parse(req.params.id),journalId=z.coerce.number().int().positive().parse(req.params.journalId),v=z.object({returnReference:z.string().trim().min(1).max(250),reason:z.string().trim().min(1).max(1000),fundsReturned:z.literal(true),amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0).optional(),cashAccountId:z.number().int().positive().optional()}).strict().parse(req.body);
 const row=(await getPool().query('SELECT i.contact_id,a.kind FROM real_estate_commissions c JOIN real_estate_commission_funding p ON p.company_id=c.company_id AND ((p.funding_type=\'receipt\' AND p.funding_id=c.invoice_payment_id) OR (p.funding_type=\'credit_allocation\' AND p.funding_id=c.credit_allocation_id)) JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id JOIN real_estate_commission_agreements g ON g.id=c.agreement_id AND g.company_id=c.company_id JOIN real_estate_assets a ON a.id=g.asset_id AND a.company_id=g.company_id WHERE c.company_id=$1 AND c.id=$2',[c,commissionId])).rows[0];
 const scope=resolveContactViewScope(res.locals.permissions,req.user!.isSuperAdmin===true),allowed=row&&scope?await storage.getAccessibleContactIds([row.contact_id],{companyId:c,userId:req.user!.id,contactScope:scope}):[];
 if(!allowed.length)throw new ErpValidationError('Commission not found','not_found');
 await requireCommissionSource(req,c,commissionId);
 if(!res.locals.permissions[`manage_real_estate_${row.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Asset management required');
 res.json({data:await storage.recoverRealEstateCommissionPayout(c,req.user!.id,commissionId,journalId,v.returnReference,v.reason,v.amount,v.cashAccountId)});
}catch(e){next(e);}});
export default router;
