/** Defaults for ERP quotation send notifications (server + client). */

export const ERP_QUOTATION_NOTIFICATIONS_KEY = 'erp_quotation_notifications';

export const DEFAULT_QUOTATION_EMAIL_SUBJECT = 'Quotation {{orderNumber}} from {{companyName}}';

export const DEFAULT_QUOTATION_MESSAGE_BODY = `Hi {{contactName}},

Please find attached our quotation {{orderNumber}} for {{currency}} {{totalAmount}}.

This quotation is valid until {{validUntil}}.

Thank you for your business.`;

/** Alias for settings UI / docs */
export const QUOTATION_NOTIFICATION_DEFAULTS = {
  messageBody: DEFAULT_QUOTATION_MESSAGE_BODY,
  emailSubject: DEFAULT_QUOTATION_EMAIL_SUBJECT,
};

export type QuotationNotificationSettings = {
  enabled: boolean;
  messageBody: string;
  emailSubject: string;
};
