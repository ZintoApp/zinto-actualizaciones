/** Reports consume IDs enumerated by the shared ERP invoice-access policy.
 * Exclude a parent's totals when any issued adjustment is inaccessible, rather
 * than leaking its amount or silently reporting an incomplete obligation. */
export function scopeRealEstateReportInvoices(query:string,args:unknown[],invoiceIds:number[]){
 const parameter=`$${args.length+1}`;
 const scope=`report_invoice_ids AS MATERIALIZED (SELECT visible.id FROM public.invoices visible
 WHERE visible.id=ANY(${parameter}::int[]) AND NOT EXISTS(
  SELECT 1 FROM public.invoices note WHERE note.company_id=visible.company_id
  AND note.parent_invoice_id=visible.id AND note.type IN('credit_note','debit_note')
  AND note.status IN('sent','overdue','partially_paid','paid') AND NOT note.id=ANY(${parameter}::int[])
 )), invoices AS NOT MATERIALIZED (SELECT visible.* FROM public.invoices visible
 WHERE visible.id=ANY(ARRAY(SELECT id FROM report_invoice_ids))),
 erp_credit_note_allocations AS NOT MATERIALIZED (SELECT allocation.* FROM public.erp_credit_note_allocations allocation
 WHERE allocation.credit_note_id=ANY(ARRAY(SELECT id FROM report_invoice_ids))
 AND allocation.target_invoice_id=ANY(ARRAY(SELECT id FROM report_invoice_ids))
 AND EXISTS(SELECT 1 FROM public.invoices note WHERE note.id=allocation.credit_note_id AND note.company_id=allocation.company_id
  AND note.parent_invoice_id=ANY(ARRAY(SELECT id FROM report_invoice_ids)))),
 real_estate_commission_funding AS NOT MATERIALIZED (SELECT funding.* FROM public.real_estate_commission_funding funding
 WHERE funding.invoice_id=ANY(ARRAY(SELECT id FROM report_invoice_ids))
 AND (funding.funding_type='receipt' OR (funding.funding_type='credit_allocation' AND EXISTS(
  SELECT 1 FROM erp_credit_note_allocations allocation WHERE allocation.company_id=funding.company_id
  AND allocation.id=funding.funding_id AND allocation.target_invoice_id=funding.invoice_id))))`;
 return {text:query.startsWith('WITH ')?`WITH ${scope}, ${query.slice(5)}`:`WITH ${scope} ${query}`,values:[...args,invoiceIds]};
}
