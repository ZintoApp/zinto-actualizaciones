import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { DentalAutomaticReminders } from '../../shared/types/dental-reminder-types';
import { parseDentalBookingPolicy } from '../../shared/types/dental-booking-types';
import { dentalReminderSendAt, isDentalReminderCurrent, type DentalReminderAppointment, type DentalReminderJob, type PreparedDentalReminder } from './dental-reminder-engine';

const appointmentSelect = `SELECT a.id, COALESCE(a.company_id,c.company_id) AS "companyId", a.contact_id AS "contactId",
  a.status, a.scheduled_at AT TIME ZONE 'UTC' AS "scheduledAt", s.occurrence, s.eligible_since AS "eligibleSince"
  FROM contact_appointments a JOIN contacts c ON c.id = a.contact_id
  JOIN dental_reminder_appointments s ON s.appointment_id = a.id`;

export interface AppointmentReminderAdapter {
  domain: 'dental' | 'real_estate';
  settingsKey: 'dentalBookingPolicy' | 'realEstateSettings';
  parseSettings: (value: unknown) => DentalAutomaticReminders;
}
const dentalAdapter: AppointmentReminderAdapter = {
  domain: 'dental', settingsKey: 'dentalBookingPolicy',
  parseSettings: value => parseDentalBookingPolicy(value).automaticReminders,
};
/** One durable queue and dispatcher; adapters only select the local domain and policy. */
export function createDentalReminderRepository(getPool: () => Pool, adapter: AppointmentReminderAdapter = dentalAdapter) {
  const { domain, settingsKey } = adapter;
  const membership = `${domain === 'dental' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM real_estate_appointments e WHERE e.appointment_id = a.id AND e.company_id = a.company_id)`;
  async function reconcileDentalReminders(companyId?: number): Promise<void> {
    const pool = getPool();
    const companies = await pool.query(`SELECT DISTINCT cs.company_id FROM company_settings cs
      WHERE cs.key = '${settingsKey}' AND ($1::integer IS NULL OR cs.company_id = $1)
      AND EXISTS (SELECT 1 FROM company_settings b WHERE b.company_id = cs.company_id AND b.key = 'erpBusinessType' AND b.value = '"${domain}"'::jsonb)`, [companyId ?? null]);
    for (const company of companies.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lock = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext('${domain}-reminders'), $1) AS acquired`, [company.company_id]);
        if (!lock.rows[0].acquired) { await client.query('ROLLBACK'); continue; }
        const policyRows = await client.query(`SELECT value FROM company_settings WHERE company_id = $1 AND key = '${settingsKey}' FOR SHARE`, [company.company_id]);
        const settings = adapter.parseSettings(policyRows.rows[0]?.value);
        await client.query(`UPDATE dental_appointment_reminders j SET status = 'cancelled', claim_id = NULL, lease_expires_at = NULL,
          last_error = 'Appointment or settings no longer eligible', updated_at = now()
          WHERE j.company_id = $1 AND j.domain = '${domain}' AND j.status IN ('pending','processing') AND j.dispatch_started_at IS NULL
          AND (NOT $2 OR NOT (j.rule_id = ANY($3::text[])) OR NOT EXISTS (
            SELECT 1 FROM contact_appointments a JOIN dental_reminder_appointments s ON s.appointment_id = a.id
            WHERE a.id = j.appointment_id AND s.occurrence = j.occurrence AND a.status IN ('scheduled','confirmed')
            AND ${membership} AND a.scheduled_at AT TIME ZONE 'UTC' > now()))`, [company.company_id, settings.enabled, settings.rules.map(rule => rule.id)]);
        if (settings.enabled) {
          let afterId = 0;
          while (true) {
            const appointments = await client.query<DentalReminderAppointment>(`${appointmentSelect}
              WHERE COALESCE(a.company_id,c.company_id) = $1 AND c.company_id = $1
              AND a.scheduled_at AT TIME ZONE 'UTC' > now() AND a.status IN ('scheduled','confirmed') AND ${membership} AND a.id > $2
              ORDER BY a.id LIMIT 500 FOR SHARE OF a, s`, [company.company_id, afterId]);
            if (!appointments.rows.length) break;
            const jobs = appointments.rows.flatMap(appointment => settings.rules.flatMap(rule => {
              const due = dentalReminderSendAt(appointment, rule);
              return due ? [{ company_id: company.company_id, appointment_id: appointment.id, occurrence: appointment.occurrence,
                rule_id: rule.id, scheduled_for: due.toISOString() }] : [];
            }));
            if (jobs.length) await client.query(`INSERT INTO dental_appointment_reminders
              (domain, company_id, appointment_id, occurrence, rule_id, scheduled_for, next_attempt_at)
              SELECT '${domain}', company_id, appointment_id, occurrence, rule_id, scheduled_for, scheduled_for
              FROM jsonb_to_recordset($1::jsonb) AS x(company_id integer, appointment_id integer, occurrence integer, rule_id text, scheduled_for timestamptz)
              ON CONFLICT (domain, company_id, appointment_id, occurrence, rule_id) DO UPDATE SET
                scheduled_for = EXCLUDED.scheduled_for,
                next_attempt_at = CASE WHEN dental_appointment_reminders.scheduled_for = EXCLUDED.scheduled_for AND dental_appointment_reminders.status = 'pending'
                  THEN dental_appointment_reminders.next_attempt_at ELSE EXCLUDED.scheduled_for END,
                status = 'pending', last_error = CASE WHEN dental_appointment_reminders.status = 'cancelled' THEN NULL ELSE dental_appointment_reminders.last_error END,
                updated_at = now()
              WHERE dental_appointment_reminders.status IN ('pending','cancelled') AND dental_appointment_reminders.dispatch_started_at IS NULL
                AND (dental_appointment_reminders.status = 'cancelled' OR dental_appointment_reminders.scheduled_for IS DISTINCT FROM EXCLUDED.scheduled_for)`, [JSON.stringify(jobs)]);
            afterId = appointments.rows[appointments.rows.length - 1].id;
          }
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  }

  async function recoverDentalReminderClaims(): Promise<void> {
    await getPool().query(`UPDATE dental_appointment_reminders SET
      status = CASE WHEN dispatch_started_at IS NULL THEN 'pending' ELSE 'unknown' END,
      last_error = CASE WHEN dispatch_started_at IS NULL THEN 'Recovered expired claim' ELSE 'Worker stopped during dispatch; delivery unknown' END,
      claim_id = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE domain = '${domain}' AND status = 'processing' AND lease_expires_at < now()`);
  }
  async function claimDentalReminder(): Promise<DentalReminderJob | null> {
    const result = await getPool().query(`WITH due AS (
      SELECT id FROM dental_appointment_reminders WHERE domain = '${domain}' AND status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE dental_appointment_reminders j SET status = 'processing', claim_id = $1,
        lease_expires_at = now() + interval '2 minutes', updated_at = now()
      FROM due WHERE j.id = due.id RETURNING j.id::integer, company_id AS "companyId", appointment_id AS "appointmentId",
        occurrence, rule_id AS "ruleId", scheduled_for AS "scheduledFor", claim_id AS "claimId", attempts`, [randomUUID()]);
    return result.rows[0] ?? null;
  }
  async function loadDentalReminderContext(job: DentalReminderJob, client = getPool()) {
    const [appointments, policies, businesses] = await Promise.all([
      client.query<DentalReminderAppointment>(`${appointmentSelect} WHERE a.id = $1 AND COALESCE(a.company_id,c.company_id) = $2 AND c.company_id = $2 AND ${membership}`, [job.appointmentId, job.companyId]),
      client.query(`SELECT value FROM company_settings WHERE company_id = $1 AND key = '${settingsKey}'`, [job.companyId]),
      client.query(`SELECT value FROM company_settings WHERE company_id = $1 AND key = 'erpBusinessType'`, [job.companyId]),
    ]);
    const appointment = appointments.rows[0];
    const settings = adapter.parseSettings(policies.rows[0]?.value);
    if (!appointment || businesses.rows[0]?.value !== domain || !isDentalReminderCurrent(job, appointment, settings, new Date())) return null;
    return { appointment, settings, rule: settings.rules.find(rule => rule.id === job.ruleId)! };
  }
  async function beginDentalReminder(job: DentalReminderJob, prepared: PreparedDentalReminder): Promise<boolean> {
    // Trigger invalidation and this compare-and-set serialize the handoff to the sender.
    if (!await loadDentalReminderContext(job)) {
      await finishDentalReminder(job, 'skipped', 'Appointment or settings changed before dispatch');
      return false;
    }
    const result = await getPool().query(`UPDATE dental_appointment_reminders SET dispatch_started_at = now(), attempts = attempts + 1,
      conversation_id = $3, channel_connection_id = $4, updated_at = now()
      WHERE domain = '${domain}' AND id = $1 AND company_id = $5 AND claim_id = $2 AND status = 'processing' AND lease_expires_at > now() AND dispatch_started_at IS NULL
      RETURNING attempts`, [job.id, job.claimId, prepared.conversationId, prepared.channelConnectionId, job.companyId]);
    if (result.rows.length) job.attempts = result.rows[0].attempts;
    return result.rows.length > 0;
  }
  async function finishDentalReminder(job: DentalReminderJob, status: string, detail?: string, messageId?: string, retryAfterSeconds?: number): Promise<void> {
    await getPool().query(`UPDATE dental_appointment_reminders SET status = $3, last_error = $4, message_id = COALESCE($5,message_id),
      sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END,
      next_attempt_at = CASE WHEN $3 = 'pending' THEN now() + make_interval(secs => $6) ELSE next_attempt_at END,
      dispatch_started_at = CASE WHEN $3 = 'pending' THEN NULL ELSE dispatch_started_at END,
      claim_id = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE domain = '${domain}' AND id = $1 AND company_id = $7 AND claim_id = $2 AND status = 'processing'`,
    [job.id, job.claimId, status, detail?.slice(0, 1000) ?? null, messageId ?? null, retryAfterSeconds ?? Math.min(2 ** Math.max(0, job.attempts - 1) * 60, 1800), job.companyId]);
  }
  return { reconcileDentalReminders, recoverDentalReminderClaims, claimDentalReminder, loadDentalReminderContext, beginDentalReminder, finishDentalReminder };
}
