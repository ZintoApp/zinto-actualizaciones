import type { Pool, PoolClient } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  allowedQueueActions, compareQueueTurns, eligibleTurn, estimateQueue, issueTurnSchema, nextTurnSchema,
  turnActionRequestSchema, queueStatusChangeSchema, type QueueOptions, type QueueSettings, type QueueTurn, type QueueSnapshot,
  type QueueDisplaySnapshot, type QueueTicket, type DisplayTurn, publicQueueTicketSchema, type PublicQueueTicket,
} from '../../shared/types/dental-queue';
import { getZonedDateTimeParts } from '../../shared/utils/agent-schedule';

export class QueueError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export type QueueContext = Omit<QueueOptions, 'appointments'> & {
  timezone: string; settings: QueueSettings; clinicName: string; logoUrl: string;
};
const selectTurns = `SELECT q.*, q.day::text AS day, c.name AS patient_name, c.avatar_url AS patient_avatar_url FROM dental_queue_turns q
  JOIN contacts c ON c.id=q.contact_id AND c.company_id=q.company_id`;
const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
export function mapQueueTurn(row: any): QueueTurn {
  return {
    id: row.id, day: typeof row.day === 'string' ? row.day.slice(0, 10) : row.day.toISOString().slice(0, 10), number: row.number,
    contactId: row.contact_id, patientName: row.patient_name || '', patientAvatarUrl: row.patient_avatar_url || null, appointmentId: row.appointment_id,
    scheduledAt: iso(row.scheduled_at), providerUserId: row.provider_user_id, providerName: row.provider_name,
    chairId: row.chair_id, chairName: row.chair_name, serviceKey: row.service_key, serviceLabel: row.service_label,
    durationMinutes: row.duration_minutes, status: row.status, issuedAt: iso(row.issued_at)!, queuedAt: iso(row.queued_at)!,
    calledAt: iso(row.called_at), startedAt: iso(row.started_at), finishedAt: iso(row.finished_at), reason: row.reason,
  };
}

export class DentalQueueService {
  constructor(private pool: Pick<Pool, 'connect'>, private context: (companyId: number) => Promise<QueueContext>, private clock = () => new Date()) {}

  private async transaction<T>(companyId: number, callback: (db: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      // Serialize clinic mutations across app instances, including idempotency and both resource checks.
      if (!readOnly) await db.query('SELECT pg_advisory_xact_lock(252, $1)', [companyId]);
      const result = await callback(db);
      await db.query('COMMIT'); return result;
    } catch (error: any) {
      await db.query('ROLLBACK');
      if (error.code === '23505') throw new QueueError('queue_conflict', 'Patient, professional, or room already has an active turn. Refresh the queue.');
      throw error;
    } finally { db.release(); }
  }

  private async request<T>(db: PoolClient, companyId: number, actorId: number, kind: string, input: { requestId: string; [key: string]: unknown }, callback: () => Promise<{ turnId: number | null; result: T }>): Promise<T> {
    const fingerprint = createHash('sha256').update(JSON.stringify({ kind, ...input })).digest('hex');
    const previous = (await db.query('SELECT response, request_fingerprint FROM dental_queue_events WHERE company_id=$1 AND request_id=$2', [companyId, input.requestId])).rows[0];
    if (previous) {
      if (previous.request_fingerprint !== fingerprint) throw new QueueError('request_reused', 'This request ID was already used for another action.');
      return previous.response;
    }
    const { turnId, result } = await callback();
    await db.query(`INSERT INTO dental_queue_events(company_id,turn_id,kind,request_id,request_fingerprint,response,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [companyId, turnId, kind, input.requestId, fingerprint, JSON.stringify(result), actorId]);
    return result;
  }

  private async clearPreviousDay(companyId: number, ctx: QueueContext) {
    if (!ctx.settings.autoClearPreviousDay) return;
    const now = this.clock(), day = getZonedDateTimeParts(now, ctx.timezone).dateKey;
    // Commit expiry independently so a rejected call/check-in cannot undo it.
    // The clinic lock makes polling and simultaneous requests safe across servers.
    await this.transaction(companyId, async db => {
      await db.query(`WITH expired AS (
        UPDATE dental_queue_turns SET status='cancelled', reason='day_expired', finished_at=$3, updated_by=NULL
        WHERE company_id=$1 AND day<$2 AND status IN ('waiting','called','in_service','skipped')
        RETURNING id,company_id,day
      ) INSERT INTO dental_queue_events(company_id,turn_id,kind,response,created_at)
        SELECT company_id,id,'day_expired',jsonb_build_object('day',day,'timezone',$4::text),$3 FROM expired`,
      [companyId, day, now, ctx.timezone]);
    });
  }

  private async turn(db: PoolClient, companyId: number, id: number): Promise<QueueTurn> {
    const row = (await db.query(`${selectTurns} WHERE q.company_id=$1 AND q.id=$2`, [companyId, id])).rows[0];
    if (!row) throw new QueueError('turn_not_found', 'Turn not found.', 404);
    return mapQueueTurn(row);
  }
  private assignment(ctx: QueueContext, providerId: number, chairId: number, serviceKey?: string) {
    const provider = ctx.providers.find(p => p.id === providerId);
    const room = ctx.rooms.find(r => r.id === chairId);
    if (!provider || !room || (provider.chairIds.length && !provider.chairIds.includes(chairId))) {
      throw new QueueError('assignment_unavailable', 'Select an active professional and an allowed consulting room.');
    }
    const service = ctx.services.find(s => s.id === serviceKey);
    if (service && provider.specialtyIds.length && !provider.specialtyIds.includes(service.specialtyId)) {
      throw new QueueError('specialty_mismatch', 'This service does not match the professional’s specialties.');
    }
    return { provider, room, service };
  }

  async issue(companyId: number, actorId: number, raw: z.input<typeof issueTurnSchema>): Promise<QueueTurn> {
    const input = issueTurnSchema.parse(raw);
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    return this.transaction(companyId, db => this.request(db, companyId, actorId, 'issue', input, async () => {
      const now = this.clock();
      const day = getZonedDateTimeParts(now, ctx.timezone).dateKey;
      const { provider, room, service } = this.assignment(ctx, input.providerUserId, input.chairId, input.serviceKey);
      const patient = (await db.query(`SELECT c.id FROM contacts c JOIN dental_patient_profiles p ON p.contact_id=c.id AND p.company_id=c.company_id
        WHERE c.company_id=$1 AND c.id=$2`, [companyId, input.contactId])).rows[0];
      if (!patient) throw new QueueError('patient_not_found', 'Select a registered patient in this clinic.', 404);
      let appointment: any;
      if (input.appointmentId) {
        appointment = (await db.query(`SELECT *, scheduled_at AT TIME ZONE 'UTC' AS scheduled_utc FROM contact_appointments WHERE company_id=$1 AND id=$2 FOR SHARE`, [companyId, input.appointmentId])).rows[0];
        if (!appointment || appointment.contact_id !== input.contactId || !['scheduled', 'confirmed'].includes(appointment.status)
          || getZonedDateTimeParts(new Date(appointment.scheduled_utc), ctx.timezone).dateKey !== day) {
          throw new QueueError('appointment_ineligible', 'Only today’s scheduled or confirmed appointments can check in.');
        }
        if ((appointment.provider_user_id && appointment.provider_user_id !== input.providerUserId)
          || (appointment.chair_id && appointment.chair_id !== input.chairId)
          || (appointment.booking_service_key && appointment.booking_service_key !== input.serviceKey)) {
          throw new QueueError('appointment_changed', 'Appointment assignment changed. Reload it before checking in.');
        }
      }
      if (!service && !(appointment?.booking_service_key === input.serviceKey && appointment.booking_service_label)) {
        throw new QueueError('service_unavailable', 'Select an active service.');
      }
      const counter = (await db.query(`INSERT INTO dental_queue_counters(company_id,day,last_number) VALUES($1,$2,1)
        ON CONFLICT(company_id,day) DO UPDATE SET last_number=dental_queue_counters.last_number+1 RETURNING last_number`, [companyId, day])).rows[0];
      const number = `A${String(counter.last_number).padStart(3, '0')}`;
      const duration = appointment?.duration_minutes || service?.durationMinutes || ctx.settings.fallbackMinutes;
      const row = (await db.query(`INSERT INTO dental_queue_turns(company_id,day,number,contact_id,appointment_id,scheduled_at,
        provider_user_id,provider_name,chair_id,chair_name,service_key,service_label,duration_minutes,created_by,updated_by,issued_at,queued_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$15) RETURNING id`,
        [companyId, day, number, input.contactId, input.appointmentId || null, appointment?.scheduled_utc || null,
          provider.id, provider.name, room.id, room.name, input.serviceKey, appointment?.booking_service_label || service!.label,
          duration > 0 ? duration : ctx.settings.fallbackMinutes, actorId, now])).rows[0];
      return { turnId: row.id, result: await this.turn(db, companyId, row.id) };
    }));
  }

  async next(companyId: number, actorId: number, raw: z.input<typeof nextTurnSchema>): Promise<QueueTurn | null> {
    const input = nextTurnSchema.parse(raw);
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    return this.transaction(companyId, db => this.request(db, companyId, actorId, 'call', input, async () => {
      const now = this.clock();
      this.assignment(ctx, input.providerUserId, input.chairId);
      const day = getZonedDateTimeParts(now, ctx.timezone).dateKey;
      const busy = await db.query(`SELECT id FROM dental_queue_turns WHERE company_id=$1 AND status IN ('called','in_service')
        AND (provider_user_id=$2 OR chair_id=$3)`, [companyId, input.providerUserId, input.chairId]);
      if (busy.rows.length) throw new QueueError('resource_busy', 'Finish or skip the current call for this professional and room first.');
      const rows = await db.query(`${selectTurns} WHERE q.company_id=$1 AND q.day=$2 AND q.provider_user_id=$3 AND q.chair_id=$4
        AND q.status='waiting' FOR UPDATE OF q`, [companyId, day, input.providerUserId, input.chairId]);
      const turn = rows.rows.map(mapQueueTurn).filter(t => eligibleTurn(t, +now)).sort(compareQueueTurns)[0];
      if (!turn) return { turnId: null, result: null };
      this.assignment(ctx, turn.providerUserId, turn.chairId, turn.serviceKey);
      await db.query(`UPDATE dental_queue_turns SET status='called',called_at=$3,updated_by=$4 WHERE company_id=$1 AND id=$2`, [companyId, turn.id, now, actorId]);
      return { turnId: turn.id, result: await this.turn(db, companyId, turn.id) };
    }));
  }

  async action(companyId: number, actorId: number, turnId: number, raw: z.input<typeof turnActionRequestSchema>): Promise<QueueTurn> {
    const input = turnActionRequestSchema.parse(raw);
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    return this.transaction(companyId, db => this.request(db, companyId, actorId, input.action, { ...input, turnId }, async () => {
      await db.query('SELECT id FROM dental_queue_turns WHERE company_id=$1 AND id=$2 FOR UPDATE', [companyId, turnId]);
      const turn = await this.turn(db, companyId, turnId);
      if (!allowedQueueActions[turn.status].includes(input.action)) throw new QueueError('invalid_transition', 'This action is no longer available. Refresh the queue.');
      const now = this.clock();
      if (input.action === 'return' || input.action === 'start' || input.action === 'recall') {
        if (turn.day !== getZonedDateTimeParts(now, ctx.timezone).dateKey) throw new QueueError('previous_day', 'Resolve this previous-day turn and issue a new ticket.');
        this.assignment(ctx, turn.providerUserId, turn.chairId, turn.serviceKey);
      }
      const status = { recall: 'called', start: 'in_service', finish: 'finished', skip: 'skipped', return: 'waiting', cancel: 'cancelled' }[input.action];
      await db.query(`UPDATE dental_queue_turns SET status=$3,updated_by=$4,
        called_at=CASE WHEN $5='recall' THEN $6 WHEN $5='return' THEN NULL ELSE called_at END,
        started_at=CASE WHEN $5='start' THEN $6 ELSE started_at END,
        finished_at=CASE WHEN $5 IN ('finish','cancel') THEN $6 ELSE finished_at END,
        queued_at=CASE WHEN $5='return' THEN $6 ELSE queued_at END WHERE company_id=$1 AND id=$2`, [companyId, turnId, status, actorId, input.action, now]);
      return { turnId, result: await this.turn(db, companyId, turnId) };
    }));
  }

  async changeStatus(companyId: number, actorId: number, turnId: number, raw: z.input<typeof queueStatusChangeSchema>): Promise<QueueTurn> {
    const input = queueStatusChangeSchema.parse(raw);
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    return this.transaction(companyId, db => this.request(db, companyId, actorId, 'status_change', { ...input, turnId }, async () => {
      // Appointment writers lock the appointment before their invalidation trigger
      // locks the turn. Follow the same order to avoid lock inversion.
      const initial = await this.turn(db, companyId, turnId);
      const appointment = initial.appointmentId ? (await db.query(`SELECT *, scheduled_at AT TIME ZONE 'UTC' AS scheduled_utc
        FROM contact_appointments WHERE company_id=$1 AND id=$2 FOR SHARE`, [companyId, initial.appointmentId])).rows[0] : null;
      await db.query('SELECT id FROM dental_queue_turns WHERE company_id=$1 AND id=$2 FOR UPDATE', [companyId, turnId]);
      const turn = await this.turn(db, companyId, turnId);
      if (turn.status !== input.expectedStatus) throw new QueueError('status_changed', 'This ticket’s status has changed. Refresh and try again.');
      if (turn.status === 'invalidated') throw new QueueError('ticket_invalidated', 'This ticket was invalidated. Check the patient in again.');
      if (turn.status === input.status) return { turnId, result: turn };
      const now = this.clock();
      const active = ['waiting', 'called', 'in_service', 'skipped'].includes(input.status);
      if (active) {
        if (turn.day !== getZonedDateTimeParts(now, ctx.timezone).dateKey) throw new QueueError('previous_day', 'Previous-day tickets require fresh check-in before returning to the queue.');
        const patient = (await db.query(`SELECT c.id FROM contacts c JOIN dental_patient_profiles p ON p.contact_id=c.id AND p.company_id=c.company_id
          WHERE c.company_id=$1 AND c.id=$2 FOR SHARE OF c, p`, [companyId, turn.contactId])).rows[0];
        if (!patient) throw new QueueError('patient_not_found', 'Select a registered patient in this clinic.', 404);
        const { service } = this.assignment(ctx, turn.providerUserId, turn.chairId, turn.serviceKey);
        if (turn.scheduledAt || turn.appointmentId) {
          if (!appointment || !turn.appointmentId || !['scheduled', 'confirmed'].includes(appointment.status)
            || appointment.contact_id !== turn.contactId || iso(appointment.scheduled_utc) !== turn.scheduledAt
            || (appointment.provider_user_id && appointment.provider_user_id !== turn.providerUserId)
            || (appointment.chair_id && appointment.chair_id !== turn.chairId)
            || (appointment.booking_service_key && appointment.booking_service_key !== turn.serviceKey)
            || (appointment.duration_minutes > 0 && appointment.duration_minutes !== turn.durationMinutes)) {
            throw new QueueError('appointment_changed', 'The appointment is no longer eligible or has changed. Check the patient in again.');
          }
        }
        if (!service && !(appointment?.booking_service_key === turn.serviceKey && appointment?.booking_service_label)) throw new QueueError('service_unavailable', 'The assigned service is no longer available. Check the patient in again.');
        const duplicate = (await db.query(`SELECT id FROM dental_queue_turns WHERE company_id=$1 AND id<>$2
          AND status IN ('waiting','called','in_service','skipped') AND (contact_id=$3 OR ($4::integer IS NOT NULL AND appointment_id=$4))`, [companyId, turnId, turn.contactId, turn.appointmentId])).rows[0];
        if (duplicate) throw new QueueError('duplicate_check_in', 'This patient or appointment already has an active ticket.');
        if (['called', 'in_service'].includes(input.status)) {
          if (turn.scheduledAt && Date.parse(turn.scheduledAt) > +now) throw new QueueError('appointment_not_due', 'This appointment is not due yet.');
          const busy = (await db.query(`SELECT id FROM dental_queue_turns WHERE company_id=$1 AND id<>$2 AND status IN ('called','in_service')
            AND (provider_user_id=$3 OR chair_id=$4)`, [companyId, turnId, turn.providerUserId, turn.chairId])).rows[0];
          if (busy) throw new QueueError('resource_busy', 'The professional or consulting room already has an active turn.');
        }
      }
      await db.query(`UPDATE dental_queue_turns SET status=$3,updated_by=$4,
        queued_at=CASE WHEN $3='waiting' THEN $5 ELSE queued_at END,
        called_at=CASE WHEN $3='waiting' THEN NULL WHEN $3='called' THEN $5 ELSE called_at END,
        started_at=CASE WHEN $3 IN ('waiting','called') THEN NULL WHEN $3='in_service' THEN $5 ELSE started_at END,
        finished_at=CASE WHEN $3 IN ('finished','cancelled') THEN $5 ELSE NULL END
        WHERE company_id=$1 AND id=$2`, [companyId, turnId, input.status, actorId, now]);
      const result = await this.turn(db, companyId, turnId);
      const timing = (t: QueueTurn) => ({ queuedAt: t.queuedAt, calledAt: t.calledAt, startedAt: t.startedAt, finishedAt: t.finishedAt });
      await db.query(`INSERT INTO dental_queue_events(company_id,turn_id,kind,response,actor_id,created_at) VALUES($1,$2,'status_correction',$3,$4,$5)`,
        [companyId, turnId, JSON.stringify({ from: turn.status, to: result.status, before: timing(turn), after: timing(result), requestId: input.requestId }), actorId, now]);
      if (input.status === 'called') await db.query(`INSERT INTO dental_queue_events(company_id,turn_id,kind,actor_id,created_at) VALUES($1,$2,'call',$3,$4)`, [companyId, turnId, actorId, now]);
      return { turnId, result };
    }));
  }

  async options(companyId: number): Promise<QueueOptions> {
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    const day = getZonedDateTimeParts(this.clock(), ctx.timezone).dateKey;
    return this.transaction(companyId, async db => {
      const rows = await db.query(`SELECT a.*, a.scheduled_at AT TIME ZONE 'UTC' AS scheduled_utc,c.name AS patient_name FROM contact_appointments a
        JOIN contacts c ON c.id=a.contact_id AND c.company_id=a.company_id
        WHERE a.company_id=$1 AND a.status IN ('scheduled','confirmed')
        AND ((a.scheduled_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date=$3::date ORDER BY a.scheduled_at`, [companyId, ctx.timezone, day]);
      return { providers: ctx.providers, rooms: ctx.rooms, services: ctx.services, appointments: rows.rows.map(a => ({
        id: a.id, contactId: a.contact_id, patientName: a.patient_name, scheduledAt: iso(a.scheduled_utc)!,
        providerUserId: a.provider_user_id, chairId: a.chair_id, serviceKey: a.booking_service_key, serviceLabel: a.booking_service_label,
      })) };
    }, true);
  }

  async snapshot(companyId: number, after?: number): Promise<QueueSnapshot> {
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    const now = this.clock();
    const day = getZonedDateTimeParts(now, ctx.timezone).dateKey;
    return this.transaction(companyId, async db => {
      const turns = (await db.query(`${selectTurns} WHERE q.company_id=$1 AND (q.day=$2 OR ($3::boolean=false AND q.status IN ('waiting','called','in_service','skipped'))) ORDER BY q.id`, [companyId, day, ctx.settings.autoClearPreviousDay])).rows.map(mapQueueTurn);
      const today = turns.filter(t => t.day === day);
      const estimates = estimateQueue(turns.filter(t => t.day === day || ['called', 'in_service'].includes(t.status)), +now);
      // A repeatable-read snapshot keeps the event cursor and visible state consistent.
      // Only call events share the clinic mutation lock. Trigger audit events can commit
      // out of sequence and must not advance a TV cursor past an uncommitted call.
      const cursor = Number((await db.query("SELECT COALESCE(max(id),0) AS cursor FROM dental_queue_events WHERE company_id=$1 AND kind IN ('call','recall')", [companyId])).rows[0].cursor);
      const events = after === undefined ? [] : (await db.query(`SELECT e.id,e.turn_id,q.number,q.chair_name,q.provider_name,e.created_at
        FROM dental_queue_events e JOIN dental_queue_turns q ON q.id=e.turn_id AND q.company_id=e.company_id
        WHERE e.company_id=$1 AND e.id>$2 AND e.id<=$3 AND e.kind IN ('call','recall') AND q.day=$4 ORDER BY e.id`, [companyId, after, cursor, day])).rows.map(e => ({
        id: e.id, turnId: e.turn_id, number: e.number, chairName: e.chair_name, providerName: e.provider_name, createdAt: iso(e.created_at)!,
      }));
      const project = (t: QueueTurn): DisplayTurn => ({ id: t.id, number: t.number, providerUserId: t.providerUserId, providerName: t.providerName,
        chairId: t.chairId, chairName: t.chairName, status: t.status, estimate: estimates[t.id] || { minutes: null, delayed: false } });
      const active = today.filter(t => ['called', 'in_service'].includes(t.status));
      // Event IDs serialize calls even if two actions share a timestamp or the
      // server clock is adjusted. Keep this order on reload without replaying audio.
      const lastCalls = active.length ? (await db.query(`SELECT turn_id,max(id) AS event_id FROM dental_queue_events
        WHERE company_id=$1 AND turn_id=ANY($2::int[]) AND kind IN ('call','recall') GROUP BY turn_id`, [companyId, active.map(t => t.id)])).rows : [];
      const callOrder = new Map<number, number>(lastCalls.map(e => [Number(e.turn_id), Number(e.event_id)]));
      const display: QueueDisplaySnapshot = {
        day, timezone: ctx.timezone, serverTime: now.toISOString(), clinicName: ctx.clinicName, logoUrl: ctx.logoUrl, settings: ctx.settings,
        current: active.sort((a, b) =>
          Number(b.status === 'called') - Number(a.status === 'called')
          || (callOrder.get(b.id) || 0) - (callOrder.get(a.id) || 0)
          || Date.parse(b.calledAt || b.issuedAt) - Date.parse(a.calledAt || a.issuedAt)
          || b.id - a.id).map(project),
        upcoming: today.filter(t => t.status === 'waiting').sort((a, b) => (estimates[a.id]?.minutes ?? Infinity) - (estimates[b.id]?.minutes ?? Infinity) || compareQueueTurns(a, b)).map(project),
        rooms: ctx.rooms,
        // The TV roster represents active professionals assigned an active service
        // through Booking Settings specialties; reception options stay independent.
        providers: ctx.providers.filter(p => ctx.services.some(s => p.specialtyIds.includes(s.specialtyId)))
          .map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl || null })),
        services: ctx.services.map(s => ({ id: s.id, label: s.label })), events, cursor,
      };
      return { turns, estimates, display };
    }, true);
  }

  async ticket(companyId: number, turnId: number): Promise<QueueTicket> {
    const ctx = await this.context(companyId);
    await this.clearPreviousDay(companyId, ctx);
    return this.transaction(companyId, async db => ({ turn: await this.turn(db, companyId, turnId), settings: ctx.settings, clinicName: ctx.clinicName, logoUrl: ctx.logoUrl, timezone: ctx.timezone }), true);
  }

  async digitalTicket(companyId: number, turnId: number) {
    const ctx = await this.context(companyId);
    return this.transaction(companyId, async db => {
      const turn = await this.turn(db, companyId, turnId);
      if (turn.day !== getZonedDateTimeParts(this.clock(), ctx.timezone).dateKey) {
        throw new QueueError('ticket_expired', 'This ticket has expired.', 410);
      }
      const row = (await db.query('SELECT digital_token FROM dental_queue_turns WHERE company_id=$1 AND id=$2 FOR UPDATE', [companyId, turnId])).rows[0];
      if (!row) throw new QueueError('turn_not_found', 'Turn not found.', 404);
      const token = row.digital_token || randomBytes(32).toString('base64url');
      if (!row.digital_token) await db.query('UPDATE dental_queue_turns SET digital_token=$3 WHERE company_id=$1 AND id=$2', [companyId, turnId, token]);
      return { token, day: turn.day, timezone: ctx.timezone };
    });
  }

  async publicTicket(token: string): Promise<PublicQueueTicket> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new QueueError('ticket_not_found', 'Ticket not found.', 404);
    const db = await this.pool.connect();
    let reference: { id: number; company_id: number; day: string } | undefined;
    try {
      reference = (await db.query('SELECT id,company_id,day::text AS day FROM dental_queue_turns WHERE digital_token=$1', [token])).rows[0];
    } finally { db.release(); }
    if (!reference) throw new QueueError('ticket_not_found', 'Ticket not found.', 404);
    // Context validates clinic availability. Snapshot reuses expiry and estimate rules.
    const snapshot = await this.snapshot(reference.company_id);
    const ctx = snapshot.display;
    if (reference.day !== snapshot.display.day) throw new QueueError('ticket_expired', 'This ticket has expired.', 410);
    const turn = snapshot.turns.find(t => t.id === reference!.id);
    if (!turn) throw new QueueError('ticket_not_found', 'Ticket not found.', 404);
    return publicQueueTicketSchema.parse({
      clinicName: ctx.clinicName, logoUrl: ctx.logoUrl, primaryColor: ctx.settings.primaryColor,
      logoBackgroundColor: ctx.settings.logoBackgroundColor, number: turn.number, day: turn.day,
      timezone: ctx.timezone, serverTime: snapshot.display.serverTime, issuedAt: turn.issuedAt,
      scheduledAt: turn.scheduledAt, providerName: turn.providerName, chairName: turn.chairName,
      status: turn.status, estimate: snapshot.estimates[turn.id] || { minutes: null, delayed: false },
    });
  }
}
