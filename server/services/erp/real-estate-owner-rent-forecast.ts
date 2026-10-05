import {calculateLeaseRentPeriod} from './real-estate-rent-period';
import {ownerFundsAfterNotes} from '../../../shared/real-estate-settlement-entitlement';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {sumErpDecimals} from './decimal-math';
import {erpMinorUnits} from '../../../shared/erp-carrying-amount';

/** Contract forecast only. No invoice, receipt or accounting mutation. */
export async function loadOwnerRentForecast(client:any,input:{companyId:number;ownerId:number;period:string;kinds:string[];contactIds:number[];invoiceIds:number[]}){
 const {companyId,ownerId,period,kinds,contactIds,invoiceIds}=input;
 const leases=(await client.query(`SELECT l.id,l.start_date::text,l.end_date::text,l.rent_amount,l.due_day,l.currency,c.decimal_places,c.is_active currency_active,
   h.percentage,v.id ownership_version_id,s.id source_id,i.id invoice_id,i.status invoice_status
   FROM real_estate_leases l JOIN real_estate_assets a ON a.company_id=l.company_id AND a.id=l.asset_id
   JOIN real_estate_ownership_versions v ON v.company_id=a.company_id AND v.asset_id=a.id
     AND v.effective_from<=GREATEST(l.start_date,$3::date) AND (v.effective_to IS NULL OR v.effective_to>=GREATEST(l.start_date,$3::date))
   JOIN real_estate_ownership_shares h ON h.company_id=v.company_id AND h.ownership_version_id=v.id
   LEFT JOIN currencies c ON c.company_id=l.company_id AND c.code=l.currency
   LEFT JOIN real_estate_invoice_sources s ON s.company_id=l.company_id AND s.source_type='rent' AND s.source_id=l.id AND s.period_key=$4
   LEFT JOIN invoices i ON i.company_id=s.company_id AND i.id=s.invoice_id
   WHERE l.company_id=$1 AND h.contact_id=$2 AND a.kind=ANY($5::text[]) AND l.tenant_contact_id=ANY($6::int[])
   AND a.ownership_mode='managed' AND l.status IN('active','expired') AND l.start_date<$3::date+interval '1 month' AND l.end_date>=$3::date
   AND (i.id IS NULL OR (i.id=ANY($7::int[]) AND i.status='draft')) ORDER BY l.id,v.id`,[companyId,ownerId,period+'-01',period,kinds,contactIds,invoiceIds])).rows;
 const ids=[...new Set<number>(leases.map((lease:any)=>Number(lease.id)))],totals=new Map<string,{currency:string;leases:number;drafts:number;unissued:string}>();let incomplete=0;
 for(const id of ids){const matches=leases.filter((lease:any)=>Number(lease.id)===id),lease=matches[0];
   if(matches.length!==1||lease.currency_active!==true||(lease.source_id&&!lease.invoice_id)){incomplete++;continue;}
   try{const digits=erpCurrencyDigits(lease.decimal_places),basis=calculateLeaseRentPeriod(lease.start_date,lease.end_date,lease.rent_amount,Number(lease.due_day),period,digits);
     if(erpMinorUnits(basis.amount,digits)<=0n)throw new Error('No positive rent obligation');
     const portion=ownerFundsAfterNotes(basis.amount,basis.amount,basis.amount,lease.percentage,digits);
     const row=totals.get(lease.currency)??{currency:lease.currency,leases:0,drafts:0,unissued:'0.000000'};
     row.leases++;if(lease.invoice_id)row.drafts++;row.unissued=sumErpDecimals([row.unissued,portion],6);totals.set(lease.currency,row);
   }catch{incomplete++;}
 }
 return {rows:[...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),incomplete};
}
