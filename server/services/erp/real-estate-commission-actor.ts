import {storage,ErpValidationError} from '../../storage';
import {getPool} from '../../db';
import {getUserPermissions} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
import {accessibleInvoiceIds} from './invoice-access';
import {scopeRealEstateReportInvoices} from './real-estate-report-invoice-scope';

type Target={commissionId:number}|{agreementId:number;fundingId:number;fundingType:'receipt'|'credit_allocation'};
/** Financial mutations reuse current platform authority and scoped ERP funding. */
export async function requireRealEstateCommissionActor(companyId:number,userId:number,target:Target,payment=false,manageAsset=true){
 const actor=await storage.getUser(userId);
 if(!actor||actor.companyId!==companyId||actor.active!==true)throw new ErpValidationError('Active company commission actor required','not_found');
 const permissions=await getUserPermissions(actor);
 if(!permissions.manage_real_estate_commissions||!permissions.view_real_estate_financials||!(permissions.manage_accounting||permissions.post_journal_entries)||(payment&&!permissions.record_real_estate_payments))throw new ErpValidationError('Commission accounting permission required','not_found');
 const record='commissionId' in target;
 const query=`SELECT a.id agreement_id,s.kind,i.contact_id FROM real_estate_commission_agreements a
 JOIN real_estate_assets s ON s.company_id=a.company_id AND s.id=a.asset_id
 ${record?`JOIN real_estate_commissions c ON c.company_id=a.company_id AND c.agreement_id=a.id`:''}
 JOIN real_estate_commission_funding f ON f.company_id=a.company_id AND ${record?`((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))`:`f.funding_type=$3 AND f.funding_id=$4`}
 JOIN invoices i ON i.company_id=f.company_id AND i.id=f.invoice_id
 JOIN real_estate_invoice_sources source ON source.company_id=i.company_id AND source.invoice_id=i.id AND source.asset_id=a.asset_id AND source.source_type IN('rent','installment')
 WHERE a.company_id=$1 AND ${record?'c.id=$2':'a.id=$2'} AND NOT EXISTS(
 SELECT 1 FROM real_estate_commissions sibling JOIN public.real_estate_commission_funding original ON original.company_id=sibling.company_id
 AND ((original.funding_type='receipt' AND original.funding_id=sibling.invoice_payment_id) OR (original.funding_type='credit_allocation' AND original.funding_id=sibling.credit_allocation_id))
 WHERE sibling.company_id=a.company_id AND sibling.agreement_id=a.id AND sibling.status<>'reversed' AND original.invoice_id=f.invoice_id
 AND NOT EXISTS(SELECT 1 FROM real_estate_commission_funding visible WHERE visible.company_id=original.company_id
 AND visible.funding_type=original.funding_type AND visible.funding_id=original.funding_id AND visible.invoice_id=original.invoice_id))`;
 const args=record?[companyId,target.commissionId]:[companyId,target.agreementId,target.fundingType,target.fundingId];
 const scoped=scopeRealEstateReportInvoices(query,args,await accessibleInvoiceIds({user:actor} as any));
 const row=(await getPool().query(scoped.text,scoped.values)).rows[0];
 if(!row||(manageAsset&&!permissions[`manage_real_estate_${row.kind==='unit'?'units':'properties'}`]))throw new ErpValidationError('Commission source not found','not_found');
 const scope=resolveContactViewScope(permissions,actor.isSuperAdmin===true);
 if(!scope||!(await storage.getAccessibleContactIds([row.contact_id],{companyId,userId,contactScope:scope})).includes(row.contact_id))throw new ErpValidationError('Commission contact not found','not_found');
 return actor;
}
