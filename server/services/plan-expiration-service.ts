import { db } from '../db';
import {
  companies,
  plans,
  Company,
  Plan
} from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import { storage } from '../storage';
import { logger } from '../utils/logger';

export interface PlanExpirationStatus {
  isExpired: boolean;
  isInGracePeriod: boolean;
  daysUntilExpiry: number;
  gracePeriodDaysRemaining: number;
  subscriptionStatus: string;
  canAccess: boolean;
  blockReason?: string;
  renewalRequired: boolean;
  nextBillingDate?: Date;
}

export interface CompanyAccessCheck {
  allowed: boolean;
  reason?: string;
  expirationStatus: PlanExpirationStatus;
  company: Company;
  plan: Plan | null;
}

/**
 * Service for checking plan expiration and enforcing access restrictions
 * Enhanced to handle data consistency issues between fresh and existing installations
 */
export class PlanExpirationService {

  /**
   * Normalize subscription status to handle NULL values and inconsistencies
   * This fixes the critical bug where existing deployments have NULL values
   */
  private normalizeSubscriptionStatus(company: Company): string {
    const now = new Date();


    if (company.subscriptionStatus && company.subscriptionStatus !== 'inactive') {
      return company.subscriptionStatus;
    }





    if (company.subscriptionEndDate && company.subscriptionEndDate > now) {
      return 'active';
    }


    if (company.isInTrial && company.trialEndDate && company.trialEndDate > now) {
      return 'trial';
    }


    if (company.subscriptionEndDate && company.subscriptionEndDate <= now) {
      if (company.gracePeriodEnd && company.gracePeriodEnd > now) {
        return 'grace_period';
      }
    }


    return 'inactive';
  }
  
  /**
   * Check if a company's plan has expired and determine access permissions
   */
  async checkCompanyAccess(companyId: number): Promise<CompanyAccessCheck> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {

        return {
          allowed: false,
          reason: 'Company not found',
          expirationStatus: this.getDefaultExpirationStatus(),
          company: null as any,
          plan: null
        };
      }






      const generalSettings = await storage.getAppSetting('general_settings');
      if (generalSettings?.value) {
        const settings = generalSettings.value as any;

        if (settings.planRenewalEnabled === false) {

          const plan = company.planId ? await storage.getPlan(company.planId) : null;

          return {
            allowed: true,
            expirationStatus: {
              isExpired: false,
              isInGracePeriod: false,
              daysUntilExpiry: 0,
              gracePeriodDaysRemaining: 0,
              subscriptionStatus: 'active',
              canAccess: true,
              renewalRequired: false
            },
            company,
            plan: plan || null
          };
        }
      }

      if (company.name === 'BotHive Admin' || company.slug === 'bothive-admin') {
        return {
          allowed: true,
          expirationStatus: this.getDefaultExpirationStatus(),
          company,
          plan: null
        };
      }

      const plan = company.planId ? await storage.getPlan(company.planId) : null;
      const expirationStatus = await this.getExpirationStatus(company, plan || null);


      const accessAllowed = this.shouldAllowAccess(expirationStatus);

      return {
        allowed: accessAllowed,
        reason: accessAllowed ? undefined : expirationStatus.blockReason,
        expirationStatus,
        company,
        plan: plan || null
      };

    } catch (error) {
      logger.error('plan-expiration-service', 'Error checking company access:', error);
      return {
        allowed: false,
        reason: 'Error checking access permissions',
        expirationStatus: this.getDefaultExpirationStatus(),
        company: null as any,
        plan: null
      };
    }
  }

  /**
   * Get detailed expiration status for a company
   */
  async getExpirationStatus(company: Company, plan: Plan | null): Promise<PlanExpirationStatus> {
    const now = new Date();
    

    if (!plan) {
      return {
        isExpired: false,
        isInGracePeriod: false,
        daysUntilExpiry: Infinity,
        gracePeriodDaysRemaining: 0,
        subscriptionStatus: company.subscriptionStatus || 'active',
        canAccess: true,
        renewalRequired: false,
        nextBillingDate: undefined
      };
    }


    if (plan.isFree && !plan.hasTrialPeriod && !company.subscriptionEndDate && !company.trialEndDate) {
      return {
        isExpired: false,
        isInGracePeriod: false,
        daysUntilExpiry: Infinity,
        gracePeriodDaysRemaining: 0,
        subscriptionStatus: company.subscriptionStatus || 'active',
        canAccess: true,
        renewalRequired: false,
        nextBillingDate: undefined
      };
    }


    const subscriptionStatus = this.normalizeSubscriptionStatus(company);
    const subscriptionEndDate = company.subscriptionEndDate;
    const gracePeriodEnd = company.gracePeriodEnd;
    const trialEndDate = company.trialEndDate;
    const isInTrial = company.isInTrial || false;

    



    const isInTrialPeriod = (plan.hasTrialPeriod && isInTrial && trialEndDate) || 
                           (subscriptionStatus === 'trial' && plan.hasTrialPeriod);
    
    if (isInTrialPeriod) {

      const effectiveTrialEndDate = trialEndDate || subscriptionEndDate;
      
      if (!effectiveTrialEndDate) {


      } else {
        const trialDaysRemaining = Math.ceil((effectiveTrialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isTrialExpired = now > effectiveTrialEndDate;

      if (!isTrialExpired) {

        const renewalRequired = trialDaysRemaining <= 7;


        return {
          isExpired: false,
          isInGracePeriod: false,
          daysUntilExpiry: trialDaysRemaining,
          gracePeriodDaysRemaining: 0,
          subscriptionStatus: 'trial',
          canAccess: true,
          renewalRequired,
          nextBillingDate: effectiveTrialEndDate
        };
      } else {

        const isInGracePeriod = subscriptionStatus === 'grace_period' && gracePeriodEnd ? now <= gracePeriodEnd : false;
        
        if (isInGracePeriod && gracePeriodEnd) {
          const gracePeriodDaysRemaining = Math.max(0, Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          return {
            isExpired: true,
            isInGracePeriod: true,
            daysUntilExpiry: 0,
            gracePeriodDaysRemaining,
            subscriptionStatus,
            canAccess: true,
            renewalRequired: true,
            blockReason: `Your trial has expired. You have ${gracePeriodDaysRemaining} day(s) remaining in your grace period.`,
            nextBillingDate: gracePeriodEnd || undefined
          };
        } else {

          return {
            isExpired: true,
            isInGracePeriod: false,
            daysUntilExpiry: 0,
            gracePeriodDaysRemaining: 0,
            subscriptionStatus,
            canAccess: false,
            renewalRequired: true,
            blockReason: 'Your trial period has expired. Please upgrade to a paid plan to continue using BotHive.',
            nextBillingDate: undefined
          };
        }
      }
      }
    }


    let daysUntilExpiry = Infinity;
    if (subscriptionEndDate) {
      daysUntilExpiry = Math.ceil((subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }


    let gracePeriodDaysRemaining = 0;
    if (gracePeriodEnd) {
      gracePeriodDaysRemaining = Math.max(0, Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }


    const isExpired = subscriptionEndDate ? now > subscriptionEndDate : false;
    const isInGracePeriod = subscriptionStatus === 'grace_period' && gracePeriodEnd ? now <= gracePeriodEnd : false;


    if (subscriptionStatus === 'active' && !isExpired) {



      const renewalRequired = false; // Only set true for truly expired subscriptions


      return {
        isExpired: false,
        isInGracePeriod: false,
        daysUntilExpiry,
        gracePeriodDaysRemaining: 0,
        subscriptionStatus,
        canAccess: true,
        renewalRequired,
        nextBillingDate: subscriptionEndDate || undefined
      };
    }


    if (isInGracePeriod) {
      return {
        isExpired: true,
        isInGracePeriod: true,
        daysUntilExpiry: 0,
        gracePeriodDaysRemaining,
        subscriptionStatus,
        canAccess: true,
        renewalRequired: true,
        blockReason: `Your subscription has expired. You have ${gracePeriodDaysRemaining} day(s) remaining in your grace period.`,
        nextBillingDate: gracePeriodEnd || undefined
      };
    }


    let canAccess = true;
    let blockReason: string | undefined;
    let renewalRequired = false;


    if (isExpired && !isInGracePeriod) {
      canAccess = false;
      renewalRequired = true;
      
      if (subscriptionStatus === 'cancelled') {
        blockReason = 'Subscription has been cancelled. Please renew to continue using BotHive.';
      } else if (subscriptionStatus === 'past_due' || subscriptionStatus === 'overdue') {
        blockReason = 'Payment is overdue. Please update your payment method to continue using BotHive.';
      } else {
        blockReason = 'Your subscription has expired. Please renew to continue using BotHive.';
      }
    }


    if (['inactive', 'cancelled'].includes(subscriptionStatus) && !isInGracePeriod) {
      canAccess = false;
      renewalRequired = true;
      blockReason = 'Your subscription is inactive. Please renew to continue using BotHive.';
    }

    return {
      isExpired,
      isInGracePeriod,
      daysUntilExpiry,
      gracePeriodDaysRemaining,
      subscriptionStatus,
      canAccess,
      blockReason,
      renewalRequired,
      nextBillingDate: subscriptionEndDate || gracePeriodEnd || undefined
    };
  }

  /**
   * Determine if access should be allowed based on expiration status
   */
  private shouldAllowAccess(expirationStatus: PlanExpirationStatus): boolean {

    if (expirationStatus.canAccess) {
      return true;
    }


    if (['active', 'trial'].includes(expirationStatus.subscriptionStatus)) {
      return true;
    }


    if (expirationStatus.isInGracePeriod) {
      return true;
    }


    return false;
  }

  /**
   * Get default expiration status for error cases
   */
  private getDefaultExpirationStatus(): PlanExpirationStatus {
    return {
      isExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 0,
      gracePeriodDaysRemaining: 0,
      subscriptionStatus: 'inactive',
      canAccess: false,
      blockReason: 'Unable to verify subscription status',
      renewalRequired: true
    };
  }
}


export const planExpirationService = new PlanExpirationService();
