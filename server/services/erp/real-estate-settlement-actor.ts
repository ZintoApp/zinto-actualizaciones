import {storage,ErpValidationError} from '../../storage';
import {getPool} from '../../db';
import {getUserPermissions} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {accessibleInvoiceIds} from './invoice-access';
import {scopeRealEstateSettlements} from './real-estate-settlement-access';

/** Reuse current platform authority and the complete retained-source policy. */
export async function requireRealEstateSettlementActor(companyId:number,userId:number,settlementId:number,ownerId:number,payout=false,manage=false,posting=true){
 const actor=await storage.getUser(userId);
 if(!actor||actor.companyId!==companyId||actor.active!==true)throw new ErpValidationError('Active company settlement actor required','not_found');
 const permissions=await getUserPermissions(actor);
 if(!(permissions.view_real_estate_owner_settlements||permissions.manage_real_estate_owner_settlements)||!permissions.view_real_estate_financials||(posting&&!permissions.post_real_estate_settlements)||!(permissions.manage_accounting||permissions.post_journal_entries)||(payout&&!permissions.record_real_estate_payments)||(manage&&!permissions.manage_real_estate_owner_settlements))throw new ErpValidationError('Settlement posting permission required','not_found');
 const scope=resolveContactViewScope(permissions,actor.isSuperAdmin===true);
 if(!scope||!(await storage.getAccessibleContactIds([ownerId],{companyId,userId,contactScope:scope})).includes(ownerId))throw new ErpValidationError('Settlement owner not found','not_found');
 const scoped=scopeRealEstateSettlements('SELECT id FROM real_estate_settlements WHERE company_id=$1 AND id=$2 AND owner_contact_id=$3',[companyId,settlementId,ownerId],await accessibleInvoiceIds({user:actor} as any));
 if(!(await getPool().query(scoped.text,scoped.values)).rows.length)throw new ErpValidationError('Settlement invoice evidence not found','not_found');
 return actor;
}
