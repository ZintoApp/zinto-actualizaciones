import type { DentalAutomaticReminders, DentalReminderRule } from '../../shared/types/dental-reminder-types';

export interface DentalReminderAppointment {
  id: number; companyId: number; contactId: number; occurrence: number;
  scheduledAt: Date; eligibleSince: Date; status: string;
}
export interface DentalReminderJob {
  id: number; companyId: number; appointmentId: number; occurrence: number; ruleId: string;
  scheduledFor: Date; claimId: string; attempts: number;
}
export function dentalReminderSendAt(appointment: DentalReminderAppointment, rule: DentalReminderRule): Date | null {
  if (!['scheduled', 'confirmed'].includes(appointment.status) || !rule.activatedAt) return null;
  const due = appointment.scheduledAt.getTime() - rule.leadMinutes * 60_000;
  // Eligibility/activation, not worker poll time, decides whether this was a short-notice booking.
  const earliest = Math.max(appointment.eligibleSince.getTime(), new Date(rule.activatedAt).getTime());
  return Number.isFinite(due) && due >= earliest ? new Date(due) : null;
}
export function isDentalReminderCurrent(job: DentalReminderJob, appointment: DentalReminderAppointment, settings: DentalAutomaticReminders, now: Date): boolean {
  const rule = settings.rules.find(item => item.id === job.ruleId);
  if (!settings.enabled || !rule || job.companyId !== appointment.companyId || job.appointmentId !== appointment.id ||
    job.occurrence !== appointment.occurrence || appointment.scheduledAt <= now) return false;
  return dentalReminderSendAt(appointment, rule)?.getTime() === job.scheduledFor.getTime();
}
export class DentalReminderSkip extends Error {}
/** A configuration problem before dispatch does not consume a delivery attempt. */
export class DentalReminderDeferred extends Error {}
/** Only an explicit provider rejection is safe to retry; a lost response can mean it sent. */
export class DentalReminderRejected extends Error {
  constructor(message: string, public readonly retryable = false) { super(message); }
}
export interface PreparedDentalReminder {
  conversationId: number; channelConnectionId: number;
  send: () => Promise<string>;
}
export interface DentalReminderDispatchDependencies {
  claim: () => Promise<DentalReminderJob | null>;
  prepare: (job: DentalReminderJob) => Promise<PreparedDentalReminder>;
  begin: (job: DentalReminderJob, prepared: PreparedDentalReminder) => Promise<boolean>;
  finish: (job: DentalReminderJob, status: 'sent' | 'skipped' | 'failed' | 'unknown' | 'pending', detail?: string, messageId?: string, retryAfterSeconds?: number) => Promise<void>;
  log: (error: unknown) => void;
}
export async function dispatchDentalReminders(deps: DentalReminderDispatchDependencies, limit = 100): Promise<void> {
  for (let index = 0; index < limit; index++) {
    const job = await deps.claim();
    if (!job) return;
    let began = false;
    try {
      const prepared = await deps.prepare(job);
      began = await deps.begin(job, prepared);
      if (!began) continue;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let messageId: string;
      try {
        messageId = await Promise.race([
          prepared.send(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Delivery response timed out; outcome unknown')), 45_000); }),
        ]);
      } finally { clearTimeout(timer); }
      if (!messageId) throw new Error('Provider returned no delivery identifier; outcome unknown');
      await deps.finish(job, 'sent', undefined, messageId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Reminder failed';
      const deferred = !began && error instanceof DentalReminderDeferred;
      const status = deferred ? 'pending' : error instanceof DentalReminderSkip ? 'skipped'
        : error instanceof DentalReminderRejected ? (error.retryable && job.attempts <= 3 ? 'pending' : 'failed')
        : began ? 'unknown' : 'failed';
      // A persistence failure after sending must never turn into a blind retry.
      try { await deps.finish(job, status, reason, undefined, deferred ? 60 : undefined); } catch (writeError) { deps.log(writeError); }
    }
  }
}
