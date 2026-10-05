import {scopeRealEstateReportInvoices} from './real-estate-report-invoice-scope';

/** Retained settlement snapshots may contain earlier fee/rent/expense bases.
 * Authorize every referenced source before exposing the complete settlement. */
export function scopeRealEstateSettlements(query:string,args:unknown[],invoiceIds:number[]){
 const settlementScope=`real_estate_settlements AS NOT MATERIALIZED (
 SELECT settlement.* FROM public.real_estate_settlements settlement WHERE NOT EXISTS(
  SELECT 1 FROM jsonb_path_query(COALESCE(settlement.lines,'{}'::jsonb),'$.**.invoiceId') ref(value)
  WHERE NOT EXISTS(SELECT 1 FROM invoices i WHERE i.company_id=settlement.company_id
   AND i.id::text=ref.value #>> '{}')) AND NOT EXISTS(
  SELECT 1 FROM jsonb_path_query(COALESCE(settlement.lines,'{}'::jsonb),'$.**.expenseId') ref(value)
  WHERE NOT EXISTS(SELECT 1 FROM public.real_estate_expenses expense JOIN invoices i
   ON i.id=expense.invoice_id AND i.company_id=expense.company_id
   WHERE expense.company_id=settlement.company_id AND expense.id::text=ref.value #>> '{}')))`;
 const withSettlements=query.startsWith('WITH ')?`WITH ${settlementScope}, ${query.slice(5)}`:`WITH ${settlementScope} ${query}`;
 return scopeRealEstateReportInvoices(withSettlements,args,invoiceIds);
}
