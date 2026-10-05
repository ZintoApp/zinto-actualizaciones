import {commissionFundingDateSql} from './commission-funding-calendar';
/** Current retained commission entitlement for funding dated in the report period. */
export const realEstateAgentReportSql=`SELECT u.id agent_id,COALESCE(u.full_name,u.username) agent_name,
 count(*)::int funding_records,
 COALESCE(sum(c.amount) FILTER(WHERE c.status<>'reversed'),0)::text entitlement,
 COALESCE(sum(c.paid) FILTER(WHERE c.status<>'reversed'),0)::text paid,
 COALESCE(sum(c.amount-c.paid) FILTER(WHERE c.status<>'reversed'),0)::text outstanding,
 count(*) FILTER(WHERE c.status='reversed')::int reversed_records,
 count(*) FILTER(WHERE jsonb_array_length(COALESCE(c.accounting_snapshot->'creditReconciliations','[]'::jsonb))>0)::int corrected_records
 FROM real_estate_commissions c JOIN real_estate_commission_agreements a ON a.id=c.agreement_id AND a.company_id=c.company_id
 JOIN users u ON u.id=a.agent_user_id AND u.company_id=a.company_id
 JOIN real_estate_commission_funding f ON f.company_id=c.company_id
 AND ((f.funding_type='receipt' AND f.funding_id=c.invoice_payment_id) OR (f.funding_type='credit_allocation' AND f.funding_id=c.credit_allocation_id))
 JOIN invoices i ON i.id=f.invoice_id AND i.company_id=f.company_id
 WHERE c.company_id=$1 AND i.contact_id=ANY($2::int[]) AND c.currency=$3 AND ${commissionFundingDateSql('f','$6')} BETWEEN $4::date AND $5::date
 GROUP BY u.id,u.full_name,u.username ORDER BY agent_name,u.id`;
