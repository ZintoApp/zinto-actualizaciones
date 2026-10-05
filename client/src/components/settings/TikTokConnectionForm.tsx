import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import {
  buildTikTokBusinessAuthorizationUrl,
  normalizeTikTokOAuthRedirectUri,
  tryFinalizeTikTokAccountHolderAuthorizationUrl,
} from '@shared/types/tiktok';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TikTokPlatformConfig {
  clientKey: string;
  redirectUrl: string;
  allowedScopes: string[];
  accountHolderAuthorizationUrl?: string;
}

const OAUTH_POPUP_NAME = 'tiktok_oauth';
const OAUTH_POPUP_FEATURES =
  'width=500,height=640,left=' +
  Math.max(0, Math.round((typeof window !== 'undefined' ? window.screen.width : 1024) / 2 - 250)) +
  ',top=80,scrollbars=yes,resizable=yes';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export function TikTokConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(false);
  const [platformConfigured, setPlatformConfigured] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<TikTokPlatformConfig | null>(null);
  const [accountName, setAccountName] = useState('');
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkPlatformConfiguration();
    }
  }, [isOpen]);

  const checkPlatformConfiguration = async () => {
    setCheckingConfig(true);
    try {
      const response = await fetch('/api/partner-configurations/tiktok');

      if (response.ok) {
        const config = await response.json();
        if (config && config.isActive && config.clientKey && config.redirectUrl) {
          const rawRedirect = String(config.redirectUrl).trim();
          setPlatformConfigured(true);
          setPlatformConfig({
            clientKey: config.clientKey,
            redirectUrl: rawRedirect ? normalizeTikTokOAuthRedirectUri(rawRedirect) || rawRedirect : rawRedirect,
            allowedScopes: Array.isArray(config.allowedScopes) ? config.allowedScopes : [],
            ...(typeof config.accountHolderAuthorizationUrl === 'string' && config.accountHolderAuthorizationUrl.trim()
              ? { accountHolderAuthorizationUrl: config.accountHolderAuthorizationUrl.trim() }
              : {})
          });
        } else {
          setPlatformConfigured(false);
          setPlatformConfig(null);
        }
      } else {
        setPlatformConfigured(false);
        setPlatformConfig(null);
      }
    } catch (error) {
      console.error('Error checking platform configuration:', error);
      setPlatformConfigured(false);
      setPlatformConfig(null);
    } finally {
      setCheckingConfig(false);
    }
  };

  const handleConnectClick = async () => {
    if (!accountName.trim()) {
      toast({
        title: t('settings.tiktok_connection.toast.validation_title', 'Validation Error'),
        description: t('settings.tiktok_connection.toast.validation_description', 'Please enter an account name.'),
        variant: 'destructive'
      });
      return;
    }

    if (!platformConfig) {
      toast({
        title: t('settings.tiktok_connection.toast.config_error_title', 'Configuration Error'),
        description: t('settings.tiktok_connection.toast.config_error_description', 'TikTok platform configuration is missing.'),
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    let popupCheck: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let oauthDone = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (popupCheck) clearInterval(popupCheck);
      if (timeoutId) clearTimeout(timeoutId);
      popupRef.current = null;
    };

    const fail = (description: string) => {
      oauthDone = true;
      cleanup();
      setLoading(false);
      toast({
        title: t('settings.tiktok_connection.toast.connection_title', 'TikTok connection'),
        description,
        variant: 'destructive'
      });
    };

    const onMessage = (ev: MessageEvent) => {
      const popup = popupRef.current;
      if (!popup || ev.source !== popup) return;
      const msgType = ev.data?.type;
      if (msgType !== 'tiktok_oauth_success' && msgType !== 'tiktok_oauth_error') return;

      oauthDone = true;
      cleanup();
      setLoading(false);

      if (msgType === 'tiktok_oauth_success') {
        toast({
          title: t('settings.tiktok_connection.toast.connected_title', 'Connected'),
          description: t(
            'settings.tiktok_connection.toast.connected_description',
            'Your TikTok account was linked successfully.'
          )
        });
        setAccountName('');
        onSuccess();
        onClose();
      } else {
        toast({
          title: t('settings.tiktok_connection.toast.auth_failed_title', 'Authorization failed'),
          description:
            typeof ev.data?.error === 'string'
              ? ev.data.error
              : t('settings.tiktok_connection.toast.auth_failed_fallback', 'TikTok authorization failed.'),
          variant: 'destructive'
        });
      }

      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        /* ignore */
      }
    };

    try {
      const csrfState = Math.random().toString(36).substring(7);
      const parentOrigin = window.location.origin;

      const prepareResponse = await fetch('/api/tiktok/oauth/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: csrfState,
          accountName: accountName.trim(),
          parentOrigin
        })
      });

      if (!prepareResponse.ok) {
        throw new Error('Failed to prepare OAuth');
      }

      const prepareData = await prepareResponse.json();
      const templateFromPrepare =
        typeof prepareData.accountHolderAuthorizationUrl === 'string'
          ? prepareData.accountHolderAuthorizationUrl.trim()
          : '';
      const templateFromConfig = platformConfig.accountHolderAuthorizationUrl?.trim() ?? '';
      const authorizationTemplate = templateFromPrepare || templateFromConfig;

      const allowedScopes =
        Array.isArray(prepareData.allowedScopes) && prepareData.allowedScopes.length > 0
          ? prepareData.allowedScopes
          : platformConfig.allowedScopes;

      const scopeBuiltUrl = buildTikTokBusinessAuthorizationUrl({
        clientKey: platformConfig.clientKey,
        redirectUri: platformConfig.redirectUrl,
        state: csrfState,
        scopes: allowedScopes,
      });
      const finalizedFromTemplate = authorizationTemplate
        ? tryFinalizeTikTokAccountHolderAuthorizationUrl(authorizationTemplate, {
            state: csrfState,
            redirectUri: platformConfig.redirectUrl,
          })
        : null;
      const authUrl = finalizedFromTemplate ?? scopeBuiltUrl;
      if (authorizationTemplate && !finalizedFromTemplate) {
        toast({
          title: t('settings.tiktok_connection.toast.invalid_auth_url_title', 'Invalid authorization URL'),
          description: t(
            'settings.tiktok_connection.toast.invalid_auth_url_description',
            'The TikTok account holder URL in platform settings is not valid. Using the built-in authorize URL from your configured scopes. Ask an administrator to fix the pasted URL in TikTok platform configuration.'
          ),
          variant: 'destructive',
        });
      }

      const popup = window.open(authUrl, OAUTH_POPUP_NAME, OAUTH_POPUP_FEATURES);
      popupRef.current = popup;

      if (!popup) {
        fail(t('settings.tiktok_connection.toast.popup_blocked', 'Pop-up blocked. Allow pop-ups for this site and try again.'));
        return;
      }

      window.addEventListener('message', onMessage);

      popupCheck = setInterval(() => {
        if (popup.closed && !oauthDone) {
          oauthDone = true;
          cleanup();
          setLoading(false);
          toast({
            title: t('settings.tiktok_connection.toast.window_closed_title', 'Window closed'),
            description: t(
              'settings.tiktok_connection.toast.window_closed_description',
              'Authorization was cancelled or the window was closed before completion.'
            ),
            variant: 'destructive'
          });
        }
      }, 500);

      timeoutId = setTimeout(() => {
        if (oauthDone) return;
        oauthDone = true;
        cleanup();
        setLoading(false);
        try {
          if (popup && !popup.closed) popup.close();
        } catch {
          /* ignore */
        }
        toast({
          title: t('settings.tiktok_connection.toast.timed_out_title', 'Timed out'),
          description: t(
            'settings.tiktok_connection.toast.timed_out_description',
            'TikTok authorization timed out. Please try again.'
          ),
          variant: 'destructive'
        });
      }, OAUTH_TIMEOUT_MS);
    } catch (error) {
      console.error('Error preparing OAuth:', error);
      cleanup();
      setLoading(false);
      toast({
        title: t('settings.tiktok_connection.toast.oauth_prep_failed_title', 'OAuth Preparation Failed'),
        description:
          error instanceof Error
            ? error.message
            : t(
                'settings.tiktok_connection.toast.oauth_prep_failed_description',
                'Failed to prepare OAuth flow. Please try again.'
              ),
        variant: 'destructive'
      });
    }
  };

  const handleClose = () => {
    if (loading) {
      return;
    }

    setAccountName('');
    onClose();
  };

  if (checkingConfig) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent data-tour="components-settings-tiktokconnectionform.dialogcontent.settings.tiktok_connection.dialog_title" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <i className="ri-tiktok-line text-2xl"></i>
              {t('settings.tiktok_connection.dialog_title', 'Connect TikTok Account')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!platformConfigured) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent data-tour="components-settings-tiktokconnectionform.dialogcontent.settings.tiktok_connection.dialog_title" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <i className="ri-tiktok-line text-2xl"></i>
              {t('settings.tiktok_connection.dialog_title', 'Connect TikTok Account')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.tiktok_connection.config_required_description', 'TikTok platform configuration required')}
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>
                {t('settings.tiktok_connection.platform_not_configured_title', 'Platform Not Configured')}
              </strong>
              <p className="mt-2">
                {t(
                  'settings.tiktok_connection.platform_not_configured_body',
                  'TikTok Business Messaging API integration has not been configured by your system administrator.'
                )}
              </p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button data-tour="components-settings-tiktokconnectionform.button.common.close" variant="outline" onClick={handleClose}>
              {t('common.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-tour="components-settings-tiktokconnectionform.dialogcontent.settings.tiktok_connection.dialog_title" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="ri-tiktok-line text-2xl"></i>
            {t('settings.tiktok_connection.dialog_title', 'Connect TikTok Account')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.tiktok_connection.main_description', 'Connect your TikTok Business account to the unified inbox.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accountName">
              {t('settings.tiktok_connection.account_name_label', 'Account Name')}{' '}
              <span className="text-red-500">*</span>
            </Label>
            <Input data-tour="components-settings-tiktokconnectionform.input.settings.tiktok_connection.account_name_placeholder"
              id="accountName"
              name="accountName"
              placeholder={t('settings.tiktok_connection.account_name_placeholder', 'e.g., My TikTok Business')}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button data-tour="components-settings-tiktokconnectionform.button.common.cancel" variant="outline" onClick={handleClose} disabled={loading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-settings-tiktokconnectionform.button.settings.tiktok_connection.connecting"
            onClick={handleConnectClick}
            disabled={loading || !accountName.trim()}
            className="btn-brand-primary"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.tiktok_connection.connecting', 'Connecting...')}
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('settings.tiktok_connection.connect_button', 'Connect with TikTok')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
