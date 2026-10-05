import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';

/** Receipts before handover remain ERP liabilities, never sale revenue. */
export async function createReservationReceivable(companyId:number,userId:number,reservationId:number,productId:number,liabilityAccountId:number,version:number,loadInvoice?:(invoiceId:number)=>ReturnType<typeof storage.getInvoice>){
 const client=await getPool().connect();try{
 await client.query('SELECT pg_advisory_lock(78128,$1)',[companyId]);
 await client.query('BEGIN');
 const row=(await client.query('SELECT * FROM real_estate_reservations WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,reservationId])).rows[0];
 if(!row)throw new ErpValidationError('Reservation not found','not_found');
 const source=(await client.query("SELECT invoice_id FROM real_estate_invoice_sources WHERE company_id=$1 AND source_type='reservation_deposit' AND source_id=$2",[companyId,reservationId])).rows[0];
 if(source){const invoice=await (loadInvoice??(id=>storage.getInvoice(id)))(source.invoice_id);if(!invoice||invoice.companyId!==companyId)throw new ErpValidationError('Reservation invoice not found','not_found');await client.query('COMMIT');return invoice;}
 if(!['held','confirmed'].includes(row.status)||new Date(row.expires_at)<=new Date())throw new ErpValidationError('An unexpired reservation is required');
 if(row.version!==version)throw new ErpValidationError('Record changed. Reload before billing.','version_conflict');
 const currency=(await client.query('SELECT decimal_places FROM currencies WHERE company_id=$1 AND code=$2 AND is_active=true',[companyId,row.currency])).rows[0];
 if(!currency)throw new ErpValidationError('Select an active ERP currency');
 const amount=Number(row.deposit_amount).toFixed(currency.decimal_places??2);if(Number(amount)<=0)throw new ErpValidationError('A positive reservation deposit is required');
 const product=await storage.getProduct(productId);if(!product||product.companyId!==companyId||product.status!=='active')throw new ErpValidationError('Select an active ERP Catalog item');
 if(!(await client.query("SELECT 1 FROM chart_of_accounts WHERE company_id=$1 AND id=$2 AND type='liability' AND is_active=true",[companyId,liabilityAccountId])).rowCount)throw new ErpValidationError('Select an active ERP liability account');
 // The source and its
 // invoice are committed atomically by ERP; the row lock prevents edit/expiry
 // during that call. Retry recovers the durable source after a process failure.
 const description=`Reservation deposit #${reservationId}`;
 const invoice=await storage.createDraftInvoiceWithLineItemsAtomic({companyId,contactId:row.buyer_contact_id,type:'sales_invoice',status:'draft',invoiceNumber:'',issueDate:new Date(),dueDate:new Date(row.expires_at),currency:row.currency,subtotal:amount,taxAmount:'0',totalAmount:amount,amountPaid:'0',amountDue:amount,createdBy:userId,notes:description},[{productId,description,quantity:'1',unitPrice:amount,discountType:'percentage',discountValue:'0',taxRate:'0',sortOrder:0}],{recalculateTotalsFromLines:true,postingContext:{netAccountId:liabilityAccountId,treatment:'deposit',description},source:{sourceType:'reservation_deposit',sourceId:reservationId,periodKey:'deposit',assetId:row.asset_id,accountingContext:{reservationId,liabilityAccountId,currency:row.currency,depositAmount:amount}}});
 if(loadInvoice&&!await loadInvoice(invoice.id))throw new ErpValidationError('Reservation invoice not found','not_found');
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)VALUES($1,'real_estate_reservation',$2,'invoice_created',$3,$4)",[companyId,reservationId,userId,JSON.stringify({invoiceId:invoice.id})]);await client.query('COMMIT');return invoice;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.query('SELECT pg_advisory_unlock(78128,$1)',[companyId]).catch(()=>{});client.release();}
}
