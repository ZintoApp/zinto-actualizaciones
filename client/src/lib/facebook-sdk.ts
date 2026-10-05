import { parseWhatsAppSignupEvent, type WhatsAppSignupEvent } from '@shared/whatsapp-onboarding';
import {
  INSTAGRAM_LOGIN_SCOPES,
  MESSENGER_LOGIN_SCOPES,
} from '@shared/types/meta-partner';

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: {
      init: (options: {
        appId: string;
        cookie?: boolean;
        autoLogAppEvents?: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: any) => void,
        options?: {
          config_id?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          extras?: {
            setup: Record<string, any>;
            featureType?: string;
            sessionInfoVersion: string;
          };
          scope?: string;
        }
      ) => void;
      getLoginStatus: (callback: (response: any) => void) => void;
      api: (path: string, callback: (response: any) => void) => void;
    };
  }
}

/**
 * Type definitions for response objects
 */
interface AuthResponse {
  accessToken?: string;
  userID: string;
  expiresIn: number;
  signedRequest: string;
  code?: string;
}

export interface FacebookLoginResponse {
  authResponse: AuthResponse | null;
  status: 'connected' | 'not_authorized' | 'unknown';
}

interface WhatsAppSignupData {
  type: 'WA_EMBEDDED_SIGNUP';
  event?: string; // 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' for coexistence mode
  wabaId?: string;
  phoneNumberId?: string;
  screen?: string;

  business_account_id?: string;
  business_account_name?: string;
  phone_numbers?: Array<{
    phone_number_id: string;
    phone_number: string;
    display_name?: string;
    quality_rating?: string;
    messaging_limit?: number;
    access_token?: string;
  }>;

  status?: string;
  [key: string]: any; // Allow additional fields from Meta
}

/**
 * Initialize Facebook SDK
 * @param appId Your Facebook App ID
 * @param version Graph API version (e.g., 'v25.0')
 */
let sdkLoad: Promise<void> | undefined;
let initializedFor = '';
export async function initFacebookSDK(appId: string, version = 'v25.0'): Promise<void> {
  if (!window.FB) {
    if (!sdkLoad) sdkLoad = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sdkLoad = undefined;
        if (!window.FB) document.getElementById('facebook-jssdk')?.remove();
        reject(new Error('Facebook SDK timed out. Check browser privacy settings and retry.'));
      }, 15000);
      const previous = window.fbAsyncInit;
      window.fbAsyncInit = () => {
        clearTimeout(timeout);
        try { previous?.(); } finally { resolve(); }
      };
      let script = document.getElementById('facebook-jssdk') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        script.onerror = () => { clearTimeout(timeout); sdkLoad = undefined; script?.remove(); reject(new Error('Failed to load Facebook SDK.')); };
        document.head.appendChild(script);
      }
    });
    await sdkLoad;
  }
  if (!window.FB || typeof window.FB.login !== 'function') throw new Error('Facebook SDK is unavailable.');
  if (initializedFor !== `${appId}:${version}`) {
    window.FB.init({ appId, cookie: true, xfbml: true, version });
    initializedFor = `${appId}:${version}`;
  }
}

/**
 * Setup event listener for WhatsApp signup events
 * @param callback Function to call when a WhatsApp signup event is received
 */
export function setupWhatsAppSignupListener(callback: (data: WhatsAppSignupEvent) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data = parseWhatsAppSignupEvent(event.origin, event.data);
    if (data) callback(data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * Launch WhatsApp Business signup flow
 * @param configId Your WhatsApp Business configuration ID
 * @param callback Callback function to handle the login response
 * @param signupMode Signup mode: 'standard' for new account, 'coexistence' for existing WhatsApp Business app
 * @remarks For coexistence mode, featureType is set to 'whatsapp_business_app_onboarding' as per Facebook documentation
 */
export function launchWhatsAppSignup(
  configId: string, 
  callback: (response: FacebookLoginResponse) => void,
  signupMode: 'standard' | 'coexistence' = 'standard'
) {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (!configId || configId.trim() === '') {
    throw new Error('WhatsApp Configuration ID is required. Please check your configuration.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('WhatsApp signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }


  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }


  // Must run in the original user gesture; getLoginStatus can lose popup activation.
  window.FB.login(callback, {
    config_id: configId.trim(),
    response_type: 'code',
    override_default_response_type: true,
    extras: {
      setup: {},
      ...(signupMode === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
      sessionInfoVersion: '3',
    },
  });
}

type LoginCallback = (response: FacebookLoginResponse) => void;

function resolveConfigIdFirstArgs(
  configIdOrCallback: string | undefined | LoginCallback,
  callbackOrConfigId?: string | LoginCallback
): { configId: string | undefined; callback: LoginCallback } {
  if (typeof configIdOrCallback === 'function') {
    return {
      configId: typeof callbackOrConfigId === 'string' ? callbackOrConfigId : undefined,
      callback: configIdOrCallback,
    };
  }

  if (typeof callbackOrConfigId !== 'function') {
    throw new Error('Facebook Login callback is required.');
  }

  return {
    configId: typeof configIdOrCallback === 'string' ? configIdOrCallback : undefined,
    callback: callbackOrConfigId,
  };
}

/**
 * Launch Messenger signup using Facebook Login for Business when config_id is configured.
 * Falls back to manual scopes in development when no config_id is available.
 */
export async function launchMessengerSignup(
  configId: string | undefined,
  callback: LoginCallback
): Promise<void>;
/** @deprecated Pass configId first — callback-first order is retained for rollout compatibility only. */
export async function launchMessengerSignup(
  callback: LoginCallback,
  configId?: string
): Promise<void>;
export async function launchMessengerSignup(
  configIdOrCallback: string | undefined | LoginCallback,
  callbackOrConfigId?: string | LoginCallback
): Promise<void> {
  const { configId, callback } = resolveConfigIdFirstArgs(configIdOrCallback, callbackOrConfigId);

  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('Messenger signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  const trimmedConfigId = configId?.trim();
  const useBusinessLogin = Boolean(trimmedConfigId);

  if (!useBusinessLogin && import.meta.env.PROD) {
    throw new Error(
      'Messenger Facebook Login for Business configuration ID is required in production. Contact your administrator.'
    );
  }

  if (!useBusinessLogin) {
    console.warn(
      '[DEV FALLBACK] Launching Messenger signup with manual scopes — not the official production onboarding path. Configure messengerConfigId or metaChannelsConfigId for Facebook Login for Business.'
    );
  }

  try {
    window.FB.getLoginStatus(() => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, useBusinessLogin
        ? {
            config_id: trimmedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              sessionInfoVersion: '3',
            },
          }
        : {
            scope: MESSENGER_LOGIN_SCOPES.join(','),
          });
    });
  } catch (error) {
    throw new Error('Failed to launch Messenger signup. Please check your configuration.');
  }
}

/**
 * Launch Instagram signup using Facebook Login for Business when config_id is configured.
 * Falls back to manual scopes in development when no config_id is available.
 */
export async function launchInstagramSignup(
  configId: string | undefined,
  callback: LoginCallback
): Promise<void>;
/** @deprecated Pass configId first — callback-first order is retained for rollout compatibility only. */
export async function launchInstagramSignup(
  callback: LoginCallback,
  configId?: string
): Promise<void>;
export async function launchInstagramSignup(
  configIdOrCallback: string | undefined | LoginCallback,
  callbackOrConfigId?: string | LoginCallback
): Promise<void> {
  const { configId, callback } = resolveConfigIdFirstArgs(configIdOrCallback, callbackOrConfigId);

  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('Instagram signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  const trimmedConfigId = configId?.trim();
  const useBusinessLogin = Boolean(trimmedConfigId);

  if (!useBusinessLogin && import.meta.env.PROD) {
    throw new Error(
      'Instagram Facebook Login for Business configuration ID is required in production. Contact your administrator.'
    );
  }

  if (!useBusinessLogin) {
    console.warn(
      '[DEV FALLBACK] Launching Instagram signup with manual scopes — not the official production onboarding path. Configure instagramConfigId or metaChannelsConfigId for Facebook Login for Business.'
    );
  }

  try {
    window.FB.getLoginStatus(() => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, useBusinessLogin
        ? {
            config_id: trimmedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              sessionInfoVersion: '3',
            },
          }
        : {
            scope: INSTAGRAM_LOGIN_SCOPES.join(','),
          });
    });
  } catch (error) {
    throw new Error('Failed to launch Instagram signup. Please check your configuration.');
  }
}

/**
 * Launch unified Meta Channels signup using the shared metaChannelsConfigId.
 * Uses Facebook Login for Business with code-based response (single-use authorization code).
 */
export async function launchMetaChannelsSignup(
  configId: string | undefined,
  callback: LoginCallback
): Promise<void> {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error(
      'Meta Channels signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.'
    );
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  const trimmedConfigId = configId?.trim();
  const useBusinessLogin = Boolean(trimmedConfigId);

  if (!useBusinessLogin && import.meta.env.PROD) {
    throw new Error(
      'Meta Channels Facebook Login for Business configuration ID is required in production. Contact your administrator.'
    );
  }

  if (!useBusinessLogin) {
    throw new Error(
      'Meta Channels Facebook Login for Business configuration ID (metaChannelsConfigId) is required.'
    );
  }

  try {
    window.FB.getLoginStatus(() => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, {
        config_id: trimmedConfigId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
        },
      });
    });
  } catch (error) {
    throw new Error('Failed to launch Meta Channels signup. Please check your configuration.');
  }
}
