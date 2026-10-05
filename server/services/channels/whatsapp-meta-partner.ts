import { assertWhatsAppMessagingReady, assertReconnectedWhatsAppWindow } from '../whatsapp-connection-state';
import { whatsappGraph } from '../whatsapp-onboarding-graph';
import { storage } from '../../storage';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  ChannelConnection
} from '@shared/schema';
import { EventEmitter } from 'events';
import { setMaxListenersSafely } from '../../utils/event-emitter-monitor';
import axios from 'axios';
import path from 'path';
import fsExtra from 'fs-extra';
import crypto from 'crypto';

const activeConnections = new Map<number, boolean>();
const eventEmitter = new EventEmitter();
setMaxListenersSafely(eventEmitter, 0, 'whatsapp-meta-partner');

const WHATSAPP_API_VERSION = 'v26.0';
const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
fsExtra.ensureDirSync(MEDIA_DIR);

const mediaCache = new Map<string, string>();

/**
 * Meta WhatsApp Business API Partner Service
 * Implements Partner API architecture for Meta WhatsApp Business API
 */
class WhatsAppMetaPartnerService {
  
  /**
   * Get connection status
   */
  getConnectionStatus(connectionId: number): boolean {
    return activeConnections.get(connectionId) === true;
  }

  /**
   * Connect to Meta WhatsApp Business API using Partner credentials
   */
  async connect(connectionId: number): Promise<boolean> {
    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const partnerConfig = await storage.getPartnerConfiguration('meta');
      if (!partnerConfig) {
        throw new Error('Meta Partner API not configured');
      }

      const connectionData = connection.connectionData as any;
      const { phoneNumberId, accessToken } = connectionData || {};
      if (!phoneNumberId || !accessToken) {
        throw new Error('Invalid connection data');
      }

      const response = await axios.get(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.status === 200) {
        activeConnections.set(connectionId, true);
        
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error connecting Meta WhatsApp ${connectionId}:`, error);
      activeConnections.set(connectionId, false);
      return false;
    }
  }

  /**
   * Send message through Meta WhatsApp Business API
   */
  async sendMessage(
    connectionId: number,
    userId: number,
    phoneNumber: string,
    message: string,
    mediaUrl?: string,
    mediaType?: string
  ): Promise<any> {
    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      assertWhatsAppMessagingReady(connection);
      await assertReconnectedWhatsAppWindow(connection, phoneNumber);
      const connectionData = connection.connectionData as any;
      const { phoneNumberId, accessToken } = connectionData || {};
      if (!phoneNumberId || !accessToken) {
        throw new Error('Invalid connection configuration');
      }

      const messageData: any = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: mediaUrl ? mediaType || 'image' : 'text'
      };

      if (mediaUrl) {
        messageData[mediaType || 'image'] = {
          link: mediaUrl,
          caption: message || ''
        };
      } else {
        messageData.text = { body: message };
      }

      const response = await axios.post(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        messageData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        
        await storage.createMessage({
          conversationId: 0,
          senderId: userId,
          content: message,
          type: mediaUrl ? 'media' : 'text',
          direction: 'outbound',
          externalId: messageId,
          metadata: {
            phoneNumber,
            mediaUrl,
            mediaType,
            whatsappMessageId: messageId
          }
        });

        return {
          success: true,
          messageId,
          data: response.data
        };
      }

      throw new Error('Failed to send message');

    } catch (error) {
      console.error('Error sending Meta WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Fetch phone number details from Meta's Graph API
   * @param wabaId WhatsApp Business Account ID
   * @param phoneNumberId Phone number ID
   * @param accessToken Access token for API requests
   * @returns Phone number details or null if fetch fails
   */
  private async fetchPhoneNumberDetails(
    wabaId: string,
    phoneNumberId: string,
    accessToken: string
  ): Promise<any | null> {
    try {
      console.log('🔍 [META PARTNER SERVICE] Fetching phone number details:', {
        phoneNumberId,
        wabaId
      });
      
      // First, try to fetch individual phone number details
      const phoneNumberUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`;
      
      try {
        const response = await axios.get(phoneNumberUrl);
        
        if (response.status === 200 && response.data) {
          console.log('✅ [META PARTNER SERVICE] Successfully fetched phone number details:', {
            phoneNumberId: response.data.id,
            display_phone_number: response.data.display_phone_number,
            verified_name: response.data.verified_name,
            quality_rating: response.data.quality_rating
          });
          
          // Normalize quality_rating to lowercase for database consistency
          const normalizedQualityRating = response.data.quality_rating?.toLowerCase() || 'unknown';
          
          if (response.data.quality_rating && response.data.quality_rating !== normalizedQualityRating) {
            console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
              original: response.data.quality_rating,
              normalized: normalizedQualityRating
            });
          }
          
          return {
            id: response.data.id,
            display_phone_number: response.data.display_phone_number,
            verified_name: response.data.verified_name,
            quality_rating: normalizedQualityRating
          };
        }
      } catch (individualFetchError: any) {
        console.warn('⚠️ [META PARTNER SERVICE] Could not fetch individual phone number, trying WABA phone numbers list:', {
          error: individualFetchError.message,
          phoneNumberId
        });
        
        // Fallback: fetch all phone numbers for the WABA
        const wabaPhoneNumbersUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`;
        
        try {
          const wabaResponse = await axios.get(wabaPhoneNumbersUrl);
          
          if (wabaResponse.status === 200 && wabaResponse.data && wabaResponse.data.data) {
            const phoneNumbers = wabaResponse.data.data;
            const matchingPhoneNumber = phoneNumbers.find((pn: any) => pn.id === phoneNumberId);
            
            if (matchingPhoneNumber) {
              console.log('✅ [META PARTNER SERVICE] Found phone number in WABA phone numbers list:', {
                phoneNumberId: matchingPhoneNumber.id,
                display_phone_number: matchingPhoneNumber.display_phone_number,
                verified_name: matchingPhoneNumber.verified_name
              });
              
              // Normalize quality_rating to lowercase for database consistency
              const normalizedQualityRating = matchingPhoneNumber.quality_rating?.toLowerCase() || 'unknown';
              
              if (matchingPhoneNumber.quality_rating && matchingPhoneNumber.quality_rating !== normalizedQualityRating) {
                console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
                  original: matchingPhoneNumber.quality_rating,
                  normalized: normalizedQualityRating
                });
              }
              
              return {
                id: matchingPhoneNumber.id,
                display_phone_number: matchingPhoneNumber.display_phone_number,
                verified_name: matchingPhoneNumber.verified_name,
                quality_rating: normalizedQualityRating
              };
            } else {
              console.warn('⚠️ [META PARTNER SERVICE] Phone number not found in WABA phone numbers list:', {
                phoneNumberId,
                availablePhoneNumberIds: phoneNumbers.map((pn: any) => pn.id)
              });
            }
          }
        } catch (wabaFetchError: any) {
          console.error('❌ [META PARTNER SERVICE] Error fetching WABA phone numbers:', {
            error: wabaFetchError.message,
            wabaId
          });
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ [META PARTNER SERVICE] Error in fetchPhoneNumberDetails:', error);
      return null;
    }
  }

  /**
   * Fetch all phone numbers for a WhatsApp Business Account
   * @param wabaId WhatsApp Business Account ID
   * @param accessToken Access token for API requests
   * @returns Array of phone number objects or empty array on failure
   */
  private async fetchAllPhoneNumbersForWaba(
    wabaId: string,
    accessToken: string
  ): Promise<any[]> {
    try {
      console.log('🔍 [META PARTNER SERVICE] Fetching all phone numbers for WABA:', {
        wabaId,
        apiEndpoint: `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/phone_numbers`
      });
      
      const wabaPhoneNumbersUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`;
      
      const response = await axios.get(wabaPhoneNumbersUrl);
      
      if (response.status === 200 && response.data && response.data.data) {
        const phoneNumbers = response.data.data;
        
        console.log('✅ [META PARTNER SERVICE] Successfully fetched phone numbers for WABA:', {
          wabaId,
          count: phoneNumbers.length,
          phoneNumberIds: phoneNumbers.map((pn: any) => pn.id),
          phoneNumbers: phoneNumbers.map((pn: any) => ({
            id: pn.id,
            display_phone_number: pn.display_phone_number,
            verified_name: pn.verified_name,
            quality_rating: pn.quality_rating
          }))
        });
        
        // Return array of phone number objects with required fields
        // Normalize quality_rating to lowercase for database consistency
        return phoneNumbers.map((pn: any) => {
          const normalizedQualityRating = pn.quality_rating?.toLowerCase() || 'unknown';
          
          if (pn.quality_rating && pn.quality_rating !== normalizedQualityRating) {
            console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
              phoneNumberId: pn.id,
              original: pn.quality_rating,
              normalized: normalizedQualityRating
            });
          }
          
          return {
            id: pn.id,
            display_phone_number: pn.display_phone_number,
            verified_name: pn.verified_name,
            quality_rating: normalizedQualityRating
          };
        });
      } else {
        console.warn('⚠️ [META PARTNER SERVICE] Unexpected response when fetching WABA phone numbers:', {
          wabaId,
          status: response.status,
          hasData: !!response.data,
          hasDataArray: !!(response.data && response.data.data)
        });
        return [];
      }
    } catch (error: any) {
      console.error('❌ [META PARTNER SERVICE] Error fetching all phone numbers for WABA:', {
        wabaId,
        error: error.message,
        statusCode: error.response?.status,
        errorDetails: error.response?.data,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Disconnect embedded signup connection by deregistering phone number and unsubscribing from webhooks
   */
  async disconnectEmbeddedSignupConnection(connectionId: number, companyId: number): Promise<any> {
    try {
      console.log('🔍 [META PARTNER SERVICE] disconnectEmbeddedSignupConnection called:', {
        connectionId,
        companyId,
        timestamp: new Date().toISOString()
      });

      // Fetch the connection and validate it belongs to the company
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        throw new Error(`Connection with ID ${connectionId} not found`);
      }

      if (connection.companyId !== companyId) {
        throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
      }

      // Guard: Only WhatsApp Business API connections are supported
      if (connection.channelType !== 'whatsapp_official') {
        throw new Error('Only WhatsApp Business API connections are supported by this disconnect method');
      }

      // Validate the connection has partnerManaged: true flag
      const connectionData = connection.connectionData as any;
      if (!connectionData?.partnerManaged) {
        throw new Error('This connection is not an embedded signup connection and cannot be disconnected using this method');
      }

      if (connectionData.signupMode === 'coexistence') {
        return { success: false, actionRequired: 'disconnect_in_business_app', message: 'Disconnect in WhatsApp Business: Settings → Account → Business Platform → Disconnect Account. BotHive will update when Meta confirms disconnection.' };
      }

      // Check if connection is already disconnected
      if (connection.status === 'disconnected') {
        console.warn('⚠️ [META PARTNER SERVICE] Connection is already disconnected:', connectionId);
        return {
          success: true,
          message: 'Connection is already disconnected',
          connection
        };
      }

      // Extract phoneNumberId and wabaId from connectionData
      const phoneNumberId = connectionData.phoneNumberId;
      const wabaId = connectionData.wabaId || connectionData.businessAccountId;

      if (!phoneNumberId) {
        throw new Error('Phone number ID is missing from connection data');
      }

      if (!wabaId) {
        throw new Error('WABA ID is missing from connection data');
      }

      // Get access token: first try connectionData.accessToken, then fall back to partner configuration
      let accessToken = connectionData.accessToken;
      if (!accessToken) {
        const partnerConfig = await storage.getPartnerConfiguration('meta');
        if (partnerConfig?.accessToken) {
          accessToken = partnerConfig.accessToken;
          console.log('🔍 [META PARTNER SERVICE] Using access token from partner configuration');
        }
      }

      if (!accessToken) {
        throw new Error('Access token is missing from connection data and partner configuration');
      }

      // Older partner-managed records must be classified by Meta, not by the partner flag.
      const verified = await whatsappGraph(`${phoneNumberId}`, accessToken, 'GET', { fields: 'is_on_biz_app,platform_type' });
      if (verified.is_on_biz_app === true || connectionData.signupMode === 'coexistence') {
        await storage.updateChannelConnection(connectionId, { connectionData: { ...connectionData, signupMode: 'coexistence', isOnBizApp: true } });
        return { success: false, actionRequired: 'disconnect_in_business_app', message: 'Disconnect in WhatsApp Business: Settings → Account → Business Platform → Disconnect Account. BotHive will update when Meta confirms disconnection.' };
      }
      if (verified.is_on_biz_app !== false) throw new Error('Could not verify the number type. No disconnect action was performed.');

      console.log('🔍 [META PARTNER SERVICE] Deregistering phone number:', {
        phoneNumberId,
        wabaId,
        hasAccessToken: !!accessToken
      });

      // Call Meta Graph API POST /{phoneNumberId}/deregister to deregister the phone number
      try {
        const deregisterUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/deregister`;
        console.log('🔍 [META PARTNER SERVICE] Calling Meta API to deregister phone number:', deregisterUrl);
        
        const deregisterResponse = await axios.post(
          deregisterUrl,
          {},
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (deregisterResponse.data?.success !== true) {
          throw new Error('Meta did not confirm phone number deregistration.');
        }
        console.log('✅ [META PARTNER SERVICE] Phone number deregistered successfully:', {
          phoneNumberId,
          responseStatus: deregisterResponse.status,
          responseData: deregisterResponse.data
        });
      } catch (deregisterError: any) {
        // Handle already deregistered or other API errors gracefully
        const errorMessage = deregisterError.response?.data?.error?.message || deregisterError.message;
        const errorCode = deregisterError.response?.data?.error?.code;
        
        if (errorMessage?.includes('already deregistered')) {
          console.warn('⚠️ [META PARTNER SERVICE] Phone number already deregistered:', {
            phoneNumberId,
            errorMessage
          });
        } else {
          console.error('❌ [META PARTNER SERVICE] Error deregistering phone number:', {
            phoneNumberId,
            errorMessage,
            errorCode,
            statusCode: deregisterError.response?.status,
            errorDetails: deregisterError.response?.data
          });
          throw new Error(`Failed to deregister phone number: ${errorMessage}`);
        }
      }

      const siblings = (await storage.getChannelConnectionsByType('whatsapp_official')).filter(other => other.id !== connectionId && other.status !== 'disconnected' && String((other.connectionData as any)?.wabaId || (other.connectionData as any)?.businessAccountId) === String(wabaId));
      if (siblings.length === 0) {
      // Call Meta Graph API DELETE /{wabaId}/subscribed_apps to unsubscribe from webhooks
      try {
        const unsubscribeUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/subscribed_apps`;
        console.log('🔍 [META PARTNER SERVICE] Calling Meta API to unsubscribe from webhooks:', unsubscribeUrl);
        
        const unsubscribeResponse = await axios.delete(
          unsubscribeUrl,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ [META PARTNER SERVICE] Unsubscribed from webhooks successfully:', {
          wabaId,
          responseStatus: unsubscribeResponse.status,
          responseData: unsubscribeResponse.data
        });
      } catch (unsubscribeError: any) {
        // Handle already unsubscribed or other API errors gracefully
        const errorMessage = unsubscribeError.response?.data?.error?.message || unsubscribeError.message;
        const errorCode = unsubscribeError.response?.data?.error?.code;
        
        if (errorCode === 100 || errorMessage?.includes('not subscribed')) {
          console.warn('⚠️ [META PARTNER SERVICE] Already unsubscribed from webhooks:', {
            wabaId,
            errorMessage
          });
        } else {
          console.error('❌ [META PARTNER SERVICE] Error unsubscribing from webhooks:', {
            wabaId,
            errorMessage,
            errorCode,
            statusCode: unsubscribeError.response?.status,
            errorDetails: unsubscribeError.response?.data
          });
          // Don't throw here - deregistration is the critical step, webhook unsubscription is secondary
          console.warn('⚠️ [META PARTNER SERVICE] Continuing despite webhook unsubscription error');
        }
      }

      }

      // Update connection status to 'disconnected' in database
      const updatedConnection = await storage.updateChannelConnectionStatus(connectionId, 'disconnected');
      console.log('✅ [META PARTNER SERVICE] Connection status updated to disconnected:', {
        connectionId,
        newStatus: updatedConnection.status
      });

      // Update associated meta_whatsapp_phone_numbers record status to 'deregistered'
      try {
        const phoneNumberRecord = await storage.getMetaWhatsappPhoneNumberByPhoneNumberId(phoneNumberId);
        if (phoneNumberRecord) {
          await storage.updateMetaWhatsappPhoneNumber(phoneNumberRecord.id, {
            status: 'deregistered'
          });
          console.log('✅ [META PARTNER SERVICE] Phone number record status updated to deregistered:', {
            phoneNumberId: phoneNumberRecord.id,
            phoneNumberIdValue: phoneNumberRecord.phoneNumberId
          });
        } else {
          console.warn('⚠️ [META PARTNER SERVICE] Phone number record not found for phoneNumberId:', phoneNumberId);
        }
      } catch (phoneNumberUpdateError: any) {
        console.error('❌ [META PARTNER SERVICE] Error updating phone number record:', {
          phoneNumberId,
          error: phoneNumberUpdateError.message
        });
        // Don't throw - connection status update is more important
      }

      console.log('✅ [META PARTNER SERVICE] disconnectEmbeddedSignupConnection completed successfully:', {
        connectionId,
        phoneNumberId,
        wabaId
      });

      return {
        success: true,
        message: 'WhatsApp number disconnected successfully',
        connection: updatedConnection
      };

    } catch (error: any) {
      console.error('❌ [META PARTNER SERVICE] Error in disconnectEmbeddedSignupConnection:', {
        connectionId,
        companyId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get event emitter for real-time updates
   */
  getEventEmitter(): EventEmitter {
    return eventEmitter;
  }
}

export default new WhatsAppMetaPartnerService();
