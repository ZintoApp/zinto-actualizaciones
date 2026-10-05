import React, { useState } from 'react';
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
import { resolveSetupMessage, setupErrorPayload } from '@/lib/setup-message';
import { TestTube, ExternalLink, AlertCircle } from 'lucide-react';

interface MessengerFormData {
  accountName: string;
  pageId: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  webhookUrl: string;
  verifyToken: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MessengerConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [formData, setFormData] = useState<MessengerFormData>({
    accountName: '',
    pageId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: `${window.location.origin}/api/webhooks/messenger`,
    verifyToken: ''
  });

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
      return urlObj.protocol === 'https:' && urlObj.pathname.includes('/api/webhooks/messenger');
    } catch {
      return false;
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('settings.messenger_connection.validation_error', 'Validation Error'),
        description: resolveSetupMessage(t, { messageCode: 'SETUP_WEBHOOK_FIELDS_REQUIRED' }),
        variant: "destructive"
      });
      return;
    }

    if (!validateWebhookUrl(formData.webhookUrl)) {
      toast({
        title: t('settings.messenger_connection.invalid_webhook_url', 'Invalid Webhook URL'),
        description: t('settings.messenger_connection.invalid_webhook_url_description', 'Webhook URL must be HTTPS and point to /api/webhooks/messenger endpoint.'),
        variant: "destructive"
      });
      return;
    }

    setTestingWebhook(true);
    try {
      const response = await fetch('/api/messenger/test-webhook', {
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
          title: t('settings.messenger_connection.webhook_test_successful', 'Webhook Test Successful'),
          description: resolveSetupMessage(t, { messageCode: 'SETUP_WEBHOOK_VALID' }),
        });
      } else {
        const errorData = await response.json();
        throw Object.assign(new Error(errorData.message || 'Webhook test failed'), setupErrorPayload(errorData));
      }
    } catch (error: any) {
      toast({
        title: t('settings.messenger_connection.webhook_test_failed', 'Webhook Test Failed'),
        description: resolveSetupMessage(t, error, 'SETUP_WEBHOOK_TEST_FAILED'),
        variant: "destructive"
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.accountName || !formData.pageId || !formData.accessToken || !formData.appId || !formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('settings.messenger_connection.validation_error', 'Validation Error'),
        description: resolveSetupMessage(t, { messageCode: 'SETUP_REQUIRED_FIELDS' }),
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelType: 'messenger',
          accountId: formData.pageId,
          accountName: formData.accountName,
          accessToken: formData.accessToken,
          connectionData: {
            pageId: formData.pageId,
            appId: formData.appId,
            appSecret: formData.appSecret,
            webhookUrl: formData.webhookUrl,
            verifyToken: formData.verifyToken
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw Object.assign(new Error(errorData.message || 'Failed to create Messenger connection'), setupErrorPayload(errorData));
      }

      await response.json();
      
      toast({
        title: t('settings.messenger_connection.connected_title', 'Messenger Connected'),
        description: t('settings.messenger_connection.connected_description', 'Your Facebook Page has been connected successfully.'),
      });

      setFormData({
        accountName: '',
        pageId: '',
        accessToken: '',
        appId: '',
        appSecret: '',
        webhookUrl: `${window.location.origin}/api/webhooks/messenger`,
        verifyToken: ''
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating Messenger connection:', error);
      toast({
        title: t('settings.messenger_connection.connection_failed', 'Connection Failed'),
        description: resolveSetupMessage(t, error, 'SETUP_CONNECTION_CREATE_FAILED'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-messengerconnectionform.dialogcontent.settings.messenger_connection.connect_title" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.messenger_connection.connect_title', 'Connect Facebook Messenger')}</DialogTitle>
          <DialogDescription>
            {t('settings.messenger_connection.connect_description', "Connect your Facebook Page to receive and send Messenger messages. You'll need your Meta for Developers credentials.")}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="accountName">{t('settings.messenger_connection.account_name_label', 'Account Name *')}</Label>
              <Input data-tour="components-settings-messengerconnectionform.input.settings.messenger_connection.account_name_placeholder"
                id="accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleInputChange}
                placeholder={t('settings.messenger_connection.account_name_placeholder', 'e.g. My Facebook Page')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.messenger_connection.account_name_help', 'A name to identify this connection')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="pageId">{t('settings.messenger_connection.page_id_label', 'Facebook Page ID *')}</Label>
              <Input data-tour="components-settings-messengerconnectionform.input.pageId"
                id="pageId"
                name="pageId"
                value={formData.pageId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.messenger_connection.page_id_help', 'Your Facebook Page ID from Meta for Developers')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="accessToken">{t('settings.messenger_connection.access_token_label', 'Access Token *')}</Label>
              <Input data-tour="components-settings-messengerconnectionform.input.settings.messenger_connection.access_token_placeholder"
                id="accessToken"
                name="accessToken"
                type="password"
                value={formData.accessToken}
                onChange={handleInputChange}
                placeholder={t('settings.messenger_connection.access_token_placeholder', 'Your Page access token')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.messenger_connection.access_token_help', 'Long-lived Page access token from Meta for Developers')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appId">{t('settings.messenger_connection.app_id_label', 'App ID *')}</Label>
              <Input data-tour="components-settings-messengerconnectionform.input.settings.messenger_connection.app_id_placeholder"
                id="appId"
                name="appId"
                value={formData.appId}
                onChange={handleInputChange}
                placeholder={t('settings.messenger_connection.app_id_placeholder', 'Your app ID')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.messenger_connection.app_id_help', 'Your Meta app ID')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appSecret">{t('settings.messenger_connection.app_secret_label', 'App Secret')}</Label>
              <Input data-tour="components-settings-messengerconnectionform.input.settings.messenger_connection.app_secret_placeholder"
                id="appSecret"
                name="appSecret"
                type="password"
                value={formData.appSecret}
                onChange={handleInputChange}
                placeholder={t('settings.messenger_connection.app_secret_placeholder', 'Your app secret (optional)')}
              />
              <p className="text-sm text-gray-500">
                {t('settings.messenger_connection.app_secret_help', 'Your Meta app secret (optional, for webhook verification)')}
              </p>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{t('settings.messenger_connection.webhook_configuration', 'Webhook Configuration')}</h4>

              <div className="grid gap-2">
                <Label htmlFor="webhookUrl">{t('settings.messenger_connection.webhook_url_label', 'Webhook URL *')}</Label>
                <Input data-tour="components-settings-messengerconnectionform.input.webhookUrl"
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourdomain.com/api/webhooks/messenger"
                  required
                />
                <p className="text-sm text-gray-500">
                  {t('settings.messenger_connection.webhook_url_help', 'This URL will receive webhook events from Meta. Configure it in your Meta Developer Console.')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="verifyToken">{t('settings.messenger_connection.verify_token_label', 'Webhook Verify Token *')}</Label>
                <Input data-tour="components-settings-messengerconnectionform.input.settings.messenger_connection.verify_token_placeholder"
                  id="verifyToken"
                  name="verifyToken"
                  value={formData.verifyToken}
                  onChange={handleInputChange}
                  placeholder={t('settings.messenger_connection.verify_token_placeholder', 'Enter a secure verify token')}
                  required
                />
                <p className="text-sm text-gray-500">
                  {t('settings.messenger_connection.verify_token_help', 'Use the same secure token in your Meta Developer Console.')}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button data-tour="components-settings-messengerconnectionform.button.settings.messenger_connection.testing_webhook"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={testWebhookConnection}
                  disabled={testingWebhook || !formData.webhookUrl || !formData.verifyToken}
                  className="flex items-center gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  {testingWebhook ? t('settings.messenger_connection.testing_webhook', 'Testing...') : t('settings.messenger_connection.test_webhook', 'Test Webhook')}
                </Button>
                <Button data-tour="components-settings-messengerconnectionform.button.settings.messenger_connection.meta_docs"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://developers.facebook.com/docs/messenger-platform/webhooks', '_blank')}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('settings.messenger_connection.meta_docs', 'Meta Docs')}
                </Button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">{t('settings.messenger_connection.setup_instructions', 'Setup Instructions:')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>{t('settings.messenger_connection.setup_step_configure_webhook', 'Configure the webhook URL and verify token in your Meta Developer Console')}</li>
                      <li>{t('settings.messenger_connection.setup_step_subscribe_fields', "Subscribe to 'messages' and 'messaging_postbacks' webhook fields")}</li>
                      <li>{t('settings.messenger_connection.setup_step_test_webhook', 'Test the webhook connection using the button above')}</li>
                      <li>{t('settings.messenger_connection.setup_step_permissions', 'Ensure your Page has the necessary permissions')}</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button data-tour="components-settings-messengerconnectionform.button.common.cancel" type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-messengerconnectionform.button.settings.messenger_connection.connecting" type="submit" variant="outline" className="btn-brand-primary" disabled={loading}>
              {loading ? t('settings.messenger_connection.connecting', 'Connecting...') : t('settings.messenger_connection.connect_messenger', 'Connect Messenger')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
