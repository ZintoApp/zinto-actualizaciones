import { storage } from '../storage';
import { logger } from '../utils/logger';
import FollowUpScheduler from './follow-up-scheduler';
import { smartWebSocketBroadcaster } from '../utils/smart-websocket-broadcaster';
import type { Message } from '../../shared/schema';
import type { Contact } from '../../shared/schema';

interface CancellationMetadata {
  messageId: number;
  messageContent: string | null;
  cancelledAt: Date;
  cancelledBy: 'user_response';
}

/**
 * Follow-up Monitor Service
 * Monitors user messages and cancels follow-ups based on conditional cancellation rules
 */
class FollowUpMonitor {
  private static instance: FollowUpMonitor;

  private constructor() {}

  static getInstance(): FollowUpMonitor {
    if (!FollowUpMonitor.instance) {
      FollowUpMonitor.instance = new FollowUpMonitor();
    }
    return FollowUpMonitor.instance;
  }

  /**
   * Check and cancel follow-ups based on user response conditions
   * @param conversationId - The conversation ID
   * @param message - The inbound message that triggered the check
   * @param contact - The contact who sent the message
   * @returns Number of follow-ups cancelled
   */
  async checkAndCancelFollowUps(
    conversationId: number,
    message: Message,
    contact: Contact
  ): Promise<number> {
    try {
      // Validation checks
      if (!conversationId || conversationId <= 0) {
        logger.debug('follow-up-monitor', `Invalid conversationId: ${conversationId}`);
        return 0;
      }

      if (message.direction !== 'inbound') {
        logger.debug('follow-up-monitor', `Message is not inbound, skipping monitoring`);
        return 0;
      }

      // Get monitored follow-ups for this conversation
      const monitoredFollowUps = await storage.getActiveFollowUpsByConversation(
        conversationId,
        true
      );

      logger.debug(
        'follow-up-monitor',
        `Checking follow-ups for conversation ${conversationId}, found ${monitoredFollowUps.length} monitored`
      );

      if (monitoredFollowUps.length === 0) {
        return 0;
      }

      // Use message timestamp or current time for comparison
      const messageTimestamp = message.createdAt ? new Date(message.createdAt) : new Date();
      const now = new Date();

      let cancelledCount = 0;
      const followUpScheduler = FollowUpScheduler.getInstance();

      // Process each monitored follow-up to evaluate cancellation conditions
      const followUpsToCancel: Array<Record<string, unknown>> = [];
      const noResponseFollowUps: Array<Record<string, unknown>> = [];

      for (const followUp of monitoredFollowUps) {
        if (
          followUp.cancelOnUserResponse !== true ||
          (followUp.status !== 'scheduled' && followUp.status !== 'processing')
        ) {
          continue;
        }

        const scheduledFor = followUp.scheduledFor
          ? new Date(followUp.scheduledFor as string | Date)
          : null;
        const lastUserMessageAt = followUp.lastUserMessageAt
          ? new Date(followUp.lastUserMessageAt as string | Date)
          : null;
        const cancelCondition = followUp.cancelCondition as
          | 'any_message'
          | 'specific_topic'
          | 'none'
          | undefined;

        if (!scheduledFor) {
          // Skip follow-ups without scheduled time
          continue;
        }

        // Check for no-response scenario: scheduled time has passed without user response
        if (scheduledFor < now) {
          // Scheduled time has passed
          // Check if there was no user response before the scheduled time
          const hadResponseBeforeScheduled =
            (lastUserMessageAt && lastUserMessageAt < scheduledFor) ||
            messageTimestamp < scheduledFor;

          // No-response scenario: scheduled time passed and no user response occurred before it
          if (!hadResponseBeforeScheduled) {
            // No user response before scheduled time - this is a no-response scenario
            noResponseFollowUps.push(followUp);
            logger.debug(
              'follow-up-monitor',
              `Follow-up ${followUp.scheduleId as string} detected as no-response: scheduledFor=${scheduledFor.toISOString()}, lastUserMessageAt=${lastUserMessageAt?.toISOString() ?? 'null'}, messageTimestamp=${messageTimestamp.toISOString()}`
            );
          }
        }

        // Check cancellation conditions based on cancelCondition and timing
        if (cancelCondition === 'any_message') {
          const claimed = followUp.status === 'processing';
          const dispatching = followUp.dispatchStartedAt != null;
          if (dispatching) {
            logger.debug(
              'follow-up-monitor',
              `Follow-up ${followUp.scheduleId as string} not cancelled: outbound dispatch already started`
            );
          } else if (claimed || messageTimestamp < scheduledFor) {
            followUpsToCancel.push(followUp);
            logger.debug(
              'follow-up-monitor',
              claimed
                ? `Follow-up ${followUp.scheduleId as string} will be cancelled while claimed (before send completes)`
                : `Follow-up ${followUp.scheduleId as string} will be cancelled: user responded at ${messageTimestamp.toISOString()} before scheduled time ${scheduledFor.toISOString()}`
            );
          } else {
            logger.debug(
              'follow-up-monitor',
              `Follow-up ${followUp.scheduleId as string} not cancelled: user responded at ${messageTimestamp.toISOString()} after scheduled time ${scheduledFor.toISOString()}`
            );
          }
        } else if (cancelCondition === 'specific_topic') {
          // Reserved for future implementation - skip for now
          logger.debug(
            'follow-up-monitor',
            `Skipping follow-up ${followUp.scheduleId as string} with condition 'specific_topic' (not yet implemented)`
          );
        }
        // 'none' condition is skipped (no cancellation)
      }

      // Cancel follow-ups with 'any_message' condition that meet timing requirements
      // Cancel individually to ensure only follow-ups meeting timing criteria are cancelled
      for (const followUp of followUpsToCancel) {
        try {
          const scheduleId = followUp.scheduleId as string;
          const cancelCondition = followUp.cancelCondition as 'any_message';

          const cancelledRows = await storage.cancelFollowUpSchedule(scheduleId);
          if (!Array.isArray(cancelledRows) || cancelledRows.length === 0) {
            continue;
          }

          // Create execution log entry
          const metadata: CancellationMetadata = {
            messageId: message.id,
            messageContent: message.content,
            cancelledAt: new Date(),
            cancelledBy: 'user_response'
          };

          try {
            await storage.createFollowUpExecutionLog({
              scheduleId,
              executionAttempt: 1,
              status: 'failed',
              errorMessage: `Cancelled by condition: ${cancelCondition}`,
              executedAt: new Date(),
              responseContent: JSON.stringify(metadata)
            });
          } catch (logError) {
            // Optional log; ignore errors
            logger.debug(
              'follow-up-monitor',
              `Failed to create execution log for cancelled follow-up ${scheduleId}`
            );
          }

          cancelledCount++;

          // Emit cancellation event
          followUpScheduler.emit('followUpCancelled', {
            scheduleId,
            reason: 'user_response',
            condition: cancelCondition,
            conversationId,
            messageId: message.id
          });
          const conversation = await storage.getConversation(conversationId);
          if (conversation) {
            smartWebSocketBroadcaster.broadcast({
              type: 'followUpCancelled',
              data: {
                scheduleId,
                conversationId,
                reason: 'user_response',
                condition: cancelCondition,
                messageId: message.id,
              },
              conversationId,
              companyId: conversation.companyId ?? undefined,
            });
          }
        } catch (error) {
          logger.error(
            'follow-up-monitor',
            `Error cancelling follow-up ${followUp.scheduleId as string}:`,
            error
          );
          // Continue processing other follow-ups
        }
      }

      // Handle no-response scenarios
      if (noResponseFollowUps.length > 0) {
        logger.debug(
          'follow-up-monitor',
          `Detected ${noResponseFollowUps.length} follow-up(s) as no-response scenarios for conversation ${conversationId}`
        );
        // Note: No-response handling can be extended here in the future
        // For now, we log the detection. The follow-ups will be processed by the scheduler
        // when their scheduled time arrives, or can be marked/processed differently if needed.
      }


      // Update monitoring timestamp for all monitored follow-ups (regardless of cancellation)
      for (const followUp of monitoredFollowUps) {
        try {
          const scheduleId = followUp.scheduleId as string;
          await storage.updateFollowUpMonitoring(scheduleId, new Date());
        } catch (error) {
          logger.error(
            'follow-up-monitor',
            `Error updating monitoring timestamp for follow-up ${followUp.scheduleId as string}:`,
            error
          );
          // Continue processing other follow-ups
        }
      }

      if (cancelledCount > 0) {
        logger.debug(
          'follow-up-monitor',
          `Cancelled ${cancelledCount} follow-ups for conversation ${conversationId} due to user response`
        );
      }

      return cancelledCount;
    } catch (error) {
      logger.error('follow-up-monitor', 'Error checking and cancelling follow-ups:', error);
      return 0; // Fail silently to not disrupt message flow
    }
  }
}

export default FollowUpMonitor;
