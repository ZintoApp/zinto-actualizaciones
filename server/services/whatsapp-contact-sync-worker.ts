import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { WhatsAppContactSyncRun } from '@shared/whatsapp-contact-sync';
import { getPool } from '../db';
import { storage } from '../storage';
import {
  syncContactFromWhatsApp,
  WhatsAppContactSyncTransientError,
  type WhatsAppContactSyncOutcome,
} from './whatsapp-contact-sync-service';
import { logger } from '../utils/logger';

const MAX_ATTEMPTS = 3;
const MAX_PARALLEL_CONNECTIONS = 2;
const CONTACT_DELAY_MS = 1_000;
const LEASE_SECONDS = 120;

type SyncItem = {
  id: number;
  runId: number;
  companyId: number;
  contactId: number | null;
  connectionId: number | null;
  attempts: number;
  claimId: string;
};

export class ActiveWhatsAppContactSyncError extends Error {}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function exposeRun(row: any): WhatsAppContactSyncRun {
  return {
    id: Number(row.id),
    status: row.status,
    total: Number(row.total_count || 0),
    processed: Number(row.processed_count || 0),
    updated: Number(row.updated_count || 0),
    unchanged: Number(row.unchanged_count || 0),
    skipped: Number(row.skipped_count || 0),
    errors: Number(row.error_count || 0),
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at) || new Date().toISOString(),
  };
}

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createWhatsAppContactSyncRun(companyId: number, userId: number): Promise<WhatsAppContactSyncRun> {
  try {
    return await transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`whatsapp-contact-sync-company:${companyId}`]);
      const active = await client.query(
        `SELECT id FROM whatsapp_contact_sync_runs WHERE company_id=$1 AND status IN ('queued','running') LIMIT 1`,
        [companyId],
      );
      if (active.rows.length) throw new ActiveWhatsAppContactSyncError('A WhatsApp contact sync is already running');

      const run = (await client.query(
        `INSERT INTO whatsapp_contact_sync_runs (company_id, initiated_by) VALUES ($1,$2) RETURNING *`,
        [companyId, userId],
      )).rows[0];

      await client.query(`WITH linked_connections AS (
          SELECT id FROM channel_connections
          WHERE company_id=$1 AND channel_type IN ('whatsapp','whatsapp_unofficial') AND status IN ('active','connected')
        ), sole_connection AS (
          SELECT min(id)::integer AS id FROM linked_connections HAVING count(*)=1
        )
        INSERT INTO whatsapp_contact_sync_items
          (run_id,company_id,contact_id,connection_id,status,skip_reason,completed_at)
        SELECT $2,c.company_id,c.id,COALESCE(recent.channel_id,sole.id),
          CASE
            WHEN NULLIF(regexp_replace(COALESCE(c.phone,c.identifier,''),'\\D','','g'),'') IS NULL
              AND NULLIF(c.whatsapp_lid,'') IS NULL AND NULLIF(c.whatsapp_username,'') IS NULL THEN 'skipped'
            WHEN COALESCE(recent.channel_id,sole.id) IS NULL THEN 'skipped'
            ELSE 'pending'
          END,
          CASE
            WHEN NULLIF(regexp_replace(COALESCE(c.phone,c.identifier,''),'\\D','','g'),'') IS NULL
              AND NULLIF(c.whatsapp_lid,'') IS NULL AND NULLIF(c.whatsapp_username,'') IS NULL THEN 'missing_identifier'
            WHEN COALESCE(recent.channel_id,sole.id) IS NULL THEN 'no_eligible_connection'
            ELSE NULL
          END,
          CASE WHEN COALESCE(recent.channel_id,sole.id) IS NULL OR (
            NULLIF(regexp_replace(COALESCE(c.phone,c.identifier,''),'\\D','','g'),'') IS NULL
            AND NULLIF(c.whatsapp_lid,'') IS NULL AND NULLIF(c.whatsapp_username,'') IS NULL
          ) THEN now() ELSE NULL END
        FROM contacts c
        LEFT JOIN LATERAL (
          SELECT v.channel_id FROM conversations v
          JOIN linked_connections lc ON lc.id=v.channel_id
          WHERE v.company_id=$1 AND v.contact_id=c.id
            AND COALESCE(v.is_group,false)=false AND v.group_jid IS NULL
          ORDER BY v.last_message_at DESC NULLS LAST,v.id DESC LIMIT 1
        ) recent ON true
        LEFT JOIN sole_connection sole ON true
        WHERE c.company_id=$1 AND c.is_active IS TRUE
          AND COALESCE(c.is_archived,false)=false AND c.deleted_at IS NULL`,
        [companyId, run.id],
      );

      const totals = (await client.query(`SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE status='skipped')::integer AS skipped
        FROM whatsapp_contact_sync_items WHERE run_id=$1`, [run.id])).rows[0];
      const complete = Number(totals.total) === Number(totals.skipped);
      const updated = (await client.query(`UPDATE whatsapp_contact_sync_runs SET
        total_count=$2,processed_count=$3,skipped_count=$3,
        status=CASE WHEN $4 THEN 'completed' ELSE status END,
        started_at=CASE WHEN $4 THEN now() ELSE started_at END,
        completed_at=CASE WHEN $4 THEN now() ELSE completed_at END,updated_at=now()
        WHERE id=$1 RETURNING *`, [run.id, totals.total, totals.skipped, complete])).rows[0];
      return exposeRun(updated);
    });
  } catch (error: any) {
    if (error instanceof ActiveWhatsAppContactSyncError || error?.code === '23505') {
      throw new ActiveWhatsAppContactSyncError('A WhatsApp contact sync is already running');
    }
    throw error;
  }
}

export async function getWhatsAppContactSyncRun(companyId: number, runId?: number): Promise<WhatsAppContactSyncRun | null> {
  const result = runId
    ? await getPool().query('SELECT * FROM whatsapp_contact_sync_runs WHERE company_id=$1 AND id=$2', [companyId, runId])
    : await getPool().query('SELECT * FROM whatsapp_contact_sync_runs WHERE company_id=$1 ORDER BY id DESC LIMIT 1', [companyId]);
  return result.rows[0] ? exposeRun(result.rows[0]) : null;
}

export async function resolveWhatsAppContactSyncConnection(companyId: number, contactId: number): Promise<number | null> {
  const result = await getPool().query(`WITH linked_connections AS (
      SELECT id FROM channel_connections
      WHERE company_id=$1 AND channel_type IN ('whatsapp','whatsapp_unofficial') AND status IN ('active','connected')
    ), recent AS (
      SELECT v.channel_id FROM conversations v JOIN linked_connections lc ON lc.id=v.channel_id
      WHERE v.company_id=$1 AND v.contact_id=$2 AND COALESCE(v.is_group,false)=false AND v.group_jid IS NULL
      ORDER BY v.last_message_at DESC NULLS LAST,v.id DESC LIMIT 1
    ), sole AS (
      SELECT min(id)::integer AS id FROM linked_connections HAVING count(*)=1
    ) SELECT COALESCE((SELECT channel_id FROM recent),(SELECT id FROM sole)) AS id`, [companyId, contactId]);
  return result.rows[0]?.id == null ? null : Number(result.rows[0].id);
}

async function claim(connectionId: number): Promise<SyncItem | null> {
  const claimId = randomUUID();
  const result = await getPool().query(`WITH candidate AS (
      SELECT i.id FROM whatsapp_contact_sync_items i
      JOIN whatsapp_contact_sync_runs r ON r.id=i.run_id
      WHERE i.connection_id=$1 AND i.status='pending' AND i.available_at<=now()
        AND r.status IN ('queued','running')
      ORDER BY i.available_at,i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1
    )
    UPDATE whatsapp_contact_sync_items i SET status='processing',claim_id=$2,
      lease_expires_at=now()+make_interval(secs=>$3),attempts=attempts+1,updated_at=now()
    FROM candidate WHERE i.id=candidate.id
    RETURNING i.id,i.run_id AS "runId",i.company_id AS "companyId",i.contact_id AS "contactId",
      i.connection_id AS "connectionId",i.attempts,i.claim_id AS "claimId"`, [connectionId, claimId, LEASE_SECONDS]);
  const item = result.rows[0] as SyncItem | undefined;
  if (item) await getPool().query(`UPDATE whatsapp_contact_sync_runs SET status='running',started_at=COALESCE(started_at,now()),updated_at=now()
    WHERE id=$1 AND status='queued'`, [item.runId]);
  return item ?? null;
}

async function finish(item: SyncItem, outcome: WhatsAppContactSyncOutcome | { status: 'error'; reason: string }): Promise<void> {
  await transaction(async client => {
    const changedFields = 'changedFields' in outcome ? outcome.changedFields : [];
    const detail = outcome.status === 'skipped' || outcome.status === 'error' ? outcome.reason.slice(0, 1000) : null;
    const updated = await client.query(`UPDATE whatsapp_contact_sync_items SET status=$3,changed_fields=$4,
      skip_reason=CASE WHEN $3='skipped' THEN $5 ELSE NULL END,
      last_error=CASE WHEN $3='error' THEN $5 ELSE NULL END,
      claim_id=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now()
      WHERE id=$1 AND claim_id=$2 AND status='processing' RETURNING run_id`,
      [item.id, item.claimId, outcome.status, changedFields, detail]);
    if (!updated.rows.length) return;
    await client.query(`UPDATE whatsapp_contact_sync_runs SET processed_count=processed_count+1,
      updated_count=updated_count+CASE WHEN $2='updated' THEN 1 ELSE 0 END,
      unchanged_count=unchanged_count+CASE WHEN $2='unchanged' THEN 1 ELSE 0 END,
      skipped_count=skipped_count+CASE WHEN $2='skipped' THEN 1 ELSE 0 END,
      error_count=error_count+CASE WHEN $2='error' THEN 1 ELSE 0 END,updated_at=now()
      WHERE id=$1`, [item.runId, outcome.status]);
    await settleRun(client, item.runId);
  });
}

async function retry(item: SyncItem, error: unknown): Promise<void> {
  const detail = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  if (item.attempts >= MAX_ATTEMPTS) return finish(item, { status: 'error', reason: detail });
  await getPool().query(`UPDATE whatsapp_contact_sync_items SET status='pending',claim_id=NULL,lease_expires_at=NULL,
    available_at=now()+make_interval(secs=>$3),last_error=$4,updated_at=now()
    WHERE id=$1 AND claim_id=$2 AND status='processing'`,
    [item.id, item.claimId, 30 * (2 ** Math.max(0, item.attempts - 1)), detail]);
}

async function settleRun(client: Pick<PoolClient, 'query'>, runId: number): Promise<void> {
  await client.query(`UPDATE whatsapp_contact_sync_runs r SET
    status=CASE WHEN error_count>0 THEN 'completed_with_errors' ELSE 'completed' END,
    completed_at=now(),updated_at=now()
    WHERE id=$1 AND status IN ('queued','running') AND NOT EXISTS (
      SELECT 1 FROM whatsapp_contact_sync_items i WHERE i.run_id=r.id AND i.status IN ('pending','processing')
    )`, [runId]);
}

async function processConnection(connectionId: number): Promise<void> {
  const client = await getPool().connect();
  const lockKey = `whatsapp-contact-sync:${connectionId}`;
  let locked = false;
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [lockKey]);
    if (!(locked = lock.rows[0]?.locked === true)) return;
    const item = await claim(connectionId);
    if (!item) return;
    try {
      const [contact, connection] = await Promise.all([
        item.contactId ? storage.getContact(item.contactId) : Promise.resolve(undefined),
        item.connectionId ? storage.getChannelConnection(item.connectionId) : Promise.resolve(undefined),
      ]);
      if (!contact || contact.companyId !== item.companyId || contact.isActive !== true || contact.isArchived === true || contact.deletedAt) {
        await finish(item, { status: 'skipped', changedFields: [], reason: 'contact_no_longer_eligible', contact: contact as any });
      } else if (!connection || connection.companyId !== item.companyId) {
        await finish(item, { status: 'skipped', changedFields: [], reason: 'connection_no_longer_eligible', contact });
      } else {
        await finish(item, await syncContactFromWhatsApp(contact, connection));
      }
    } catch (error) {
      await retry(item, error instanceof WhatsAppContactSyncTransientError ? error : error);
    } finally {
      await new Promise(resolve => setTimeout(resolve, CONTACT_DELAY_MS));
    }
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
    } finally {
      client.release();
    }
  }
}

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;

export async function processWhatsAppContactSyncJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await getPool().query(`UPDATE whatsapp_contact_sync_items SET status='pending',claim_id=NULL,lease_expires_at=NULL,
      available_at=now(),last_error='Recovered interrupted synchronization',updated_at=now()
      WHERE status='processing' AND lease_expires_at<now()`);
    await getPool().query(`UPDATE whatsapp_contact_sync_items SET status='skipped',skip_reason='connection_no_longer_eligible',
      completed_at=now(),updated_at=now() WHERE status='pending' AND connection_id IS NULL`);
    const candidates = await getPool().query(`SELECT DISTINCT i.connection_id FROM whatsapp_contact_sync_items i
      JOIN whatsapp_contact_sync_runs r ON r.id=i.run_id
      WHERE i.status='pending' AND i.available_at<=now() AND i.connection_id IS NOT NULL
        AND r.status IN ('queued','running') ORDER BY i.connection_id LIMIT $1`, [MAX_PARALLEL_CONNECTIONS]);
    await Promise.all(candidates.rows.map(row => processConnection(Number(row.connection_id))));
    await getPool().query(`WITH totals AS (
        SELECT run_id,count(*)::integer AS total,
          count(*) FILTER (WHERE status IN ('updated','unchanged','skipped','error'))::integer AS processed,
          count(*) FILTER (WHERE status='updated')::integer AS updated,
          count(*) FILTER (WHERE status='unchanged')::integer AS unchanged,
          count(*) FILTER (WHERE status='skipped')::integer AS skipped,
          count(*) FILTER (WHERE status='error')::integer AS errors,
          count(*) FILTER (WHERE status IN ('pending','processing'))::integer AS remaining
        FROM whatsapp_contact_sync_items GROUP BY run_id
      ) UPDATE whatsapp_contact_sync_runs r SET total_count=t.total,processed_count=t.processed,
        updated_count=t.updated,unchanged_count=t.unchanged,skipped_count=t.skipped,error_count=t.errors,
        status=CASE WHEN t.remaining=0 THEN CASE WHEN t.errors>0 THEN 'completed_with_errors' ELSE 'completed' END ELSE r.status END,
        completed_at=CASE WHEN t.remaining=0 THEN COALESCE(r.completed_at,now()) ELSE r.completed_at END,updated_at=now()
      FROM totals t WHERE r.id=t.run_id AND r.status IN ('queued','running')`);
    await getPool().query(`DELETE FROM whatsapp_contact_sync_items i USING whatsapp_contact_sync_runs r
      WHERE i.run_id=r.id AND r.completed_at<now()-interval '30 days'`);
  } catch (error) {
    logger.error('whatsapp-contact-sync', 'WhatsApp contact sync worker failed', error);
  } finally {
    running = false;
  }
}

export function startWhatsAppContactSyncWorker(): void {
  if (timer) return;
  const tick = () => void processWhatsAppContactSyncJobs();
  timer = setInterval(tick, 1_500);
  timer.unref();
  tick();
}

export function stopWhatsAppContactSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
