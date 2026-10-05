import {loadAccessibleInvoice} from './erp/invoice-access';
import {getPool} from '../db';
import {storage} from '../storage';
import {getZonedDateTimeParts} from '../../shared/utils/agent-schedule';
import {normalizeTimezone,validateTimezone} from '../utils/timezone';
import {createLeaseReceivable} from './erp/real-estate-receivables';
import {logger} from '../utils/logger';
import {getUserPermissions} from '../middleware';
import {resolveContactViewScope} from '../../shared/contact-access';
import {ERP_BUSINESS_TYPE_SETTING_KEY,normalizeErpBusinessType} from '../../shared/erp-capabilities';
let running=false;
/** Durable monthly jobs reuse invoice source uniqueness and ERP posting. */
export async function processRealEstateRentJobs(){
 const pool=getPool(),companies=(await pool.query("SELECT DISTINCT company_id FROM real_estate_leases WHERE status IN('active','expired')")).rows;
 for(const {company_id:companyId} of companies){
  if(normalizeErpBusinessType((await storage.getCompanySetting(companyId,ERP_BUSINESS_TYPE_SETTING_KEY))?.value)!=='real_estate')continue;
  const configured=(await storage.getCompanySetting(companyId,'defaultTimezone'))?.value,zone=typeof configured==='string'?normalizeTimezone(configured):null;if(!zone||!validateTimezone(zone))continue;
  const today=getZonedDateTimeParts(new Date(),zone).dateKey;
  const sync=await pool.connect();try{await sync.query('BEGIN');await sync.query('SELECT pg_advisory_xact_lock(78124,$1)',[companyId]);
   const expired=(await sync.query("UPDATE real_estate_leases SET status='expired',version=version+1,updated_at=now() WHERE company_id=$1 AND status='active' AND end_date<$2::date RETURNING id,asset_id",[companyId,today])).rows;
   for(const lease of expired)await sync.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action)VALUES($1,'real_estate_lease',$2,'expired')",[companyId,lease.id]);
   await sync.query("UPDATE real_estate_assets a SET status=CASE WHEN EXISTS(SELECT 1 FROM real_estate_leases l WHERE l.company_id=a.company_id AND l.asset_id=a.id AND l.status='active' AND l.start_date<=$2::date AND l.end_date>=$2::date) THEN 'rented' ELSE 'available' END,version=version+1,updated_at=now() WHERE a.company_id=$1 AND a.status IN('available','rented') AND a.status<>CASE WHEN EXISTS(SELECT 1 FROM real_estate_leases l WHERE l.company_id=a.company_id AND l.asset_id=a.id AND l.status='active' AND l.start_date<=$2::date AND l.end_date>=$2::date) THEN 'rented' ELSE 'available' END",[companyId,today]);await sync.query('COMMIT');
  }catch(e){await sync.query('ROLLBACK');throw e;}finally{sync.release();}
  // Recover every unbilled month, including final months of leases expired by
  // a previous run. Existing invoice sources remain the authoritative ledger.
  await pool.query(`INSERT INTO real_estate_jobs(company_id,source_key,job_type,payload,run_at)
   SELECT l.company_id,'rent:'||l.id||':'||to_char(period.month,'YYYY-MM'),'rent_generation',
    jsonb_build_object('leaseId',l.id,'periodKey',to_char(period.month,'YYYY-MM')),now()
   FROM real_estate_leases l
   CROSS JOIN LATERAL generate_series(date_trunc('month',l.start_date::timestamp),
    date_trunc('month',LEAST(l.end_date,$2::date)::timestamp),interval '1 month') period(month)
   WHERE l.company_id=$1 AND l.status IN('active','expired')
    AND l.terms->>'automaticRent'='true' AND l.start_date<=$2::date
    AND NOT EXISTS(SELECT 1 FROM real_estate_invoice_sources s JOIN invoices i ON i.id=s.invoice_id AND i.company_id=s.company_id
     WHERE s.company_id=l.company_id AND s.source_type='rent' AND s.source_id=l.id
      AND s.period_key=to_char(period.month,'YYYY-MM') AND i.status<>'draft')
   ON CONFLICT(company_id,source_key) DO UPDATE SET status='pending',run_at=now(),completed_at=NULL
    WHERE real_estate_jobs.status='completed'`,[companyId,today]);

 }
 const client=await pool.connect();let completed=0;try{
  await client.query('BEGIN');const jobs=(await client.query("SELECT * FROM real_estate_jobs WHERE job_type='rent_generation' AND status IN('pending','failed') AND run_at<=now() ORDER BY run_at LIMIT 25 FOR UPDATE SKIP LOCKED")).rows;
  for(const job of jobs){await client.query('SAVEPOINT rent_job');try{
    if(normalizeErpBusinessType((await storage.getCompanySetting(job.company_id,ERP_BUSINESS_TYPE_SETTING_KEY))?.value)!=='real_estate')throw new Error('Automatic rent requires Real Estate ERP mode');
    const lease=(await client.query('SELECT status,created_by,terms,tenant_contact_id FROM real_estate_leases WHERE company_id=$1 AND id=$2',[job.company_id,job.payload.leaseId])).rows[0];
    if(lease&&['active','expired'].includes(lease.status)&&lease.terms?.automaticRent===true){
      const actor=lease.created_by?await storage.getUser(lease.created_by):null;
      if(!actor||actor.companyId!==job.company_id||actor.active!==true)throw new Error('Automatic rent requires an active company actor');
      const permissions=await getUserPermissions(actor);
      if(!permissions.manage_invoices||!permissions.manage_real_estate_rent_collection||!permissions.view_real_estate_financials)throw new Error('Automatic rent actor no longer has financial billing permission');
      const scope=resolveContactViewScope(permissions,actor.isSuperAdmin===true);
      if(!scope||!(await storage.getAccessibleContactIds([lease.tenant_contact_id],{companyId:job.company_id,userId:actor.id,contactScope:scope})).length)throw new Error('Automatic rent actor no longer has tenant contact access');
      const invoice=await createLeaseReceivable(job.company_id,actor.id,job.payload.leaseId,job.payload.periodKey,'rent',invoiceId=>loadAccessibleInvoice({user:actor} as Parameters<typeof loadAccessibleInvoice>[0],invoiceId,'manage'));if(invoice?.status==='draft')await storage.sendInvoice(invoice.id,job.company_id,actor.id);completed++;
    }
    await client.query("UPDATE real_estate_jobs SET status='completed',attempts=attempts+1,completed_at=now(),last_error=NULL WHERE company_id=$1 AND id=$2",[job.company_id,job.id]);
   }catch(e){await client.query('ROLLBACK TO SAVEPOINT rent_job');await client.query("UPDATE real_estate_jobs SET status='failed',attempts=attempts+1,last_error=$3,run_at=now()+interval '15 minutes' WHERE company_id=$1 AND id=$2",[job.company_id,job.id,(e as Error).message.slice(0,2000)]);}}
  await client.query('COMMIT');return completed;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export function startRealEstateRentWorker(){const run=async()=>{if(running)return;running=true;try{await processRealEstateRentJobs();}catch(e){logger.error('real-estate','Recurring rent generation failed',e);}finally{running=false;}};setInterval(run,60000);void run();}
