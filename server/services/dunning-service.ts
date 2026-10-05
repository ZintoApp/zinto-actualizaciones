import { storage } from '../storage';
import { db } from '../db';
import { 
  companies, 
  plans,
  paymentTransactions,
  dunningManagement,
  subscriptionNotifications,
  InsertDunningManagement,
  InsertSubscriptionNotification
} from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { gracePeriodService } from './grace-period-service';
import { logger } from '../utils/logger';

export interface DunningConfig {
  maxAttempts: number;
  attemptIntervals: number[]; // Days between attempts
  emailTemplates: {
    firstAttempt: string;
    secondAttempt: string;
    finalAttempt: string;
    gracePeriodWarning: string;
  };
}

export interface DunningAttempt {
  id: number;
  companyId: number;
  attemptNumber: number;
  attemptDate: Date;
  attemptType: string;
  status: string;
  nextAttemptDate?: Date;
  responseData?: any;
}

export interface DunningStatus {
  companyId: number;
  totalAttempts: number;
  lastAttemptDate?: Date;
  nextAttemptDate?: Date;
  status: 'active' | 'completed' | 'failed' | 'grace_period';
  remainingAttempts: number;
}

/**
 * Dunning Management Service
 * Handles failed payment retry logic and automated recovery workflows
 */
export class DunningService {
  private config: DunningConfig;

  constructor(config: Partial<DunningConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      attemptIntervals: [1, 3, 7], // 1 day, 3 days, 7 days
      emailTemplates: {
        firstAttempt: 'payment_failed_first_attempt',
        secondAttempt: 'payment_failed_second_attempt', 
        finalAttempt: 'payment_failed_final_attempt',
        gracePeriodWarning: 'grace_period_warning'
      },
      ...config
    };
  }

  /**
   * Start dunning process for a failed payment
   */
  async startDunningProcess(
    companyId: number, 
    paymentTransactionId?: number,
    reason: string = 'payment_failed'
  ): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const plan = await storage.getPlan(company.planId!);
      const maxAttempts = (plan as any)?.maxDunningAttempts || this.config.maxAttempts;


      const existingDunning = await this.getDunningStatus(companyId);
      if (existingDunning.status === 'active') {
        logger.info('dunning-service', `Dunning already in progress for company ${companyId}`);
        return;
      }


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'past_due',
        dunningAttempts: 0,
        lastDunningAttempt: null
      });


      await this.scheduleDunningAttempt(companyId, 1, paymentTransactionId);


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'dunning_started',
        {
          reason,
          maxAttempts,
          paymentTransactionId
        },
        company.subscriptionStatus || 'inactive',
        'past_due',
        'system'
      );

      logger.info('dunning-service', `Started dunning process for company ${companyId}, max attempts: ${maxAttempts}`);

    } catch (error) {
      logger.error('dunning-service', 'Error starting dunning process:', error);
      throw error;
    }
  }

  /**
   * Process a dunning attempt
   */
  async processDunningAttempt(attemptId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const [attempt] = await db
        .select()
        .from(dunningManagement)
        .where(eq(dunningManagement.id, attemptId));

      if (!attempt) {
        throw new Error('Dunning attempt not found');
      }

      const company = await storage.getCompany(attempt.companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const plan = await storage.getPlan(company.planId!);
      const maxAttempts = (plan as any)?.maxDunningAttempts || this.config.maxAttempts;


      const paymentResult = await this.attemptPaymentRecovery(attempt.companyId);

      if (paymentResult.success) {

        await this.completeDunningProcess(attempt.companyId, attemptId, 'payment_recovered');
        return { success: true };
      } else {

        const newAttemptCount = attempt.attemptNumber;
        
        await storage.updateCompany(attempt.companyId, {
          dunningAttempts: newAttemptCount,
          lastDunningAttempt: new Date()
        });


        await db
          .update(dunningManagement)
          .set({
            status: 'failed',
            responseData: { error: paymentResult.error }
          })
          .where(eq(dunningManagement.id, attemptId));

        if (newAttemptCount >= maxAttempts) {

          await this.moveToGracePeriod(attempt.companyId, attemptId);
        } else {

          await this.scheduleDunningAttempt(attempt.companyId, newAttemptCount + 1);
        }

        return { success: false, error: paymentResult.error };
      }

    } catch (error) {
      logger.error('dunning-service', 'Error processing dunning attempt:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Schedule a dunning attempt
   */
  async scheduleDunningAttempt(
    companyId: number, 
    attemptNumber: number, 
    paymentTransactionId?: number
  ): Promise<void> {
    try {

      const intervalIndex = Math.min(attemptNumber - 1, this.config.attemptIntervals.length - 1);
      const daysToWait = this.config.attemptIntervals[intervalIndex];
      const nextAttemptDate = new Date(Date.now() + daysToWait * 24 * 60 * 60 * 1000);


      const dunningData: InsertDunningManagement = {
        companyId,
        paymentTransactionId,
        attemptNumber,
        attemptType: 'email',
        status: 'pending',
        nextAttemptDate
      };

      const [dunningAttempt] = await db.insert(dunningManagement).values(dunningData).returning();


      await this.scheduleAttemptNotification(companyId, attemptNumber, nextAttemptDate);

      logger.info('dunning-service', `Scheduled dunning attempt ${attemptNumber} for company ${companyId} on ${nextAttemptDate}`);

    } catch (error) {
      logger.error('dunning-service', 'Error scheduling dunning attempt:', error);
      throw error;
    }
  }

  /**
   * Get dunning status for a company
   */
  async getDunningStatus(companyId: number): Promise<DunningStatus> {
    try {
      const attempts = await db
        .select()
        .from(dunningManagement)
        .where(eq(dunningManagement.companyId, companyId))
        .orderBy(dunningManagement.attemptNumber);

      const company = await storage.getCompany(companyId);
      const plan = await storage.getPlan(company?.planId!);
      const maxAttempts = (plan as any)?.maxDunningAttempts || this.config.maxAttempts;

      const totalAttempts = attempts.length;
      const lastAttempt = attempts[attempts.length - 1];
      const pendingAttempt = attempts.find(a => a.status === 'pending');

      let status: 'active' | 'completed' | 'failed' | 'grace_period' = 'completed';
      
      if (company?.subscriptionStatus === 'past_due' && pendingAttempt) {
        status = 'active';
      } else if (company?.subscriptionStatus === 'grace_period') {
        status = 'grace_period';
      } else if (totalAttempts >= maxAttempts && company?.subscriptionStatus !== 'active') {
        status = 'failed';
      }

      return {
        companyId,
        totalAttempts,
        lastAttemptDate: lastAttempt?.attemptDate,
        nextAttemptDate: pendingAttempt?.nextAttemptDate || undefined,
        status,
        remainingAttempts: Math.max(0, maxAttempts - totalAttempts)
      };

    } catch (error) {
      logger.error('dunning-service', 'Error getting dunning status:', error);
      return {
        companyId,
        totalAttempts: 0,
        status: 'completed',
        remainingAttempts: 0
      };
    }
  }

  /**
   * Process all pending dunning attempts
   */
  async processPendingAttempts(): Promise<void> {
    try {
      const now = new Date();


      const dueAttempts = await db
        .select()
        .from(dunningManagement)
        .where(
          and(
            eq(dunningManagement.status, 'pending'),
            lte(dunningManagement.nextAttemptDate, now)
          )
        )
        .limit(50); // Process in batches

      logger.info('dunning-service', `Found ${dueAttempts.length} pending dunning attempts`);

      for (const attempt of dueAttempts) {
        try {
          await this.processDunningAttempt(attempt.id);
        } catch (error) {
          logger.error('dunning-service', `Error processing dunning attempt ${attempt.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('dunning-service', 'Error processing pending attempts:', error);
      throw error;
    }
  }

  /**
   * Complete dunning process successfully
   */
  private async completeDunningProcess(
    companyId: number, 
    attemptId: number, 
    reason: string
  ): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'active',
        dunningAttempts: 0,
        lastDunningAttempt: null
      });


      await db
        .update(dunningManagement)
        .set({
          status: 'sent',
          responseData: { success: true, reason }
        })
        .where(eq(dunningManagement.id, attemptId));


      await db
        .update(dunningManagement)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(dunningManagement.companyId, companyId),
            eq(dunningManagement.status, 'pending')
          )
        );


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'dunning_completed',
        { reason, attemptId },
        company.subscriptionStatus || 'inactive',
        'active',
        'system'
      );

      logger.info('dunning-service', `Completed dunning process for company ${companyId}: ${reason}`);

    } catch (error) {
      logger.error('dunning-service', 'Error completing dunning process:', error);
      throw error;
    }
  }

  /**
   * Move company to grace period after max dunning attempts
   */
  private async moveToGracePeriod(companyId: number, attemptId: number): Promise<void> {
    try {

      await gracePeriodService.startGracePeriod(companyId, 'dunning_failed');


      await db
        .update(dunningManagement)
        .set({
          status: 'failed',
          responseData: { reason: 'max_attempts_reached' }
        })
        .where(eq(dunningManagement.id, attemptId));

      logger.info('dunning-service', `Moved company ${companyId} to grace period after failed dunning`);

    } catch (error) {
      logger.error('dunning-service', 'Error moving to grace period:', error);
      throw error;
    }
  }

  /**
   * Attempt payment recovery
   */
  private async attemptPaymentRecovery(companyId: number): Promise<{ success: boolean; error?: string }> {
    try {

      const renewalResult = await subscriptionManager.processAutomaticRenewal(companyId);
      return renewalResult;

    } catch (error) {
      logger.error('dunning-service', 'Error attempting payment recovery:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Schedule attempt notification
   */
  private async scheduleAttemptNotification(
    companyId: number, 
    attemptNumber: number, 
    scheduledFor: Date
  ): Promise<void> {
    try {
      let notificationType = 'payment_retry_attempt';
      let templateKey = this.config.emailTemplates.firstAttempt;

      if (attemptNumber === 2) {
        templateKey = this.config.emailTemplates.secondAttempt;
      } else if (attemptNumber >= 3) {
        templateKey = this.config.emailTemplates.finalAttempt;
        notificationType = 'payment_final_attempt';
      }

      const notificationData: InsertSubscriptionNotification = {
        companyId,
        notificationType,
        scheduledFor,
        notificationData: {
          attemptNumber,
          templateKey,
          isLastAttempt: attemptNumber >= this.config.maxAttempts
        },
        status: 'pending'
      };

      await db.insert(subscriptionNotifications).values(notificationData);

    } catch (error) {
      logger.error('dunning-service', 'Error scheduling attempt notification:', error);
      throw error;
    }
  }

  /**
   * Cancel dunning process (manual intervention)
   */
  async cancelDunningProcess(companyId: number, reason: string = 'manual_cancellation'): Promise<void> {
    try {

      await db
        .update(dunningManagement)
        .set({ 
          status: 'cancelled',
          responseData: { reason }
        })
        .where(
          and(
            eq(dunningManagement.companyId, companyId),
            eq(dunningManagement.status, 'pending')
          )
        );


      await storage.updateCompany(companyId, {
        dunningAttempts: 0,
        lastDunningAttempt: null
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'dunning_cancelled',
        { reason },
        undefined,
        undefined,
        'admin'
      );

      logger.info('dunning-service', `Cancelled dunning process for company ${companyId}: ${reason}`);

    } catch (error) {
      logger.error('dunning-service', 'Error cancelling dunning process:', error);
      throw error;
    }
  }
}

export const dunningService = new DunningService();
