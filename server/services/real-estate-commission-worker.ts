import {getPool} from '../db';
import {accessibleInvoiceIds} from './erp/invoice-access';
import {scopeRealEstateReportInvoices} from './erp/real-estate-report-invoice-scope';
import {getErpCompanyCalendar} from './erp/company-calendar';
import {commissionFundingDateSql} from './erp/commission-funding-calendar';
import {storage} from '../storage';
import {getUserPermissions} from '../middleware';
import {resolveContactViewScope} from '../../shared/contact-access';
import {ERP_BUSINESS_TYPE_SETTING_KEY,normalizeErpBusinessType} from '../../shared/erp-capabilities';
import {logger} from '../utils/logger';
let running=false;
/** Recover missing commission accruals through the existing durable domain queue. */
export async function processRealEstateCommissionJobs(companyId?:number){
 const pool=getPool(),companies=(await pool.query('SELECT DISTINCT company_id FROM real_estate_commission_agreements WHERE automatic_accrual=true AND ($1::int IS NULL OR company_id=$1)',[companyId??null])).rows;
 for(const {company_id:c} of companies){
  if(normalizeErpBusinessType((await storage.getCompanySetting(c,ERP_BUSINESS_TYPE_SETTING_KEY))?.value)!=='real_estate')continue;
  const {timezone}=await getErpCompanyCalendar(c);
  await pool.query(`INSERT INTO real_estate_jobs(company_id,source_key,job_type,payload,run_at)
   SELECT a.company_id,'commission:'||a.id||':'||f.funding_type||':'||f.funding_id,'commission_accrual',
    jsonb_build_object('agreementId',a.id,'fundingType',f.funding_type,'fundingId',f.funding_id),now()
   FROM real_estate_commission_agreements a JOIN real_estate_commission_funding f ON f.company_id=a.company_id
   JOIN invoices i ON i.id=f.invoice_id AND i.company_id=f.company_id
   JOIN real_estate_invoice_sources s ON s.invoice_id=i.id AND s.company_id=i.company_id
   WHERE a.company_id=$1 AND a.automatic_accrual=true AND s.asset_id=a.asset_id AND i.currency=a.currency
    AND s.source_type IN('rent','installment') AND i.status IN('sent','paid','partially_paid','overdue')
    AND f.posting_status='posted' AND f.funding_status='posted' AND ${commissionFundingDateSql('f','$2')}>=a.effective_from
    AND (a.effective_to IS NULL OR ${commissionFundingDateSql('f','$2')}<=a.effective_to)
    AND NOT EXISTS(SELECT 1 FROM real_estate_commissions c WHERE c.company_id=a.company_id AND c.agreement_id=a.id AND
      ((f.funding_type='receipt' AND c.invoice_payment_id=f.funding_id) OR (f.funding_type='credit_allocation' AND c.credit_allocation_id=f.funding_id)))
   ORDER BY a.id,f.funding_date,f.funding_type,f.funding_id
   ON CONFLICT(company_id,source_key) DO UPDATE SET status='pending',run_at=now(),completed_at=NULL
    WHERE real_estate_jobs.status='completed'`,[c,timezone]);
 }
 const client=await pool.connect();let completed=0;
 try{
  await client.query('BEGIN');
  const jobs=(await client.query("SELECT * FROM real_estate_jobs WHERE job_type='commission_accrual' AND status IN('pending','failed') AND run_at<=now() AND ($1::int IS NULL OR company_id=$1) ORDER BY run_at,id LIMIT 25 FOR UPDATE SKIP LOCKED",[companyId??null])).rows;
  for(const job of jobs){await client.query('SAVEPOINT commission_job');try{
   if(normalizeErpBusinessType((await storage.getCompanySetting(job.company_id,ERP_BUSINESS_TYPE_SETTING_KEY))?.value)!=='real_estate')throw new Error('Automatic commissions require Real Estate ERP mode');
   const a=(await client.query('SELECT a.*,s.kind FROM real_estate_commission_agreements a JOIN real_estate_assets s ON s.id=a.asset_id AND s.company_id=a.company_id WHERE a.company_id=$1 AND a.id=$2',[job.company_id,job.payload.agreementId])).rows[0];
   if(a?.automatic_accrual===true){
    if(!['receipt','credit_allocation'].includes(job.payload.fundingType)||!Number.isSafeInteger(job.payload.fundingId)||job.payload.fundingId<=0)throw new Error('Invalid commission funding job');
    const actor=a.automatic_actor_id?await storage.getUser(a.automatic_actor_id):null;
    if(!actor||actor.companyId!==job.company_id||actor.active!==true)throw new Error('Automatic commissions require an active company actor');
    const p=await getUserPermissions(actor);
    if(!p.manage_real_estate_commissions||!p.view_real_estate_financials||(!p.manage_accounting&&!p.post_journal_entries)||!p[`manage_real_estate_${a.kind==='unit'?'units':'properties'}`])throw new Error('Automatic commission actor no longer has accounting and asset permission');
    const scoped=scopeRealEstateReportInvoices(`SELECT i.contact_id FROM real_estate_commission_funding f JOIN invoices i ON i.id=f.invoice_id AND i.company_id=f.company_id
     WHERE f.company_id=$1 AND f.funding_type=$2 AND f.funding_id=$3 AND NOT EXISTS(
      SELECT 1 FROM real_estate_commissions c JOIN public.real_estate_commission_funding original ON original.company_id=c.company_id
      AND ((original.funding_type='receipt' AND original.funding_id=c.invoice_payment_id) OR (original.funding_type='credit_allocation' AND original.funding_id=c.credit_allocation_id))
      WHERE c.company_id=f.company_id AND c.agreement_id=$4 AND c.status<>'reversed' AND original.invoice_id=f.invoice_id
      AND NOT EXISTS(SELECT 1 FROM real_estate_commission_funding visible WHERE visible.company_id=original.company_id
       AND visible.funding_type=original.funding_type AND visible.funding_id=original.funding_id AND visible.invoice_id=original.invoice_id))`,
     [job.company_id,job.payload.fundingType,job.payload.fundingId,a.id],await accessibleInvoiceIds({user:actor} as any));
    const f=(await client.query(scoped.text,scoped.values)).rows[0],scope=resolveContactViewScope(p,actor.isSuperAdmin===true);
    if(!f||!scope||!(await storage.getAccessibleContactIds([f.contact_id],{companyId:job.company_id,userId:actor.id,contactScope:scope})).length)throw new Error('Automatic commission actor no longer has CRM contact access');
    const result=await storage.accrueRealEstateCommission(job.company_id,actor.id,a.id,job.payload.fundingId,undefined,job.payload.fundingType,true);
    if(!result.suppressed)completed++;
   }
   await client.query("UPDATE real_estate_jobs SET status='completed',attempts=attempts+1,completed_at=now(),last_error=NULL WHERE company_id=$1 AND id=$2",[job.company_id,job.id]);
  }catch(e){await client.query('ROLLBACK TO SAVEPOINT commission_job');await client.query("UPDATE real_estate_jobs SET status='failed',attempts=attempts+1,last_error=$3,run_at=now()+interval '15 minutes' WHERE company_id=$1 AND id=$2",[job.company_id,job.id,(e as Error).message.slice(0,2000)]);}}
  await client.query('COMMIT');return completed;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export function startRealEstateCommissionWorker(){const run=async()=>{if(running)return;running=true;try{await processRealEstateCommissionJobs();}catch(e){logger.error('real-estate','Automatic commission accrual failed',e);}finally{running=false;}};setInterval(run,60000);void run();}
