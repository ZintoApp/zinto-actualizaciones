import { storage } from '../storage';
import flowExecutor from './flow-executor';
import { getCachedCompanySetting } from '../utils/pipeline-cache';
import { 
  Deal, 
  DealAutomationRule, 
  DealAutomationTriggerType, 
  DealAutomationConditions, 
  DealAutomationAction 
} from '@shared/schema';

interface CachedRules {
  rules: DealAutomationRule[];
  timestamp: number;
}

const RULES_CACHE_TTL_MS = 60 * 1000;

export class DealAutomationService {
  private rulesCache = new Map<number, CachedRules>();

  /**
   * Invalidates the rules cache for a specific company or all companies.
   */
  invalidateDealAutomationRulesCache(companyId?: number): void {
    if (companyId) {
      this.rulesCache.delete(companyId);
    } else {
      this.rulesCache.clear();
    }
  }

  private async getCachedEnabledRules(companyId: number): Promise<DealAutomationRule[]> {
    const now = Date.now();
    const cached = this.rulesCache.get(companyId);

    if (cached && (now - cached.timestamp) < RULES_CACHE_TTL_MS) {
      return cached.rules;
    }

    try {
      const allRules = await storage.getDealAutomationRules(companyId);
      const enabledRules = allRules
        .filter(r => r.enabled === true)
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return (a.priority || 0) - (b.priority || 0);
          }
          return a.id - b.id;
        });

      this.rulesCache.set(companyId, {
        rules: enabledRules,
        timestamp: now
      });

      return enabledRules;
    } catch (error) {
      console.error(`[deal-automation] Error loading rules for company ${companyId}:`, error);
      return [];
    }
  }

  /**
   * Main entry point for evaluating events against deal automation rules.
   * Defensive: never throws, non-blocking for the caller.
   */
  async evaluateEvent(params: {
    companyId: number;
    contactId: number;
    triggerType: DealAutomationTriggerType;
    conversationId?: number;
    agentUserId?: number;
    isFromBot?: boolean;
    triggeredBy?: string;
  }): Promise<void> {
    const { 
      companyId, 
      contactId, 
      triggerType, 
      conversationId, 
      agentUserId, 
      isFromBot = false,
      triggeredBy = 'user'
    } = params;

    try {
      if (isFromBot) return;
      if (!companyId || !contactId) return;

      const isEnabled = await getCachedCompanySetting(companyId, 'dealAutomationRulesEnabled');
      if (!isEnabled) return;

      const rules = await this.getCachedEnabledRules(companyId);
      const triggerRules = rules.filter(r => r.triggerType === triggerType);

      if (triggerRules.length === 0) return;

      // Skip non-v1 triggers with a warning
      const supportedTriggers: DealAutomationTriggerType[] = ['agent_first_response', 'agent_message_sent'];
      if (!supportedTriggers.includes(triggerType)) {
        console.warn(`[deal-automation] Trigger type "${triggerType}" is not supported in v1`);
        return;
      }

      for (const rule of triggerRules) {
        const applied = await this.evaluateAndApplyRule(rule, {
          companyId,
          contactId,
          conversationId,
          agentUserId,
          triggerType,
          triggeredBy
        });

        if (applied) {
          // Stop after the first successfully applied rule (priority order)
          break;
        }
      }
    } catch (error) {
      console.error('[deal-automation] Unexpected error in evaluateEvent:', error);
    }
  }

  private async evaluateAndApplyRule(
    rule: DealAutomationRule, 
    context: {
      companyId: number;
      contactId: number;
      conversationId?: number;
      agentUserId?: number;
      triggerType: DealAutomationTriggerType;
      triggeredBy: string;
    }
  ): Promise<boolean> {
    try {
      const conditions = rule.conditions as DealAutomationConditions;
      
      // v1 requirement: stageIds must be present for message-based triggers to avoid infinite loops
      if (!conditions?.stageIds || !Array.isArray(conditions.stageIds) || conditions.stageIds.length === 0) {
        console.warn(`[deal-automation] Rule ${rule.id} skipped: missing or empty conditions.stageIds`);
        return false;
      }

      // 1. Resolve first active deal
      const deal = await storage.getActiveDealByContact(
        context.contactId, 
        context.companyId, 
        conditions.pipelineId || undefined
      );

      if (!deal) return false;

      // 2. Match conditions
      if (conditions.pipelineId && deal.pipelineId !== conditions.pipelineId) return false;
      if (conditions.stageIds && conditions.stageIds.length > 0) {
        if (deal.stageId === null || !conditions.stageIds.includes(deal.stageId)) return false;
      }
      if (deal.status !== 'active') return false;
      if (conditions.assignedUserRequired === true && !deal.assignedToUserId) return false;

      // 3. Validate action
      const action = rule.action as DealAutomationAction;
      if (!action) {
        console.warn(`[deal-automation] Rule ${rule.id} has no action configured`);
        return false;
      }

      const previousStageId = deal.stageId;
      const previousPipelineId = deal.pipelineId;

      let updatedDeal: Deal | null = null;

      if (action.type === 'move_to_stage') {
        if (!action.stageId) {
          console.warn(`[deal-automation] Rule ${rule.id} action move_to_stage missing stageId`);
          return false;
        }

        if (action.stageId === deal.stageId) return false;

        const targetStage = await storage.getPipelineStageById(action.stageId);
        if (!targetStage || targetStage.pipelineId !== deal.pipelineId) {
          console.warn(`[deal-automation] Rule ${rule.id} invalid target stage ${action.stageId} for current pipeline`);
          return false;
        }

        updatedDeal = await storage.updateDealStageId(deal.id, action.stageId);
      } else if (action.type === 'move_to_pipeline') {
        if (!action.pipelineId || !action.stageId) {
          console.warn(`[deal-automation] Rule ${rule.id} action move_to_pipeline missing pipelineId or stageId`);
          return false;
        }

        if (action.pipelineId === deal.pipelineId && action.stageId === deal.stageId) return false;

        const targetStage = await storage.getPipelineStageById(action.stageId);
        if (!targetStage || targetStage.pipelineId !== action.pipelineId) {
          console.warn(`[deal-automation] Rule ${rule.id} invalid target stage ${action.stageId} for pipeline ${action.pipelineId}`);
          return false;
        }

        updatedDeal = await storage.updateDealPipelineAndStage(deal.id, action.pipelineId, action.stageId);
      } else {
        console.warn(`[deal-automation] Rule ${rule.id} unsupported action type "${action.type}"`);
        return false;
      }

      if (!updatedDeal) return false;

      // 4. Record automation activity
      try {
        await storage.createDealActivity({
          dealId: updatedDeal.id,
          userId: 0, // System user
          type: 'automation',
          content: `Moved by automation rule: ${rule.name}`,
          metadata: {
            ruleId: rule.id,
            ruleName: rule.name,
            triggeredBy: 'automation',
            triggerType: context.triggerType,
            conversationId: context.conversationId,
            agentUserId: context.agentUserId,
            previousStageId,
            previousPipelineId,
            newStageId: updatedDeal.stageId,
            newPipelineId: updatedDeal.pipelineId
          }
        });
      } catch (error) {
        console.error(`[deal-automation] Failed to create activity for rule ${rule.id}:`, error);
      }

      // 5. Fire side effects (notifications etc)
      // v1 boundary: we pass triggeredBy: 'automation' to avoid notification loops or chaining if implemented later
      try {
        await flowExecutor.triggerDealStageChangedNotification(
          updatedDeal.id,
          updatedDeal.contactId,
          updatedDeal.pipelineId,
          updatedDeal.stageId,
          previousStageId,
          previousPipelineId,
          'automation'
        );
      } catch (error) {
        console.error(`[deal-automation] triggerDealStageChangedNotification failed for rule ${rule.id}:`, error);
      }

      return true;
    } catch (error) {
      console.error(`[deal-automation] Error evaluating rule ${rule.id}:`, error);
      return false;
    }
  }
}

/**
 * v1 Boundary Documentation:
 * - This service is currently wired only to message-based outbound events (agent_message_sent, agent_first_response).
 * - Automation-triggered deal updates MUST NOT trigger deal_stage_entered automation rules to avoid cycles.
 * - The triggeredBy: 'automation' flag is used to differentiate these updates from user/manual updates.
 */

const dealAutomationService = new DealAutomationService();
export default dealAutomationService;
