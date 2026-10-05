import { db } from '../db';
import { storage } from '../storage';
import { 
  companies,
  plans,
  planAiProviderConfigs,
  planAiUsageTracking,
  planAiBillingEvents,
  Company,
  Plan,
  PlanAiProviderConfig,
  PlanAiUsageTracking,
  InsertPlanAiBillingEvent
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface PlanLimitCheck {
  allowed: boolean;
  limitType: 'users' | 'contacts' | 'channels' | 'flows' | 'campaigns' | 'ai_tokens' | 'subscription_expired' | 'none';
  currentUsage: number;
  limit: number;
  remaining: number;
  message?: string;
}

export interface SubscriptionExpirationCheck {
  isExpired: boolean;
  status: string;
  expirationDate?: Date;
  daysUntilExpiry?: number;
  isInGracePeriod?: boolean;
  gracePeriodEnd?: Date;
  message?: string;
}

export interface CompanyPlanInfo {
  company: Company;
  plan: Plan | null;
  aiProviderConfigs: PlanAiProviderConfig[];
}

/**
 * Service for enforcing plan limits across the application
 */
export class PlanLimitsService {

  /**
   * Normalize subscription status to handle NULL values and inconsistencies
   * This ensures consistency with plan-expiration-service
   */
  private normalizeSubscriptionStatus(company: any): string {
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
   * Check if a company's subscription has expired
   */
  async checkSubscriptionExpiration(companyId: number): Promise<SubscriptionExpirationCheck> {
    try {
      const company = await this.getCompanyPlanInfo(companyId);
      
      if (!company || !company.company) {
        return {
          isExpired: true,
          status: 'inactive',
          message: 'Company not found'
        };
      }


      const generalSettings = await storage.getAppSetting('general_settings');
      if (generalSettings?.value) {
        const settings = generalSettings.value as any;
        if (settings.planRenewalEnabled === false) {

          return {
            isExpired: false,
            status: 'active',
            message: 'Subscription is active (unlimited usage)'
          };
        }
      }

      const { company: companyData } = company;
      const now = new Date();



      const normalizedStatus = this.normalizeSubscriptionStatus(companyData);

      if (['cancelled', 'inactive'].includes(normalizedStatus)) {
        return {
          isExpired: true,
          status: normalizedStatus,
          message: 'Subscription is not active'
        };
      }


      if (companyData.subscriptionEndDate) {
        const isExpired = now > companyData.subscriptionEndDate;
        const daysUntilExpiry = Math.ceil((companyData.subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (isExpired && companyData.gracePeriodEnd) {
          const isInGracePeriod = now <= companyData.gracePeriodEnd;
          if (isInGracePeriod) {
            const gracePeriodDaysRemaining = Math.ceil((companyData.gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return {
              isExpired: false, // Allow access during grace period
              status: 'grace_period',
              expirationDate: companyData.subscriptionEndDate,
              isInGracePeriod: true,
              gracePeriodEnd: companyData.gracePeriodEnd,
              message: `Subscription expired but in grace period. ${gracePeriodDaysRemaining} days remaining to renew.`
            };
          } else {
            return {
              isExpired: true,
              status: 'expired',
              expirationDate: companyData.subscriptionEndDate,
              isInGracePeriod: false,
              gracePeriodEnd: companyData.gracePeriodEnd,
              message: 'Subscription and grace period have expired. Please renew to continue using the service.'
            };
          }
        }


        if (isExpired && !companyData.gracePeriodEnd) {
          await this.startGracePeriodForExpiredSubscription(companyId, companyData);


          const plan = await storage.getPlan(companyData.planId!);
          const gracePeriodDays = (plan as any)?.gracePeriodDays || 15; // Default 15 days
          const gracePeriodEnd = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);

          return {
            isExpired: false, // Allow access during grace period
            status: 'grace_period',
            expirationDate: companyData.subscriptionEndDate,
            isInGracePeriod: true,
            gracePeriodEnd: gracePeriodEnd,
            message: `Subscription expired but grace period started. ${gracePeriodDays} days remaining to renew.`
          };
        }

        if (isExpired) {
          return {
            isExpired: true,
            status: 'expired',
            expirationDate: companyData.subscriptionEndDate,
            message: 'Subscription has expired. Please renew to continue using the service.'
          };
        }

        return {
          isExpired: false,
          status: companyData.subscriptionStatus || 'active',
          expirationDate: companyData.subscriptionEndDate,
          daysUntilExpiry: Math.max(0, daysUntilExpiry),
          message: `Subscription is active. ${daysUntilExpiry} days remaining.`
        };
      }


      if (['expired', 'past_due', 'overdue'].includes(companyData.subscriptionStatus || '')) {

        if (!companyData.gracePeriodEnd) {
          await this.startGracePeriodForExpiredSubscription(companyId, companyData);


          const plan = await storage.getPlan(companyData.planId!);
          const gracePeriodDays = (plan as any)?.gracePeriodDays || 15;
          const gracePeriodEnd = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);

          return {
            isExpired: false, // Allow access during grace period
            status: 'grace_period',
            isInGracePeriod: true,
            gracePeriodEnd: gracePeriodEnd,
            message: `Subscription expired but grace period started. ${gracePeriodDays} days remaining to renew.`
          };
        }

        return {
          isExpired: true,
          status: companyData.subscriptionStatus || 'expired',
          message: 'Subscription has expired. Please renew to continue using the service.'
        };
      }


      return {
        isExpired: false,
        status: companyData.subscriptionStatus || 'active',
        message: 'Subscription is active.'
      };

    } catch (error) {
      return {
        isExpired: false,
        status: 'error',
        message: 'Unable to verify subscription status - access granted.'
      };
    }
  }

  /**
   * Check if a company can access the application (comprehensive check)
   */
  async checkApplicationAccess(companyId: number): Promise<PlanLimitCheck> {
    try {

      const expirationCheck = await this.checkSubscriptionExpiration(companyId);

      if (expirationCheck.isExpired) {
        return {
          allowed: false,
          limitType: 'subscription_expired',
          currentUsage: 0,
          limit: 0,
          remaining: 0,
          message: expirationCheck.message || 'Subscription has expired. Please renew to continue using the service.'
        };
      }

      return {
        allowed: true,
        limitType: 'none',
        currentUsage: 0,
        limit: Infinity,
        remaining: Infinity,
        message: expirationCheck.message || 'Access granted.'
      };

    } catch (error) {
      console.error('Error checking application access:', error);

      return {
        allowed: true,
        limitType: 'none',
        currentUsage: 0,
        limit: Infinity,
        remaining: Infinity,
        message: 'Error checking access - access granted.'
      };
    }
  }

  /**
   * Automatically start grace period for expired subscription
   */
  private async startGracePeriodForExpiredSubscription(companyId: number, companyData: any): Promise<void> {
    try {
      const plan = await storage.getPlan(companyData.planId!);
      const gracePeriodDays = (plan as any)?.gracePeriodDays || 15; // Default 15 days

      if (gracePeriodDays <= 0) {

        return;
      }

      const gracePeriodEnd = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'grace_period',
        gracePeriodEnd: gracePeriodEnd
      });

    } catch (error) {

    }
  }

  /**
   * Get comprehensive plan information for a company
   */
  async getCompanyPlanInfo(companyId: number): Promise<CompanyPlanInfo | null> {
    try {

      const [company] = await db.select()
        .from(companies)
        .where(eq(companies.id, companyId));

      if (!company) {
        return null;
      }

      let plan: Plan | null = null;
      let aiProviderConfigs: PlanAiProviderConfig[] = [];

      if (company.planId) {

        const [planData] = await db.select()
          .from(plans)
          .where(eq(plans.id, company.planId));

        plan = planData || null;

        if (plan) {

          aiProviderConfigs = await db.select()
            .from(planAiProviderConfigs)
            .where(eq(planAiProviderConfigs.planId, plan.id))
            .orderBy(planAiProviderConfigs.priority, planAiProviderConfigs.provider);
        }
      }

      return {
        company,
        plan,
        aiProviderConfigs
      };
    } catch (error) {
      console.error('Error getting company plan info:', error);
      return null;
    }
  }

  /**
   * Check if a company can perform an action based on their plan limits
   */
  async checkPlanLimit(
    companyId: number, 
    limitType: 'users' | 'contacts' | 'channels' | 'flows' | 'campaigns' | 'ai_tokens' | 'subscription_expired' | 'none',
    requestedAmount: number = 1
  ): Promise<PlanLimitCheck> {
    try {
      const planInfo = await this.getCompanyPlanInfo(companyId);
      
      if (!planInfo || !planInfo.plan) {

        return {
          allowed: true,
          limitType: 'none',
          currentUsage: 0,
          limit: Infinity,
          remaining: Infinity,
          message: 'No plan limits applied'
        };
      }

      const plan = planInfo.plan;
      let limit: number;
      let currentUsage: number;


      switch (limitType) {
        case 'users':
          limit = plan.maxUsers;
          currentUsage = await this.getCurrentUserCount(companyId);
          break;
        case 'contacts':
          limit = plan.maxContacts;
          currentUsage = await this.getCurrentContactCount(companyId);
          break;
        case 'channels':
          limit = plan.maxChannels;
          currentUsage = await this.getCurrentChannelCount(companyId);
          break;
        case 'flows':
          limit = plan.maxFlows;
          currentUsage = await this.getCurrentFlowCount(companyId);
          break;
        case 'campaigns':
          limit = plan.maxCampaigns;
          currentUsage = await this.getCurrentCampaignCount(companyId);
          break;
        default:
          return {
            allowed: true,
            limitType: 'none',
            currentUsage: 0,
            limit: Infinity,
            remaining: Infinity,
            message: 'Unknown limit type'
          };
      }

      const remaining = Math.max(0, limit - currentUsage);
      const allowed = (currentUsage + requestedAmount) <= limit;

      return {
        allowed,
        limitType,
        currentUsage,
        limit,
        remaining,
        message: allowed 
          ? `${remaining} ${limitType} remaining` 
          : `${limitType.charAt(0).toUpperCase() + limitType.slice(1)} limit exceeded (${currentUsage}/${limit})`
      };

    } catch (error) {
      console.error(`Error checking plan limit for ${limitType}:`, error);

      return {
        allowed: true,
        limitType: 'none',
        currentUsage: 0,
        limit: Infinity,
        remaining: Infinity,
        message: 'Error checking limits - defaulting to allow'
      };
    }
  }

  /**
   * Check AI token usage limits for a company
   */
  async checkAiTokenLimit(
    companyId: number,
    provider: string,
    requestedTokens: number
  ): Promise<PlanLimitCheck> {
    try {
      const planInfo = await this.getCompanyPlanInfo(companyId);
      
      if (!planInfo || !planInfo.plan || !planInfo.plan.aiBillingEnabled) {

        return {
          allowed: true,
          limitType: 'none',
          currentUsage: 0,
          limit: Infinity,
          remaining: Infinity,
          message: 'AI billing not enabled'
        };
      }

      const plan = planInfo.plan;
      

      const providerConfig = planInfo.aiProviderConfigs.find(config => 
        config.provider === provider && config.enabled
      );


      const monthlyLimit = providerConfig?.tokensMonthlyLimit ?? plan.aiTokensMonthlyLimit;
      const dailyLimit = providerConfig?.tokensDailyLimit ?? plan.aiTokensDailyLimit;


      const currentUsage = await this.getCurrentAiTokenUsage(companyId, plan.id, provider);


      if (dailyLimit !== null) {
        const dailyRemaining = Math.max(0, dailyLimit - currentUsage.daily);
        const dailyAllowed = (currentUsage.daily + requestedTokens) <= dailyLimit;

        if (!dailyAllowed) {
          return {
            allowed: false,
            limitType: 'ai_tokens',
            currentUsage: currentUsage.daily,
            limit: dailyLimit,
            remaining: dailyRemaining,
            message: `Daily AI token limit exceeded (${currentUsage.daily}/${dailyLimit})`
          };
        }
      }


      if (monthlyLimit !== null) {
        const monthlyRemaining = Math.max(0, monthlyLimit - currentUsage.monthly);
        const monthlyAllowed = (currentUsage.monthly + requestedTokens) <= monthlyLimit;

        if (!monthlyAllowed) {
          return {
            allowed: false,
            limitType: 'ai_tokens',
            currentUsage: currentUsage.monthly,
            limit: monthlyLimit,
            remaining: monthlyRemaining,
            message: `Monthly AI token limit exceeded (${currentUsage.monthly}/${monthlyLimit})`
          };
        }

        return {
          allowed: true,
          limitType: 'ai_tokens',
          currentUsage: currentUsage.monthly,
          limit: monthlyLimit,
          remaining: monthlyRemaining,
          message: `${monthlyRemaining} tokens remaining this month`
        };
      }


      return {
        allowed: true,
        limitType: 'none',
        currentUsage: currentUsage.monthly,
        limit: Infinity,
        remaining: Infinity,
        message: 'Unlimited AI tokens'
      };

    } catch (error) {
      console.error('Error checking AI token limits:', error);

      return {
        allowed: true,
        limitType: 'none',
        currentUsage: 0,
        limit: Infinity,
        remaining: Infinity,
        message: 'Error checking AI limits - defaulting to allow'
      };
    }
  }

  /**
   * Get current AI token usage for a company/plan/provider
   */
  private async getCurrentAiTokenUsage(
    companyId: number, 
    planId: number, 
    provider: string
  ): Promise<{ daily: number; monthly: number }> {
    const now = new Date();
    const usageDate = now.toISOString().split('T')[0];
    const usageMonth = now.getMonth() + 1;
    const usageYear = now.getFullYear();

    const [usage] = await db.select()
      .from(planAiUsageTracking)
      .where(and(
        eq(planAiUsageTracking.companyId, companyId),
        eq(planAiUsageTracking.planId, planId),
        eq(planAiUsageTracking.provider, provider),
        eq(planAiUsageTracking.usageYear, usageYear),
        eq(planAiUsageTracking.usageMonth, usageMonth),
        eq(planAiUsageTracking.usageDate, usageDate)
      ));

    return {
      daily: usage?.tokensUsedDaily || 0,
      monthly: usage?.tokensUsedMonthly || 0
    };
  }


  private async getCurrentUserCount(companyId: number): Promise<number> {


    return 0; // Placeholder
  }

  private async getCurrentContactCount(companyId: number): Promise<number> {


    return 0; // Placeholder
  }

  private async getCurrentChannelCount(companyId: number): Promise<number> {


    return 0; // Placeholder
  }

  private async getCurrentFlowCount(companyId: number): Promise<number> {


    return 0; // Placeholder
  }

  private async getCurrentCampaignCount(companyId: number): Promise<number> {


    return 0; // Placeholder
  }
}

export const planLimitsService = new PlanLimitsService();
