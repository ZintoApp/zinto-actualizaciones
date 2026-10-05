import type { SetupMessageCode, SetupMessageParams, SetupMessagePayload } from '@shared/setup-messages';

export type SetupTranslate = (key: string, fallback?: string, variables?: Record<string, any>) => string;

const fallbacks: Record<SetupMessageCode, string> = {
  SETUP_UNKNOWN_ERROR: 'Something went wrong while setting up the channel. Please try again.',
  SETUP_NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  SETUP_REQUIRED_FIELDS: 'Please fill in all required fields.',
  SETUP_CONNECTION_CREATED: 'The channel connection was created successfully.',
  SETUP_CONNECTION_CREATE_FAILED: 'Could not create the channel connection. Check the details and try again.',
  SETUP_WEBHOOK_FIELDS_REQUIRED: 'Webhook URL and verify token are required.',
  SETUP_WEBHOOK_INVALID_URL: 'Enter a valid HTTPS webhook URL for this channel.',
  SETUP_WEBHOOK_VALID: 'The webhook configuration is valid and reachable.',
  SETUP_WEBHOOK_TEST_FAILED: 'Could not validate the webhook configuration.',
  SETUP_TEMPLATE_PHONE_REQUIRED: 'Enter a phone number to test the template message.',
  SETUP_TEMPLATE_CONNECTION_REQUIRED: 'Save the connection before testing a template message.',
  SETUP_TEMPLATE_SENT: 'Template message sent successfully to {{phoneNumber}}. Message ID: {{messageId}}',
  SETUP_TEMPLATE_SEND_FAILED: 'Could not send the template message.',
  SETUP_TEMPLATE_PHONE_NOT_ALLOWED: 'This phone number is not in the allowed list. Add it in Meta for Developers or use an approved number.',
  SETUP_TEMPLATE_NOT_APPROVED: 'The template is unavailable. Make sure the hello_world template is approved in WhatsApp Manager.',
  WHATSAPP_CONFIGURATION_MISSING: 'Ask your administrator to configure WhatsApp Easy Setup.',
  WHATSAPP_AUTHORIZATION_REQUIRED: 'A fresh Meta authorization is required. Restart setup.',
  WHATSAPP_AUTHORIZATION_UNAVAILABLE: 'This authorization attempt is unavailable. Restart setup.',
  WHATSAPP_AUTHORIZATION_CANCELLED: 'Meta authorization was cancelled. Restart setup.',
  WHATSAPP_AUTHORIZATION_TIMEOUT: 'Meta did not return the required authorization and account details. Restart setup.',
  WHATSAPP_SIGNUP_UNSUPPORTED: 'This setup did not connect a supported WhatsApp phone number. Restart and select a supported option.',
  WHATSAPP_SIGNUP_DETAILS_MISSING: 'Meta did not return the required WhatsApp account details. Complete setup and try again.',
  WHATSAPP_SESSION_EXPIRED: 'The authorization session expired or is unavailable. Restart Meta setup.',
  WHATSAPP_SETUP_BUSY: 'Setup is already running. Wait a moment and retry.',
  WHATSAPP_SETUP_DETAILS_CHANGED: 'The setup details changed. Restart setup.',
  WHATSAPP_PERMISSIONS_MISSING: 'Meta did not grant the required WhatsApp permissions. Check Advanced Access and restart setup.',
  WHATSAPP_ACCOUNT_IN_USE: 'This WhatsApp account is already connected to another company.',
  WHATSAPP_PHONE_SELECTION_REQUIRED: 'Choose the number to connect.',
  WHATSAPP_PHONE_NOT_ELIGIBLE: 'No eligible phone number was found. Verify the number and selected setup mode.',
  WHATSAPP_PHONE_IN_USE: 'This WhatsApp number is already connected elsewhere.',
  WHATSAPP_REGISTRATION_FAILED: 'Meta did not confirm phone registration.',
  WHATSAPP_WEBHOOK_SETUP_FAILED: 'The account was saved, but webhook setup failed. Check the Meta webhook configuration and retry.',
  WHATSAPP_SYNC_ATTENTION: 'Messaging is connected, but data synchronization needs attention. Review the sync status before retrying.',
  WHATSAPP_CONNECTED: 'WhatsApp is connected. Requested data synchronization will continue in the background.',
};

export function resolveSetupMessage(
  t: SetupTranslate,
  value?: unknown,
  fallbackCode: SetupMessageCode = 'SETUP_UNKNOWN_ERROR',
  fallbackParams?: SetupMessageParams,
): string {
  const payload = setupErrorPayload(value);
  const code = payload?.messageCode;
  const knownCode = code && Object.prototype.hasOwnProperty.call(fallbacks, code)
    ? code as SetupMessageCode
    : fallbackCode;
  const params = { ...(fallbackParams || {}), ...(payload?.messageParams || {}) };
  return t(`settings.setupRuntime.${knownCode}`, fallbacks[knownCode], params);
}

export function setupErrorPayload(value: unknown): SetupMessagePayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as SetupMessagePayload;
  return {
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
    messageCode: typeof candidate.messageCode === 'string' ? candidate.messageCode : undefined,
    messageParams: candidate.messageParams && typeof candidate.messageParams === 'object' ? candidate.messageParams : undefined,
  };
}
