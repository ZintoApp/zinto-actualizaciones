import { launchInstagramBusinessLogin } from '@/lib/instagram-login';
import React, { useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { TestTube, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';

interface InstagramFormData {
  accountName: string;
  instagramAccountId: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  webhookUrl: string;
  verifyToken: string;
}

interface InstagramAccountInfo {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

export function EditInstagramConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [accountInfo, setAccountInfo] = useState<InstagramAccountInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [hasAppSecret, setHasAppSecret] = useState(false);
  const [directLogin, setDirectLogin] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [syncReconnect, setSyncReconnect] = useState(false);
  const [requiresReauth, setRequiresReauth] = useState(false);
  const [formData, setFormData] = useState<InstagramFormData>({
    accountName: '',
    instagramAccountId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: `${window.location.origin}/api/webhooks/instagram`,
    verifyToken: ''
  });

  useEffect(() => {
    if (isOpen && connectionId) {
      loadConnectionData();
    }
  }, [isOpen, connectionId]);

  const loadConnectionData = async () => {
    setLoadingConnection(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`);
      if (!response.ok) {
        throw new Error('Failed to load connection data');
      }

      const connection = await response.json();
      const connectionData = connection.connectionData || {};
      setDirectLogin(connectionData.authMethod === 'instagram_login');
      setSubscriptionError(connectionData.instagramSubscription?.error || '');
      setSyncReconnect(!!connectionData.instagramSubscription?.reconnectRequired);
      setRequiresReauth(!!connectionData.requiresReauth);

      setAccountInfo(connectionData.accountInfo || null);
      setConnectionStatus(connection.status || '');
      setHasAppSecret(Boolean(connection.hasAppSecret));

      setFormData({
        accountName: connection.accountName || '',
        instagramAccountId: connection.accountId || '',
        accessToken: '',
        appId: connectionData.appId || '',
        appSecret: '',
        webhookUrl: connectionData.webhookUrl || `${window.location.origin}/api/webhooks/instagram`,
        verifyToken: connectionData.verifyToken || ''
      });
    } catch (error: any) {
      console.error('Error loading connection data:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.instagram_connection.load_failed_description', 'Failed to load connection data. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoadingConnection(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateWebhookUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:' && urlObj.pathname.includes('/api/webhooks/instagram');
    } catch {
      return false;
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('settings.instagram_connection.validation_error', 'Validation Error'),
        description: t('settings.instagram_connection.webhook_required_error', 'Please fill in webhook URL and verify token first.'),
        variant: 'destructive'
      });
      return;
    }

    if (!validateWebhookUrl(formData.webhookUrl)) {
      toast({
        title: t('settings.instagram_connection.invalid_webhook_url', 'Invalid Webhook URL'),
        description: t('settings.instagram_connection.invalid_webhook_url_description', 'Webhook URL must be HTTPS and point to /api/webhooks/instagram endpoint.'),
        variant: 'destructive'
      });
      return;
    }

    setTestingWebhook(true);
    try {
      const response = await fetch('/api/instagram/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        })
      });

      if (response.ok) {
        toast({
          title: t('settings.instagram_connection.webhook_test_successful', 'Webhook Test Successful'),
          description: t('settings.instagram_connection.webhook_test_successful_description', 'Your webhook configuration is valid and reachable.')
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Webhook test failed');
      }
    } catch (error: any) {
      toast({
        title: t('settings.instagram_connection.webhook_test_failed', 'Webhook Test Failed'),
        description: error.message || t('settings.instagram_connection.webhook_test_failed_description', 'Could not validate webhook configuration.'),
        variant: 'destructive'
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.accountName || !formData.instagramAccountId || !formData.appId || !formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('settings.instagram_connection.validation_error', 'Validation Error'),
        description: t('settings.instagram_connection.required_fields_error', 'Please fill in all required fields.'),
        variant: 'destructive'
      });
      setLoading(false);
      return;
    }


    if (!validateWebhookUrl(formData.webhookUrl)) {
      toast({
        title: t('settings.instagram_connection.invalid_webhook_url', 'Invalid Webhook URL'),
        description: t('settings.instagram_connection.invalid_webhook_url_description', 'Webhook URL must be HTTPS and point to /api/webhooks/instagram endpoint.'),
        variant: 'destructive'
      });
      setLoading(false);
      return;
    }

    try {
      const updateData: any = {
        channelType: 'instagram',
        accountId: formData.instagramAccountId,
        accountName: formData.accountName,
        connectionData: {
          instagramAccountId: formData.instagramAccountId,
          appId: formData.appId,
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        }
      };

      if (formData.accessToken.trim()) {
        updateData.accessToken = formData.accessToken;
      }

      if (formData.appSecret.trim()) {
        updateData.connectionData.appSecret = formData.appSecret;
      }

      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update Instagram connection');
      }

      await response.json();

      toast({
        title: t('settings.instagram_connection.updated_title', 'Instagram Updated'),
        description: t('settings.instagram_connection.updated_description', 'Your Instagram Business account connection has been updated successfully.')
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating Instagram connection:', error);
      toast({
        title: t('settings.instagram_connection.update_failed', 'Update Failed'),
        description: error.message || t('settings.instagram_connection.update_failed_description', 'Failed to update Instagram connection. Please check your credentials and try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !loadingConnection) {
      onClose();
    }
  };

  if (directLogin && !loadingConnection) {
    const updateDirect = async (retry: boolean) => {
      setLoading(true);
      try {
        const response = await fetch(retry ? `/api/instagram/connections/${connectionId}/retry-subscription` : `/api/channel-connections/${connectionId}`, {
          method: retry ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
          ...(retry ? {} : { body: JSON.stringify({ accountName: formData.accountName }) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || t('instagram.errors.update_connection', 'Could not update Instagram connection.'));
        if (retry && !result.success) { await loadConnectionData(); onSuccess(); return; }
        onSuccess();
        await loadConnectionData();
        toast({ title: t('common.success', 'Success') });
      } catch (e) {
        toast({ title: t('common.error', 'Error'), description: e instanceof Error ? e.message : t('instagram.errors.update_connection', 'Could not update Instagram connection.'), variant: 'destructive' });
      } finally { setLoading(false); }
    };
    return <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-tour="components-settings-editinstagramconnectionform.dialogcontent.settings.instagram_connection.direct_title" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.instagram_connection.direct_title', 'Instagram connection')}</DialogTitle>
          <DialogDescription>{t('settings.instagram_connection.direct_settings_description', 'This account uses Instagram Business Login. Credentials are managed automatically.')}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">@{accountInfo?.username} · {({
          active: t('common.active', 'Active'), inactive: t('common.inactive', 'Inactive'),
          error: t('common.error', 'Error'), pending: t('instagram.status.pending', 'Pending'),
          connected: t('instagram.status.connected', 'Connected'), disconnected: t('instagram.status.disconnected', 'Disconnected'),
        } as Record<string, string>)[connectionStatus] || t('instagram.status.unknown', 'Unknown')}</p>
        <Label htmlFor="direct-instagram-name">{t('settings.instagramEmbeddedSignup.connection_name', 'Connection name')}</Label>
        <Input data-tour="components-settings-editinstagramconnectionform.input.direct-instagram-name" id="direct-instagram-name" maxLength={100} value={formData.accountName} onChange={e => setFormData(previous => ({ ...previous, accountName: e.target.value }))} />
        {subscriptionError && <p role="alert" className="text-sm text-destructive">{subscriptionError}</p>}
        {requiresReauth && <p role="alert" className="text-sm text-destructive">{t('settings.instagram_connection.reauthorize_hint', 'Authorization expired or was revoked. Open Instagram Easy Setup and sign in with the same account to reconnect.')}</p>}
        <DialogFooter className="gap-2">
          {(syncReconnect || requiresReauth) && <Button data-tour="components-settings-editinstagramconnectionform.button.common.error" variant="outline" disabled={loading} onClick={async () => {
            setLoading(true);
            try {
              await launchInstagramBusinessLogin(formData.accountName, undefined, t);
              await loadConnectionData(); onSuccess();
            } catch (error) { toast({ title: t('common.error', 'Error'), description: error instanceof Error ? error.message : '', variant: 'destructive' }); }
            finally { setLoading(false); }
          }}>{t('instagram.sync.reconnect', 'Reconnect Instagram')}</Button>}
          <Button data-tour="components-settings-editinstagramconnectionform.button.settings.instagramEmbeddedSignup.retry_subscription" variant="outline" disabled={loading || requiresReauth} onClick={() => updateDirect(true)}>{t('settings.instagramEmbeddedSignup.retry_subscription', 'Retry message subscription')}</Button>
          <Button data-tour="components-settings-editinstagramconnectionform.button.common.save" disabled={loading || !formData.accountName.trim()} onClick={() => updateDirect(false)}>{t('common.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-tour="components-settings-editinstagramconnectionform.dialogcontent.settings.instagram_connection.edit_title" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.instagram_connection.edit_title', 'Edit Instagram Business Connection')}</DialogTitle>
          <DialogDescription>
            {t('settings.instagram_connection.edit_description', "Update your Instagram Business account settings. You'll need your Meta for Developers credentials.")}
          </DialogDescription>
        </DialogHeader>

        {loadingConnection ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            {t('settings.instagram_connection.loading_connection_data', 'Loading connection data...')}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {accountInfo && (
              <div className="flex items-center gap-3 rounded-lg border p-4 mb-2">
                {accountInfo.profile_picture_url ? (
                  <img
                    src={accountInfo.profile_picture_url}
                    alt={accountInfo.username || formData.accountName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <i className="ri-instagram-line text-xl" style={{ color: '#E4405F' }}></i>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {accountInfo.name && (
                    <h3 className="truncate font-semibold">{accountInfo.name}</h3>
                  )}
                  {accountInfo.username && (
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">@{accountInfo.username}</p>
                  )}
                  {accountInfo.account_type && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{accountInfo.account_type}</p>
                  )}
                  {formData.accountName && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{formData.accountName}</p>
                  )}
                </div>
                {connectionStatus && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    connectionStatus === 'active'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                  }`}>
                    {connectionStatus}
                  </span>
                )}
              </div>
            )}
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="accountName">{t('settings.instagram_connection.account_name_label', 'Account Name *')}</Label>
                <Input data-tour="components-settings-editinstagramconnectionform.input.settings.instagram_connection.account_name_placeholder"
                  id="accountName"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram_connection.account_name_placeholder', 'e.g. My Instagram Business')}
                  required
                />
                <p className="text-sm text-gray-500">{t('settings.instagram_connection.account_name_help', 'A name to identify this connection')}</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="instagramAccountId">{t('settings.instagram_connection.instagram_account_id_label', 'Instagram Account ID *')}</Label>
                <Input data-tour="components-settings-editinstagramconnectionform.input.instagramAccountId"
                  id="instagramAccountId"
                  name="instagramAccountId"
                  value={formData.instagramAccountId}
                  onChange={handleInputChange}
                  placeholder="1234567890"
                  required
                />
                <p className="text-sm text-gray-500">{t('settings.instagram_connection.instagram_account_id_help', 'Your Instagram Business Account ID from Meta for Developers')}</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="appSecret">{t('settings.instagram_connection.instagram_app_secret_label', 'Instagram app secret')}</Label>
                <Input data-tour="components-settings-editinstagramconnectionform.input.settings.instagram_connection.app_secret_update_placeholder"
                  id="appSecret"
                  name="appSecret"
                  type="password"
                  value={formData.appSecret}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram_connection.app_secret_update_placeholder', 'Enter new app secret (leave empty to keep current)')}
                />
                <p className="text-sm text-gray-500">
                  {hasAppSecret
                    ? t('settings.instagram_connection.app_secret_stored_help', 'A secret is currently stored. Leave empty to keep current secret.')
                    : t('settings.instagram_connection.app_secret_missing_help', 'No app secret is currently stored. Enter one to receive messages.')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="accessToken">{t('settings.instagram_connection.access_token_label', 'Access Token')}</Label>
                <Input data-tour="components-settings-editinstagramconnectionform.input.settings.instagram_connection.access_token_update_placeholder"
                  id="accessToken"
                  name="accessToken"
                  type="password"
                  value={formData.accessToken}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram_connection.access_token_update_placeholder', 'Enter new access token (leave empty to keep current)')}
                />
                <p className="text-sm text-gray-500">{t('settings.instagram_connection.access_token_update_help', 'Long-lived access token from Meta for Developers. Leave empty to keep current token.')}</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="appId">{t('settings.instagram_connection.app_id_label', 'App ID *')}</Label>
                <Input data-tour="components-settings-editinstagramconnectionform.input.settings.instagram_connection.app_id_placeholder"
                  id="appId"
                  name="appId"
                  value={formData.appId}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram_connection.app_id_placeholder', 'Your app ID')}
                  required
                />
                <p className="text-sm text-gray-500">{t('settings.instagram_connection.app_id_help', 'Your Meta app ID')}</p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('settings.instagram_connection.webhook_configuration', 'Webhook Configuration')}</h4>

                <div className="grid gap-2">
                  <Label htmlFor="webhookUrl">{t('settings.instagram_connection.webhook_url_label', 'Webhook URL *')}</Label>
                  <Input data-tour="components-settings-editinstagramconnectionform.input.webhookUrl"
                    id="webhookUrl"
                    name="webhookUrl"
                    value={formData.webhookUrl}
                    onChange={handleInputChange}
                    placeholder="https://yourdomain.com/api/webhooks/instagram"
                    required
                  />
                  <p className="text-sm text-gray-500">{t('settings.instagram_connection.webhook_url_help', 'This URL will receive webhook events from Meta. Configure this in your Meta Developer Console.')}</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="verifyToken">{t('settings.instagram_connection.verify_token_label', 'Webhook Verify Token *')}</Label>
                  <Input data-tour="components-settings-editinstagramconnectionform.input.settings.instagram_connection.verify_token_placeholder"
                    id="verifyToken"
                    name="verifyToken"
                    value={formData.verifyToken}
                    onChange={handleInputChange}
                    placeholder={t('settings.instagram_connection.verify_token_placeholder', 'Enter a secure verify token')}
                    required
                  />
                  <p className="text-sm text-gray-500">{t('settings.instagram_connection.verify_token_help', 'A secure token for webhook verification. Use the same token in your Meta Developer Console.')}</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button data-tour="components-settings-editinstagramconnectionform.button.settings.instagram_connection.testing_webhook"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={testWebhookConnection}
                    disabled={testingWebhook || !formData.webhookUrl || !formData.verifyToken}
                    className="flex items-center gap-2"
                  >
                    <TestTube className="h-4 w-4" />
                    {testingWebhook ? t('settings.instagram_connection.testing_webhook', 'Testing...') : t('settings.instagram_connection.test_webhook', 'Test Webhook')}
                  </Button>
                  <Button data-tour="components-settings-editinstagramconnectionform.button.settings.instagram_connection.meta_docs"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://developers.facebook.com/docs/instagram-basic-display-api/webhooks', '_blank')}
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t('settings.instagram_connection.meta_docs', 'Meta Docs')}
                  </Button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">{t('settings.instagram_connection.setup_instructions', 'Setup Instructions:')}</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>{t('settings.instagram_connection.setup_step_configure_webhook', 'Configure the webhook URL and verify token in your Meta Developer Console')}</li>
                        <li>{t('settings.instagram_connection.setup_step_subscribe_fields', "Subscribe to 'messages' and 'message_reactions' webhook fields")}</li>
                        <li>{t('settings.instagram_connection.setup_step_test_webhook', 'Test the webhook connection using the button above')}</li>
                        <li>{t('settings.instagram_connection.setup_step_permissions', 'Ensure your Instagram Business account has the necessary permissions')}</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button data-tour="components-settings-editinstagramconnectionform.button.common.cancel" type="button" variant="outline" onClick={handleClose} disabled={loading || loadingConnection}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button data-tour="components-settings-editinstagramconnectionform.button.settings.instagram_connection.updating" type="submit" variant="outline" className="btn-brand-primary" disabled={loading || loadingConnection}>
                {loading ? t('settings.instagram_connection.updating', 'Updating...') : t('settings.instagram_connection.update_connection', 'Update Connection')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
