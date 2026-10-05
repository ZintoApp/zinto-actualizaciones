import { storage } from '../storage';
import { db } from '../db';
import { 
  companies, 
  plans,
  subscriptionUsageTracking,
  subscriptionNotifications,
  subscriptionEvents,
  InsertSubscriptionUsageTracking,
  InsertSubscriptionNotification
} from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { logger } from '../utils/logger';

export interface UsageMetric {
  name: string;
  currentUsage: number;
  limit: number;
  softLimit: number;
  percentage: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  lastWarning?: Date;
}

export interface UsageStatus {
  companyId: number;
  metrics: UsageMetric[];
  overallStatus: 'normal' | 'warning' | 'critical' | 'blocked';
  blockedFeatures: string[];
}

export interface UsageUpdateResult {
  success: boolean;
  newUsage: number;
  limitReached: boolean;
  warningTriggered: boolean;
  blocked: boolean;
  error?: string;
}

/**
 * Usage Tracking Service
 * Monitors resource usage with soft warnings and progressive enforcement
 */
export class UsageTrackingService {
  
  /**
   * Initialize usage tracking for a company
   */
  async initializeUsageTracking(companyId: number): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }


      let plan = null;
      if (company.planId) {
        plan = await storage.getPlan(company.planId);
      }


      const metrics = [
        { name: 'users', limit: plan?.maxUsers || 1 },
        { name: 'contacts', limit: plan?.maxContacts || 100 },
        { name: 'channels', limit: plan?.maxChannels || 1 },
        { name: 'flows', limit: plan?.maxFlows || 1 },
        { name: 'campaigns', limit: plan?.maxCampaigns || 1 },
        { name: 'messages', limit: 10000 }, // Default message limit
        { name: 'storage_mb', limit: 1000 } // Default storage limit in MB
      ];

      for (const metric of metrics) {
        const usageData: InsertSubscriptionUsageTracking = {
          companyId,
          metricName: metric.name,
          currentUsage: 0,
          limitValue: metric.limit,
          softLimitReached: false,
          hardLimitReached: false,
          resetPeriod: metric.name === 'messages' ? 'monthly' : 'never'
        };

        await db
          .insert(subscriptionUsageTracking)
          .values(usageData)
          .onConflictDoUpdate({
            target: [subscriptionUsageTracking.companyId, subscriptionUsageTracking.metricName],
            set: {
              limitValue: metric.limit,
              updatedAt: new Date()
            }
          });
      }

      logger.info('usage-tracking', `Initialized usage tracking for company ${companyId}`);

    } catch (error) {
      logger.error('usage-tracking', 'Error initializing usage tracking:', error);
      throw error;
    }
  }

  /**
   * Update usage for a specific metric
   */
  async updateUsage(
    companyId: number, 
    metricName: string, 
    increment: number = 1
  ): Promise<UsageUpdateResult> {
    try {
      const [existing] = await db
        .select({ id: subscriptionUsageTracking.id })
        .from(subscriptionUsageTracking)
        .where(
          and(
            eq(subscriptionUsageTracking.companyId, companyId),
            eq(subscriptionUsageTracking.metricName, metricName)
          )
        )
        .limit(1);

      if (!existing) {
        await this.initializeUsageTracking(companyId);
      }

      return await db.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT id FROM subscription_usage_tracking
          WHERE company_id = ${companyId} AND metric_name = ${metricName}
          FOR UPDATE
        `);

        const [usageRecord] = await tx
          .select()
          .from(subscriptionUsageTracking)
          .where(
            and(
              eq(subscriptionUsageTracking.companyId, companyId),
              eq(subscriptionUsageTracking.metricName, metricName)
            )
          );

        if (!usageRecord) {
          throw new Error('Usage row missing after initialization');
        }

        const newUsage = usageRecord.currentUsage + increment;
        const limit = usageRecord.limitValue;

        const company = await storage.getCompany(companyId);
        const plan = company?.planId ? await storage.getPlan(company.planId) : null;
        const softLimitPercentage = (plan as any)?.softLimitPercentage || 80;
        const softLimit = Math.floor((limit * softLimitPercentage) / 100);

        const softLimitReached = newUsage >= softLimit;
        const hardLimitReached = newUsage >= limit;

        let warningTriggered = false;
        let blocked = false;

        if (softLimitReached && !usageRecord.softLimitReached) {
          warningTriggered = true;
          await this.appendSoftLimitSideEffectsInTx(tx, companyId, metricName, newUsage, limit, softLimit);
        }

        if (hardLimitReached && !usageRecord.hardLimitReached) {
          blocked = true;
          await this.appendHardLimitSideEffectsInTx(tx, companyId, metricName, newUsage, limit);
        }

        await tx
          .update(subscriptionUsageTracking)
          .set({
            currentUsage: newUsage,
            softLimitReached,
            hardLimitReached,
            lastWarningSent: warningTriggered ? new Date() : usageRecord.lastWarningSent,
            updatedAt: new Date()
          })
          .where(eq(subscriptionUsageTracking.id, usageRecord.id));

        return {
          success: true,
          newUsage,
          limitReached: hardLimitReached,
          warningTriggered,
          blocked
        };
      });
    } catch (error) {
      logger.error('usage-tracking', 'Error updating usage:', error);
      return {
        success: false,
        newUsage: 0,
        limitReached: false,
        warningTriggered: false,
        blocked: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if usage is allowed for a metric
   */
  async isUsageAllowed(companyId: number, metricName: string, requestedAmount: number = 1): Promise<boolean> {
    try {
      const [usageRecord] = await db
        .select()
        .from(subscriptionUsageTracking)
        .where(
          and(
            eq(subscriptionUsageTracking.companyId, companyId),
            eq(subscriptionUsageTracking.metricName, metricName)
          )
        );

      if (!usageRecord) {

        await this.initializeUsageTracking(companyId);
        return true;
      }


      const wouldExceedLimit = (usageRecord.currentUsage + requestedAmount) > usageRecord.limitValue;
      
      return !wouldExceedLimit;

    } catch (error) {
      logger.error('usage-tracking', 'Error checking usage allowance:', error);
      return false; // Deny on error for safety
    }
  }

  /**
   * Get comprehensive usage status for a company
   */
  async getUsageStatus(companyId: number): Promise<UsageStatus> {
    try {
      const usageRecords = await db
        .select()
        .from(subscriptionUsageTracking)
        .where(eq(subscriptionUsageTracking.companyId, companyId));

      if (usageRecords.length === 0) {
        await this.initializeUsageTracking(companyId);
        return this.getUsageStatus(companyId);
      }


      const company = await storage.getCompany(companyId);
      const plan = company?.planId ? await storage.getPlan(company.planId) : null;
      const softLimitPercentage = (plan as any)?.softLimitPercentage || 80;

      const metrics: UsageMetric[] = usageRecords.map(record => {
        const softLimit = Math.floor((record.limitValue * softLimitPercentage) / 100);
        const percentage = Math.round((record.currentUsage / record.limitValue) * 100);

        return {
          name: record.metricName,
          currentUsage: record.currentUsage,
          limit: record.limitValue,
          softLimit,
          percentage,
          softLimitReached: record.softLimitReached || false,
          hardLimitReached: record.hardLimitReached || false,
          lastWarning: record.lastWarningSent || undefined
        };
      });


      let overallStatus: 'normal' | 'warning' | 'critical' | 'blocked' = 'normal';
      const blockedFeatures: string[] = [];

      const hasHardLimitReached = metrics.some(m => m.hardLimitReached);
      const hasSoftLimitReached = metrics.some(m => m.softLimitReached);
      const hasCriticalUsage = metrics.some(m => m.percentage >= 95);

      if (hasHardLimitReached) {
        overallStatus = 'blocked';

        metrics.forEach(metric => {
          if (metric.hardLimitReached) {
            blockedFeatures.push(...this.getBlockedFeatures(metric.name));
          }
        });
      } else if (hasCriticalUsage) {
        overallStatus = 'critical';
      } else if (hasSoftLimitReached) {
        overallStatus = 'warning';
      }

      return {
        companyId,
        metrics,
        overallStatus,
        blockedFeatures
      };

    } catch (error) {
      logger.error('usage-tracking', 'Error getting usage status:', error);
      return {
        companyId,
        metrics: [],
        overallStatus: 'normal',
        blockedFeatures: []
      };
    }
  }

  /**
   * Reset usage for metrics with monthly reset period
   */
  async resetMonthlyUsage(): Promise<void> {
    try {
      const resetCount = await db
        .update(subscriptionUsageTracking)
        .set({
          currentUsage: 0,
          softLimitReached: false,
          hardLimitReached: false,
          lastReset: new Date(),
          updatedAt: new Date()
        })
        .where(eq(subscriptionUsageTracking.resetPeriod, 'monthly'));

      logger.info('usage-tracking', `Reset monthly usage for ${resetCount} records`);

      await this.resetMonthlyBandwidthUsage();

    } catch (error) {
      logger.error('usage-tracking', 'Error resetting monthly usage:', error);
      throw error;
    }
  }

  /**
   * Reset monthly company bandwidth counters used by the Data & Usage API.
   */
  async resetMonthlyBandwidthUsage(companyId?: number): Promise<void> {
    try {
      const now = new Date();
      const query = db
        .update(companies)
        .set({
          currentBandwidthUsed: 0,
          lastUsageUpdate: now,
          updatedAt: now
        });

      if (companyId) {
        await query.where(eq(companies.id, companyId));
        logger.info('usage-tracking', `Reset monthly bandwidth usage for company ${companyId}`);
        return;
      }

      await query.where(eq(companies.active, true));
      logger.info('usage-tracking', 'Reset monthly bandwidth usage for active companies');
    } catch (error) {
      logger.error('usage-tracking', 'Error resetting monthly company bandwidth usage:', error);
      throw error;
    }
  }

  /**
   * Soft-limit notification + audit log on the same connection as the usage FOR UPDATE.
   */
  private async appendSoftLimitSideEffectsInTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    companyId: number,
    metricName: string,
    currentUsage: number,
    limit: number,
    softLimit: number
  ): Promise<void> {
    const notificationData: InsertSubscriptionNotification = {
      companyId,
      notificationType: 'usage_warning',
      scheduledFor: new Date(),
      notificationData: {
        metricName,
        currentUsage,
        limit,
        softLimit,
        percentage: Math.round((currentUsage / limit) * 100)
      },
      status: 'pending'
    };

    await tx.insert(subscriptionNotifications).values(notificationData);

    await tx.insert(subscriptionEvents).values({
      companyId,
      eventType: 'usage_soft_limit_reached',
      eventData: {
        metricName,
        currentUsage,
        limit,
        softLimit
      },
      triggeredBy: 'system'
    });

    logger.info('usage-tracking', `Soft limit warning triggered for company ${companyId}, metric: ${metricName}`);
  }

  /**
   * Hard-limit notification + audit log on the same connection as the usage FOR UPDATE.
   */
  private async appendHardLimitSideEffectsInTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    companyId: number,
    metricName: string,
    currentUsage: number,
    limit: number
  ): Promise<void> {
    const notificationData: InsertSubscriptionNotification = {
      companyId,
      notificationType: 'usage_limit_exceeded',
      scheduledFor: new Date(),
      notificationData: {
        metricName,
        currentUsage,
        limit,
        blockedFeatures: this.getBlockedFeatures(metricName)
      },
      status: 'pending'
    };

    await tx.insert(subscriptionNotifications).values(notificationData);

    await tx.insert(subscriptionEvents).values({
      companyId,
      eventType: 'usage_hard_limit_reached',
      eventData: {
        metricName,
        currentUsage,
        limit,
        blockedFeatures: this.getBlockedFeatures(metricName)
      },
      triggeredBy: 'system'
    });

    logger.info('usage-tracking', `Hard limit block triggered for company ${companyId}, metric: ${metricName}`);
  }

  /**
   * Get features that should be blocked when a metric reaches its limit
   */
  private getBlockedFeatures(metricName: string): string[] {
    const featureMap: Record<string, string[]> = {
      users: ['create_user', 'invite_user'],
      contacts: ['create_contact', 'import_contacts'],
      channels: ['create_channel', 'connect_channel'],
      flows: ['create_flow', 'duplicate_flow'],
      campaigns: ['create_campaign', 'schedule_campaign'],
      messages: ['send_message', 'bulk_messaging'],
      storage_mb: ['upload_media', 'import_data']
    };

    return featureMap[metricName] || [];
  }

  /**
   * Manually adjust usage (admin function)
   */
  async adjustUsage(
    companyId: number,
    metricName: string,
    newUsage: number,
    reason: string = 'admin_adjustment'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [usageRecord] = await db
        .select()
        .from(subscriptionUsageTracking)
        .where(
          and(
            eq(subscriptionUsageTracking.companyId, companyId),
            eq(subscriptionUsageTracking.metricName, metricName)
          )
        );

      if (!usageRecord) {
        return { success: false, error: 'Usage record not found' };
      }

      const limit = usageRecord.limitValue;
      const company = await storage.getCompany(companyId);
      const plan = company?.planId ? await storage.getPlan(company.planId) : null;
      const softLimitPercentage = (plan as any)?.softLimitPercentage || 80;
      const softLimit = Math.floor((limit * softLimitPercentage) / 100);

      const softLimitReached = newUsage >= softLimit;
      const hardLimitReached = newUsage >= limit;

      await db
        .update(subscriptionUsageTracking)
        .set({
          currentUsage: newUsage,
          softLimitReached,
          hardLimitReached,
          updatedAt: new Date()
        })
        .where(eq(subscriptionUsageTracking.id, usageRecord.id));


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'usage_manually_adjusted',
        {
          metricName,
          oldUsage: usageRecord.currentUsage,
          newUsage,
          reason
        },
        undefined,
        undefined,
        'admin'
      );

      return { success: true };

    } catch (error) {
      logger.error('usage-tracking', 'Error adjusting usage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const usageTrackingService = new UsageTrackingService();
