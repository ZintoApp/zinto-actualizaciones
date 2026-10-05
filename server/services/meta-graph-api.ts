import axios from 'axios';
import {
  INSTAGRAM_LOGIN_SCOPES,
  MESSENGER_LOGIN_SCOPES,
  type MetaGraphDiagnosticCode,
  type MetaGraphDiagnostics,
  type MetaPublicInstagramAsset,
  type MetaPublicPageAsset,
} from '../../shared/types/meta-partner';
import { storage } from '../storage';
import {
  createMetaOnboardingSession,
  consumeMetaOnboardingSession,
  type MetaOnboardingChannel,
} from './meta-onboarding-session-store';

const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_URL = 'https://graph.facebook.com';

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: {
    data: {
      url: string;
    };
  };
  instagram_business_account?: InstagramAccount;
}

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
  linkedPageId?: string;
  linkedPageName?: string;
  linkedPageAccessToken?: string;
}

export interface PageWithInstagram extends FacebookPage {
  instagramAccount?: InstagramAccount;
  messengerEnabled: boolean;
}

export interface MetaDiscoveryResult {
  pages: PageWithInstagram[];
  instagramAccounts: InstagramAccount[];
  diagnostics: MetaGraphDiagnostics;
}

interface TokenDebugData {
  data?: {
    app_id?: string;
    type?: string;
    is_valid?: boolean;
    scopes?: string[];
    granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
    error?: { message?: string; code?: number };
  };
}

const META_CREDENTIAL_ERROR_CODES = new Set([190, 101, 102]);
const META_THROTTLE_ERROR_CODES = new Set([4, 17, 32, 613]);

export type { MetaOnboardingChannel };

export async function matchesActiveMetaPartnerWebhookVerifyToken(
  token: unknown
): Promise<boolean> {
  if (token == null || token === '') {
    return false;
  }
  const partnerConfig = await storage.getPartnerConfiguration('meta');
  if (!partnerConfig?.isActive || !partnerConfig.webhookVerifyToken) {
    return false;
  }
  return String(token) === partnerConfig.webhookVerifyToken;
}

export async function createOnboardingSession(
  userAccessToken: string,
  userId: number,
  companyId: number,
  channel: MetaOnboardingChannel,
  discoveredAssetIds: string[]
): Promise<string> {
  return createMetaOnboardingSession(
    userAccessToken,
    userId,
    companyId,
    channel,
    discoveredAssetIds
  );
}

export async function consumeOnboardingSession(
  sessionId: string,
  userId: number,
  companyId: number,
  channel: MetaOnboardingChannel,
  assetId?: string
): Promise<string | null> {
  return consumeMetaOnboardingSession(sessionId, userId, companyId, channel, assetId);
}

function normalizeScopeList(scopes: string[] | undefined): string[] {
  if (!scopes?.length) return [];
  return scopes.map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function buildDiagnostics(
  grantedScopes: string[],
  requiredScopes: readonly string[],
  options?: { restrictedScopes?: string[]; code?: MetaGraphDiagnosticCode; message?: string }
): MetaGraphDiagnostics {
  const granted = normalizeScopeList(grantedScopes);
  const required = requiredScopes.map((s) => s.toLowerCase());
  const missingScopes = required.filter((scope) => !granted.includes(scope));
  const restrictedScopes = normalizeScopeList(options?.restrictedScopes);

  let code = options?.code;
  let message = options?.message;

  if (!code && restrictedScopes.length > 0) {
    code = 'permission_restricted';
    message =
      message ||
      `Some permissions are restricted pending Meta App Review: ${restrictedScopes.join(', ')}`;
  } else if (!code && missingScopes.length > 0) {
    code = 'missing_permissions';
    message =
      message ||
      `Missing required permissions: ${missingScopes.join(', ')}. Re-authorize and grant all requested permissions.`;
  }

  return {
    grantedScopes: granted,
    missingScopes,
    restrictedScopes,
    code,
    message: message || 'Token scopes look sufficient for discovery.',
  };
}

function toPublicInstagramAccount(account: InstagramAccount): MetaPublicInstagramAsset {
  return {
    id: account.id,
    username: account.username,
    name: account.name,
    profile_picture_url: account.profile_picture_url,
    account_type: account.account_type,
    linkedPageId: account.linkedPageId,
    linkedPageName: account.linkedPageName,
  };
}

export function sanitizePageForClient(page: PageWithInstagram): MetaPublicPageAsset {
  return {
    id: page.id,
    name: page.name,
    category: page.category,
    messengerEnabled: page.messengerEnabled,
    instagramAccount: page.instagramAccount
      ? toPublicInstagramAccount(page.instagramAccount)
      : undefined,
  };
}

export function sanitizeInstagramAccountForClient(account: InstagramAccount): MetaPublicInstagramAsset {
  return toPublicInstagramAccount(account);
}

/**
 * Exchange an authorization code from Facebook Login for Business for a user access token.
 */
export async function exchangeAuthorizationCode(
  code: string,
  appId: string,
  appSecret: string
): Promise<string> {
  try {
    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/oauth/access_token`,
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code,
        },
      }
    );

    if (response.data?.access_token) {
      return response.data.access_token;
    }

    throw new Error('No access token returned from authorization code exchange');
  } catch (error: any) {
    console.error('Error exchanging authorization code:', error.response?.data || error.message);
    throw new Error(
      `Failed to exchange authorization code: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

async function resolveUserAccessToken(
  accessToken: string | undefined,
  authorizationCode: string | undefined,
  appId: string,
  appSecret: string
): Promise<string> {
  if (accessToken?.trim()) {
    return accessToken.trim();
  }
  if (authorizationCode?.trim()) {
    return exchangeAuthorizationCode(authorizationCode.trim(), appId, appSecret);
  }
  throw new Error('User access token or authorization code is required');
}

export async function inspectTokenScopes(
  userAccessToken: string,
  appId: string,
  appSecret: string,
  requiredScopes: readonly string[]
): Promise<MetaGraphDiagnostics> {
  try {
    const appAccessToken = `${appId}|${appSecret}`;
    const response = await axios.get<TokenDebugData>(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/debug_token`,
      {
        params: {
          input_token: userAccessToken,
          access_token: appAccessToken,
        },
      }
    );

    const data = response.data?.data;
    if (!data?.is_valid) {
      return {
        grantedScopes: [],
        missingScopes: [...requiredScopes],
        restrictedScopes: [],
        appId: data?.app_id,
        code: 'token_invalid_or_expired',
        message: data?.error?.message || 'Access token is invalid or expired.',
      };
    }

    const grantedScopes = data.scopes || [];
    const granular = data.granular_scopes || [];
    const restrictedScopes = granular
      .filter((entry) => requiredScopes.includes(entry.scope) && (!entry.target_ids || entry.target_ids.length === 0))
      .map((entry) => entry.scope);

    return {
      ...buildDiagnostics(grantedScopes, requiredScopes, { restrictedScopes }),
      appId: data.app_id,
    };
  } catch (error: any) {
    console.error('Error inspecting token scopes:', error.response?.data || error.message);
    const graphError = error.response?.data?.error;
    const graphErrorMessage = graphError?.message;
    const graphErrorType = graphError?.type;
    const graphErrorCode = Number(graphError?.code);
    const isCredentialError =
      META_CREDENTIAL_ERROR_CODES.has(graphErrorCode) ||
      (graphErrorType === 'OAuthException' && !META_THROTTLE_ERROR_CODES.has(graphErrorCode));
    return {
      grantedScopes: [],
      missingScopes: [...requiredScopes],
      restrictedScopes: [],
      code: isCredentialError ? 'meta_oauth_error' : 'meta_transport_error',
      message: `Could not verify token permissions: ${graphErrorMessage || error.message}`,
    };
  }
}

async function getUserPages(
  userAccessToken: string,
  includeInstagram = false
): Promise<FacebookPage[]> {
  try {
    const baseFields = 'id,name,access_token,category,picture';
    const fields = includeInstagram
      ? `${baseFields},instagram_business_account{id,username,name,profile_picture_url,account_type}`
      : baseFields;

    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/me/accounts`,
      {
        params: {
          fields,
          access_token: userAccessToken,
        },
      }
    );

    if (response.data?.data) {
      return response.data.data;
    }

    return [];
  } catch (error: any) {
    console.error('Error fetching user Pages:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Facebook Pages: ${error.response?.data?.error?.message || error.message}`);
  }
}

function buildInstagramAccountFromPage(page: FacebookPage): InstagramAccount | undefined {
  const igRaw = page.instagram_business_account;
  if (!igRaw?.id) {
    return undefined;
  }

  return {
    id: igRaw.id,
    username: igRaw.username,
    name: igRaw.name,
    profile_picture_url: igRaw.profile_picture_url,
    account_type: igRaw.account_type,
    linkedPageId: page.id,
    linkedPageName: page.name,
    linkedPageAccessToken: page.access_token,
  };
}

interface BusinessInstagramFallbackResult {
  accounts: InstagramAccount[];
  foundBusinessAccountsWithoutLinkedPage: boolean;
}

function indexPageByInstagramId(
  pageByIgId: Map<string, FacebookPage>,
  pages: FacebookPage[]
): void {
  for (const page of pages) {
    const igId = page.instagram_business_account?.id;
    if (igId && page.access_token) {
      pageByIgId.set(igId, page);
    }
  }
}

async function fetchBusinessPages(
  businessId: string,
  userAccessToken: string
): Promise<FacebookPage[]> {
  const pageFields =
    'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,account_type}';

  for (const edge of ['client_pages', 'owned_pages'] as const) {
    try {
      const response = await axios.get(
        `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${businessId}/${edge}`,
        {
          params: {
            fields: pageFields,
            access_token: userAccessToken,
          },
        }
      );
      if (response.data?.data?.length) {
        return response.data.data;
      }
    } catch {
      // Try the next business page edge.
    }
  }

  return [];
}

/**
 * Fallback discovery via Business Manager — only when business_management is granted
 * and each account can be matched to a Page with a resolvable Page token.
 */
async function getBusinessOwnedInstagramAccounts(
  userAccessToken: string,
  knownPages: FacebookPage[]
): Promise<BusinessInstagramFallbackResult> {
  const pageByIgId = new Map<string, FacebookPage>();
  indexPageByInstagramId(pageByIgId, knownPages);

  const accounts: InstagramAccount[] = [];
  const seenIds = new Set<string>();
  let foundBusinessAccountsWithoutLinkedPage = false;

  try {
    const businessesResponse = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/me/businesses`,
      { params: { access_token: userAccessToken } }
    );
    const businesses: Array<{ id: string }> = businessesResponse.data?.data || [];

    for (const business of businesses) {
      const igResponse = await axios.get(
        `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${business.id}/owned_instagram_accounts`,
        {
          params: {
            fields: 'id,username,name,profile_picture_url,account_type',
            access_token: userAccessToken,
          },
        }
      );

      const businessPages = await fetchBusinessPages(business.id, userAccessToken);
      indexPageByInstagramId(pageByIgId, businessPages);

      for (const ig of igResponse.data?.data || []) {
        if (!ig?.id || seenIds.has(ig.id)) {
          continue;
        }

        const linkedPage = pageByIgId.get(ig.id);
        if (!linkedPage?.access_token) {
          foundBusinessAccountsWithoutLinkedPage = true;
          continue;
        }

        seenIds.add(ig.id);
        accounts.push({
          id: ig.id,
          username: ig.username,
          name: ig.name,
          profile_picture_url: ig.profile_picture_url,
          account_type: ig.account_type,
          linkedPageId: linkedPage.id,
          linkedPageName: linkedPage.name,
          linkedPageAccessToken: linkedPage.access_token,
        });
      }
    }

    return { accounts, foundBusinessAccountsWithoutLinkedPage };
  } catch (error: any) {
    console.error(
      'Business Instagram discovery fallback failed:',
      error.response?.data || error.message
    );
    return { accounts: [], foundBusinessAccountsWithoutLinkedPage: false };
  }
}

function stripAccessTokenField<T extends Record<string, unknown>>(obj: T): T {
  const copy = { ...obj };
  delete copy.access_token;
  return copy;
}

export function sanitizeMetaConnectionForClient(connection: {
  id: number;
  channelType: string;
  accountId: string;
  accountName: string;
  status?: string | null;
  accessToken?: string | null;
  connectionData?: unknown;
}) {
  const safeConnectionData =
    connection.connectionData &&
    typeof connection.connectionData === 'object' &&
    connection.connectionData !== null
      ? { ...(connection.connectionData as Record<string, unknown>) }
      : undefined;

  if (safeConnectionData) {
    delete safeConnectionData.appSecret;
    if (safeConnectionData.pageInfo && typeof safeConnectionData.pageInfo === 'object') {
      safeConnectionData.pageInfo = stripAccessTokenField(
        safeConnectionData.pageInfo as Record<string, unknown>
      );
    }
  }

  return {
    id: connection.id,
    channelType: connection.channelType,
    accountId: connection.accountId,
    accountName: connection.accountName,
    status: connection.status ?? 'unknown',
    connectionData: safeConnectionData,
  };
}

/**
 * Primary Instagram discovery — Page-linked accounts only.
 */
export async function getInstagramAccounts(
  userAccessToken: string,
  appId?: string,
  appSecret?: string
): Promise<{ accounts: InstagramAccount[]; diagnostics: MetaGraphDiagnostics }> {
  if (appId && appSecret) {
    const scopeDiagnostics = await inspectTokenScopes(
      userAccessToken,
      appId,
      appSecret,
      INSTAGRAM_LOGIN_SCOPES
    );

    if (scopeDiagnostics.missingScopes.length > 0 || scopeDiagnostics.restrictedScopes.length > 0) {
      return { accounts: [], diagnostics: scopeDiagnostics };
    }
  }

  const rawPages = await getUserPages(userAccessToken, true);
  const accounts: InstagramAccount[] = [];

  for (const page of rawPages) {
    const instagramAccount = buildInstagramAccountFromPage(page);
    if (instagramAccount) {
      accounts.push(instagramAccount);
    }
  }

  let foundBusinessAccountsWithoutLinkedPage = false;

  if (accounts.length === 0 && appId && appSecret) {
    const businessScopeDiagnostics = await inspectTokenScopes(
      userAccessToken,
      appId,
      appSecret,
      ['business_management']
    );
    if (
      businessScopeDiagnostics.missingScopes.length === 0 &&
      businessScopeDiagnostics.restrictedScopes.length === 0
    ) {
      const fallbackResult = await getBusinessOwnedInstagramAccounts(userAccessToken, rawPages);
      accounts.push(...fallbackResult.accounts);
      foundBusinessAccountsWithoutLinkedPage = fallbackResult.foundBusinessAccountsWithoutLinkedPage;
    }
  }

  const diagnostics: MetaGraphDiagnostics =
    accounts.length === 0
      ? {
          grantedScopes: [],
          missingScopes: [],
          restrictedScopes: [],
          code: 'no_eligible_assets',
          message: foundBusinessAccountsWithoutLinkedPage
            ? 'Instagram Business accounts were found in Business Manager, but none are linked to an accessible Facebook Page with a valid Page token. Link Instagram to a Page and try again.'
            : 'No Instagram Business accounts linked to your Facebook Pages were found. Link Instagram to a Page and try again.',
        }
      : appId && appSecret
        ? await inspectTokenScopes(userAccessToken, appId, appSecret, INSTAGRAM_LOGIN_SCOPES)
        : {
            grantedScopes: [],
            missingScopes: [],
            restrictedScopes: [],
            message: 'Instagram accounts discovered via linked Pages.',
          };

  return { accounts, diagnostics };
}

/**
 * Messenger Page discovery with Messenger-only permission validation.
 * Linked Instagram data is optional enrichment when Instagram scopes are also granted.
 */
export async function getMessengerPages(
  userAccessToken: string,
  appId: string,
  appSecret: string
): Promise<{ pages: PageWithInstagram[]; diagnostics: MetaGraphDiagnostics }> {
  const scopeDiagnostics = await inspectTokenScopes(
    userAccessToken,
    appId,
    appSecret,
    MESSENGER_LOGIN_SCOPES
  );

  if (scopeDiagnostics.missingScopes.length > 0 || scopeDiagnostics.restrictedScopes.length > 0) {
    return { pages: [], diagnostics: scopeDiagnostics };
  }

  const instagramScopeDiagnostics = await inspectTokenScopes(
    userAccessToken,
    appId,
    appSecret,
    INSTAGRAM_LOGIN_SCOPES
  );
  const canEnrichInstagram =
    instagramScopeDiagnostics.missingScopes.length === 0 &&
    instagramScopeDiagnostics.restrictedScopes.length === 0;

  const rawPages = await getUserPages(userAccessToken, canEnrichInstagram);
  const pages: PageWithInstagram[] = rawPages.map((page) => ({
    ...page,
    instagramAccount: canEnrichInstagram ? buildInstagramAccountFromPage(page) : undefined,
    messengerEnabled: true,
  }));

  const diagnostics: MetaGraphDiagnostics =
    pages.length === 0
      ? {
          ...scopeDiagnostics,
          code: 'no_eligible_assets',
          message:
            'No Facebook Pages were found. Create a Page or ensure you granted Page access during login.',
        }
      : scopeDiagnostics;

  return { pages, diagnostics };
}

/**
 * Get long-lived Page access token from a user access token.
 */
export async function getPageAccessToken(
  pageId: string,
  userAccessToken: string,
  appId: string,
  appSecret: string
): Promise<string> {
  try {
    const longLivedUserTokenResponse = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: userAccessToken,
        },
      }
    );

    const longLivedUserToken = longLivedUserTokenResponse.data.access_token;

    const pageResponse = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${pageId}`,
      {
        params: {
          fields: 'access_token',
          access_token: longLivedUserToken,
        },
      }
    );

    if (pageResponse.data?.access_token) {
      return pageResponse.data.access_token;
    }

    throw new Error('Page access token not found in response');
  } catch (error: any) {
    console.error('Error getting Page access token:', error.response?.data || error.message);
    throw new Error(`Failed to get Page access token: ${error.response?.data?.error?.message || error.message}`);
  }
}

const MESSENGER_APP_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_deliveries',
  'message_reads',
] as const;

export const INSTAGRAM_APP_WEBHOOK_FIELDS = ['messages', 'message_reactions'] as const;

/**
 * Configure app-level Meta webhook callback URL and subscribed fields.
 */
export async function configureAppWebhookSubscription(
  appId: string,
  appSecret: string,
  object: 'page' | 'instagram',
  callbackUrl: string,
  verifyToken: string,
  subscribedFields: readonly string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const appAccessToken = `${appId}|${appSecret}`;
    const response = await axios.post(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${appId}/subscriptions`,
      null,
      {
        params: {
          object,
          callback_url: callbackUrl,
          verify_token: verifyToken,
          fields: subscribedFields.join(','),
          access_token: appAccessToken,
        },
      }
    );

    if (response.data?.success === true) {
      return { success: true };
    }

    return {
      success: false,
      error: response.data?.error?.message || 'App webhook subscription did not return success',
    };
  } catch (error: any) {
    const message = error.response?.data?.error?.message || error.message;
    console.error('Error configuring app webhook subscription:', message);
    return { success: false, error: message };
  }
}

export async function configureMessengerAppWebhook(
  appId: string,
  appSecret: string,
  callbackUrl: string,
  verifyToken: string
): Promise<{ success: boolean; error?: string }> {
  return configureAppWebhookSubscription(
    appId,
    appSecret,
    'page',
    callbackUrl,
    verifyToken,
    MESSENGER_APP_WEBHOOK_FIELDS
  );
}

export async function configureInstagramAppWebhook(
  appId: string,
  appSecret: string,
  callbackUrl: string,
  verifyToken: string
): Promise<{ success: boolean; error?: string }> {
  return configureAppWebhookSubscription(
    appId,
    appSecret,
    'instagram',
    callbackUrl,
    verifyToken,
    INSTAGRAM_APP_WEBHOOK_FIELDS
  );
}

/**
 * Subscribe a Page to app webhooks (Messenger).
 */
export async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string,
  subscribedFields: string[] = [...MESSENGER_APP_WEBHOOK_FIELDS]
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${pageId}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: subscribedFields.join(','),
          access_token: pageAccessToken,
        },
      }
    );

    if (response.data?.success === true) {
      return { success: true };
    }

    return { success: false, error: 'Page webhook subscription did not return success' };
  } catch (error: any) {
    const message = error.response?.data?.error?.message || error.message;
    console.error('Error subscribing Page to webhooks:', message);
    return { success: false, error: message };
  }
}

/**
 * Asset-level Instagram messaging webhook subscription via the linked Page subscribed_apps edge.
 */
export async function subscribeInstagramAccountWebhooks(
  linkedPageId: string,
  pageAccessToken: string,
  subscribedFields: string[] = [...INSTAGRAM_APP_WEBHOOK_FIELDS]
): Promise<{ success: boolean; error?: string }> {
  return subscribePageToWebhooks(linkedPageId, pageAccessToken, subscribedFields);
}

export async function getInstagramAccessToken(
  instagramAccountId: string,
  pageAccessToken: string
): Promise<string> {
  try {
    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${instagramAccountId}`,
      {
        params: {
          fields: 'id,username',
          access_token: pageAccessToken,
        },
      }
    );

    if (response.data?.id) {
      return pageAccessToken;
    }

    throw new Error('Instagram account not found or invalid');
  } catch (error: any) {
    console.error('Error getting Instagram access token:', error.response?.data || error.message);
    throw new Error(`Failed to get Instagram access token: ${error.response?.data?.error?.message || error.message}`);
  }
}

export async function getPageInfo(
  pageId: string,
  accessToken: string,
  includeInstagram = false
): Promise<any> {
  try {
    const fields = includeInstagram
      ? 'id,name,category,picture,access_token,instagram_business_account{id,username,name,profile_picture_url,account_type}'
      : 'id,name,category,picture,access_token';

    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${pageId}`,
      {
        params: {
          fields,
          access_token: accessToken,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error fetching Page info:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Page info: ${error.response?.data?.error?.message || error.message}`);
  }
}

export async function getInstagramAccountInfo(instagramAccountId: string, accessToken: string): Promise<any> {
  try {
    const response = await axios.get(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${instagramAccountId}`,
      {
        params: {
          fields: 'id,username,name,profile_picture_url,account_type',
          access_token: accessToken,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error fetching Instagram account info:', error.response?.data || error.message);
    throw new Error(`Failed to fetch Instagram account info: ${error.response?.data?.error?.message || error.message}`);
  }
}

export { MESSENGER_LOGIN_SCOPES, INSTAGRAM_LOGIN_SCOPES, resolveUserAccessToken };

/** Alias for inspectTokenScopes — backed by Meta's /debug_token endpoint. */
export const debugToken = inspectTokenScopes;
