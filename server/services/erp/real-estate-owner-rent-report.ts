import {ownerFundsAfterNotes} from '../../../shared/real-estate-settlement-entitlement';
import {erpMinorUnits,erpMinorUnitsToAmount} from '../../../shared/erp-carrying-amount';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {sumErpDecimals,subtractErpDecimals} from './decimal-math';

/** Read existing issued obligations and receipts. Never posts or synthesizes evidence.
 * Caller supplies ERP invoice access and runs queries in one read snapshot. */
export async function loadOwnerRentReport(client:any,input:{companyId:number;ownerId:number;period:string;timezone:string;kinds:string[];invoiceIds:number[]}){
 const {companyId,ownerId,period,timezone,kinds,invoiceIds}=input,first=period+'-01';
 const obligations=(await client.query(`SELECT i.id,i.invoice_number,i.currency,i.currency_decimal_places,i.subtotal,i.total_amount,i.issue_date::text,
   v.id ownership_version_id,h.percentage,
   (i.issue_date>=$3::date AND i.issue_date<$3::date+interval '1 month') issued_in_period,
   (SELECT count(*)::int FROM journal_entries j WHERE j.company_id=i.company_id AND j.reference_type='invoice' AND j.reference_id=i.id AND j.status='posted') posted_journals
   FROM invoices i JOIN real_estate_invoice_sources s ON s.company_id=i.company_id AND s.invoice_id=i.id
   JOIN erp_invoice_posting_contexts x ON x.company_id=i.company_id AND x.invoice_id=i.id
   JOIN real_estate_assets a ON a.company_id=s.company_id AND a.id=s.asset_id
   JOIN real_estate_ownership_versions v ON v.company_id=a.company_id AND v.asset_id=a.id AND v.effective_from<=i.issue_date AND (v.effective_to IS NULL OR v.effective_to>=i.issue_date)
   JOIN real_estate_ownership_shares h ON h.company_id=v.company_id AND h.ownership_version_id=v.id
   WHERE i.company_id=$1 AND h.contact_id=$2 AND i.id=ANY($5::int[]) AND a.kind=ANY($6::text[])
   AND i.type='sales_invoice' AND i.status IN('sent','overdue','partially_paid','paid') AND s.source_type='rent' AND x.treatment='owner_funds' AND a.ownership_mode='managed'
   AND ((i.issue_date>=$3::date AND i.issue_date<$3::date+interval '1 month') OR EXISTS(
     SELECT 1 FROM invoice_payments p WHERE p.company_id=i.company_id AND p.invoice_id=i.id
     AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $4)>=$3::date AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $4)<$3::date+interval '1 month'))
   ORDER BY i.id,v.id`,[companyId,ownerId,first,timezone,invoiceIds,kinds])).rows;
 const ids=[...new Set<number>(obligations.map((i:any)=>Number(i.id)))];
 const issues:Array<{invoiceId:number;invoiceNumber:string;reason:'ownership'|'invoice_posting'|'note_access'|'note_posting'|'receipt_posting'|'amount_basis'}>=[];
 if(!ids.length)return {period,timezone,rows:[],incomplete:0,issues};
 const notes=(await client.query(`SELECT n.id,n.parent_invoice_id,n.type,n.currency,n.subtotal,n.total_amount,
   (SELECT count(*)::int FROM journal_entries j WHERE j.company_id=n.company_id AND j.reference_type='invoice' AND j.reference_id=n.id AND j.status='posted') posted_journals
   FROM invoices n WHERE n.company_id=$1 AND n.parent_invoice_id=ANY($2::int[]) AND n.type IN('credit_note','debit_note') AND n.status IN('sent','overdue','partially_paid','paid') ORDER BY n.id`,[companyId,ids])).rows;
 const receipts=(await client.query(`SELECT p.id,p.invoice_id,p.amount,
   ((p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $4)>=$3::date AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $4)<$3::date+interval '1 month') in_period,
   (SELECT count(*)::int FROM journal_entries j WHERE j.company_id=p.company_id AND j.reference_type IN('payment','invoice_payment') AND j.reference_id=p.id AND j.status='posted') posted_journals
   FROM invoice_payments p WHERE p.company_id=$1 AND p.invoice_id=ANY($2::int[]) ORDER BY p.payment_date,p.id`,[companyId,ids,first,timezone])).rows;
 const totals=new Map<string,{currency:string;obligations:number;expected:string;collected:string;unfunded:string}>();let incomplete=0;
 for(const id of ids){
   const matches=obligations.filter((i:any)=>Number(i.id)===id),i=matches[0],related=notes.filter((n:any)=>Number(n.parent_invoice_id)===id),payments=receipts.filter((p:any)=>Number(p.invoice_id)===id);
   // Overlapping ownership or missing/duplicate postings make attribution ambiguous.
   const reason=matches.length!==1?'ownership':Number(i.posted_journals)!==1?'invoice_posting':related.some((n:any)=>!invoiceIds.includes(Number(n.id)))?'note_access':related.some((n:any)=>n.currency!==i.currency||Number(n.posted_journals)!==1)?'note_posting':payments.some((p:any)=>Number(p.posted_journals)!==1)?'receipt_posting':null;
   if(reason){incomplete++;issues.push({invoiceId:id,invoiceNumber:i.invoice_number,reason});continue;}
   try{
     const digits=erpCurrencyDigits(i.currency_decimal_places);let net=erpMinorUnits(i.subtotal,6),gross=erpMinorUnits(i.total_amount,6);
     for(const note of related){const sign=note.type==='credit_note'?-1n:1n;net+=sign*erpMinorUnits(note.subtotal,6);gross+=sign*erpMinorUnits(note.total_amount,6);}
     if(net<0n||gross<0n||net>gross)throw new Error('Invalid adjusted rent basis');
     const netAmount=erpMinorUnitsToAmount(net,6),grossAmount=erpMinorUnitsToAmount(gross,6);
     const expected=ownerFundsAfterNotes(grossAmount,netAmount,grossAmount,i.percentage,digits);
     let funded=0n,collected='0.000000';
     for(const payment of payments){const amount=erpMinorUnits(payment.amount,6);if(amount<=0n)throw new Error('Invalid receipt');const before=ownerFundsAfterNotes(erpMinorUnitsToAmount(funded,6),netAmount,grossAmount,i.percentage,digits);funded+=amount;const after=ownerFundsAfterNotes(erpMinorUnitsToAmount(funded,6),netAmount,grossAmount,i.percentage,digits);if(payment.in_period)collected=sumErpDecimals([collected,subtractErpDecimals(after,before,digits)],6);}
     const earned=ownerFundsAfterNotes(erpMinorUnitsToAmount(funded,6),netAmount,grossAmount,i.percentage,digits);
     const row=totals.get(i.currency)??{currency:i.currency,obligations:0,expected:'0.000000',collected:'0.000000',unfunded:'0.000000'};
     if(i.issued_in_period){row.obligations++;row.expected=sumErpDecimals([row.expected,expected],6);row.unfunded=sumErpDecimals([row.unfunded,subtractErpDecimals(expected,earned,digits)],6);}
     row.collected=sumErpDecimals([row.collected,collected],6);totals.set(i.currency,row);
   }catch{incomplete++;issues.push({invoiceId:id,invoiceNumber:i.invoice_number,reason:'amount_basis'});}
 }
 return {period,timezone,rows:[...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),incomplete,issues};
}
