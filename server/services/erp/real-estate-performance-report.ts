/** Recognize only retained ERP postings that resolve to authorized domain sources.
 * Original reversed journals and their posted reversals remain dated movements.
 */
export function buildRealEstatePerformanceSql(assetScoped=false):string {
 const invoiceRelation=assetScoped?'scoped_invoices':'invoices';
 const saleRelation=assetScoped?'scoped_sales':'real_estate_sale_agreements';
 const scope=assetScoped?`scoped_invoices AS (
  SELECT i.* FROM invoices i WHERE i.company_id=$1 AND EXISTS(
   SELECT 1 FROM real_estate_invoice_sources src WHERE src.company_id=i.company_id
   AND src.invoice_id=COALESCE(i.parent_invoice_id,i.id) AND src.asset_id=asset.id)
 ), scoped_sales AS (SELECT s.* FROM real_estate_sale_agreements s WHERE s.company_id=$1 AND s.asset_id=asset.id), `:'';
 return `WITH ${scope}source_journals AS (
 SELECT j.id FROM journal_entries j JOIN ${invoiceRelation} n ON n.id=j.reference_id AND n.company_id=j.company_id
 JOIN ${invoiceRelation} i ON i.id=COALESCE(n.parent_invoice_id,n.id) AND i.company_id=n.company_id
 JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
 WHERE j.company_id=$1 AND j.reference_type='invoice' AND (i.contact_id=ANY($2::int[]) OR (s.source_type='expense' AND EXISTS(SELECT 1 FROM real_estate_assets a WHERE a.company_id=s.company_id AND a.id=s.asset_id AND a.kind=ANY($11::text[])))) AND s.source_type=ANY($7::text[])
 UNION
 SELECT j.id FROM journal_entries j JOIN invoice_payments p ON p.id=j.reference_id AND p.company_id=j.company_id
 JOIN ${invoiceRelation} i ON i.id=p.invoice_id AND i.company_id=p.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
 WHERE j.company_id=$1 AND j.reference_type IN('payment','invoice_payment') AND i.contact_id=ANY($2::int[]) AND s.source_type=ANY($7::text[])
 UNION
 SELECT (s.terms->>'handoverJournalEntryId')::int FROM ${saleRelation} s
 WHERE s.company_id=$1 AND $8::boolean AND s.buyer_contact_id=ANY($2::int[]) AND s.terms->>'handoverJournalEntryId' IS NOT NULL
 UNION
 SELECT c.journal_entry_id FROM real_estate_commissions c JOIN real_estate_commission_funding f ON f.company_id=c.company_id
 AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 JOIN ${invoiceRelation} i ON i.id=f.invoice_id AND i.company_id=f.company_id WHERE c.company_id=$1 AND $9::boolean AND i.contact_id=ANY($2::int[])
 UNION
 SELECT (r->>'journalEntryId')::int FROM real_estate_commissions c JOIN real_estate_commission_funding f ON f.company_id=c.company_id
 AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 JOIN ${invoiceRelation} i ON i.id=f.invoice_id AND i.company_id=f.company_id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.accounting_snapshot->'creditReconciliations','[]'::jsonb)) r
 WHERE c.company_id=$1 AND $9::boolean AND i.contact_id=ANY($2::int[])
 UNION
 SELECT (p->>'journalEntryId')::int FROM real_estate_commissions c JOIN real_estate_commission_funding f ON f.company_id=c.company_id
 AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 JOIN ${invoiceRelation} i ON i.id=f.invoice_id AND i.company_id=f.company_id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.accounting_snapshot->'payouts','[]'::jsonb)) p
 WHERE c.company_id=$1 AND $9::boolean AND i.contact_id=ANY($2::int[])
 UNION
 SELECT (r->>'journalEntryId')::int FROM real_estate_commissions c JOIN real_estate_commission_funding f ON f.company_id=c.company_id
 AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 JOIN ${invoiceRelation} i ON i.id=f.invoice_id AND i.company_id=f.company_id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.accounting_snapshot->'payouts','[]'::jsonb)) p
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p->'recoveries',CASE WHEN p->'recovery' IS NOT NULL THEN jsonb_build_array(p->'recovery') ELSE '[]'::jsonb END)) r
 WHERE c.company_id=$1 AND $9::boolean AND i.contact_id=ANY($2::int[])
 UNION
 SELECT s.journal_entry_id FROM real_estate_settlements s WHERE s.company_id=$1 AND $10::boolean AND s.owner_contact_id=ANY($2::int[])
 UNION
 SELECT (r->>'journalEntryId')::int FROM real_estate_settlements s
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.lines->'creditReconciliations','[]'::jsonb)) r
 WHERE s.company_id=$1 AND $10::boolean AND s.owner_contact_id=ANY($2::int[])
 UNION
 SELECT (p->>'journalEntryId')::int FROM real_estate_settlements s
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.lines->'payouts','[]'::jsonb)) p
 WHERE s.company_id=$1 AND $10::boolean AND s.owner_contact_id=ANY($2::int[])
 UNION
 SELECT (r->>'journalEntryId')::int FROM real_estate_settlements s
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.lines->'payouts','[]'::jsonb)) p
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p->'recoveries',CASE WHEN p->'recovery' IS NOT NULL THEN jsonb_build_array(p->'recovery') ELSE '[]'::jsonb END)) r
 WHERE s.company_id=$1 AND $10::boolean AND s.owner_contact_id=ANY($2::int[])
 UNION
 SELECT r.journal_entry_id FROM erp_credit_note_refunds r JOIN ${invoiceRelation} n ON n.id=r.credit_note_id AND n.company_id=r.company_id
 JOIN ${invoiceRelation} i ON i.id=n.parent_invoice_id AND i.company_id=n.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
 WHERE r.company_id=$1 AND i.contact_id=ANY($2::int[]) AND s.source_type=ANY($7::text[])
 UNION
 SELECT r.reversal_journal_entry_id FROM erp_credit_note_refunds r JOIN ${invoiceRelation} n ON n.id=r.credit_note_id AND n.company_id=r.company_id
 JOIN ${invoiceRelation} i ON i.id=n.parent_invoice_id AND i.company_id=n.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
 WHERE r.company_id=$1 AND i.contact_id=ANY($2::int[]) AND s.source_type=ANY($7::text[])
 UNION
 SELECT d.journal_entry_id FROM erp_credit_note_allocations d JOIN ${invoiceRelation} i ON i.id=d.target_invoice_id AND i.company_id=d.company_id
 JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
 WHERE d.company_id=$1 AND i.contact_id=ANY($2::int[]) AND s.source_type=ANY($7::text[])
 UNION
 SELECT j.id FROM erp_invoice_noncash_settlements d JOIN real_estate_settlements s ON s.id=d.source_id AND s.company_id=d.company_id
 JOIN ${invoiceRelation} n ON n.company_id=d.company_id AND (n.id=d.invoice_id OR n.parent_invoice_id=d.invoice_id)
 JOIN journal_entries j ON j.company_id=d.company_id AND j.reference_type='invoice' AND j.reference_id=n.id
 WHERE s.company_id=$1 AND $10::boolean AND d.source_type='owner_settlement' AND s.owner_contact_id=ANY($2::int[])
), retained AS (
 SELECT j.* FROM journal_entries j WHERE j.company_id=$1 AND j.status IN('posted','reversed')
 AND (j.id IN(SELECT id FROM source_journals) OR j.reversal_of_journal_entry_id IN(SELECT id FROM source_journals))
 AND j.transaction_currency=$3 ${assetScoped?'':'AND j.base_currency=$6'} AND j.date>=$4::date AND j.date<$5::date+interval '1 day'
), totals AS (
 SELECT to_char(j.date,'YYYY-MM') AS "month",
 COALESCE(sum(l.credit-l.debit) FILTER(WHERE a.type='revenue' AND j.base_currency=$6),0) revenue,
 COALESCE(sum(l.debit-l.credit) FILTER(WHERE a.type='expense' AND j.base_currency=$6),0) expenses,
 COALESCE(sum(l.credit_base-l.debit_base) FILTER(WHERE a.type='revenue' AND j.base_currency=$6),0) base_revenue,
 COALESCE(sum(l.debit_base-l.credit_base) FILTER(WHERE a.type='expense' AND j.base_currency=$6),0) base_expenses,
 COALESCE(bool_or(a.type IN('revenue','expense') AND (j.base_currency IS DISTINCT FROM $6 OR l.debit_base IS NULL OR l.credit_base IS NULL)),false) currency_conflict
 FROM retained j JOIN journal_entry_lines l ON l.journal_entry_id=j.id JOIN chart_of_accounts a ON a.id=l.account_id AND a.company_id=j.company_id
 GROUP BY to_char(j.date,'YYYY-MM')
) SELECT "month",revenue::text recognized_revenue,expenses::text recognized_expenses,(revenue-expenses)::text net_profit,
 $6::text base_currency,base_revenue::text base_revenue,base_expenses::text base_expenses,(base_revenue-base_expenses)::text base_profit
 ${assetScoped?',currency_conflict':''}
 FROM totals ORDER BY "month"`;
}

export const realEstatePerformanceSql=buildRealEstatePerformanceSql();
