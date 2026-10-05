import {calendarDateToDate} from '../../../shared/date-format';
import { getPool } from '../../db';
import { storage,ErpValidationError } from '../../storage';
import { calculateTax } from './tax-service';
import type { ErpInvoicePostingContext } from '@shared/erp-invoice-posting';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {erpMinorUnits} from '../../../shared/erp-carrying-amount';
import {roundErpDecimal,sumErpDecimals} from './decimal-math';
import {calculateLeaseRentPeriod} from './real-estate-rent-period';

/** Domain orchestration around the shared atomic invoice and posting services. */
export async function createLeaseReceivable(companyId:number,userId:number,leaseId:number,periodKey:string,sourceType:'rent'|'security_deposit',loadInvoice?:(invoiceId:number)=>ReturnType<typeof storage.getInvoice>){
 const client=await getPool().connect();
 try{
  // A session lock spans the shared service's own transaction. Source uniqueness
  // remains the durable idempotency constraint if another process races.
  await client.query('SELECT pg_advisory_lock(78126,$1)',[companyId]);
  await client.query('BEGIN');
  // Keep lease dates, rent/deposit terms and ownership mode stable while the
  // shared ERP service commits the source invoice. NO KEY UPDATE permits that
  // service's foreign-key checks on the asset from its separate transaction.
  const lease=(await client.query('SELECT l.*,l.start_date::text start_date_key,l.end_date::text end_date_key,a.ownership_mode,a.name asset_name FROM real_estate_leases l JOIN real_estate_assets a ON a.id=l.asset_id AND a.company_id=l.company_id WHERE l.company_id=$1 AND l.id=$2 FOR NO KEY UPDATE OF l,a',[companyId,leaseId])).rows[0];
  if(!lease||!['active','expired'].includes(lease.status))throw new ErpValidationError('An active lease is required');
  const key=sourceType==='security_deposit'?'deposit':periodKey;
  const existing=(await client.query('SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type=$2 AND source_id=$3 AND period_key=$4',[companyId,sourceType,leaseId,key])).rows[0];
  if(existing){const invoice=await (loadInvoice??(id=>storage.getInvoice(id)))(existing.invoice_id);if(!invoice||invoice.companyId!==companyId)throw new ErpValidationError('Rent invoice not found','not_found');await client.query('COMMIT');return invoice;}
  const currency=(await client.query('SELECT * FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[companyId,lease.currency])).rows[0];
  if(!currency)throw new ErpValidationError('Lease currency is no longer active');
  const start=lease.start_date_key,end=lease.end_date_key;
  calendarDateToDate(start);calendarDateToDate(end);
  const digits=erpCurrencyDigits(currency.decimal_places);
  const contractualAmount=String(sourceType==='rent'?lease.rent_amount:lease.deposit_amount);
  // Reject unsupported contractual digits instead of silently changing terms.
  erpMinorUnits(contractualAmount,digits);
  let amount=roundErpDecimal(contractualAmount,digits),issueDate=start,dueDate=start;
  if(sourceType==='rent'){
   try{({amount,issueDate,dueDate}=calculateLeaseRentPeriod(start,end,contractualAmount,lease.due_day,periodKey,digits));}
   catch(error){throw new ErpValidationError(error instanceof Error?error.message:'Choose a valid rent period');}
  }
  if(erpMinorUnits(amount,digits)<=0n)throw new ErpValidationError('This obligation has no positive amount');
  const terms=lease.terms??{},productId=sourceType==='rent'?terms.rentCatalogItemId:terms.depositCatalogItemId;
  if(!Number.isInteger(productId))throw new ErpValidationError('Configure the lease billable item using the existing ERP Catalog');
  const product=await storage.getProduct(productId);
  if(!product||product.companyId!==companyId||product.status!=='active')throw new ErpValidationError('Select an active company Catalog item');
  const taxable=sourceType==='rent'&&product.isTaxable!==false;
  const taxGroupId=taxable&&Number.isInteger(terms.rentTaxGroupId)?terms.rentTaxGroupId:null;
  if(taxGroupId&&!(await client.query('SELECT 1 FROM tax_groups WHERE company_id=$1 AND id=$2 AND is_active=true',[companyId,taxGroupId])).rowCount)throw new ErpValidationError('Select an active ERP tax group');
  const invoiceIssueDate=calendarDateToDate(issueDate),invoiceDueDate=calendarDateToDate(dueDate);
  const tax=taxable?await calculateTax(companyId,amount,taxGroupId,undefined,{asOf:invoiceIssueDate,productType:product.type,decimalPlaces:digits}):{taxAmount:roundErpDecimal('0',digits),effectiveRate:'0.00'};
  const total=sumErpDecimals([amount,tax.taxAmount],digits);
  const treatment:ErpInvoicePostingContext['treatment']=sourceType==='security_deposit'?'deposit':lease.ownership_mode==='managed'?'owner_funds':'revenue';
  const accountId=sourceType==='security_deposit'?terms.depositAccountId:lease.ownership_mode==='managed'?terms.ownerFundsAccountId:terms.rentRevenueAccountId;
  if(!Number.isInteger(accountId))throw new ErpValidationError('Configure the appropriate existing ERP posting account in lease terms');
  const description=`${sourceType==='rent'?'Rent':'Security deposit'} · ${lease.name} · ${key}`;
  const created=await storage.createDraftInvoiceWithLineItemsAtomic({companyId,contactId:lease.tenant_contact_id,invoiceNumber:'',type:'sales_invoice',status:'draft',issueDate:invoiceIssueDate,dueDate:invoiceDueDate,currency:lease.currency,subtotal:amount,taxAmount:tax.taxAmount,discountAmount:'0',discountType:'none',discountValue:'0',totalAmount:total,amountPaid:'0',amountDue:total,createdBy:userId,notes:description},[{productId,description,quantity:'1',unitPrice:amount,discountType:'percentage',discountValue:'0',discountPercent:'0',taxRate:tax.effectiveRate,taxGroupId,sortOrder:0}],{recalculateTotalsFromLines:true,postingContext:{netAccountId:accountId,treatment,description},source:{assetId:lease.asset_id,sourceType,sourceId:leaseId,periodKey:key,accountingContext:{ownershipMode:lease.ownership_mode,treatment,issueDate,dueDate,currencyDecimalPlaces:digits}}});
  if(loadInvoice&&!await loadInvoice(created.id))throw new ErpValidationError('Rent invoice not found','not_found');await client.query('COMMIT');return created;
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{await client.query('SELECT pg_advisory_unlock(78126,$1)',[companyId]).catch(()=>{});client.release();}
}
