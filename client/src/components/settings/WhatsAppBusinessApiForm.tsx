import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
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

interface BusinessApiFormData {
  accountName: string;
  phoneNumberId: string;
  businessAccountId: string;
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

function generateVerifyToken(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid.replace(/-/g, '');
  } catch (_) {}
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return hex + Date.now().toString(36);
}

export function WhatsAppBusinessApiForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const [formData, setFormData] = useState<BusinessApiFormData>({
    accountName: '',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: '',
    verifyToken: generateVerifyToken()
  });

  const [testPhone, setTestPhone] = useState('');
  const [isTestingTemplate, setIsTestingTemplate] = useState(false);



  const generateWebhookUrl = () => {
    const currentDomain = window.location.origin;
    const webhookUrl = `${currentDomain}/api/webhooks/whatsapp`;
    setFormData(prev => ({ ...prev, webhookUrl }));
  };

  React.useEffect(() => {
    if (isOpen) {
      generateWebhookUrl();
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const resetForm = () => {
    const currentDomain = window.location.origin;
    const webhookUrl = `${currentDomain}/api/webhooks/whatsapp`;
    setFormData({
      accountName: '',
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      appId: '',
      appSecret: '',
      webhookUrl: webhookUrl,
      verifyToken: generateVerifyToken()
    });
    setIsSubmitting(false);
    setIsValidating(false);
  };

  const validateCredentials = async () => {
    if (!formData.accessToken || !formData.phoneNumberId) {
      toast({
        title: t('whatsapp_business.validation_error', 'Validation Error'),
        description: t('whatsapp_business.required_fields', 'Access Token and Phone Number ID are required for validation.'),
        variant: "destructive"
      });
      return false;
    }

    setIsValidating(true);
    try {

      const response = await fetch(`https://graph.facebook.com/v25.0/${formData.phoneNumberId}?access_token=${formData.accessToken}`);

      if (response.ok) {
        const data = await response.json();
        toast({
          title: t('whatsapp_business.credentials_valid', 'Credentials Valid'),
          description: t('whatsapp_business.validation_success', 'Successfully validated phone number: {{phoneNumber}}', { phoneNumber: data.display_phone_number || formData.phoneNumberId }),
        });
        return true;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || t('whatsapp_business.invalid_credentials', 'Invalid credentials'));
      }
    } catch (error: any) {
      toast({
        title: t('whatsapp_business.validation_failed', 'Validation Failed'),
        description: t('whatsapp_business.validation_failed_desc', 'Failed to validate WhatsApp Business API credentials.'),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('whatsapp_business.test_error', 'Test Error'),
        description: resolveSetupMessage(t, { messageCode: 'SETUP_WEBHOOK_FIELDS_REQUIRED' }),
        variant: "destructive"
      });
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/whatsapp/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: t('whatsapp_business.webhook_test_successful', 'Webhook Test Successful'),
          description: t('whatsapp_business.webhook_test_successful_description', 'Your webhook configuration is working correctly. You can now configure it in Meta Developer Console.'),
        });
      } else {
        toast({
          title: t('whatsapp_business.webhook_test_failed', 'Webhook Test Failed'),
          description: resolveSetupMessage(t, result, 'SETUP_WEBHOOK_TEST_FAILED'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      toast({
        title: t('whatsapp_business.test_failed', 'Test Failed'),
        description: resolveSetupMessage(t, { messageCode: 'SETUP_NETWORK_ERROR' }),
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const testTemplate = async () => {
    if (!testPhone) {
      toast({
        title: t('whatsapp_business.test_error', 'Test Error'),
        description: resolveSetupMessage(t, { messageCode: 'SETUP_TEMPLATE_PHONE_REQUIRED' }),
        variant: "destructive"
      });
      return;
    }

    if (!formData.accessToken || !formData.phoneNumberId) {
      toast({
        title: t('whatsapp_business.test_error', 'Test Error'),
        description: resolveSetupMessage(t, { messageCode: 'SETUP_TEMPLATE_CONNECTION_REQUIRED' }),
        variant: "destructive"
      });
      return;
    }

    setIsTestingTemplate(true);
    try {

      const tempConnectionResponse = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelType: 'whatsapp_official',
          accountId: formData.phoneNumberId,
          accountName: `${formData.accountName} (Test)`,
          accessToken: formData.accessToken,
          connectionData: {
            phoneNumberId: formData.phoneNumberId,
            businessAccountId: formData.businessAccountId,
            accessToken: formData.accessToken,
            appId: formData.appId,
            appSecret: formData.appSecret,
            wabaId: formData.businessAccountId,
            webhookUrl: formData.webhookUrl,
            verifyToken: formData.verifyToken
          }
        })
      });

      if (!tempConnectionResponse.ok) {
        const payload = await tempConnectionResponse.json().catch(() => ({}));
        throw Object.assign(new Error(payload.message || 'Failed to create temporary connection for testing'), setupErrorPayload(payload));
      }

      const tempConnection = await tempConnectionResponse.json();

      try {

        const testResponse = await fetch(`/api/whatsapp/test-template/${tempConnection.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phoneNumber: testPhone,
            templateName: 'hello_world',
            languageCode: 'en_US'
          })
        });

        if (testResponse.ok) {
          const result = await testResponse.json();
          toast({
            title: t('whatsapp_business.template_test_successful', 'Template Test Successful'),
            description: resolveSetupMessage(t, { messageCode: 'SETUP_TEMPLATE_SENT', messageParams: { phoneNumber: testPhone, messageId: result.messageId } }),
          });
        } else {
          const errorData = await testResponse.json();
          let errorMessage = errorData.error || 'Failed to send template message';
          let messageCode = errorData.messageCode || 'SETUP_TEMPLATE_SEND_FAILED';


          if (errorMessage.includes('131030') || errorMessage.includes('not in allowed list')) {
            messageCode = 'SETUP_TEMPLATE_PHONE_NOT_ALLOWED';
          } else if (errorMessage.includes('131026') || errorMessage.includes('template')) {
            messageCode = 'SETUP_TEMPLATE_NOT_APPROVED';
          }

          throw Object.assign(new Error(errorMessage), { messageCode, messageParams: errorData.messageParams });
        }
      } finally {

        await fetch(`/api/channel-connections/${tempConnection.id}`, {
          method: 'DELETE'
        });
      }
    } catch (error: any) {
      toast({
        title: t('whatsapp_business.template_test_failed', 'Template Test Failed'),
        description: resolveSetupMessage(t, error, 'SETUP_TEMPLATE_SEND_FAILED'),
        variant: "destructive"
      });
    } finally {
      setIsTestingTemplate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);

    try {

      const isValid = await validateCredentials();
      if (!isValid) {
        setIsSubmitting(false);
        return;
      }
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelType: 'whatsapp_official',
          accountId: formData.phoneNumberId,
          accountName: formData.accountName,
          accessToken: formData.accessToken, // Store in main accessToken field
          connectionData: {
            phoneNumberId: formData.phoneNumberId,
            businessAccountId: formData.businessAccountId,
            accessToken: formData.accessToken, // Also store in connectionData for compatibility
            appId: formData.appId,
            appSecret: formData.appSecret,
            wabaId: formData.businessAccountId, // Add wabaId for consistency
            webhookUrl: formData.webhookUrl,
            verifyToken: formData.verifyToken
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw Object.assign(new Error(errorData.message || 'Failed to create WhatsApp Business API connection'), setupErrorPayload(errorData));
      }
      
      onClose();
      
      toast({
        title: t('whatsapp_business.connected_title', 'WhatsApp Business API Connected'),
        description: t('whatsapp_business.connected_description', 'Your WhatsApp Business API account has been connected successfully.'),
      });
      
      resetForm();
      
      onSuccess();
      
    } catch (error: any) {
      console.error('Error connecting to WhatsApp Business API:', error);
      toast({
        title: t('whatsapp_business.connection_error', 'Connection Error'),
        description: resolveSetupMessage(t, error, 'SETUP_CONNECTION_CREATE_FAILED'),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-whatsappbusinessapiform.dialogcontent.whatsapp_business.connect_title" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('whatsapp_business.connect_title', 'Connect WhatsApp Business API')}</DialogTitle>
          <DialogDescription>
            {t('whatsapp_business.connect_description', "Connect your existing WhatsApp Business API account. You'll need your Meta for Developers credentials.")}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="accountName">{t('whatsapp_business.account_name', 'Account Name')}</Label>
              <Input data-tour="components-settings-whatsappbusinessapiform.input.whatsapp_business.account_name_placeholder"
                id="accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleInputChange}
                placeholder={t('whatsapp_business.account_name_placeholder', 'e.g. My Business')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.account_name_help', 'A name to identify this connection')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="phoneNumberId">{t('whatsapp_business.phone_number_id', 'Phone Number ID')}</Label>
              <Input data-tour="components-settings-whatsappbusinessapiform.input.phoneNumberId"
                id="phoneNumberId"
                name="phoneNumberId"
                value={formData.phoneNumberId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.phone_number_id_help', 'From Meta for Developers dashboard')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="businessAccountId">{t('whatsapp_business.business_account_id', 'Business Account ID')}</Label>
              <Input data-tour="components-settings-whatsappbusinessapiform.input.businessAccountId"
                id="businessAccountId"
                name="businessAccountId"
                value={formData.businessAccountId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="accessToken">{t('whatsapp_business.access_token', 'Access Token')}</Label>
              <div className="flex gap-2">
                <Input data-tour="components-settings-whatsappbusinessapiform.input.accessToken"
                  id="accessToken"
                  name="accessToken"
                  value={formData.accessToken}
                  onChange={handleInputChange}
                  placeholder="EAAxxxxx..."
                  required
                  className="flex-1"
                />
                <Button data-tour="components-settings-whatsappbusinessapiform.button.whatsapp_business.validating"
                  type="button"
                  variant="outline"
                  onClick={validateCredentials}
                  disabled={isValidating || !formData.accessToken || !formData.phoneNumberId}
                  className="whitespace-nowrap"
                >
                  {isValidating ? t('whatsapp_business.validating', 'Validating...') : t('whatsapp_business.test', 'Test')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.access_token_help', 'Long-lived or permanent access token from Meta for Developers')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appId">{t('whatsapp_business.app_id', 'App ID')}</Label>
              <Input data-tour="components-settings-whatsappbusinessapiform.input.appId"
                id="appId"
                name="appId"
                value={formData.appId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appSecret">{t('whatsapp_business.app_secret', 'App Secret')}</Label>
              <Input data-tour="components-settings-whatsappbusinessapiform.input.appSecret"
                id="appSecret"
                name="appSecret"
                type="password"
                value={formData.appSecret}
                onChange={handleInputChange}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">{t('whatsapp_business.webhook_url', 'Webhook URL')}</Label>
              <div className="flex gap-2">
                <Input data-tour="components-settings-whatsappbusinessapiform.input.webhookUrl"
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder={`${window.location.origin}/api/webhooks/whatsapp`}
                  required
                  className="flex-1"
                />
                <Button data-tour="components-settings-whatsappbusinessapiform.button.whatsapp_business.copy"
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(formData.webhookUrl)}
                  className="whitespace-nowrap"
                >
                  {t('whatsapp_business.copy', 'Copy')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.webhook_url_help', 'Copy this URL into the Webhooks configuration in your Meta for Developers dashboard.')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="verifyToken">{t('whatsapp_business.verify_token', 'Webhook Verify Token')}</Label>
              <div className="flex gap-2">
                <Input data-tour="components-settings-whatsappbusinessapiform.input.verifyToken"
                  id="verifyToken"
                  name="verifyToken"
                  value={formData.verifyToken}
                  onChange={handleInputChange}
                  placeholder="e.g. abc123xyz..."
                  required
                  className="flex-1"
                />
                <Button data-tour="components-settings-whatsappbusinessapiform.button.whatsapp_business.copy"
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(formData.verifyToken)}
                  className="whitespace-nowrap"
                >
                  {t('whatsapp_business.copy', 'Copy')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.verify_token_help', 'This unique token is generated for this connection. Copy it into the Verify token field in Meta Developer Console.')}
              </p>
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  <strong>{t('whatsapp_business.connection_token_label', 'Connection-specific token:')}</strong> {t('whatsapp_business.connection_token_description', 'This verify token will be stored with your WhatsApp Business API connection:')}
                  <code className="bg-green-100 px-1 rounded font-mono">{formData.verifyToken}</code>
                </p>
                <p className="text-sm text-green-800 mt-1">
                  {t('whatsapp_business.connection_token_help', 'Enter this exact token in Meta Developer Console. Each connection can use its own verify token.')}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t('whatsapp_business.test_webhook_configuration', 'Test Webhook Configuration')}</Label>
              <div className="flex gap-2">
                <Button data-tour="components-settings-whatsappbusinessapiform.button.whatsapp_business.testing"
                  type="button"
                  variant="outline"
                  onClick={testWebhookConnection}
                  disabled={isValidating || !formData.webhookUrl || !formData.verifyToken}
                  className="whitespace-nowrap"
                >
                  {isValidating ? t('whatsapp_business.testing', 'Testing...') : t('whatsapp_business.test_webhook', 'Test Webhook')}
                </Button>
                <div className="flex-1 text-sm text-gray-600 flex items-center">
                  {t('whatsapp_business.test_webhook_hint', 'Test your webhook configuration before submitting it to Meta')}
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.test_webhook_help', "This verifies that your webhook URL is accessible and responds correctly to Meta's verification requests.")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="testPhone">{t('whatsapp_business.test_template_label', 'Test Template Message (Optional)')}</Label>
              <div className="flex gap-2">
                <LocalizedPhoneInput
                  id="testPhone"
                  value={testPhone}
                  onChange={setTestPhone}
                  placeholder="+1234567890"
                  className="flex-1"
                />
                <Button data-tour="components-settings-whatsappbusinessapiform.button.whatsapp_business.testing"
                  type="button"
                  variant="outline"
                  onClick={testTemplate}
                  disabled={isTestingTemplate || !formData.accessToken || !formData.phoneNumberId}
                  className="whitespace-nowrap"
                >
                  {isTestingTemplate ? t('whatsapp_business.testing', 'Testing...') : t('whatsapp_business.test', 'Test')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.test_template_help', 'Send a hello_world template message to verify the connection. Enter a phone number with country code.')}
              </p>
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  <strong>{t('whatsapp_business.note', 'Note:')}</strong> {t('whatsapp_business.allowed_list_note', 'In development mode, messages can only be sent to phone numbers in the allowed list in Meta for Developers.')}
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#add-recipient-phone-numbers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-900"
                  >
                    {t('whatsapp_business.learn_add_numbers', 'Learn how to add phone numbers →')}
                  </a>
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="components-settings-whatsappbusinessapiform.button.common.cancel"
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onClose();
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-whatsappbusinessapiform.button.whatsapp_business.connecting"
              type="submit"
              variant="outline"
              className="btn-brand-primary"
              disabled={isSubmitting || isValidating}
            >
              {isSubmitting ? t('whatsapp_business.connecting', 'Connecting...') : t('whatsapp_business.connect', 'Connect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
