import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {findErpSourceAllocation} from '../../../shared/erp-source-allocation';
import {erpSourcePortionSql,realEstateCostMovements} from './real-estate-cost-basis';
import {getPool} from '../../db';
import {ErpValidationError} from '../../storage';
import {getErpCompanyCalendar} from './company-calendar';

const eligible = `j.status='posted' AND (j.reference_type IN('manual','opening') OR (j.reference_type='invoice' AND EXISTS(SELECT 1 FROM invoices i JOIN erp_invoice_posting_contexts p ON p.invoice_id=i.id AND p.company_id=i.company_id WHERE i.company_id=j.company_id AND i.id=j.reference_id AND i.type='purchase_invoice' AND p.treatment='asset' AND p.net_account_id=l.account_id)))
 AND j.reversal_of_journal_entry_id IS NULL AND a.type='asset'
 AND l.debit>0 AND l.credit=0 AND l.debit_base>0 AND COALESCE(l.credit_base,0)=0
 AND j.transaction_currency IS NOT NULL AND j.base_currency IS NOT NULL`;

const includedAtDate = `s.removed_at IS NULL AND j.date::date<=$3::date AND (j.status='posted' OR (j.status='reversed' AND EXISTS(SELECT 1 FROM journal_entries r WHERE r.company_id=j.company_id AND r.reversal_of_journal_entry_id=j.id AND r.status='posted' AND r.date::date>$3::date)))`;

export async function getRealEstateCostSources(companyId:number,assetId:number,search:string,includeCandidates:boolean,asOf?:string,visibleInvoiceIds:number[]=[],visibleBuyerIds:number[]=[],canReadSales=false){
 const pool=getPool();
 const date=asOf??(await getErpCompanyCalendar(companyId)).today;
 const sources=(await pool.query(`SELECT s.id,s.reason,s.created_at,s.removed_at,s.removal_reason,
 CASE WHEN j.reference_type='invoice' THEN j.reference_id ELSE NULL END invoice_id,j.id journal_entry_id,j.entry_number,j.date::date::text date,j.status,j.transaction_currency currency,j.base_currency,j.transaction_decimal_places,j.base_decimal_places,
 a.name account_name,l.description,s.allocated_amount::text amount,${erpSourcePortionSql('l.debit_base','l.debit','s.allocation_start','s.allocated_amount','j.base_decimal_places')}::text base_amount,l.debit::text source_amount,s.allocation_start::text allocation_start,
 (${includedAtDate}) active,
 (SELECT r.date::date::text FROM journal_entries r WHERE r.company_id=j.company_id AND r.reversal_of_journal_entry_id=j.id AND r.status='posted' LIMIT 1) reversal_date
 FROM real_estate_asset_cost_sources s JOIN journal_entries j ON j.id=s.journal_entry_id AND j.company_id=s.company_id
 JOIN journal_entry_lines l ON l.id=s.journal_line_id AND l.journal_entry_id=j.id
 JOIN chart_of_accounts a ON a.id=l.account_id AND a.company_id=j.company_id
 WHERE s.company_id=$1 AND s.asset_id=$2 AND (j.reference_type<>'invoice' OR j.reference_id=ANY($4::int[])) ORDER BY s.created_at DESC,s.id DESC`,[companyId,assetId,date,visibleInvoiceIds])).rows;
 const totals=(await pool.query(`SELECT m.currency,MAX(m.base_decimal_places)::int decimal_places,CASE WHEN bool_and(m.base_amount IS NOT NULL) THEN COALESCE(sum(m.base_amount),0)::text ELSE NULL END amount FROM real_estate_assets asset
 CROSS JOIN LATERAL (${realEstateCostMovements('$3')}) m WHERE asset.company_id=$1 AND asset.id=$2
 AND (m.invoice_id IS NULL OR m.invoice_id=ANY($4::int[])) AND (m.sale_id IS NULL OR ($6::boolean AND m.buyer_contact_id=ANY($5::int[]))) GROUP BY m.currency`,[companyId,assetId,date,visibleInvoiceIds,visibleBuyerIds,canReadSales])).rows;
 const adjusted=(await pool.query(`SELECT m.source_id,m.currency,MAX(m.base_decimal_places)::int decimal_places,CASE WHEN bool_and(m.base_amount IS NOT NULL) THEN sum(m.base_amount)::text ELSE NULL END amount FROM real_estate_assets asset
 CROSS JOIN LATERAL (${realEstateCostMovements('$3',false)}) m WHERE asset.company_id=$1 AND asset.id=$2
 AND (m.invoice_id IS NULL OR m.invoice_id=ANY($4::int[])) GROUP BY m.source_id,m.currency`,[companyId,assetId,date,visibleInvoiceIds])).rows;
 for(const source of sources)source.adjusted_cost=adjusted.filter(m=>m.source_id===source.id).map(m=>({currency:m.currency,amount:m.amount,decimal_places:m.decimal_places}));
 const restricted=(await pool.query(`SELECT 1 FROM real_estate_assets asset CROSS JOIN LATERAL (${realEstateCostMovements('$3')}) m WHERE asset.company_id=$1 AND asset.id=$2 AND ((m.invoice_id IS NOT NULL AND NOT m.invoice_id=ANY($4::int[])) OR (m.sale_id IS NOT NULL AND NOT($6::boolean AND m.buyer_contact_id=ANY($5::int[])))) LIMIT 1`,[companyId,assetId,date,visibleInvoiceIds,visibleBuyerIds,canReadSales])).rowCount!==0;
 const releases=(await pool.query(`SELECT m.sale_id,m.currency,MAX(m.base_decimal_places)::int decimal_places,(-sum(m.base_amount))::text amount FROM real_estate_assets asset CROSS JOIN LATERAL (${realEstateCostMovements('$3')}) m WHERE asset.company_id=$1 AND asset.id=$2 AND m.sale_id IS NOT NULL AND $5::boolean AND m.buyer_contact_id=ANY($4::int[]) GROUP BY m.sale_id,m.currency`,[companyId,assetId,date,visibleBuyerIds,canReadSales])).rows;
 const currencies=(await pool.query('SELECT code,COALESCE(decimal_places,2) AS "decimalPlaces" FROM currencies WHERE company_id=$1',[companyId])).rows;
 const candidates=includeCandidates?(await pool.query(`SELECT CASE WHEN j.reference_type='invoice' THEN j.reference_id ELSE NULL END invoice_id,l.id,j.entry_number,j.date::date::text date,a.name account_name,
 l.description,(l.debit-COALESCE((SELECT sum(s.allocated_amount) FROM real_estate_asset_cost_sources s WHERE s.journal_line_id=l.id AND s.removed_at IS NULL),0))::text amount,l.debit::text source_amount,l.debit_base::text base_amount,j.transaction_currency currency,j.base_currency,j.transaction_decimal_places,j.base_decimal_places
 FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id
 JOIN chart_of_accounts a ON a.id=l.account_id AND a.company_id=j.company_id
 WHERE j.company_id=$1 AND ${eligible}
 AND (j.reference_type<>'invoice' OR j.reference_id=ANY($3::int[]))
 AND l.debit>COALESCE((SELECT sum(s.allocated_amount) FROM real_estate_asset_cost_sources s WHERE s.journal_line_id=l.id AND s.removed_at IS NULL),0)
 AND NOT EXISTS(SELECT 1 FROM real_estate_asset_cost_sources s WHERE s.journal_line_id=l.id AND s.asset_id=$4 AND s.removed_at IS NULL)
 AND (j.entry_number ILIKE $2 OR COALESCE(l.description,'') ILIKE $2 OR a.name ILIKE $2)
 ORDER BY j.date DESC,j.id DESC,l.id LIMIT 50`,[companyId,`%${search.replace(/[\\%_]/g,'\\$&')}%`,visibleInvoiceIds,assetId])).rows:[];
 return {sources,totals,currencies,candidates,releases,asOf:date,restricted};
}

export async function changeRealEstateCostSource(companyId:number,userId:number,assetId:number,kind:string,reason:string,lineId?:number,sourceId?:number,authorizeInvoice?:(id:number)=>Promise<boolean>,allocationAmount?:string){
 reason=reason.trim();
 if(reason.length<3||reason.length>1000)throw new ErpValidationError('Provide an attribution reason');
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const asset=(await client.query('SELECT * FROM real_estate_assets WHERE company_id=$1 AND id=$2 AND kind=$3 FOR UPDATE',[companyId,assetId,kind])).rows[0];
  if(!asset||asset.ownership_mode!=='company_owned')throw new ErpValidationError('Company-owned asset not found','not_found');
  if((await client.query("SELECT 1 FROM real_estate_sale_agreements WHERE company_id=$1 AND asset_id=$2 AND status='handed_over' LIMIT 1",[companyId,assetId])).rowCount)throw new ErpValidationError('Delivered asset cost attribution requires accounting reconciliation');
  let source;
  if(sourceId){
   const prior=(await client.query("SELECT j.reference_type,j.reference_id FROM real_estate_asset_cost_sources s JOIN journal_entries j ON j.id=s.journal_entry_id AND j.company_id=s.company_id WHERE s.company_id=$1 AND s.asset_id=$2 AND s.id=$3",[companyId,assetId,sourceId])).rows[0];
   if(prior?.reference_type==='invoice'&&(!authorizeInvoice||!await authorizeInvoice(prior.reference_id)))throw new ErpValidationError('Cost invoice not found','not_found');
   source=(await client.query(`UPDATE real_estate_asset_cost_sources SET removed_at=now(),removed_by=$3,removal_reason=$4
    WHERE company_id=$1 AND asset_id=$2 AND id=$5 AND removed_at IS NULL RETURNING *`,[companyId,assetId,userId,reason,sourceId])).rows[0];
   if(!source)throw new ErpValidationError('Active cost source not found','not_found');
  }else{
   const invoiceRef=(await client.query("SELECT j.reference_id FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id WHERE j.company_id=$1 AND l.id=$2 AND j.reference_type='invoice'",[companyId,lineId])).rows[0];
   if(invoiceRef)await client.query('SELECT id FROM invoices WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,invoiceRef.reference_id]);
   const line=(await client.query(`SELECT l.id,l.debit::text amount,j.transaction_decimal_places,j.id journal_entry_id,j.reference_type,j.reference_id FROM journal_entries j
    JOIN journal_entry_lines l ON l.journal_entry_id=j.id JOIN chart_of_accounts a ON a.id=l.account_id AND a.company_id=j.company_id
    WHERE j.company_id=$1 AND l.id=$2 AND ${eligible} FOR UPDATE OF j,l`,[companyId,lineId])).rows[0];
   if(!line)throw new ErpValidationError('Select a posted ERP acquisition asset line');
   if(line.reference_type==='invoice'){if(!authorizeInvoice||!await authorizeInvoice(line.reference_id))throw new ErpValidationError('Cost invoice not found','not_found');}
   const existing=(await client.query('SELECT asset_id,allocation_start::text start,allocated_amount::text amount FROM real_estate_asset_cost_sources WHERE journal_line_id=$1 AND removed_at IS NULL ORDER BY allocation_start',[lineId])).rows;
   if(existing.some(s=>s.asset_id===assetId))throw new ErpValidationError('This ERP line is already attributed to this asset','version_conflict');
   let portion;try{portion=findErpSourceAllocation(line.amount,existing,allocationAmount,erpCurrencyDigits(line.transaction_decimal_places));}catch(e){throw new ErpValidationError(e instanceof Error?e.message:'Reconcile source allocation','version_conflict');}
   source=(await client.query(`INSERT INTO real_estate_asset_cost_sources(company_id,asset_id,journal_entry_id,journal_line_id,reason,created_by,allocation_start,allocated_amount)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[companyId,assetId,line.journal_entry_id,lineId,reason,userId,portion.start,portion.amount])).rows[0];
  }
  await client.query(`INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action,actor_user_id,details)
   VALUES($1,$2,$3,$4,$5,$6)`,[companyId,kind==='unit'?'real_estate_unit':'real_estate_property',assetId,sourceId?'cost_source_removed':'cost_source_linked',userId,JSON.stringify({sourceId:source.id,journalEntryId:source.journal_entry_id,allocationStart:source.allocation_start,allocatedAmount:source.allocated_amount,reason})]);
  await client.query('COMMIT');return source;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
