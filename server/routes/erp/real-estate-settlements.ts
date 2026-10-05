import {scopeRealEstateSettlements} from '../../services/erp/real-estate-settlement-access';
import {erpMinorUnits,erpMinorUnitsToAmount} from '../../../shared/erp-carrying-amount';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {sumErpDecimals,subtractErpDecimals} from '../../services/erp/decimal-math';
import {allocateInitialExpenseRecovery} from '../../../shared/real-estate-expense-posting';
import {ownerFundsAfterNotes} from '../../../shared/real-estate-settlement-entitlement';
import {PgDialect} from 'drizzle-orm/pg-core';
import {loadOwnerExpenseBasis} from '../../services/erp/real-estate-expense-basis';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';
import {prepareOwnerRentLines} from '../../services/erp/real-estate-settlement-preparation';
import {db} from '../../db';
import {sql} from 'drizzle-orm';
import {invoiceAccessCondition} from '../../erp-invoice-access';
import {settlementFeesSchema} from '../../../shared/real-estate-settlement-fees';
import {loadAccessibleInvoice,resolveInvoiceAccess,accessibleInvoiceIds} from '../../services/erp/invoice-access';
import {Router} from 'express';
import {z} from 'zod';
import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';
import {requireAnyPermission} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {settlementAdjustmentsSchema} from '../../../shared/real-estate-settlement-adjustments';
const router=Router(),id=z.coerce.number().int().positive(),read=['view_real_estate_owner_settlements','manage_real_estate_owner_settlements'];
async function allowed(req:any,res:any,ids:number[]){const scope=resolveContactViewScope(res.locals.permissions,req.user.isSuperAdmin===true);return scope?storage.getAccessibleContactIds(ids,{companyId:res.locals.companyId,userId:req.user.id,contactScope:scope}):[];}
async function settlementQuery(req:any,query:string,args:unknown[]){
 const scoped=scopeRealEstateSettlements(query,args,await accessibleInvoiceIds(req));return getPool().query(scoped.text,scoped.values);
}
async function requireSettlementSources(req:any,companyId:number,recordId:number){
 if(!(await settlementQuery(req,'SELECT id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[companyId,recordId])).rows.length)
  throw new ErpValidationError('Settlement not found','not_found');
}
router.use('/owner-settlements',requireAnyPermission(read),requireAnyPermission(['view_real_estate_financials']));
router.get('/owner-settlements',async(req,res,next)=>{try{
 const c=res.locals.companyId,f=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)}).strict().parse(req.query),ids=(await getPool().query("SELECT contact_id FROM real_estate_contact_roles WHERE company_id=$1 AND role='owner'",[c])).rows.map(r=>r.contact_id),owners=await allowed(req,res,ids);
 const total=(await settlementQuery(req,'SELECT count(*)::int total FROM real_estate_settlements WHERE company_id=$1 AND owner_contact_id=ANY($2::int[])',[c,owners])).rows[0].total,data=(await settlementQuery(req,'SELECT s.*,COALESCE((SELECT j.transaction_decimal_places FROM journal_entries j WHERE j.company_id=s.company_id AND j.id=s.journal_entry_id),(s.lines->>\'transactionDecimalPlaces\')::int) retained_decimal_places,c.name owner_name FROM real_estate_settlements s JOIN contacts c ON c.id=s.owner_contact_id AND c.company_id=s.company_id WHERE s.company_id=$1 AND s.owner_contact_id=ANY($2::int[]) ORDER BY s.period_key DESC,s.id DESC LIMIT $3 OFFSET $4',[c,owners,f.limit,f.offset])).rows;res.json({data,total,currencies:await storage.getCurrencies(c)});
}catch(e){next(e);}});
router.get('/owner-settlements/:id',async(req,res,next)=>{try{
 const c=res.locals.companyId,row=(await settlementQuery(req,'SELECT s.*,COALESCE((SELECT j.transaction_decimal_places FROM journal_entries j WHERE j.company_id=s.company_id AND j.id=s.journal_entry_id),(s.lines->>\'transactionDecimalPlaces\')::int) retained_decimal_places,c.name owner_name FROM real_estate_settlements s JOIN contacts c ON c.id=s.owner_contact_id AND c.company_id=s.company_id WHERE s.company_id=$1 AND s.id=$2',[c,id.parse(req.params.id)])).rows[0];if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');res.json({data:row,currencies:await storage.getCurrencies(c)});
}catch(e){next(e);}});
router.get('/settlement-context',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['view_real_estate_financials']),async(req,res,next)=>{try{
 const c=res.locals.companyId,ids=(await getPool().query("SELECT contact_id FROM real_estate_contact_roles WHERE company_id=$1 AND role='owner'",[c])).rows.map(r=>r.contact_id),owners=await allowed(req,res,ids);
 res.json({owners:(await getPool().query('SELECT id,name FROM contacts WHERE company_id=$1 AND id=ANY($2::int[]) ORDER BY name',[c,owners])).rows,currencies:(await getPool().query('SELECT code,name,decimal_places FROM currencies WHERE company_id=$1 AND is_active=true ORDER BY code',[c])).rows,accounts:(await getPool().query("SELECT id,name,type FROM chart_of_accounts WHERE company_id=$1 AND is_active=true AND type IN('liability','asset','expense','revenue') ORDER BY account_code",[c])).rows});
}catch(e){next(e);}});
router.post('/owner-settlements',requireAnyPermission(['manage_real_estate_owner_settlements']),async(req,res,next)=>{
 const client=await getPool().connect();try{
 const c=res.locals.companyId,v=z.object({ownerContactId:id,periodKey:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),currency:z.string().regex(/^[A-Z]{3}$/),payableAccountId:id}).strict().parse(req.body);if(!(await allowed(req,res,[v.ownerContactId])).length)throw new ErpValidationError('Owner not found','not_found');
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78129,$1)',[c]);
 if(!(await client.query("SELECT 1 FROM real_estate_contact_roles WHERE company_id=$1 AND contact_id=$2 AND role='owner'",[c,v.ownerContactId])).rowCount)throw new ErpValidationError('Link an existing CRM owner');if(!(await client.query('SELECT 1 FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[c,v.currency])).rowCount)throw new ErpValidationError('Select an active ERP currency');if(!(await client.query("SELECT 1 FROM chart_of_accounts WHERE company_id=$1 AND id=$2 AND type='liability' AND is_active=true",[c,v.payableAccountId])).rowCount)throw new ErpValidationError('Select an active ERP owner payable account');
 const existing=(await client.query('SELECT * FROM real_estate_settlements WHERE company_id=$1 AND owner_contact_id=$2 AND period_key=$3 AND currency=$4',[c,v.ownerContactId,v.periodKey,v.currency])).rows[0];if(existing)await requireSettlementSources(req,c,Number(existing.id));if(existing&&existing.status!=='reversed'){await client.query('COMMIT');res.json({data:existing});return;}
 const first=v.periodKey+'-01';
 const {timezone}=await getErpCompanyCalendar(c);
 // Snapshot receipt amounts, ownership version, and shares at the obligation's
 // effective date. Payments allocate the net owner funds proportionally;
 // security deposits and sale advances are excluded from rent settlements.
 const receipts=(await client.query("SELECT p.id payment_id,p.amount,p.payment_date,i.contact_id,a.kind asset_kind,i.id invoice_id,i.total_amount,i.subtotal,i.issue_date,i.currency,i.currency_decimal_places,s.asset_id,x.net_account_id,v.id ownership_version_id,h.percentage FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id JOIN erp_invoice_posting_contexts x ON x.invoice_id=i.id AND x.company_id=i.company_id JOIN real_estate_assets a ON a.id=s.asset_id AND a.company_id=s.company_id JOIN real_estate_ownership_versions v ON v.asset_id=a.id AND v.company_id=a.company_id AND v.effective_from<=i.issue_date::date AND (v.effective_to IS NULL OR v.effective_to>=i.issue_date::date) JOIN real_estate_ownership_shares h ON h.ownership_version_id=v.id AND h.company_id=v.company_id WHERE p.company_id=$1 AND h.contact_id=$2 AND i.currency=$3 AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $5)>=$4::date AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $5)<$4::date+interval '1 month' AND s.source_type='rent' AND x.treatment='owner_funds' AND a.ownership_mode='managed' AND i.status NOT IN('cancelled','void') ORDER BY p.id",[c,v.ownerContactId,v.currency,first,timezone])).rows;
 const distinct=new Set();for(const r of receipts){if(distinct.has(r.payment_id))throw new ErpValidationError('Overlapping ownership periods must be corrected before settlement');distinct.add(r.payment_id);}
 const payerIds=[...new Set<number>(receipts.map(r=>Number(r.contact_id)))],visiblePayers:number[]=await allowed(req,res,payerIds);
 if(payerIds.some(i=>!visiblePayers.includes(i))||receipts.some(r=>!res.locals.permissions[`view_real_estate_${r.asset_kind==='unit'?'units':'properties'}`]&&!res.locals.permissions[`manage_real_estate_${r.asset_kind==='unit'?'units':'properties'}`]))throw new ErpValidationError('Settlement rent sources not found','not_found');
 const rentScoped=scopeRealEstateSettlements('SELECT id FROM invoices WHERE company_id=$1 AND id=ANY($2::int[])',[c,receipts.map(r=>r.invoice_id)],await accessibleInvoiceIds(req));
 const visibleRent=(await client.query(rentScoped.text,rentScoped.values)).rows.map(r=>Number(r.id));
 if(receipts.some(r=>!visibleRent.includes(Number(r.invoice_id))))throw new ErpValidationError('Settlement rent sources not found','not_found');
 const lines=await prepareOwnerRentLines(client,c,receipts);
 const currencyRow=(await client.query('SELECT decimal_places FROM currencies WHERE company_id=$1 AND code=$2',[c,v.currency])).rows[0],digits=erpCurrencyDigits(currencyRow?.decimal_places);
 const collected=sumErpDecimals(lines.map(l=>l.amount),6);
 const expenseRows=(await client.query("SELECT e.id,e.invoice_id,e.amount,e.expense_date,x.net_account_id,h.percentage,v.id ownership_version_id,e.asset_id,a.kind asset_kind FROM real_estate_expenses e JOIN real_estate_assets a ON a.company_id=e.company_id AND a.id=e.asset_id JOIN real_estate_ownership_versions v ON v.asset_id=e.asset_id AND v.company_id=e.company_id AND v.effective_from<=e.expense_date AND (v.effective_to IS NULL OR v.effective_to>=e.expense_date) JOIN real_estate_ownership_shares h ON h.ownership_version_id=v.id AND h.company_id=v.company_id JOIN erp_invoice_posting_contexts x ON x.invoice_id=e.invoice_id AND x.company_id=e.company_id WHERE e.company_id=$1 AND h.contact_id=$2 AND e.currency=$3 AND e.expense_date>=$4::date AND e.expense_date<$4::date+interval '1 month' AND e.status='posted' AND e.owner_chargeable=true ORDER BY e.id",[c,v.ownerContactId,v.currency,first])).rows;
 if(expenseRows.length&&((!res.locals.permissions.view_real_estate_expenses&&!res.locals.permissions.manage_real_estate_expenses)||expenseRows.some(e=>!res.locals.permissions[`view_real_estate_${e.asset_kind==='unit'?'units':'properties'}`]&&!res.locals.permissions[`manage_real_estate_${e.asset_kind==='unit'?'units':'properties'}`])))throw new ErpValidationError('Settlement expense sources not found','not_found');
 const expenseScoped=scopeRealEstateSettlements('SELECT id FROM invoices WHERE company_id=$1 AND id=ANY($2::int[])',[c,expenseRows.map(e=>e.invoice_id)],await accessibleInvoiceIds(req));
 const visibleExpenses=(await client.query(expenseScoped.text,expenseScoped.values)).rows.map(r=>Number(r.id));
 if(expenseRows.some(e=>!visibleExpenses.includes(Number(e.invoice_id))))throw new ErpValidationError('Settlement expense sources not found','not_found');
 const expenseIds=new Set();for(const e of expenseRows){if(expenseIds.has(e.id))throw new ErpValidationError('Overlapping expense ownership periods');expenseIds.add(e.id);}
 const expenseTx={execute:async(q:any)=>{const compiled=new PgDialect().sqlToQuery(q);return client.query(compiled.sql,compiled.params);}};
 const expenses=[];for(const e of expenseRows){const basis=await loadOwnerExpenseBasis(expenseTx,c,Number(e.id));const originalAmount=ownerFundsAfterNotes(String(e.amount),String(e.amount),String(e.amount),Number(e.percentage).toFixed(4),basis.precision.transactionDigits);const prior=(await client.query(`SELECT s.id,item FROM real_estate_settlements s CROSS JOIN LATERAL jsonb_array_elements(s.lines->'items') WITH ORDINALITY p(item,position) WHERE s.company_id=$1 AND s.status IN('posted','partially_paid','paid') AND item->>'type'='owner_expense' AND item->>'expenseId'=$2::text ORDER BY s.id,p.position`,[c,e.id])).rows;for(const previous of prior)await requireSettlementSources(req,c,Number(previous.id));const position=existing?prior.filter(r=>Number(r.id)<Number(existing.id)).length:prior.length;
 const portions=[...prior.slice(0,position).map(r=>String(r.item.originalAmount??r.item.amount)),originalAmount,...prior.slice(position).map(r=>String(r.item.originalAmount??r.item.amount))];const recovered=basis.allocate(portions)[position];
 allocateInitialExpenseRecovery(String(basis.total_amount),basis.components,prior.map(r=>r.item),[{amount:recovered.amount,originalAmount}],position,basis.precision);expenses.push({type:'owner_expense',expenseId:e.id,assetId:e.asset_id,ownershipVersionId:e.ownership_version_id,percentage:e.percentage,expenseAccountId:e.net_account_id,amount:recovered.amount,originalAmount,originalBaseAmount:basis.allocateOriginal(portions)[position].baseAmount,originalRecoveryComponents:basis.allocateOriginal(portions)[position].recoveryComponents,expenseNoteSignature:basis.signature,transactionDecimalPlaces:basis.precision.transactionDigits,baseDecimalPlaces:basis.precision.baseDigits});}const expenseTotal=sumErpDecimals(expenses.map(l=>l.amount),6);
 if(erpMinorUnits(collected,6)<=0n)throw new ErpValidationError('No eligible managed rent receipts for this owner and period');if(erpMinorUnits(expenseTotal,6)>erpMinorUnits(collected,6))throw new ErpValidationError('Owner expenses exceed collected rent; resolve the deficit before settlement');
 const retainedDigits=Math.max(digits,...receipts.map(r=>erpCurrencyDigits(r.currency_decimal_places)),...expenses.map(e=>erpCurrencyDigits(e.transactionDecimalPlaces)));
 const snapshot={transactionDecimalPlaces:retainedDigits,timezone,items:[...lines,...expenses],payableAccountId:v.payableAccountId,...(existing?{previousSnapshots:[...(existing.lines.previousSnapshots??[]),{...existing.lines,previousSnapshots:undefined,journalEntryId:existing.journal_entry_id,collected:existing.collected,expenses:existing.expenses,payable:existing.payable}]}:{})};
 const row=existing?(await client.query("UPDATE real_estate_settlements SET status='draft',journal_entry_id=NULL,collected=$3,expenses=$4,payable=$5,paid=0,fees=0,adjustments=0,lines=$6 WHERE company_id=$1 AND id=$2 AND status='reversed' RETURNING *",[c,existing.id,erpMinorUnitsToAmount(erpMinorUnits(collected,retainedDigits),retainedDigits),erpMinorUnitsToAmount(erpMinorUnits(expenseTotal,retainedDigits),retainedDigits),subtractErpDecimals(collected,expenseTotal,retainedDigits),JSON.stringify(snapshot)])).rows[0]:(await client.query('INSERT INTO real_estate_settlements(company_id,owner_contact_id,period_key,currency,collected,expenses,payable,lines)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING *',[c,v.ownerContactId,v.periodKey,v.currency,erpMinorUnitsToAmount(erpMinorUnits(collected,retainedDigits),retainedDigits),erpMinorUnitsToAmount(erpMinorUnits(expenseTotal,retainedDigits),retainedDigits),subtractErpDecimals(collected,expenseTotal,retainedDigits),JSON.stringify(snapshot)])).rows[0];await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id)VALUES($1,'real_estate_settlement',$2,$3,$4)",[c,row.id,existing?'reprepared':'created',req.user!.id]);await client.query('COMMIT');res.status(201).json({data:row});
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
});
async function accessibleRentCorrection(req:any,res:any,recordId:number,invoiceId:number){
 const c=res.locals.companyId,rows=(await getPool().query("SELECT s.owner_contact_id FROM real_estate_settlements s WHERE s.company_id=$1 AND s.status IN('posted','partially_paid','paid') AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.lines->'items') i WHERE i->>'type'='rent_receipt' AND i->>'invoiceId'=$2::text)",[c,invoiceId])).rows;
 const selected=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];
 const invoice=(await getPool().query("SELECT i.contact_id,a.kind FROM invoices i JOIN real_estate_invoice_sources s ON s.company_id=i.company_id AND s.invoice_id=i.id JOIN real_estate_assets a ON a.company_id=s.company_id AND a.id=s.asset_id WHERE i.company_id=$1 AND i.id=$2 AND s.source_type='rent'",[c,invoiceId])).rows[0];
 const contactIds=[...new Set<number>([...rows.map(r=>Number(r.owner_contact_id)),Number(invoice?.contact_id),Number(selected?.owner_contact_id)])];
 const visible:number[]=await allowed(req,res,contactIds);
 if(!selected||!invoice||!rows.length||contactIds.some(i=>!visible.includes(i))||!res.locals.permissions[`manage_real_estate_${invoice.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Owner rent correction not found','not_found');
 for(const row of (await getPool().query("SELECT id FROM real_estate_settlements WHERE company_id=$1 AND status IN('posted','partially_paid','paid') AND EXISTS(SELECT 1 FROM jsonb_array_elements(lines->'items') item WHERE item->>'invoiceId'=$2::text)",[c,invoiceId])).rows)await requireSettlementSources(req,c,Number(row.id));
 await requireSettlementSources(req,c,recordId);return contactIds;
}
router.get('/owner-settlements/:id/rent-credit-preview',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['manage_real_estate_rent_collection']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=id.parse(req.params.id),invoiceId=z.coerce.number().int().positive().parse(req.query.invoiceId);const contactIds=await accessibleRentCorrection(req,res,recordId,invoiceId);res.json({data:await storage.previewRealEstateSettlementRentCredits(res.locals.companyId,recordId,invoiceId,contactIds)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/reconcile-rent-credits',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['manage_real_estate_rent_collection']),requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=id.parse(req.params.id),v=z.object({invoiceId:id,expected:z.string().max(200000),reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body);const contactIds=await accessibleRentCorrection(req,res,recordId,v.invoiceId);res.json({data:await storage.reconcileRealEstateSettlementRentCredits(res.locals.companyId,req.user!.id,recordId,v.invoiceId,v.expected,v.reason,contactIds)});
}catch(e){next(e);}});
async function accessibleExpenseCorrection(req:any,res:any,recordId:number,expenseId:number){
 const c=res.locals.companyId,expense=(await getPool().query('SELECT a.kind FROM real_estate_expenses e JOIN real_estate_assets a ON a.company_id=e.company_id AND a.id=e.asset_id WHERE e.company_id=$1 AND e.id=$2',[c,expenseId])).rows[0];
 const rows=(await getPool().query("SELECT s.id,s.owner_contact_id FROM real_estate_settlements s WHERE s.company_id=$1 AND s.status IN('posted','partially_paid','paid') AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.lines->'items') i WHERE i->>'type'='owner_expense' AND i->>'expenseId'=$2::text)",[c,expenseId])).rows;
 const owners=[...new Set<number>(rows.map(r=>Number(r.owner_contact_id)))],visible:number[]=await allowed(req,res,owners);
 if(!expense||!rows.some(r=>Number(r.id)===recordId)||owners.some(i=>!visible.includes(i))||!res.locals.permissions[`manage_real_estate_${expense.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Owner expense correction not found','not_found');for(const row of rows)await requireSettlementSources(req,c,Number(row.id));return owners;
}
router.get('/owner-settlements/:id/expense-credit-preview',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['manage_real_estate_expenses']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=id.parse(req.params.id),expenseId=id.parse(req.query.expenseId),owners=await accessibleExpenseCorrection(req,res,recordId,expenseId);res.json({data:await storage.previewRealEstateSettlementExpenseCredits(res.locals.companyId,recordId,expenseId,owners)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/reconcile-expense-credits',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['manage_real_estate_expenses']),requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=id.parse(req.params.id),v=z.object({expenseId:id,expected:z.string().max(200000),reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body),owners=await accessibleExpenseCorrection(req,res,recordId,v.expenseId);res.json({data:await storage.reconcileRealEstateSettlementExpenseCredits(res.locals.companyId,req.user!.id,recordId,v.expenseId,v.expected,v.reason,owners)});
}catch(e){next(e);}});
async function accessibleFeeCorrection(req:any,res:any,recordId:number,invoiceId:number){
 const c=res.locals.companyId;if(!(await loadAccessibleInvoice(req,invoiceId)))throw new ErpValidationError('Fee invoice not found','not_found');
 const rows=(await getPool().query("SELECT s.id,s.owner_contact_id FROM real_estate_settlements s WHERE s.company_id=$1 AND s.status IN('posted','partially_paid','paid') AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(s.lines->'feeItems','[]'::jsonb)) f WHERE f->>'invoiceId'=$2::text)",[c,invoiceId])).rows;
 const owners=[...new Set<number>(rows.map(r=>Number(r.owner_contact_id)))],visible:number[]=await allowed(req,res,owners);if(!rows.some(r=>Number(r.id)===recordId)||owners.some(i=>!visible.includes(i)))throw new ErpValidationError('Owner fee correction not found','not_found');for(const row of rows)await requireSettlementSources(req,c,Number(row.id));return owners;
}
router.get('/owner-settlements/:id/fee-credit-preview',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['view_invoices','manage_invoices']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=id.parse(req.params.id),invoiceId=id.parse(req.query.invoiceId),owners=await accessibleFeeCorrection(req,res,recordId,invoiceId);res.json({data:await storage.previewRealEstateSettlementFeeCredits(res.locals.companyId,recordId,invoiceId,owners)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/reconcile-fee-credits',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['view_invoices','manage_invoices']),requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const recordId=id.parse(req.params.id),v=z.object({invoiceId:id,expected:z.string().max(200000),reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body),owners=await accessibleFeeCorrection(req,res,recordId,v.invoiceId);res.json({data:await storage.reconcileRealEstateSettlementFeeCredits(res.locals.companyId,req.user!.id,recordId,v.invoiceId,v.expected,v.reason,owners)});
}catch(e){next(e);}});
router.get('/owner-settlements/:id/fee-invoices',requireAnyPermission(['view_invoices','manage_invoices']),async(req,res,next)=>{try{
 const c=res.locals.companyId,row=(await getPool().query('SELECT owner_contact_id,currency FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,id.parse(req.params.id)])).rows[0];
 if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));
 const search=z.string().max(250).parse(req.query.search??''),access=await resolveInvoiceAccess(req);
 const data=(await db.execute(sql`SELECT invoices.id,invoices.invoice_number name,invoices.amount_due AS "amountDue" FROM invoices
 WHERE ${invoiceAccessCondition(access)} AND invoices.contact_id=${row.owner_contact_id} AND invoices.currency=${row.currency}
 AND invoices.type='sales_invoice' AND invoices.parent_invoice_id IS NULL AND invoices.status IN('sent','overdue','partially_paid') AND invoices.amount_due>0
 AND invoices.invoice_number ILIKE ${'%'+search+'%'} AND NOT EXISTS(SELECT 1 FROM real_estate_invoice_sources WHERE company_id=${c} AND invoice_id=invoices.id)
 AND EXISTS(SELECT 1 FROM invoice_items WHERE invoice_id=invoices.id)
 AND NOT EXISTS(SELECT 1 FROM invoice_items l LEFT JOIN products p ON p.id=l.product_id AND p.company_id=${c} WHERE l.invoice_id=invoices.id AND p.id IS NULL)
 ORDER BY invoices.id DESC LIMIT 100`)).rows;
 res.json({data});
}catch(e){next(e);}});
router.patch('/owner-settlements/:id/fees',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),requireAnyPermission(['view_invoices','manage_invoices']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),v=settlementFeesSchema.parse(req.body),row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];
 if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));
 for(const fee of v.fees){if(!(await loadAccessibleInvoice(req,fee.invoiceId))||!(await settlementQuery(req,'SELECT id FROM invoices WHERE company_id=$1 AND id=$2',[c,fee.invoiceId])).rows.length)throw new ErpValidationError('Invoice not found','not_found');}
 res.json({data:await storage.updateRealEstateSettlementFees(c,req.user!.id,recordId,v.expected,v.fees)});
}catch(e){next(e);}});
router.patch('/owner-settlements/:id/adjustments',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),v=settlementAdjustmentsSchema.parse(req.body),row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];
 if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));
 res.json({data:await storage.updateRealEstateSettlementAdjustments(c,req.user!.id,recordId,v.expected,v.adjustments)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/post',requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));const fees=(await getPool().query('SELECT lines FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0]?.lines?.feeItems??[];
 if(fees.length&&!res.locals.permissions.view_invoices&&!res.locals.permissions.manage_invoices)throw new ErpValidationError('ERP invoice access is required');
 for(const fee of fees)if(!(await loadAccessibleInvoice(req,fee.invoiceId)))throw new ErpValidationError('Invoice not found','not_found');
 res.json({data:await storage.postRealEstateSettlement(c,req.user!.id,recordId)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/reverse',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),v=z.object({reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
 const row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];
 if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));
 res.json({data:await storage.reverseRealEstateSettlement(c,req.user!.id,recordId,v.reason)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/payout',requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['record_real_estate_payments']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),v=z.object({amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0),cashAccountId:id,reference:z.string().trim().min(1).max(250)}).strict().parse(req.body),row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));res.json({data:await storage.payRealEstateSettlement(c,req.user!.id,recordId,v.amount,v.cashAccountId,v.reference)});
}catch(e){next(e);}});
router.post('/owner-settlements/:id/payouts/:journalId/recover',requireAnyPermission(['manage_real_estate_owner_settlements']),requireAnyPermission(['post_real_estate_settlements']),requireAnyPermission(['record_real_estate_payments']),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res,next)=>{try{
 const c=res.locals.companyId,recordId=id.parse(req.params.id),journalId=id.parse(req.params.journalId),v=z.object({returnReference:z.string().trim().min(1).max(250),reason:z.string().trim().min(1).max(1000),fundsReturned:z.literal(true),amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0).optional(),cashAccountId:z.number().int().positive().optional()}).strict().parse(req.body);
 const row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[c,recordId])).rows[0];
 if(!row||!(await allowed(req,res,[row.owner_contact_id])).length)throw new ErpValidationError('Settlement not found','not_found');await requireSettlementSources(req,c,id.parse(req.params.id));
 res.json({data:await storage.recoverRealEstateSettlementPayout(c,req.user!.id,recordId,journalId,v.returnReference,v.reason,v.amount,v.cashAccountId)});
}catch(e){next(e);}});
export default router;
