import { storage } from '../storage';
import { db } from '../db';
import { 
  companies, 
  plans,
  subscriptionEvents,
  subscriptionNotifications,
  InsertSubscriptionEvent,
  InsertSubscriptionNotification
} from '@shared/schema';
import { eq, and, lt, lte, gte, or } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { logger } from '../utils/logger';

export interface GracePeriodConfig {
  defaultGracePeriodDays: number;
  limitedAccessFeatures: string[];
  warningNotificationDays: number[];
}

export interface GracePeriodStatus {
  isInGracePeriod: boolean;
  gracePeriodEnd?: Date;
  daysRemaining?: number;
  limitedAccess: boolean;
  allowedFeatures: string[];
  restrictedFeatures: string[];
}

/**
 * Grace Period Service
 * Manages subscription grace periods with limited access and recovery opportunities
 */
export class GracePeriodService {
  private config: GracePeriodConfig;

  constructor(config: Partial<GracePeriodConfig> = {}) {
    this.config = {
      defaultGracePeriodDays: 15, // FIXED: Set to 15 days as required
      limitedAccessFeatures: [


        'view_conversations',
        'basic_messaging',
        'advanced_messaging',
        'contact_management',
        'export_data',
        'campaigns',
        'flows',
        'analytics',
        'channels',
        'templates',
        'segments',
        'ai_features',
        'integrations',
        'webhooks',
        'api_access',
        'bulk_operations',
        'advanced_analytics',
        'custom_fields',
        'automation',
        'scheduling',
        'media_handling',
        'group_messaging',
        'broadcast_lists'
      ],
      warningNotificationDays: [7, 3, 1], // Warning at 7, 3, and 1 days before grace period ends
      ...config
    };
  }

  /**
   * Start grace period for a company
   */
  async startGracePeriod(companyId: number, reason: string = 'subscription_expired'): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const plan = await storage.getPlan(company.planId!);
      const gracePeriodDays = (plan as any)?.gracePeriodDays || this.config.defaultGracePeriodDays;
      
      if (gracePeriodDays <= 0) {

        await this.cancelSubscription(companyId, 'no_grace_period');
        return;
      }

      const gracePeriodEnd = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'grace_period',
        gracePeriodEnd: gracePeriodEnd
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'grace_period_started',
        {
          reason,
          gracePeriodEnd,
          gracePeriodDays
        },
        company.subscriptionStatus || 'inactive',
        'grace_period',
        'system'
      );


      await this.scheduleGracePeriodNotifications(companyId, gracePeriodEnd);

      logger.info('grace-period-service', `Started grace period for company ${companyId}, ends: ${gracePeriodEnd}`);

    } catch (error) {
      logger.error('grace-period-service', 'Error starting grace period:', error);
      throw error;
    }
  }

  /**
   * End grace period and cancel subscription
   */
  async endGracePeriod(companyId: number): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      if (company.subscriptionStatus !== 'grace_period') {
        logger.warn('grace-period-service', `Company ${companyId} is not in grace period, current status: ${company.subscriptionStatus}`);
        return;
      }

      await this.cancelSubscription(companyId, 'grace_period_expired');

      logger.info('grace-period-service', `Ended grace period for company ${companyId}, subscription cancelled`);

    } catch (error) {
      logger.error('grace-period-service', 'Error ending grace period:', error);
      throw error;
    }
  }

  /**
   * Recover from grace period (successful payment)
   */
  async recoverFromGracePeriod(companyId: number, transactionId?: number): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      if (company.subscriptionStatus !== 'grace_period') {
        logger.warn('grace-period-service', `Company ${companyId} is not in grace period, current status: ${company.subscriptionStatus}`);
        return;
      }

      const plan = await storage.getPlan(company.planId!);
      if (!plan) {
        throw new Error('Company plan not found');
      }


      const billingCycleDays = this.getBillingCycleDays((plan as any).billingInterval);
      const newSubscriptionEnd = new Date(Date.now() + billingCycleDays * 24 * 60 * 60 * 1000);


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'active',
        subscriptionEndDate: newSubscriptionEnd,
        gracePeriodEnd: null,
        dunningAttempts: 0,
        lastDunningAttempt: null
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'grace_period_recovered',
        {
          transactionId,
          newSubscriptionEnd,
          recoveredAt: new Date()
        },
        'grace_period',
        'active',
        'payment_success'
      );


      await this.cancelGracePeriodNotifications(companyId);

      logger.info('grace-period-service', `Company ${companyId} recovered from grace period, subscription active until ${newSubscriptionEnd}`);

    } catch (error) {
      logger.error('grace-period-service', 'Error recovering from grace period:', error);
      throw error;
    }
  }

  /**
   * Get grace period status for a company
   */
  async getGracePeriodStatus(companyId: number): Promise<GracePeriodStatus> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const isInGracePeriod = company.subscriptionStatus === 'grace_period';
      
      if (!isInGracePeriod) {
        return {
          isInGracePeriod: false,
          limitedAccess: false,
          allowedFeatures: [],
          restrictedFeatures: []
        };
      }

      const now = new Date();
      const gracePeriodEnd = company.gracePeriodEnd;
      const daysRemaining = gracePeriodEnd ? 
        Math.max(0, Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;




      const plan = await storage.getPlan(company.planId!);
      const allFeatures = plan?.features as string[] || [];


      const allowedFeatures = allFeatures; // Full access
      const restrictedFeatures: string[] = []; // No restrictions

      return {
        isInGracePeriod: true,
        gracePeriodEnd: gracePeriodEnd || undefined,
        daysRemaining,
        limitedAccess: false, // FIXED: No limitations during grace period
        allowedFeatures,
        restrictedFeatures
      };

    } catch (error) {
      logger.error('grace-period-service', 'Error getting grace period status:', error);
      return {
        isInGracePeriod: false,
        limitedAccess: false,
        allowedFeatures: [],
        restrictedFeatures: []
      };
    }
  }

  /**
   * Check if a feature is allowed during grace period
   */
  async isFeatureAllowed(companyId: number, feature: string): Promise<boolean> {
    try {
      const status = await this.getGracePeriodStatus(companyId);
      
      if (!status.isInGracePeriod) {
        return true; // Not in grace period, all features allowed
      }

      return status.allowedFeatures.includes(feature);

    } catch (error) {
      logger.error('grace-period-service', 'Error checking feature access:', error);
      return false; // Deny access on error
    }
  }

  /**
   * Process expired grace periods
   */
  async processExpiredGracePeriods(): Promise<void> {
    try {
      const now = new Date();


      const expiredGracePeriods = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.subscriptionStatus, 'grace_period'),
            lte(companies.gracePeriodEnd, now)
          )
        );

      logger.info('grace-period-service', `Found ${expiredGracePeriods.length} expired grace periods`);

      for (const company of expiredGracePeriods) {
        try {
          await this.endGracePeriod(company.id);
        } catch (error) {
          logger.error('grace-period-service', `Error processing expired grace period for company ${company.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('grace-period-service', 'Error processing expired grace periods:', error);
      throw error;
    }
  }

  /**
   * Schedule grace period warning notifications
   */
  private async scheduleGracePeriodNotifications(companyId: number, gracePeriodEnd: Date): Promise<void> {
    try {
      for (const daysBeforeEnd of this.config.warningNotificationDays) {
        const notificationDate = new Date(gracePeriodEnd.getTime() - daysBeforeEnd * 24 * 60 * 60 * 1000);
        

        if (notificationDate > new Date()) {
          const notificationData: InsertSubscriptionNotification = {
            companyId,
            notificationType: 'grace_period_warning',
            scheduledFor: notificationDate,
            notificationData: {
              daysRemaining: daysBeforeEnd,
              gracePeriodEnd: gracePeriodEnd.toISOString()
            },
            status: 'pending'
          };

          await db.insert(subscriptionNotifications).values(notificationData);
        }
      }


      const expirationNotification: InsertSubscriptionNotification = {
        companyId,
        notificationType: 'grace_period_expired',
        scheduledFor: gracePeriodEnd,
        notificationData: {
          gracePeriodEnd: gracePeriodEnd.toISOString()
        },
        status: 'pending'
      };

      await db.insert(subscriptionNotifications).values(expirationNotification);

    } catch (error) {
      logger.error('grace-period-service', 'Error scheduling grace period notifications:', error);
      throw error;
    }
  }

  /**
   * Cancel pending grace period notifications
   */
  private async cancelGracePeriodNotifications(companyId: number): Promise<void> {
    try {
      await db
        .update(subscriptionNotifications)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(subscriptionNotifications.companyId, companyId),
            eq(subscriptionNotifications.status, 'pending'),
            or(
              eq(subscriptionNotifications.notificationType, 'grace_period_warning'),
              eq(subscriptionNotifications.notificationType, 'grace_period_expired')
            )
          )
        );

    } catch (error) {
      logger.error('grace-period-service', 'Error cancelling grace period notifications:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  private async cancelSubscription(companyId: number, reason: string): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      await storage.updateCompany(companyId, {
        subscriptionStatus: 'cancelled',
        gracePeriodEnd: null
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_cancelled',
        {
          reason,
          cancelledAt: new Date()
        },
        company.subscriptionStatus || 'inactive',
        'cancelled',
        'system'
      );

    } catch (error) {
      logger.error('grace-period-service', 'Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Get billing cycle days
   */
  private getBillingCycleDays(billingInterval: string): number {
    switch (billingInterval) {
      case 'month':
        return 30;
      case 'quarter':
        return 90;
      case 'year':
        return 365;
      default:
        return 30;
    }
  }
}

export const gracePeriodService = new GracePeriodService();
