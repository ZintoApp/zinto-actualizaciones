import { getPool } from '../db';
import { createDentalReminderRepository } from './dental-reminder-repository';

export const dentalReminderRepository = createDentalReminderRepository(getPool);
