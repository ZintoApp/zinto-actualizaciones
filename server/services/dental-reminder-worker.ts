import { realEstateReminderRepository, prepareRealEstateReminder } from './real-estate-reminder-adapter';
import { logger } from '../utils/logger';
import { dentalReminderRepository as repository } from './dental-reminder-worker-repository';
import { prepareDentalReminder } from './dental-reminder-delivery';
import { dispatchDentalReminders } from './dental-reminder-engine';
import { processDentalReminderBatches } from './dental-batch-worker';

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
export async function processDentalReminders(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await repository.recoverDentalReminderClaims();
    await repository.reconcileDentalReminders();
    await dispatchDentalReminders({
      claim: repository.claimDentalReminder,
      prepare: prepareDentalReminder,
      begin: repository.beginDentalReminder,
      finish: repository.finishDentalReminder,
      log: error => logger.error('dental-reminders', 'Could not persist reminder delivery outcome', error),
    });
  } catch (error) { logger.error('dental-reminders', 'Reminder worker failed', error); }
  finally { running = false; }
}
let realEstateRunning = false;
export async function processRealEstateReminders(): Promise<void> {
  if(realEstateRunning) return;
  realEstateRunning=true;
  try {
    await realEstateReminderRepository.recoverDentalReminderClaims();
    await realEstateReminderRepository.reconcileDentalReminders();
    await dispatchDentalReminders({claim:realEstateReminderRepository.claimDentalReminder,prepare:prepareRealEstateReminder,
      begin:realEstateReminderRepository.beginDentalReminder,finish:realEstateReminderRepository.finishDentalReminder,
      log:error=>logger.error('real-estate-reminders','Could not persist reminder delivery outcome',error)});
  } catch(error) {logger.error('real-estate-reminders','Reminder worker failed',error);}
  finally {realEstateRunning=false;}
}
export function startDentalReminderWorker(): void {
  if (timer) return;
  const tick = () => {
    // Separate in-flight guards keep a slow batch from delaying appointment-relative reminders.
    void processDentalReminders();
    void processRealEstateReminders();
    void processDentalReminderBatches().catch(error => logger.error('dental-batches', 'Batch worker failed', error));
  };
  tick();
  timer = setInterval(tick, 60_000);
  timer.unref();
}
export function stopDentalReminderWorker(): void {
  clearInterval(timer);
  timer = undefined;
}
