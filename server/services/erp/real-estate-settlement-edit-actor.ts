import {ErpValidationError} from '../../storage';
import {getPool} from '../../db';
import {getUserPermissions} from '../../middleware';
import {loadAccessibleInvoice} from './invoice-access';
import {requireRealEstateSettlementActor} from './real-estate-settlement-actor';

/** Draft edits and posted corrections retain their existing operation policies. */
export async function requireRealEstateSettlementEditActor(companyId:number,userId:number,settlementId:number,kind:'draft'|'draft_fee'|'rent'|'expense'|'fee',sourceId?:number){
 const row=(await getPool().query('SELECT owner_contact_id FROM real_estate_settlements WHERE company_id=$1 AND id=$2',[companyId,settlementId])).rows[0];
 if(!row)throw new ErpValidationError('Settlement not found','not_found');
 const actor=await requireRealEstateSettlementActor(companyId,userId,settlementId,Number(row.owner_contact_id),false,true,kind!=='draft'&&kind!=='draft_fee');
 const p=await getUserPermissions(actor),req={user:actor} as any;
 if((kind==='rent'&&!p.manage_real_estate_rent_collection)||(kind==='expense'&&!p.manage_real_estate_expenses))throw new ErpValidationError('Settlement source management required','not_found');
 if(kind==='draft_fee'&&!(p.view_invoices||p.manage_invoices))throw new ErpValidationError('Settlement source invoice not found','not_found');
 if(sourceId!==undefined){
  let invoiceId=sourceId;
  if(kind==='rent'){
   const rent=(await getPool().query("SELECT a.kind FROM real_estate_invoice_sources s JOIN real_estate_assets a ON a.company_id=s.company_id AND a.id=s.asset_id WHERE s.company_id=$1 AND s.invoice_id=$2 AND s.source_type='rent'",[companyId,sourceId])).rows[0];
   if(!rent||!p[`manage_real_estate_${rent.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Settlement rent not found','not_found');
  }
  if(kind==='expense'){
   const expense=(await getPool().query('SELECT e.invoice_id,a.kind FROM real_estate_expenses e JOIN real_estate_assets a ON a.company_id=e.company_id AND a.id=e.asset_id WHERE e.company_id=$1 AND e.id=$2',[companyId,sourceId])).rows[0];
   if(!expense||!p[`manage_real_estate_${expense.kind==='unit'?'units':'properties'}`])throw new ErpValidationError('Settlement expense not found','not_found');
   invoiceId=Number(expense.invoice_id);
  }
  if(!(p.view_invoices||p.manage_invoices)||!await loadAccessibleInvoice(req,invoiceId))throw new ErpValidationError('Settlement source invoice not found','not_found');
 }
 return actor;
}
