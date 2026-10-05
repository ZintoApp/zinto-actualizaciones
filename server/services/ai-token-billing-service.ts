import { appSumoCompanyPolicy, assertAppSumoAccess } from './appsumo-policy';
import { db } from '../db';
import { 
  plans,
  planAiProviderConfigs,
  planAiUsageTracking,
  planAiBillingEvents,
  companies,
  Plan,
  PlanAiProviderConfig,
  PlanAiUsageTracking,
  PlanAiBillingEvent,
  InsertPlanAiProviderConfig,
  InsertPlanAiUsageTracking,
  InsertPlanAiBillingEvent
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface TokenUsageResult {
  allowed: boolean;
  tokensUsed: number;
  tokensRemaining: number;
  limitType: 'daily' | 'monthly' | 'none';
  overageTokens?: number;
  overageCost?: number;
  blocked?: boolean;
  warning?: string;
}

export interface PlanLimits {
  monthlyLimit: number | null;
  dailyLimit: number | null;
  includedTokens: number;
  overageEnabled: boolean;
  overageRate: number;
  blockOnExceed: boolean;
}

/**
 * Service for managing AI token billing and plan limits
 */
export class AiTokenBillingService {

  /**
   * Get standard pricing for AI providers (fallback when no custom pricing is set)
   */
  private getStandardPricing(provider: string, model?: string): { input: number; output: number } {

    const pricing: Record<string, { input: number; output: number }> = {
      'openai': {
        input: 0.000001,   // $0.001 per 1K tokens
        output: 0.000002   // $0.002 per 1K tokens
      },
      'anthropic': {
        input: 0.000003,   // $0.003 per 1K tokens
        output: 0.000015   // $0.015 per 1K tokens
      },
      'gemini': {
        input: 0.000000125, // $0.000125 per 1K tokens
        output: 0.000000375 // $0.000375 per 1K tokens
      },
      'xai': {
        input: 0.000001,   // Estimated pricing
        output: 0.000002
      },
      'deepseek': {
        input: 0.00000014, // Very competitive pricing
        output: 0.00000028
      }
    };

    return pricing[provider] || { input: 0.000001, output: 0.000002 };
  }

  /**
   * Calculate cost based on token usage and provider pricing
   */
  private calculateCost(
    provider: string,
    inputTokens: number,
    outputTokens: number,
    customPricing?: { inputTokenRate?: string | number | null; outputTokenRate?: string | number | null }
  ): number {
    const standardPricing = this.getStandardPricing(provider);


    const inputRate = customPricing?.inputTokenRate
      ? (typeof customPricing.inputTokenRate === 'string'
          ? parseFloat(customPricing.inputTokenRate)
          : customPricing.inputTokenRate)
      : standardPricing.input;

    const outputRate = customPricing?.outputTokenRate
      ? (typeof customPricing.outputTokenRate === 'string'
          ? parseFloat(customPricing.outputTokenRate)
          : customPricing.outputTokenRate)
      : standardPricing.output;

    return (inputTokens * inputRate) + (outputTokens * outputRate);
  }

  /**
   * Check if AI usage is allowed for a company based on their plan limits
   */
  async checkUsageAllowed(
    companyId: number, 
    provider: string, 
    tokensRequested: number
  ): Promise<TokenUsageResult> {
    await assertAppSumoAccess(companyId);
    if ((await appSumoCompanyPolicy(companyId)).managed) return { allowed: true, tokensUsed: 0, tokensRemaining: Infinity, limitType: 'none' };
    try {

      const [company] = await db.select()
        .from(companies)
        .where(eq(companies.id, companyId));

      if (!company || !company.planId) {
        return {
          allowed: true,
          tokensUsed: 0,
          tokensRemaining: Infinity,
          limitType: 'none'
        };
      }


      const [plan] = await db.select()
        .from(plans)
        .where(eq(plans.id, company.planId));

      if (!plan || !plan.aiBillingEnabled) {
        return {
          allowed: true,
          tokensUsed: 0,
          tokensRemaining: Infinity,
          limitType: 'none'
        };
      }


      const [providerConfig] = await db.select()
        .from(planAiProviderConfigs)
        .where(and(
          eq(planAiProviderConfigs.planId, plan.id),
          eq(planAiProviderConfigs.provider, provider)
        ));


      const limits = this.getEffectiveLimits(plan, providerConfig);
      

      const currentUsage = await this.getCurrentUsage(companyId, plan.id, provider);
      

      if (limits.dailyLimit !== null) {
        const dailyUsed = currentUsage.tokensUsedDaily || 0;
        const dailyRemaining = Math.max(0, limits.dailyLimit - dailyUsed);

        if (dailyUsed + tokensRequested > limits.dailyLimit) {
          if (limits.blockOnExceed) {
            return {
              allowed: false,
              tokensUsed: dailyUsed,
              tokensRemaining: dailyRemaining,
              limitType: 'daily',
              blocked: true,
              warning: `Daily token limit of ${limits.dailyLimit} exceeded`
            };
          } else if (limits.overageEnabled) {
            const overageTokens = (dailyUsed + tokensRequested) - limits.dailyLimit;
            const overageCost = overageTokens * limits.overageRate;
            
            return {
              allowed: true,
              tokensUsed: dailyUsed,
              tokensRemaining: 0,
              limitType: 'daily',
              overageTokens,
              overageCost,
              warning: `Usage will exceed daily limit. Overage cost: $${overageCost.toFixed(6)}`
            };
          }
        }
      }


      if (limits.monthlyLimit !== null) {
        const monthlyUsed = currentUsage.tokensUsedMonthly || 0;
        const monthlyRemaining = Math.max(0, limits.monthlyLimit - monthlyUsed);

        if (monthlyUsed + tokensRequested > limits.monthlyLimit) {
          if (limits.blockOnExceed) {
            return {
              allowed: false,
              tokensUsed: monthlyUsed,
              tokensRemaining: monthlyRemaining,
              limitType: 'monthly',
              blocked: true,
              warning: `Monthly token limit of ${limits.monthlyLimit} exceeded`
            };
          } else if (limits.overageEnabled) {
            const overageTokens = (monthlyUsed + tokensRequested) - limits.monthlyLimit;
            const overageCost = overageTokens * limits.overageRate;
            
            return {
              allowed: true,
              tokensUsed: monthlyUsed,
              tokensRemaining: 0,
              limitType: 'monthly',
              overageTokens,
              overageCost,
              warning: `Usage will exceed monthly limit. Overage cost: $${overageCost.toFixed(6)}`
            };
          }
        }
        
        return {
          allowed: true,
          tokensUsed: monthlyUsed,
          tokensRemaining: monthlyRemaining,
          limitType: 'monthly'
        };
      }


      return {
        allowed: true,
        tokensUsed: currentUsage.tokensUsedMonthly || 0,
        tokensRemaining: Infinity,
        limitType: 'none'
      };

    } catch (error) {
      console.error('Error checking AI usage limits:', error);

      return {
        allowed: true,
        tokensUsed: 0,
        tokensRemaining: Infinity,
        limitType: 'none'
      };
    }
  }

  /**
   * Reserve estimated tokens atomically before an AI call (row-locked usage row).
   */
  async reserveTokensForAssistantCall(
    companyId: number,
    provider: string,
    tokensRequested: number
  ): Promise<TokenUsageResult> {
    await assertAppSumoAccess(companyId);
    if ((await appSumoCompanyPolicy(companyId)).managed) return { allowed: true, tokensUsed: 0, tokensRemaining: Infinity, limitType: 'none' };
    return await db.transaction(async (tx) => {
      const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
      if (!company || !company.planId) {
        return {
          allowed: true,
          tokensUsed: 0,
          tokensRemaining: Infinity,
          limitType: 'none'
        };
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, company.planId));
      if (!plan || !plan.aiBillingEnabled) {
        return {
          allowed: true,
          tokensUsed: 0,
          tokensRemaining: Infinity,
          limitType: 'none'
        };
      }

      const [providerConfig] = await tx
        .select()
        .from(planAiProviderConfigs)
        .where(
          and(
            eq(planAiProviderConfigs.planId, plan.id),
            eq(planAiProviderConfigs.provider, provider)
          )
        );

      const limits = this.getEffectiveLimits(plan, providerConfig);
      const now = new Date();
      const usageDate = now.toISOString().split('T')[0];
      const usageMonth = now.getMonth() + 1;
      const usageYear = now.getFullYear();

      await tx.insert(planAiUsageTracking).values({
        companyId,
        planId: company.planId,
        provider,
        tokensUsedDaily: 0,
        tokensUsedMonthly: 0,
        requestsDaily: 0,
        requestsMonthly: 0,
        costDaily: '0',
        costMonthly: '0',
        usageMonth,
        usageYear,
        usageDate
      }).onConflictDoNothing({
        target: [
          planAiUsageTracking.companyId,
          planAiUsageTracking.planId,
          planAiUsageTracking.provider,
          planAiUsageTracking.usageYear,
          planAiUsageTracking.usageMonth,
          planAiUsageTracking.usageDate
        ]
      });

      await tx.execute(sql`
        SELECT id FROM plan_ai_usage_tracking
        WHERE company_id = ${companyId}
          AND plan_id = ${company.planId}
          AND provider = ${provider}
          AND usage_year = ${usageYear}
          AND usage_month = ${usageMonth}
          AND usage_date = ${usageDate}
        FOR UPDATE
      `);

      const [usageRow] = await tx
        .select()
        .from(planAiUsageTracking)
        .where(
          and(
            eq(planAiUsageTracking.companyId, companyId),
            eq(planAiUsageTracking.planId, company.planId),
            eq(planAiUsageTracking.provider, provider),
            eq(planAiUsageTracking.usageYear, usageYear),
            eq(planAiUsageTracking.usageMonth, usageMonth),
            eq(planAiUsageTracking.usageDate, usageDate)
          )
        );

      if (!usageRow) {
        throw new Error('plan_ai_usage_tracking row missing after upsert');
      }

      const dailyUsed = usageRow.tokensUsedDaily || 0;
      const monthlyUsed = usageRow.tokensUsedMonthly || 0;

      if (limits.dailyLimit !== null) {
        const dailyRemaining = Math.max(0, limits.dailyLimit - dailyUsed);
        if (dailyUsed + tokensRequested > limits.dailyLimit) {
          if (limits.blockOnExceed) {
            return {
              allowed: false,
              tokensUsed: dailyUsed,
              tokensRemaining: dailyRemaining,
              limitType: 'daily',
              blocked: true,
              warning: `Daily token limit of ${limits.dailyLimit} exceeded`
            };
          }
          if (!limits.overageEnabled) {
            return {
              allowed: false,
              tokensUsed: dailyUsed,
              tokensRemaining: dailyRemaining,
              limitType: 'daily',
              blocked: true,
              warning: `Daily token limit of ${limits.dailyLimit} exceeded`
            };
          }
        }
      }

      if (limits.monthlyLimit !== null) {
        const monthlyRemaining = Math.max(0, limits.monthlyLimit - monthlyUsed);
        if (monthlyUsed + tokensRequested > limits.monthlyLimit) {
          if (limits.blockOnExceed) {
            return {
              allowed: false,
              tokensUsed: monthlyUsed,
              tokensRemaining: monthlyRemaining,
              limitType: 'monthly',
              blocked: true,
              warning: `Monthly token limit of ${limits.monthlyLimit} exceeded`
            };
          }
          if (!limits.overageEnabled) {
            return {
              allowed: false,
              tokensUsed: monthlyUsed,
              tokensRemaining: monthlyRemaining,
              limitType: 'monthly',
              blocked: true,
              warning: `Monthly token limit of ${limits.monthlyLimit} exceeded`
            };
          }
        }
      }

      await tx
        .update(planAiUsageTracking)
        .set({
          tokensUsedDaily: sql`${planAiUsageTracking.tokensUsedDaily} + ${tokensRequested}`,
          tokensUsedMonthly: sql`${planAiUsageTracking.tokensUsedMonthly} + ${tokensRequested}`,
          updatedAt: now
        })
        .where(eq(planAiUsageTracking.id, usageRow.id));

      return {
        allowed: true,
        tokensUsed: dailyUsed + tokensRequested,
        tokensRemaining: limits.dailyLimit !== null ? Math.max(0, limits.dailyLimit - dailyUsed - tokensRequested) : Infinity,
        limitType: limits.dailyLimit !== null ? 'daily' : limits.monthlyLimit !== null ? 'monthly' : 'none'
      };
    });
  }

  /**
   * Reconcile reservation with actual usage after the model returns (or 0/0 on failure).
   */
  async reconcileAssistantTokenUsage(
    companyId: number,
    provider: string,
    reservedEstimate: number,
    inputTokens: number,
    outputTokens: number,
    _conversationId?: number,
    _flowId?: number,
    _nodeId?: string,
    requestCount: number = 1
  ): Promise<void> {
    if ((await appSumoCompanyPolicy(companyId)).managed) return;
    try {
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company || !company.planId) {
        return;
      }

      const planId = company.planId;

      const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
      if (!plan || !plan.aiBillingEnabled) {
        return;
      }

      const [providerConfig] = await db
        .select()
        .from(planAiProviderConfigs)
        .where(
          and(
            eq(planAiProviderConfigs.planId, plan.id),
            eq(planAiProviderConfigs.provider, provider)
          )
        );

      const customPricing = providerConfig?.customPricingEnabled
        ? {
            inputTokenRate: providerConfig.inputTokenRate,
            outputTokenRate: providerConfig.outputTokenRate
          }
        : undefined;

      const totalTokens = inputTokens + outputTokens;
      const delta = totalTokens - reservedEstimate;
      const cost = this.calculateCost(provider, inputTokens, outputTokens, customPricing);

      const now = new Date();
      const usageDate = now.toISOString().split('T')[0];
      const usageMonth = now.getMonth() + 1;
      const usageYear = now.getFullYear();

      await db.transaction(async (tx) => {
        await tx.insert(planAiUsageTracking).values({
          companyId,
          planId,
          provider,
          tokensUsedDaily: 0,
          tokensUsedMonthly: 0,
          requestsDaily: 0,
          requestsMonthly: 0,
          costDaily: '0',
          costMonthly: '0',
          usageMonth,
          usageYear,
          usageDate
        }).onConflictDoNothing({
          target: [
            planAiUsageTracking.companyId,
            planAiUsageTracking.planId,
            planAiUsageTracking.provider,
            planAiUsageTracking.usageYear,
            planAiUsageTracking.usageMonth,
            planAiUsageTracking.usageDate
          ]
        });

        await tx.execute(sql`
          SELECT id FROM plan_ai_usage_tracking
          WHERE company_id = ${companyId}
            AND plan_id = ${planId}
            AND provider = ${provider}
            AND usage_year = ${usageYear}
            AND usage_month = ${usageMonth}
            AND usage_date = ${usageDate}
          FOR UPDATE
        `);

        await tx
          .update(planAiUsageTracking)
          .set({
            tokensUsedDaily: sql`${planAiUsageTracking.tokensUsedDaily} + ${delta}`,
            tokensUsedMonthly: sql`${planAiUsageTracking.tokensUsedMonthly} + ${delta}`,
            requestsDaily: sql`${planAiUsageTracking.requestsDaily} + ${requestCount}`,
            requestsMonthly: sql`${planAiUsageTracking.requestsMonthly} + ${requestCount}`,
            costDaily: sql`${planAiUsageTracking.costDaily} + ${cost}`,
            costMonthly: sql`${planAiUsageTracking.costMonthly} + ${cost}`,
            updatedAt: now
          })
          .where(
            and(
              eq(planAiUsageTracking.companyId, companyId),
              eq(planAiUsageTracking.planId, planId),
              eq(planAiUsageTracking.provider, provider),
              eq(planAiUsageTracking.usageYear, usageYear),
              eq(planAiUsageTracking.usageMonth, usageMonth),
              eq(planAiUsageTracking.usageDate, usageDate)
            )
          );
      });
    } catch (error) {
      console.error('Error reconciling AI token usage:', error);
      throw error;
    }
  }

  /**
   * Record AI token usage and update billing tracking
   */
  async recordUsage(
    companyId: number,
    provider: string,
    inputTokens: number,
    outputTokens: number,
    conversationId?: number,
    flowId?: number,
    nodeId?: string,
    requestCount: number = 1
  ): Promise<void> {
    await this.reconcileAssistantTokenUsage(
      companyId,
      provider,
      0,
      inputTokens,
      outputTokens,
      conversationId,
      flowId,
      nodeId,
      requestCount
    );
  }

  /**
   * Get effective limits for a plan and provider
   */
  private getEffectiveLimits(plan: Plan, providerConfig?: PlanAiProviderConfig): PlanLimits {
    return {
      monthlyLimit: providerConfig?.tokensMonthlyLimit ?? plan.aiTokensMonthlyLimit,
      dailyLimit: providerConfig?.tokensDailyLimit ?? plan.aiTokensDailyLimit,
      includedTokens: plan.aiTokensIncluded || 0,
      overageEnabled: plan.aiOverageEnabled || false,
      overageRate: parseFloat(plan.aiOverageRate || '0'),
      blockOnExceed: plan.aiOverageBlockEnabled || false
    };
  }

  /**
   * Get current usage for a company/plan/provider
   */
  private async getCurrentUsage(
    companyId: number, 
    planId: number, 
    provider: string
  ): Promise<PlanAiUsageTracking> {
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

    return usage || {
      id: 0,
      companyId,
      planId,
      provider,
      tokensUsedMonthly: 0,
      tokensUsedDaily: 0,
      requestsMonthly: 0,
      requestsDaily: 0,
      costMonthly: '0',
      costDaily: '0',
      overageTokensMonthly: 0,
      overageCostMonthly: '0',
      usageMonth,
      usageYear,
      usageDate,
      monthlyLimitReached: false,
      dailyLimitReached: false,
      monthlyWarningSent: false,
      dailyWarningSent: false,
      createdAt: now,
      updatedAt: now
    };
  }
}

export const aiTokenBillingService = new AiTokenBillingService();
