import { storage } from '../../storage';
import { ChannelConnection, InsertConversation, InsertContact, InsertMessage } from '@shared/schema';
import axios from 'axios';
import crypto from 'crypto';
import { withContactInitialMessageMetadata } from './contact-initial-message-metadata';

interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string; // E.164, e.g., +15551234567
  statusCallbackUrl?: string;
}

const TWILIO_MESSAGING_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

function getConfig(connection: ChannelConnection): TwilioSmsConfig {
  const data = (connection.connectionData || {}) as any;
  const accountSid = data.accountSid;
  const authToken = data.authToken;
  const fromNumber = data.fromNumber;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Missing Twilio SMS config: accountSid, authToken, and fromNumber are required');
  }
  return {
    accountSid,
    authToken,
    fromNumber,
    statusCallbackUrl: data.statusCallbackUrl
  };
}

function authHeader(config: TwilioSmsConfig) {
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}

function normalizeE164(num: string): string {
  let n = num.trim();
  n = n.replace(/[^\d+]/g, '');
  if (!n.startsWith('+')) n = `+${n}`;
  return n;
}

function isStopKeyword(text: string): boolean {
  const t = (text || '').trim().toUpperCase();
  return ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(t);
}

function isStartKeyword(text: string): boolean {
  const t = (text || '').trim().toUpperCase();
  return ['START', 'UNSTOP', 'YES'].includes(t);
}

function isHelpKeyword(text: string): boolean {
  const t = (text || '').trim().toUpperCase();
  return t === 'HELP';
}

function hasOptOutTag(contact: any): boolean {
  const tags: string[] | null = (contact as any)?.tags || null;
  return Array.isArray(tags) && tags.map(x => (x || '').toLowerCase()).includes('sms_opted_out');
}

export async function sendMessage(connectionId: number, userId: number, to: string, body: string) {








  
  const connection = await storage.getChannelConnection(connectionId);
  if (!connection) {
    console.error('❌ [TWILIO SMS SEND] Connection not found:', connectionId);
    throw new Error('Channel connection not found');
  }
  if (!connection.companyId) {
    console.error('❌ [TWILIO SMS SEND] Connection missing companyId');
    throw new Error('Connection missing companyId');
  }
  
  
  
  const config = getConfig(connection);
  console.log('📤 [TWILIO SMS SEND] Config loaded:', {
    accountSid: config.accountSid.substring(0, 10) + '...',
    fromNumber: config.fromNumber,
    hasStatusCallback: !!config.statusCallbackUrl
  });

  const toE164 = normalizeE164(to);



  let contact = await storage.getContactByPhone(toE164.replace('+', ''), connection.companyId);
  if (!contact) {

    const contactData: InsertContact = {
      companyId: connection.companyId,
      name: toE164,
      phone: toE164.replace('+', ''),
      identifier: toE164,
      source: 'twilio_sms'
    };
    contact = await storage.getOrCreateContact(contactData);

  } else {

  }
  
  if (hasOptOutTag(contact)) {
    console.error('❌ [TWILIO SMS SEND] Contact has opted out (STOP tag)');
    throw new Error('Contact has opted out of SMS (STOP). Outbound message blocked.');
  }

  const url = `${TWILIO_MESSAGING_BASE}/${config.accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.append('To', toE164);
  params.append('From', config.fromNumber);
  params.append('Body', body);
  if (config.statusCallbackUrl) params.append('StatusCallback', config.statusCallbackUrl);



  
  try {
    const res = await axios.post(url, params, { headers: { ...authHeader(config), 'Content-Type': 'application/x-www-form-urlencoded' } });
    const messageSid = res.data.sid as string;
    




  let conversation = await storage.getConversationByContactAndChannel(contact.id, connectionId);
  if (!conversation) {
    const conv: InsertConversation = {
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'twilio_sms',
      companyId: connection.companyId,
      status: 'active'
    };
    conversation = await storage.createConversation(conv);
  }

  const msg: InsertMessage = {
    conversationId: conversation.id,
    senderId: userId,
    content: body,
    type: 'text',
    direction: 'outbound',
    status: 'sent',
    externalId: messageSid,
    metadata: {
      twilioMessageSid: messageSid,
      to: toE164,
      from: config.fromNumber,
      sentViaApi: true
    } as any
  };

    const saved = await storage.createMessage(msg);


    if ((global as any).broadcastToAllClients) {
      (global as any).broadcastToAllClients({ type: 'newMessage', data: saved });

    }


    return saved;
  } catch (error) {
    console.error('❌ [TWILIO SMS SEND] Twilio API error:', error);
    if (axios.isAxiosError(error)) {
      console.error('❌ [TWILIO SMS SEND] Response status:', error.response?.status);
      console.error('❌ [TWILIO SMS SEND] Response data:', JSON.stringify(error.response?.data, null, 2));
    }

    throw error;
  }
}

export async function sendMedia(
  connectionId: number,
  userId: number,
  to: string,
  mediaType: 'image' | 'video' | 'audio' | 'document',
  mediaUrl: string,
  caption?: string
) {
  const connection = await storage.getChannelConnection(connectionId);
  if (!connection) throw new Error('Channel connection not found');
  if (!connection.companyId) throw new Error('Connection missing companyId');
  const config = getConfig(connection);

  const toE164 = normalizeE164(to);

  let contact = await storage.getContactByPhone(toE164.replace('+', ''), connection.companyId);
  if (!contact) {
    const contactData: InsertContact = {
      companyId: connection.companyId,
      name: toE164,
      phone: toE164.replace('+', ''),
      identifier: toE164,
      source: 'twilio_sms'
    };
    contact = await storage.getOrCreateContact(contactData);
  }
  if (hasOptOutTag(contact)) {
    throw new Error('Contact has opted out of SMS (STOP). Outbound media blocked.');
  }
  const url = `${TWILIO_MESSAGING_BASE}/${config.accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.append('To', toE164);
  params.append('From', config.fromNumber);
  params.append('MediaUrl', mediaUrl);
  if (caption) params.append('Body', caption);
  if (config.statusCallbackUrl) params.append('StatusCallback', config.statusCallbackUrl);

  const res = await axios.post(url, params, { headers: { ...authHeader(config), 'Content-Type': 'application/x-www-form-urlencoded' } });
  const messageSid = res.data.sid as string;

  let conversation = await storage.getConversationByContactAndChannel(contact.id, connectionId);
  if (!conversation) {
    const conv: InsertConversation = {
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'twilio_sms',
      companyId: connection.companyId,
      status: 'active'
    };
    conversation = await storage.createConversation(conv);
  }

  const msg: InsertMessage = {
    conversationId: conversation.id,
    senderId: userId,
    content: caption || `[${mediaType.toUpperCase()}]`,
    type: mediaType,
    direction: 'outbound',
    status: 'sent',
    externalId: messageSid,
    mediaUrl: mediaUrl,
    metadata: {
      twilioMessageSid: messageSid,
      to: toE164,
      from: config.fromNumber,
      mediaType
    } as any
  };

  const saved = await storage.createMessage(msg);
  if ((global as any).broadcastToAllClients) {
    (global as any).broadcastToAllClients({ type: 'newMessage', data: saved });
  }
  return saved;
}


export function verifyTwilioSignature(fullUrl: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], fullUrl);
  const hmac = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature || ''));
}


async function findConnectionByToNumber(toNumber: string): Promise<ChannelConnection | null> {
  const connections = await storage.getChannelConnectionsByType('twilio_sms');
  const toE164 = normalizeE164(toNumber);
  for (const conn of connections) {
    const data = (conn.connectionData || {}) as any;
    if (data?.fromNumber && normalizeE164(data.fromNumber) === toE164) return conn;
  }
  return null;
}

export async function processInboundWebhook(fullUrl: string, form: Record<string, string>, signature?: string) {



  
  const to = form['To'];
  const from = form['From'];
  const body = form['Body'] || '';
  const numMedia = parseInt(form['NumMedia'] || '0', 10);
  const messageSid = form['MessageSid'];







  if (!to || !from || !messageSid) {
    console.error('❌ [TWILIO SMS RECEIVE] Missing required fields');
    return { ok: false, status: 400 };
  }
  

  const connection = await findConnectionByToNumber(to);
  
  if (!connection) {
    console.error('❌ [TWILIO SMS RECEIVE] No connection found for To number:', to);
    return { ok: false, status: 404 };
  }
  
  
  
  const { authToken } = getConfig(connection);





  
  if (!signature) {
    console.error('❌ [TWILIO SMS RECEIVE] No signature provided');
    return { ok: false, status: 403 };
  }
  
  const isValid = verifyTwilioSignature(fullUrl, form, signature, authToken);

  
  if (!isValid) {
    console.error('❌ [TWILIO SMS RECEIVE] Signature verification failed');
    console.error('❌ [TWILIO SMS RECEIVE] This could be due to:');
    console.error('   - URL mismatch (proxy/HTTPS/ngrok issue)');
    console.error('   - Wrong auth token in connection config');
    console.error('   - Modified request body');
    return { ok: false, status: 403 };
  }
  


  if (!connection.companyId) return { ok: false, status: 500 };

  const phoneDigits = from.replace(/[^\d]/g, '');

  
  let contact = await storage.getContactByPhone(phoneDigits, connection.companyId);
  let contactWasCreatedByInboundWebhook = false;
  if (!contact) {

    const contactData: InsertContact = {
      companyId: connection.companyId,
      name: `+${phoneDigits}`,
      phone: phoneDigits,
      identifier: `+${phoneDigits}`,
      source: 'twilio_sms'
    };
    const contactResult = await storage.getOrCreateContactResult(contactData);
    contact = contactResult.contact;
    contactWasCreatedByInboundWebhook = contactResult.created;

  } else {

  }



  try {
    const currentTags: string[] = Array.isArray((contact as any).tags) ? ((contact as any).tags as string[]) : [];
    if (isStopKeyword(body)) {

      const next = Array.from(new Set([...(currentTags || []), 'sms_opted_out']));
      await storage.updateContact(contact.id, { tags: next as any });
      (contact as any).tags = next;

    } else if (isStartKeyword(body)) {

      const next = (currentTags || []).filter(t => (t || '').toLowerCase() !== 'sms_opted_out');
      await storage.updateContact(contact.id, { tags: next as any });
      (contact as any).tags = next;

    } else if (isHelpKeyword(body)) {


    } else {

    }
  } catch (e) {
    console.error('❌ [TWILIO SMS RECEIVE] Failed to update contact opt-out tags:', e);
  }


  let conversation = await storage.getConversationByContactAndChannel(contact.id, connection.id);
  if (!conversation) {

    const conv: InsertConversation = {
      contactId: contact.id,
      channelId: connection.id,
      channelType: 'twilio_sms',
      companyId: connection.companyId,
      status: 'active'
    };
    conversation = await storage.createConversation(conv);

  } else {

  }

  let type: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
  let mediaUrl: string | null = null;
  let content = body;

  if (numMedia > 0) {
    const mediaUrl0 = form['MediaUrl0'];
    const contentType0 = form['MediaContentType0'] || '';
    mediaUrl = mediaUrl0 || null;
    if (contentType0.startsWith('image/')) type = 'image';
    else if (contentType0.startsWith('video/')) type = 'video';
    else if (contentType0.startsWith('audio/')) type = 'audio';
    else type = 'document';
    if (!content) content = `[${type.toUpperCase()}]`;
  }

  const msg: InsertMessage = {
    conversationId: conversation.id,
    content,
    type,
    direction: 'inbound',
    status: 'delivered',
    mediaUrl: mediaUrl || undefined,
    externalId: messageSid,
    metadata: withContactInitialMessageMetadata({
      existingMetadata: {
        to,
        from,
        numMedia,
        messageSid,
      },
      channelType: 'twilio_sms',
      conversationStatus: conversation.status,
      isInboundContactMessage: true,
      contactWasCreatedByInboundWebhook,
    }) as InsertMessage['metadata'],
  };


  const saved = await storage.createMessage(msg);

  
  await storage.updateConversation(conversation.id, { lastMessageAt: new Date(), status: 'active' });


  if ((global as any).broadcastToAllClients) {
    (global as any).broadcastToAllClients({ type: 'newMessage', data: saved });

  }



  try {
    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;
    await flowExecutor.processIncomingMessage(saved, conversation, contact, connection);

  } catch (e) {
    console.error('❌ [TWILIO SMS RECEIVE] Flow executor error:', e);
  }



  return { ok: true, status: 200 };
}

export async function processStatusWebhook(fullUrl: string, form: Record<string, string>, signature?: string) {



  
  const messageSid = form['MessageSid'];
  const messageStatus = form['MessageStatus'];
  const to = form['To'];
  const from = form['From'];
  const errorCode = form['ErrorCode'];
  





  
  if (!messageSid || !from) {
    console.error('❌ [TWILIO SMS STATUS PROCESS] Missing required fields');
    return { ok: false, status: 400 };
  }
  


  const connection = await findConnectionByToNumber(from);
  if (!connection) {
    console.error('❌ [TWILIO SMS STATUS PROCESS] No connection found for From number:', from);
    return { ok: false, status: 404 };
  }
  

  const { authToken } = getConfig(connection);
  




  
  if (!signature) {
    console.error('❌ [TWILIO SMS STATUS PROCESS] No signature provided');
    return { ok: false, status: 403 };
  }
  
  const isValid = verifyTwilioSignature(fullUrl, form, signature, authToken);

  
  if (!isValid) {
    console.error('❌ [TWILIO SMS STATUS PROCESS] Signature verification failed');
    console.error('❌ [TWILIO SMS STATUS PROCESS] This could be due to:');
    console.error('   - URL mismatch (proxy/HTTPS issue)');
    console.error('   - Wrong auth token in connection config');
    console.error('   - Modified request body');
    return { ok: false, status: 403 };
  }
  



  let message = await storage.getMessageByExternalId(messageSid);

  if (!message) {


    await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
    message = await storage.getMessageByExternalId(messageSid);
  }
  
  if (!message) {


    return { ok: true, status: 200 };
  }
  


  let status: string | undefined;
  if (['queued', 'accepted', 'sending', 'sent'].includes(messageStatus)) {
    status = 'sent';

  } else if (messageStatus === 'delivered') {
    status = 'delivered';

  } else if (messageStatus === 'undelivered' || messageStatus === 'failed') {
    status = 'failed';
    console.error('❌ [TWILIO SMS STATUS PROCESS] Mapping status to: failed');
  } else {

  }

  if (status) {

    await storage.updateMessage(message.id, {
      status,
      metadata: {
        ...(message.metadata as any || {}),
        messageStatus,
        errorCode: form['ErrorCode'] || undefined
      } as any
    });

  }
  

  return { ok: true, status: 200 };
}

export default {
  sendMessage,
  sendMedia,
  processInboundWebhook,
  processStatusWebhook,
  verifyTwilioSignature
};
