import {erpMinorUnits,erpMinorUnitsToAmount} from '../../../shared/erp-carrying-amount';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {subtractErpDecimals} from './decimal-math';
import {ErpValidationError} from '../../storage';
import {ownerFundsAfterNotes} from '../../../shared/real-estate-settlement-entitlement';
/** Caller holds the company settlement lock; invoice locks serialize ERP notes/receipts. */
export async function prepareOwnerRentLines(client:any,companyId:number,receipts:any[]){
 const basis=new Map<number,any>();
 for(const invoiceId of [...new Set<number>(receipts.map(r=>Number(r.invoice_id)))].sort((a,b)=>a-b)){
  const invoice=(await client.query("SELECT i.*,j.id journal_id,j.base_currency FROM invoices i JOIN journal_entries j ON j.company_id=i.company_id AND j.reference_type='invoice' AND j.reference_id=i.id AND j.status='posted' WHERE i.company_id=$1 AND i.id=$2 AND i.status IN('sent','overdue','partially_paid','paid') FOR UPDATE OF i",[companyId,invoiceId])).rows;
  if(invoice.length!==1)throw new ErpValidationError('Reconcile posted rent invoice before preparing settlement');
  const i=invoice[0],notes=(await client.query("SELECT n.id,n.type,n.subtotal,n.total_amount,n.currency,j.id journal_id,j.status,j.base_currency FROM invoices n LEFT JOIN journal_entries j ON j.company_id=n.company_id AND j.reference_type='invoice' AND j.reference_id=n.id WHERE n.company_id=$1 AND n.parent_invoice_id=$2 AND n.type IN('credit_note','debit_note') AND n.status IN('sent','overdue','partially_paid','paid') ORDER BY n.id",[companyId,invoiceId])).rows;
  if(notes.some((n:any)=>n.status!=='posted'||n.currency!==i.currency||n.base_currency!==i.base_currency))throw new ErpValidationError('Reconcile posted ERP rent notes before preparing settlement');
  const digits=erpCurrencyDigits(i.currency_decimal_places);let net=erpMinorUnits(String(i.subtotal),6),total=erpMinorUnits(String(i.total_amount),6);
  for(const n of notes){const sign=n.type==='credit_note'?-1n:1n;net+=sign*erpMinorUnits(String(n.subtotal),6);total+=sign*erpMinorUnits(String(n.total_amount),6);}
  if(net<0n||total<0n||net>total)throw new ErpValidationError('Reconcile adjusted ERP rent totals');
  const payments=(await client.query("SELECT p.id,p.amount FROM invoice_payments p WHERE p.company_id=$1 AND p.invoice_id=$2 AND EXISTS(SELECT 1 FROM journal_entries j WHERE j.company_id=p.company_id AND j.reference_type IN('payment','invoice_payment') AND j.reference_id=p.id AND j.status='posted') ORDER BY p.payment_date,p.id",[companyId,invoiceId])).rows;
  let funded=0n;const ranges=new Map<number,any>();for(const p of payments){const before=funded;funded+=erpMinorUnits(String(p.amount),6);ranges.set(Number(p.id),{before:erpMinorUnitsToAmount(before,6),after:erpMinorUnitsToAmount(funded,6)});}
  basis.set(invoiceId,{invoice:i,digits,net:erpMinorUnitsToAmount(net,6),total:erpMinorUnitsToAmount(total,6),signature:JSON.stringify(notes.map((n:any)=>[n.id,n.type,n.subtotal,n.total_amount,n.journal_id])),ranges,hasNotes:notes.length>0});
 }
 return receipts.map(r=>{
  const b=basis.get(Number(r.invoice_id)),range=b.ranges.get(Number(r.payment_id));if(!range)throw new ErpValidationError('Reconcile posted rent receipt before preparing settlement');
  const share=Number(r.percentage).toFixed(4);
  const amount=subtractErpDecimals(ownerFundsAfterNotes(range.after,b.net,b.total,share,b.digits),ownerFundsAfterNotes(range.before,b.net,b.total,share,b.digits),b.digits);
  const originalAmount=subtractErpDecimals(ownerFundsAfterNotes(range.after,String(b.invoice.subtotal),String(b.invoice.total_amount),share,b.digits),ownerFundsAfterNotes(range.before,String(b.invoice.subtotal),String(b.invoice.total_amount),share,b.digits),b.digits);
  return {type:'rent_receipt',paymentId:r.payment_id,invoiceId:r.invoice_id,assetId:r.asset_id,ownershipVersionId:r.ownership_version_id,percentage:r.percentage,ownerFundsAccountId:r.net_account_id,amount,...(b.hasNotes?{originalAmount,creditNoteSignature:b.signature}:{})};
 }).filter(r=>Number(r.amount)>0);
}
