import {z} from 'zod';
import {dentalAutomaticRemindersSchema, defaultDentalAutomaticReminders} from './types/dental-reminder-types';
export const realEstateReservationSchema=z.object({
 assetId:z.number().int().positive(),buyerContactId:z.number().int().positive(),
 currency:z.string().regex(/^[A-Z]{3}$/),depositAmount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).default('0'),
 customFields:z.record(z.unknown()).default({}),
}).strict();
export const realEstateReservationTransitions={held:['confirmed','cancelled'],confirmed:['cancelled'],expired:[],cancelled:[],converted:[]} as const;
export const realEstateSettingsSchema=z.object({reservationExpiryHours:z.number().int().min(1).max(720).default(48),scheduleBufferMinutes:z.number().int().min(0).max(120).default(0),automaticReminders:dentalAutomaticRemindersSchema.default(defaultDentalAutomaticReminders)}).strict();
