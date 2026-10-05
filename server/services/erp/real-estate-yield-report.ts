import {realEstateCostMovements} from './real-estate-cost-basis';
import {buildRealEstatePerformanceSql} from './real-estate-performance-report';

const assetPerformance=buildRealEstatePerformanceSql(true);

export const realEstateYieldSql=`SELECT asset.id asset_id,asset.name asset_name,asset.kind,
 $6::text base_currency,performance.base_revenue::text base_revenue,
 performance.base_expenses::text base_expenses,performance.base_profit::text base_profit,
 basis.amount::text base_cost,
 CASE WHEN NOT coverage.complete OR basis.restricted THEN 'restricted' WHEN basis.currency_conflict OR performance.currency_conflict THEN 'currency_mismatch' WHEN basis.amount IS NULL OR basis.amount<=0 THEN 'missing_basis' ELSE 'available' END yield_status,
 CASE WHEN coverage.complete AND NOT basis.restricted AND NOT basis.currency_conflict AND NOT performance.currency_conflict AND basis.amount>0 THEN round(performance.base_profit/basis.amount*100,4)::text ELSE NULL END period_yield
 FROM real_estate_assets asset
 CROSS JOIN LATERAL (
  SELECT COALESCE(sum(p.base_revenue::numeric),0) base_revenue,COALESCE(sum(p.base_expenses::numeric),0) base_expenses,
  COALESCE(sum(p.base_profit::numeric),0) base_profit,COALESCE(bool_or(p.currency_conflict),false) currency_conflict FROM (${assetPerformance}) p
 ) performance
 LEFT JOIN LATERAL (
  SELECT sum(m.base_amount) FILTER(WHERE m.currency=$6 AND (m.invoice_id IS NULL OR m.invoice_id=ANY($12::int[])) AND (m.sale_id IS NULL OR ($8::boolean AND m.buyer_contact_id=ANY($2::int[])))) amount,
   COALESCE(bool_or(m.currency IS DISTINCT FROM $6 OR m.base_amount IS NULL),false) currency_conflict,
   COALESCE(bool_or((m.invoice_id IS NOT NULL AND NOT m.invoice_id=ANY($12::int[])) OR (m.sale_id IS NOT NULL AND NOT($8::boolean AND m.buyer_contact_id=ANY($2::int[])))),false) restricted
  FROM (${realEstateCostMovements('$5')}) m
 ) basis ON true
 CROSS JOIN LATERAL (
  SELECT NOT EXISTS(
   SELECT 1 FROM real_estate_invoice_sources s JOIN public.invoices i ON i.id=s.invoice_id AND i.company_id=s.company_id
   WHERE s.company_id=$1 AND s.asset_id=asset.id AND i.status NOT IN('draft','cancelled','void')
   AND (NOT s.source_type=ANY($7::text[]) OR (s.source_type<>'expense' AND NOT i.contact_id=ANY($2::int[])) OR NOT EXISTS(SELECT 1 FROM invoices authorized WHERE authorized.id=i.id AND authorized.company_id=i.company_id))
  ) AND ($9::boolean OR NOT EXISTS(
   SELECT 1 FROM real_estate_commissions c JOIN real_estate_commission_agreements a ON a.id=c.agreement_id AND a.company_id=c.company_id
   WHERE c.company_id=$1 AND a.asset_id=asset.id
  )) complete
 ) coverage
 WHERE asset.company_id=$1 AND asset.kind=ANY($11::text[]) AND asset.ownership_mode='company_owned'
 ORDER BY asset.name,asset.id`;
