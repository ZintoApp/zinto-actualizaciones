import { db } from '../db';
import { companies, Company } from '@shared/schema';
import { eq, isNull, or, and, lte } from 'drizzle-orm';
import { logger } from '../utils/logger';

/**
 * Service to validate and fix subscription data inconsistencies
 * This addresses the critical bug where existing deployments show incorrect renewal dialogs
 */
export class SubscriptionDataValidator {
  
  /**
   * Validate and fix all subscription data inconsistencies
   */
  async validateAndFixAllData(): Promise<{
    success: boolean;
    fixedCompanies: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let fixedCompanies = 0;

    try {
      logger.info('subscription-data-validator', 'Starting comprehensive subscription data validation and fix');


      const nullStatusFix = await this.fixNullSubscriptionStatus();
      fixedCompanies += nullStatusFix.fixed;
      if (nullStatusFix.errors.length > 0) {
        errors.push(...nullStatusFix.errors);
      }


      const gracePeriodFix = await this.fixMissingGracePeriods();
      fixedCompanies += gracePeriodFix.fixed;
      if (gracePeriodFix.errors.length > 0) {
        errors.push(...gracePeriodFix.errors);
      }


      const expiredGraceFix = await this.fixExpiredGracePeriods();
      fixedCompanies += expiredGraceFix.fixed;
      if (expiredGraceFix.errors.length > 0) {
        errors.push(...expiredGraceFix.errors);
      }


      const trialStatusFix = await this.fixInconsistentTrialStatus();
      fixedCompanies += trialStatusFix.fixed;
      if (trialStatusFix.errors.length > 0) {
        errors.push(...trialStatusFix.errors);
      }


      const missingFieldsFix = await this.initializeMissingFields();
      fixedCompanies += missingFieldsFix.fixed;
      if (missingFieldsFix.errors.length > 0) {
        errors.push(...missingFieldsFix.errors);
      }

      logger.info('subscription-data-validator', `Validation completed. Fixed ${fixedCompanies} companies with ${errors.length} errors`);

      return {
        success: errors.length === 0,
        fixedCompanies,
        errors
      };

    } catch (error) {
      logger.error('subscription-data-validator', 'Critical error during validation:', error);
      return {
        success: false,
        fixedCompanies,
        errors: [...errors, `Critical error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Fix companies with NULL subscription_status
   */
  private async fixNullSubscriptionStatus(): Promise<{ fixed: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;

    try {

      const companiesWithNullStatus = await db
        .select()
        .from(companies)
        .where(isNull(companies.subscriptionStatus));

      logger.info('subscription-data-validator', `Found ${companiesWithNullStatus.length} companies with NULL subscription_status`);

      for (const company of companiesWithNullStatus) {
        try {
          const now = new Date();
          let newStatus: 'active' | 'inactive' | 'pending' | 'cancelled' | 'overdue' | 'trial' | 'grace_period' | 'paused' | 'past_due' = 'inactive';


          if (company.subscriptionEndDate && company.subscriptionEndDate > now) {
            newStatus = 'active';
          } else if (company.isInTrial && company.trialEndDate && company.trialEndDate > now) {
            newStatus = 'trial';
          } else if (company.subscriptionEndDate && company.subscriptionEndDate <= now) {
            if (company.gracePeriodEnd && company.gracePeriodEnd > now) {
              newStatus = 'grace_period';
            }
          }

          await db
            .update(companies)
            .set({ subscriptionStatus: newStatus })
            .where(eq(companies.id, company.id));

          fixed++;
          logger.debug('subscription-data-validator', `Fixed company ${company.id}: NULL -> ${newStatus}`);

        } catch (error) {
          const errorMsg = `Failed to fix company ${company.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error('subscription-data-validator', errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to query companies with NULL status: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('subscription-data-validator', errorMsg);
    }

    return { fixed, errors };
  }

  /**
   * Fix companies missing grace periods
   */
  private async fixMissingGracePeriods(): Promise<{ fixed: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;

    try {
      const now = new Date();
      const gracePeriodDays = 15; // BotHive's 15-day grace period


      const companiesNeedingGracePeriod = await db
        .select()
        .from(companies)
        .where(
          and(
            lte(companies.subscriptionEndDate, now),
            isNull(companies.gracePeriodEnd),
            or(
              eq(companies.subscriptionStatus, 'active'),
              eq(companies.subscriptionStatus, 'inactive'),
              isNull(companies.subscriptionStatus)
            )
          )
        );

      logger.info('subscription-data-validator', `Found ${companiesNeedingGracePeriod.length} companies needing grace period`);

      for (const company of companiesNeedingGracePeriod) {
        try {
          if (!company.subscriptionEndDate) continue;

          const gracePeriodEnd = new Date(company.subscriptionEndDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
          

          if (gracePeriodEnd > now) {
            await db
              .update(companies)
              .set({
                gracePeriodEnd,
                subscriptionStatus: 'grace_period' as const
              })
              .where(eq(companies.id, company.id));

            fixed++;
            logger.debug('subscription-data-validator', `Added grace period for company ${company.id} until ${gracePeriodEnd.toISOString()}`);
          }

        } catch (error) {
          const errorMsg = `Failed to add grace period for company ${company.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error('subscription-data-validator', errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to query companies needing grace period: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('subscription-data-validator', errorMsg);
    }

    return { fixed, errors };
  }

  /**
   * Fix companies with expired grace periods
   */
  private async fixExpiredGracePeriods(): Promise<{ fixed: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;

    try {
      const now = new Date();


      const companiesWithExpiredGrace = await db
        .select()
        .from(companies)
        .where(
          and(
            lte(companies.gracePeriodEnd, now),
            eq(companies.subscriptionStatus, 'grace_period')
          )
        );

      logger.info('subscription-data-validator', `Found ${companiesWithExpiredGrace.length} companies with expired grace periods`);

      for (const company of companiesWithExpiredGrace) {
        try {
          await db
            .update(companies)
            .set({ subscriptionStatus: 'inactive' as const })
            .where(eq(companies.id, company.id));

          fixed++;
          logger.debug('subscription-data-validator', `Marked company ${company.id} as inactive (grace period expired)`);

        } catch (error) {
          const errorMsg = `Failed to update expired grace period for company ${company.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error('subscription-data-validator', errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to query companies with expired grace periods: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('subscription-data-validator', errorMsg);
    }

    return { fixed, errors };
  }

  /**
   * Fix inconsistent trial statuses
   */
  private async fixInconsistentTrialStatus(): Promise<{ fixed: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;

    try {
      const now = new Date();


      const companiesWithInconsistentTrial = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.subscriptionStatus, 'trial'),
            or(
              isNull(companies.trialEndDate),
              lte(companies.trialEndDate, now)
            )
          )
        );

      logger.info('subscription-data-validator', `Found ${companiesWithInconsistentTrial.length} companies with inconsistent trial status`);

      for (const company of companiesWithInconsistentTrial) {
        try {
          await db
            .update(companies)
            .set({
              subscriptionStatus: 'inactive' as const,
              isInTrial: false
            })
            .where(eq(companies.id, company.id));

          fixed++;
          logger.debug('subscription-data-validator', `Fixed inconsistent trial status for company ${company.id}`);

        } catch (error) {
          const errorMsg = `Failed to fix trial status for company ${company.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error('subscription-data-validator', errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to query companies with inconsistent trial status: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('subscription-data-validator', errorMsg);
    }

    return { fixed, errors };
  }

  /**
   * Initialize missing fields with proper defaults
   */
  private async initializeMissingFields(): Promise<{ fixed: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;

    try {

      const companiesWithMissingFields = await db
        .select()
        .from(companies)
        .where(
          or(
            isNull(companies.autoRenewal),
            isNull(companies.subscriptionMetadata)
          )
        );

      logger.info('subscription-data-validator', `Found ${companiesWithMissingFields.length} companies with missing fields`);

      for (const company of companiesWithMissingFields) {
        try {
          const updates: Partial<Company> = {};

          if (company.autoRenewal === null) {
            updates.autoRenewal = false; // Conservative default for existing companies
          }

          if (company.subscriptionMetadata === null) {
            updates.subscriptionMetadata = {};
          }

          if (Object.keys(updates).length > 0) {
            await db
              .update(companies)
              .set(updates)
              .where(eq(companies.id, company.id));

            fixed++;
            logger.debug('subscription-data-validator', `Initialized missing fields for company ${company.id}:`, updates);
          }

        } catch (error) {
          const errorMsg = `Failed to initialize fields for company ${company.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error('subscription-data-validator', errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to query companies with missing fields: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('subscription-data-validator', errorMsg);
    }

    return { fixed, errors };
  }

  /**
   * Generate a comprehensive report of subscription data status
   */
  async generateDataReport(): Promise<{
    totalCompanies: number;
    statusBreakdown: Record<string, number>;
    issuesFound: string[];
    recommendations: string[];
  }> {
    try {
      const allCompanies = await db.select().from(companies);
      const totalCompanies = allCompanies.length;
      
      const statusBreakdown: Record<string, number> = {};
      const issuesFound: string[] = [];
      const recommendations: string[] = [];


      for (const company of allCompanies) {
        const status = company.subscriptionStatus || 'NULL';
        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
      }


      const nullStatusCount = statusBreakdown['NULL'] || 0;
      if (nullStatusCount > 0) {
        issuesFound.push(`${nullStatusCount} companies have NULL subscription_status`);
        recommendations.push('Run subscription data validation to fix NULL statuses');
      }

      const now = new Date();
      const expiredGraceCompanies = allCompanies.filter(c => 
        c.subscriptionStatus === 'grace_period' && 
        c.gracePeriodEnd && 
        c.gracePeriodEnd <= now
      ).length;

      if (expiredGraceCompanies > 0) {
        issuesFound.push(`${expiredGraceCompanies} companies have expired grace periods but are still marked as grace_period`);
        recommendations.push('Run subscription data validation to fix expired grace periods');
      }

      return {
        totalCompanies,
        statusBreakdown,
        issuesFound,
        recommendations
      };

    } catch (error) {
      logger.error('subscription-data-validator', 'Failed to generate data report:', error);
      throw error;
    }
  }
}


export const subscriptionDataValidator = new SubscriptionDataValidator();
