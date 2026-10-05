import {storage,ErpValidationError} from '../../storage';
import {getPool} from '../../db';
import {getUserPermissions} from '../../middleware';
import {loadAccessibleInvoice} from './invoice-access';
import {assertErpGatewayEvidence,type ErpGatewayEvidence} from '../erp-gateway-money';
import type {ErpOnlineGateway} from '../../../shared/erp-payment-gateway';
import type {ErpInvoiceCheckoutSession} from '../../../shared/schema';

export type InvoicePaymentAuthorization={checkoutSessionId:number;verifiedEvidence?:ErpGatewayEvidence;verifiedCompanyId?:number};

/** Human mutations use the shared ERP policy; provider receipts retain evidence. */
export async function requireInvoiceMutationActor(companyId:number,invoiceId:number,userId:number|null|undefined,mode:'manage'|'payment',checkout?:ErpInvoiceCheckoutSession,authorization?:InvoicePaymentAuthorization){
 if(mode==='payment'&&checkout){
  if(checkout.companyId!==companyId||checkout.invoiceId!==invoiceId)throw new ErpValidationError('Checkout invoice authority required','not_found');
  if(checkout.gateway!=='bank_transfer'){
   if(!authorization?.verifiedEvidence||authorization.verifiedCompanyId!==companyId)throw new ErpValidationError('Verified provider receipt authority required','not_found');
   assertErpGatewayEvidence(checkout,companyId,checkout.gateway as ErpOnlineGateway,authorization.verifiedEvidence);
  }
 }
 if(userId!=null){
  const actor=await storage.getUser(userId);
  if(!actor||actor.companyId!==companyId||actor.active!==true)throw new ErpValidationError('Active company invoice actor required','not_found');
  const permissions=await getUserPermissions(actor);
  if(mode==='manage'?!permissions.manage_invoices:!(permissions.manage_invoices||permissions.record_payments))throw new ErpValidationError('Invoice mutation permission required','not_found');
  if(!await loadAccessibleInvoice({user:actor} as any,invoiceId,mode))throw new ErpValidationError('Invoice mutation access required','not_found');
  return;
 }
 if(mode==='payment'){
  if(!checkout||checkout.companyId!==companyId||checkout.invoiceId!==invoiceId||checkout.gateway==='bank_transfer'||!authorization?.verifiedEvidence||authorization.verifiedCompanyId!==companyId)throw new ErpValidationError('Verified provider receipt authority required','not_found');
  assertErpGatewayEvidence(checkout,companyId,checkout.gateway as ErpOnlineGateway,authorization.verifiedEvidence);
  return;
 }
 // The established order notification job may issue only its confirmed order.
 const authorized=(await getPool().query(`SELECT i.id FROM invoices i JOIN sales_orders o ON o.company_id=i.company_id AND o.id=i.sales_order_id
 WHERE i.company_id=$1 AND i.id=$2 AND i.type='sales_invoice' AND o.status='confirmed' AND o.contact_id=i.contact_id
 AND NOT EXISTS(SELECT 1 FROM real_estate_invoice_sources s WHERE s.company_id=i.company_id AND (s.invoice_id=i.id OR s.invoice_id=i.parent_invoice_id))`,[companyId,invoiceId])).rows;
 if(!authorized.length)throw new ErpValidationError('Authorized sales-order invoice job required','not_found');
}
