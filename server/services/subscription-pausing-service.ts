import { storage } from '../storage';
import { db } from '../db';
import {
  companies, subscriptionNotifications, InsertSubscriptionNotification
} from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { logger } from '../utils/logger';

export interface PauseOptions {
  pauseUntil?: Date;
  reason?: string;
  preserveData?: boolean;
  notifyOnResume?: boolean;
}

export interface PauseStatus {
  isPaused: boolean;
  pauseStartDate?: Date;
  pauseEndDate?: Date;
  daysRemaining?: number;
  reason?: string;
  canResume: boolean;
  autoResumeScheduled: boolean;
}

export interface PauseResult {
  success: boolean;
  pauseEndDate?: Date;
  error?: string;
}

/**
 * Subscription Pausing Service
 * Handles temporary subscription suspension with data preservation
 */
export class SubscriptionPausingService {

  /**
   * Pause a subscription
   */
  async pauseSubscription(
    companyId: number, 
    options: PauseOptions = {}
  ): Promise<PauseResult> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }


      const canPause = await this.canPauseSubscription(companyId);
      if (!canPause.allowed) {
        throw new Error(canPause.reason);
      }

      const plan = await storage.getPlan(company.planId!);
      const maxPauseDays = (plan as any)?.pauseMaxDays || 90;


      const pauseEndDate = options.pauseUntil || 
        new Date(Date.now() + maxPauseDays * 24 * 60 * 60 * 1000);


      const pauseDurationDays = Math.ceil((pauseEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (pauseDurationDays > maxPauseDays) {
        throw new Error(`Pause duration cannot exceed ${maxPauseDays} days`);
      }


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'paused',
        pauseStartDate: new Date(),
        pauseEndDate: pauseEndDate
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_paused',
        {
          pauseStartDate: new Date(),
          pauseEndDate,
          pauseDurationDays,
          reason: options.reason || 'customer_request',
          preserveData: options.preserveData !== false
        },
        company.subscriptionStatus || 'inactive',
        'paused',
        'customer'
      );


      if (options.notifyOnResume !== false) {
        await this.scheduleResumeNotification(companyId, pauseEndDate);
      }


      await this.scheduleAutomaticResume(companyId, pauseEndDate);

      logger.info('subscription-pausing', `Paused subscription for company ${companyId} until ${pauseEndDate}`);

      return {
        success: true,
        pauseEndDate
      };

    } catch (error) {
      logger.error('subscription-pausing', 'Error pausing subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(companyId: number, reason: string = 'customer_request'): Promise<PauseResult> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      if (company.subscriptionStatus !== 'paused') {
        throw new Error('Subscription is not paused');
      }


      const pauseStartDate = company.pauseStartDate;
      const pauseEndDate = company.pauseEndDate;
      const now = new Date();

      let newSubscriptionEndDate = company.subscriptionEndDate;


      if (pauseStartDate && company.subscriptionEndDate && company.subscriptionEndDate > pauseStartDate) {
        const pauseDuration = now.getTime() - pauseStartDate.getTime();
        newSubscriptionEndDate = new Date(company.subscriptionEndDate.getTime() + pauseDuration);
      }


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'active',
        pauseStartDate: null,
        pauseEndDate: null,
        subscriptionEndDate: newSubscriptionEndDate
      });


      await this.cancelScheduledResume(companyId);


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_resumed',
        {
          resumedAt: now,
          reason,
          newSubscriptionEndDate,
          pauseDuration: pauseStartDate ? now.getTime() - pauseStartDate.getTime() : 0
        },
        'paused',
        'active',
        reason === 'automatic' ? 'system' : 'customer'
      );

      logger.info('subscription-pausing', `Resumed subscription for company ${companyId}, new end date: ${newSubscriptionEndDate}`);

      return {
        success: true
      };

    } catch (error) {
      logger.error('subscription-pausing', 'Error resuming subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get pause status for a company
   */
  async getPauseStatus(companyId: number): Promise<PauseStatus> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const isPaused = company.subscriptionStatus === 'paused';
      
      if (!isPaused) {
        return {
          isPaused: false,
          canResume: false,
          autoResumeScheduled: false
        };
      }

      const now = new Date();
      const pauseEndDate = company.pauseEndDate;
      const daysRemaining = pauseEndDate ? 
        Math.max(0, Math.ceil((pauseEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;


      const autoResumeScheduled = await this.isAutoResumeScheduled(companyId);

      return {
        isPaused: true,
        pauseStartDate: company.pauseStartDate || undefined,
        pauseEndDate: company.pauseEndDate || undefined,
        daysRemaining,
        canResume: true,
        autoResumeScheduled
      };

    } catch (error) {
      logger.error('subscription-pausing', 'Error getting pause status:', error);
      return {
        isPaused: false,
        canResume: false,
        autoResumeScheduled: false
      };
    }
  }

  /**
   * Check if a subscription can be paused
   */
  async canPauseSubscription(companyId: number): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        return { allowed: false, reason: 'Company not found' };
      }


      if (company.subscriptionStatus === 'paused') {
        return { allowed: false, reason: 'Subscription is already paused' };
      }


      if (!['active', 'trial'].includes(company.subscriptionStatus || '')) {
        return { allowed: false, reason: 'Only active subscriptions can be paused' };
      }


      const plan = await storage.getPlan(company.planId!);
      if (!(plan as any)?.allowPausing) {
        return { allowed: false, reason: 'Current plan does not allow pausing' };
      }


      if (company.subscriptionStatus === 'grace_period') {
        return { allowed: false, reason: 'Cannot pause subscription during grace period' };
      }

      return { allowed: true };

    } catch (error) {
      logger.error('subscription-pausing', 'Error checking pause eligibility:', error);
      return { allowed: false, reason: 'Error checking eligibility' };
    }
  }

  /**
   * Process automatic resumes for expired pauses
   */
  async processAutomaticResumes(): Promise<void> {
    try {
      const now = new Date();


      const expiredPauses = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.subscriptionStatus, 'paused'),
            lte(companies.pauseEndDate, now)
          )
        );

      logger.info('subscription-pausing', `Found ${expiredPauses.length} paused subscriptions to resume`);

      for (const company of expiredPauses) {
        try {
          await this.resumeSubscription(company.id, 'automatic');
        } catch (error) {
          logger.error('subscription-pausing', `Error auto-resuming subscription for company ${company.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('subscription-pausing', 'Error processing automatic resumes:', error);
      throw error;
    }
  }

  /**
   * Schedule automatic resume
   */
  private async scheduleAutomaticResume(companyId: number, resumeDate: Date): Promise<void> {
    try {
      const notificationData: InsertSubscriptionNotification = {
        companyId,
        notificationType: 'subscription_auto_resume',
        scheduledFor: resumeDate,
        notificationData: {
          resumeDate: resumeDate.toISOString(),
          action: 'auto_resume'
        },
        status: 'pending'
      };

      await db.insert(subscriptionNotifications).values(notificationData);

    } catch (error) {
      logger.error('subscription-pausing', 'Error scheduling automatic resume:', error);
      throw error;
    }
  }

  /**
   * Schedule resume notification
   */
  private async scheduleResumeNotification(companyId: number, resumeDate: Date): Promise<void> {
    try {

      const notificationDate = new Date(resumeDate.getTime() - 24 * 60 * 60 * 1000);

      if (notificationDate > new Date()) {
        const notificationData: InsertSubscriptionNotification = {
          companyId,
          notificationType: 'subscription_resume_reminder',
          scheduledFor: notificationDate,
          notificationData: {
            resumeDate: resumeDate.toISOString(),
            daysUntilResume: 1
          },
          status: 'pending'
        };

        await db.insert(subscriptionNotifications).values(notificationData);
      }

    } catch (error) {
      logger.error('subscription-pausing', 'Error scheduling resume notification:', error);
      throw error;
    }
  }

  /**
   * Cancel scheduled resume notifications
   */
  private async cancelScheduledResume(companyId: number): Promise<void> {
    try {
      await db
        .update(subscriptionNotifications)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(subscriptionNotifications.companyId, companyId),
            eq(subscriptionNotifications.status, 'pending'),
            eq(subscriptionNotifications.notificationType, 'subscription_auto_resume')
          )
        );

    } catch (error) {
      logger.error('subscription-pausing', 'Error cancelling scheduled resume:', error);
      throw error;
    }
  }

  /**
   * Check if auto-resume is scheduled
   */
  private async isAutoResumeScheduled(companyId: number): Promise<boolean> {
    try {
      const [notification] = await db
        .select()
        .from(subscriptionNotifications)
        .where(
          and(
            eq(subscriptionNotifications.companyId, companyId),
            eq(subscriptionNotifications.status, 'pending'),
            eq(subscriptionNotifications.notificationType, 'subscription_auto_resume')
          )
        )
        .limit(1);

      return !!notification;

    } catch (error) {
      logger.error('subscription-pausing', 'Error checking auto-resume schedule:', error);
      return false;
    }
  }

  /**
   * Extend pause duration
   */
  async extendPause(
    companyId: number, 
    additionalDays: number, 
    reason: string = 'customer_request'
  ): Promise<PauseResult> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      if (company.subscriptionStatus !== 'paused') {
        throw new Error('Subscription is not paused');
      }

      const plan = await storage.getPlan(company.planId!);
      const maxPauseDays = (plan as any)?.pauseMaxDays || 90;
      
      const currentPauseEndDate = company.pauseEndDate || new Date();
      const newPauseEndDate = new Date(currentPauseEndDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);


      const totalPauseDays = Math.ceil((newPauseEndDate.getTime() - (company.pauseStartDate?.getTime() || Date.now())) / (1000 * 60 * 60 * 24));
      if (totalPauseDays > maxPauseDays) {
        throw new Error(`Total pause duration cannot exceed ${maxPauseDays} days`);
      }


      await storage.updateCompany(companyId, {
        pauseEndDate: newPauseEndDate
      });


      await this.cancelScheduledResume(companyId);
      await this.scheduleAutomaticResume(companyId, newPauseEndDate);


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_pause_extended',
        {
          additionalDays,
          newPauseEndDate,
          reason
        },
        'paused',
        'paused',
        'customer'
      );

      logger.info('subscription-pausing', `Extended pause for company ${companyId} by ${additionalDays} days`);

      return {
        success: true,
        pauseEndDate: newPauseEndDate
      };

    } catch (error) {
      logger.error('subscription-pausing', 'Error extending pause:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const subscriptionPausingService = new SubscriptionPausingService();
