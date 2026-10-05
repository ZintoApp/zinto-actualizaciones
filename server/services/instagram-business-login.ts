import axios from 'axios';
import { instagramEnglish, type InstagramTranslate } from '../../shared/instagram-i18n';
import { decryptValue } from '../utils/crypto';
import type { PartnerConfiguration } from '../../shared/schema';
import {
  INSTAGRAM_BUSINESS_SCOPES, INSTAGRAM_BUSINESS_REQUESTED_SCOPES, INSTAGRAM_ECHO_SCOPE,
  INSTAGRAM_BASE_WEBHOOK_FIELDS, INSTAGRAM_BUSINESS_WEBHOOK_FIELDS, INSTAGRAM_GRAPH_VERSION,
  validateInstagramLoginConfiguration, type InstagramLoginConfiguration,
  type InstagramAccountSubscriptionStatus,
} from '../../shared/types/instagram-login';

export class InstagramLoginError extends Error {}

export function instagramConfiguration(config: PartnerConfiguration): InstagramLoginConfiguration {
  return {
    appId: config.partnerApiKey, appSecret: config.partnerSecret?.startsWith('igenc:')
      ? decryptValue(config.partnerSecret.slice(6)) : config.partnerSecret || '',
    verifyToken: config.webhookVerifyToken || '', webhookUrl: config.partnerWebhookUrl || '',
    redirectUrl: config.redirectUrl || '',
  };
}

export function requireInstagramConfiguration(config: PartnerConfiguration | null, t: InstagramTranslate = instagramEnglish): InstagramLoginConfiguration {
  if (!config?.isActive) throw new InstagramLoginError(t("instagram.errors.signup_not_configured", 'Instagram signup is not configured. Contact your administrator.'));
  const settings = instagramConfiguration(config);
  if (validateInstagramLoginConfiguration(settings).length) {
    throw new InstagramLoginError(t("instagram.errors.signup_incomplete", 'Instagram signup configuration is incomplete. Contact your administrator.'));
  }
  return settings;
}

export function instagramAuthorizationUrl(config: InstagramLoginConfiguration, state: string): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: config.appId, redirect_uri: config.redirectUrl, response_type: 'code', state,
    scope: INSTAGRAM_BUSINESS_REQUESTED_SCOPES.join(','), enable_fb_login: '0', force_authentication: '1',
  }).toString();
  return url.toString();
}

function instagramResponseRecord(body: any): Record<string, any> | undefined {
  // Instagram returns both direct objects and single-account data envelopes.
  const record = Array.isArray(body?.data) ? (body.data.length === 1 ? body.data[0] : undefined) : body;
  return record && typeof record === 'object' && !Array.isArray(record) ? record : undefined;
}

type AuthorizationStep = 'code_exchange' | 'token_extension' | 'account_lookup';

function authorizationRequestError(error: any, step: AuthorizationStep, t: InstagramTranslate): InstagramLoginError {
  const numeric = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
  const httpStatus = numeric(error?.response?.status);
  const providerCode = numeric(error?.response?.data?.error?.code) ?? numeric(error?.response?.data?.code);
  const providerSubcode = numeric(error?.response?.data?.error?.error_subcode);
  // Never log provider messages, request URLs, bodies, headers, or Axios errors.
  console.error('[Instagram Business Login] Authorization request failed', { step, httpStatus, providerCode, providerSubcode });
  const messages: Record<AuthorizationStep, string> = {
    code_exchange: t("instagram.errors.code_exchange", 'Instagram could not exchange the authorization code. Check the Instagram App ID, App Secret, tester access and exact OAuth redirect URL, then start a new login.'),
    token_extension: t("instagram.errors.token_extension", 'Instagram could not extend the access token. Check the Instagram App Secret and try connecting again.'),
    account_lookup: t("instagram.errors.account_lookup", 'Instagram could not load the authorized professional account. Check the profile permission and account access, then try connecting again.'),
  };
  const retryable = httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500) ||
    ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.code);
  const providerMessage = error?.response?.data?.error?.message ?? error?.response?.data?.error_message;
  const pendingTester = typeof providerMessage === 'string' && /insufficient developer role/i.test(providerMessage);
  const message = pendingTester
    ? t("instagram.errors.tester_invitation", 'Accept the Instagram Tester invitation for this account in Instagram under Apps and websites > Tester invites, then reconnect. Ask your administrator to add the account as an Instagram Tester if no invitation is listed.')
    : retryable ? t("instagram.errors.temporarily_unavailable", 'Instagram is temporarily unavailable. Please wait a moment and try connecting again.') : messages[step];
  return new InstagramLoginError(`${message}${providerCode === undefined ? '' : t('instagram.errors.provider_code', ' (Instagram error {{code}}.)', { code: providerCode })}`);
}

export async function exchangeInstagramAuthorizationCode(code: string, config: InstagramLoginConfiguration, t: InstagramTranslate = instagramEnglish) {
  let step: AuthorizationStep = 'code_exchange';
  try {
    const short = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
      client_id: config.appId, client_secret: config.appSecret, grant_type: 'authorization_code',
      redirect_uri: config.redirectUrl, code,
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
    const authorization = instagramResponseRecord(short.data);
    if (typeof authorization?.access_token !== 'string' || !authorization.access_token) {
      throw new InstagramLoginError(t("instagram.errors.missing_token", 'Instagram did not return an access token. Please reconnect.'));
    }
    // The code exchange supplies the granted permissions for direct Instagram login.
    const granted = typeof authorization.permissions === 'string'
      ? authorization.permissions.split(/[\s,]+/).filter(Boolean)
      : Array.isArray(authorization.permissions) ? authorization.permissions : [];
    if (INSTAGRAM_BUSINESS_SCOPES.some(scope => !granted.includes(scope))) {
      throw new InstagramLoginError(t("instagram.errors.permissions", 'Allow profile and messaging permissions to connect Instagram.'));
    }
    step = 'token_extension';
    const long = await axios.get('https://graph.instagram.com/access_token', {
      params: { grant_type: 'ig_exchange_token', client_secret: config.appSecret, access_token: authorization.access_token },
      timeout: 15000,
    });
    const extended = instagramResponseRecord(long.data);
    const expiresIn = Number(extended?.expires_in);
    if (typeof extended?.access_token !== 'string' || !extended.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new InstagramLoginError(t("instagram.errors.long_lived_token", 'Could not obtain a long-lived Instagram token. Please reconnect.'));
    }
    const token: string = extended.access_token;
    const headers = { Authorization: `Bearer ${token}` };
    step = 'account_lookup';
    const profile = await axios.get(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/me`, {
      params: { fields: 'user_id,username,name,account_type,profile_picture_url' }, headers, timeout: 15000,
    });
    const account = instagramResponseRecord(profile.data);
    const accountType = typeof account?.account_type === 'string' ? account.account_type.toUpperCase() : '';
    if (!account?.user_id || !account.username || !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(accountType)) {
      throw new InstagramLoginError(t("instagram.errors.professional_account", 'An Instagram professional account (Business or Creator) is required.'));
    }
    return {
      grantedPermissions: granted.filter((scope: unknown): scope is string => typeof scope === 'string'),
      accessToken: token, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      account: { id: String(account.user_id), username: String(account.username), name: account.name,
        profile_picture_url: account.profile_picture_url, account_type: accountType },
    };
  } catch (error) {
    if (error instanceof InstagramLoginError) throw error;
    throw authorizationRequestError(error, step, t);
  }
}

export async function subscribeInstagramBusinessAccount(accountId: string, accessToken: string,
  t: InstagramTranslate = instagramEnglish, grantedPermissions?: string[],
  previous?: InstagramAccountSubscriptionStatus): Promise<InstagramAccountSubscriptionStatus> {
  const requestedFields = [...INSTAGRAM_BUSINESS_WEBHOOK_FIELDS];
  const missingEchoGrant = grantedPermissions !== undefined && !grantedPermissions.includes(INSTAGRAM_ECHO_SCOPE);
  const eligible = requestedFields.filter(field => field !== 'message_echoes' || !missingEchoGrant);
  // Failed HTTP requests do not prove that Meta removed a previously working subscription.
  let subscribedFields: string[] = [...(previous?.subscribedFields ?? (previous?.success ? INSTAGRAM_BASE_WEBHOOK_FIELDS : []))];
  const failures: NonNullable<InstagramAccountSubscriptionStatus['failures']> = [];
  const subscribe = async (fields: string[]) => {
    const result = await axios.post(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(accountId)}/subscribed_apps`,
      { subscribed_fields: fields.join(',') },
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 });
    if (result.data?.success !== true) throw new Error();
    subscribedFields = [...fields];
  };
  const recordFailure = (field: string, error: any) => {
    const provider = error?.response?.data?.error;
    failures.push({ field, ...(Number.isSafeInteger(provider?.code) ? { code: provider.code } : {}),
      ...(Number.isSafeInteger(provider?.error_subcode) ? { subcode: provider.error_subcode } : {}) });
  };
  try { await subscribe(eligible); }
  catch {
    // A missing optional field/permission must not disable established inbound DMs.
    try { await subscribe([...INSTAGRAM_BASE_WEBHOOK_FIELDS]); }
    catch (error) { recordFailure('messages', error); }
    if (subscribedFields.includes('messages')) {
      for (const field of eligible.filter(field => !subscribedFields.includes(field))) {
        try { await subscribe([...subscribedFields, field]); }
        catch (error) { recordFailure(field, error); }
      }
    }
  }
  if (missingEchoGrant) failures.push({ field: 'message_echoes' });
  const inboundActive = subscribedFields.includes('messages');
  const success = !missingEchoGrant && !failures.length && requestedFields.every(field => subscribedFields.includes(field));
  const reconnectRequired = missingEchoGrant || failures.some(f => f.code === 190 || f.code === 10 || f.code === 200);
  return { success, dashboardConfiguration: 'manual', subscribedAt: new Date().toISOString(), requestedFields,
    subscribedFields, grantedPermissions, inboundActive, outboundActive: !missingEchoGrant && subscribedFields.includes('message_echoes'),
    adEventsActive: ['messages', 'messaging_postbacks', 'messaging_referral'].every(f => subscribedFields.includes(f)),
    reconnectRequired, failures,
    ...(!success ? { error: reconnectRequired
      ? t('instagram.errors.sync_reconnect', 'Instagram sync is incomplete. Reconnect with Instagram Easy Setup and allow the requested permissions, including comment access for outbound message echoes.')
      : t('instagram.errors.sync_fields', 'Instagram sync is incomplete. Enable messages, messaging_seen, message_reactions, message_echoes, messaging_postbacks and messaging_referral in the Meta app dashboard, then retry the subscription.') } : {}),
  };
}
