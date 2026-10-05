/** Defaults for ERP invoice fully-paid + order-placed notifications (server + client). */

export const ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY = 'erp_invoice_payment_notifications';

export const INVOICE_PAYMENT_NOTIFICATION_STATUSES = ['paid', 'placed'] as const;
export type InvoicePaymentNotificationStatus = (typeof INVOICE_PAYMENT_NOTIFICATION_STATUSES)[number];

export const DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES: Record<
  InvoicePaymentNotificationStatus,
  string
> = {
  paid: 'Hi {{contactName}}, we received your full payment for invoice {{invoiceNumber}} ({{currency}} {{totalAmount}}). The invoice PDF is attached.',
  placed:
    'Hi {{contactName}}, your order {{orderNumber}} is placed. Invoice {{invoiceNumber}} ({{currency}} {{totalAmount}}) is attached.',
};

/** Alias for settings UI / docs */
export const INVOICE_PAYMENT_NOTIFICATION_DEFAULTS = DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES;

export const DEFAULT_INVOICE_PAID_EMAIL_SUBJECT = 'Invoice {{invoiceNumber}} — Paid';

export const DEFAULT_INVOICE_PLACED_EMAIL_SUBJECT = 'Order {{orderNumber}} placed — Invoice {{invoiceNumber}}';
