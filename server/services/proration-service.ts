import { storage } from '../storage';
import { db } from '../db';
import {
  companies,
  plans,
  paymentTransactions,
  subscriptionPlanChanges,
  subscriptionUsageTracking,
  InsertSubscriptionPlanChange,
  InsertPaymentTransaction
} from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { logger } from '../utils/logger';

export interface ProrationCalculation {
  currentPlanDaysRemaining: number;
  currentPlanRefund: number;
  newPlanProration: number;
  totalAmount: number;
  effectiveDate: Date;
  billingCycleReset: boolean;
}

export interface PlanChangeOptions {
  effectiveDate?: Date;
  prorationMode?: 'immediate' | 'next_cycle';
  reason?: string;
  triggeredBy?: string;
}

export interface PlanChangeResult {
  success: boolean;
  changeId?: number;
  prorationCalculation?: ProrationCalculation;
  transactionId?: number;
  error?: string;
}

/**
 * Proration Service
 * Handles plan changes with prorated billing calculations
 */
export class ProrationService {
  
  /**
   * Calculate proration for plan change
   */
  async calculateProration(
    companyId: number,
    newPlanId: number,
    effectiveDate: Date = new Date()
  ): Promise<ProrationCalculation> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const currentPlan = await storage.getPlan(company.planId!);
      if (!currentPlan) {
        throw new Error('Current plan not found');
      }

      const newPlan = await storage.getPlan(newPlanId);
      if (!newPlan) {
        throw new Error('New plan not found');
      }

      const now = new Date();
      const subscriptionEndDate = company.subscriptionEndDate || new Date();


      const totalDaysInCycle = this.getDaysInBillingCycle((currentPlan as any).billingInterval, (currentPlan as any).customDurationDays);
      const daysRemaining = Math.max(0, Math.ceil((subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      

      const currentPlanRefund = (Number(currentPlan.price) * daysRemaining) / totalDaysInCycle;


      const newPlanProration = (Number(newPlan.price) * daysRemaining) / totalDaysInCycle;


      const totalAmount = newPlanProration - currentPlanRefund;


      const billingCycleReset = (currentPlan as any).billingInterval !== (newPlan as any).billingInterval;

      return {
        currentPlanDaysRemaining: daysRemaining,
        currentPlanRefund,
        newPlanProration,
        totalAmount,
        effectiveDate,
        billingCycleReset
      };

    } catch (error) {
      logger.error('proration-service', 'Error calculating proration:', error);
      throw error;
    }
  }

  /**
   * Execute plan change with proration
   */
  async changePlan(
    companyId: number,
    newPlanId: number,
    options: PlanChangeOptions = {}
  ): Promise<PlanChangeResult> {
    try {
      const {
        effectiveDate = new Date(),
        prorationMode = 'immediate',
        reason = 'customer_request',
        triggeredBy = 'customer'
      } = options;

      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const currentPlan = await storage.getPlan(company.planId!);
      const newPlan = await storage.getPlan(newPlanId);

      if (!currentPlan || !newPlan) {
        throw new Error('Plan not found');
      }


      const changeType = this.determineChangeType(currentPlan, newPlan);


      const prorationCalculation = await this.calculateProration(companyId, newPlanId, effectiveDate);


      const planChangeData: InsertSubscriptionPlanChange = {
        companyId,
        fromPlanId: company.planId!,
        toPlanId: newPlanId,
        changeType,
        effectiveDate,
        prorationAmount: prorationCalculation.totalAmount.toString(),
        prorationDays: prorationCalculation.currentPlanDaysRemaining,
        billingCycleReset: prorationCalculation.billingCycleReset,
        changeReason: reason,
        processed: prorationMode === 'immediate'
      };

      const [planChange] = await db.insert(subscriptionPlanChanges).values(planChangeData).returning();

      let transactionId: number | undefined;

      if (prorationMode === 'immediate') {

        const result = await this.processImmediatePlanChange(companyId, planChange.id, prorationCalculation);
        transactionId = result.transactionId;


        const updatedCompany = await storage.updateCompany(companyId, {
          planId: newPlanId,
          plan: newPlan.name, // Also update the plan name for consistency
          subscriptionEndDate: prorationCalculation.billingCycleReset ?
            this.calculateNewBillingCycleEnd((newPlan as any).billingInterval) :
            company.subscriptionEndDate,

          isInTrial: newPlan.isFree ? company.isInTrial : false,
          trialStartDate: newPlan.isFree ? company.trialStartDate : null,
          trialEndDate: newPlan.isFree ? company.trialEndDate : null
        });


        try {
          if ((global as any).broadcastToCompany && updatedCompany) {
            (global as any).broadcastToCompany({
              type: 'plan_updated',
              data: {
                companyId,
                newPlan: updatedCompany.plan,
                planId: updatedCompany.planId,
                timestamp: new Date().toISOString(),
                changeType: 'proration_immediate'
              }
            }, companyId);
          }
        } catch (broadcastError) {
          logger.error('proration-service', 'Error broadcasting plan update:', broadcastError);

        }


        await db
          .update(subscriptionPlanChanges)
          .set({ processed: true })
          .where(eq(subscriptionPlanChanges.id, planChange.id));


        await subscriptionManager.logSubscriptionEvent(
          companyId,
          'plan_changed',
          {
            fromPlan: currentPlan.name,
            toPlan: newPlan.name,
            changeType,
            prorationAmount: prorationCalculation.totalAmount,
            transactionId
          },
          company.subscriptionStatus || 'inactive',
          company.subscriptionStatus || 'inactive',
          triggeredBy
        );


        await this.updateUsageTrackingLimits(companyId, newPlan);

      } else {

        await subscriptionManager.scheduleNotification(
          companyId,
          'plan_change_scheduled',
          company.subscriptionEndDate || new Date(),
          {
            fromPlan: currentPlan.name,
            toPlan: newPlan.name,
            changeType,
            effectiveDate: company.subscriptionEndDate
          }
        );
      }

      return {
        success: true,
        changeId: planChange.id,
        prorationCalculation,
        transactionId
      };

    } catch (error) {
      logger.error('proration-service', 'Error changing plan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process immediate plan change
   */
  private async processImmediatePlanChange(
    companyId: number,
    planChangeId: number,
    prorationCalculation: ProrationCalculation
  ): Promise<{ transactionId?: number }> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }


      if (Math.abs(prorationCalculation.totalAmount) > 0.01) {
        const transactionData: InsertPaymentTransaction = {
          companyId,
          planId: company.planId!,
          amount: Math.abs(prorationCalculation.totalAmount).toString(),
          currency: 'USD',
          status: prorationCalculation.totalAmount > 0 ? 'pending' : 'completed',
          paymentMethod: 'stripe',
          prorationAmount: prorationCalculation.totalAmount.toString(),
          metadata: {
            planChangeId,
            prorationDays: prorationCalculation.currentPlanDaysRemaining,
            changeType: prorationCalculation.totalAmount > 0 ? 'charge' : 'refund'
          }
        };

        const [transaction] = await db.insert(paymentTransactions).values(transactionData).returning();




        if (prorationCalculation.totalAmount <= 0) {
          await db
            .update(paymentTransactions)
            .set({ status: 'completed' })
            .where(eq(paymentTransactions.id, transaction.id));
        }

        return { transactionId: transaction.id };
      }

      return {};

    } catch (error) {
      logger.error('proration-service', 'Error processing immediate plan change:', error);
      throw error;
    }
  }

  /**
   * Update usage tracking limits for new plan
   */
  private async updateUsageTrackingLimits(companyId: number, newPlan: any): Promise<void> {
    try {

      const usageMetrics = [
        { metric: 'users', limit: newPlan.maxUsers },
        { metric: 'contacts', limit: newPlan.maxContacts },
        { metric: 'channels', limit: newPlan.maxChannels },
        { metric: 'flows', limit: newPlan.maxFlows },
        { metric: 'campaigns', limit: newPlan.maxCampaigns }
      ];

      for (const { metric, limit } of usageMetrics) {
        await db
          .insert(subscriptionUsageTracking)
          .values({
            companyId,
            metricName: metric,
            limitValue: limit,
            currentUsage: 0
          })
          .onConflictDoUpdate({
            target: [subscriptionUsageTracking.companyId, subscriptionUsageTracking.metricName],
            set: {
              limitValue: limit,
              updatedAt: new Date()
            }
          });
      }

    } catch (error) {
      logger.error('proration-service', 'Error updating usage tracking limits:', error);
      throw error;
    }
  }

  /**
   * Determine change type (upgrade/downgrade/change)
   */
  private determineChangeType(currentPlan: any, newPlan: any): 'upgrade' | 'downgrade' | 'change' {
    const currentPrice = Number(currentPlan.price);
    const newPrice = Number(newPlan.price);

    if (newPrice > currentPrice) {
      return 'upgrade';
    } else if (newPrice < currentPrice) {
      return 'downgrade';
    } else {
      return 'change';
    }
  }

  /**
   * Get days in billing cycle
   */
  private getDaysInBillingCycle(billingInterval: string, customDurationDays?: number | null): number {
    switch (billingInterval) {
      case 'lifetime':
        return 36500; // 100 years for lifetime plans
      case 'daily':
        return 1;
      case 'weekly':
        return 7;
      case 'biweekly':
        return 14;
      case 'monthly':
        return 30;
      case 'quarterly':
        return 90;
      case 'semi_annual':
        return 180;
      case 'annual':
        return 365;
      case 'biennial':
        return 730;
      case 'custom':
        return customDurationDays && customDurationDays > 0 ? customDurationDays : 30;

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

  /**
   * Calculate new billing cycle end date
   */
  private calculateNewBillingCycleEnd(billingInterval: string, customDurationDays?: number | null): Date {
    const now = new Date();
    const days = this.getDaysInBillingCycle(billingInterval, customDurationDays);
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * Process scheduled plan changes (called by scheduler)
   */
  async processScheduledPlanChanges(): Promise<void> {
    try {
      const now = new Date();


      const duePlanChanges = await db
        .select()
        .from(subscriptionPlanChanges)
        .where(
          and(
            eq(subscriptionPlanChanges.processed, false),
            lte(subscriptionPlanChanges.effectiveDate, now)
          )
        )
        .limit(50);

      logger.info('proration-service', `Found ${duePlanChanges.length} scheduled plan changes to process`);

      for (const planChange of duePlanChanges) {
        try {
          await this.processScheduledPlanChange(planChange);
        } catch (error) {
          logger.error('proration-service', `Error processing scheduled plan change ${planChange.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('proration-service', 'Error processing scheduled plan changes:', error);
      throw error;
    }
  }

  /**
   * Process individual scheduled plan change
   */
  private async processScheduledPlanChange(planChange: any): Promise<void> {
    try {
      const company = await storage.getCompany(planChange.companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const newPlan = await storage.getPlan(planChange.toPlanId);
      if (!newPlan) {
        throw new Error('New plan not found');
      }


      await storage.updateCompany(planChange.companyId, {
        planId: planChange.toPlanId,
        subscriptionEndDate: planChange.billingCycleReset ?
          this.calculateNewBillingCycleEnd((newPlan as any).billingInterval) :
          company.subscriptionEndDate,

        isInTrial: newPlan.isFree ? company.isInTrial : false,
        trialStartDate: newPlan.isFree ? company.trialStartDate : null,
        trialEndDate: newPlan.isFree ? company.trialEndDate : null
      });


      await db
        .update(subscriptionPlanChanges)
        .set({ processed: true })
        .where(eq(subscriptionPlanChanges.id, planChange.id));


      await this.updateUsageTrackingLimits(planChange.companyId, newPlan);


      await subscriptionManager.logSubscriptionEvent(
        planChange.companyId,
        'scheduled_plan_change_processed',
        {
          planChangeId: planChange.id,
          newPlan: newPlan.name,
          changeType: planChange.changeType
        },
        company.subscriptionStatus || 'inactive',
        company.subscriptionStatus || 'inactive',
        'system'
      );

      logger.info('proration-service', `Processed scheduled plan change ${planChange.id} for company ${planChange.companyId}`);

    } catch (error) {
      logger.error('proration-service', 'Error processing scheduled plan change:', error);
      throw error;
    }
  }
}

export const prorationService = new ProrationService();
