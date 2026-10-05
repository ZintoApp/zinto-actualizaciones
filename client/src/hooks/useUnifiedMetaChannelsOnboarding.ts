import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  fetchMetaPartnerConfig,
  validateFacebookConfig,
  clearConfigCache,
  resolveMetaChannelsOnboardingMode,
  resolveChannelLoginConfigId,
} from '@/lib/facebook-config';
import {
  initFacebookSDK,
  FacebookLoginResponse,
  launchMetaChannelsSignup,
  launchMessengerSignup,
  launchInstagramSignup,
} from '@/lib/facebook-sdk';
import type {
  MetaChannelsOnboardingMode,
  MetaGraphDiagnosticCode,
  MetaGraphDiagnostics,
  MetaPublicInstagramAsset,
  MetaPublicPageAsset,
} from '@shared/types/meta-partner';

export type MetaPageAsset = MetaPublicPageAsset;
export type MetaInstagramAsset = MetaPublicInstagramAsset;

type ChannelConnectResult = {
  success: boolean;
  warning?: boolean;
  error?: string;
};

type DiscoveryStepResult = {
  assetCount: number;
  diagnostics: MetaGraphDiagnostics | null;
};

export function useUnifiedMetaChannelsOnboarding() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [configValid, setConfigValid] = useState(false);
  const [devFallback, setDevFallback] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configGuidance, setConfigGuidance] = useState<string | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<MetaChannelsOnboardingMode>('unavailable');
  const [pages, setPages] = useState<MetaPageAsset[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<MetaInstagramAsset[]>([]);
  const [messengerOnboardingSessionId, setMessengerOnboardingSessionId] = useState<string | undefined>();
  const [instagramOnboardingSessionId, setInstagramOnboardingSessionId] = useState<string | undefined>();
  const [messengerDiagnostics, setMessengerDiagnostics] = useState<MetaGraphDiagnostics | null>(null);
  const [instagramDiagnostics, setInstagramDiagnostics] = useState<MetaGraphDiagnostics | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryCode, setDiscoveryCode] = useState<MetaGraphDiagnosticCode | undefined>();
  const [partialDiscoveryWarning, setPartialDiscoveryWarning] = useState<string | null>(null);
  const [twoStepPhase, setTwoStepPhase] = useState<'messenger' | 'instagram' | 'done'>('messenger');

  const localizedDiagnosticMessage = useCallback(
    (code?: MetaGraphDiagnosticCode, fallback?: string): string => {
      switch (code) {
        case 'configuration_missing':
          return t(
            'settings.metaChannelsDiagnostics.configuration_missing',
            'Meta partner configuration is incomplete. Contact your administrator.'
          );
        case 'missing_permissions':
          return t(
            'settings.metaChannelsDiagnostics.missing_permissions',
            'Required Facebook permissions were not granted. Log in again and approve every requested permission.'
          );
        case 'permission_restricted':
          return t(
            'settings.metaChannelsDiagnostics.permission_restricted',
            'Some permissions are restricted until Meta App Review grants Advanced Access. Complete App Review before production rollout.'
          );
        case 'app_review_pending':
          return t(
            'settings.metaChannelsDiagnostics.app_review_pending',
            'Meta App Review is pending for one or more permissions. External users outside test roles cannot connect until review is approved.'
          );
        case 'no_eligible_assets':
          return t(
            'settings.metaChannelsDiagnostics.no_eligible_assets',
            'No eligible Pages or Instagram accounts were found for this login.'
          );
        case 'webhook_subscription_failed':
          return t(
            'settings.metaChannelsDiagnostics.webhook_subscription_failed',
            'The connection was created but webhook subscription failed. Check webhook URL configuration and retry.'
          );
        default:
          return fallback || t(
            'settings.metaChannelsDiagnostics.unexpected_error',
            'An unexpected error occurred during Meta onboarding.'
          );
      }
    },
    [t]
  );

  const loadPartnerConfiguration = useCallback(async () => {
    try {
      setConfigLoading(true);
      setDiscoveryError(null);
      setDiscoveryCode(undefined);
      setPartialDiscoveryWarning(null);

      const config = await fetchMetaPartnerConfig();
      if (!config) {
        setConfigError(
          t(
            'settings.metaChannelsDiagnostics.meta_partner_config_not_available',
            'Meta Partner Configuration is not available'
          )
        );
        setConfigGuidance('configuration_missing');
        setConfigValid(false);
        setDevFallback(false);
        setOnboardingMode('unavailable');
        return;
      }

      const mode = resolveMetaChannelsOnboardingMode(config);
      setOnboardingMode(mode);

      const validation = await validateFacebookConfig(config, 'meta_channels');
      if (!validation.isValid) {
        const msg = t(
          'settings.metaChannelsDiagnostics.missing_configuration',
          'Missing configuration: {{fields}}',
          { fields: validation.missingFields.join(', ') }
        );
        setConfigError(msg);
        setConfigGuidance(validation.guidance || 'configuration_missing');
        setConfigValid(false);
        setDevFallback(false);
        return;
      }

      setPartnerConfig(config);
      setConfigValid(true);
      setDevFallback(Boolean(validation.devFallback));
      setConfigError(null);
      setConfigGuidance(null);

      await initFacebookSDK(config.partnerApiKey, config.apiVersion || 'v25.0');
      setSdkInitialized(true);
    } catch {
      setConfigError(
        t(
          'settings.metaChannelsDiagnostics.failed_to_load_partner_configuration',
          'Failed to load partner configuration'
        )
      );
      setConfigGuidance('configuration_missing');
      setConfigValid(false);
      setDevFallback(false);
      setOnboardingMode('unavailable');
    } finally {
      setConfigLoading(false);
    }
  }, [t]);

  const refreshConfiguration = useCallback(async () => {
    clearConfigCache();
    await loadPartnerConfiguration();
    toast({
      title: t(
        'settings.metaChannelsDiagnostics.configuration_refreshed',
        'Configuration Refreshed'
      ),
      description: t(
        'settings.metaChannelsDiagnostics.configuration_refreshed_desc',
        'Configuration has been refreshed successfully.'
      ),
    });
  }, [loadPartnerConfiguration, toast, t]);

  const resetDiscovery = useCallback(() => {
    setPages([]);
    setInstagramAccounts([]);
    setMessengerOnboardingSessionId(undefined);
    setInstagramOnboardingSessionId(undefined);
    setMessengerDiagnostics(null);
    setInstagramDiagnostics(null);
    setDiscoveryError(null);
    setDiscoveryCode(undefined);
    setPartialDiscoveryWarning(null);
    setTwoStepPhase('messenger');
  }, []);

  const applyUnifiedDiscoveryData = useCallback(
    (data: {
      pages?: MetaPageAsset[];
      instagramAccounts?: MetaInstagramAsset[];
      diagnostics?: { messenger?: MetaGraphDiagnostics; instagram?: MetaGraphDiagnostics };
      messengerOnboardingSessionId?: string;
      instagramOnboardingSessionId?: string;
      code?: MetaGraphDiagnosticCode;
      message?: string;
    }) => {
      const nextPages = data.pages || [];
      const nextAccounts = data.instagramAccounts || [];
      const messengerDiag = data.diagnostics?.messenger;
      const instagramDiag = data.diagnostics?.instagram;

      setPages(nextPages);
      setInstagramAccounts(nextAccounts);
      setMessengerDiagnostics(messengerDiag || null);
      setInstagramDiagnostics(instagramDiag || null);

      if (data.messengerOnboardingSessionId) {
        setMessengerOnboardingSessionId(data.messengerOnboardingSessionId);
      }
      if (data.instagramOnboardingSessionId) {
        setInstagramOnboardingSessionId(data.instagramOnboardingSessionId);
      }

      const hasPages = nextPages.length > 0;
      const hasAccounts = nextAccounts.length > 0;

      if (!hasPages && !hasAccounts) {
        const code = data.code || messengerDiag?.code || instagramDiag?.code || 'no_eligible_assets';
        setDiscoveryCode(code);
        setDiscoveryError(localizedDiagnosticMessage(code, data.message || messengerDiag?.message || instagramDiag?.message));
        return false;
      }

      setDiscoveryCode(undefined);
      setDiscoveryError(null);

      const warnings: string[] = [];
      if (!hasPages && messengerDiag?.code) {
        warnings.push(
          `${t('settings.metaChannelsDiagnostics.messenger_prefix', 'Messenger:')} ${localizedDiagnosticMessage(messengerDiag.code, messengerDiag.message)}`
        );
      }
      if (!hasAccounts && instagramDiag?.code) {
        warnings.push(
          `${t('settings.metaChannelsDiagnostics.instagram_prefix', 'Instagram:')} ${localizedDiagnosticMessage(instagramDiag.code, instagramDiag.message)}`
        );
      }
      setPartialDiscoveryWarning(warnings.length > 0 ? warnings.join(' ') : null);

      return true;
    },
    [localizedDiagnosticMessage, t]
  );

  const fetchUnifiedAssets = useCallback(
    async (response: FacebookLoginResponse) => {
      const accessToken = response.authResponse?.accessToken;
      const authorizationCode = response.authResponse?.code;

      if (!accessToken && !authorizationCode) {
        setLoading(false);
        toast({
          title: t('settings.metaChannelsDiagnostics.login_cancelled', 'Login Cancelled'),
          description: t(
            'settings.metaChannelsDiagnostics.login_cancelled_desc',
            'The Facebook login process was cancelled or encountered an error.'
          ),
          variant: 'destructive',
        });
        return false;
      }

      try {
        setLoading(true);
        const apiResponse = await fetch('/api/channel-connections/meta-channels-embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(accessToken ? { accessToken } : {}),
            ...(authorizationCode ? { authorizationCode } : {}),
            action: 'fetch_assets',
          }),
        });

        const data = await apiResponse.json();
        if (!apiResponse.ok) {
          const code = data.code as MetaGraphDiagnosticCode | undefined;
          setDiscoveryCode(code);
          setDiscoveryError(localizedDiagnosticMessage(code, data.message || data.error));
          return false;
        }

        return applyUnifiedDiscoveryData(data);
      } catch (error: any) {
        toast({
          title: t('settings.metaChannelsDiagnostics.error', 'Error'),
          description:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_discover_meta_assets',
              'Failed to discover Meta assets.'
            ),
          variant: 'destructive',
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [applyUnifiedDiscoveryData, toast, t, localizedDiagnosticMessage]
  );

  const fetchMessengerPages = useCallback(
    async (response: FacebookLoginResponse): Promise<DiscoveryStepResult> => {
      const accessToken = response.authResponse?.accessToken;
      const authorizationCode = response.authResponse?.code;

      if (!accessToken && !authorizationCode) {
        toast({
          title: t('settings.metaChannelsDiagnostics.login_cancelled', 'Login Cancelled'),
          description: t(
            'settings.metaChannelsDiagnostics.messenger_login_cancelled_desc',
            'The Messenger login step was cancelled or encountered an error.'
          ),
          variant: 'destructive',
        });
        return { assetCount: 0, diagnostics: null };
      }

      try {
        const apiResponse = await fetch('/api/channel-connections/meta-messenger-embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(accessToken ? { accessToken } : {}),
            ...(authorizationCode ? { authorizationCode } : {}),
            action: 'fetch_pages',
          }),
        });

        const data = await apiResponse.json();
        const pageCount = data.pages?.length ?? 0;
        const diagnostics: MetaGraphDiagnostics | null = !apiResponse.ok
          ? data.diagnostics || {
              grantedScopes: [],
              missingScopes: [],
              restrictedScopes: [],
              code: (data.code as MetaGraphDiagnosticCode | undefined) || 'no_eligible_assets',
              message:
                data.message ||
                data.error ||
                t(
                  'settings.metaChannelsDiagnostics.failed_to_discover_messenger_pages',
                  'Failed to discover Messenger Pages.'
                ),
            }
          : data.diagnostics || null;

        if (data.pages) setPages(data.pages);
        if (data.onboardingSessionId) setMessengerOnboardingSessionId(data.onboardingSessionId);
        if (diagnostics) setMessengerDiagnostics(diagnostics);

        return { assetCount: pageCount, diagnostics };
      } catch (error: any) {
        toast({
          title: t('settings.metaChannelsDiagnostics.error', 'Error'),
          description:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_discover_messenger_pages',
              'Failed to discover Messenger Pages.'
            ),
          variant: 'destructive',
        });
        return { assetCount: 0, diagnostics: null };
      }
    },
    [toast, t]
  );

  const fetchInstagramAccounts = useCallback(
    async (response: FacebookLoginResponse): Promise<DiscoveryStepResult> => {
      const accessToken = response.authResponse?.accessToken;
      const authorizationCode = response.authResponse?.code;

      if (!accessToken && !authorizationCode) {
        toast({
          title: t('settings.metaChannelsDiagnostics.login_cancelled', 'Login Cancelled'),
          description: t(
            'settings.metaChannelsDiagnostics.instagram_login_cancelled_desc',
            'The Instagram login step was cancelled or encountered an error.'
          ),
          variant: 'destructive',
        });
        return { assetCount: 0, diagnostics: null };
      }

      try {
        const apiResponse = await fetch('/api/channel-connections/meta-instagram-embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(accessToken ? { accessToken } : {}),
            ...(authorizationCode ? { authorizationCode } : {}),
            action: 'fetch_accounts',
          }),
        });

        const data = await apiResponse.json();
        const accountCount = data.accounts?.length ?? 0;
        const diagnostics: MetaGraphDiagnostics | null = !apiResponse.ok
          ? data.diagnostics || {
              grantedScopes: [],
              missingScopes: [],
              restrictedScopes: [],
              code: (data.code as MetaGraphDiagnosticCode | undefined) || 'no_eligible_assets',
              message:
                data.message ||
                data.error ||
                t(
                  'settings.metaChannelsDiagnostics.failed_to_discover_instagram_accounts',
                  'Failed to discover Instagram accounts.'
                ),
            }
          : data.diagnostics || null;

        if (data.accounts) setInstagramAccounts(data.accounts);
        if (data.onboardingSessionId) setInstagramOnboardingSessionId(data.onboardingSessionId);
        if (diagnostics) setInstagramDiagnostics(diagnostics);

        return { assetCount: accountCount, diagnostics };
      } catch (error: any) {
        toast({
          title: t('settings.metaChannelsDiagnostics.error', 'Error'),
          description:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_discover_instagram_accounts',
              'Failed to discover Instagram accounts.'
            ),
          variant: 'destructive',
        });
        return { assetCount: 0, diagnostics: null };
      }
    },
    [toast, t]
  );

  const runTwoStepInstagramLogin = useCallback(async (): Promise<DiscoveryStepResult> => {
    const instagramConfigId = resolveChannelLoginConfigId(partnerConfig, 'instagram');

    return new Promise((resolve) => {
      try {
        launchInstagramSignup(instagramConfigId, async (response) => {
          const instagramResult = await fetchInstagramAccounts(response);
          setTwoStepPhase('done');
          resolve(instagramResult);
        });
      } catch (error: any) {
        toast({
          title: t('settings.metaChannelsDiagnostics.launch_error', 'Launch Error'),
          description:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_launch_instagram',
              'Failed to launch Instagram signup flow.'
            ),
          variant: 'destructive',
        });
        resolve({ assetCount: 0, diagnostics: null });
      }
    });
  }, [fetchInstagramAccounts, partnerConfig, toast, t]);

  const finalizeTwoStepDiscovery = useCallback(
    (
      messengerResult: DiscoveryStepResult,
      instagramResult: DiscoveryStepResult
    ): boolean => {
      const hasMessengerAssets = messengerResult.assetCount > 0;
      const hasInstagramAssets = instagramResult.assetCount > 0;
      const hasAnyAssets = hasMessengerAssets || hasInstagramAssets;

      if (!hasAnyAssets) {
        const messengerCode = messengerResult.diagnostics?.code;
        const instagramCode = instagramResult.diagnostics?.code;
        const code = messengerCode || instagramCode || 'no_eligible_assets';
        setDiscoveryCode(code);
        setDiscoveryError(
          localizedDiagnosticMessage(
            code,
            messengerResult.diagnostics?.message || instagramResult.diagnostics?.message
          )
        );
        setPartialDiscoveryWarning(null);
        return false;
      }

      setDiscoveryCode(undefined);
      setDiscoveryError(null);

      const warnings: string[] = [];
      if (!hasMessengerAssets) {
        if (messengerResult.diagnostics?.code) {
          warnings.push(
            `${t('settings.metaChannelsDiagnostics.messenger_prefix', 'Messenger:')} ${localizedDiagnosticMessage(
              messengerResult.diagnostics.code,
              messengerResult.diagnostics.message
            )}`
          );
        } else if (hasInstagramAssets) {
          warnings.push(
            `${t('settings.metaChannelsDiagnostics.messenger_prefix', 'Messenger:')} ${t(
              'settings.metaChannelsDiagnostics.messenger_cancelled_or_no_pages',
              'Login was cancelled or no Pages were discovered. Continue with Instagram if available.'
            )}`
          );
        }
      }
      if (!hasInstagramAssets) {
        if (instagramResult.diagnostics?.code) {
          warnings.push(
            `${t('settings.metaChannelsDiagnostics.instagram_prefix', 'Instagram:')} ${localizedDiagnosticMessage(
              instagramResult.diagnostics.code,
              instagramResult.diagnostics.message
            )}`
          );
        } else if (hasMessengerAssets) {
          warnings.push(
            `${t('settings.metaChannelsDiagnostics.instagram_prefix', 'Instagram:')} ${t(
              'settings.metaChannelsDiagnostics.instagram_cancelled_or_no_accounts',
              'Login was cancelled or no accounts were discovered. Continue with Messenger if available.'
            )}`
          );
        }
      }
      setPartialDiscoveryWarning(warnings.length > 0 ? warnings.join(' ') : null);

      return true;
    },
    [localizedDiagnosticMessage, t]
  );

  const runTwoStepDiscovery = useCallback(async (): Promise<boolean> => {
    const messengerConfigId = resolveChannelLoginConfigId(partnerConfig, 'messenger');

    return new Promise((resolve) => {
      try {
        launchMessengerSignup(messengerConfigId, async (response) => {
          const messengerResult = await fetchMessengerPages(response);

          setTwoStepPhase('instagram');
          const instagramResult = await runTwoStepInstagramLogin();

          setLoading(false);
          resolve(finalizeTwoStepDiscovery(messengerResult, instagramResult));
        });
      } catch (error: any) {
        setLoading(false);
        toast({
          title: t('settings.metaChannelsDiagnostics.launch_error', 'Launch Error'),
          description:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_launch_messenger',
              'Failed to launch Messenger signup flow.'
            ),
          variant: 'destructive',
        });
        resolve(false);
      }
    });
  }, [
    fetchMessengerPages,
    finalizeTwoStepDiscovery,
    partnerConfig,
    runTwoStepInstagramLogin,
    toast,
    t,
  ]);

  const runSingleDiscovery = useCallback(async (): Promise<boolean> => {
    const metaChannelsConfigId = partnerConfig?.metaChannelsConfigId?.trim();

    return new Promise((resolve) => {
      try {
        launchMetaChannelsSignup(metaChannelsConfigId, async (response) => {
          const ok = await fetchUnifiedAssets(response);
          resolve(ok);
        });
      } catch (error: any) {
        setLoading(false);
        toast({
          title: t('settings.metaChannelsDiagnostics.launch_error', 'Launch Error'),
          description:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_launch_meta_channels',
              'Failed to launch Meta Channels signup flow.'
            ),
          variant: 'destructive',
        });
        resolve(false);
      }
    });
  }, [fetchUnifiedAssets, partnerConfig, toast, t]);

  const runDevFallbackDiscovery = useCallback(async (): Promise<boolean> => {
    return runTwoStepDiscovery();
  }, [runTwoStepDiscovery]);

  const launchDiscovery = useCallback(async (): Promise<boolean> => {
    if (!sdkInitialized) {
      toast({
        title: t('settings.metaChannelsDiagnostics.please_wait', 'Please Wait'),
        description: t(
          'settings.metaChannelsDiagnostics.signup_initializing',
          'The signup process is still initializing. Please try again in a moment.'
        ),
      });
      return false;
    }

    setLoading(true);
    setDiscoveryError(null);
    setDiscoveryCode(undefined);
    setPartialDiscoveryWarning(null);

    if (onboardingMode === 'single') {
      return runSingleDiscovery();
    }

    if (onboardingMode === 'two_step') {
      return runTwoStepDiscovery();
    }

    if (devFallback) {
      return runDevFallbackDiscovery();
    }

    setLoading(false);
    setDiscoveryError(
      t(
        'settings.metaChannelsDiagnostics.meta_channels_config_missing',
        'Meta Channels Facebook Login for Business configuration is missing.'
      )
    );
    setConfigGuidance('configuration_missing');
    return false;
  }, [
    devFallback,
    onboardingMode,
    runDevFallbackDiscovery,
    runSingleDiscovery,
    runTwoStepDiscovery,
    sdkInitialized,
    toast,
    t,
  ]);

  const createMessengerConnection = useCallback(
    async (pageId: string, pageName: string, connectionName: string): Promise<ChannelConnectResult> => {
      if (!messengerOnboardingSessionId) {
        return {
          success: false,
          error: t(
            'settings.metaChannelsDiagnostics.messenger_session_expired',
            'Messenger onboarding session expired. Log in again and retry.'
          ),
        };
      }

      try {
        const response = await fetch('/api/channel-connections/meta-messenger-embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionName,
            pageId,
            pageName,
            onboardingSessionId: messengerOnboardingSessionId,
            action: 'create_connection',
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          return {
            success: false,
            error:
              result.message ||
              result.error ||
              t(
                'settings.metaChannelsDiagnostics.failed_to_create_messenger_connection',
                'Failed to create Messenger connection'
              ),
          };
        }

        const hasWebhookWarning =
          result.webhookSubscriptionStatus && !result.webhookSubscriptionStatus.success;
        return { success: true, warning: Boolean(hasWebhookWarning) };
      } catch (error: any) {
        return {
          success: false,
          error:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_create_messenger_connection',
              'Failed to create Messenger connection'
            ),
        };
      }
    },
    [messengerOnboardingSessionId, t]
  );

  const createInstagramConnection = useCallback(
    async (
      instagramAccountId: string,
      username: string,
      linkedPageId: string,
      connectionName: string
    ): Promise<ChannelConnectResult> => {
      if (!instagramOnboardingSessionId) {
        return {
          success: false,
          error: t(
            'settings.metaChannelsDiagnostics.instagram_session_expired',
            'Instagram onboarding session expired. Log in again and retry.'
          ),
        };
      }

      try {
        const response = await fetch('/api/channel-connections/meta-instagram-embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionName,
            instagramAccountId,
            username,
            linkedPageId,
            onboardingSessionId: instagramOnboardingSessionId,
            action: 'create_connection',
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          return {
            success: false,
            error:
              result.message ||
              result.error ||
              t(
                'settings.metaChannelsDiagnostics.failed_to_create_instagram_connection',
                'Failed to create Instagram connection'
              ),
          };
        }

        const hasWebhookWarning =
          result.webhookSubscriptionStatus && !result.webhookSubscriptionStatus.success;
        return { success: true, warning: Boolean(hasWebhookWarning) };
      } catch (error: any) {
        return {
          success: false,
          error:
            error.message ||
            t(
              'settings.metaChannelsDiagnostics.failed_to_create_instagram_connection',
              'Failed to create Instagram connection'
            ),
        };
      }
    },
    [instagramOnboardingSessionId, t]
  );

  const connectSelectedChannels = useCallback(
    async (options: {
      connectMessenger: boolean;
      connectInstagram: boolean;
      pageId?: string;
      pageName?: string;
      instagramAccountId?: string;
      username?: string;
      linkedPageId?: string;
      messengerConnectionName?: string;
      instagramConnectionName?: string;
    }): Promise<{
      messenger?: ChannelConnectResult;
      instagram?: ChannelConnectResult;
    }> => {
      setConnecting(true);
      const results: { messenger?: ChannelConnectResult; instagram?: ChannelConnectResult } = {};

      try {
        if (options.connectMessenger && options.pageId && options.pageName) {
          results.messenger = await createMessengerConnection(
            options.pageId,
            options.pageName,
            options.messengerConnectionName || `Messenger - ${options.pageName}`
          );
        }

        if (options.connectInstagram && options.instagramAccountId && options.username && options.linkedPageId) {
          results.instagram = await createInstagramConnection(
            options.instagramAccountId,
            options.username,
            options.linkedPageId,
            options.instagramConnectionName || `Instagram - ${options.username}`
          );
        }

        return results;
      } finally {
        setConnecting(false);
      }
    },
    [createInstagramConnection, createMessengerConnection]
  );

  const canLaunchSignup =
    configValid &&
    (onboardingMode === 'single' || onboardingMode === 'two_step' || devFallback);

  return {
    sdkInitialized,
    loading,
    connecting,
    configValid,
    devFallback,
    configError,
    configGuidance,
    partnerConfig,
    configLoading,
    onboardingMode,
    pages,
    instagramAccounts,
    messengerOnboardingSessionId,
    instagramOnboardingSessionId,
    messengerDiagnostics,
    instagramDiagnostics,
    discoveryError,
    discoveryCode,
    partialDiscoveryWarning,
    twoStepPhase,
    canLaunchSignup,
    loadPartnerConfiguration,
    refreshConfiguration,
    resetDiscovery,
    launchDiscovery,
    connectSelectedChannels,
    diagnosticMessage: localizedDiagnosticMessage,
  };
}
