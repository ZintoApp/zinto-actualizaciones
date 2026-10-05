import { EventEmitter } from 'events';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import crypto from 'crypto';
import { storage } from '../../storage';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  Message,
  EmailConfig,
  InsertEmailAttachment,
  ChannelConnection
} from '@shared/schema';
import { logger } from '../../utils/logger';
import { broadcastToCompany } from '../../utils/websocket';
import { eventEmitterMonitor, setMaxListenersSafely } from '../../utils/event-emitter-monitor';
import { withContactInitialMessageMetadata } from './contact-initial-message-metadata';

type EmailProcessingContext = {
  isHistoryOrImport?: boolean;
};

const EMAIL_MEDIA_DIR = path.join(process.cwd(), 'uploads', 'email-attachments');
fsExtra.ensureDirSync(EMAIL_MEDIA_DIR);

const activeConnections = new Map<number, {
  imap: ImapFlow | null;
  smtp: nodemailer.Transporter | null;
  config: EmailConfig;
  polling: NodeJS.Timeout | null;
  status: 'active' | 'inactive' | 'error';
  lastActivity: Date;
  reconnectAttempts: number;
  isReconnecting: boolean;
}>();


const pollingIntervals = new Map<number, NodeJS.Timeout>();


const connectionHealthChecks = new Map<number, NodeJS.Timeout>();

const eventEmitter = new EventEmitter();
setMaxListenersSafely(eventEmitter, 0, 'email-service');
eventEmitterMonitor.register('email-service', eventEmitter);

/**
 * Email Channel Service
 * Provides IMAP/SMTP email integration following BotHivePlus channel patterns
 */

/**
 * Connect to email account using IMAP/SMTP
 */
export async function connectToEmail(connectionId: number, userId: number): Promise<boolean> {
  try {
    logger.info('email', `=== CONNECTING EMAIL CHANNEL ${connectionId} ===`);
    logger.info('email', `User ID: ${userId}`);

    const channelConnection = await storage.getChannelConnection(connectionId);
    if (!channelConnection) {
      logger.error('email', `❌ Channel connection ${connectionId} not found in database`);
      throw new Error(`Channel connection ${connectionId} not found`);
    }

    logger.info('email', `✅ Found channel connection: ${channelConnection.accountName} (Company: ${channelConnection.companyId})`);

    const emailConfig = await getEmailConfig(connectionId);
    if (!emailConfig) {
      logger.error('email', `❌ Email configuration not found for connection ${connectionId}`);
      logger.error('email', `This usually means the email channel was not properly configured. Please recreate the email channel.`);
      throw new Error(`Email configuration not found for connection ${connectionId}. Please recreate the email channel.`);
    }

    logger.info('email', `✅ Found email config for ${emailConfig.emailAddress}`);
    logger.debug('email', `IMAP: ${emailConfig.imapHost}:${emailConfig.imapPort} (secure: ${emailConfig.imapSecure})`);
    logger.debug('email', `SMTP: ${emailConfig.smtpHost}:${emailConfig.smtpPort} (secure: ${emailConfig.smtpSecure})`);

    logger.debug('email', `Creating IMAP client for ${emailConfig.imapHost}:${emailConfig.imapPort}`);
    const imapClient = new ImapFlow({
      host: emailConfig.imapHost,
      port: emailConfig.imapPort,
      secure: emailConfig.imapSecure || false,
      auth: {
        user: emailConfig.imapUsername,
        pass: await decryptPassword(emailConfig.imapPassword || '')
      },
      logger: false
    });

    logger.debug('email', `Creating SMTP transporter for ${emailConfig.smtpHost}:${emailConfig.smtpPort}`);
    const smtpTransporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure || false,
      auth: {
        user: emailConfig.smtpUsername,
        pass: await decryptPassword(emailConfig.smtpPassword || '')
      }
    } as any);

    logger.info('email', `Connecting to IMAP server for connection ${connectionId}`);
    await imapClient.connect();
    logger.info('email', `Successfully connected to IMAP server`);

    logger.info('email', `Verifying SMTP connection for connection ${connectionId}`);
    await smtpTransporter.verify();
    logger.info('email', `Successfully verified SMTP connection`);

    activeConnections.set(connectionId, {
      imap: imapClient,
      smtp: smtpTransporter,
      config: emailConfig,
      polling: null,
      status: 'active',
      lastActivity: new Date(),
      reconnectAttempts: 0,
      isReconnecting: false
    });

    logger.debug('email', `Setting up IMAP event listeners for connection ${connectionId}`);
    setupImapEventListeners(imapClient, connectionId, userId);


    logger.info('email', `Performing comprehensive initial email sync for connection ${connectionId}`);
    try {
      await performInitialEmailSync(connectionId, userId);
    } catch (error) {
      logger.warn('email', `Initial email sync failed for connection ${connectionId}:`, error);
    }


    logger.info('email', `Starting email polling for connection ${connectionId}`);
    await startEmailPollingForConnection(connectionId, userId);

    await updateConnectionStatus(connectionId, 'active');
    logger.info('email', `Successfully connected email channel ${connectionId} (${emailConfig.emailAddress})`);
    return true;

  } catch (error: any) {
    logger.error(`Failed to connect email channel ${connectionId}:`, error);
    await updateConnectionStatus(connectionId, 'error', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Disconnect from email account
 */
export async function disconnectFromEmail(connectionId: number): Promise<boolean> {
  try {
    const connection = activeConnections.get(connectionId);


    if (pollingIntervals.has(connectionId)) {
      clearInterval(pollingIntervals.get(connectionId)!);
      pollingIntervals.delete(connectionId);
      logger.info('email', `🛑 Stopped polling for connection ${connectionId}`);
    }


    stopConnectionHealthMonitoring(connectionId);

    if (!connection) {
      return true;
    }

    if (connection.polling) {
      clearInterval(connection.polling);
    }

    if (connection.imap) {
      await connection.imap.logout();
    }

    if (connection.smtp) {
      connection.smtp.close();
    }

    activeConnections.delete(connectionId);

    await updateConnectionStatus(connectionId, 'inactive');
    return true;

  } catch (error: any) {
    logger.error(`Error disconnecting email channel ${connectionId}:`, error);
    return false;
  }
}

/**
 * Send email message
 */
export async function sendMessage(
  connectionId: number,
  _userId: number,
  to: string,
  subject: string,
  content: string,
  options: {
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    isHtml?: boolean;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  } = {}
): Promise<Message> {
  try {

    let connection = activeConnections.get(connectionId);
    if (!connection || !connection.smtp) {
      logger.info('email', `Email connection ${connectionId} not active, attempting to establish connection`);


      try {
        const newConnection = await getOrCreatePersistentConnection(connectionId);
        if (!newConnection || !newConnection.smtp) {
          throw new Error(`Failed to establish email connection ${connectionId}`);
        }
        connection = newConnection;
        logger.info('email', `Successfully established email connection ${connectionId} for sending`);
      } catch (connectionError: any) {
        logger.error('email', `Failed to establish email connection ${connectionId}:`, connectionError);
        throw new Error(`Email connection ${connectionId} not available: ${connectionError.message}`);
      }
    }

    const channelConnection = await storage.getChannelConnection(connectionId);
    if (!channelConnection) {
      throw new Error(`Channel connection ${connectionId} not found`);
    }

    const mailOptions: any = {
      from: `${connection.config.displayName || connection.config.emailAddress} <${connection.config.emailAddress}>`,
      to: to,
      subject: subject,
      [options.isHtml ? 'html' : 'text']: content
    };

    if (options.cc?.length) mailOptions.cc = options.cc.join(', ');
    if (options.bcc?.length) mailOptions.bcc = options.bcc.join(', ');
    if (options.replyTo) mailOptions.replyTo = options.replyTo;
    if (options.inReplyTo) mailOptions.inReplyTo = options.inReplyTo;
    if (options.references) mailOptions.references = options.references;
    if (connection.config.signature) {
      const signature = `\n\n${connection.config.signature}`;
      if (options.isHtml) {
        mailOptions.html += signature.replace(/\n/g, '<br>');
      } else {
        mailOptions.text += signature;
      }
    }

    if (options.attachments?.length) {
      mailOptions.attachments = options.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType
      }));
    }

    if (!connection.smtp) {
      throw new Error(`SMTP connection not available for connection ${connectionId}`);
    }


    let info;
    let lastError;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!connection.smtp) {
          throw new Error(`SMTP connection not available for attempt ${attempt}`);
        }

        logger.debug('email', `Sending email attempt ${attempt}/${maxRetries} for connection ${connectionId}`);
        info = await connection.smtp.sendMail(mailOptions);
        logger.info('email', `✅ Email sent successfully on attempt ${attempt} for connection ${connectionId}`);


        connection.lastActivity = new Date();

        break; // Success, exit retry loop
      } catch (error: any) {
        lastError = error;
        logger.warn('email', `❌ Email send attempt ${attempt}/${maxRetries} failed for connection ${connectionId}:`, error.message);


        const isRetryableError = error.code === 'ESOCKET' ||
                                error.code === 'ECONNRESET' ||
                                error.code === 'ETIMEDOUT' ||
                                error.code === 'ENOTFOUND' ||
                                error.message?.includes('Connection closed');

        if (!isRetryableError || attempt === maxRetries) {

          throw error;
        }


        if (attempt < maxRetries) {
          logger.info('email', `🔄 Recreating SMTP connection for retry ${attempt + 1} on connection ${connectionId}`);
          try {

            connection.status = 'error';
            const newConnection = await getOrCreatePersistentConnection(connectionId);
            if (newConnection && newConnection.smtp) {
              connection = newConnection;
              logger.info('email', `✅ Fresh SMTP connection established for retry ${attempt + 1}`);
            }
          } catch (reconnectError) {
            logger.error('email', `Failed to recreate SMTP connection for retry:`, reconnectError);
          }


          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!info) {
      throw lastError || new Error('Failed to send email after all retry attempts');
    }

    const { contact } = await findOrCreateContact(to, channelConnection.companyId!);

    const conversation = await findOrCreateEmailConversation(
      contact.id,
      connectionId,
      channelConnection.companyId!,
      options.inReplyTo || null,
      options.references || null
    );

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: content,
      type: options.isHtml ? 'html' : 'text',
      direction: 'outbound',
      status: 'sent',
      externalId: info.messageId,
      metadata: JSON.stringify({
        messageId: info.messageId,
        response: info.response,
        attachmentCount: options.attachments?.length || 0,
        emailSubject: subject,
        emailFrom: connection.config.emailAddress,
        emailTo: to,
        emailCc: options.cc?.join(', ') || null,
        emailBcc: options.bcc?.join(', ') || null,
        emailHtml: options.isHtml ? content : null,
        emailPlainText: options.isHtml ? null : content,
        emailInReplyTo: options.inReplyTo || null,
        emailReferences: options.references || null
      })
    };

    const savedMessage = await storage.createMessage(messageData);

    if (options.attachments?.length) {
      await saveEmailAttachments(savedMessage.id, options.attachments);
    }

    broadcastNewMessage(savedMessage, conversation, contact, channelConnection.companyId!);

    return savedMessage;

  } catch (error: any) {
    logger.error(`Failed to send email from connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Setup IMAP event listeners for real-time email processing
 */
function setupImapEventListeners(imap: ImapFlow, connectionId: number, userId: number): void {
  imap.on('exists', async () => {
    await syncNewEmails(connectionId, userId);
  });



  imap.on('close', () => {
    setTimeout(() => {
      reconnectEmail(connectionId, userId);
    }, 5000);
  });

  imap.on('error', (error: any) => {
    logger.error(`IMAP error on connection ${connectionId}:`, error);
    updateConnectionStatus(connectionId, 'error', error instanceof Error ? error.message : String(error));
  });
}

/**
 * Stop all old-style polling and clean up in-memory connections
 */
export async function stopAllOldPolling(): Promise<void> {
  logger.info('email', '🛑 STOPPING ALL OLD-STYLE EMAIL POLLING...');


  activeConnections.forEach((connection, connectionId) => {
    if (connection.polling) {
      clearInterval(connection.polling);
      logger.info('email', `🛑 Stopped old polling for connection ${connectionId}`);
    }
  });


  activeConnections.clear();
  logger.info('email', '🗑️ Cleared all in-memory active connections');
}

/**
 * Start email polling for all active email connections from database
 */
export async function startAllEmailPolling(): Promise<void> {
  try {
    logger.info('email', '🚀 STARTING DATABASE-DRIVEN EMAIL POLLING for all active email connections');


    await stopAllOldPolling();


    const emailConnections = await storage.getChannelConnectionsByType('email');
    const activeEmailConnections = emailConnections.filter(conn => conn.status === 'active');

    logger.info('email', ` Found ${activeEmailConnections.length} active email connections in database`);


    for (const conn of activeEmailConnections) {
      logger.info('email', `📧 Connection ${conn.id}: ${conn.accountName} (Company: ${conn.companyId}, User: ${conn.userId})`);
    }

    let successfulPollingStarts = 0;
    let failedPollingStarts = 0;

    for (const dbConnection of activeEmailConnections) {
      try {

        const emailConfig = await storage.getEmailConfigByConnectionId(dbConnection.id);
        if (!emailConfig) {
          logger.error('email', `❌ Connection ${dbConnection.id} (${dbConnection.accountName}) has no email configuration - skipping polling`);
          logger.error('email', `🔧 To fix: Configure IMAP/SMTP settings for this email connection`);
          failedPollingStarts++;
          continue;
        }

        logger.info('email', `🔧 Starting polling for connection ${dbConnection.id} with config: ${emailConfig.emailAddress}`);
        await startEmailPollingForConnection(dbConnection.id, dbConnection.userId);
        successfulPollingStarts++;
        logger.info('email', `✅ Successfully started polling for connection ${dbConnection.id}`);
      } catch (error) {
        logger.error('email', `❌ Failed to start polling for connection ${dbConnection.id}:`, error);
        failedPollingStarts++;
      }
    }

    logger.info('email', `✅ DATABASE-DRIVEN EMAIL POLLING STARTUP COMPLETED:`);
    logger.info('email', `    Total connections: ${activeEmailConnections.length}`);
    logger.info('email', `   ✅ Successfully started: ${successfulPollingStarts}`);
    logger.info('email', `   ❌ Failed to start: ${failedPollingStarts}`);

    if (failedPollingStarts > 0) {
      logger.warn('email', `⚠️ ${failedPollingStarts} email connections failed to start polling - check email configurations`);
    }
  } catch (error) {
    logger.error('email', '❌ ERROR STARTING EMAIL POLLING:', error);
  }
}

/**
 * Start connection health monitoring
 */
function startConnectionHealthMonitoring(connectionId: number): void {

  if (connectionHealthChecks.has(connectionId)) {
    clearInterval(connectionHealthChecks.get(connectionId)!);
  }


  const healthCheck = setInterval(async () => {
    try {
      const connection = activeConnections.get(connectionId);
      if (!connection) {
        logger.debug('email', `🏥 Health check: Connection ${connectionId} no longer exists, stopping monitoring`);
        clearInterval(healthCheck);
        connectionHealthChecks.delete(connectionId);
        return;
      }


      const timeSinceLastActivity = Date.now() - connection.lastActivity.getTime();
      const minutesSinceActivity = Math.round(timeSinceLastActivity / (1000 * 60));

      if (minutesSinceActivity > 30) {
        logger.warn('email', `🏥 Health check: Connection ${connectionId} stale (${minutesSinceActivity} minutes), attempting reconnection`);
        await reconnectImap(connectionId);
      } else if (connection.imap && !connection.imap.usable) {
        logger.warn('email', `🏥 Health check: Connection ${connectionId} not usable, attempting reconnection`);
        await reconnectImap(connectionId);
      } else {
        logger.debug('email', `🏥 Health check: Connection ${connectionId} healthy (last activity: ${minutesSinceActivity} minutes ago)`);
      }

    } catch (error) {
      logger.error('email', `🏥 Health check error for connection ${connectionId}:`, error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  connectionHealthChecks.set(connectionId, healthCheck);
  logger.info('email', `🏥 Started health monitoring for connection ${connectionId}`);
}

/**
 * Stop connection health monitoring
 */
function stopConnectionHealthMonitoring(connectionId: number): void {
  if (connectionHealthChecks.has(connectionId)) {
    clearInterval(connectionHealthChecks.get(connectionId)!);
    connectionHealthChecks.delete(connectionId);
    logger.info('email', `🏥 Stopped health monitoring for connection ${connectionId}`);
  }
}

/**
 * Start email polling for a specific connection
 */
export async function startEmailPollingForConnection(connectionId: number, userId?: number): Promise<void> {
  try {

    const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
    if (!emailConfig) {
      logger.error('email', `❌ Cannot start polling: email config not found for connection ${connectionId}`);
      return;
    }

    const syncFrequency = (emailConfig.syncFrequency || 13) * 1000; // Default to 13 seconds for fast email detection
    logger.info('email', `🚀 STARTING EMAIL POLLING for connection ${connectionId} with frequency ${syncFrequency}ms (${syncFrequency/1000}s)`);


    if (pollingIntervals.has(connectionId)) {
      logger.debug('email', `Clearing existing polling interval for connection ${connectionId}`);
      clearInterval(pollingIntervals.get(connectionId)!);
    }


    logger.info('email', `🔄 Performing immediate sync for connection ${connectionId} before starting polling`);
    try {
      await syncNewEmails(connectionId, userId || 1);
      logger.info('email', `✅ Immediate sync completed for connection ${connectionId}`);
    } catch (error) {
      logger.error('email', `❌ Immediate sync failed for connection ${connectionId}:`, error);
    }

    const intervalId = setInterval(async () => {
      try {
        logger.info('email', `🔄 STARTING POLLING CYCLE for connection ${connectionId} (every ${syncFrequency/1000}s)`);
        const startTime = Date.now();


        const currentConfig = await storage.getEmailConfigByConnectionId(connectionId);
        logger.info('email', ` Current lastSyncAt: ${currentConfig?.lastSyncAt?.toISOString() || 'Not set'}`);

        await syncNewEmails(connectionId, userId || 1); // Use provided userId or default to 1

        const duration = Date.now() - startTime;
        logger.info('email', `✅ COMPLETED POLLING CYCLE for connection ${connectionId} in ${duration}ms`);
      } catch (error) {
        logger.error('email', `❌ ERROR DURING POLLING CYCLE for connection ${connectionId}:`, error instanceof Error ? error.message : String(error));
        logger.error('email', `Stack trace:`, error);
      }
    }, syncFrequency);

    pollingIntervals.set(connectionId, intervalId);
    logger.info('email', `✅ EMAIL POLLING STARTED SUCCESSFULLY for connection ${connectionId} - Next sync in ${syncFrequency/1000}s`);


    startConnectionHealthMonitoring(connectionId);

  } catch (error) {
    logger.error('email', `❌ ERROR STARTING POLLING for connection ${connectionId}:`, error);
  }
}

/**
 * Perform comprehensive initial email sync for new connections
 */
async function performInitialEmailSync(connectionId: number, _userId: number): Promise<void> {
  const startTime = Date.now();
  let imapClient: ImapFlow | null = null;

  try {
    logger.info('email', `🚀 STARTING COMPREHENSIVE INITIAL EMAIL SYNC for connection ${connectionId}`);


    const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
    if (!emailConfig) {
      throw new Error(`Email config not found for connection ${connectionId}`);
    }

    const channelConnection = await storage.getChannelConnection(connectionId);
    if (!channelConnection) {
      throw new Error(`Channel connection ${connectionId} not found`);
    }

    logger.info('email', `📧 Initial sync for ${emailConfig.emailAddress} - IMAP: ${emailConfig.imapHost}:${emailConfig.imapPort}`);


    imapClient = new ImapFlow({
      host: emailConfig.imapHost,
      port: emailConfig.imapPort,
      secure: emailConfig.imapSecure || false,
      auth: {
        user: emailConfig.emailAddress,
        pass: await decryptPassword(emailConfig.imapPassword || '')
      },
      logger: false
    });

    await imapClient.connect();
    logger.info('email', `✅ IMAP connection established for initial sync ${connectionId}`);

    const syncFolder = emailConfig.syncFolder || 'INBOX';
    const lock = await imapClient.getMailboxLock(syncFolder);

    try {

      const mailboxStatus = imapClient.mailbox;
      const totalMessages = (mailboxStatus && typeof mailboxStatus === 'object' && 'exists' in mailboxStatus) ? mailboxStatus.exists : 0;
      logger.info('email', ` Mailbox "${syncFolder}" contains ${totalMessages} total messages`);

      if (totalMessages === 0) {
        logger.info('email', `📭 No messages found in mailbox for connection ${connectionId}`);
        return;
      }


      const maxMessages = Math.min(emailConfig.maxSyncMessages || 100, totalMessages);
      const startSeq = Math.max(1, totalMessages - maxMessages + 1);
      const endSeq = totalMessages;

      logger.info('email', `🔍 Initial sync: fetching messages ${startSeq}:${endSeq} (${maxMessages} messages) from ${totalMessages} total`);

      const messages = imapClient.fetch(`${startSeq}:${endSeq}`, {
        envelope: true,
        bodyStructure: true,
        source: true,
        uid: true
      });

      let messageCount = 0;
      let processedCount = 0;
      let errorCount = 0;

      for await (const message of messages) {
        messageCount++;
        const fromEmail = message.envelope?.from?.[0]?.address || 'unknown';
        const subject = message.envelope?.subject || 'No Subject';

        logger.info('email', `📨 Initial sync: processing email ${messageCount}/${maxMessages} (UID: ${message.uid}) from ${fromEmail} - "${subject}"`);

        try {
          await processIncomingEmail(message, connectionId, channelConnection.companyId!, {
            isHistoryOrImport: true,
          });
          processedCount++;
          logger.debug('email', `✅ Successfully processed initial email ${messageCount} (UID: ${message.uid})`);
        } catch (error) {
          errorCount++;
          logger.error('email', `❌ Failed to process initial email ${messageCount} (UID: ${message.uid}):`, error);
        }
      }


      const syncTime = new Date();
      await storage.updateEmailConfigLastSync(connectionId, syncTime);

      const duration = Date.now() - startTime;
      logger.info('email', `🎉 INITIAL EMAIL SYNC COMPLETED for connection ${connectionId}: ${processedCount}/${messageCount} messages processed successfully (${errorCount} errors) in ${duration}ms`);

    } finally {
      lock.release();
    }

    await imapClient.logout();

  } catch (error: any) {
    logger.error('email', `❌ INITIAL EMAIL SYNC FAILED for connection ${connectionId}:`, error);
    if (imapClient) {
      try {
        await imapClient.logout();
      } catch (logoutError) {
        logger.warn('email', `⚠️ Error closing IMAP connection after initial sync failure:`, logoutError);
      }
    }
    throw error;
  }
}

/**
 * Sync new emails from IMAP server
 */
export async function syncNewEmails(connectionId: number, _userId: number): Promise<void> {
  const startTime = Date.now();
  let imapClient: ImapFlow | null = null;
  let usingPersistentConnection = false;

  try {
    logger.info('email', `🔄 STARTING EMAIL SYNC CYCLE for connection ${connectionId}`);
    logger.info('email', `🕒 Sync started at: ${new Date().toISOString()}`);


    const channelConnection = await storage.getChannelConnection(connectionId);
    if (!channelConnection) {
      logger.error('email', `❌ Cannot sync emails: channel connection ${connectionId} not found in database`);


      try {
        const allEmailConnections = await storage.getChannelConnectionsByType('email');
        logger.error('email', `🔍 DEBUG: All email connections in database: ${allEmailConnections.map(c => `ID:${c.id}(${c.accountName},status:${c.status})`).join(', ')}`);

        const allConnections = await storage.getChannelConnections(null);
        const recentConnections = allConnections.filter(c => c.id >= connectionId - 5 && c.id <= connectionId + 5);
        logger.error('email', `🔍 DEBUG: Recent connections around ID ${connectionId}: ${recentConnections.map(c => `ID:${c.id}(${c.accountName},type:${c.channelType},status:${c.status})`).join(', ')}`);
      } catch (debugError) {
        logger.error('email', `Error during database debugging:`, debugError);
      }


      if (pollingIntervals.has(connectionId)) {
        clearInterval(pollingIntervals.get(connectionId)!);
        pollingIntervals.delete(connectionId);
        logger.info('email', `🛑 Stopped polling for non-existent connection ${connectionId}`);
      }


      stopConnectionHealthMonitoring(connectionId);

      return;
    }


    const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
    if (!emailConfig) {
      logger.error('email', `❌ Cannot sync emails: email config not found for connection ${connectionId}`);
      logger.error('email', `🔍 This means the email channel exists but has no IMAP/SMTP configuration`);
      logger.error('email', `🔧 Solution: Configure the email channel with IMAP/SMTP settings`);
      return;
    }

    logger.info('email', `📧 Email config found for ${emailConfig.emailAddress}`);
    logger.info('email', `🔧 IMAP Settings: ${emailConfig.imapHost}:${emailConfig.imapPort} (secure: ${emailConfig.imapSecure})`);
    logger.info('email', `📁 Sync folder: ${emailConfig.syncFolder || 'INBOX'}`);
    logger.info('email', `🕒 Last sync at: ${emailConfig.lastSyncAt?.toISOString() || 'Never'}`);
    logger.info('email', `⏱️ Sync frequency: ${emailConfig.syncFrequency || 60} seconds`);


    const missingFields = [];
    if (!emailConfig.imapHost) missingFields.push('imapHost');
    if (!emailConfig.imapPort) missingFields.push('imapPort');
    if (!emailConfig.emailAddress) missingFields.push('emailAddress');
    if (!emailConfig.imapPassword) missingFields.push('imapPassword');

    if (missingFields.length > 0) {
      logger.error('email', `❌ Missing required IMAP configuration fields: ${missingFields.join(', ')}`);
      logger.error('email', `🔧 Current config state:`);
      logger.error('email', `   📧 Email: ${emailConfig.emailAddress || 'NOT SET'}`);
      logger.error('email', `   🏠 Host: ${emailConfig.imapHost || 'NOT SET'}`);
      logger.error('email', `   🔌 Port: ${emailConfig.imapPort || 'NOT SET'}`);
      logger.error('email', `   🔑 Password: ${emailConfig.imapPassword ? 'SET' : 'NOT SET'}`);
      logger.error('email', `   🔒 Secure: ${emailConfig.imapSecure}`);
      logger.error('email', `🔧 Solution: Configure missing IMAP settings in email channel configuration`);
      return;
    }

    logger.info('email', `✅ All required IMAP fields are present`);


    let connection = activeConnections.get(connectionId);

    if (connection && connection.imap && connection.imap.usable) {
      logger.debug('email', `✅ Using existing persistent IMAP connection for ${connectionId}`);
      imapClient = connection.imap;
      connection.lastActivity = new Date();
      usingPersistentConnection = true;
    } else {

      logger.debug('email', `🔌 Creating new IMAP connection to ${emailConfig.imapHost}:${emailConfig.imapPort} for ${emailConfig.emailAddress}`);
      imapClient = new ImapFlow({
        host: emailConfig.imapHost,
        port: emailConfig.imapPort,
        secure: emailConfig.imapSecure || false,
        auth: {
          user: emailConfig.emailAddress,
          pass: await decryptPassword(emailConfig.imapPassword || '')
        },
        logger: false,
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 30000,
        socketTimeout: 60000 // 60 seconds
      });


      imapClient.on('error', (error) => {
        logger.error('email', `[IMAP error on connection ${connectionId}:] ERROR:`, error);
      });

      imapClient.on('close', () => {
        logger.warn('email', `[IMAP connection ${connectionId} closed]`);
      });

      try {
        logger.info('email', `🔗 Attempting IMAP connection to ${emailConfig.imapHost}:${emailConfig.imapPort}...`);
        logger.info('email', `🔐 Using credentials: user=${emailConfig.emailAddress}, password=${emailConfig.imapPassword ? '[SET]' : '[NOT SET]'}`);

        const connectStart = Date.now();
        await imapClient.connect();
        const connectDuration = Date.now() - connectStart;

        logger.info('email', `✅ Successfully connected to IMAP for sync cycle ${connectionId} (${emailConfig.emailAddress}) in ${connectDuration}ms`);
        logger.info('email', ` IMAP connection status: usable=${imapClient.usable}, authenticated=${imapClient.authenticated}`);
        logger.info('email', `🌐 Server capabilities: ${JSON.stringify(imapClient.serverInfo?.capability || {})}`);
      } catch (connectError: any) {
        logger.error('email', `❌ Failed to connect to IMAP for sync cycle ${connectionId}:`, connectError);
        logger.error('email', `🔍 Connection details: host=${emailConfig.imapHost}, port=${emailConfig.imapPort}, secure=${emailConfig.imapSecure}, user=${emailConfig.emailAddress}`);
        logger.error('email', `🔍 Error type: ${connectError?.constructor?.name || 'Unknown'}, message: ${connectError?.message || String(connectError)}`);


        await updateConnectionStatus(connectionId, 'error', `IMAP connection failed: ${connectError?.message || String(connectError)}`);
        return;
      }
    }

    logger.info('email', `📧 Syncing emails for connection ${connectionId} (${channelConnection.accountName}) - Company: ${channelConnection.companyId}`);

    let syncFolder = emailConfig.syncFolder || 'INBOX';
    logger.info('email', `📁 Attempting to access mailbox folder "${syncFolder}" on connection ${connectionId}`);


    if (!imapClient.usable) {
      logger.error('email', `❌ IMAP connection not usable for connection ${connectionId} - connection may have dropped`);
      await imapClient.logout();
      return;
    }
    logger.debug('email', `✅ IMAP connection is usable for connection ${connectionId}`);


    let lock;
    try {
      logger.info('email', `🔒 Attempting to acquire mailbox lock for "${syncFolder}"...`);
      lock = await imapClient.getMailboxLock(syncFolder);
      logger.info('email', `✅ Successfully acquired mailbox lock for "${syncFolder}"`);


      const mailboxStatus = imapClient.mailbox;
      if (mailboxStatus && typeof mailboxStatus === 'object') {
        logger.info('email', ` Mailbox "${syncFolder}" status: ${(mailboxStatus as any).exists || 0} total messages, ${(mailboxStatus as any).unseen || 0} unseen`);
      } else {
        logger.info('email', ` Mailbox "${syncFolder}" opened successfully`);
      }
    } catch (error: any) {
      if (error.mailboxMissing || error.responseText?.includes("doesn't exist")) {
        logger.warn('email', `⚠️ Mailbox "${syncFolder}" doesn't exist, falling back to "INBOX"`);
        syncFolder = 'INBOX';
        try {
          logger.info('email', `🔒 Attempting to acquire mailbox lock for fallback folder "${syncFolder}"...`);
          lock = await imapClient.getMailboxLock(syncFolder);
          logger.info('email', `✅ Successfully acquired mailbox lock for fallback folder "${syncFolder}"`);

          const mailboxStatus = imapClient.mailbox;
          if (mailboxStatus && typeof mailboxStatus === 'object') {
            logger.info('email', ` Fallback mailbox "${syncFolder}" status: ${(mailboxStatus as any).exists || 0} total messages, ${(mailboxStatus as any).unseen || 0} unseen`);
          } else {
            logger.info('email', ` Fallback mailbox "${syncFolder}" opened successfully`);
          }
        } catch (fallbackError: any) {
          logger.error('email', `❌ Failed to access fallback folder "INBOX":`, fallbackError);
          await imapClient.logout();
          throw fallbackError;
        }
      } else {
        logger.error('email', `❌ Failed to access folder "${syncFolder}":`, error);
        await imapClient.logout();
        throw error;
      }
    }

    try {

      const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
      const isFirstSyncBackfill = !emailConfig?.lastSyncAt;
      let lastSyncDate = emailConfig?.lastSyncAt;


      if (!lastSyncDate) {
        lastSyncDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours for first sync
        logger.info('email', `🆕 First sync detected - will fetch emails from last 24 hours: ${lastSyncDate.toISOString()}`);
      } else {
        logger.info('email', `🔄 Continuing sync from last sync time: ${lastSyncDate.toISOString()}`);


        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
        lastSyncDate = new Date(lastSyncDate.getTime() - bufferTime);
        logger.info('email', `🔄 Added 5-minute buffer, searching from: ${lastSyncDate.toISOString()}`);
      }

      const timeSinceLastSync = Date.now() - lastSyncDate.getTime();
      const minutesSinceLastSync = Math.round(timeSinceLastSync / (1000 * 60));
      const hoursSinceLastSync = Math.round(timeSinceLastSync / (1000 * 60 * 60));

      logger.info('email', `🔍 Searching for emails since ${lastSyncDate.toISOString()}`);
      logger.info('email', `⏰ Time since last sync: ${minutesSinceLastSync} minutes (${hoursSinceLastSync} hours) ago`);
      logger.info('email', ` Current time: ${new Date().toISOString()}`);
      logger.info('email', ` Last sync timestamp from database: ${emailConfig?.lastSyncAt?.toISOString() || 'Not set (first sync)'}`);


      const searchCriteria = {
        since: lastSyncDate,
        unseen: false
      };

      logger.info('email', `📋 IMAP SEARCH CRITERIA: since=${lastSyncDate.toISOString()}, unseen=false`);
      logger.info('email', `📋 Search will include ALL emails (seen and unseen) since the last sync time`);
      logger.debug('email', `📋 Full search criteria object:`, searchCriteria);

      let messages;
      let searchMethod = 'date-based';
      try {
        logger.info('email', `🔍 Executing IMAP fetch with date-based search criteria...`);
        messages = imapClient.fetch(searchCriteria, {
          envelope: true,
          bodyStructure: true,
          source: true,
          uid: true
        });
        logger.info('email', `✅ Date-based IMAP fetch initiated successfully`);
      } catch (searchError: any) {
        logger.warn('email', `⚠️ Date-based search failed, falling back to recent messages search:`, searchError);
        searchMethod = 'recent-fallback';


        const mailboxStatus = imapClient.mailbox;
        const totalMessages = (mailboxStatus && typeof mailboxStatus === 'object' && 'exists' in mailboxStatus) ? mailboxStatus.exists : 0;


        const recentCount = Math.min(200, totalMessages);
        const startSeq = Math.max(1, totalMessages - recentCount + 1);
        const fetchRange = totalMessages > 0 ? `${startSeq}:${totalMessages}` : '1:*';

        logger.info('email', `🔍 Fallback: fetching recent ${recentCount} messages (${fetchRange}) from ${totalMessages} total`);
        messages = imapClient.fetch(fetchRange, {
          envelope: true,
          bodyStructure: true,
          source: true,
          uid: true
        });
        logger.info('email', `✅ Fallback IMAP fetch initiated successfully`);
      }

      logger.info('email', `📬 Starting to iterate through IMAP messages using ${searchMethod} search...`);

      let messageCount = 0;
      let processedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let duplicateCount = 0;

      for await (const message of messages) {
        messageCount++;


        const messageDate = message.envelope?.date || new Date();
        const fromEmail = message.envelope?.from?.[0]?.address || 'unknown';
        const subject = message.envelope?.subject || 'No Subject';
        const messageId = message.envelope?.messageId || 'no-message-id';

        logger.info('email', `📨 Found email ${messageCount} (UID: ${message.uid}) from ${fromEmail}`);
        logger.info('email', `   📧 Subject: "${subject}"`);
        logger.info('email', `   📅 Date: ${messageDate.toISOString()}`);
        logger.info('email', `   🆔 Message ID: ${messageId}`);


        if (messageDate <= lastSyncDate) {
          skippedCount++;
          logger.info('email', `⏭️ SKIPPING email ${messageCount} (UID: ${message.uid}) - TOO OLD`);
          logger.info('email', `   📅 Message date: ${messageDate.toISOString()}`);
          logger.info('email', `   📅 Last sync:    ${lastSyncDate.toISOString()}`);
          logger.info('email', `   ⏰ Age difference: ${Math.round((lastSyncDate.getTime() - messageDate.getTime()) / (1000 * 60))} minutes older than last sync`);
          continue;
        }


        if (messageId && messageId !== 'no-message-id') {
          const existingMessages = await storage.getMessagesByEmailMessageId(messageId);
          if (existingMessages.length > 0) {
            duplicateCount++;
            logger.info('email', `⏭️ SKIPPING email ${messageCount} (UID: ${message.uid}) - ALREADY EXISTS in database`);
            logger.info('email', `   🆔 Duplicate Message ID: ${messageId}`);
            continue;
          }
        }

        logger.info('email', `🔄 Processing NEW email ${messageCount} (UID: ${message.uid}) from ${fromEmail} for connection ${connectionId}`);
        try {
          const processStart = Date.now();
          await processIncomingEmail(
            message,
            connectionId,
            channelConnection.companyId!,
            isFirstSyncBackfill ? { isHistoryOrImport: true } : {},
          );
          const processDuration = Date.now() - processStart;
          processedCount++;
          logger.info('email', `✅ Successfully processed email ${messageCount} (UID: ${message.uid}) in ${processDuration}ms`);
        } catch (error) {
          errorCount++;
          logger.error('email', `❌ Failed to process email ${messageCount} (UID: ${message.uid}) from ${fromEmail}:`, error);
        }
      }

      const syncDuration = Date.now() - startTime;
      logger.info('email', `✅ COMPLETED EMAIL SYNC for connection ${connectionId}:`);
      logger.info('email', `    Total found: ${messageCount} emails`);
      logger.info('email', `   ✅ Processed: ${processedCount} new emails`);
      logger.info('email', `   ⏭️ Skipped (too old): ${skippedCount} emails`);
      logger.info('email', `   🔄 Skipped (duplicates): ${duplicateCount} emails`);
      logger.info('email', `   ❌ Errors: ${errorCount} emails`);
      logger.info('email', `   ⏱️ Duration: ${syncDuration}ms`);

      if (messageCount === 0) {
        logger.info('email', `📭 No emails found for connection ${connectionId} since ${lastSyncDate.toISOString()}`);
        logger.info('email', `🔍 This could mean:`);
        logger.info('email', `   • No new emails have arrived`);
        logger.info('email', `   • IMAP search criteria is too restrictive`);
        logger.info('email', `   • Email server has different time zone`);
        logger.info('email', `   • Mailbox folder is incorrect`);
      } else if (processedCount === 0 && (skippedCount > 0 || duplicateCount > 0)) {
        logger.info('email', `📭 No new emails to process for connection ${connectionId}`);
        logger.info('email', `   • ${skippedCount} emails were older than last sync (${lastSyncDate.toISOString()})`);
        logger.info('email', `   • ${duplicateCount} emails were already in database`);
      } else if (processedCount > 0) {
        logger.info('email', `🎉 Successfully processed ${processedCount} new emails!`);
      }



      const syncStartTime = new Date(startTime);

      if (processedCount > 0) {
        logger.info('email', `🕒 UPDATING lastSyncAt timestamp to sync start time ${syncStartTime.toISOString()} for connection ${connectionId} (processed ${processedCount} emails)`);
        await updateEmailConfigLastSync(connectionId, syncStartTime);
      } else if (errorCount > 0) {
        logger.warn('email', `⚠️ NOT updating lastSyncAt due to processing errors - will retry these emails next cycle`);
      } else if (messageCount === 0) {

        logger.info('email', `🕒 No emails found - updating lastSyncAt to sync start time ${syncStartTime.toISOString()} for connection ${connectionId}`);
        await updateEmailConfigLastSync(connectionId, syncStartTime);
      } else {

        logger.info('email', `🕒 All ${messageCount} emails were skipped - updating lastSyncAt to sync start time ${syncStartTime.toISOString()} for connection ${connectionId}`);
        await updateEmailConfigLastSync(connectionId, syncStartTime);
      }

    } finally {
      lock.release();
      logger.debug('email', `🔓 Released mailbox lock for "${syncFolder}"`);
    }


    if (!usingPersistentConnection && imapClient) {
      try {
        await imapClient.logout();
        logger.debug('email', `🔌 Closed temporary IMAP connection for sync cycle ${connectionId}`);
      } catch (logoutError) {
        logger.warn('email', `⚠️ Error closing IMAP connection for ${connectionId}:`, logoutError);
      }
    } else if (usingPersistentConnection) {
      logger.debug('email', `🔌 Keeping persistent IMAP connection alive for ${connectionId}`);
    }

  } catch (error: any) {
    const syncDuration = Date.now() - startTime;
    logger.error('email', `❌ ERROR in email sync for connection ${connectionId} (${syncDuration}ms):`, error);
    await updateConnectionStatus(connectionId, 'error', error instanceof Error ? error.message : String(error));


    if (imapClient && !usingPersistentConnection) {
      try {
        await imapClient.logout();
      } catch (logoutError) {
        logger.warn('email', `⚠️ Error closing IMAP connection after error for ${connectionId}:`, logoutError);
      }
    } else if (usingPersistentConnection) {

      const connection = activeConnections.get(connectionId);
      if (connection) {
        connection.status = 'error';
      }
    }
  }
}

/**
 * Get or create persistent IMAP connection
 */
async function getOrCreatePersistentConnection(connectionId: number) {
  try {

    let connection = activeConnections.get(connectionId);

    if (connection && connection.imap && connection.imap.usable) {
      logger.debug('email', `✅ Using existing persistent connection for ${connectionId}`);
      return connection;
    }


    logger.info('email', `🔌 Creating persistent IMAP connection for ${connectionId}`);

    const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
    if (!emailConfig) {
      throw new Error(`Email config not found for connection ${connectionId}`);
    }


    const imapClient = new ImapFlow({
      host: emailConfig.imapHost,
      port: emailConfig.imapPort,
      secure: emailConfig.imapSecure || false,
      auth: {
        user: emailConfig.emailAddress,
        pass: await decryptPassword(emailConfig.imapPassword || '')
      },
      logger: false,

      connectionTimeout: 30000, // 30 seconds
      greetingTimeout: 30000,
      socketTimeout: 60000 // 60 seconds
    });


    imapClient.on('error', (error) => {
      logger.error('email', `[IMAP error on connection ${connectionId}:] ERROR:`, error);

      const conn = activeConnections.get(connectionId);
      if (conn) {
        conn.status = 'error';
        conn.imap = null;
      }
    });

    imapClient.on('close', () => {
      logger.warn('email', `[IMAP connection ${connectionId} closed]`);
      const conn = activeConnections.get(connectionId);
      if (conn) {
        conn.imap = null;
      }
    });

    await imapClient.connect();
    logger.info('email', `✅ Persistent IMAP connection established for ${connectionId}`);


    const smtpTransporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure || false,
      auth: {
        user: emailConfig.emailAddress,
        pass: await decryptPassword(emailConfig.smtpPassword || '')
      },
      pool: true, // Use connection pooling
      maxConnections: 5,
      maxMessages: 100,

      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000,   // 30 seconds
      socketTimeout: 60000      // 60 seconds
    } as any);


    smtpTransporter.on('error', (error) => {
      logger.error('email', `[SMTP error on connection ${connectionId}:] ERROR:`, error);

      const conn = activeConnections.get(connectionId);
      if (conn) {
        conn.status = 'error';

      }
    });


    smtpTransporter.on('idle', () => {
      logger.debug('email', `SMTP connection ${connectionId} is idle and ready`);
    });


    try {
      await smtpTransporter.verify();
      logger.info('email', `✅ SMTP connection verified for ${connectionId}`);
    } catch (verifyError) {
      logger.error('email', `❌ SMTP verification failed for ${connectionId}:`, verifyError);

    }


    const newConnection = {
      imap: imapClient,
      smtp: smtpTransporter,
      config: emailConfig,
      polling: null,
      status: 'active' as const,
      lastActivity: new Date(),
      reconnectAttempts: 0,
      isReconnecting: false
    };

    activeConnections.set(connectionId, newConnection);
    logger.info('email', `✅ Persistent connection created for ${connectionId} (${emailConfig.emailAddress})`);

    return newConnection;

  } catch (error: any) {
    logger.error('email', `❌ Failed to create persistent connection for ${connectionId}:`, error);
    return null;
  }
}

/**
 * Reconnect IMAP for a specific connection
 */
async function reconnectImap(connectionId: number): Promise<boolean> {
  try {
    const connection = activeConnections.get(connectionId);
    if (!connection) {
      logger.error('email', `❌ Cannot reconnect: connection ${connectionId} not found`);
      return false;
    }

    if (connection.isReconnecting) {
      logger.debug('email', `⏳ Reconnection already in progress for ${connectionId}`);
      return false;
    }

    connection.isReconnecting = true;
    connection.reconnectAttempts++;

    logger.info('email', `🔄 Attempting IMAP reconnection for ${connectionId} (attempt ${connection.reconnectAttempts})`);


    if (connection.imap) {
      try {
        await connection.imap.logout();
      } catch (error) {
        logger.debug('email', `Ignoring error during connection cleanup:`, error);
      }
      connection.imap = null;
    }


    const imapClient = new ImapFlow({
      host: connection.config.imapHost,
      port: connection.config.imapPort,
      secure: connection.config.imapSecure || false,
      auth: {
        user: connection.config.emailAddress,
        pass: await decryptPassword(connection.config.imapPassword || '')
      },
      logger: false,
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000
    });


    imapClient.on('error', (error) => {
      logger.error('email', `[IMAP error on connection ${connectionId}:] ERROR:`, error);
      connection.status = 'error';
      connection.imap = null;
    });

    imapClient.on('close', () => {
      logger.warn('email', `[IMAP connection ${connectionId} closed]`);
      connection.imap = null;
    });

    await imapClient.connect();

    connection.imap = imapClient;
    connection.status = 'active';
    connection.lastActivity = new Date();
    connection.isReconnecting = false;

    logger.info('email', `✅ IMAP reconnection successful for ${connectionId}`);
    return true;

  } catch (error: any) {
    logger.error('email', `❌ IMAP reconnection failed for ${connectionId}:`, error);

    const connection = activeConnections.get(connectionId);
    if (connection) {
      connection.status = 'error';
      connection.isReconnecting = false;
    }

    return false;
  }
}

/**
 * Process incoming email message
 */
async function processIncomingEmail(
  imapMessage: any,
  connectionId: number,
  companyId: number,
  context: EmailProcessingContext = {}
): Promise<void> {
  const processingStartTime = Date.now();
  try {
    logger.info('email', `🔄 PROCESSING EMAIL (UID: ${imapMessage.uid}) for connection ${connectionId}, company ${companyId}`);

    const parsed = await simpleParser(imapMessage.source);
    logger.info('email', `📧 Successfully parsed email with subject: "${parsed.subject}"`);


    const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
    if (!emailConfig) {
      logger.error('email', `❌ Cannot process email: email config not found for connection ${connectionId}`);
      return;
    }

    const fromAddress = parsed.from?.value[0]?.address?.toLowerCase();
    const ourAddress = emailConfig.emailAddress.toLowerCase();

    logger.debug('email', `📨 Email details: From: ${fromAddress}, To: ${ourAddress}, Date: ${parsed.date}`);

    if (fromAddress === ourAddress) {
      logger.debug('email', `⏭️ Skipping email from our own address: ${fromAddress}`);
      return;
    }

    const messageId = parsed.messageId || `${Date.now()}-${Math.random()}`;
    const subject = parsed.subject || '(No Subject)';
    const fromEmail = fromAddress || '';
    const fromName = parsed.from?.value[0]?.name || fromEmail;

    const htmlContent = parsed.html || '';
    const textContent = parsed.text || '';
    const content = htmlContent || textContent || '';

    const inReplyTo = parsed.inReplyTo || null;
    const references = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || null);

    logger.info('email', `👤 Processing email from ${fromEmail} (${fromName}) with subject: "${subject}"`);
    logger.debug('email', `📝 Content length: ${content.length} chars, HTML: ${!!htmlContent}, Attachments: ${parsed.attachments?.length || 0}`);


    logger.debug('email', `🔍 Finding/creating contact for ${fromEmail}`);
    const { contact, created: contactWasCreatedByInboundWebhook } = await findOrCreateContact(
      fromEmail,
      companyId,
      fromName,
    );
    logger.info('email', `✅ Contact resolved: ID ${contact.id} (${contact.name || contact.email})`);


    logger.debug('email', `🔍 Finding/creating conversation for contact ${contact.id}`);
    const conversation = await findOrCreateEmailConversation(
      contact.id,
      connectionId,
      companyId,
      inReplyTo,
      references
    );
    logger.info('email', `✅ Conversation resolved: ID ${conversation.id}`);

    const existingMessage = await storage.getMessageByExternalId(messageId);
    if (existingMessage) {
      return;
    }

    const emailMetadataBase = {
      uid: imapMessage.uid,
      flags: imapMessage.flags,
      attachmentCount: parsed.attachments?.length || 0,
      emailMessageId: messageId,
      emailSubject: subject,
      emailFrom: fromEmail,
      emailTo: emailConfig.emailAddress,
      emailCc: parsed.cc ? JSON.stringify(parsed.cc) : null,
      emailBcc: parsed.bcc ? JSON.stringify(parsed.bcc) : null,
      emailHtml: htmlContent || null,
      emailPlainText: textContent || null,
      emailInReplyTo: inReplyTo,
      emailReferences: references,
      emailHeaders: JSON.stringify(parsed.headers),
    };

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: content,
      type: htmlContent ? 'html' : 'text',
      direction: 'inbound',
      status: 'delivered',
      externalId: messageId,
      metadata: withContactInitialMessageMetadata({
        existingMetadata: JSON.stringify(emailMetadataBase),
        channelType: 'email',
        conversationStatus: conversation.status,
        isInboundContactMessage: true,
        contactWasCreatedByInboundWebhook,
        isHistoryOrImport: context.isHistoryOrImport,
      }) as string,
    };


    logger.debug('email', `💾 Creating message record for conversation ${conversation.id}`);
    const savedMessage = await storage.createMessage(messageData);
    logger.info('email', `✅ Created message with ID: ${savedMessage.id}`);


    logger.debug('email', `🕒 Updating conversation ${conversation.id} timestamp`);
    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      status: 'active'
    });
    logger.debug('email', `✅ Updated conversation timestamp`);


    if (parsed.attachments?.length) {
      logger.info('email', `📎 Processing ${parsed.attachments.length} attachments for message ${savedMessage.id}`);
      await processEmailAttachments(savedMessage.id, parsed.attachments);
      logger.debug('email', `✅ Processed attachments`);
    }


    logger.info('email', `📡 Broadcasting new message for conversation ${conversation.id} to company ${companyId}`);
    broadcastNewMessage(savedMessage, conversation, contact, companyId);


    const channelConnection = await storage.getChannelConnection(connectionId);
    if (channelConnection) {
      logger.debug('email', `🤖 Processing message through flow executor`);
      await processMessageThroughFlowExecutor(savedMessage, conversation, contact, channelConnection);
    }

    const processingDuration = Date.now() - processingStartTime;
    logger.info('email', `🎉 Successfully processed email from ${fromEmail} - Message ID: ${savedMessage.id}, Conversation ID: ${conversation.id} (${processingDuration}ms)`);

  } catch (error: any) {
    const processingDuration = Date.now() - processingStartTime;
    logger.error('email', `❌ Error processing incoming email (${processingDuration}ms):`, error);
    logger.error('email', `Stack trace:`, error.stack);
  }
}

/**
 * Find or create contact for email address
 */
async function findOrCreateContact(
  emailAddress: string,
  companyId: number,
  displayName?: string
): Promise<{ contact: any; created: boolean }> {
  try {
    let contact = await storage.getContactByEmail(emailAddress, companyId);

    if (!contact) {
      const contactData: InsertContact = {
        companyId: companyId,
        name: displayName || emailAddress,
        email: emailAddress,
        phone: null,
        identifier: emailAddress,
        identifierType: 'email',
        source: 'email',
        notes: null
      };

      const contactResult = await storage.getOrCreateContactResult(contactData);
      return contactResult;
    }

    return { contact, created: false };

  } catch (error: any) {
    logger.error(`Error finding/creating contact for ${emailAddress}:`, error);
    throw error;
  }
}

/**
 * Find or create conversation with email threading support
 */
async function findOrCreateEmailConversation(
  contactId: number,
  channelId: number,
  companyId: number,
  inReplyTo?: string | null,
  references?: string | null
): Promise<any> {
  try {
    if (inReplyTo || references) {
      const threadedConversation = await findConversationByThreading(
        contactId,
        channelId,
        inReplyTo,
        references
      );
      if (threadedConversation) {
        return threadedConversation;
      }
    }

    let conversation = await storage.getConversationByContactAndChannel(contactId, channelId);

    if (!conversation) {
      const conversationData: InsertConversation = {
        contactId: contactId,
        channelId: channelId,
        channelType: 'email',
        companyId: companyId,
        status: 'active',
        lastMessageAt: new Date()
      };

      conversation = await storage.createConversation(conversationData);
    }

    return conversation;

  } catch (error: any) {
    logger.error(`Error finding/creating email conversation:`, error);
    throw error;
  }
}

/**
 * Find conversation by email threading (Message-ID, In-Reply-To, References)
 */
async function findConversationByThreading(
  contactId: number,
  channelId: number,
  inReplyTo?: string | null,
  references?: string | null
): Promise<any> {
  try {
    const threadingIds = [];
    if (inReplyTo) threadingIds.push(inReplyTo);
    if (references) {
      threadingIds.push(...references.split(' ').filter(ref => ref.trim()));
    }

    for (const threadId of threadingIds) {
      const messages = await storage.getMessagesByEmailMessageId(threadId);
      for (const message of messages) {
        const conversation = await storage.getConversation(message.conversationId);
        if (conversation && conversation.contactId === contactId && conversation.channelId === channelId) {
          return conversation;
        }
      }
    }

    return null;
  } catch (error: any) {
    logger.error(`Error finding conversation by threading:`, error);
    return null;
  }
}

/**
 * Process email attachments
 */
async function processEmailAttachments(messageId: number, attachments: Attachment[]): Promise<void> {
  try {
    for (const attachment of attachments) {
      if (!attachment.content) continue;

      const fileExtension = path.extname(attachment.filename || '') || '.bin';
      const uniqueFilename = `${crypto.randomUUID()}${fileExtension}`;
      const filePath = path.join(EMAIL_MEDIA_DIR, uniqueFilename);

      await fs.promises.writeFile(filePath, attachment.content);

      const attachmentData: InsertEmailAttachment = {
        messageId: messageId,
        filename: attachment.filename || 'attachment',
        contentType: attachment.contentType || 'application/octet-stream',
        size: attachment.size || attachment.content.length,
        contentId: attachment.cid || null,
        isInline: attachment.contentDisposition === 'inline',
        filePath: filePath,
        downloadUrl: `/email-attachments/${uniqueFilename}`
      };

      await storage.createEmailAttachment(attachmentData);
    }
  } catch (error: any) {
    logger.error(`Error processing email attachments:`, error);
  }
}

/**
 * Save email attachments for outbound messages
 */
async function saveEmailAttachments(
  messageId: number,
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>
): Promise<void> {
  try {
    for (const attachment of attachments) {
      const fileExtension = path.extname(attachment.filename) || '.bin';
      const uniqueFilename = `${crypto.randomUUID()}${fileExtension}`;
      const filePath = path.join(EMAIL_MEDIA_DIR, uniqueFilename);

      await fs.promises.writeFile(filePath, attachment.content);

      const attachmentData: InsertEmailAttachment = {
        messageId: messageId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.content.length,
        contentId: null,
        isInline: false,
        filePath: filePath,
        downloadUrl: `/email-attachments/${uniqueFilename}`
      };

      await storage.createEmailAttachment(attachmentData);
    }
  } catch (error: any) {
    logger.error(`Error saving email attachments:`, error);
  }
}

/**
 * Broadcast new message via WebSocket
 */
function broadcastNewMessage(message: any, conversation: any, contact: any, companyId: number): void {
  try {
    logger.info('email', `📡 BROADCASTING EMAIL MESSAGE ${message.id} to company ${companyId}`);


    let emailSubject = 'N/A';
    try {
      if (message.metadata) {
        if (typeof message.metadata === 'string') {
          emailSubject = JSON.parse(message.metadata).emailSubject || 'N/A';
        } else if (typeof message.metadata === 'object') {
          emailSubject = message.metadata.emailSubject || 'N/A';
        }
      }
    } catch (error) {
      logger.debug('email', `Could not parse email subject from metadata:`, error);
    }

    logger.debug('email', `Message details: From ${contact.email}, Subject: "${emailSubject}"`);


    const eventData = {
      message,
      conversation,
      contact,
      connection: { companyId }
    };

    logger.debug('email', `🔔 Emitting messageReceived event for message ${message.id}`);
    eventEmitter.emit('messageReceived', eventData);
    logger.debug('email', `✅ Emitted messageReceived event`);


    try {
      logger.debug('email', `📤 Broadcasting newMessage event to company ${companyId}`);
      broadcastToCompany({
        type: 'newMessage',
        data: message
      }, companyId);

      logger.debug('email', `📤 Broadcasting conversationUpdated event to company ${companyId}`);
      broadcastToCompany({
        type: 'conversationUpdated',
        data: conversation
      }, companyId);


      logger.debug('email', `📤 Broadcasting newEmail event to company ${companyId}`);
      broadcastToCompany({
        type: 'newEmail',
        data: {
          message,
          conversation,
          contact,
          channelId: conversation.channelId
        }
      }, companyId);

      logger.info('email', `🎉 Successfully broadcasted email message ${message.id} to company ${companyId} via WebSocket`);
    } catch (error) {
      logger.error('email', '❌ WebSocket broadcast failed:', error);
      logger.error('email', '❌ This means emails will not appear in real-time in the frontend');
    }
  } catch (error: any) {
    logger.error('email', `❌ Error broadcasting new email message ${message.id}:`, error);
    logger.error('email', `Stack trace:`, error.stack);
  }
}

/**
 * Process message through flow executor
 */
async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: ChannelConnection
): Promise<void> {
  try {
    const flowExecutorModule = await import('../flow-executor');

    if (flowExecutorModule.default && typeof flowExecutorModule.default.processIncomingMessage === 'function') {
      await flowExecutorModule.default.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error: any) {
    logger.error(`Error processing email message through flow executor:`, error);
  }
}

/**
 * Get email configuration for connection
 */
async function getEmailConfig(connectionId: number): Promise<EmailConfig | null> {
  try {
    const config = await storage.getEmailConfigByConnectionId(connectionId);
    return config || null;
  } catch (error: any) {
    logger.error(`Error getting email config for connection ${connectionId}:`, error);
    return null;
  }
}

/**
 * Update connection status
 */
async function updateConnectionStatus(
  connectionId: number,
  status: 'active' | 'inactive' | 'error',
  errorMessage?: string
): Promise<void> {
  try {
    await storage.updateChannelConnection(connectionId, {
      status: status,
      connectionData: {
        lastStatusUpdate: new Date().toISOString(),
        ...(errorMessage && { lastError: errorMessage })
      }
    });

    await storage.updateEmailConfigStatus(connectionId, status, errorMessage);
  } catch (error: any) {
    logger.error(`Error updating connection status for ${connectionId}:`, error);
  }
}

/**
 * Update email config last sync time
 */
async function updateEmailConfigLastSync(connectionId: number, syncTime?: Date): Promise<void> {
  try {
    const actualSyncTime = syncTime || new Date();
    logger.debug('email', `💾 Updating database lastSyncAt to ${actualSyncTime.toISOString()} for connection ${connectionId}`);
    await storage.updateEmailConfigLastSync(connectionId, actualSyncTime);
    logger.debug('email', `✅ Successfully updated lastSyncAt in database for connection ${connectionId}`);
  } catch (error: any) {
    logger.error('email', `❌ Error updating last sync time for connection ${connectionId}:`, error);
  }
}

/**
 * Get polling status for debugging
 */
export async function getPollingStatus(connectionId: number) {
  try {
    const hasPollingInterval = pollingIntervals.has(connectionId);
    const hasActiveConnection = activeConnections.has(connectionId);
    const hasHealthCheck = connectionHealthChecks.has(connectionId);

    let activeConnectionInfo = null;
    if (hasActiveConnection) {
      const conn = activeConnections.get(connectionId);
      activeConnectionInfo = {
        status: conn?.status,
        lastActivity: conn?.lastActivity,
        reconnectAttempts: conn?.reconnectAttempts,
        isReconnecting: conn?.isReconnecting,
        imapUsable: conn?.imap?.usable || false
      };
    }

    return {
      connectionId,
      hasPollingInterval,
      hasActiveConnection,
      hasHealthCheck,
      activeConnectionInfo,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('email', `Error getting polling status for ${connectionId}:`, error);
    return {
      connectionId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get all polling status for debugging
 */
export async function getAllPollingStatus() {
  try {
    const allPollingIntervals = Array.from(pollingIntervals.keys());
    const allActiveConnections = Array.from(activeConnections.keys());
    const allHealthChecks = Array.from(connectionHealthChecks.keys());

    const statusList = [];
    const allConnectionIds = Array.from(new Set([...allPollingIntervals, ...allActiveConnections, ...allHealthChecks]));

    for (const connectionId of allConnectionIds) {
      const status = await getPollingStatus(connectionId);
      statusList.push(status);
    }

    return {
      summary: {
        totalPollingIntervals: allPollingIntervals.length,
        totalActiveConnections: allActiveConnections.length,
        totalHealthChecks: allHealthChecks.length,
        allConnectionIds: Array.from(allConnectionIds)
      },
      connections: statusList,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('email', `Error getting all polling status:`, error);
    return {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get status of all active email connections (database-driven)
 */
export async function getEmailConnectionsStatus(): Promise<any[]> {
  const status: any[] = [];

  try {

    const emailConnections = await storage.getChannelConnectionsByType('email');

    for (const dbConnection of emailConnections) {
      const emailConfig = await storage.getEmailConfigByConnectionId(dbConnection.id);
      const isPollingActive = pollingIntervals.has(dbConnection.id);

      status.push({
        connectionId: dbConnection.id,
        emailAddress: emailConfig?.emailAddress || 'N/A',
        status: dbConnection.status,
        pollingActive: isPollingActive,
        imapConnected: false, // We create connections per sync cycle now
        lastSyncAt: emailConfig?.lastSyncAt?.toISOString() || 'Never'
      });
    }
  } catch (error) {
    logger.error('email', 'Error getting email connections status:', error);
  }

  return status;
}

/**
 * Clean up orphaned connections that exist in memory but not in database
 */
export async function cleanupOrphanedConnections(): Promise<void> {
  logger.info('email', '🧹 Starting cleanup of orphaned email connections...');

  const orphanedConnections: number[] = [];
  const connectionIds = Array.from(activeConnections.keys());

  for (const connectionId of connectionIds) {
    try {
      const dbConnection = await storage.getChannelConnection(connectionId);
      if (!dbConnection) {
        orphanedConnections.push(connectionId);
        logger.warn('email', `🗑️ Found orphaned connection ${connectionId} - exists in memory but not in database`);
      }
    } catch (error) {
      logger.error('email', `Error checking connection ${connectionId}:`, error);
    }
  }


  for (const connectionId of orphanedConnections) {
    logger.info('email', `🛑 Cleaning up orphaned connection ${connectionId}`);
    await disconnectFromEmail(connectionId);
  }

  if (orphanedConnections.length > 0) {
    logger.info('email', `✅ Cleaned up ${orphanedConnections.length} orphaned connections`);
  } else {
    logger.info('email', '✅ No orphaned connections found');
  }
}

/**
 * Decrypt password (implement based on your encryption method)
 */
async function decryptPassword(encryptedPassword: string): Promise<string> {
  return encryptedPassword;
}

/**
 * Reconnect email connection
 */
async function reconnectEmail(connectionId: number, userId: number): Promise<void> {
  try {

    await disconnectFromEmail(connectionId);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await connectToEmail(connectionId, userId);
  } catch (error: any) {
    logger.error(`Error reconnecting email connection ${connectionId}:`, error);
  }
}

/**
 * Check if email connection is active
 */
export function isEmailConnectionActive(connectionId: number): boolean {
  const connection = activeConnections.get(connectionId);
  return connection?.status === 'active' && !!connection.imap && !!connection.smtp;
}

/**
 * Auto-reconnect all active email connections on server startup
 */
export async function autoReconnectEmailConnections(): Promise<void> {
  try {
    logger.info('email', '=== STARTING EMAIL AUTO-RECONNECTION ===');

    const allConnections = await storage.getChannelConnectionsByType('email');
    logger.info('email', `Found ${allConnections.length} total email connections in database`);


    const validConnections = [];
    for (const conn of allConnections) {
      logger.debug('email', `Email connection ${conn.id}: ${conn.accountName} (${conn.accountId}) - Status: ${conn.status}`);


      const emailConfig = await getEmailConfig(conn.id);
      if (!emailConfig && conn.status === 'active') {
        logger.error('email', `❌ Email connection ${conn.id} is marked as active but has no email configuration - marking as error`);
        await storage.updateChannelConnectionStatus(conn.id, 'error');
      } else if (emailConfig) {
        validConnections.push(conn);
      }
    }

    const activeConnections = validConnections.filter(conn => conn.status === 'active');
    logger.info('email', `Found ${activeConnections.length} active email connections with valid configurations to reconnect`);

    if (activeConnections.length === 0) {
      logger.warn('email', 'No active email connections with valid configurations found for auto-reconnection - emails will not be processed');
      return;
    }

    for (let i = 0; i < activeConnections.length; i++) {
      const connection = activeConnections[i];


      setTimeout(async () => {
        try {
          logger.info('email', `[${i+1}/${activeConnections.length}] Auto-reconnecting email connection ${connection.id} (${connection.accountName}) for user ${connection.userId}`);
          await connectToEmail(connection.id, connection.userId);
          logger.info('email', `✅ Successfully reconnected email connection ${connection.id}`);
        } catch (error) {
          logger.error('email', `❌ Failed to auto-reconnect email connection ${connection.id}:`, error);
          await storage.updateChannelConnectionStatus(connection.id, 'error');
        }
      }, i * 2000); // 2 second delay between connections
    }

    logger.info('email', '=== EMAIL AUTO-RECONNECTION INITIATED ===');
  } catch (error) {
    logger.error('email', 'Error during email auto-reconnection:', error);
  }
}

/**
 * Get active email connections
 */
export function getActiveEmailConnections(): number[] {
  const allIds = Array.from(activeConnections.keys());
  const activeIds = allIds.filter(id => isEmailConnectionActive(id));

  logger.debug('email', ` Email connections status: ${allIds.length} total, ${activeIds.length} active`);
  logger.debug('email', `Active connections: [${activeIds.join(', ')}]`);


  activeConnections.forEach((connection, id) => {
    const isActive = isEmailConnectionActive(id);
    logger.debug('email', `Connection ${id}: Active=${isActive}, Status=${connection.status}, IMAP=${!!connection.imap}, SMTP=${!!connection.smtp}, Polling=${!!connection.polling}`);
  });

  return activeIds;
}

/**
 * Subscribe to email events
 */
export function subscribeToEvents(eventType: string, callback: (data: any) => void): () => void {
  eventEmitter.on(eventType, callback);


  return () => {
    eventEmitter.removeListener(eventType, callback);
  };
}

/**
 * Debug function to get email service status
 */
export function getEmailServiceDebugInfo(): any {
  const activeIds = Array.from(activeConnections.keys());
  const debugInfo = {
    totalConnections: activeIds.length,
    activeConnections: activeIds,
    connectionDetails: {} as any,
    eventListeners: eventEmitter.listenerCount('messageReceived')
  };

  activeConnections.forEach((connection, id) => {
    debugInfo.connectionDetails[id] = {
      status: connection.status,
      hasImap: !!connection.imap,
      hasSmtp: !!connection.smtp,
      hasPolling: !!connection.polling,
      emailAddress: connection.config.emailAddress,
      syncFolder: connection.config.syncFolder || 'INBOX',
      lastSyncAt: connection.config.lastSyncAt,
      imapUsable: connection.imap?.usable || false
    };
  });

  logger.info('email', ` EMAIL SERVICE DEBUG INFO:`, debugInfo);
  return debugInfo;
}

/**
 * List available mailboxes for a connection (for debugging)
 */
export async function listEmailMailboxes(connectionId: number): Promise<any[]> {
  try {
    logger.info('email', `🔍 Listing mailboxes for connection ${connectionId}`);


    const connection = activeConnections.get(connectionId);
    logger.info('email', `🔗 Active connection status: ${connection ? 'Found' : 'Not found'}`);

    if (connection && connection.imap && connection.imap.usable) {
      logger.info('email', `✅ Using existing active IMAP connection`);
      const mailboxes = await connection.imap.list();
      logger.info('email', `📋 Found ${mailboxes.length} mailboxes:`, mailboxes.map(mb => mb.path));
      return mailboxes;
    }


    logger.warn('email', `⚠️ No active IMAP connection found, creating temporary connection...`);

    const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
    if (!emailConfig) {
      logger.error('email', `❌ Email config not found for connection ${connectionId}`);
      throw new Error(`Email config not found for connection ${connectionId}`);
    }

    logger.info('email', `📧 Email config found: ${emailConfig.emailAddress}`);
    logger.info('email', `🔧 IMAP: ${emailConfig.imapHost}:${emailConfig.imapPort} (secure: ${emailConfig.imapSecure})`);
    logger.info('email', `🔑 Has password: ${emailConfig.imapPassword ? 'Yes' : 'No'}`);


    if (!emailConfig.imapHost || !emailConfig.imapPort || !emailConfig.emailAddress || !emailConfig.imapPassword) {
      const missingFields = [];
      if (!emailConfig.imapHost) missingFields.push('imapHost');
      if (!emailConfig.imapPort) missingFields.push('imapPort');
      if (!emailConfig.emailAddress) missingFields.push('emailAddress');
      if (!emailConfig.imapPassword) missingFields.push('imapPassword');

      logger.error('email', `❌ Missing required IMAP fields: ${missingFields.join(', ')}`);
      throw new Error(`Missing required IMAP configuration: ${missingFields.join(', ')}`);
    }


    const { ImapFlow } = await import('imapflow');
    const tempImap = new ImapFlow({
      host: emailConfig.imapHost,
      port: emailConfig.imapPort,
      secure: emailConfig.imapSecure || false,
      auth: {
        user: emailConfig.emailAddress,
        pass: await decryptPassword(emailConfig.imapPassword)
      },
      logger: false,
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000
    });

    logger.info('email', `🔌 Attempting temporary IMAP connection...`);
    await tempImap.connect();
    logger.info('email', `✅ Temporary IMAP connection successful`);

    const mailboxes = await tempImap.list();
    await tempImap.logout();

    logger.info('email', `📋 Found ${mailboxes.length} mailboxes:`, mailboxes.map(mb => mb.path));
    return mailboxes;
  } catch (error: any) {
    logger.error('email', `❌ Error listing mailboxes for connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Get email connection status
 */
export async function getEmailConnectionStatus(connectionId: number): Promise<{
  status: string;
  lastSync?: Date;
  error?: string;
}> {
  try {
    const connection = activeConnections.get(connectionId);
    const emailConfig = await getEmailConfig(connectionId);

    return {
      status: connection?.status || 'inactive',
      lastSync: emailConfig?.lastSyncAt || undefined,
      error: emailConfig?.lastError || undefined
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Initialize email connection with configuration
 */
export async function initializeEmailConnection(
  connectionId: number,
  config: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUsername: string;
    imapPassword: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUsername: string;
    smtpPassword: string;
    emailAddress: string;
    displayName?: string;
    signature?: string;
    syncFolder?: string;
    syncFrequency?: number;
    maxSyncMessages?: number;
  }
): Promise<boolean> {
  try {
    logger.info('email', `🔧 INITIALIZING EMAIL CONNECTION ${connectionId} for ${config.emailAddress}`);


    const channelConnection = await storage.getChannelConnection(connectionId);
    if (!channelConnection) {
      logger.error('email', `❌ Channel connection ${connectionId} not found in database`);
      throw new Error(`Channel connection ${connectionId} not found`);
    }
    logger.info('email', `✅ Channel connection ${connectionId} exists: ${channelConnection.accountName}`);

    logger.debug('email', `Testing IMAP connection to ${config.imapHost}:${config.imapPort}`);
    const testImap = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapSecure,
      auth: {
        user: config.imapUsername,
        pass: config.imapPassword
      }
    });

    await testImap.connect();
    await testImap.logout();
    logger.debug('email', `✅ IMAP connection test successful`);

    logger.debug('email', `Testing SMTP connection to ${config.smtpHost}:${config.smtpPort}`);
    const testSmtp = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUsername,
        pass: config.smtpPassword
      }
    } as any);

    await testSmtp.verify();
    testSmtp.close();
    logger.debug('email', `✅ SMTP connection test successful`);

    logger.info('email', `💾 Creating email configuration for connection ${connectionId}`);

    const emailConfigData = {
      channelConnectionId: connectionId,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapSecure: config.imapSecure,
      imapUsername: config.imapUsername,
      imapPassword: config.imapPassword,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUsername: config.smtpUsername,
      smtpPassword: config.smtpPassword,
      emailAddress: config.emailAddress,
      displayName: config.displayName || null,
      signature: config.signature || null,
      syncFolder: config.syncFolder || 'INBOX',
      syncFrequency: config.syncFrequency || 60,
      maxSyncMessages: config.maxSyncMessages || 100,
      status: 'active'
    };

    logger.debug('email', `Email config data:`, emailConfigData);

    try {
      const createdConfig = await storage.createOrUpdateEmailConfig(connectionId, emailConfigData);
      logger.info('email', `✅ Email configuration created successfully with ID: ${createdConfig.id}`);


      const verifyConfig = await storage.getEmailConfigByConnectionId(connectionId);
      if (verifyConfig) {
        logger.info('email', `✅ Email configuration verified in database`);
      } else {
        logger.error('email', `❌ Email configuration not found after creation - database issue!`);
        throw new Error('Email configuration was not saved to database');
      }
    } catch (configError: any) {
      logger.error('email', `❌ Failed to create email configuration:`, configError);
      logger.error('email', `Config data that failed:`, emailConfigData);
      throw new Error(`Failed to create email configuration: ${configError.message}`);
    }

    logger.debug('email', `Updating channel connection ${connectionId} status to active`);
    await storage.updateChannelConnection(connectionId, {
      status: 'active',
      connectionData: {
        emailAddress: config.emailAddress,
        lastConnectedAt: new Date().toISOString()
      }
    });
    logger.debug('email', `✅ Channel connection status updated`);

    logger.info('email', `🎉 Successfully initialized email connection ${connectionId} for ${config.emailAddress}`);
    return true;

  } catch (error: any) {
    logger.error('email', `❌ Failed to initialize email connection ${connectionId}:`, error);
    logger.error('email', `Stack trace:`, error.stack);

    try {
      await storage.updateChannelConnection(connectionId, {
        status: 'error',
        connectionData: {
          lastError: error.message,
          lastErrorAt: new Date().toISOString()
        }
      });
    } catch (updateError) {
      logger.error('email', `Failed to update connection status to error:`, updateError);
    }

    return false;
  }
}

export default {
  connect: connectToEmail,
  disconnect: disconnectFromEmail,
  sendMessage: sendMessage,
  isActive: isEmailConnectionActive,
  getActiveConnections: getActiveEmailConnections,
  subscribeToEvents: subscribeToEvents,
  getEmailConnectionStatus: getEmailConnectionStatus,
  initializeConnection: initializeEmailConnection,
  autoReconnectEmailConnections: autoReconnectEmailConnections,
  getDebugInfo: getEmailServiceDebugInfo,
  syncNewEmails: syncNewEmails,
  listMailboxes: listEmailMailboxes,
  stopAllOldPolling: stopAllOldPolling,
  startAllEmailPolling: startAllEmailPolling,
  getPollingStatus: getPollingStatus,
  getAllPollingStatus: getAllPollingStatus
};
export async function disconnectEmailChannel(connectionId: number): Promise<void> {
  try {
    logger.info('email', `🛑 Disconnecting email channel ${connectionId}`);


    if (pollingIntervals.has(connectionId)) {
      clearInterval(pollingIntervals.get(connectionId)!);
      pollingIntervals.delete(connectionId);
      logger.info('email', `🛑 Stopped polling for connection ${connectionId}`);
    }


    stopConnectionHealthMonitoring(connectionId);


    const connection = activeConnections.get(connectionId);
    if (connection) {

      if (connection.imap) {
        try {
          await connection.imap.logout();
          logger.info('email', `🔌 Closed IMAP connection for ${connectionId}`);
        } catch (error) {
          logger.warn('email', `⚠️ Error closing IMAP connection for ${connectionId}:`, error);
        }
      }


      if (connection.smtp) {
        try {
          connection.smtp.close();
          logger.info('email', `📧 Closed SMTP connection for ${connectionId}`);
        } catch (error) {
          logger.warn('email', `⚠️ Error closing SMTP connection for ${connectionId}:`, error);
        }
      }

      activeConnections.delete(connectionId);
    }


    await updateConnectionStatus(connectionId, 'inactive');

    logger.info('email', `✅ Successfully disconnected email channel ${connectionId}`);
  } catch (error: any) {
    logger.error('email', `❌ Error disconnecting email channel ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Cleanup stale SMTP connections that might be causing issues
 */
export function cleanupStaleSmtpConnections(): void {
  logger.debug('email', '🧹 Checking for stale SMTP connections...');

  const now = new Date();
  const staleThreshold = 30 * 60 * 1000; // 30 minutes

  activeConnections.forEach((connection, connectionId) => {
    if (connection.smtp && connection.lastActivity) {
      const timeSinceLastActivity = now.getTime() - connection.lastActivity.getTime();

      if (timeSinceLastActivity > staleThreshold) {
        logger.info('email', `🔄 Closing stale SMTP connection ${connectionId} (idle for ${Math.round(timeSinceLastActivity / 60000)} minutes)`);

        try {
          connection.smtp.close();
          connection.smtp = null;
          connection.status = 'inactive';
        } catch (error) {
          logger.warn('email', `⚠️ Error closing stale SMTP connection ${connectionId}:`, error);
        }
      }
    }
  });
}


setInterval(() => {
  cleanupStaleSmtpConnections();
}, 10 * 60 * 1000); // Run every 10 minutes

