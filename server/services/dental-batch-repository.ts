import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { batchDeliverySettings, type ReminderBatchInput } from '../../shared/types/dental-reminder-batches';
import { getZonedDateTimeParts } from '../../shared/utils/agent-schedule';
import { addBatchDays, batchTargetDate, batchWallTime, nextBatchTime } from './dental-batch-time';
import type { DentalReminderJob, PreparedDentalReminder } from './dental-reminder-engine';
import { normalizeTimezone, validateTimezone } from '../utils/timezone';

type Queryable = Pick<PoolClient, 'query'>;
export type BatchRow = { id: number; company_id: number; config: ReminderBatchInput; state: string;
  timezone: string; next_run_at: Date | null; version: number; latest_run_status?: string | null };
const matching = `FROM contact_appointments a JOIN contacts c ON c.id = a.contact_id
  JOIN dental_reminder_appointments s ON s.appointment_id = a.id
  WHERE COALESCE(a.company_id,c.company_id) = $1 AND c.company_id = $1
  AND ((a.scheduled_at AT TIME ZONE 'UTC') AT TIME ZONE $3)::date = $2::date
  AND a.scheduled_at AT TIME ZONE 'UTC' > now()
  AND a.status IN (SELECT jsonb_array_elements_text($4::jsonb->'statuses'))
  AND (($4::jsonb->>'providerUserId') IS NULL OR a.provider_user_id = ($4::jsonb->>'providerUserId')::integer)
  AND (($4::jsonb->>'chairId') IS NULL OR a.chair_id = ($4::jsonb->>'chairId')::integer)
  AND (($4::jsonb->>'serviceKey') IS NULL OR a.booking_service_key = $4::jsonb->>'serviceKey')`;

export function createDentalBatchRepository(getPool: () => Pool) {
  async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function count(companyId: number, date: string, timezone: string, config: ReminderBatchInput) {
    return (await getPool().query(`SELECT count(*)::integer AS count ${matching}`, [companyId, date, timezone, JSON.stringify(config)])).rows[0].count as number;
  }
  async function stopPending(client: Queryable, companyId: number, batchId: number) {
    await client.query(`UPDATE dental_reminder_batch_runs SET status = 'cancelled'
      WHERE company_id=$1 AND batch_id=$2 AND status='processing'`, [companyId, batchId]);
    await client.query(`UPDATE dental_reminder_batch_deliveries d SET status='cancelled', claim_id=NULL,
      lease_expires_at=NULL, last_error='Batch paused or cancelled', updated_at=now()
      FROM dental_reminder_batch_runs r WHERE d.run_id=r.id AND r.company_id=$1 AND r.batch_id=$2
      AND d.status IN ('pending','processing') AND d.dispatch_started_at IS NULL`, [companyId, batchId]);
  }
  async function reconcile(now = new Date()) {
    // Never hold a transaction across network messaging. Lock each definition only while materializing.
    const definitions = await getPool().query(`SELECT b.id FROM dental_reminder_batches b
      WHERE b.state='active' AND EXISTS (SELECT 1 FROM company_settings cs
        WHERE cs.company_id=b.company_id AND cs.key='erpBusinessType' AND cs.value='"dental"'::jsonb)`);
    for (const definition of definitions.rows) await transaction(async client => {
      const row = (await client.query<BatchRow>(`SELECT * FROM dental_reminder_batches WHERE id=$1 AND state='active' FOR UPDATE SKIP LOCKED`, [definition.id])).rows[0];
      if (!row) return;
      let zone = row.timezone;
      if (row.config.mode === 'daily') {
        const saved = (await client.query(`SELECT value FROM company_settings WHERE company_id=$1 AND key='defaultTimezone'`, [row.company_id])).rows[0]?.value;
        if (typeof saved !== 'string' || !saved.trim() || !validateTimezone(saved.trim())) return;
        zone = normalizeTimezone(saved.trim());
        if (zone !== row.timezone) {
          await client.query(`UPDATE dental_reminder_batches SET timezone=$2,next_run_at=$3 WHERE id=$1`, [row.id, zone, nextBatchTime(row.config, zone, now)]);
          return;
        }
      }
      if (!row.next_run_at || row.next_run_at > now) return;
      const today = getZonedDateTimeParts(now, zone).dateKey;
      const oldDate = getZonedDateTimeParts(row.next_run_at, zone).dateKey;
      // Record an expired occurrence after a long outage, then consider today's daily occurrence.
      const candidates = [oldDate];
      if (row.config.mode === 'daily' && oldDate < today && batchWallTime(today, row.config.time, zone) <= now) candidates.push(today);
      for (const sendDate of candidates) {
        const due = row.config.mode === 'once' ? row.next_run_at : batchWallTime(sendDate, row.config.time, zone);
        const targetDate = batchTargetDate(row.config, sendDate);
        const expires = batchWallTime(addBatchDays(sendDate, 1), '00:00', zone);
        const run = (await client.query(`INSERT INTO dental_reminder_batch_runs
          (company_id,batch_id,send_date,appointment_date,scheduled_for,expires_at,timezone,config,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (batch_id,send_date) DO NOTHING RETURNING id`,
          [row.company_id,row.id,sendDate,targetDate,due,expires,zone,JSON.stringify(row.config),expires <= now ? 'expired' : 'processing'])).rows[0];
        if (run && expires > now) {
          await client.query(`INSERT INTO dental_reminder_batch_deliveries
            (company_id,run_id,appointment_id,occurrence,scheduled_for,next_attempt_at)
            SELECT $1,$5,a.id,s.occurrence,$6,$6 ${matching}
            ON CONFLICT (run_id,appointment_id) DO NOTHING`, [row.company_id,targetDate,zone,JSON.stringify(row.config),run.id,due]);
        }
      }
      await client.query(`UPDATE dental_reminder_batches SET next_run_at=$2,
        state=CASE WHEN config->>'mode'='once' THEN 'completed' ELSE state END,updated_at=now() WHERE id=$1`,
        [row.id,row.config.mode === 'daily' ? nextBatchTime(row.config,zone,now) : null]);
    });
    await settle();
  }
  async function settle() {
    await getPool().query(`UPDATE dental_reminder_batch_deliveries SET
      status=CASE WHEN dispatch_started_at IS NULL THEN 'pending' ELSE 'unknown' END,
      last_error=CASE WHEN dispatch_started_at IS NULL THEN 'Recovered expired claim' ELSE 'Worker stopped during dispatch; delivery unknown' END,
      claim_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE status='processing' AND lease_expires_at<now()`);
    await getPool().query(`UPDATE dental_reminder_batch_deliveries d SET status='skipped',claim_id=NULL,
      lease_expires_at=NULL,last_error='Scheduled send date has ended',updated_at=now()
      FROM dental_reminder_batch_runs r WHERE r.id=d.run_id AND r.expires_at<=now()
      AND d.status IN ('pending','processing') AND d.dispatch_started_at IS NULL`);
    await getPool().query(`UPDATE dental_reminder_batch_runs r SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'completed' END
      WHERE status='processing' AND NOT EXISTS (SELECT 1 FROM dental_reminder_batch_deliveries d
        WHERE d.run_id=r.id AND d.status IN ('pending','processing'))`);
  }
  async function claim(): Promise<DentalReminderJob | null> {
    const result = await getPool().query(`WITH due AS (SELECT d.id FROM dental_reminder_batch_deliveries d
      JOIN dental_reminder_batch_runs r ON r.id=d.run_id WHERE d.status='pending' AND d.next_attempt_at<=now()
      AND r.status='processing' AND r.expires_at>now() ORDER BY d.next_attempt_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1)
      UPDATE dental_reminder_batch_deliveries d SET status='processing',claim_id=$1,lease_expires_at=now()+interval '2 minutes',updated_at=now()
      FROM due WHERE d.id=due.id RETURNING d.id,d.company_id AS "companyId",d.appointment_id AS "appointmentId",
      d.occurrence,'batch' AS "ruleId",d.scheduled_for AS "scheduledFor",d.claim_id AS "claimId",d.attempts`, [randomUUID()]);
    return result.rows[0] ?? null;
  }
  async function context(job: DentalReminderJob, client: Queryable = getPool()) {
    const run = (await client.query(`SELECT r.* FROM dental_reminder_batch_deliveries d JOIN dental_reminder_batch_runs r ON r.id=d.run_id
      WHERE d.id=$1 AND d.company_id=$2 AND d.claim_id=$3 AND d.status='processing' AND r.status='processing' AND r.expires_at>now()
      AND EXISTS (SELECT 1 FROM company_settings cs WHERE cs.company_id=r.company_id AND cs.key='erpBusinessType' AND cs.value='"dental"'::jsonb)`,
      [job.id,job.companyId,job.claimId])).rows[0];
    if (!run) return null;
    const appointment = (await client.query(`SELECT a.id,a.contact_id AS "contactId" ${matching} AND a.id=$5 AND s.occurrence=$6`,
      [job.companyId,run.appointment_date,run.timezone,JSON.stringify(run.config),job.appointmentId,job.occurrence])).rows[0];
    if (!appointment) return null;
    const settings = batchDeliverySettings(run.config);
    return { appointment, settings, rule: settings.rules[0], timezone: run.timezone as string };
  }
  async function begin(job: DentalReminderJob, prepared: PreparedDentalReminder): Promise<boolean> {
    return transaction(async client => {
      // Serialize with pause/cancel. Lock appointment + occurrence against rescheduling during the final check.
      await client.query(`SELECT r.id FROM dental_reminder_batch_runs r JOIN dental_reminder_batch_deliveries d ON d.run_id=r.id
        WHERE d.id=$1 FOR UPDATE OF r`, [job.id]);
      await client.query(`SELECT a.id FROM contact_appointments a JOIN dental_reminder_appointments s ON s.appointment_id=a.id
        WHERE a.id=$1 FOR SHARE OF a,s`, [job.appointmentId]);
      if (!await context(job,client)) {
        await finish(job,'skipped','Appointment or batch changed before dispatch',undefined,undefined,client);
        return false;
      }
      const result = await client.query(`UPDATE dental_reminder_batch_deliveries SET dispatch_started_at=now(),attempts=attempts+1,
        conversation_id=$3,channel_connection_id=$4 WHERE id=$1 AND claim_id=$2 AND status='processing'
        AND lease_expires_at>now() AND dispatch_started_at IS NULL RETURNING attempts`, [job.id,job.claimId,prepared.conversationId,prepared.channelConnectionId]);
      if (result.rows.length) job.attempts = result.rows[0].attempts;
      return result.rows.length > 0;
    });
  }
  async function finish(job: DentalReminderJob, status: string, detail?: string, messageId?: string, retryAfterSeconds?: number, client: Queryable = getPool()) {
    await client.query(`UPDATE dental_reminder_batch_deliveries SET status=$3,last_error=$4,message_id=COALESCE($5,message_id),
      sent_at=CASE WHEN $3='sent' THEN now() ELSE sent_at END,
      next_attempt_at=CASE WHEN $3='pending' THEN now()+make_interval(secs=>$6) ELSE next_attempt_at END,
      dispatch_started_at=CASE WHEN $3='pending' THEN NULL ELSE dispatch_started_at END,
      claim_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND claim_id=$2 AND status='processing'`,
      [job.id,job.claimId,status,detail?.slice(0,1000) ?? null,messageId ?? null,retryAfterSeconds ?? Math.min(2 ** Math.max(0,job.attempts-1)*60,1800)]);
  }
  return { transaction,count,stopPending,reconcile,settle,claim,context,begin,finish };
}
