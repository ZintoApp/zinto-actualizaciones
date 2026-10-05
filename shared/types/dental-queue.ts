import { z } from 'zod';

export const queueStatusSchema = z.enum(['waiting', 'called', 'in_service', 'finished', 'skipped', 'cancelled', 'invalidated']);
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export const editableQueueStatusSchema = queueStatusSchema.exclude(['invalidated']);
export type EditableQueueStatus = z.infer<typeof editableQueueStatusSchema>;
export const queueStatusChangeSchema = z.object({
  status: editableQueueStatusSchema, expectedStatus: queueStatusSchema, requestId: z.string().uuid(),
});
export const queueActionSchema = z.enum(['recall', 'start', 'finish', 'skip', 'return', 'cancel']);
export type QueueAction = z.infer<typeof queueActionSchema>;
const id = z.number().int().positive();
export const issueTurnSchema = z.object({
  requestId: z.string().uuid(), contactId: id, appointmentId: id.optional(),
  providerUserId: id, chairId: id, serviceKey: z.string().trim().min(1).max(200),
});
export const nextTurnSchema = z.object({ requestId: z.string().uuid(), providerUserId: id, chairId: id });
export const turnActionRequestSchema = z.object({ requestId: z.string().uuid(), action: queueActionSchema });
// Persist a small identifier; the client bundles the default image as Base64.
export const DEFAULT_QUEUE_BACKGROUND_IMAGE = 'builtin:dental-tv';
export const defaultQueueImageBackground = {
  backgroundImageUrl: DEFAULT_QUEUE_BACKGROUND_IMAGE,
  backgroundImageMode: 'cover', backgroundImagePosition: 'center',
  backgroundImageTransparency: 63, backgroundImageDimming: 40,
} as const;
export const queueSettingsSchema = z.object({
  logoUrl: z.string().max(2000).refine(v => !v || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), 'Use an image URL or uploaded file path').default(''),
  logoBackgroundColor: z.union([z.string().regex(/^#[0-9a-f]{6}$/i), z.literal('transparent')]).default('#ffffff'),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#2563eb'),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#0b1426'),
  backgroundType: z.enum(['color', 'image']).optional(),
  backgroundImageUrl: z.string().max(2000).refine(v => !v || v === DEFAULT_QUEUE_BACKGROUND_IMAGE || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), 'Use an image URL or uploaded file path').default(''),
  backgroundImageMode: z.enum(['cover', 'fit', 'stretch', 'tile']).default('cover'),
  backgroundImagePosition: z.enum(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']).default('center'),
  backgroundImageTransparency: z.number().int().min(0).max(100).default(defaultQueueImageBackground.backgroundImageTransparency),
  backgroundImageDimming: z.number().int().min(0).max(100).default(defaultQueueImageBackground.backgroundImageDimming),
  welcomeMessage: z.string().trim().max(200).default(''),
  displayClinicName: z.string().trim().max(200).default(''),
  messages: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  ticketFooter: z.string().trim().max(300).default(''),
  paperWidth: z.enum(['80', '58']).default('80'),
  chimeEnabled: z.boolean().default(true),
  announcementMode: z.enum(['silent', 'chime', 'speech', 'chime_speech', 'sound', 'sound_speech']).optional(),
  soundUrl: z.string().max(2000).refine(v => !v || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), 'Use an uploaded sound URL').default(''),
  speechLanguage: z.enum(['en', 'es']).default('en'),
  speechVoice: z.string().max(300).default(''),
  speechRate: z.number().min(0.5).max(1.5).default(1),
  announcementVolume: z.number().min(0).max(1).default(1),
  autoClearPreviousDay: z.boolean().default(true),
  fallbackMinutes: z.number().int().min(5).max(480).default(30),
}).refine(settings => !settings.announcementMode?.startsWith('sound') || !!settings.soundUrl, { message: 'Upload a sound before enabling sound announcements', path: ['soundUrl'] })
  .refine(settings => settings.backgroundType !== 'image' || !!settings.backgroundImageUrl, { message: 'Upload an image before using an image background', path: ['backgroundImageUrl'] })
  .transform(settings => ({ ...settings, backgroundType: settings.backgroundType ?? (settings.backgroundImageUrl ? 'image' as const : 'color' as const), announcementMode: settings.announcementMode ?? (settings.chimeEnabled ? 'chime' as const : 'silent' as const) }));
export type QueueSettings = z.infer<typeof queueSettingsSchema>;
export const defaultQueueSettings = (): QueueSettings => queueSettingsSchema.parse({});
export const QUEUE_SETTING_KEY = 'dentalDigitalTurn';

export type QueueTurn = {
  id: number; day: string; number: string; contactId: number; patientName: string;
  patientAvatarUrl?: string | null;
  appointmentId: number | null; scheduledAt: string | null;
  providerUserId: number; providerName: string; chairId: number; chairName: string;
  serviceKey: string; serviceLabel: string; durationMinutes: number;
  status: QueueStatus; issuedAt: string; queuedAt: string; calledAt: string | null;
  startedAt: string | null; finishedAt: string | null; reason: string | null;
};
export type QueueEstimate = { minutes: number | null; delayed: boolean };
export type DisplayTurn = Pick<QueueTurn, 'id' | 'number' | 'providerUserId' | 'providerName' | 'chairId' | 'chairName' | 'status'> & { estimate: QueueEstimate };
export type QueueCallEvent = { id: number; turnId: number; number: string; chairName: string; providerName: string; createdAt: string };
export type QueueRoom = { id: number; name: string };
export type QueueProvider = { id: number; name: string; avatarUrl?: string | null; chairIds: number[]; specialtyIds: string[] };
export type QueueService = { id: string; label: string; durationMinutes: number; specialtyId: string };
export type QueueAppointment = { id: number; contactId: number; patientName: string; scheduledAt: string; providerUserId: number | null; chairId: number | null; serviceKey: string | null; serviceLabel: string | null };
export type QueueOptions = { appointments: QueueAppointment[]; providers: QueueProvider[]; rooms: QueueRoom[]; services: QueueService[] };
export type QueueDisplaySnapshot = {
  day: string; timezone: string; serverTime: string; clinicName: string; logoUrl: string;
  settings: QueueSettings; current: DisplayTurn[]; upcoming: DisplayTurn[];
  rooms: QueueRoom[]; providers: Pick<QueueProvider, 'id' | 'name' | 'avatarUrl'>[]; services: Pick<QueueService, 'id' | 'label'>[];
  events: QueueCallEvent[]; cursor: number;
};
export type QueueSnapshot = { turns: QueueTurn[]; estimates: Record<number, QueueEstimate>; display: QueueDisplaySnapshot };
export type QueueTicket = { turn: QueueTurn; settings: QueueSettings; clinicName: string; logoUrl: string; timezone: string };

const digitalTicketPath = /^\/dental\/ticket\/[A-Za-z0-9_-]{43}$/;
export const digitalTicketLinkSchema = z.object({ url: z.string().refine(value => {
  if (digitalTicketPath.test(value)) return true;
  // Accept earlier servers' absolute links during rollout; clients rebase them.
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && digitalTicketPath.test(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
}, 'Use a digital ticket URL'), day: z.string(), timezone: z.string() });
export type DigitalTicketLink = z.infer<typeof digitalTicketLinkSchema>;
// Deliberately independent from QueueTurn/QueueSettings: never expose patient or clinical fields.
export const publicQueueTicketSchema = z.object({
  clinicName: z.string(), logoUrl: z.string(), primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  logoBackgroundColor: z.union([z.string().regex(/^#[0-9a-f]{6}$/i), z.literal('transparent')]),
  number: z.string(), day: z.string(), timezone: z.string(), serverTime: z.string().datetime(),
  issuedAt: z.string().datetime(), scheduledAt: z.string().datetime().nullable(),
  providerName: z.string(), chairName: z.string(), status: queueStatusSchema,
  estimate: z.object({ minutes: z.number().nonnegative().nullable(), delayed: z.boolean() }),
}).strict();
export type PublicQueueTicket = z.infer<typeof publicQueueTicketSchema>;

export function eligibleTurn(turn: QueueTurn, now: number): boolean {
  return turn.status === 'waiting' && (!turn.scheduledAt || Date.parse(turn.scheduledAt) <= now);
}
export function compareQueueTurns(a: QueueTurn, b: QueueTurn): number {
  if (!!a.scheduledAt !== !!b.scheduledAt) return a.scheduledAt ? -1 : 1;
  return Date.parse(a.scheduledAt || a.queuedAt) - Date.parse(b.scheduledAt || b.queuedAt) || a.id - b.id;
}

/** Event simulation shares next-call ordering, accounting for both scarce resources. */
export function estimateQueue(turns: QueueTurn[], now: number): Record<number, QueueEstimate> {
  const estimates: Record<number, QueueEstimate> = {};
  const providers = new Map<number, number>();
  const rooms = new Map<number, number>();
  const delayedProviders = new Set<number>();
  const delayedRooms = new Set<number>();
  for (const turn of turns.filter(t => t.status === 'called' || t.status === 'in_service')) {
    const end = Date.parse(turn.startedAt || turn.calledAt || turn.issuedAt) + turn.durationMinutes * 60000;
    const delayed = end <= now;
    estimates[turn.id] = { minutes: 0, delayed };
    if (delayed) { delayedProviders.add(turn.providerUserId); delayedRooms.add(turn.chairId); }
    providers.set(turn.providerUserId, Math.max(now, end));
    rooms.set(turn.chairId, Math.max(now, end));
  }
  const pending = turns.filter(t => t.status === 'waiting');
  while (pending.length) {
    const startAt = (t: QueueTurn) => Math.max(now, providers.get(t.providerUserId) || now, rooms.get(t.chairId) || now, t.scheduledAt ? Date.parse(t.scheduledAt) : now);
    const time = Math.min(...pending.map(startAt));
    const selected = pending.filter(t => startAt(t) <= time).sort(compareQueueTurns)[0];
    const delayed = delayedProviders.has(selected.providerUserId) || delayedRooms.has(selected.chairId);
    estimates[selected.id] = { minutes: delayed ? null : Math.ceil((time - now) / 300000) * 5, delayed };
    if (delayed) { delayedProviders.add(selected.providerUserId); delayedRooms.add(selected.chairId); }
    const end = time + selected.durationMinutes * 60000;
    providers.set(selected.providerUserId, end); rooms.set(selected.chairId, end);
    pending.splice(pending.indexOf(selected), 1);
  }
  return estimates;
}

export const allowedQueueActions: Record<QueueStatus, readonly QueueAction[]> = {
  waiting: ['skip', 'cancel'], called: ['recall', 'start', 'skip', 'cancel'],
  in_service: ['finish', 'cancel'], skipped: ['return', 'cancel'],
  finished: [], cancelled: [], invalidated: [],
};
