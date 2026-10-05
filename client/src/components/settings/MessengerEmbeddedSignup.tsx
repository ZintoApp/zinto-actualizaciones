import React, { useState, useEffect } from 'react';
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
import { launchMessengerSignup } from '@/lib/facebook-sdk';
import { useMetaChannelsOnboarding } from '@/hooks/useMetaChannelsOnboarding';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MessengerEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [connectionName, setConnectionName] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');

  const {
    sdkInitialized,
    loading,
    setLoading,
    configValid,
    devFallback,
    configError,
    configGuidance,
    configLoading,
    onboardingSessionId,
    pages,
    discoveryError,
    discoveryCode,
    loginConfigId,
    loadPartnerConfiguration,
    refreshConfiguration,
    resetDiscovery,
    handleDiscoveryResponse,
    diagnosticMessage,
  } = useMetaChannelsOnboarding('messenger');

  useEffect(() => {
    if (isOpen) {
      loadPartnerConfiguration();
      resetDiscovery();
      setSelectedPageId('');
    }
  }, [isOpen, loadPartnerConfiguration, resetDiscovery]);

  const canLaunchSignup = configValid && (Boolean(loginConfigId) || devFallback);

  const launchSignup = async () => {
    if (!connectionName.trim()) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_connection_name_required', 'Connection Name Required'),
        description: t(
          'settings.messengerEmbeddedSignup.toast_connection_name_required_desc',
          'Please enter a connection name to continue.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!canLaunchSignup) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_configuration_error', 'Configuration Error'),
        description: configError || diagnosticMessage(configGuidance as any),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    if (!sdkInitialized) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_please_wait', 'Please Wait'),
        description: t(
          'settings.messengerEmbeddedSignup.toast_please_wait_desc',
          'The signup process is still initializing. Please try again in a moment.'
        ),
      });
      setLoading(false);
      return;
    }

    try {
      await launchMessengerSignup(
        loginConfigId,
        (response) => handleDiscoveryResponse(response, 'fetch_pages')
      );
    } catch (error: any) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_launch_error', 'Launch Error'),
        description: t('settings.messengerEmbeddedSignup.toast_launch_error_desc', 'Failed to launch Messenger signup flow.'),
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleConnectPage = async () => {
    const selectedPage = pages.find((p) => p.id === selectedPageId);
    if (!selectedPage) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_page_required', 'Page Required'),
        description: t(
          'settings.messengerEmbeddedSignup.toast_page_required_desc',
          'Please select a Facebook Page to connect.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!onboardingSessionId) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_session_expired', 'Session Expired'),
        description: t(
          'settings.messengerEmbeddedSignup.toast_session_expired_desc',
          'Your login session expired. Log in again and retry.'
        ),
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/channel-connections/meta-messenger-embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionName: connectionName.trim() || `Messenger - ${selectedPage.name}`,
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          onboardingSessionId,
          action: 'create_connection',
        }),
      });

      const result = await response.json();
      if (response.ok) {
        if (result.webhookSubscriptionStatus && !result.webhookSubscriptionStatus.success) {
          toast({
            title: t('settings.messengerEmbeddedSignup.toast_connected_with_warnings', 'Connected with warnings'),
            description: diagnosticMessage('webhook_subscription_failed'),
            variant: 'destructive',
          });
        } else {
          toast({
            title: t('settings.messengerEmbeddedSignup.toast_connection_successful', 'Connection Successful'),
            description: t(
              'settings.messengerEmbeddedSignup.toast_connection_successful_desc',
              'Messenger connection for "{{pageName}}" has been created successfully.',
              { pageName: selectedPage.name }
            ),
          });
        }
        onSuccess();
        onClose();
      } else {
        throw Object.assign(new Error('Failed to create Messenger connection.'), { diagnosticCode: result.code });
      }
    } catch (error: any) {
      toast({
        title: t('settings.messengerEmbeddedSignup.toast_connection_error', 'Connection Error'),
        description: error.diagnosticCode
          ? diagnosticMessage(error.diagnosticCode)
          : t('settings.messengerEmbeddedSignup.toast_connection_error_desc', 'Failed to create Messenger connection.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const statusBanner = () => {
    if (configLoading) return null;

    if (devFallback) {
      return (
        <div className="mt-3 flex p-2 rounded border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="text-xs">
            {t(
              'settings.messengerEmbeddedSignup.development_fallback',
              'Development fallback: launching with manual Facebook scopes because no Login for Business configuration ID is set.'
            )}
          </p>
        </div>
      );
    }

    if (!configValid && configError) {
      return (
        <div className="mt-3 flex flex-col rounded border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 [&_strong]:text-red-950 dark:[&_strong]:text-red-100">
          <p className="text-xs font-medium">
            <strong>
              {configGuidance === 'configuration_missing'
                ? t('settings.messengerEmbeddedSignup.configuration_missing_label', 'Configuration missing:')
                : t('settings.messengerEmbeddedSignup.configuration_error_label', 'Configuration error:')}
            </strong>{' '}
            {configError}
          </p>
          <p className="text-xs mt-1">{diagnosticMessage(configGuidance as any)}</p>
          <Button data-tour="components-settings-messengerembeddedsignup.button.settings.messengerEmbeddedSignup.refresh_configuration" type="button" variant="outline" size="sm" className="mt-2 text-xs" onClick={refreshConfiguration}>
            {t('settings.messengerEmbeddedSignup.refresh_configuration', 'Refresh Configuration')}
          </Button>
        </div>
      );
    }

    if (discoveryError) {
      return (
        <div className="mt-3 flex flex-col rounded border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 [&_strong]:text-red-950 dark:[&_strong]:text-red-100">
          <p className="text-xs font-medium">
            <strong>{t('settings.messengerEmbeddedSignup.discovery_issue_label', 'Discovery issue:')}</strong>{' '}
            {discoveryError}
          </p>
          {discoveryCode === 'permission_restricted' || discoveryCode === 'app_review_pending' ? (
            <p className="text-xs mt-1">
              {t(
                'settings.messengerEmbeddedSignup.app_review_required',
                'Complete Meta App Review and Advanced Access for Messenger Page permissions before external users can connect.'
              )}
            </p>
          ) : null}
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-messengerembeddedsignup.dialogcontent.settings.messengerEmbeddedSignup.title" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.messengerEmbeddedSignup.title', 'Facebook Messenger - Easy Setup')}</DialogTitle>
          <DialogDescription>
            {t(
              'settings.messengerEmbeddedSignup.description',
              'Connect your Facebook Page to enable Messenger conversations via Facebook Login for Business.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              {t('settings.messengerEmbeddedSignup.how_it_works', 'How it works:')}
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                {t(
                  'settings.messengerEmbeddedSignup.step_login',
                  'Log in with Facebook using your configured Login for Business flow'
                )}
              </li>
              <li>
                {t(
                  'settings.messengerEmbeddedSignup.step_select_page',
                  'Select the Page you want to connect for Messenger'
                )}
              </li>
              <li>
                {t(
                  'settings.messengerEmbeddedSignup.step_exchange_token',
                  'We exchange a long-lived Page token and subscribe the Page to app webhooks'
                )}
              </li>
            </ol>
            {statusBanner()}
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="connectionName">
                {t('settings.messengerEmbeddedSignup.connection_name', 'Connection Name')}
              </Label>
              <Input data-tour="components-settings-messengerembeddedsignup.input.settings.messengerEmbeddedSignup.connection_name_placeholder"
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder={t(
                  'settings.messengerEmbeddedSignup.connection_name_placeholder',
                  'e.g. My Messenger Page'
                )}
                className="mt-1"
                required
              />
            </div>

            {pages.length > 0 && (
              <div>
                <Label htmlFor="pageSelect">
                  {t('settings.messengerEmbeddedSignup.select_facebook_page', 'Select Facebook Page')}
                </Label>
                <select data-tour="components-settings-messengerembeddedsignup.select.settings.messengerEmbeddedSignup.select_page_placeholder"
                  id="pageSelect"
                  value={selectedPageId}
                  onChange={(e) => setSelectedPageId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">
                    {t('settings.messengerEmbeddedSignup.select_page_placeholder', 'Select a Page...')}
                  </option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name} {page.category ? `(${page.category})` : ''}
                      {page.instagramAccount ? ` — @${page.instagramAccount.username}` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    'settings.messengerEmbeddedSignup.linked_instagram_hint',
                    'Pages with linked Instagram accounts show the handle for reference.'
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button data-tour="components-settings-messengerembeddedsignup.button.settings.messengerEmbeddedSignup.cancel" type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('settings.messengerEmbeddedSignup.cancel', 'Cancel')}
          </Button>
          {pages.length === 0 ? (
            <Button data-tour="components-settings-messengerembeddedsignup.button.settings.messengerEmbeddedSignup.loading_pages"
              onClick={launchSignup}
              disabled={loading || !sdkInitialized || !canLaunchSignup || configLoading || !connectionName.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.messengerEmbeddedSignup.loading_pages', 'Loading Pages...')}
                </>
              ) : (
                <>
                  <i className="ri-facebook-fill w-4 h-4 mr-2"></i>
                  {t('settings.messengerEmbeddedSignup.connect_with_facebook', 'Connect with Facebook')}
                </>
              )}
            </Button>
          ) : (
            <Button data-tour="components-settings-messengerembeddedsignup.button.settings.messengerEmbeddedSignup.connecting" onClick={handleConnectPage} disabled={loading || !selectedPageId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.messengerEmbeddedSignup.connecting', 'Connecting...')}
                </>
              ) : (
                <>
                  <i className="ri-check-line w-4 h-4 mr-2"></i>
                  {t('settings.messengerEmbeddedSignup.connect_page', 'Connect Page')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
