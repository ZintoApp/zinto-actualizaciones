/** Inclusive contractual calendar days. Merge overlapping/adjacent visible
 * leases per asset before aggregating, so one asset-day is counted once. */
export const realEstateOccupancySql=`WITH assets AS (
 SELECT id,company_id,kind FROM real_estate_assets
 WHERE company_id=$1 AND kind=ANY($5::text[]) AND listing_purpose IN('rent','both') AND status<>'archived'
), intervals AS (
 SELECT a.id asset_id,GREATEST(l.start_date,$3::date) starts,LEAST(l.end_date,$4::date) ends
 FROM assets a JOIN real_estate_leases l ON l.company_id=a.company_id AND l.asset_id=a.id
 WHERE l.tenant_contact_id=ANY($2::int[]) AND l.status IN('active','expired')
 AND l.start_date<=$4::date AND l.end_date>=$3::date AND l.start_date<=l.end_date
), preceding AS (
 SELECT *,max(ends) OVER(PARTITION BY asset_id ORDER BY starts,ends ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prior_end
 FROM intervals
), islands AS (
 SELECT *,sum(CASE WHEN prior_end IS NULL OR starts>prior_end+1 THEN 1 ELSE 0 END)
 OVER(PARTITION BY asset_id ORDER BY starts,ends ROWS UNBOUNDED PRECEDING) island FROM preceding
), merged AS (
 SELECT asset_id,island,min(starts) starts,max(ends) ends FROM islands GROUP BY asset_id,island
), occupied AS (
 SELECT asset_id,sum(ends-starts+1) days FROM merged GROUP BY asset_id
)
SELECT a.kind,count(*)::int rentable_assets,COALESCE(sum(o.days),0)::text occupied_days,
 (count(*)*($4::date-$3::date+1))::text available_days
FROM assets a LEFT JOIN occupied o ON o.asset_id=a.id GROUP BY a.kind ORDER BY a.kind`;
