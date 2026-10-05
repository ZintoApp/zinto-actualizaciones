import {storage,ErpValidationError} from '../../storage';
import {getUserPermissions} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';

/** Reload the actor instead of trusting a route-time permission snapshot. */
export async function requireRealEstateHandoverActor(companyId:number,userId:number,contactId:number,assetKind:string){
 const actor=await storage.getUser(userId);
 if(!actor||actor.companyId!==companyId||actor.active!==true)throw new ErpValidationError('Active company handover actor required','not_found');
 const permissions=await getUserPermissions(actor),feature=assetKind==='unit'?'units':assetKind==='property'?'properties':null;
 if(!feature||!permissions.manage_real_estate_payment_plans||!permissions.view_real_estate_financials||!permissions[`manage_real_estate_${feature}`]||!(permissions.manage_accounting||permissions.post_journal_entries))throw new ErpValidationError('Handover permission required','not_found');
 const scope=resolveContactViewScope(permissions,actor.isSuperAdmin===true);
 if(!scope||!(await storage.getAccessibleContactIds([contactId],{companyId,userId,contactScope:scope})).includes(contactId))throw new ErpValidationError('Handover contact not found','not_found');
 return actor;
}
