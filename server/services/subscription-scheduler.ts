import { EventEmitter } from 'events';
import * as cron from 'node-cron';
import { storage } from '../storage';
import { db } from '../db';
import {
  companies,
  subscriptionNotifications
} from '@shared/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { gracePeriodService } from './grace-period-service';
import { usageTrackingService } from './usage-tracking-service';
import { dunningService } from './dunning-service';
import { subscriptionPausingService } from './subscription-pausing-service';
import { logger } from '../utils/logger';

export interface SchedulerConfig {
  renewalCheckInterval?: string; // cron expression
  notificationCheckInterval?: string;
  dunningCheckInterval?: string;
  usageResetInterval?: string;
  gracePeriodCheckInterval?: string;
  pauseResumeCheckInterval?: string;
}

/**
 * Subscription Scheduler Service
 * Handles all scheduled subscription-related tasks
 */
export class SubscriptionScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;

  constructor(config: SchedulerConfig = {}) {
    super();
    this.config = {
      renewalCheckInterval: '0 */6 * * *', // Every 6 hours
      notificationCheckInterval: '*/15 * * * *', // Every 15 minutes
      dunningCheckInterval: '0 */2 * * *', // Every 2 hours
      usageResetInterval: '0 0 1 * *', // First day of each month
      gracePeriodCheckInterval: '0 */4 * * *', // Every 4 hours
      pauseResumeCheckInterval: '0 */3 * * *', // Every 3 hours
      ...config
    };
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    if (this.isRunning) {
      logger.info('subscription-scheduler', 'Scheduler already running');
      return;
    }

    this.isRunning = true;
    logger.info('subscription-scheduler', 'Starting subscription scheduler');


    this.scheduleTask('renewal-check', this.config.renewalCheckInterval!, () => {
      this.processRenewalChecks();
    });


    this.scheduleTask('notification-check', this.config.notificationCheckInterval!, () => {
      this.processScheduledNotifications();
    });


    this.scheduleTask('dunning-check', this.config.dunningCheckInterval!, () => {
      this.processDunningAttempts();
    });


    this.scheduleTask('usage-reset', this.config.usageResetInterval!, () => {
      this.processUsageResets();
    });


    this.scheduleTask('grace-period-check', this.config.gracePeriodCheckInterval!, () => {
      this.processGracePeriodExpirations();
    });


    this.scheduleTask('pause-resume-check', this.config.pauseResumeCheckInterval!, () => {
      this.processPauseResumes();
    });

    this.emit('started');
    logger.info('subscription-scheduler', 'Subscription scheduler started successfully');
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    if (!this.isRunning) {
      logger.info('subscription-scheduler', 'Scheduler not running');
      return;
    }

    this.isRunning = false;
    logger.info('subscription-scheduler', 'Stopping subscription scheduler');


    this.scheduledTasks.forEach((task, taskName) => {
      task.stop();
      logger.info('subscription-scheduler', `Stopped task: ${taskName}`);
    });

    this.scheduledTasks.clear();
    this.emit('stopped');
    logger.info('subscription-scheduler', 'Subscription scheduler stopped');
  }

  /**
   * Schedule a cron task
   */
  private scheduleTask(name: string, cronExpression: string, callback: () => void): void {
    try {
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      const task = cron.schedule(cronExpression, () => {
        (async () => {
          try {
            logger.info('subscription-scheduler', `Running task: ${name}`);
            await callback();
            logger.info('subscription-scheduler', `Completed task: ${name}`);
          } catch (error) {
            logger.error('subscription-scheduler', `Error in task ${name}:`, error);
            this.emit('task-error', { taskName: name, error });
          }
        })();
      });

      task.start();
      this.scheduledTasks.set(name, task);
      logger.info('subscription-scheduler', `Scheduled task: ${name} with expression: ${cronExpression}`);

    } catch (error) {
      logger.error('subscription-scheduler', `Error scheduling task ${name}:`, error);
      throw error;
    }
  }

  /**
   * Process renewal checks for subscriptions
   */
  private async processRenewalChecks(): Promise<void> {
    try {

      const generalSettings = await storage.getAppSetting('general_settings');
      if (generalSettings?.value) {
        const settings = generalSettings.value as any;
        if (settings.planRenewalEnabled === false) {
          logger.info('subscription-scheduler', 'Plan renewal is globally disabled, skipping renewal checks');
          return;
        }
      }

      const now = new Date();
      const renewalWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Next 24 hours


      const companiesNeedingRenewal = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.autoRenewal, true),
            eq(companies.subscriptionStatus, 'active'),
            lte(companies.subscriptionEndDate, renewalWindow),
            isNull(companies.stripeSubscriptionId) // Manual renewals only
          )
        );

      logger.info('subscription-scheduler', `Found ${companiesNeedingRenewal.length} subscriptions needing renewal`);

      for (const company of companiesNeedingRenewal) {
        try {
          const result = await subscriptionManager.processAutomaticRenewal(company.id);
          if (result.success) {
            logger.info('subscription-scheduler', `Successfully renewed subscription for company ${company.id}`);
          } else {
            logger.error('subscription-scheduler', `Failed to renew subscription for company ${company.id}: ${result.error}`);
          }
        } catch (error) {
          logger.error('subscription-scheduler', `Error renewing subscription for company ${company.id}:`, error);
        }
      }

      this.emit('renewals-processed', { count: companiesNeedingRenewal.length });

    } catch (error) {
      logger.error('subscription-scheduler', 'Error processing renewal checks:', error);
      throw error;
    }
  }

  /**
   * Process scheduled notifications
   */
  private async processScheduledNotifications(): Promise<void> {
    try {
      const now = new Date();


      const dueNotifications = await db
        .select()
        .from(subscriptionNotifications)
        .where(
          and(
            eq(subscriptionNotifications.status, 'pending'),
            lte(subscriptionNotifications.scheduledFor, now)
          )
        )
        .limit(50); // Process in batches

      logger.info('subscription-scheduler', `Found ${dueNotifications.length} notifications to process`);

      for (const notification of dueNotifications) {
        try {
          await this.processNotification(notification);
        } catch (error) {
          logger.error('subscription-scheduler', `Error processing notification ${notification.id}:`, error);
          

          const newRetryCount = (notification.retryCount || 0) + 1;
          const maxRetries = notification.maxRetries || 3;

          if (newRetryCount >= maxRetries) {

            await db
              .update(subscriptionNotifications)
              .set({ 
                status: 'failed',
                retryCount: newRetryCount
              })
              .where(eq(subscriptionNotifications.id, notification.id));
          } else {

            const nextRetry = new Date(now.getTime() + Math.pow(2, newRetryCount) * 60 * 1000); // Exponential backoff
            await db
              .update(subscriptionNotifications)
              .set({ 
                retryCount: newRetryCount,
                scheduledFor: nextRetry
              })
              .where(eq(subscriptionNotifications.id, notification.id));
          }
        }
      }

      this.emit('notifications-processed', { count: dueNotifications.length });

    } catch (error) {
      logger.error('subscription-scheduler', 'Error processing scheduled notifications:', error);
      throw error;
    }
  }

  /**
   * Process individual notification
   */
  private async processNotification(notification: any): Promise<void> {
    try {
      const company = await storage.getCompany(notification.companyId);
      if (!company) {
        throw new Error('Company not found');
      }



      logger.info('subscription-scheduler', `Processing ${notification.notificationType} notification for company ${company.name}`);


      await db
        .update(subscriptionNotifications)
        .set({ 
          status: 'sent',
          sentAt: new Date()
        })
        .where(eq(subscriptionNotifications.id, notification.id));

      this.emit('notification-sent', { 
        notificationId: notification.id,
        companyId: notification.companyId,
        type: notification.notificationType
      });

    } catch (error) {
      logger.error('subscription-scheduler', `Error processing notification:`, error);
      throw error;
    }
  }

  /**
   * Process dunning attempts for failed payments
   */
  private async processDunningAttempts(): Promise<void> {
    try {
      await dunningService.processPendingAttempts();
      this.emit('dunning-processed');

    } catch (error) {
      logger.error('subscription-scheduler', 'Error processing dunning attempts:', error);
      throw error;
    }
  }



  /**
   * Process usage resets for monthly limits
   */
  private async processUsageResets(): Promise<void> {
    try {
      await usageTrackingService.resetMonthlyUsage();
      this.emit('usage-reset');

    } catch (error) {
      logger.error('subscription-scheduler', 'Error processing usage resets:', error);
      throw error;
    }
  }

  /**
   * Process grace period expirations
   */
  private async processGracePeriodExpirations(): Promise<void> {
    try {
      await gracePeriodService.processExpiredGracePeriods();
      this.emit('grace-periods-processed');

    } catch (error) {
      logger.error('subscription-scheduler', 'Error processing grace period expirations:', error);
      throw error;
    }
  }

  /**
   * Process automatic pause resumes
   */
  private async processPauseResumes(): Promise<void> {
    try {
      await subscriptionPausingService.processAutomaticResumes();
      this.emit('pause-resumes-processed');

    } catch (error) {
      logger.error('subscription-scheduler', 'Error processing pause resumes:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; activeTasks: string[] } {
    return {
      isRunning: this.isRunning,
      activeTasks: Array.from(this.scheduledTasks.keys())
    };
  }
}

export const subscriptionScheduler = new SubscriptionScheduler();
