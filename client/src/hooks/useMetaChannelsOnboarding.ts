import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  fetchMetaPartnerConfig,
  validateFacebookConfig,
  clearConfigCache,
  resolveChannelLoginConfigId,
} from '@/lib/facebook-config';
import { initFacebookSDK, FacebookLoginResponse } from '@/lib/facebook-sdk';
import type {
  MetaGraphDiagnosticCode,
  MetaPublicInstagramAsset,
  MetaPublicPageAsset,
} from '@shared/types/meta-partner';

export type MetaOnboardingChannel = 'instagram' | 'messenger';

export type MetaPageAsset = MetaPublicPageAsset;
export type MetaInstagramAsset = MetaPublicInstagramAsset;

export function diagnosticMessage(code?: MetaGraphDiagnosticCode, fallback?: string): string {
  switch (code) {
    case 'configuration_missing':
      return 'Meta partner configuration is incomplete. Contact your administrator.';
    case 'missing_permissions':
      return 'Required Facebook permissions were not granted. Log in again and approve every requested permission.';
    case 'permission_restricted':
      return 'Some permissions are restricted until Meta App Review grants Advanced Access. Complete App Review before production rollout.';
    case 'app_review_pending':
      return 'Meta App Review is pending for one or more permissions. External users outside test roles cannot connect until review is approved.';
    case 'no_eligible_assets':
      return 'No eligible Pages or Instagram accounts were found for this login.';
    case 'webhook_subscription_failed':
      return 'The connection was created but webhook subscription failed. Check webhook URL configuration and retry.';
    default:
      return fallback || 'An unexpected error occurred during Meta onboarding.';
  }
}

export function useMetaChannelsOnboarding(channel: MetaOnboardingChannel) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configValid, setConfigValid] = useState(false);
  const [devFallback, setDevFallback] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configGuidance, setConfigGuidance] = useState<string | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [onboardingSessionId, setOnboardingSessionId] = useState<string | undefined>();
  const [pages, setPages] = useState<MetaPageAsset[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<MetaInstagramAsset[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryCode, setDiscoveryCode] = useState<MetaGraphDiagnosticCode | undefined>();

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
        case 'session_expired':
          return t('settings.metaChannelsDiagnostics.session_expired', 'Your onboarding session expired. Log in again and retry.');
        case 'validation_error':
          return t('settings.metaChannelsDiagnostics.validation_error', 'Check the required setup details and try again.');
        case 'connection_failed':
          return t('settings.metaChannelsDiagnostics.connection_failed', 'The connection could not be created. Please try again.');
        case 'invalid_action':
          return t('settings.metaChannelsDiagnostics.invalid_action', 'This setup action is not supported. Restart setup.');
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
        return;
      }

      const validation = await validateFacebookConfig(config, channel);
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
    } finally {
      setConfigLoading(false);
    }
  }, [channel, t]);

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
    setOnboardingSessionId(undefined);
    setDiscoveryError(null);
    setDiscoveryCode(undefined);
  }, []);

  const handleDiscoveryResponse = useCallback(
    async (response: FacebookLoginResponse, fetchAction: 'fetch_pages' | 'fetch_accounts') => {
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
        return;
      }

      const endpoint =
        channel === 'messenger'
          ? '/api/channel-connections/meta-messenger-embedded-signup'
          : '/api/channel-connections/meta-instagram-embedded-signup';

      try {
        setLoading(true);
        const apiResponse = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(accessToken ? { accessToken } : {}),
            ...(authorizationCode ? { authorizationCode } : {}),
            action: fetchAction,
          }),
        });

        const data = await apiResponse.json();
        if (!apiResponse.ok) {
          const code = data.code as MetaGraphDiagnosticCode | undefined;
          setDiscoveryCode(code);
          setDiscoveryError(localizedDiagnosticMessage(code));
          throw Object.assign(new Error(localizedDiagnosticMessage(code)), { diagnosticCode: code });
        }

        if (data.onboardingSessionId) {
          setOnboardingSessionId(data.onboardingSessionId);
        }

        if (data.diagnostics?.code) {
          setDiscoveryCode(data.diagnostics.code);
          if (data.diagnostics.code !== 'no_eligible_assets' || !(data.pages?.length || data.accounts?.length)) {
            setDiscoveryError(localizedDiagnosticMessage(data.diagnostics.code));
          }
        }

        if (data.pages) {
          setPages(data.pages);
        }
        if (data.accounts) {
          setInstagramAccounts(data.accounts);
        }

        if (!(data.pages?.length || data.accounts?.length)) {
          setDiscoveryCode(data.diagnostics?.code || 'no_eligible_assets');
          setDiscoveryError(
            localizedDiagnosticMessage(data.diagnostics?.code || 'no_eligible_assets')
          );
          toast({
            title:
              channel === 'messenger'
                ? t('settings.metaChannelsDiagnostics.no_pages_found', 'No Pages Found')
                : t('settings.metaChannelsDiagnostics.no_instagram_accounts_found', 'No Instagram Accounts Found'),
            description: localizedDiagnosticMessage(data.diagnostics?.code || 'no_eligible_assets'),
            variant: 'destructive',
          });
        }
      } catch (error: any) {
        toast({
          title: t('settings.metaChannelsDiagnostics.error', 'Error'),
          description:
            error.diagnosticCode
              ? localizedDiagnosticMessage(error.diagnosticCode)
              : t('settings.metaChannelsDiagnostics.failed_to_discover_meta_assets', 'Failed to discover Meta assets.'),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [channel, toast, t, localizedDiagnosticMessage]
  );

  const loginConfigId = resolveChannelLoginConfigId(partnerConfig, channel);

  return {
    sdkInitialized,
    loading,
    setLoading,
    configValid,
    devFallback,
    configError,
    configGuidance,
    partnerConfig,
    configLoading,
    onboardingSessionId,
    pages,
    instagramAccounts,
    discoveryError,
    discoveryCode,
    loginConfigId,
    loadPartnerConfiguration,
    refreshConfiguration,
    resetDiscovery,
    handleDiscoveryResponse,
    diagnosticMessage: localizedDiagnosticMessage,
  };
}
