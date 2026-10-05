import { storage } from '../storage';
import channelManager from './channel-manager';
import {
  applyTemplate,
  resolveNotificationConnection,
  resolveOrderNotificationRecipient,
} from './erp-channel-notification-utils';

export const ERP_SALES_ORDER_STATUS_NOTIFICATIONS_KEY = 'erp_sales_order_status_notifications';

export const ORDER_NOTIFICATION_MESSAGE_STATUSES = [
  'quotation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;

export type OrderNotificationMessageStatus = (typeof ORDER_NOTIFICATION_MESSAGE_STATUSES)[number];

export const DEFAULT_ORDER_STATUS_NOTIFICATION_MESSAGES: Record<OrderNotificationMessageStatus, string> = {
  quotation:
    'Your order {{orderNumber}} is now a quotation. Total: {{currency}} {{totalAmount}}. Valid until: {{validUntil}}.',
  confirmed:
    'Hi {{contactName}}, your order {{orderNumber}} has been confirmed. Total: {{currency}} {{totalAmount}}.',
  processing: 'Your order {{orderNumber}} is now being prepared.',
  shipped: 'Your order {{orderNumber}} has been shipped.',
  delivered: 'Your order {{orderNumber}} has been delivered. Thank you!',
  cancelled: 'Your order {{orderNumber}} has been cancelled.',
  returned: 'Your order {{orderNumber}} has been marked as returned.',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  quotation: 'Quotation',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export type OrderNotificationSettings = {
  enabled: boolean;
  messages: Record<OrderNotificationMessageStatus, string>;
};

function parseSettingsRaw(value: unknown): Partial<{ enabled: boolean; messages: Record<string, string> }> {
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
  const messages = o.messages && typeof o.messages === 'object' && !Array.isArray(o.messages)
    ? (o.messages as Record<string, string>)
    : undefined;
  return { enabled, messages };
}

export async function getOrderNotificationSettings(companyId: number): Promise<OrderNotificationSettings> {
  const setting = await storage.getCompanySetting(companyId, ERP_SALES_ORDER_STATUS_NOTIFICATIONS_KEY);
  const parsed = parseSettingsRaw(setting?.value);
  const messages = { ...DEFAULT_ORDER_STATUS_NOTIFICATION_MESSAGES };
  if (parsed.messages) {
    for (const key of ORDER_NOTIFICATION_MESSAGE_STATUSES) {
      const v = parsed.messages[key];
      if (typeof v === 'string') messages[key] = v;
    }
  }
  return {
    enabled: parsed.enabled !== false,
    messages,
  };
}

const DEFAULT_EMAIL_ORDER_STATUS_SUBJECT = 'Order {{orderNumber}} — {{statusLabel}}';

export async function notifyOrderStatusChange(salesOrderId: number, newStatus: string): Promise<void> {
  try {
    const order = await storage.getSalesOrder(salesOrderId);
    if (!order || order.status !== newStatus) return;

    if (!ORDER_NOTIFICATION_MESSAGE_STATUSES.includes(newStatus as OrderNotificationMessageStatus)) {
      return;
    }
    const statusKey = newStatus as OrderNotificationMessageStatus;

    const settings = await getOrderNotificationSettings(order.companyId);
    if (!settings.enabled) return;

    const template = settings.messages[statusKey]?.trim();
    if (!template) return;

    if (order.contactId == null) return;
    const contact = await storage.getContact(order.contactId);
    if (!contact) return;

    const conn = await resolveNotificationConnection({
      companyId: order.companyId,
      contactId: order.contactId,
      preferredConnectionId: order.channelConnectionId,
    });
    if (!conn) return;

    const recipient = resolveOrderNotificationRecipient(contact, conn.channelType);
    if (!recipient) return;

    const contactName = contact.name?.trim() || 'there';
    const currency = order.currency?.trim() || 'USD';
    const totalAmount = String(order.totalAmount ?? '0');
    const validUntil = order.validUntil
      ? new Date(order.validUntil as unknown as string | number | Date).toLocaleDateString()
      : '';
    const notes = order.notes?.trim() ?? '';
    const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;

    const rendered = applyTemplate(template, {
      orderNumber: order.orderNumber,
      status: newStatus,
      statusLabel,
      contactName,
      currency,
      totalAmount,
      validUntil,
      notes,
    });

    const emailSubject =
      conn.channelType === 'email'
        ? applyTemplate(DEFAULT_EMAIL_ORDER_STATUS_SUBJECT, {
            orderNumber: order.orderNumber,
            status: newStatus,
            statusLabel,
            contactName,
            currency,
            totalAmount,
            validUntil,
            notes,
          })
        : undefined;

    const sendResult = await channelManager.sendDirectMessage(
      conn.channelType,
      recipient,
      'text',
      rendered,
      undefined,
      emailSubject,
      order.companyId,
      conn.id
    );
    if (!sendResult.success) {
      console.warn('[erp-order-notification] sendDirectMessage failed:', sendResult.error);
    }
  } catch (e) {
    console.warn('[erp-order-notification] notifyOrderStatusChange failed:', e);
  }
}
