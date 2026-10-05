import { logger } from '../utils/logger';

/**
 * Maintenance Coordinator
 * Centralized service for managing all background services during maintenance operations
 * (e.g., database restore)
 */
export class MaintenanceCoordinator {
  private static instance: MaintenanceCoordinator;
  private servicesPaused = false;

  private constructor() {}

  static getInstance(): MaintenanceCoordinator {
    if (!MaintenanceCoordinator.instance) {
      MaintenanceCoordinator.instance = new MaintenanceCoordinator();
    }
    return MaintenanceCoordinator.instance;
  }

  /**
   * Pause all background services
   * Stops all schedulers and background jobs to prevent database access during maintenance
   */
  async pauseAllServices(): Promise<void> {
    if (this.servicesPaused) {
      logger.info('maintenance-coordinator', 'Services already paused');
      return;
    }

    logger.info('maintenance-coordinator', 'Pausing all background services...');

    const errors: string[] = [];

    try {
      const { stopWhatsAppContactSyncWorker } = await import('./whatsapp-contact-sync-worker');
      stopWhatsAppContactSyncWorker();
      logger.info('maintenance-coordinator', 'WhatsApp contact sync worker stopped');
    } catch (error) {
      const errorMsg = `Failed to stop WhatsApp contact sync worker: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const messageScheduler = (await import('./message-scheduler')).default;
      messageScheduler.stop();
      logger.info('maintenance-coordinator', '✅ Message scheduler stopped');
    } catch (error) {
      const errorMsg = `Failed to stop message scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { CampaignQueueService } = await import('./campaignQueueService');




      const campaignQueueService = new CampaignQueueService();
      await campaignQueueService.stopQueueProcessor();

      await new Promise(resolve => setTimeout(resolve, 5000)); // 5s grace period for in-flight work
      logger.info('maintenance-coordinator', '✅ Campaign queue processor stopped');
    } catch (error) {
      const errorMsg = `Failed to stop campaign queue: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { backupScheduler } = await import('./backup-scheduler');
      backupScheduler.stop();
      logger.info('maintenance-coordinator', '✅ Backup scheduler stopped');
    } catch (error) {
      const errorMsg = `Failed to stop backup scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const FollowUpScheduler = (await import('./follow-up-scheduler')).default;
      const followUpScheduler = FollowUpScheduler.getInstance();
      followUpScheduler.stop();
      logger.info('maintenance-coordinator', '✅ Follow-up scheduler stopped');
    } catch (error) {
      const errorMsg = `Failed to stop follow-up scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const FollowUpCleanupService = (await import('./follow-up-cleanup')).default;
      const followUpCleanupService = FollowUpCleanupService.getInstance();
      followUpCleanupService.stop();
      logger.info('maintenance-coordinator', '✅ Follow-up cleanup service stopped');
    } catch (error) {
      const errorMsg = `Failed to stop follow-up cleanup: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { subscriptionScheduler } = await import('./subscription-scheduler');
      subscriptionScheduler.stop();
      logger.info('maintenance-coordinator', '✅ Subscription scheduler stopped');
    } catch (error) {
      const errorMsg = `Failed to stop subscription scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { inboxBackupSchedulerService } = await import('./inbox-backup-scheduler');
      await inboxBackupSchedulerService.stopAll();
      logger.info('maintenance-coordinator', '✅ Inbox backup scheduler stopped');
    } catch (error) {
      const errorMsg = `Failed to stop inbox backup scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    logger.info('maintenance-coordinator', 'Waiting for in-flight operations to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    this.servicesPaused = true;

    if (errors.length > 0) {
      logger.warn('maintenance-coordinator', `Some services failed to stop: ${errors.join('; ')}`);
    } else {
      logger.info('maintenance-coordinator', '✅ All background services paused successfully');
    }
  }

  /**
   * Resume all background services
   * Restarts all schedulers and background jobs after maintenance is complete
   */
  async resumeAllServices(): Promise<void> {
    if (!this.servicesPaused) {
      logger.info('maintenance-coordinator', 'Services not paused, skipping resume');
      return;
    }

    logger.info('maintenance-coordinator', 'Resuming all background services...');

    const errors: string[] = [];

    try {
      const { startWhatsAppContactSyncWorker } = await import('./whatsapp-contact-sync-worker');
      startWhatsAppContactSyncWorker();
      logger.info('maintenance-coordinator', 'WhatsApp contact sync worker started');
    } catch (error) {
      const errorMsg = `Failed to start WhatsApp contact sync worker: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const messageScheduler = (await import('./message-scheduler')).default;
      messageScheduler.start();
      logger.info('maintenance-coordinator', '✅ Message scheduler started');
    } catch (error) {
      const errorMsg = `Failed to start message scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { CampaignQueueService } = await import('./campaignQueueService');
      const campaignQueueService = new CampaignQueueService();
      campaignQueueService.startQueueProcessor();
      logger.info('maintenance-coordinator', '✅ Campaign queue processor started');
    } catch (error) {
      const errorMsg = `Failed to start campaign queue: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { backupScheduler } = await import('./backup-scheduler');
      await backupScheduler.start();
      logger.info('maintenance-coordinator', '✅ Backup scheduler started');
    } catch (error) {
      const errorMsg = `Failed to start backup scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const FollowUpScheduler = (await import('./follow-up-scheduler')).default;
      const followUpScheduler = FollowUpScheduler.getInstance();
      followUpScheduler.start();
      logger.info('maintenance-coordinator', '✅ Follow-up scheduler started');
    } catch (error) {
      const errorMsg = `Failed to start follow-up scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const FollowUpCleanupService = (await import('./follow-up-cleanup')).default;
      const followUpCleanupService = FollowUpCleanupService.getInstance();
      followUpCleanupService.start();
      logger.info('maintenance-coordinator', '✅ Follow-up cleanup service started');
    } catch (error) {
      const errorMsg = `Failed to start follow-up cleanup: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { subscriptionScheduler } = await import('./subscription-scheduler');
      subscriptionScheduler.start();
      logger.info('maintenance-coordinator', '✅ Subscription scheduler started');
    } catch (error) {
      const errorMsg = `Failed to start subscription scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }


    try {
      const { inboxBackupSchedulerService } = await import('./inbox-backup-scheduler');
      await inboxBackupSchedulerService.startAll();
      logger.info('maintenance-coordinator', '✅ Inbox backup scheduler started');
    } catch (error) {
      const errorMsg = `Failed to start inbox backup scheduler: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('maintenance-coordinator', errorMsg);
    }

    this.servicesPaused = false;

    if (errors.length > 0) {
      logger.warn('maintenance-coordinator', `Some services failed to start: ${errors.join('; ')}`);
    } else {
      logger.info('maintenance-coordinator', '✅ All background services resumed successfully');
    }
  }

  /**
   * Get status of all services
   */
  getServicesStatus(): {
    paused: boolean;
    messageScheduler: boolean;
    campaignQueue: boolean;
    backupScheduler: boolean;
    followUpScheduler: boolean;
    followUpCleanup: boolean;
    subscriptionScheduler: boolean;
    inboxBackupScheduler: boolean;
  } {
    return {
      paused: this.servicesPaused,
      messageScheduler: false, // Would need to query actual status
      campaignQueue: false,
      backupScheduler: false,
      followUpScheduler: false,
      followUpCleanup: false,
      subscriptionScheduler: false,
      inboxBackupScheduler: false
    };
  }
}

