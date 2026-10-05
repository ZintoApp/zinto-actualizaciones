/** Cumulative rounding over a stable ERP source interval, including signed notes. */
export function erpSourcePortionSql(value:string,total:string,start:string,amount:string,digits='2'){
 return `(sign(${value})*(round(abs(${value})*((${start})+(${amount}))/NULLIF(${total},0),${digits})-round(abs(${value})*(${start})/NULLIF(${total},0),${digits})))`;
}
/** Dated signed acquisition movements, including purchase notes on the linked
 * net asset account. Tax lines never become acquisition cost. */
export function realEstateCostMovements(dateParameter:string,includeReleases=true){
 return `SELECT s.id source_id,j.base_currency currency,
 s.allocated_amount amount,${erpSourcePortionSql('l.debit_base-COALESCE(l.credit_base,0)','l.debit','s.allocation_start','s.allocated_amount','j.base_decimal_places')} base_amount,
 CASE WHEN j.reference_type='invoice' THEN j.reference_id ELSE NULL END invoice_id,
 l.account_id,j.transaction_currency,NULL::int buyer_contact_id,NULL::int sale_id,j.transaction_decimal_places,j.base_decimal_places
 FROM real_estate_asset_cost_sources s JOIN journal_entries j ON j.id=s.journal_entry_id AND j.company_id=s.company_id
 JOIN journal_entry_lines l ON l.id=s.journal_line_id AND l.journal_entry_id=j.id
 WHERE s.company_id=$1 AND s.asset_id=asset.id AND s.removed_at IS NULL
 AND j.date::date<=${dateParameter}::date AND (j.status='posted' OR (j.status='reversed' AND EXISTS(
 SELECT 1 FROM journal_entries r WHERE r.company_id=j.company_id AND r.reversal_of_journal_entry_id=j.id AND r.status='posted' AND r.date::date>${dateParameter}::date)))
 UNION ALL
 SELECT s.id,nj.base_currency,${erpSourcePortionSql('nl.amount','ib.total','ib.before+s.allocation_start','s.allocated_amount','nj.transaction_decimal_places')},${erpSourcePortionSql('nl.base_amount','ib.total','ib.before+s.allocation_start','s.allocated_amount','nj.base_decimal_places')},i.id,
 nl.account_id,nj.transaction_currency,NULL::int,NULL::int,nj.transaction_decimal_places,nj.base_decimal_places
 FROM real_estate_asset_cost_sources s JOIN journal_entries j ON j.id=s.journal_entry_id AND j.company_id=s.company_id AND j.reference_type='invoice'
 JOIN invoices i ON i.id=j.reference_id AND i.company_id=j.company_id AND i.type='purchase_invoice'
 JOIN journal_entry_lines l ON l.id=s.journal_line_id AND l.journal_entry_id=j.id
 JOIN invoices note ON note.parent_invoice_id=i.id AND note.company_id=i.company_id AND note.type IN('credit_note','debit_note')
 JOIN journal_entries nj ON nj.company_id=note.company_id AND nj.reference_type='invoice' AND nj.reference_id=note.id
 JOIN LATERAL (SELECT sum(bl.debit) total,COALESCE(sum(bl.debit) FILTER(WHERE bl.id<l.id),0) before FROM journal_entry_lines bl WHERE bl.journal_entry_id=j.id AND bl.account_id=l.account_id AND bl.debit>0) ib ON true
 JOIN LATERAL (SELECT l.account_id,sum(nl.debit-COALESCE(nl.credit,0)) amount,CASE WHEN bool_and(nl.debit_base IS NOT NULL AND nl.credit_base IS NOT NULL) THEN sum(nl.debit_base-nl.credit_base) ELSE NULL END base_amount
 FROM journal_entry_lines nl WHERE nl.journal_entry_id=nj.id AND nl.account_id=l.account_id) nl ON true
 WHERE s.company_id=$1 AND s.asset_id=asset.id AND s.removed_at IS NULL AND j.status IN('posted','reversed')
 AND j.date::date<=${dateParameter}::date AND nj.date::date<=${dateParameter}::date AND (nj.status='posted' OR (nj.status='reversed' AND EXISTS(
 SELECT 1 FROM journal_entries r WHERE r.company_id=nj.company_id AND r.reversal_of_journal_entry_id=nj.id AND r.status='posted' AND r.date::date>${dateParameter}::date)))${includeReleases?`
 UNION ALL
 SELECT NULL::int,j.base_currency,l.debit-COALESCE(l.credit,0),l.debit_base-COALESCE(l.credit_base,0),NULL::int,
 l.account_id,j.transaction_currency,s.buyer_contact_id,s.id,j.transaction_decimal_places,j.base_decimal_places
 FROM real_estate_sale_agreements s
 JOIN journal_entries j ON j.id::text=s.terms->>'handoverJournalEntryId' AND j.company_id=s.company_id
 AND j.reference_type='adjustment' AND j.reference_id=s.id
 JOIN journal_entry_lines l ON l.journal_entry_id=j.id AND l.account_id::text=s.terms->>'inventoryAccountId'
 WHERE s.company_id=$1 AND s.asset_id=asset.id AND s.status='handed_over'
 AND EXISTS(SELECT 1 FROM real_estate_asset_cost_sources cs JOIN journal_entry_lines cl ON cl.id=cs.journal_line_id
 WHERE cs.company_id=s.company_id AND cs.asset_id=s.asset_id AND cs.removed_at IS NULL AND cl.account_id=l.account_id)
 AND j.date::date<=${dateParameter}::date AND (j.status='posted' OR (j.status='reversed' AND EXISTS(
 SELECT 1 FROM journal_entries r WHERE r.company_id=j.company_id AND r.reversal_of_journal_entry_id=j.id AND r.status='posted' AND r.date::date>${dateParameter}::date)))`:''}`;
}
