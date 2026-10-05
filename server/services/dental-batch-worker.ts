import { getPool } from '../db';
import { createDentalBatchRepository } from './dental-batch-repository';
import { dispatchDentalReminders, DentalReminderSkip } from './dental-reminder-engine';
import { prepareDentalReminderMessage } from './dental-reminder-delivery';
import { logger } from '../utils/logger';

export const dentalBatchRepository = createDentalBatchRepository(getPool);
let running = false;
export async function processDentalReminderBatches() {
  if (running) return;
  running = true;
  try {
    await dentalBatchRepository.reconcile();
    await dispatchDentalReminders({
      claim: dentalBatchRepository.claim,
      prepare: async job => {
        const context = await dentalBatchRepository.context(job);
        if (!context) throw new DentalReminderSkip('Appointment or batch is no longer eligible');
        return prepareDentalReminderMessage(job, context);
      },
      begin: dentalBatchRepository.begin,
      finish: dentalBatchRepository.finish,
      log: error => logger.error('dental-batches', 'Could not persist batch delivery', error),
    });
    await dentalBatchRepository.settle();
  } finally { running = false; }
}
