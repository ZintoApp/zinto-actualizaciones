import { z } from 'zod';
import { dentalReminderRuleSchema, type DentalAutomaticReminders } from './dental-reminder-types';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const reminderBatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.enum(['reminder', 'confirmation']),
  mode: z.enum(['daily', 'once']),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  daysAhead: z.number().int().min(0).max(365).default(1),
  sendDate: date.nullable().default(null),
  appointmentDate: date.nullable().default(null),
  providerUserId: z.number().int().positive().nullable().default(null),
  chairId: z.number().int().positive().nullable().default(null),
  serviceKey: z.string().min(1).max(64).nullable().default(null),
  statuses: z.array(z.enum(['scheduled', 'confirmed'])).min(1).max(2),
  channelMode: z.enum(['latest_conversation', 'specific_connection']),
  channelConnectionId: z.number().int().positive().nullable().default(null),
  message: dentalReminderRuleSchema.shape.message,
  officialTemplates: dentalReminderRuleSchema.shape.officialTemplates,
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'once' && (!value.sendDate || !value.appointmentDate))
    ctx.addIssue({ code: 'custom', path: ['sendDate'], message: 'Choose the send and appointment dates.' });
  if (value.mode === 'once' && value.sendDate && value.appointmentDate && value.sendDate > value.appointmentDate)
    ctx.addIssue({ code: 'custom', path: ['appointmentDate'], message: 'Appointment date cannot precede the send date.' });
  if (value.channelMode === 'specific_connection' && !value.channelConnectionId)
    ctx.addIssue({ code: 'custom', path: ['channelConnectionId'], message: 'Choose a channel connection.' });
});
export type ReminderBatchInput = z.infer<typeof reminderBatchSchema>;
export interface ReminderBatch extends ReminderBatchInput {
  id: number; state: 'active' | 'paused' | 'cancelled' | 'completed';
  timezone: string; nextRunAt: string | null; version: number;
  latestRunStatus?: string | null;
}
export interface ReminderBatchPreview { count: number; timezone: string; nextRunAt: string; appointmentDate: string }
export interface ReminderBatchRun {
  id: number; name: string; scheduledFor: string; timezone: string; appointmentDate: string;
  status: string; total: number; sent: number; failed: number; skipped: number; unknown: number; pending: number;
}
export interface ReminderBatchDelivery {
  id: number; appointmentId: number; patientName: string | null; status: string; lastError: string | null; sentAt: string | null;
}
export interface ReminderBatchOptions {
  providers: Array<{ id: number; name: string }>;
  offices: Array<{ id: number; name: string }>;
  services: Array<{ id: string; name: string }>;
  relativeRemindersEnabled: boolean;
}
export function batchDeliverySettings(input: ReminderBatchInput): DentalAutomaticReminders {
  return { enabled: true, channelMode: input.channelMode, channelConnectionId: input.channelConnectionId,
    rules: [{ id: 'batch', leadMinutes: 1, activatedAt: null, message: input.message, officialTemplates: input.officialTemplates }] };
}
