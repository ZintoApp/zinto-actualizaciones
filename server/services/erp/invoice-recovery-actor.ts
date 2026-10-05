import {storage,ErpValidationError} from '../../storage';
import {getUserPermissions} from '../../middleware';
import {accessibleInvoiceIds,invoiceContactAllowed} from './invoice-access';

/** Shared recovery must authorize the current actor, including direct retries. */
export async function requireInvoiceRecoveryActor(companyId:number,userId:number,invoiceIds:number[]=[],ownerIds:number[]=[]){
 const actor=await storage.getUser(userId);
 if(!actor||actor.companyId!==companyId||actor.active!==true)throw new ErpValidationError('Active company posting recovery actor required','not_found');
 const permissions=await getUserPermissions(actor);
 if(!(permissions.manage_invoices||permissions.record_payments)||!(permissions.manage_accounting||permissions.post_journal_entries))throw new ErpValidationError('Invoice payment and accounting posting permission required','not_found');
 const request={user:actor} as any;
 if(invoiceIds.length){const visible=new Set(await accessibleInvoiceIds(request,'payment'));if(invoiceIds.some(id=>!visible.has(id)))throw new ErpValidationError('Posting recovery invoice evidence not found','not_found');}
 if(ownerIds.length){
  if(!permissions.manage_real_estate_owner_settlements||!permissions.view_real_estate_financials)throw new ErpValidationError('Owner settlement recovery permission required','not_found');
  for(const id of ownerIds)if(!await invoiceContactAllowed(request,id))throw new ErpValidationError('Posting recovery owner not found','not_found');
 }
 return actor;
}
