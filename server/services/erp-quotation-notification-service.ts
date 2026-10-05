import { storage } from '../storage';
import channelManager from './channel-manager';
import { generateQuotationPdf } from './erp-quotation-pdf-service';
import { toFullPublicMediaUrl } from './public-media-url';
import {
  applyTemplate,
  isChannelConnectionUsableForNotification,
  resolveNotificationConnection,
  resolveOrderNotificationRecipient,
} from './erp-channel-notification-utils';
import { channelSupportsInvoicePdfAttachment } from './erp-invoice-channel-document';
import type { ChannelType } from '@shared/schema';
import {
  ERP_QUOTATION_NOTIFICATIONS_KEY,
  DEFAULT_QUOTATION_MESSAGE_BODY,
  DEFAULT_QUOTATION_EMAIL_SUBJECT,
  type QuotationNotificationSettings,
} from '@shared/erp-quotation-notification-defaults';
import type { QuotationSendErrorCode } from '@shared/erp-quotation-send-errors';

export type SendQuotationOptions = {
  connectionId?: number | null;
  channelType?: ChannelType;
  messageBody?: string;
  emailSubject?: string;
  language?: string;
};

export type SendQuotationFailure = {
  success: false;
  errorCode: QuotationSendErrorCode;
  errorParams?: Record<string, string>;
};

export type SendQuotationResult =
  | { success: true; channelType: string; recipient: string; pdfUrl: string }
  | SendQuotationFailure;

function parseQuotationNotificationRaw(
  value: unknown
): Partial<{ enabled: boolean; messageBody: string; emailSubject: string }> {
  const raw =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return {};
          }
        })()
      : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : undefined;
  const messageBody = typeof o.messageBody === 'string' ? o.messageBody : undefined;
  const emailSubject = typeof o.emailSubject === 'string' ? o.emailSubject : undefined;
  return { enabled, messageBody, emailSubject };
}

export async function getQuotationNotificationSettings(
  companyId: number
): Promise<QuotationNotificationSettings> {
  const setting = await storage.getCompanySetting(companyId, ERP_QUOTATION_NOTIFICATIONS_KEY);
  const parsed = parseQuotationNotificationRaw(setting?.value);
  return {
    enabled: parsed.enabled !== false,
    messageBody: parsed.messageBody?.trim() || DEFAULT_QUOTATION_MESSAGE_BODY,
    emailSubject: parsed.emailSubject?.trim() || DEFAULT_QUOTATION_EMAIL_SUBJECT,
  };
}

function recipientFailureForChannel(channelType: string): SendQuotationFailure {
  if (channelType === 'email') {
    return { success: false, errorCode: 'contact_no_email' };
  }
  if (
    channelType === 'whatsapp' ||
    channelType === 'whatsapp_official' ||
    channelType === 'whatsapp_unofficial' ||
    channelType === 'twilio_sms'
  ) {
    return { success: false, errorCode: 'contact_no_whatsapp_phone' };
  }
  return {
    success: false,
    errorCode: 'contact_no_channel_identifier',
    errorParams: { channelType },
  };
}

export async function sendQuotationViaChannel(
  salesOrderId: number,
  companyId: number,
  options: SendQuotationOptions,
  userId: number | null
): Promise<SendQuotationResult> {
  try {
    const order = await storage.getSalesOrder(salesOrderId);
    if (!order || order.companyId !== companyId) {
      return { success: false, errorCode: 'sales_order_not_found' };
    }
    if (order.status === 'cancelled') {
      return { success: false, errorCode: 'quotation_cancelled' };
    }

    // Manual "Send" always honors the request; `enabled` is for future automatic sends only.
    const settings = await getQuotationNotificationSettings(companyId);

    if (order.contactId == null) {
      return { success: false, errorCode: 'sales_order_no_contact' };
    }

    const contact = await storage.getContact(order.contactId);
    if (!contact || contact.companyId !== companyId) {
      return { success: false, errorCode: 'contact_not_found' };
    }

    let conn: { channelType: string; id: number } | null = null;

    if (options.connectionId != null) {
      const rawConn = await storage.getChannelConnection(options.connectionId);
      if (!rawConn || rawConn.companyId !== companyId) {
        return { success: false, errorCode: 'channel_connection_not_found' };
      }
      if (!isChannelConnectionUsableForNotification(rawConn)) {
        return { success: false, errorCode: 'channel_connection_unavailable' };
      }
      if (options.channelType != null && options.channelType !== rawConn.channelType) {
        return { success: false, errorCode: 'channel_type_mismatch' };
      }
      conn = { channelType: rawConn.channelType, id: rawConn.id };
    } else {
      conn = await resolveNotificationConnection({
        companyId,
        contactId: order.contactId,
        preferredConnectionId: order.channelConnectionId ?? null,
      });
    }

    if (!conn) {
      return { success: false, errorCode: 'no_usable_channel_connection' };
    }

    const recipient = resolveOrderNotificationRecipient(contact, conn.channelType);
    if (!recipient) {
      return recipientFailureForChannel(conn.channelType);
    }

    let language = options.language?.trim() || '';
    if (!language && userId != null) {
      const user = await storage.getUser(userId);
      language = user?.languagePreference ?? '';
    }
    if (!language && order.createdBy != null) {
      const creator = await storage.getUser(order.createdBy);
      language = creator?.languagePreference ?? '';
    }
    if (!language) {
      language = 'en';
    }

    const pdf = await generateQuotationPdf(salesOrderId, companyId, 'a4', { language });
    const fullPdfUrl = toFullPublicMediaUrl(pdf.pdfUrl);

    const contactName = contact.name?.trim() || 'there';
    const currency = (order.currency ?? 'USD').trim();
    const totalAmount = String(order.totalAmount ?? '0');
    const validUntil = order.validUntil ? new Date(order.validUntil).toLocaleDateString() : '';
    const orderNumber = order.orderNumber;
    const company = await storage.getCompany(companyId);
    const companyName = company?.name?.trim() || '';

    const vars: Record<string, string> = {
      contactName,
      currency,
      totalAmount,
      validUntil,
      orderNumber,
      companyName,
    };

    const body = applyTemplate(options.messageBody?.trim() || settings.messageBody, vars);
    const emailSubject = applyTemplate(
      options.emailSubject?.trim() || settings.emailSubject,
      vars
    );

    const docSupported = channelSupportsInvoicePdfAttachment(conn.channelType);

    let sendResult;
    if (docSupported) {
      sendResult = await channelManager.sendDirectMessage(
        conn.channelType,
        recipient,
        'document',
        body,
        fullPdfUrl,
        conn.channelType === 'email' ? emailSubject : undefined,
        companyId,
        conn.id
      );
    } else {
      sendResult = await channelManager.sendDirectMessage(
        conn.channelType,
        recipient,
        'text',
        `${body}\n${pdf.pdfUrl}`,
        undefined,
        conn.channelType === 'email' ? emailSubject : undefined,
        companyId,
        conn.id
      );
    }

    if (!sendResult.success) {
      console.warn('[erp-quotation-notification] sendDirectMessage failed:', sendResult.error);
      return { success: false, errorCode: 'channel_send_failed' };
    }

    return { success: true, channelType: conn.channelType, recipient, pdfUrl: fullPdfUrl };
  } catch (e) {
    console.warn('[erp-quotation-notification] sendQuotationViaChannel failed:', e);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
