import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2, Mail, TestTube, Eye, EyeOff } from 'lucide-react';

interface EmailChannelFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EmailFormData {
  connectionName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  syncFolder: string;
  maxSyncMessages: string;
  useOAuth2: boolean;
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  oauth2RefreshToken: string;
}

export function EmailChannelForm({ isOpen, onClose, onSuccess }: EmailChannelFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showOAuthSecret, setShowOAuthSecret] = useState(false);
  
  const [formData, setFormData] = useState<EmailFormData>({
    connectionName: '',
    emailAddress: '',
    imapHost: '',
    imapPort: '993',
    imapSecure: true,
    imapUsername: '',
    imapPassword: '',
    smtpHost: '',
    smtpPort: '465',
    smtpSecure: true,
    smtpUsername: '',
    smtpPassword: '',
    syncFolder: 'INBOX',
    maxSyncMessages: '100',
    useOAuth2: false,
    oauth2ClientId: '',
    oauth2ClientSecret: '',
    oauth2RefreshToken: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const resetForm = () => {
    setFormData({
      connectionName: '',
      emailAddress: '',
      imapHost: '',
      imapPort: '993',
      imapSecure: true,
      imapUsername: '',
      imapPassword: '',
      smtpHost: '',
      smtpPort: '465',
      smtpSecure: true,
      smtpUsername: '',
      smtpPassword: '',
      syncFolder: 'INBOX',
      maxSyncMessages: '100',
      useOAuth2: false,
      oauth2ClientId: '',
      oauth2ClientSecret: '',
      oauth2RefreshToken: ''
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateCredentials = async (): Promise<boolean> => {
    if (!formData.emailAddress || !formData.imapHost || !formData.smtpHost) {
      toast({
        title: t('email.validation_error', 'Validation Error'),
        description: t('email.fill_required_fields', 'Please fill in all required fields'),
        variant: "destructive"
      });
      return false;
    }

    if (!formData.useOAuth2 && (!formData.imapPassword || !formData.smtpPassword)) {
      toast({
        title: t('email.validation_error', 'Validation Error'),
        description: t('email.provide_passwords_oauth', 'Please provide passwords or configure OAuth2'),
        variant: "destructive"
      });
      return false;
    }

    setIsValidating(true);
    
    try {
      const response = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imapHost: formData.imapHost,
          imapPort: parseInt(formData.imapPort),
          imapSecure: formData.imapSecure,
          imapUsername: formData.imapUsername || formData.emailAddress,
          imapPassword: formData.imapPassword,
          smtpHost: formData.smtpHost,
          smtpPort: parseInt(formData.smtpPort),
          smtpSecure: formData.smtpSecure,
          smtpUsername: formData.smtpUsername || formData.emailAddress,
          smtpPassword: formData.smtpPassword,
          useOAuth2: formData.useOAuth2,
          oauth2ClientId: formData.oauth2ClientId,
          oauth2ClientSecret: formData.oauth2ClientSecret,
          oauth2RefreshToken: formData.oauth2RefreshToken
        })
      });

      if (response.ok) {
        toast({
          title: t('email.connection_test_successful', 'Connection Test Successful'),
          description: t('email.credentials_valid', 'Email server credentials are valid'),
        });
        return true;
      } else {
        const errorData = await response.json();
        toast({
          title: t('email.connection_test_failed', 'Connection Test Failed'),
          description: errorData.error || t('email.failed_connect_server', 'Failed to connect to email server'),
          variant: "destructive"
        });
        return false;
      }
    } catch (error: any) {
      toast({
        title: t('email.connection_test_error', 'Connection Test Error'),
        description: error.message || t('email.failed_test_connection', 'Failed to test email connection'),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);

    let connectionData: any = null;

    try {

      const isValid = await validateCredentials();
      if (!isValid) {
        setIsSubmitting(false);
        return;
      }


      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelType: 'email',
          accountId: formData.emailAddress,
          accountName: formData.connectionName,
          connectionData: {
            emailAddress: formData.emailAddress
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('email.create_connection_failed', 'Failed to create email channel connection'));
      }

      connectionData = await response.json();



      const configResponse = await fetch('/api/email/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionId: connectionData.id,
          connectionName: formData.connectionName,
          emailAddress: formData.emailAddress,
          displayName: '', // Not in form data
          signature: '', // Not in form data
          imapHost: formData.imapHost,
          imapPort: parseInt(formData.imapPort),
          imapSecure: formData.imapSecure,
          imapUsername: formData.imapUsername || formData.emailAddress,
          imapPassword: formData.imapPassword,
          smtpHost: formData.smtpHost,
          smtpPort: parseInt(formData.smtpPort),
          smtpSecure: formData.smtpSecure,
          smtpUsername: formData.smtpUsername || formData.emailAddress,
          smtpPassword: formData.smtpPassword,
          syncFolder: formData.syncFolder,
          syncFrequency: 60, // Default value
          maxSyncMessages: parseInt(formData.maxSyncMessages),
          useOAuth2: formData.useOAuth2,
          oauth2ClientId: formData.oauth2ClientId,
          oauth2ClientSecret: formData.oauth2ClientSecret,
          oauth2RefreshToken: formData.oauth2RefreshToken
        })
      });

      if (!configResponse.ok) {
        const configError = await configResponse.json();
        console.error('Email configuration error:', configError);
        throw new Error(configError.error || t('email.configure_settings_failed', 'Failed to configure email settings'));
      }




      await new Promise(resolve => setTimeout(resolve, 1000));


      try {
        const connectResponse = await fetch('/api/email/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            connectionId: connectionData.id
          })
        });

        if (connectResponse.ok) {
          toast({
            title: t('common.success', 'Success'),
            description: t('email.channel_connected_success', 'Email channel connected and polling started successfully!'),
          });
        } else {
          const connectError = await connectResponse.json();
          console.error('Email connection error:', connectError);
          toast({
            title: t('email.configuration_successful', 'Configuration Successful'),
            description: t('email.configured_connection_failed', 'Email channel configured but connection failed: {{error}}. You can try connecting manually from Settings.', { error: connectError.message || 'Unknown error' }),
            variant: "destructive"
          });
        }
      } catch (connectError: any) {
        console.error('Email connection error:', connectError);
        toast({
          title: t('email.configuration_successful', 'Configuration Successful'),
          description: t('email.configured_connection_failed', 'Email channel configured but connection failed: {{error}}. You can try connecting manually from Settings.', { error: connectError.message || 'Unknown error' }),
          variant: "destructive"
        });
      }

      resetForm();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating email connection:', error);
      toast({
        title: t('email.connection_error', 'Connection Error'),
        description: error.message || t('email.failed_create_connection', 'Failed to create email connection'),
        variant: "destructive"
      });


      if (error.message?.includes('Failed to configure email settings') && connectionData?.id) {
        try {
          await fetch(`/api/channel-connections/${connectionData.id}`, {
            method: 'DELETE',
            credentials: 'include'
          });

        } catch (cleanupError) {
          console.error('Failed to cleanup connection:', cleanupError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-tour="components-settings-emailchannelform.dialogcontent.email.connect_email_channel" className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            {t('email.connect_email_channel', 'Connect Email Channel')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('email.basic_configuration', 'Basic Configuration')}</h3>

            <div className="grid gap-2">
              <Label htmlFor="connectionName">{t('email.connection_name', 'Connection Name')}</Label>
              <Input data-tour="components-settings-emailchannelform.input.email.connection_name_placeholder"
                id="connectionName"
                name="connectionName"
                value={formData.connectionName}
                onChange={handleInputChange}
                placeholder={t('email.connection_name_placeholder', 'My Email Support')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('email.connection_name_help', 'A friendly name for this email connection')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="emailAddress">{t('email.email_address', 'Email Address')}</Label>
              <Input data-tour="components-settings-emailchannelform.input.email.email_address_placeholder"
                id="emailAddress"
                name="emailAddress"
                type="email"
                value={formData.emailAddress}
                onChange={handleInputChange}
                placeholder={t('email.email_address_placeholder', 'support@company.com')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('email.email_address_help', 'The email address for sending and receiving messages')}
              </p>
            </div>
          </div>

          {/* IMAP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('email.imap_settings', 'IMAP Settings (Receiving)')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="imapHost">{t('email.imap_host', 'IMAP Host')}</Label>
                <Input data-tour="components-settings-emailchannelform.input.email.imap_host_placeholder"
                  id="imapHost"
                  name="imapHost"
                  value={formData.imapHost}
                  onChange={handleInputChange}
                  placeholder={t('email.imap_host_placeholder', 'imap.gmail.com')}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="imapPort">{t('email.imap_port', 'IMAP Port')}</Label>
                <Input data-tour="components-settings-emailchannelform.input.imapPort"
                  id="imapPort"
                  name="imapPort"
                  value={formData.imapPort}
                  onChange={handleInputChange}
                  placeholder="993"
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="imapSecure"
                checked={formData.imapSecure}
                onCheckedChange={(checked) => handleCheckboxChange('imapSecure', checked as boolean)}
              />
              <Label htmlFor="imapSecure">{t('email.use_ssl_tls_imap', 'Use SSL/TLS for IMAP')}</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imapUsername">{t('email.imap_username', 'IMAP Username (optional)')}</Label>
              <Input data-tour="components-settings-emailchannelform.input.email.imap_username_placeholder"
                id="imapUsername"
                name="imapUsername"
                value={formData.imapUsername}
                onChange={handleInputChange}
                placeholder={t('email.imap_username_placeholder', 'Leave empty to use email address')}
              />
            </div>

            {!formData.useOAuth2 && (
              <div className="grid gap-2">
                <Label htmlFor="imapPassword">IMAP Password</Label>
                <div className="relative">
                  <Input data-tour="components-settings-emailchannelform.input.imapPassword"
                    id="imapPassword"
                    name="imapPassword"
                    type={showImapPassword ? "text" : "password"}
                    value={formData.imapPassword}
                    onChange={handleInputChange}
                    placeholder="Your email password or app password"
                    required={!formData.useOAuth2}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowImapPassword(!showImapPassword)}
                  >
                    {showImapPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* SMTP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">SMTP Settings (Sending)</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input data-tour="components-settings-emailchannelform.input.smtpHost"
                  id="smtpHost"
                  name="smtpHost"
                  value={formData.smtpHost}
                  onChange={handleInputChange}
                  placeholder="smtp.gmail.com"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="smtpPort">SMTP Port</Label>
                <Input data-tour="components-settings-emailchannelform.input.smtpPort"
                  id="smtpPort"
                  name="smtpPort"
                  value={formData.smtpPort}
                  onChange={handleInputChange}
                  placeholder="465"
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="smtpSecure"
                checked={formData.smtpSecure}
                onCheckedChange={(checked) => handleCheckboxChange('smtpSecure', checked as boolean)}
              />
              <Label htmlFor="smtpSecure">Use SSL/TLS for SMTP</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtpUsername">SMTP Username (optional)</Label>
              <Input data-tour="components-settings-emailchannelform.input.smtpUsername"
                id="smtpUsername"
                name="smtpUsername"
                value={formData.smtpUsername}
                onChange={handleInputChange}
                placeholder="Leave empty to use email address"
              />
            </div>

            {!formData.useOAuth2 && (
              <div className="grid gap-2">
                <Label htmlFor="smtpPassword">SMTP Password</Label>
                <div className="relative">
                  <Input data-tour="components-settings-emailchannelform.input.smtpPassword"
                    id="smtpPassword"
                    name="smtpPassword"
                    type={showSmtpPassword ? "text" : "password"}
                    value={formData.smtpPassword}
                    onChange={handleInputChange}
                    placeholder="Your email password or app password"
                    required={!formData.useOAuth2}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                  >
                    {showSmtpPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Advanced Settings</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="syncFolder">Sync Folder</Label>
                <Input data-tour="components-settings-emailchannelform.input.syncFolder"
                  id="syncFolder"
                  name="syncFolder"
                  value={formData.syncFolder}
                  onChange={handleInputChange}
                  placeholder="INBOX"
                />
                <p className="text-sm text-gray-500">
                  Email folder to monitor for new messages
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxSyncMessages">Max Messages to Sync</Label>
                <Input data-tour="components-settings-emailchannelform.input.maxSyncMessages"
                  id="maxSyncMessages"
                  name="maxSyncMessages"
                  type="number"
                  value={formData.maxSyncMessages}
                  onChange={handleInputChange}
                  placeholder="100"
                  min="1"
                  max="1000"
                />
                <p className="text-sm text-gray-500">
                  Maximum number of messages to sync per check
                </p>
              </div>
            </div>
          </div>

          {/* OAuth2 Configuration */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="useOAuth2"
                checked={formData.useOAuth2}
                onCheckedChange={(checked) => handleCheckboxChange('useOAuth2', checked as boolean)}
              />
              <Label htmlFor="useOAuth2">Use OAuth2 Authentication (Recommended for Gmail)</Label>
            </div>

            {formData.useOAuth2 && (
              <div className="space-y-4 pl-6 border-l-2 border-blue-200">
                <div className="grid gap-2">
                  <Label htmlFor="oauth2ClientId">OAuth2 Client ID</Label>
                  <Input data-tour="components-settings-emailchannelform.input.oauth2ClientId"
                    id="oauth2ClientId"
                    name="oauth2ClientId"
                    value={formData.oauth2ClientId}
                    onChange={handleInputChange}
                    placeholder="Your OAuth2 client ID"
                    required={formData.useOAuth2}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="oauth2ClientSecret">OAuth2 Client Secret</Label>
                  <div className="relative">
                    <Input data-tour="components-settings-emailchannelform.input.oauth2ClientSecret"
                      id="oauth2ClientSecret"
                      name="oauth2ClientSecret"
                      type={showOAuthSecret ? "text" : "password"}
                      value={formData.oauth2ClientSecret}
                      onChange={handleInputChange}
                      placeholder="Your OAuth2 client secret"
                      required={formData.useOAuth2}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowOAuthSecret(!showOAuthSecret)}
                    >
                      {showOAuthSecret ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="oauth2RefreshToken">OAuth2 Refresh Token</Label>
                  <Input data-tour="components-settings-emailchannelform.input.oauth2RefreshToken"
                    id="oauth2RefreshToken"
                    name="oauth2RefreshToken"
                    value={formData.oauth2RefreshToken}
                    onChange={handleInputChange}
                    placeholder="Your OAuth2 refresh token"
                    required={formData.useOAuth2}
                  />
                  <p className="text-sm text-gray-500">
                    Obtain this from your OAuth2 provider's authorization flow
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button data-tour="components-settings-emailchannelform.button.common.cancel" type="button" variant="outline" onClick={handleClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-emailchannelform.button.email.testing"
              type="button"
              variant="outline"
              onClick={validateCredentials}
              disabled={isValidating || !formData.emailAddress || !formData.imapHost || !formData.smtpHost}
              className="flex items-center gap-2"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              {isValidating ? t('email.testing', 'Testing...') : t('email.test_connection', 'Test Connection')}
            </Button>
            <Button data-tour="components-settings-emailchannelform.button.email.creating"
              type="submit"
              disabled={isSubmitting || isValidating}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {isSubmitting ? t('email.creating', 'Creating...') : t('email.create_connection', 'Create Connection')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
