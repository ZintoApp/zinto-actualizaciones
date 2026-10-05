import { assertAppSumoAccess } from './appsumo-policy';
import { validateScheduledMedia, prepareScheduledMedia } from './scheduled-media-policy';
import { storage } from '../storage';
import { eq, and, lte, gte, desc, asc, sql, inArray } from 'drizzle-orm';
import { scheduledMessages } from '../../shared/schema';
import type { ChannelConnection } from '../../shared/schema';

export interface ScheduledMessageData {
  companyId: number;
  conversationId: number;
  channelId: number;
  channelType: string;
  content: string;
  messageType?: string;
  mediaUrl?: string;
  mediaFilePath?: string;
  mediaType?: string;
  caption?: string;
  scheduledFor: Date;
  timezone?: string;
  metadata?: any;
  createdBy: number;
}

export class ScheduledMessageService {
  /**
   * Create a new scheduled message
   */
  static async createScheduledMessage(data: ScheduledMessageData) {
    if (data.messageType === 'media') data.mediaFilePath = await validateScheduledMedia(data, true);
    const scheduledMessage = await storage.db.insert(scheduledMessages).values({
      companyId: data.companyId,
      conversationId: data.conversationId,
      channelId: data.channelId,
      channelType: data.channelType,
      content: data.content,
      messageType: data.messageType || 'text',
      mediaUrl: data.mediaUrl,
      mediaFilePath: data.mediaFilePath,
      mediaType: data.mediaType,
      caption: data.caption,
      scheduledFor: data.scheduledFor,
      timezone: data.timezone || 'UTC',
      metadata: data.metadata || {},
      createdBy: data.createdBy,
      status: 'pending'
    }).returning();


    return scheduledMessage[0];
  }

  /**
   * Get scheduled messages that are ready to be sent
   */
  static async getMessagesToSend(limit: number = 100) {
    const now = new Date();
    
    const messages = await storage.db
      .select()
      .from(scheduledMessages)
      .where(
        and(
          eq(scheduledMessages.status, 'pending'),
          lte(scheduledMessages.scheduledFor, now)
        )
      )
      .orderBy(asc(scheduledMessages.scheduledFor))
      .limit(limit);

    return messages;
  }

  /**
   * Get scheduled messages for a conversation
   */
  static async getScheduledMessagesForConversation(conversationId: number, companyId: number) {
    const messages = await storage.db
      .select()
      .from(scheduledMessages)
      .where(
        and(
          eq(scheduledMessages.conversationId, conversationId),
          eq(scheduledMessages.companyId, companyId)
        )
      )
      .orderBy(desc(scheduledMessages.scheduledFor));

    return messages;
  }

  /**
   * Update scheduled message status
   */
  static async updateStatus(id: number, status: 'pending' | 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled', errorMessage?: string) {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (status === 'processing') {
      updateData.lastAttemptAt = new Date();
      updateData.attempts = sql`${scheduledMessages.attempts} + 1`;
    } else if (status === 'sent') {
      updateData.sentAt = new Date();
    } else if (status === 'failed') {
      updateData.failedAt = new Date();
      updateData.errorMessage = errorMessage;
    }

    const result = await storage.db
      .update(scheduledMessages)
      .set(updateData)
      .where(eq(scheduledMessages.id, id))
      .returning();

    return result[0];
  }

  /**
   * Cancel a scheduled message
   */
  static async cancelScheduledMessage(id: number, companyId: number) {
    const result = await storage.db
      .update(scheduledMessages)
      .set({
        status: 'cancelled',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(scheduledMessages.id, id),
          eq(scheduledMessages.companyId, companyId),
          inArray(scheduledMessages.status, ['pending', 'scheduled'])
        )
      )
      .returning();

    if (result.length > 0) {

    }

    return result[0];
  }

  /**
   * Delete a scheduled message
   */
  static async deleteScheduledMessage(id: number, companyId: number) {
    const result = await storage.db
      .delete(scheduledMessages)
      .where(
        and(
          eq(scheduledMessages.id, id),
          eq(scheduledMessages.companyId, companyId)
        )
      )
      .returning();

    if (result.length > 0) {

    }

    return result[0];
  }

  /**
   * Process a scheduled message (send it)
   */
  static async processScheduledMessage(scheduledMessage: any) {
    try {

      if (scheduledMessage.status !== 'processing') {
        await this.updateStatus(scheduledMessage.id, 'processing');
      }


      const conversation = await storage.getConversation(scheduledMessage.conversationId);
      const channelConnection = await storage.getChannelConnection(scheduledMessage.channelId);

      if (!conversation || !channelConnection) {
        throw new Error('Conversation or channel connection not found');
      }


      await assertAppSumoAccess(channelConnection.companyId ?? conversation.companyId);
      const contact = await storage.getContact(conversation.contactId!);
      if (!contact) {
        throw new Error('Contact not found');
      }


      let result;
      




      
      if (scheduledMessage.messageType === 'media' && (scheduledMessage.mediaUrl || scheduledMessage.mediaFilePath)) {
        Object.assign(scheduledMessage, await prepareScheduledMedia({ ...scheduledMessage, companyId: conversation.companyId, channelType: conversation.channelType }));


        switch (scheduledMessage.channelType) {
          case 'whatsapp':
          case 'whatsapp_unofficial':

            const fs = await import('fs');
            const path = await import('path');
            
            const mediaFilePath = scheduledMessage.mediaFilePath;
            

            
            

            const stats = await fs.promises.stat(mediaFilePath);
            if (stats.size === 0) {
              throw new Error('Media file is empty');
            }

            
            const whatsAppService = await import('./channels/whatsapp');
            result = await whatsAppService.sendMedia(
              scheduledMessage.channelId,
              scheduledMessage.createdBy,
              (contact.phone || contact.identifier || '').toString(),
              scheduledMessage.mediaType || 'document',
              mediaFilePath,
              scheduledMessage.content, // caption
              scheduledMessage.metadata?.fileName || 'media',
              false,
              scheduledMessage.conversationId
            );
            

            await new Promise(resolve => setTimeout(resolve, 2000));
            

            try {
              await fs.promises.unlink(mediaFilePath);

            } catch (cleanupError) {
              console.warn('Failed to clean up scheduled media file:', cleanupError);
            }
            break;

          case 'whatsapp_official':
            const whatsAppOfficialService = await import('./channels/whatsapp-official');
            result = await whatsAppOfficialService.sendWhatsAppBusinessMediaMessage(
              scheduledMessage.channelId,
              scheduledMessage.createdBy,
              channelConnection.companyId!,
              (contact.phone || contact.identifier || '').toString(),
              scheduledMessage.mediaType || 'document',
              scheduledMessage.mediaUrl,
              scheduledMessage.content, // caption
              scheduledMessage.metadata?.fileName || 'media',
              scheduledMessage.metadata?.mimeType || 'application/octet-stream',
              false
            );
            break;

          case 'instagram':
            const instagramService = await import('./channels/instagram');
            result = await instagramService.sendMedia(
              scheduledMessage.channelId,
              contact.identifier || '',
              scheduledMessage.mediaUrl,
              scheduledMessage.mediaType === 'document' ? 'file' : scheduledMessage.mediaType || 'image',
              scheduledMessage.content, // caption
              scheduledMessage.createdBy,
              undefined,
              scheduledMessage.mediaFilePath
            );
            break;

          case 'messenger':

            const fs2 = await import('fs');
            const path2 = await import('path');
            
            const mediaFilePath2 = scheduledMessage.mediaFilePath;
            

            
            

            const stats2 = await fs2.promises.stat(mediaFilePath2);
            if (stats2.size === 0) {
              throw new Error('Media file is empty');
            }

            
            const { sendMessengerMediaMessage } = await import('./channels/messenger');
            result = await sendMessengerMediaMessage(
              scheduledMessage.channelId,
              channelConnection.userId,
              contact.identifier || '',
              mediaFilePath2,
              scheduledMessage.mediaType || 'file'
            );
            if (result && typeof result === 'object' && 'success' in result && result.success === false) {
              const hint =
                'reconnectPath' in result && (result as any).reconnectPath
                  ? ` Manual recovery: POST ${(result as any).reconnectPath}`
                  : '';
              throw new Error(((result as any).error || 'Messenger media send failed') + hint);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            

            try {
              await fs2.promises.unlink(mediaFilePath2);

            } catch (cleanupError) {
              console.warn('Failed to clean up scheduled media file:', cleanupError);
            }
            break;

          default:
            throw new Error(`Media messages not supported for channel type: ${scheduledMessage.channelType}`);
        }
      } else {


        switch (scheduledMessage.channelType) {
          case 'whatsapp':
          case 'whatsapp_unofficial':
            const whatsAppService = await import('./channels/whatsapp');
            result = await whatsAppService.sendMessage(
              scheduledMessage.channelId,
              scheduledMessage.createdBy,
              (contact.phone || contact.identifier || '').toString(),
              scheduledMessage.content
            );
            break;

          case 'whatsapp_official':
            const whatsAppOfficialService = await import('./channels/whatsapp-official');
            result = await whatsAppOfficialService.sendMessage(
              scheduledMessage.channelId,
              scheduledMessage.createdBy,
              channelConnection.companyId!,
              (contact.phone || contact.identifier || '').toString(),
              scheduledMessage.content
            );
            break;

          case 'instagram':
            const instagramService = await import('./channels/instagram');
            result = await instagramService.sendMessage(
              scheduledMessage.channelId,
              scheduledMessage.createdBy,
              channelConnection.companyId!,
              contact.identifier || '',
              scheduledMessage.content
            );
            break;

          case 'messenger': {
            const { sendMessage: messengerInboxSend } = await import('./channels/messenger');
            result = await messengerInboxSend(
              scheduledMessage.channelId,
              channelConnection.userId,
              channelConnection.companyId!,
              contact.identifier || '',
              scheduledMessage.content
            );
            break;
          }

          case 'email':
            const emailService = await import('./channels/email');
            result = await emailService.sendMessage(
              scheduledMessage.channelId,
              scheduledMessage.createdBy,
              (contact.email || contact.identifier || '').toString(),
              scheduledMessage.content, // subject
              scheduledMessage.content, // content
              {} // options
            );
            break;

          default:
            throw new Error(`Unsupported channel type: ${scheduledMessage.channelType}`);
        }
      }


        await this.updateStatus(scheduledMessage.id, 'sent');

        return result;
    } catch (error: any) {
      console.error(`❌ [SCHEDULED MESSAGE] Failed to process scheduled message ${scheduledMessage.id}:`, error);
      

      await this.updateStatus(scheduledMessage.id, 'failed', error.message);
      
      throw error;
    }
  }
}
