import { ScheduledMessageService } from './scheduled-message-service';
import { storage } from '../storage';

export class MessageScheduler {
  private static instance: MessageScheduler;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL = 30000; // Check every 30 seconds

  private constructor() {}

  static getInstance(): MessageScheduler {
    if (!MessageScheduler.instance) {
      MessageScheduler.instance = new MessageScheduler();
    }
    return MessageScheduler.instance;
  }

  /**
   * Start the message scheduler
   */
  start() {
    if (this.isRunning) {

      return;
    }


    this.isRunning = true;


    this.processScheduledMessages();


    this.intervalId = setInterval(() => {
      this.processScheduledMessages();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop the message scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }


    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Process scheduled messages that are ready to be sent
   */
  private async processScheduledMessages() {
    try {
      const messagesToSend = await storage.claimDueScheduledMessages(50);
      
      if (messagesToSend.length === 0) {
        return;
      }




      const concurrencyLimit = 5;
      const chunks = [];
      for (let i = 0; i < messagesToSend.length; i += concurrencyLimit) {
        chunks.push(messagesToSend.slice(i, i + concurrencyLimit));
      }

      for (const chunk of chunks) {
        await Promise.allSettled(
          chunk.map((message: any) => this.processMessage(message))
        );
      }
    } catch (error) {
      console.error('❌ [MESSAGE SCHEDULER] Error processing scheduled messages:', error);
    }
  }

  /**
   * Process a single scheduled message
   */
  private async processMessage(scheduledMessage: any) {
    try {
      await ScheduledMessageService.processScheduledMessage(scheduledMessage);
    } catch (error: any) {
      console.error(`❌ [MESSAGE SCHEDULER] Failed to process message ${scheduledMessage.id}:`, error);
      

      if (scheduledMessage.attempts >= scheduledMessage.maxAttempts) {
        await ScheduledMessageService.updateStatus(
          scheduledMessage.id, 
          'failed', 
          `Max attempts (${scheduledMessage.maxAttempts}) reached: ${error.message}`
        );
      }
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.CHECK_INTERVAL
    };
  }
}


const scheduler = MessageScheduler.getInstance();

export default scheduler;
