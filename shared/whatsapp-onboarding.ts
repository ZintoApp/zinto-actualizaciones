export const WHATSAPP_ONBOARDING_API_VERSION = 'v26.0';
export type WhatsAppSignupMode = 'standard' | 'coexistence';
export type WhatsAppSyncStatus = 'received' | 'disabled' | 'pending' | 'requesting' | 'syncing' | 'completed' | 'declined' | 'failed' | 'unknown' | 'expired';
export interface WhatsAppSignupEvent {
  type: 'WA_EMBEDDED_SIGNUP';
  event: string;
  data: { waba_id?: string; phone_number_id?: string; business_id?: string; current_step?: string; error_message?: string; error_code?: string; session_id?: string };
}
export interface WhatsAppOnboardingInput {
  sessionId: string;
  signupData: WhatsAppSignupEvent;
  connectionName: string;
  signupMode: WhatsAppSignupMode;
  enableHistorySync: boolean;
  repairConnectionId?: number;
  selectedPhoneNumberId?: string;
}
export interface WhatsAppOnboardingResult {
  status: 'ready' | 'needs_selection' | 'incomplete';
  message: string;
  messageCode?: string;
  messageParams?: Record<string, string | number | boolean | null | undefined>;
  connectionId?: number;
  phoneNumbers?: Array<{ id: string; display_phone_number: string; verified_name?: string }>;
  signupMode?: WhatsAppSignupMode;
  contactSyncStatus?: WhatsAppSyncStatus;
  historySyncStatus?: WhatsAppSyncStatus;
}

export class WhatsAppSignupError extends Error {
  constructor(message: string, public messageCode: string, public messageParams?: Record<string, string | number>) {
    super(message);
    this.name = 'WhatsAppSignupError';
  }
}

/** Session events are distinct from the FB.login authorization response. */
export function parseWhatsAppSignupEvent(origin: string, value: unknown): WhatsAppSignupEvent | null {
  if (!['https://www.facebook.com', 'https://web.facebook.com', 'https://facebook.com'].includes(origin)) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const event = parsed as WhatsAppSignupEvent;
    if (event.type !== 'WA_EMBEDDED_SIGNUP' || typeof event.event !== 'string' || !event.data || typeof event.data !== 'object') return null;
    return event;
  } catch { return null; }
}

export function validateWhatsAppFinish(event: WhatsAppSignupEvent): void {
  if (event.event === 'ERROR' || event.event === 'CANCEL') {
    throw new WhatsAppSignupError(
      event.data.error_message || `Signup cancelled${event.data.current_step ? ` at ${event.data.current_step}` : ''}. Please try again.`,
      'WHATSAPP_AUTHORIZATION_CANCELLED',
      event.data.current_step ? { step: event.data.current_step } : undefined,
    );
  }
  if (!['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(event.event)) {
    throw new WhatsAppSignupError('This signup did not connect a supported WhatsApp phone number. Restart signup and select Cloud API or your WhatsApp Business app.', 'WHATSAPP_SIGNUP_UNSUPPORTED');
  }
  if (!event.data.waba_id || (event.event === 'FINISH' && !event.data.phone_number_id)) {
    throw new WhatsAppSignupError('Meta did not return the required WhatsApp account details. Please complete signup again.', 'WHATSAPP_SIGNUP_DETAILS_MISSING');
  }
}
