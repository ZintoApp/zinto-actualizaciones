/**
 * Contact Notification Node Executor
 * Handles execution of contact notification nodes in flow execution
 */

import { FlowExecutionContext } from '../flow-execution-context';
import channelManager from '../channel-manager';
import { storage } from '../../storage';

const ALLOWED_CONTACT_NOTIFICATION_CHANNEL_TYPES = new Set([
  'whatsapp_official',
  'whatsapp_unofficial',
  'telegram',
  'twilio_sms',
]);

export interface ContactNotificationNodeData {
  phoneNumber: string;
  channelType?: string | null;
  channelConnectionId?: number | null;
  messageContent: string;
}

export interface ContactNotificationExecutionResult {
  success: boolean;
  messageId?: string;
  error?: string;
  data?: any;
}

/**
 * Execute a contact notification node
 * @param nodeData The node configuration data
 * @param context The flow execution context
 * @param companyId Optional company ID for multi-tenant support
 * @returns Execution result
 */
export async function executeContactNotificationNode(
  nodeData: ContactNotificationNodeData,
  context: FlowExecutionContext,
  companyId?: number
): Promise<ContactNotificationExecutionResult> {
  try {
    // Replace variables in phone number and message content
    const phoneNumber = context.replaceVariables(nodeData.phoneNumber || '');
    const messageContent = context.replaceVariables(nodeData.messageContent || '');

    // Validate phone number
    if (!phoneNumber || phoneNumber.trim() === '') {
      return {
        success: false,
        error: 'Phone number is required'
      };
    }

    // Validate message content
    if (!messageContent || messageContent.trim() === '') {
      return {
        success: false,
        error: 'Message content is required'
      };
    }

    // Get company ID from context if not provided
    let finalCompanyId = companyId;
    if (!finalCompanyId) {
      const flowCompanyId = context.getVariable('flow.companyId');
      if (flowCompanyId) {
        finalCompanyId = parseInt(String(flowCompanyId), 10);
      }
    }

    let resolvedChannelType: string;
    let preferredChannelConnectionId: number | undefined;

    const cid = nodeData.channelConnectionId;
    if (cid != null && Number(cid) > 0) {
      const conn = await storage.getChannelConnection(Number(cid));
      if (!conn) {
        return {
          success: false,
          error: 'Channel connection not found',
        };
      }
      if (conn.status !== 'active') {
        return {
          success: false,
          error: 'Channel connection is not active',
        };
      }
      if (
        finalCompanyId != null &&
        conn.companyId != null &&
        conn.companyId !== finalCompanyId
      ) {
        return {
          success: false,
          error: 'Channel connection does not belong to this company',
        };
      }
      if (!ALLOWED_CONTACT_NOTIFICATION_CHANNEL_TYPES.has(conn.channelType)) {
        return {
          success: false,
          error: 'Channel type is not allowed for contact notification',
        };
      }
      resolvedChannelType = conn.channelType;
      preferredChannelConnectionId = conn.id;
    } else if (nodeData.channelType) {
      resolvedChannelType = String(nodeData.channelType);
      if (!ALLOWED_CONTACT_NOTIFICATION_CHANNEL_TYPES.has(resolvedChannelType)) {
        return {
          success: false,
          error: 'Channel type is not allowed for contact notification',
        };
      }
    } else {
      return {
        success: false,
        error: 'Channel is required',
      };
    }

    // Execute the send operation
    // Contact notifications only support text messages
    const result = await channelManager.sendDirectMessage(
      resolvedChannelType,
      phoneNumber,
      'text',
      messageContent,
      undefined, // No media URL for text messages
      undefined, // No subject (email not supported)
      finalCompanyId,
      preferredChannelConnectionId
    );

    if (result.success) {
      // Store response in context
      context.setContactNotificationResponse({
        success: true,
        messageId: result.messageId,
        channelType: resolvedChannelType,
        timestamp: new Date().toISOString(),
        data: result.data
      });

      context.setVariable('contactNotification.lastMessageId', result.messageId);
      context.setVariable('contactNotification.lastChannelType', resolvedChannelType);

      if (result.data) {
        Object.entries(result.data).forEach(([key, value]) => {
          context.setVariable(`contactNotification.${key}`, value);
        });
      }

      return {
        success: true,
        messageId: result.messageId,
        data: result.data
      };
    } else {
      const errorResult = {
        success: false,
        error: result.error || 'Failed to send notification'
      };

      // Store error in context
      context.setContactNotificationResponse({
        success: false,
        error: errorResult.error,
        channelType: resolvedChannelType,
        timestamp: new Date().toISOString()
      });

      context.setVariable('contactNotification.lastError', errorResult.error);

      return errorResult;
    }
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error occurred during contact notification execution';
    
    // Store error in context
    context.setContactNotificationResponse({
      success: false,
      error: errorMessage,
      channelType: nodeData.channelType ?? undefined,
      timestamp: new Date().toISOString()
    });

    context.setVariable('contactNotification.lastError', errorMessage);

    return {
      success: false,
      error: errorMessage
    };
  }
}
