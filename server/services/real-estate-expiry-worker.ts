import {getPool} from '../db';
import {logger} from '../utils/logger';
let running=false;
/** Durable source jobs are backed by an expiry sweep so missed enqueue/startup is recoverable. */
export async function expireRealEstateReservations(){
 const client=await getPool().connect();let expired=0;
 try{
 await client.query('BEGIN');
 const rows=(await client.query("SELECT r.id,r.company_id,r.asset_id FROM real_estate_reservations r WHERE r.status IN('held','confirmed') AND r.expires_at<=now() ORDER BY r.expires_at LIMIT 100 FOR UPDATE SKIP LOCKED")).rows;
 for(const row of rows){
 await client.query('SELECT id FROM real_estate_assets WHERE company_id=$1 AND id=$2 FOR UPDATE',[row.company_id,row.asset_id]);
 await client.query("UPDATE real_estate_reservations SET status='expired',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[row.company_id,row.id]);
 await client.query("UPDATE real_estate_assets a SET status='available',version=version+1,updated_at=now() WHERE a.company_id=$1 AND a.id=$2 AND a.status='reserved' AND NOT EXISTS(SELECT 1 FROM real_estate_reservations r WHERE r.company_id=a.company_id AND r.asset_id=a.id AND r.status IN('held','confirmed')) AND NOT EXISTS(SELECT 1 FROM real_estate_sale_agreements s WHERE s.company_id=a.company_id AND s.asset_id=a.id AND s.status IN('finalized','handed_over'))",[row.company_id,row.asset_id]);
 await client.query("UPDATE real_estate_jobs SET status='completed',attempts=attempts+1,completed_at=now() WHERE company_id=$1 AND source_key=$2",[row.company_id,`reservation_expiry:${row.id}`]);
 await client.query("INSERT INTO real_estate_activity(company_id,entity_type,entity_id,action)VALUES($1,'real_estate_reservation',$2,'expired')",[row.company_id,row.id]);expired++;
 }
 await client.query('COMMIT');return expired;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export function startRealEstateExpiryWorker(){
 const sweep=async()=>{if(running)return;running=true;try{await expireRealEstateReservations();}catch(e){logger.error('real-estate','Reservation expiry sweep failed',e);}finally{running=false;}};
 setInterval(sweep,60000);void sweep();
}
