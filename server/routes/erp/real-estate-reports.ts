import {scopeRealEstateSettlements} from '../../services/erp/real-estate-settlement-access';
import {realEstateOccupancySql} from '../../services/erp/real-estate-occupancy-report';
import {accessibleInvoiceIds} from '../../services/erp/invoice-access';
import {realEstateYieldSql} from '../../services/erp/real-estate-yield-report';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';
import {realEstateAgentReportSql} from '../../services/erp/real-estate-agent-report';
import {realEstatePerformanceSql} from '../../services/erp/real-estate-performance-report';
import {Router} from 'express';
import {z} from 'zod';
import {getPool} from '../../db';
import {storage,ErpValidationError} from '../../storage';
import {requireAnyPermission} from '../../middleware';
import {resolveContactViewScope} from '../../../shared/contact-access';
const router=Router();
router.get('/reports',requireAnyPermission(['view_real_estate_reports','manage_real_estate_reports']),async(req,res,next)=>{try{
 const c=res.locals.companyId,p=res.locals.permissions,has=(s:string)=>p[`view_real_estate_${s}`]||p[`manage_real_estate_${s}`];
 const f=z.object({from:z.string().date(),to:z.string().date(),currency:z.string().regex(/^[A-Z]{3}$/).optional()}).strict().parse(req.query);
 if(f.to<f.from||new Date(f.to).getTime()-new Date(f.from).getTime()>366*86400000)throw new ErpValidationError('Choose a report period of at most one year');
 const baseCurrency=p.view_real_estate_financials?await storage.getBaseCurrency(c):null;
 const currencies=p.view_real_estate_financials?(await getPool().query('SELECT code,name,COALESCE(decimal_places,2) AS "decimalPlaces" FROM currencies WHERE company_id=$1 AND is_active=true ORDER BY code',[c])).rows:[],currency=f.currency??baseCurrency?.code;
 if(p.view_real_estate_financials&&!currencies.some(r=>r.code===currency))throw new ErpValidationError('Select an active ERP currency');
 const scope=resolveContactViewScope(p,req.user!.isSuperAdmin===true),ids=(await getPool().query('SELECT id FROM contacts WHERE company_id=$1',[c])).rows.map(r=>r.id),allowed=scope?await storage.getAccessibleContactIds(ids,{companyId:c,userId:req.user!.id,contactScope:scope}):[];
 const {timezone,today:localToday}=await getErpCompanyCalendar(c);
 const data:any={timezone,from:f.from,to:f.to,currency:p.view_real_estate_financials?currency:null,baseCurrency:baseCurrency?{code:baseCurrency.code,decimalPlaces:baseCurrency.decimalPlaces??2}:null,currencies,availableReports:[],inventory:[],maintenance:[],inspections:[],receivables:[],expenses:[],sales:[],leaseExpiry:[],occupancy:[],projectInventory:[],reservations:[],settlements:[],commissions:[],arrears:[],incomeTrend:[],performance:[],agentPerformance:[],assetYield:[]};
 const kinds=['property','unit'].filter(k=>has(k==='unit'?'units':'properties'));
 data.availableReports=[...(kinds.length?['inventory']:[]),...(has('leases')?['leaseExpiry','occupancy']:[]),...(has('projects')&&has('units')?['projectInventory']:[]),...['maintenance','inspections'].filter(has),...(has('reservations')?['reservations']:[]),...(p.view_real_estate_financials?[...((has('rent_collection')||has('reservations')||has('payment_plans'))?['receivables','arrears','incomeTrend']:[]),...(has('expenses')?['expenses']:[]),...(has('payment_plans')?['sales']:[]),...(has('owner_settlements')?['settlements']:[]),...(has('commissions')?['commissions']:[])]:[])];
 if(kinds.length)data.inventory=(await getPool().query("SELECT a.kind,a.status,t.name property_type,count(*)::int count FROM real_estate_assets a LEFT JOIN real_estate_taxonomy t ON t.id=a.property_type_id AND t.company_id=a.company_id WHERE a.company_id=$1 AND a.kind=ANY($2::text[]) AND a.status<>'archived' GROUP BY a.kind,a.status,t.name ORDER BY a.kind,t.name,a.status",[c,kinds])).rows;
 for(const section of ['maintenance','inspections'])if(has(section))data[section]=(await getPool().query(`SELECT status,count(*)::int count FROM real_estate_${section} WHERE company_id=$1 AND (created_at AT TIME ZONE $4)>=$2::date AND (created_at AT TIME ZONE $4)<$3::date+interval '1 day' GROUP BY status ORDER BY status`,[c,f.from,f.to,timezone])).rows;
 if(has('leases'))data.leaseExpiry=(await getPool().query("SELECT l.id,l.name,l.end_date::text,c.name tenant_name FROM real_estate_leases l JOIN contacts c ON c.id=l.tenant_contact_id AND c.company_id=l.company_id WHERE l.company_id=$1 AND l.tenant_contact_id=ANY($2::int[]) AND l.status='active' AND l.end_date BETWEEN $3::date AND $4::date ORDER BY l.end_date,l.id LIMIT 500",[c,allowed,f.from,f.to])).rows;
 if(has('leases')&&kinds.length)data.occupancy=(await getPool().query(realEstateOccupancySql,[c,allowed,f.from,f.to,kinds])).rows;
 if(has('projects')&&has('units'))data.projectInventory=(await getPool().query("SELECT p.name project_name,a.status,count(*)::int count FROM real_estate_projects p JOIN real_estate_assets a ON a.project_id=p.id AND a.company_id=p.company_id AND a.kind='unit' WHERE p.company_id=$1 AND a.status<>'archived' GROUP BY p.id,p.name,a.status ORDER BY p.name,a.status",[c])).rows;
 if(has('reservations'))data.reservations=(await getPool().query("SELECT status,count(*)::int count FROM real_estate_reservations WHERE company_id=$1 AND buyer_contact_id=ANY($2::int[]) AND (created_at AT TIME ZONE $5)>=$3::date AND (created_at AT TIME ZONE $5)<$4::date+interval '1 day' GROUP BY status ORDER BY status",[c,allowed,f.from,f.to,timezone])).rows;
 if(p.view_real_estate_financials){
 const invoiceIds=await accessibleInvoiceIds(req);
 const financialQuery=(query:string,args:unknown[])=>{const scoped=scopeRealEstateSettlements(query,args,invoiceIds);return getPool().query(scoped.text,scoped.values);};
 const performanceSources=[...(has('rent_collection')?['rent','security_deposit']:[]),...(has('reservations')?['reservation_deposit']:[]),...(has('payment_plans')?['installment']:[]),...(has('expenses')?['expense']:[])];
 if(performanceSources.length||has('commissions')||has('owner_settlements')){data.availableReports.push('performance');data.performance=(await financialQuery(realEstatePerformanceSql,[c,allowed,currency,f.from,f.to,baseCurrency?.code,performanceSources,!!has('payment_plans'),!!has('commissions'),!!has('owner_settlements'),kinds])).rows;}
 if(kinds.length&&(p.view_accounting||p.manage_accounting)){data.availableReports.push('assetYield');data.assetYield=(await financialQuery(realEstateYieldSql,[c,allowed,currency,f.from,f.to,baseCurrency?.code,performanceSources,!!has('payment_plans'),!!has('commissions'),false,kinds,invoiceIds])).rows;}
 const types=[...(has('rent_collection')?['rent','security_deposit']:[]),...(has('reservations')?['reservation_deposit']:[]),...(has('payment_plans')?['installment']:[])];
 if(types.length)data.receivables=(await financialQuery("SELECT s.source_type,count(*)::int invoices,COALESCE(sum(i.total_amount),0)::text billed,COALESCE(sum((SELECT COALESCE(sum(CASE n.type WHEN 'credit_note' THEN -n.total_amount ELSE n.total_amount END),0) FROM invoices n WHERE n.parent_invoice_id=i.id AND n.company_id=i.company_id AND n.currency=i.currency AND n.type IN('credit_note','debit_note') AND n.status IN('sent','partially_paid','paid','overdue'))),0)::text adjustments,COALESCE(sum(i.total_amount+(SELECT COALESCE(sum(CASE n.type WHEN 'credit_note' THEN -n.total_amount ELSE n.total_amount END),0) FROM invoices n WHERE n.parent_invoice_id=i.id AND n.company_id=i.company_id AND n.currency=i.currency AND n.type IN('credit_note','debit_note') AND n.status IN('sent','partially_paid','paid','overdue'))),0)::text net_billed,COALESCE(sum(i.amount_paid),0)::text paid_to_date,  COALESCE(sum((SELECT COALESCE(sum(a.amount),0) FROM erp_credit_note_allocations a JOIN journal_entries j ON j.id=a.journal_entry_id AND j.company_id=a.company_id WHERE a.company_id=i.company_id AND a.target_invoice_id=i.id AND a.status='posted' AND j.status='posted')),0)::text credit_applied,  COALESCE(sum((SELECT COALESCE(sum(a.amount),0) FROM erp_invoice_noncash_settlements a JOIN journal_entries j ON j.id=a.journal_entry_id AND j.company_id=a.company_id WHERE a.company_id=i.company_id AND a.invoice_id=i.id AND a.status='posted' AND j.status='posted')),0)::text noncash_settled,  COALESCE(sum((SELECT COALESCE(sum(r.amount),0) FROM erp_credit_note_refunds r JOIN invoices n ON n.id=r.credit_note_id AND n.company_id=r.company_id JOIN journal_entries j ON j.id=r.journal_entry_id AND j.company_id=r.company_id WHERE n.parent_invoice_id=i.id AND r.company_id=i.company_id AND r.status='posted' AND j.status='posted')),0)::text refunded_to_date,COALESCE(sum(i.amount_due),0)::text outstanding,COALESCE(sum(i.amount_due) FILTER(WHERE i.due_date::date<$8::date),0)::text overdue,COALESCE(sum((SELECT COALESCE(sum(p.amount),0) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.company_id=i.company_id AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $7)>=$4::date AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $7)<$5::date+interval '1 day')),0)::text receipts_in_period FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND i.issue_date>=$4::date AND i.issue_date<$5::date+interval '1 day' AND s.source_type=ANY($6::text[]) AND i.status NOT IN('draft','cancelled','void') GROUP BY s.source_type ORDER BY s.source_type",[c,allowed,currency,f.from,f.to,types,timezone,localToday])).rows;
 if(types.length){
  data.arrears=(await financialQuery(`SELECT i.id,i.invoice_number,c.name contact_name,s.source_type,i.due_date::date::text due_date,
   GREATEST(0,$7::date-i.due_date::date)::int days_overdue,i.amount_due::text outstanding
   FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
   JOIN contacts c ON c.id=i.contact_id AND c.company_id=i.company_id
   WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($4::text[])
    AND i.status IN('sent','partially_paid','overdue') AND i.amount_due>0 AND i.due_date::date<$7::date
    AND i.issue_date>=$5::date AND i.issue_date<$6::date+interval '1 day'
   ORDER BY i.due_date,i.id LIMIT 500`,[c,allowed,currency,types,f.from,f.to,localToday])).rows;
  data.incomeTrend=(await financialQuery(`WITH months AS(SELECT generate_series(date_trunc('month',$4::date),date_trunc('month',$5::date),interval '1 month') period_start)
   SELECT to_char(m.period_start,'YYYY-MM') AS "month",
    COALESCE((SELECT sum(i.total_amount) FROM invoices i JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[])
      AND i.status IN('sent','partially_paid','paid','overdue') AND i.issue_date>=$4::date AND i.issue_date<$5::date+interval '1 day'
      AND date_trunc('month',i.issue_date)=m.period_start),0)::text billed,
    COALESCE((SELECT sum(p.amount) FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id
     JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[])
      AND i.status IN('sent','partially_paid','paid','overdue') AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $7)>=$4::date AND (p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $7)<$5::date+interval '1 day'
      AND date_trunc('month',p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE $7)=m.period_start),0)::text collected,
    COALESCE((SELECT sum(CASE note.type WHEN 'credit_note' THEN -note.total_amount ELSE note.total_amount END)
     FROM invoices note JOIN invoices i ON i.id=note.parent_invoice_id AND i.company_id=note.company_id
     JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[])
      AND note.currency=i.currency AND note.type IN('credit_note','debit_note') AND note.status IN('sent','partially_paid','paid','overdue')
      AND note.issue_date>=$4::date AND note.issue_date<$5::date+interval '1 day' AND date_trunc('month',note.issue_date)=m.period_start),0)::text adjustments,
    COALESCE((SELECT sum(a.amount) FROM erp_credit_note_allocations a JOIN invoices i ON i.id=a.target_invoice_id AND i.company_id=a.company_id
     JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id JOIN journal_entries j ON j.id=a.journal_entry_id AND j.company_id=a.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[]) AND j.status IN('posted','reversed')
      AND j.date>=$4::date AND j.date<$5::date+interval '1 day' AND date_trunc('month',j.date)=m.period_start),0)::text credit_applied,
    COALESCE((SELECT sum(a.amount) FROM erp_credit_note_allocations a JOIN invoices i ON i.id=a.target_invoice_id AND i.company_id=a.company_id
     JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id JOIN journal_entries j ON j.id=a.reversal_journal_entry_id AND j.company_id=a.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[]) AND j.status='posted'
      AND j.date>=$4::date AND j.date<$5::date+interval '1 day' AND date_trunc('month',j.date)=m.period_start),0)::text credit_reversed,
    COALESCE((SELECT sum(a.amount) FROM erp_invoice_noncash_settlements a JOIN invoices i ON i.id=a.invoice_id AND i.company_id=a.company_id
     JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id JOIN journal_entries j ON j.id=a.journal_entry_id AND j.company_id=a.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[]) AND j.status IN('posted','reversed')
      AND j.date>=$4::date AND j.date<$5::date+interval '1 day' AND date_trunc('month',j.date)=m.period_start),0)::text noncash_settled,
    COALESCE((SELECT sum(a.amount) FROM erp_invoice_noncash_settlements a JOIN invoices i ON i.id=a.invoice_id AND i.company_id=a.company_id
     JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id JOIN journal_entries j ON j.id=a.reversal_journal_entry_id AND j.company_id=a.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[]) AND j.status='posted'
      AND j.date>=$4::date AND j.date<$5::date+interval '1 day' AND date_trunc('month',j.date)=m.period_start),0)::text noncash_reversed,
    COALESCE((SELECT sum(r.amount) FROM erp_credit_note_refunds r JOIN invoices n ON n.id=r.credit_note_id AND n.company_id=r.company_id
     JOIN invoices i ON i.id=n.parent_invoice_id AND i.company_id=n.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
     JOIN journal_entries j ON j.id=r.journal_entry_id AND j.company_id=r.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[]) AND j.status IN('posted','reversed')
      AND j.date>=$4::date AND j.date<$5::date+interval '1 day' AND date_trunc('month',j.date)=m.period_start),0)::text refunded,
    COALESCE((SELECT sum(r.amount) FROM erp_credit_note_refunds r JOIN invoices n ON n.id=r.credit_note_id AND n.company_id=r.company_id
     JOIN invoices i ON i.id=n.parent_invoice_id AND i.company_id=n.company_id JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
     JOIN journal_entries j ON j.id=r.reversal_journal_entry_id AND j.company_id=r.company_id
     WHERE i.company_id=$1 AND i.contact_id=ANY($2::int[]) AND i.currency=$3 AND s.source_type=ANY($6::text[]) AND j.status='posted'
      AND j.date>=$4::date AND j.date<$5::date+interval '1 day' AND date_trunc('month',j.date)=m.period_start),0)::text refunds_returned
   FROM months m ORDER BY m.period_start`,[c,allowed,currency,f.from,f.to,types,timezone])).rows;
 }
 if(has('expenses'))data.expenses=(await getPool().query("SELECT e.status,e.owner_chargeable,count(*)::int count,COALESCE(sum(e.amount),0)::text amount FROM real_estate_expenses e JOIN real_estate_assets a ON a.id=e.asset_id AND a.company_id=e.company_id WHERE e.company_id=$1 AND e.currency=$2 AND e.expense_date BETWEEN $3::date AND $4::date AND a.kind=ANY($5::text[]) GROUP BY e.status,e.owner_chargeable ORDER BY e.status,e.owner_chargeable",[c,currency,f.from,f.to,kinds])).rows;
 if(has('payment_plans'))data.sales=(await getPool().query("SELECT status,count(*)::int count,COALESCE(sum(sale_amount) FILTER(WHERE status<>'cancelled'),0)::text contracted FROM real_estate_sale_agreements WHERE company_id=$1 AND buyer_contact_id=ANY($2::int[]) AND currency=$3 AND (created_at AT TIME ZONE $6)>=$4::date AND (created_at AT TIME ZONE $6)<$5::date+interval '1 day' GROUP BY status ORDER BY status",[c,allowed,currency,f.from,f.to,timezone])).rows;
 if(has('owner_settlements'))data.settlements=(await financialQuery("SELECT status,count(*)::int count,COALESCE(sum(collected),0)::text collected,COALESCE(sum(fees),0)::text fees,COALESCE(sum(expenses),0)::text expenses,COALESCE(sum(adjustments),0)::text adjustments,COALESCE(sum(payable),0)::text payable,COALESCE(sum(paid),0)::text paid FROM real_estate_settlements WHERE company_id=$1 AND owner_contact_id=ANY($2::int[]) AND currency=$3 AND period_key BETWEEN to_char($4::date,'YYYY-MM') AND to_char($5::date,'YYYY-MM') GROUP BY status ORDER BY status",[c,allowed,currency,f.from,f.to])).rows;
 if(has('commissions')){data.availableReports.push('agentPerformance');data.agentPerformance=(await financialQuery(realEstateAgentReportSql,[c,allowed,currency,f.from,f.to,timezone])).rows;}
 if(has('commissions'))data.commissions=(await financialQuery("SELECT c.status,count(*)::int count,COALESCE(sum(c.amount) FILTER(WHERE c.status<>'reversed'),0)::text amount,COALESCE(sum(c.paid),0)::text paid FROM real_estate_commissions c JOIN real_estate_commission_funding p ON p.company_id=c.company_id AND ((p.funding_type='receipt' AND p.funding_id=c.invoice_payment_id) OR (p.funding_type='credit_allocation' AND p.funding_id=c.credit_allocation_id)) JOIN invoices i ON i.id=p.invoice_id AND i.company_id=p.company_id WHERE c.company_id=$1 AND i.contact_id=ANY($2::int[]) AND c.currency=$3 AND (c.created_at AT TIME ZONE $6)>=$4::date AND (c.created_at AT TIME ZONE $6)<$5::date+interval '1 day' GROUP BY c.status ORDER BY c.status",[c,allowed,currency,f.from,f.to,timezone])).rows;
 }
 res.json({data});
}catch(e){next(e);}});
export default router;
