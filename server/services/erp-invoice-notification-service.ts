import { storage } from '../storage';
import channelManager from './channel-manager';
import { generateInvoicePdf } from './erp-invoice-pdf-service';
import { toFullPublicMediaUrl } from './public-media-url';
import {
  applyTemplate,
  resolveNotificationConnection,
  resolveOrderNotificationRecipient,
} from './erp-channel-notification-utils';
import { channelSupportsInvoicePdfAttachment } from './erp-invoice-channel-document';
import {
  ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY,
  INVOICE_PAYMENT_NOTIFICATION_STATUSES,
  DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES,
  DEFAULT_INVOICE_PAID_EMAIL_SUBJECT,
  DEFAULT_INVOICE_PLACED_EMAIL_SUBJECT,
  type InvoicePaymentNotificationStatus,
} from '@shared/erp-invoice-notification-defaults';

export type InvoicePaymentNotificationSettings = {
  enabled: boolean;
  messages: Record<InvoicePaymentNotificationStatus, string>;
};

function parsePaymentNotificationRaw(value: unknown): Partial<{ enabled: boolean; messages: Record<string, string> }> {
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
  const messages =
    o.messages && typeof o.messages === 'object' && !Array.isArray(o.messages)
      ? (o.messages as Record<string, string>)
      : undefined;
  return { enabled, messages };
}

export async function getInvoicePaymentNotificationSettings(
  companyId: number
): Promise<InvoicePaymentNotificationSettings> {
  const setting = await storage.getCompanySetting(companyId, ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY);
  const parsed = parsePaymentNotificationRaw(setting?.value);
  const messages = { ...DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES };
  for (const k of INVOICE_PAYMENT_NOTIFICATION_STATUSES) {
    const v = parsed.messages?.[k];
    if (typeof v === 'string') messages[k] = v;
  }
  return {
    enabled: parsed.enabled !== false,
    messages,
  };
}

function latestPaidDateIso(invoiceId: number, payments: { paymentDate: Date | string | null }[]): string {
  let maxMs = 0;
  for (const p of payments) {
    const d = p.paymentDate ? new Date(p.paymentDate as unknown as string | number | Date).getTime() : 0;
    if (Number.isFinite(d) && d > maxMs) maxMs = d;
  }
  if (maxMs <= 0) return new Date().toLocaleDateString();
  return new Date(maxMs).toLocaleDateString();
}

export async function notifyInvoicePaymentStatusChange(invoiceId: number): Promise<void> {
  try {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || invoice.status !== 'paid') return;
    if (invoice.type !== 'sales_invoice') return;

    const settings = await getInvoicePaymentNotificationSettings(invoice.companyId);
    if (!settings.enabled) return;

    const template = settings.messages.paid?.trim();
    if (!template) return;

    if (invoice.contactId == null) return;

    const contact = await storage.getContact(invoice.contactId);
    if (!contact) return;

    let preferredConnectionId: number | null = null;
    if (invoice.salesOrderId != null) {
      const order = await storage.getSalesOrder(invoice.salesOrderId);
      if (order && order.companyId === invoice.companyId) {
        preferredConnectionId = order.channelConnectionId ?? null;
      }
    }

    const conn = await resolveNotificationConnection({
      companyId: invoice.companyId,
      contactId: invoice.contactId,
      preferredConnectionId,
    });
    if (!conn) return;

    const recipient = resolveOrderNotificationRecipient(contact, conn.channelType);
    if (!recipient) return;

    const payments = await storage.getInvoicePayments(invoiceId);
    const contactName = contact.name?.trim() || 'there';
    const currency = invoice.currency?.trim() || 'USD';
    const totalAmount = String(invoice.totalAmount ?? '0');
    const paidDate = latestPaidDateIso(invoiceId, payments);

    const vars: Record<string, string> = {
      invoiceNumber: invoice.invoiceNumber,
      currency,
      totalAmount,
      contactName,
      paidDate,
    };

    const body = applyTemplate(template, vars);
    const emailSubject = applyTemplate(DEFAULT_INVOICE_PAID_EMAIL_SUBJECT, vars);

    let pdfLanguage = 'en';
    if (invoice.createdBy != null) {
      const u = await storage.getUser(invoice.createdBy);
      pdfLanguage = u?.languagePreference ?? 'en';
    } else if (invoice.salesOrderId != null) {
      const ord = await storage.getSalesOrder(invoice.salesOrderId);
      if (ord?.createdBy != null) {
        const u = await storage.getUser(ord.createdBy);
        pdfLanguage = u?.languagePreference ?? 'en';
      }
    }

    const pdf = await generateInvoicePdf(invoice.id, invoice.companyId, 'a4', { language: pdfLanguage });
    const fullPdfUrl = toFullPublicMediaUrl(pdf.pdfUrl);

    const docSupported = channelSupportsInvoicePdfAttachment(conn.channelType);

    if (docSupported) {
      const sendResult = await channelManager.sendDirectMessage(
        conn.channelType,
        recipient,
        'document',
        body,
        fullPdfUrl,
        conn.channelType === 'email' ? emailSubject : undefined,
        invoice.companyId,
        conn.id
      );
      if (!sendResult.success) {
        console.warn('[erp-invoice-notification] sendDirectMessage(document) failed:', sendResult.error);
      }
    } else {
      const textBody = `${body}\n${pdf.pdfUrl}`;
      const sendResult = await channelManager.sendDirectMessage(
        conn.channelType,
        recipient,
        'text',
        textBody,
        undefined,
        conn.channelType === 'email' ? emailSubject : undefined,
        invoice.companyId,
        conn.id
      );
      if (!sendResult.success) {
        console.warn('[erp-invoice-notification] sendDirectMessage(text) failed:', sendResult.error);
      }
    }
  } catch (e) {
    console.warn('[erp-invoice-notification] notifyInvoicePaymentStatusChange failed:', e);
  }
}

export async function notifyOrderPlacedInvoiceDelivery(salesOrderId: number): Promise<void> {
  try {
    const order = await storage.getSalesOrder(salesOrderId);
    if (!order || order.status !== 'confirmed' || order.contactId == null) return;

    const settings = await getInvoicePaymentNotificationSettings(order.companyId);
    if (!settings.enabled) return;

    const template = settings.messages.placed?.trim();
    if (!template) return;

    const list = await storage.getInvoices(order.companyId, {
      salesOrderId,
      type: 'sales_invoice',
      limit: 50,
    });
    let invoice = list.data.find((inv) => inv.status !== 'cancelled' && inv.status !== 'void');
    if (!invoice) {
      invoice = await storage.generateInvoiceFromSalesOrder(salesOrderId, order.companyId, null);
    }

    const contact = await storage.getContact(order.contactId);
    if (!contact) return;

    const conn = await resolveNotificationConnection({
      companyId: order.companyId,
      contactId: order.contactId,
      preferredConnectionId: order.channelConnectionId ?? null,
    });
    if (!conn) return;

    const recipient = resolveOrderNotificationRecipient(contact, conn.channelType);
    if (!recipient) return;

    if (invoice.status === 'draft') {
      invoice = await storage.sendInvoice(invoice.id, order.companyId, null);
    }

    const contactName = contact.name?.trim() || 'there';
    const currency = invoice.currency?.trim() || order.currency?.trim() || 'USD';
    const totalAmount = String(invoice.totalAmount ?? '0');
    const vars: Record<string, string> = {
      orderNumber: order.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      currency,
      totalAmount,
      contactName,
    };

    const body = applyTemplate(template, vars);
    const emailSubject = applyTemplate(DEFAULT_INVOICE_PLACED_EMAIL_SUBJECT, vars);

    let pdfLanguagePlaced = 'en';
    if (invoice.createdBy != null) {
      const u = await storage.getUser(invoice.createdBy);
      pdfLanguagePlaced = u?.languagePreference ?? 'en';
    } else if (order.createdBy != null) {
      const u = await storage.getUser(order.createdBy);
      pdfLanguagePlaced = u?.languagePreference ?? 'en';
    }

    const pdf = await generateInvoicePdf(invoice.id, order.companyId, 'a4', { language: pdfLanguagePlaced });
    const fullPdfUrl = toFullPublicMediaUrl(pdf.pdfUrl);

    const docSupported = channelSupportsInvoicePdfAttachment(conn.channelType);

    if (docSupported) {
      const sendResult = await channelManager.sendDirectMessage(
        conn.channelType,
        recipient,
        'document',
        body,
        fullPdfUrl,
        conn.channelType === 'email' ? emailSubject : undefined,
        order.companyId,
        conn.id
      );
      if (!sendResult.success) {
        console.warn('[erp-invoice-notification] sendDirectMessage(document) failed:', sendResult.error);
      }
    } else {
      const textBody = `${body}\n${pdf.pdfUrl}`;
      const sendResult = await channelManager.sendDirectMessage(
        conn.channelType,
        recipient,
        'text',
        textBody,
        undefined,
        conn.channelType === 'email' ? emailSubject : undefined,
        order.companyId,
        conn.id
      );
      if (!sendResult.success) {
        console.warn('[erp-invoice-notification] sendDirectMessage(text) failed:', sendResult.error);
      }
    }
  } catch (e) {
    console.warn('[erp-invoice-notification] notifyOrderPlacedInvoiceDelivery failed:', e);
  }
}
