import { assertAppSumoAccess } from './appsumo-policy';
import { storage } from '../storage';
import whatsAppService from './channels/whatsapp';
import { EventEmitter } from 'events';
import { smartWebSocketBroadcaster } from '../utils/smart-websocket-broadcaster';

interface ScheduledFollowUp {
  id: number;
  scheduleId: string;
  sessionId: string | null;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId: number | null;
  nodeId: string;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
  messageContent: string | null;
  mediaUrl: string | null;
  caption: string | null;
  templateId: number | null;
  triggerEvent: string;
  triggerNodeId: string | null;
  delayAmount: number | null;
  delayUnit: string | null;
  scheduledFor: Date | null;
  specificDatetime: Date | null;
  timezone: string | null;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'expired';
  sentAt: Date | null;
  failedReason: string | null;
  retryCount: number;
  maxRetries: number;
  channelType: string;
  channelConnectionId: number | null;
  variables: any;
  executionContext: any;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  cancelOnUserResponse?: boolean | null;
  cancelCondition?: string | null;
  monitoringStartedAt?: Date | null;
  lastUserMessageAt?: Date | null;
  processingClaimId?: string | null;
  dispatchStartedAt?: Date | null;
}

/**
 * Follow-up Scheduler Service
 * Handles the execution of scheduled follow-up messages
 */
class FollowUpScheduler extends EventEmitter {
  private static instance: FollowUpScheduler;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();

    this.setMaxListeners(50);
  }

  static getInstance(): FollowUpScheduler {
    if (!FollowUpScheduler.instance) {
      FollowUpScheduler.instance = new FollowUpScheduler();
    }
    return FollowUpScheduler.instance;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      
      return;
    }

    this.isRunning = true;
    
    

    this.processScheduledFollowUps();
    this.intervalId = setInterval(() => {
      this.processScheduledFollowUps();
    }, this.POLL_INTERVAL);

    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    
    this.emit('stopped');
  }

  /**
   * Process scheduled follow-ups that are due
   */
  private async processScheduledFollowUps(): Promise<void> {
    try {
      const dueFollowUps = await storage.claimDueFollowUps(100);

      if (dueFollowUps.length === 0) {
        
        return;
      }

      


      dueFollowUps.forEach((followUp: any) => {
        const timezoneInfo = followUp.timezone ? ` (timezone: ${followUp.timezone})` : '';
        
      });

      for (const followUp of dueFollowUps) {
        await this.executeFollowUp(followUp as unknown as ScheduledFollowUp);
      }
    } catch (error) {
      console.error('Error processing scheduled follow-ups:', error);
      this.emit('error', error);
    }
  }

  /**
   * Execute a single follow-up
   */
  private async executeFollowUp(followUp: ScheduledFollowUp): Promise<void> {
    const startTime = Date.now();
    
    try {
      const rowNow = await storage.getFollowUpSchedule(followUp.scheduleId) as ScheduledFollowUp | null;
      if (rowNow?.status === 'cancelled') {
        await this.skipFollowUpCancelled(followUp, startTime, rowNow);
        return;
      }

      const contact = await storage.getContact(followUp.contactId);
      const conversation = await storage.getConversation(followUp.conversationId);
      
      if (!contact || !conversation) {
        await this.markFollowUpFailed(followUp, 'Contact or conversation not found');
        return;
      }


      let channelConnection = null;
      if (followUp.channelConnectionId) {
        channelConnection = await storage.getChannelConnection(followUp.channelConnectionId);
      }

      if (!channelConnection) {
        await this.markFollowUpFailed(followUp, 'Channel connection not found');
        return;
      }

      const latestBeforeSend = await storage.getFollowUpSchedule(followUp.scheduleId) as ScheduledFollowUp | null;
      await assertAppSumoAccess(channelConnection.companyId ?? followUp.companyId);
      if (latestBeforeSend?.status === 'cancelled') {
        await storage.updateFollowUpSchedule(followUp.scheduleId, {
          processingLeaseExpiresAt: null,
          processingClaimId: null,
          dispatchStartedAt: null
        });
        await this.skipFollowUpCancelled(followUp, startTime, latestBeforeSend);
        return;
      }

      const claimId = followUp.processingClaimId;
      if (!claimId) {
        await this.markFollowUpFailed(followUp, 'Missing processing claim id');
        return;
      }

      const processedContent = this.replaceVariables(
        followUp.messageContent || '',
        followUp.variables,
        contact
      );

      const processedCaption = followUp.caption ? this.replaceVariables(
        followUp.caption,
        followUp.variables,
        contact
      ) : '';

      const began = (await storage.beginFollowUpDispatch(
        followUp.scheduleId,
        claimId
      )) as unknown[] | null;
      if (!Array.isArray(began) || began.length === 0) {
        const latest = (await storage.getFollowUpSchedule(followUp.scheduleId)) as ScheduledFollowUp | null;
        if (latest?.status === 'cancelled') {
          await this.skipFollowUpCancelled(followUp, startTime, latest);
          return;
        }
        await this.markFollowUpFailed(followUp, 'Could not begin dispatch (lease lost or race)');
        return;
      }

      let messageId: string | null = null;
      
      if (followUp.channelType === 'whatsapp' || followUp.channelType === 'whatsapp_unofficial') {
        if (followUp.messageType === 'text') {
          const textResult = await whatsAppService.sendMessage(
            channelConnection.id,
            channelConnection.userId,
            contact.identifier!,
            processedContent
          );
          messageId = textResult?.id?.toString() || null;
        } else {

          const mediaType = followUp.messageType;
          if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio' || mediaType === 'document') {
            const mediaResult = await whatsAppService.sendMedia(
              channelConnection.id,
              channelConnection.userId,
              contact.identifier!,
              mediaType,
              followUp.mediaUrl!,
              processedCaption
            );
            messageId = mediaResult?.id?.toString() || null;
          } else {
            throw new Error(`Unsupported media type: ${mediaType}`);
          }
        }
      } else if (followUp.channelType === 'whatsapp_official') {
        if (followUp.messageType !== 'text') {
          throw new Error(`Unsupported message type for WhatsApp Official follow-up: ${followUp.messageType}`);
        }
        const whatsAppOfficialService = await import('./channels/whatsapp-official');
        const officialResult = await whatsAppOfficialService.default.sendMessage(
          channelConnection.id,
          channelConnection.userId,
          channelConnection.companyId || followUp.companyId || 0,
          contact.identifier!,
          processedContent,
          true
        );
        messageId = officialResult?.id?.toString() || null;
      } else if (followUp.channelType === 'instagram') {
        if (followUp.messageType !== 'text') {
          throw new Error(`Unsupported message type for Instagram follow-up: ${followUp.messageType}`);
        }
        const instagramService = (await import('./channels/instagram')).default;
        const igResult = await instagramService.sendMessage(
          channelConnection.id,
          contact.identifier!,
          processedContent,
          channelConnection.userId
        );
        if (!igResult.success) {
          throw new Error(igResult.error || 'Failed to send Instagram message');
        }
        messageId = igResult.messageId?.toString() || null;
      } else if (followUp.channelType === 'messenger') {
        if (followUp.messageType !== 'text') {
          throw new Error(`Unsupported message type for Messenger follow-up: ${followUp.messageType}`);
        }
        const messengerService = (await import('./channels/messenger')).default;
        const msResult = await messengerService.sendMessage(
          channelConnection.id,
          contact.identifier!,
          processedContent,
          channelConnection.userId
        );
        if (!msResult.success) {
          throw new Error(msResult.error || 'Failed to send Messenger message');
        }
        messageId = msResult.messageId?.toString() || null;
      } else if (followUp.channelType === 'webchat') {
        if (followUp.messageType !== 'text') {
          throw new Error(`Unsupported message type for WebChat follow-up: ${followUp.messageType}`);
        }
        const webchatService = (await import('./channels/webchat')).default;
        const sessionId = await webchatService.resolveSessionIdForContact(
          channelConnection.id,
          contact
        );
        if (!sessionId) {
          throw new Error('No WebChat session found for contact');
        }
        const wcResult = await webchatService.sendMessage(
          channelConnection.id,
          sessionId,
          processedContent
        );
        messageId = wcResult?.id?.toString() || null;
      } else {

        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          channelType: followUp.channelType,
          type: followUp.messageType,
          content: followUp.messageType === 'text' ? processedContent : processedCaption,
          direction: 'outbound' as const,
          status: 'sent' as const,
          mediaUrl: followUp.messageType === 'text' ? null : followUp.mediaUrl,
          timestamp: new Date()
        };

        const message = await storage.createMessage(insertMessage);
        messageId = message.id.toString();
      }

      let completed = (await storage.completeFollowUpAsSent(followUp.scheduleId, claimId)) as unknown[] | null;
      for (let attempt = 0; attempt < 3 && (!Array.isArray(completed) || completed.length === 0); attempt++) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        completed = (await storage.completeFollowUpAsSent(followUp.scheduleId, claimId)) as unknown[] | null;
      }
      if (!Array.isArray(completed) || completed.length === 0) {
        console.error(
          `Follow-up ${followUp.scheduleId}: outbound send finished but CAS to sent failed; possible duplicate if retried`
        );
      }

      await storage.createFollowUpExecutionLog({
        scheduleId: followUp.scheduleId,
        executionAttempt: followUp.retryCount + 1,
        status: 'success',
        messageId,
        executionDurationMs: Date.now() - startTime
      });

      
      this.emit('followUpExecuted', { scheduleId: followUp.scheduleId, messageId });
      smartWebSocketBroadcaster.broadcast({
        type: 'followUpExecuted',
        data: { scheduleId: followUp.scheduleId, conversationId: followUp.conversationId, messageId },
        conversationId: followUp.conversationId,
        companyId: followUp.companyId ?? undefined,
      });

    } catch (error) {
      console.error(`Error executing follow-up ${followUp.scheduleId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      

      if (followUp.retryCount < followUp.maxRetries) {
        await this.scheduleRetry(followUp, errorMessage);
      } else {
        await this.markFollowUpFailed(followUp, errorMessage);
      }


      await storage.createFollowUpExecutionLog({
        scheduleId: followUp.scheduleId,
        executionAttempt: followUp.retryCount + 1,
        status: 'failed',
        errorMessage,
        executionDurationMs: Date.now() - startTime
      });

      this.emit('followUpFailed', { 
        scheduleId: followUp.scheduleId, 
        error: errorMessage,
        willRetry: followUp.retryCount < followUp.maxRetries
      });
    }
  }

  private async skipFollowUpCancelled(
    followUp: ScheduledFollowUp,
    startTime: number,
    row?: ScheduledFollowUp | null
  ): Promise<void> {
    const cancelCondition = (row?.cancelCondition ?? followUp.cancelCondition) || 'unknown';
    const cancelledAt = row?.updatedAt ?? followUp.updatedAt;
    const cancellationReason =
      row?.failedReason || followUp.failedReason || 'Follow-up was cancelled before execution';

    console.log(`Follow-up ${followUp.scheduleId} was cancelled, skipping execution`, {
      cancelCondition,
      cancelledAt,
      reason: cancellationReason
    });

    await storage.createFollowUpExecutionLog({
      scheduleId: followUp.scheduleId,
      executionAttempt: followUp.retryCount + 1,
      status: 'skipped',
      errorMessage: cancellationReason,
      executionDurationMs: Date.now() - startTime,
      executedAt: new Date()
    });

    this.emit('followUpSkipped', {
      scheduleId: followUp.scheduleId,
      reason: 'cancelled',
      cancelCondition: cancelCondition !== 'unknown' ? cancelCondition : undefined
    });
    smartWebSocketBroadcaster.broadcast({
      type: 'followUpSkipped',
      data: {
        scheduleId: followUp.scheduleId,
        conversationId: followUp.conversationId,
        reason: 'cancelled',
        cancelCondition: cancelCondition !== 'unknown' ? cancelCondition : undefined
      },
      conversationId: followUp.conversationId,
      companyId: followUp.companyId ?? undefined
    });
  }

  /**
   * Schedule a retry for a failed follow-up
   */
  private async scheduleRetry(followUp: ScheduledFollowUp, errorMessage: string): Promise<void> {
    const retryDelay = Math.min(Math.pow(2, followUp.retryCount) * 60 * 1000, 30 * 60 * 1000); // Exponential backoff, max 30 minutes
    const nextAttempt = new Date(Date.now() + retryDelay);

    await storage.updateFollowUpSchedule(followUp.scheduleId, {
      status: 'scheduled',
      scheduledFor: nextAttempt,
      retryCount: followUp.retryCount + 1,
      failedReason: errorMessage,
      processingLeaseExpiresAt: null,
      processingClaimId: null,
      dispatchStartedAt: null
    });

    
  }

  /**
   * Mark a follow-up as failed
   */
  private async markFollowUpFailed(followUp: ScheduledFollowUp, errorMessage: string): Promise<void> {
    await storage.updateFollowUpSchedule(followUp.scheduleId, {
      status: 'failed',
      failedReason: errorMessage,
      processingLeaseExpiresAt: null,
      processingClaimId: null,
      dispatchStartedAt: null
    });

    
  }

  /**
   * Replace variables in text content
   */
  private replaceVariables(content: string, variables: any, contact: any): string {
    if (!content) return '';

    let processedContent = content;


    if (contact) {
      processedContent = processedContent.replace(/\{\{contact\.name\}\}/g, contact.name || '');
      processedContent = processedContent.replace(/\{\{contact\.phone\}\}/g, contact.phone || '');
      processedContent = processedContent.replace(/\{\{contact\.email\}\}/g, contact.email || '');
    }


    if (variables && typeof variables === 'object') {
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        processedContent = processedContent.replace(regex, String(value || ''));
      });
    }

    return processedContent;
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; pollInterval: number } {
    return {
      isRunning: this.isRunning,
      pollInterval: this.POLL_INTERVAL
    };
  }

  /**
   * Cancel a scheduled follow-up.
   * @param scheduleId - Schedule to cancel
   * @param options.skipBroadcast - If true, do not emit or broadcast (caller will send a single event, e.g. for manual cancel)
   */
  async cancelFollowUp(scheduleId: string, options?: { skipBroadcast?: boolean }): Promise<boolean> {
    try {
      const updatedRows = await storage.cancelFollowUpSchedule(scheduleId);
      const cancelled =
        Array.isArray(updatedRows) && (updatedRows as unknown[]).length > 0;
      if (!cancelled) {
        return false;
      }

      if (options?.skipBroadcast) {
        return true;
      }

      const schedule = await storage.getFollowUpSchedule(scheduleId) as ScheduledFollowUp | null;
      const conversationId = schedule?.conversationId;
      const companyId = schedule?.companyId ?? undefined;

      this.emit('followUpCancelled', { scheduleId });
      if (conversationId != null) {
        smartWebSocketBroadcaster.broadcast({
          type: 'followUpCancelled',
          data: { scheduleId, conversationId, reason: 'manual' },
          conversationId,
          companyId,
        });
      }
      return true;
    } catch (error) {
      console.error(`Error cancelling follow-up ${scheduleId}:`, error);
      return false;
    }
  }
}

export default FollowUpScheduler;
