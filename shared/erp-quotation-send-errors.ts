/** Stable API values for POST /api/erp/sales-orders/:id/send-quotation failure responses. */

export const QUOTATION_SEND_ERROR_CODES = [
  'sales_order_not_found',
  'quotation_cancelled',
  'sales_order_no_contact',
  'contact_not_found',
  'channel_connection_not_found',
  'channel_connection_unavailable',
  'channel_type_mismatch',
  'no_usable_channel_connection',
  'contact_no_email',
  'contact_no_whatsapp_phone',
  'contact_no_channel_identifier',
  'channel_send_failed',
  'unexpected_error',
] as const;

export type QuotationSendErrorCode = (typeof QUOTATION_SEND_ERROR_CODES)[number];

/** 400 — client/configuration issues */
export const QUOTATION_SEND_CLIENT_ERROR_CODES: ReadonlySet<QuotationSendErrorCode> = new Set([
  'sales_order_not_found',
  'quotation_cancelled',
  'sales_order_no_contact',
  'contact_not_found',
  'channel_connection_not_found',
  'channel_connection_unavailable',
  'channel_type_mismatch',
  'no_usable_channel_connection',
  'contact_no_email',
  'contact_no_whatsapp_phone',
  'contact_no_channel_identifier',
]);

export function quotationSendFailureHttpStatus(code: QuotationSendErrorCode): number {
  if (QUOTATION_SEND_CLIENT_ERROR_CODES.has(code)) return 400;
  if (code === 'channel_send_failed') return 502;
  return 500;
}
