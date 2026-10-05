import { logger } from '../utils/logger';
import { expireDentalBookingHolds } from './dental-booking-service';

const SWEEP_INTERVAL_MS = 60_000;

export function startDentalBookingExpiryWorker(): void {
  setInterval(async () => {
    try {
      const { expiredCount } = await expireDentalBookingHolds();
      if (expiredCount > 0) {
        logger.info('dental-booking', `Expired ${expiredCount} dental hold/request booking(s)`);
      }
    } catch (error) {
      logger.error('dental-booking', 'Error during dental booking expiry sweep', error);
    }
  }, SWEEP_INTERVAL_MS);
}
