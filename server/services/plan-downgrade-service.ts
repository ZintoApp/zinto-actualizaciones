import { storage } from '../storage';
import { db } from '../db';
import {
  companies,
  plans,
  subscriptionPlanChanges,
  subscriptionEvents,
  subscriptionNotifications,
  users,
  contacts,
  channelConnections,
  flows,
  campaigns,
  InsertSubscriptionEvent,
  InsertSubscriptionNotification
} from '@shared/schema';
import { eq, and, gt, desc, asc, count } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { usageTrackingService } from './usage-tracking-service';
import { logger } from '../utils/logger';

export interface DowngradeOptions {
  preserveData?: boolean;
  notifyUsers?: boolean;
  gracePeriodDays?: number;
  reason?: string;
}

export interface DowngradeResult {
  success: boolean;
  restrictedFeatures?: string[];
  dataActions?: DataAction[];
  error?: string;
}

export interface DataAction {
  type: 'deactivate' | 'archive' | 'delete' | 'limit';
  resource: string;
  count: number;
  details: string;
}

export interface DowngradePreview {
  currentPlan: any;
  targetPlan: any;
  restrictedFeatures: string[];
  dataActions: DataAction[];
  affectedUsers: number;
  estimatedDataLoss: boolean;
}

/**
 * Plan Downgrade Service
 * Handles automatic feature restriction and data migration for plan downgrades
 */
export class PlanDowngradeService {

  /**
   * Preview downgrade impact
   */
  async previewDowngrade(companyId: number, targetPlanId: number): Promise<DowngradePreview> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const currentPlan = await storage.getPlan(company.planId!);
      const targetPlan = await storage.getPlan(targetPlanId);

      if (!currentPlan || !targetPlan) {
        throw new Error('Plan not found');
      }


      const restrictedFeatures = await this.analyzeFeatureRestrictions(currentPlan, targetPlan);


      const dataActions = await this.analyzeDataActions(companyId, currentPlan, targetPlan);


      const affectedUsers = await this.countAffectedUsers(companyId, targetPlan);


      const estimatedDataLoss = dataActions.some(action => 
        action.type === 'delete' || (action.type === 'limit' && action.count > 0)
      );

      return {
        currentPlan,
        targetPlan,
        restrictedFeatures,
        dataActions,
        affectedUsers,
        estimatedDataLoss
      };

    } catch (error) {
      logger.error('plan-downgrade', 'Error previewing downgrade:', error);
      throw error;
    }
  }

  /**
   * Execute plan downgrade with feature restrictions
   */
  async executeDowngrade(
    companyId: number, 
    targetPlanId: number, 
    options: DowngradeOptions = {}
  ): Promise<DowngradeResult> {
    try {
      const {
        preserveData = true,
        notifyUsers = true,
        gracePeriodDays = 7,
        reason = 'plan_downgrade'
      } = options;

      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const currentPlan = await storage.getPlan(company.planId!);
      const targetPlan = await storage.getPlan(targetPlanId);

      if (!currentPlan || !targetPlan) {
        throw new Error('Plan not found');
      }


      if (Number(targetPlan.price) >= Number(currentPlan.price)) {
        throw new Error('Target plan is not a downgrade');
      }


      const preview = await this.previewDowngrade(companyId, targetPlanId);


      const dataActions = await this.executeDataActions(companyId, preview.dataActions, preserveData);


      await this.updateUsageLimits(companyId, targetPlan);


      const updatedCompany = await storage.updateCompany(companyId, {
        planId: targetPlanId,
        plan: targetPlan.name // Also update the plan name for consistency
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
              changeType: 'downgrade'
            }
          }, companyId);
        }
      } catch (broadcastError) {
        logger.error('plan-downgrade', 'Error broadcasting plan update:', broadcastError);

      }


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'plan_downgraded',
        {
          fromPlan: currentPlan.name,
          toPlan: targetPlan.name,
          reason,
          dataActions,
          restrictedFeatures: preview.restrictedFeatures
        },
        company.subscriptionStatus || 'inactive',
        company.subscriptionStatus || 'inactive',
        'system'
      );


      if (notifyUsers) {
        await this.notifyUsersOfDowngrade(companyId, preview, gracePeriodDays);
      }

      logger.info('plan-downgrade', `Executed downgrade for company ${companyId} from ${currentPlan.name} to ${targetPlan.name}`);

      return {
        success: true,
        restrictedFeatures: preview.restrictedFeatures,
        dataActions
      };

    } catch (error) {
      logger.error('plan-downgrade', 'Error executing downgrade:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze feature restrictions between plans
   */
  private async analyzeFeatureRestrictions(currentPlan: any, targetPlan: any): Promise<string[]> {
    try {
      const currentFeatures = currentPlan.features as string[] || [];
      const targetFeatures = targetPlan.features as string[] || [];


      const restrictedFeatures = currentFeatures.filter(feature => 
        !targetFeatures.includes(feature)
      );

      return restrictedFeatures;

    } catch (error) {
      logger.error('plan-downgrade', 'Error analyzing feature restrictions:', error);
      return [];
    }
  }

  /**
   * Analyze data actions needed for downgrade
   */
  private async analyzeDataActions(companyId: number, currentPlan: any, targetPlan: any): Promise<DataAction[]> {
    try {
      const actions: DataAction[] = [];


      const [userCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.companyId, companyId));

      if (userCount.count > targetPlan.maxUsers) {
        actions.push({
          type: 'deactivate',
          resource: 'users',
          count: userCount.count - targetPlan.maxUsers,
          details: `${userCount.count - targetPlan.maxUsers} users will be deactivated`
        });
      }


      const [contactCount] = await db
        .select({ count: count() })
        .from(contacts)
        .where(eq(contacts.companyId, companyId));

      if (contactCount.count > targetPlan.maxContacts) {
        actions.push({
          type: 'archive',
          resource: 'contacts',
          count: contactCount.count - targetPlan.maxContacts,
          details: `${contactCount.count - targetPlan.maxContacts} contacts will be archived`
        });
      }


      const [channelCount] = await db
        .select({ count: count() })
        .from(channelConnections)
        .where(eq(channelConnections.companyId, companyId));

      if (channelCount.count > targetPlan.maxChannels) {
        actions.push({
          type: 'deactivate',
          resource: 'channels',
          count: channelCount.count - targetPlan.maxChannels,
          details: `${channelCount.count - targetPlan.maxChannels} channel connections will be deactivated`
        });
      }


      const [flowCount] = await db
        .select({ count: count() })
        .from(flows)
        .where(eq(flows.companyId, companyId));

      if (flowCount.count > targetPlan.maxFlows) {
        actions.push({
          type: 'deactivate',
          resource: 'flows',
          count: flowCount.count - targetPlan.maxFlows,
          details: `${flowCount.count - targetPlan.maxFlows} flows will be deactivated`
        });
      }


      const [campaignCount] = await db
        .select({ count: count() })
        .from(campaigns)
        .where(eq(campaigns.companyId, companyId));

      if (campaignCount.count > targetPlan.maxCampaigns) {
        actions.push({
          type: 'deactivate',
          resource: 'campaigns',
          count: campaignCount.count - targetPlan.maxCampaigns,
          details: `${campaignCount.count - targetPlan.maxCampaigns} campaigns will be deactivated`
        });
      }

      return actions;

    } catch (error) {
      logger.error('plan-downgrade', 'Error analyzing data actions:', error);
      return [];
    }
  }

  /**
   * Execute data actions for downgrade
   */
  private async executeDataActions(
    companyId: number, 
    actions: DataAction[], 
    preserveData: boolean
  ): Promise<DataAction[]> {
    try {
      const executedActions: DataAction[] = [];

      for (const action of actions) {
        try {
          switch (action.resource) {
            case 'users':
              await this.handleUserDowngrade(companyId, action.count, preserveData);
              break;
            case 'contacts':
              await this.handleContactDowngrade(companyId, action.count, preserveData);
              break;
            case 'channels':
              await this.handleChannelDowngrade(companyId, action.count, preserveData);
              break;
            case 'flows':
              await this.handleFlowDowngrade(companyId, action.count, preserveData);
              break;
            case 'campaigns':
              await this.handleCampaignDowngrade(companyId, action.count, preserveData);
              break;
          }
          executedActions.push(action);
        } catch (error) {
          logger.error('plan-downgrade', `Error executing action for ${action.resource}:`, error);
        }
      }

      return executedActions;

    } catch (error) {
      logger.error('plan-downgrade', 'Error executing data actions:', error);
      return [];
    }
  }

  /**
   * Handle user downgrade
   */
  private async handleUserDowngrade(companyId: number, excessCount: number, preserveData: boolean): Promise<void> {
    try {

      const usersToDeactivate = await db
        .select()
        .from(users)
        .where(eq(users.companyId, companyId))
        .orderBy(asc(users.createdAt))
        .limit(excessCount);

      for (const user of usersToDeactivate) {
        if (preserveData) {


          logger.info('plan-downgrade', `Would deactivate user ${user.id} for downgrade`);
        } else {

          await db.delete(users).where(eq(users.id, user.id));
        }
      }

      logger.info('plan-downgrade', `Processed ${usersToDeactivate.length} users for downgrade`);

    } catch (error) {
      logger.error('plan-downgrade', 'Error handling user downgrade:', error);
      throw error;
    }
  }

  /**
   * Handle contact downgrade
   */
  private async handleContactDowngrade(companyId: number, excessCount: number, preserveData: boolean): Promise<void> {
    try {

      const contactsToArchive = await db
        .select()
        .from(contacts)
        .where(eq(contacts.companyId, companyId))
        .orderBy(asc(contacts.createdAt))
        .limit(excessCount);

      for (const contact of contactsToArchive) {
        if (preserveData) {

          await db
            .update(contacts)
            .set({ isActive: false })
            .where(eq(contacts.id, contact.id));
        } else {

          await db.delete(contacts).where(eq(contacts.id, contact.id));
        }
      }

      logger.info('plan-downgrade', `Processed ${contactsToArchive.length} contacts for downgrade`);

    } catch (error) {
      logger.error('plan-downgrade', 'Error handling contact downgrade:', error);
      throw error;
    }
  }

  /**
   * Handle channel downgrade
   */
  private async handleChannelDowngrade(companyId: number, excessCount: number, preserveData: boolean): Promise<void> {
    try {

      const channelsToDeactivate = await db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.companyId, companyId))
        .orderBy(asc(channelConnections.createdAt))
        .limit(excessCount);

      for (const channel of channelsToDeactivate) {
        if (preserveData) {


          logger.info('plan-downgrade', `Would deactivate channel connection ${channel.id} for downgrade`);
        } else {

          await db.delete(channelConnections).where(eq(channelConnections.id, channel.id));
        }
      }

      logger.info('plan-downgrade', `Processed ${channelsToDeactivate.length} channel connections for downgrade`);

    } catch (error) {
      logger.error('plan-downgrade', 'Error handling channel downgrade:', error);
      throw error;
    }
  }

  /**
   * Handle flow downgrade
   */
  private async handleFlowDowngrade(companyId: number, excessCount: number, preserveData: boolean): Promise<void> {
    try {

      const flowsToDeactivate = await db
        .select()
        .from(flows)
        .where(eq(flows.companyId, companyId))
        .orderBy(asc(flows.createdAt))
        .limit(excessCount);

      for (const flow of flowsToDeactivate) {
        if (preserveData) {


          logger.info('plan-downgrade', `Would deactivate flow ${flow.id} for downgrade`);
        } else {

          await db.delete(flows).where(eq(flows.id, flow.id));
        }
      }

      logger.info('plan-downgrade', `Processed ${flowsToDeactivate.length} flows for downgrade`);

    } catch (error) {
      logger.error('plan-downgrade', 'Error handling flow downgrade:', error);
      throw error;
    }
  }

  /**
   * Handle campaign downgrade
   */
  private async handleCampaignDowngrade(companyId: number, excessCount: number, preserveData: boolean): Promise<void> {
    try {

      const campaignsToDeactivate = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.companyId, companyId),
            eq(campaigns.status, 'running')
          )
        )
        .orderBy(asc(campaigns.createdAt))
        .limit(excessCount);

      for (const campaign of campaignsToDeactivate) {
        await db
          .update(campaigns)
          .set({ status: 'paused' })
          .where(eq(campaigns.id, campaign.id));
      }

      logger.info('plan-downgrade', `Paused ${campaignsToDeactivate.length} campaigns for downgrade`);

    } catch (error) {
      logger.error('plan-downgrade', 'Error handling campaign downgrade:', error);
      throw error;
    }
  }

  /**
   * Update usage limits for new plan
   */
  private async updateUsageLimits(companyId: number, targetPlan: any): Promise<void> {
    try {
      await usageTrackingService.initializeUsageTracking(companyId);
      logger.info('plan-downgrade', `Updated usage limits for company ${companyId}`);
    } catch (error) {
      logger.error('plan-downgrade', 'Error updating usage limits:', error);
      throw error;
    }
  }

  /**
   * Count affected users
   */
  private async countAffectedUsers(companyId: number, targetPlan: any): Promise<number> {
    try {
      const [userCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.companyId, companyId));

      return Math.max(0, userCount.count - targetPlan.maxUsers);
    } catch (error) {
      logger.error('plan-downgrade', 'Error counting affected users:', error);
      return 0;
    }
  }

  /**
   * Notify users of downgrade
   */
  private async notifyUsersOfDowngrade(
    companyId: number, 
    preview: DowngradePreview, 
    gracePeriodDays: number
  ): Promise<void> {
    try {
      const notificationData: InsertSubscriptionNotification = {
        companyId,
        notificationType: 'plan_downgraded',
        scheduledFor: new Date(),
        notificationData: {
          fromPlan: preview.currentPlan.name,
          toPlan: preview.targetPlan.name,
          restrictedFeatures: preview.restrictedFeatures,
          dataActions: preview.dataActions,
          gracePeriodDays
        },
        status: 'pending'
      };

      await db.insert(subscriptionNotifications).values(notificationData);

    } catch (error) {
      logger.error('plan-downgrade', 'Error notifying users of downgrade:', error);
      throw error;
    }
  }
}

export const planDowngradeService = new PlanDowngradeService();
