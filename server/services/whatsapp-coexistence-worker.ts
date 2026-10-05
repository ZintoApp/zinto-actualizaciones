import { createHash } from 'crypto';
import { getPool } from '../db';
import { storage } from '../storage';
import { processCoexistenceEvent } from './whatsapp-coexistence-events';
import { requestCoexistenceSync } from './whatsapp-coexistence-sync';
import { patchWhatsAppConnection } from './whatsapp-connection-state';

export async function enqueueCoexistenceEvent(connectionId: number, companyId: number, payload: unknown) {
  const json = JSON.stringify(payload);
  const key = createHash('sha256').update(`${connectionId}:${json}`).digest('hex');
  await getPool().query(`INSERT INTO whatsapp_coexistence_jobs (dedupe_key, connection_id, company_id, payload)
    VALUES ($1,$2,$3,$4) ON CONFLICT (dedupe_key) DO NOTHING`, [key, connectionId, companyId, json]);
}

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
export async function processCoexistenceJobs() {
  if (running) return;
  running = true;
  try {
    const { rows: candidates } = await getPool().query(`SELECT DISTINCT connection_id FROM whatsapp_coexistence_jobs
      WHERE status='pending' AND available_at <= now() LIMIT 20`);
    for (const candidate of candidates) {
      const client = await getPool().connect();
      const lockKey = `whatsapp-events:${candidate.connection_id}`;
      let locked = false;
      try {
        const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [lockKey]);
        if (!(locked = result.rows[0].locked)) continue;
        const { rows: jobs } = await client.query(`SELECT * FROM whatsapp_coexistence_jobs WHERE connection_id=$1
          AND status='pending' AND available_at <= now() ORDER BY id LIMIT 20`, [candidate.connection_id]);
        for (const job of jobs) {
          // Keep the row pending under a session advisory lock. A crash releases the
          // lock automatically, so another worker can retry without an unsafe lease expiry.
          await client.query('UPDATE whatsapp_coexistence_jobs SET attempts=attempts+1 WHERE id=$1', [job.id]);
          try {
            const connection = await storage.getChannelConnection(job.connection_id);
            if (!connection || connection.companyId !== job.company_id) throw new Error('Connection ownership changed');
            await processCoexistenceEvent(connection, job.payload);
            await client.query("UPDATE whatsapp_coexistence_jobs SET status='completed', completed_at=now(), last_error=NULL WHERE id=$1", [job.id]);
          } catch {
            await client.query(`UPDATE whatsapp_coexistence_jobs SET status=CASE WHEN attempts>=10 THEN 'failed' ELSE 'pending' END,
              available_at=now() + interval '30 seconds' * LEAST(attempts, 20), last_error='Processing failed; inspect connection state and retry the job' WHERE id=$1`, [job.id]);
            if (job.attempts >= 9) await patchWhatsAppConnection(job.connection_id, { syncNotice: 'Some WhatsApp data could not be processed. Retry synchronization in channel settings after checking the connection.' });
          }
        }
      } finally {
        try {
          if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
        } finally { client.release(); }
      }
    }
    // Resume requests interrupted before submission; never repeat an ambiguous request.
    const { rows: syncs } = await getPool().query(`SELECT id FROM channel_connections WHERE connection_data->>'signupMode'='coexistence'
      AND connection_data->>'onboardingStatus'='ready'
      AND (COALESCE(connection_data->>'contactSyncStatus','pending') IN ('pending','requesting')
        OR (connection_data->>'historySyncStatus' IN ('pending','requesting') AND connection_data->>'contactSyncRequestId' IS NOT NULL)) LIMIT 20`);
    for (const row of syncs) await requestCoexistenceSync(row.id);
    await getPool().query("DELETE FROM whatsapp_coexistence_jobs WHERE status='completed' AND completed_at < now() - interval '30 days'");
  } finally { running = false; }
}
export function startCoexistenceWorker() {
  if (timer) return;
  const tick = () => { void processCoexistenceJobs().catch(() => console.error('[Coexistence] Worker unavailable. Check database migration and connectivity.')); };
  timer = setInterval(tick, 5_000); timer.unref(); tick();
}
export function stopCoexistenceWorker() { clearInterval(timer); timer = undefined; }

export async function retryCoexistenceJobs(connectionId: number, companyId: number) {
  await getPool().query(`UPDATE whatsapp_coexistence_jobs SET status='pending', attempts=0, available_at=now(), last_error=NULL
    WHERE connection_id=$1 AND company_id=$2 AND status='failed'`, [connectionId, companyId]);
}
