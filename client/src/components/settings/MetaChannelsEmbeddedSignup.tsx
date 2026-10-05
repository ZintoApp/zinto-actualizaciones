import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useUnifiedMetaChannelsOnboarding } from '@/hooks/useUnifiedMetaChannelsOnboarding';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'intro' | 'login' | 'select_assets' | 'choose_channels' | 'connecting' | 'result';

type ResultState = {
  requestedMessenger?: boolean;
  requestedInstagram?: boolean;
  messengerSuccess?: boolean;
  messengerWarning?: boolean;
  messengerError?: string;
  instagramSuccess?: boolean;
  instagramWarning?: boolean;
  instagramError?: string;
};

export function MetaChannelsEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('intro');
  const [connectionName, setConnectionName] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedInstagramAccountId, setSelectedInstagramAccountId] = useState('');
  const [connectMessenger, setConnectMessenger] = useState(true);
  const [connectInstagram, setConnectInstagram] = useState(true);
  const [resultState, setResultState] = useState<ResultState>({});

  const {
    loading,
    connecting,
    configValid,
    devFallback,
    configError,
    configGuidance,
    configLoading,
    onboardingMode,
    pages,
    instagramAccounts,
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
    diagnosticMessage,
  } = useUnifiedMetaChannelsOnboarding();

  const channelDiagnosticMessage = (
    diagnostics: { missingScopes?: string[]; code?: string; message?: string } | null | undefined,
    channel: 'messenger' | 'instagram'
  ): string | null => {
    if (!diagnostics?.code && !diagnostics?.missingScopes?.length) return null;

    const missing = diagnostics.missingScopes || [];
    if (missing.includes('pages_manage_metadata')) {
      return t(
        'settings.metaChannelsEmbeddedSignup.missing_pages_manage_metadata',
        'Missing `pages_manage_metadata`; Page webhook subscription cannot be completed.'
      );
    }
    if (channel === 'messenger' && missing.some((s) => s.includes('pages_messaging') || s.includes('messaging'))) {
      return t(
        'settings.metaChannelsEmbeddedSignup.missing_messenger_permissions',
        'Missing Messenger Page messaging permissions.'
      );
    }
    if (channel === 'instagram' && missing.includes('instagram_manage_messages')) {
      return t(
        'settings.metaChannelsEmbeddedSignup.missing_instagram_messaging_permission',
        'Missing Instagram messaging permission.'
      );
    }
    if (diagnostics.code === 'permission_restricted' || diagnostics.code === 'app_review_pending') {
      return t(
        'settings.metaChannelsEmbeddedSignup.permission_restricted_by_app_review',
        'Permission restricted by Meta App Review. External users cannot complete onboarding until Advanced Access is approved.'
      );
    }

    return diagnosticMessage(diagnostics.code as any, diagnostics.message);
  };

  useEffect(() => {
    if (isOpen) {
      loadPartnerConfiguration();
      resetDiscovery();
      setStep('intro');
      setConnectionName('');
      setSelectedPageId('');
      setSelectedInstagramAccountId('');
      setConnectMessenger(true);
      setConnectInstagram(true);
      setResultState({});
    }
  }, [isOpen, loadPartnerConfiguration, resetDiscovery]);

  useEffect(() => {
    if (step === 'select_assets' && pages.length > 0 && !selectedPageId) {
      setSelectedPageId(pages[0].id);
    }
  }, [step, pages, selectedPageId]);

  useEffect(() => {
    if (step === 'select_assets' && pages.length + instagramAccounts.length > 0) {
      setConnectMessenger(pages.length > 0);
      setConnectInstagram(instagramAccounts.some((a) => Boolean(a.linkedPageId)));
    }
  }, [step, pages.length, instagramAccounts]);

  const selectedPage = useMemo(
    () => pages.find((p) => p.id === selectedPageId),
    [pages, selectedPageId]
  );

  const linkedInstagramForPage = selectedPage?.instagramAccount;

  const instagramAccountsForPage = useMemo(() => {
    if (!selectedPageId) return instagramAccounts;
    return instagramAccounts.filter(
      (account) => !account.linkedPageId || account.linkedPageId === selectedPageId
    );
  }, [instagramAccounts, selectedPageId]);

  const selectedInstagramAccount = useMemo(
    () => instagramAccounts.find((a) => a.id === selectedInstagramAccountId),
    [instagramAccounts, selectedInstagramAccountId]
  );

  useEffect(() => {
    if (linkedInstagramForPage) {
      setSelectedInstagramAccountId(linkedInstagramForPage.id);
    } else if (
      selectedInstagramAccountId &&
      !instagramAccountsForPage.some((a) => a.id === selectedInstagramAccountId)
    ) {
      setSelectedInstagramAccountId('');
    }
  }, [linkedInstagramForPage, instagramAccountsForPage, selectedInstagramAccountId]);

  const messengerAvailable = pages.length > 0;
  const instagramAvailable = instagramAccounts.some((a) => Boolean(a.linkedPageId));

  const handleStartLogin = async () => {
    if (!connectionName.trim()) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_connection_name_required', 'Connection Name Required'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_connection_name_required_desc',
          'Please enter a connection name to continue.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!canLaunchSignup) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_configuration_error', 'Configuration Error'),
        description:
          configError ||
          t(
            'settings.metaChannelsDiagnostics.meta_channels_config_missing',
            'Meta Channels Facebook Login for Business configuration is missing.'
          ),
        variant: 'destructive',
      });
      return;
    }

    setStep('login');
    const ok = await launchDiscovery();
    if (ok) {
      setStep('select_assets');
    } else {
      setStep('intro');
    }
  };

  const handleContinueToChannelChoice = () => {
    if (!messengerAvailable && !instagramAvailable) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_no_assets_found', 'No Assets Found'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_no_assets_found_desc',
          'No Facebook Pages or linked Instagram accounts were discovered.'
        ),
        variant: 'destructive',
      });
      return;
    }

    setStep('choose_channels');
  };

  const handleConnect = async () => {
    if (!connectMessenger && !connectInstagram) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_channel_required', 'Channel Required'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_channel_required_desc',
          'Select at least one channel to connect.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (connectMessenger && !selectedPage) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_page_required', 'Page Required'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_page_required_desc',
          'Please select a Facebook Page for Messenger.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (connectInstagram && !selectedInstagramAccount?.linkedPageId) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_instagram_account_required', 'Instagram Account Required'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_instagram_account_required_desc',
          'Selected Page has no linked Instagram professional account.'
        ),
        variant: 'destructive',
      });
      return;
    }

    setStep('connecting');

    const baseName = connectionName.trim();
    const results = await connectSelectedChannels({
      connectMessenger,
      connectInstagram,
      pageId: selectedPage?.id,
      pageName: selectedPage?.name,
      instagramAccountId: selectedInstagramAccount?.id,
      username: selectedInstagramAccount?.username,
      linkedPageId: selectedInstagramAccount?.linkedPageId,
      messengerConnectionName: connectMessenger
        ? baseName || `Messenger - ${selectedPage?.name}`
        : undefined,
      instagramConnectionName: connectInstagram
        ? baseName || `Instagram - ${selectedInstagramAccount?.username}`
        : undefined,
    });

    const nextResult: ResultState = {
      requestedMessenger: connectMessenger,
      requestedInstagram: connectInstagram,
      messengerSuccess: results.messenger?.success,
      messengerWarning: results.messenger?.warning,
      messengerError: results.messenger?.error,
      instagramSuccess: results.instagram?.success,
      instagramWarning: results.instagram?.warning,
      instagramError: results.instagram?.error,
    };

    setResultState(nextResult);
    setStep('result');

    const anySuccess = Boolean(nextResult.messengerSuccess || nextResult.instagramSuccess);
    const anyWarning = Boolean(nextResult.messengerWarning || nextResult.instagramWarning);
    const messengerRequestedFailed = connectMessenger && !nextResult.messengerSuccess;
    const instagramRequestedFailed = connectInstagram && !nextResult.instagramSuccess;
    const anyRequestedFailed = messengerRequestedFailed || instagramRequestedFailed;
    const allRequestedSucceeded =
      (!connectMessenger || nextResult.messengerSuccess) &&
      (!connectInstagram || nextResult.instagramSuccess);

    if (anySuccess && anyRequestedFailed) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_partially_connected', 'Partially connected'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_partially_connected_desc',
          'One or more selected channels could not be connected. Review the result details.'
        ),
        variant: 'destructive',
      });
    } else if (anySuccess && allRequestedSucceeded && anyWarning) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_connected_with_warnings', 'Connected with warnings'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_connected_with_warnings_desc',
          'Connection was created, but webhook subscription failed.'
        ),
        variant: 'destructive',
      });
    } else if (anySuccess && allRequestedSucceeded && !anyWarning) {
      toast({
        title: t('settings.metaChannelsEmbeddedSignup.toast_connection_successful', 'Connection Successful'),
        description: t(
          'settings.metaChannelsEmbeddedSignup.toast_connection_successful_desc',
          'Your Meta channel connections were created successfully.'
        ),
      });
    }
  };

  const handleClose = () => {
    const anySuccess = Boolean(resultState.messengerSuccess || resultState.instagramSuccess);
    if (anySuccess) {
      onSuccess();
    }
    onClose();
  };

  const statusBanner = () => {
    if (configLoading) return null;

    if (devFallback) {
      return (
        <div className="mt-3 flex p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
          <p className="text-xs">
            {t(
              'settings.metaChannelsEmbeddedSignup.development_fallback',
              'Development fallback: launching with manual Facebook scopes because no Login for Business configuration ID is set.'
            )}
          </p>
        </div>
      );
    }

    if (!configValid && configError) {
      return (
        <div className="mt-3 flex flex-col p-2 text-red-800 bg-red-50 rounded border border-red-200">
          <p className="text-xs font-medium">
            <strong>
              {t('settings.metaChannelsEmbeddedSignup.configuration_missing_label', 'Configuration missing:')}
            </strong>{' '}
            {t(
              'settings.metaChannelsEmbeddedSignup.configuration_missing_message',
              'Meta Channels Facebook Login for Business configuration is missing.'
            )}
          </p>
          <p className="text-xs mt-1">{configError}</p>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.refresh_configuration" type="button" variant="outline" size="sm" className="mt-2 text-xs" onClick={refreshConfiguration}>
            {t('settings.metaChannelsEmbeddedSignup.refresh_configuration', 'Refresh Configuration')}
          </Button>
        </div>
      );
    }

    if (discoveryError) {
      const noPagesMsg =
        discoveryCode === 'no_eligible_assets'
          ? t(
              'settings.metaChannelsEmbeddedSignup.no_pages_found',
              'No Facebook Pages found. Create or select a Page during Facebook Login.'
            )
          : null;
      return (
        <div className="mt-3 flex flex-col p-2 text-red-800 bg-red-50 rounded border border-red-200">
          <p className="text-xs font-medium">
            <strong>{t('settings.metaChannelsEmbeddedSignup.discovery_issue_label', 'Discovery issue:')}</strong>{' '}
            {noPagesMsg || discoveryError}
          </p>
          {discoveryCode === 'permission_restricted' || discoveryCode === 'app_review_pending' ? (
            <p className="text-xs mt-1">
              {t(
                'settings.metaChannelsEmbeddedSignup.permission_restricted',
                'Permission restricted by Meta App Review. External users cannot complete onboarding until Advanced Access is approved.'
              )}
            </p>
          ) : null}
        </div>
      );
    }

    if (partialDiscoveryWarning) {
      return (
        <div className="mt-3 flex p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
          <p className="text-xs">{partialDiscoveryWarning}</p>
        </div>
      );
    }

    const messengerMsg = channelDiagnosticMessage(messengerDiagnostics, 'messenger');
    const instagramMsg = channelDiagnosticMessage(instagramDiagnostics, 'instagram');
    if (messengerMsg || instagramMsg) {
      return (
        <div className="mt-3 flex flex-col gap-1 p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
          {messengerMsg ? <p className="text-xs">{messengerMsg}</p> : null}
          {instagramMsg ? <p className="text-xs">{instagramMsg}</p> : null}
        </div>
      );
    }

    if (onboardingMode === 'two_step' && step !== 'result') {
      return (
        <div className="mt-3 flex p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
          <p className="text-xs">
            {t(
              'settings.metaChannelsEmbeddedSignup.two_step_notice',
              'A shared Meta Channels configuration is not available; continue through the official Messenger and Instagram setup steps.'
            )}
          </p>
        </div>
      );
    }

    return null;
  };

  const renderIntro = () => (
    <>
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 mb-4">
        <h3 className="text-sm font-medium mb-2">
          {t('settings.metaChannelsEmbeddedSignup.how_it_works', 'How it works:')}
        </h3>
        <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1">
          <li>
            {t(
              'settings.metaChannelsEmbeddedSignup.step_login',
              'Log in with Facebook using Meta Easy Setup (one login when configured, or guided two-step setup)'
            )}
          </li>
          <li>
            {t(
              'settings.metaChannelsEmbeddedSignup.step_select_assets',
              'Select your Facebook Page and linked Instagram professional account'
            )}
          </li>
          <li>
            {t(
              'settings.metaChannelsEmbeddedSignup.step_choose_channels',
              'Choose Messenger, Instagram Direct, or both'
            )}
          </li>
          <li>
            {t(
              'settings.metaChannelsEmbeddedSignup.step_create_connections',
              'We create connections and subscribe webhooks on your behalf'
            )}
          </li>
        </ol>
        {statusBanner()}
      </div>

      <div>
        <Label htmlFor="connectionName">
          {t('settings.metaChannelsEmbeddedSignup.connection_name', 'Connection Name')}
        </Label>
        <Input data-tour="components-settings-metachannelsembeddedsignup.input.settings.metaChannelsEmbeddedSignup.connection_name_placeholder"
          id="connectionName"
          value={connectionName}
          onChange={(e) => setConnectionName(e.target.value)}
          placeholder={t(
            'settings.metaChannelsEmbeddedSignup.connection_name_placeholder',
            'e.g. My Facebook & Instagram'
          )}
          className="mt-1"
          required
        />
      </div>
    </>
  );

  const renderLogin = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground text-center">
        {onboardingMode === 'two_step' && twoStepPhase === 'instagram'
          ? t(
              'settings.metaChannelsEmbeddedSignup.completing_instagram_login',
              'Completing Instagram login step...'
            )
          : onboardingMode === 'two_step'
            ? t(
                'settings.metaChannelsEmbeddedSignup.completing_messenger_login',
                'Completing Messenger login step...'
              )
            : t(
                'settings.metaChannelsEmbeddedSignup.completing_facebook_login_business',
                'Completing Facebook Login for Business...'
              )}
      </p>
      {statusBanner()}
    </div>
  );

  const renderSelectAssets = () => (
    <div className="space-y-4">
      {statusBanner()}

      {messengerAvailable && (
        <div>
          <Label htmlFor="pageSelect">
            {t('settings.metaChannelsEmbeddedSignup.select_facebook_page', 'Select Facebook Page')}
          </Label>
          <select data-tour="components-settings-metachannelsembeddedsignup.select.settings.metaChannelsEmbeddedSignup.select_page_placeholder"
            id="pageSelect"
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">
              {t('settings.metaChannelsEmbeddedSignup.select_page_placeholder', 'Select a Page...')}
            </option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name} {page.category ? `(${page.category})` : ''}
                {page.instagramAccount ? ` — @${page.instagramAccount.username}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedPage && !linkedInstagramForPage && instagramAccountsForPage.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            {t(
              'settings.metaChannelsEmbeddedSignup.selected_page_no_instagram',
              'Selected Page has no linked Instagram professional account.'
            )}
          </p>
        </div>
      )}

      {instagramAccountsForPage.length > 0 && (
        <div>
          <Label>{t('settings.metaChannelsEmbeddedSignup.linked_instagram_account', 'Linked Instagram Account')}</Label>
          <div className="mt-2 space-y-2">
            {instagramAccountsForPage.map((account) => (
              <button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.page_label"
                key={account.id}
                type="button"
                onClick={() => setSelectedInstagramAccountId(account.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selectedInstagramAccountId === account.id
                    ? 'border-[#E4405F] bg-pink-50 dark:bg-pink-950/20'
                    : 'border-input hover:bg-muted/50'
                }`}
              >
                {account.profile_picture_url ? (
                  <img
                    src={account.profile_picture_url}
                    alt={account.username}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <i className="ri-instagram-line text-lg" style={{ color: '#E4405F' }}></i>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {account.name && <p className="truncate text-sm font-medium">{account.name}</p>}
                  <p className="truncate text-sm text-muted-foreground">@{account.username}</p>
                  {account.linkedPageName && (
                    <p className="truncate text-xs text-muted-foreground/70">
                      {t('settings.metaChannelsEmbeddedSignup.page_label', 'Page:')} {account.linkedPageName}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderChooseChannels = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.metaChannelsEmbeddedSignup.choose_channels_for_connection',
          'Choose which channels to connect for {{connectionName}}.',
          { connectionName: connectionName.trim() }
        )}
      </p>

      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            id="connectMessenger"
            checked={connectMessenger}
            onCheckedChange={(checked) => setConnectMessenger(checked === true)}
            disabled={!messengerAvailable}
          />
          <div className="space-y-1">
            <Label htmlFor="connectMessenger" className="cursor-pointer">
              {t('settings.metaChannelsEmbeddedSignup.facebook_messenger', 'Facebook Messenger')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {selectedPage
                ? `${t('settings.metaChannelsEmbeddedSignup.page_label', 'Page:')} ${selectedPage.name}`
                : t('settings.metaChannelsEmbeddedSignup.no_page_selected', 'No Page selected')}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            id="connectInstagram"
            checked={connectInstagram}
            onCheckedChange={(checked) => setConnectInstagram(checked === true)}
            disabled={!instagramAvailable || !selectedInstagramAccount?.linkedPageId}
          />
          <div className="space-y-1">
            <Label htmlFor="connectInstagram" className="cursor-pointer">
              {t('settings.metaChannelsEmbeddedSignup.instagram_direct', 'Instagram Direct')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {selectedInstagramAccount
                ? `@${selectedInstagramAccount.username}`
                : t(
                    'settings.metaChannelsEmbeddedSignup.no_linked_instagram_account_available',
                    'No linked Instagram account available'
                  )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderConnecting = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground">
        {t('settings.metaChannelsEmbeddedSignup.creating_channel_connections', 'Creating channel connections...')}
      </p>
    </div>
  );

  const renderResult = () => {
    const requestedMessenger = Boolean(resultState.requestedMessenger);
    const requestedInstagram = Boolean(resultState.requestedInstagram);
    const messengerSucceeded = Boolean(resultState.messengerSuccess);
    const instagramSucceeded = Boolean(resultState.instagramSuccess);
    const messengerFailed = requestedMessenger && !messengerSucceeded;
    const instagramFailed = requestedInstagram && !instagramSucceeded;
    const anySuccess = messengerSucceeded || instagramSucceeded;
    const anyWarning = Boolean(resultState.messengerWarning || resultState.instagramWarning);
    const anyRequestedFailed = messengerFailed || instagramFailed;
    const allRequestedSucceeded =
      (!requestedMessenger || messengerSucceeded) && (!requestedInstagram || instagramSucceeded);
    const allFailed = !anySuccess;

    const renderMessengerStatus = () => {
      if (!requestedMessenger) return null;
      if (messengerSucceeded && resultState.messengerWarning) {
        return (
          <p className="text-xs text-amber-700 mt-1">
            {t(
              'settings.metaChannelsEmbeddedSignup.messenger_connected_webhook_failed',
              'Messenger connected, but webhook subscription failed.'
            )}
          </p>
        );
      }
      if (messengerSucceeded) {
        return (
          <p className="text-xs text-green-700 mt-1">
            {t('settings.metaChannelsEmbeddedSignup.messenger_connected', 'Messenger connected.')}
          </p>
        );
      }
      return (
        <p className="text-xs text-red-700 mt-1">
          Messenger:{' '}
          {resultState.messengerError ||
            t('settings.metaChannelsEmbeddedSignup.messenger_connection_failed', 'Connection failed.')}
        </p>
      );
    };

    const renderInstagramStatus = () => {
      if (!requestedInstagram) return null;
      if (instagramSucceeded && resultState.instagramWarning) {
        return (
          <p className="text-xs text-amber-700 mt-1">
            {t(
              'settings.metaChannelsEmbeddedSignup.instagram_connected_webhook_failed',
              'Instagram Direct connected, but webhook subscription failed.'
            )}
          </p>
        );
      }
      if (instagramSucceeded) {
        return (
          <p className="text-xs text-green-700 mt-1">
            {t('settings.metaChannelsEmbeddedSignup.instagram_connected', 'Instagram Direct connected.')}
          </p>
        );
      }
      return (
        <p className="text-xs text-red-700 mt-1">
          Instagram:{' '}
          {resultState.instagramError ||
            t('settings.metaChannelsEmbeddedSignup.instagram_connection_failed', 'Connection failed.')}
        </p>
      );
    };

    return (
      <div className="space-y-3">
        {allFailed ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">
              {t('settings.metaChannelsEmbeddedSignup.connection_failed', 'Connection failed')}
            </p>
            {renderMessengerStatus()}
            {renderInstagramStatus()}
          </div>
        ) : anyRequestedFailed ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">
              {t('settings.metaChannelsEmbeddedSignup.partially_connected', 'Partially connected')}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              {t(
                'settings.metaChannelsEmbeddedSignup.some_channels_failed',
                'Some selected channels could not be connected.'
              )}
            </p>
            {renderMessengerStatus()}
            {renderInstagramStatus()}
          </div>
        ) : anyWarning ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">
              {t('settings.metaChannelsEmbeddedSignup.connected_with_warnings', 'Connected with warnings')}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              {t(
                'settings.metaChannelsEmbeddedSignup.webhook_subscription_failed',
                'Connection was created, but webhook subscription failed.'
              )}
            </p>
            {renderMessengerStatus()}
            {renderInstagramStatus()}
          </div>
        ) : allRequestedSucceeded ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">
              {t(
                'settings.metaChannelsEmbeddedSignup.connections_created_successfully',
                'Connections created successfully'
              )}
            </p>
            {renderMessengerStatus()}
            {renderInstagramStatus()}
          </div>
        ) : null}
      </div>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 'intro':
        return renderIntro();
      case 'login':
        return renderLogin();
      case 'select_assets':
        return renderSelectAssets();
      case 'choose_channels':
        return renderChooseChannels();
      case 'connecting':
        return renderConnecting();
      case 'result':
        return renderResult();
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (step === 'intro') {
      return (
        <>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.cancel" type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('settings.metaChannelsEmbeddedSignup.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.starting"
            onClick={handleStartLogin}
            disabled={loading || !canLaunchSignup || configLoading || !connectionName.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.metaChannelsEmbeddedSignup.starting', 'Starting...')}
              </>
            ) : (
              <>
                <i className="ri-facebook-fill w-4 h-4 mr-2"></i>
                {t('settings.metaChannelsEmbeddedSignup.connect_with_facebook', 'Connect with Facebook')}
              </>
            )}
          </Button>
        </>
      );
    }

    if (step === 'login' || step === 'connecting') {
      return (
        <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.cancel" type="button" variant="ghost" onClick={onClose} disabled={loading || connecting}>
          {t('settings.metaChannelsEmbeddedSignup.cancel', 'Cancel')}
        </Button>
      );
    }

    if (step === 'select_assets') {
      return (
        <>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.cancel" type="button" variant="ghost" onClick={onClose}>
            {t('settings.metaChannelsEmbeddedSignup.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.continue" onClick={handleContinueToChannelChoice}>
            {t('settings.metaChannelsEmbeddedSignup.continue', 'Continue')}
          </Button>
        </>
      );
    }

    if (step === 'choose_channels') {
      return (
        <>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.back" type="button" variant="ghost" onClick={() => setStep('select_assets')} disabled={connecting}>
            {t('settings.metaChannelsEmbeddedSignup.back', 'Back')}
          </Button>
          <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.connecting" onClick={handleConnect} disabled={connecting || (!connectMessenger && !connectInstagram)}>
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.metaChannelsEmbeddedSignup.connecting', 'Connecting...')}
              </>
            ) : (
              t('settings.metaChannelsEmbeddedSignup.connect_channels', 'Connect Channels')
            )}
          </Button>
        </>
      );
    }

    if (step === 'result') {
      return (
        <Button data-tour="components-settings-metachannelsembeddedsignup.button.settings.metaChannelsEmbeddedSignup.done" onClick={handleClose}>
          {t('settings.metaChannelsEmbeddedSignup.done', 'Done')}
        </Button>
      );
    }

    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-tour="components-settings-metachannelsembeddedsignup.dialogcontent.settings.metaChannelsEmbeddedSignup.title" className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>
            {t('settings.metaChannelsEmbeddedSignup.title', 'Facebook + Instagram - Easy Setup')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'settings.metaChannelsEmbeddedSignup.description',
              'Connect Messenger and linked Instagram accounts with Meta Easy Setup.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">{renderStepContent()}</div>

        <DialogFooter>{renderFooter()}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
