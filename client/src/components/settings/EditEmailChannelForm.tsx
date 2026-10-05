import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, TestTube, Eye, EyeOff, Edit } from 'lucide-react';

interface EditEmailChannelFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

interface EmailFormData {
  connectionName: string;
  emailAddress: string;
  displayName: string;
  signature: string;
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

export function EditEmailChannelForm({ isOpen, onClose, onSuccess, connectionId }: EditEmailChannelFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  
  const [formData, setFormData] = useState<EmailFormData>({
    connectionName: '',
    emailAddress: '',
    displayName: '',
    signature: '',
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


  useEffect(() => {
    if (isOpen && connectionId) {
      loadEmailConfiguration();
    }
  }, [isOpen, connectionId]);

  const loadEmailConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/email/config/${connectionId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(errorData.message || 'Email configuration not found. Please check if the email channel is properly configured.');
        } else if (response.status === 403) {
          throw new Error(errorData.message || 'Access denied. You do not have permission to edit this email channel.');
        } else if (response.status === 401) {
          throw new Error(errorData.message || 'Authentication required. Please log in again.');
        } else {
          throw new Error(errorData.message || `Server error: ${response.status}. Please try again later.`);
        }
      }

      const result = await response.json();
      if (result.success && result.data) {
        const config = result.data;
        setFormData({
          connectionName: config.connectionName || '',
          emailAddress: config.emailAddress || '',
          displayName: config.displayName || '',
          signature: config.signature || '',
          imapHost: config.imapHost || '',
          imapPort: config.imapPort?.toString() || '993',
          imapSecure: config.imapSecure !== false,
          imapUsername: config.imapUsername || '',
          imapPassword: '', // Don't populate password for security
          smtpHost: config.smtpHost || '',
          smtpPort: config.smtpPort?.toString() || '465',
          smtpSecure: config.smtpSecure !== false,
          smtpUsername: config.smtpUsername || '',
          smtpPassword: '', // Don't populate password for security
          syncFolder: config.syncFolder || 'INBOX',
          maxSyncMessages: config.maxSyncMessages?.toString() || '100',
          useOAuth2: config.useOAuth2 || false,
          oauth2ClientId: config.oauth2ClientId || '',
          oauth2ClientSecret: '',
          oauth2RefreshToken: ''
        });
      }
    } catch (error: any) {
      console.error('Error loading email configuration:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load email configuration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

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

  const validateCredentials = async () => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
          emailAddress: formData.emailAddress
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Connection Test Successful",
          description: "Both IMAP and SMTP connections are working correctly",
        });
      } else {
        toast({
          title: "Connection Test Failed",
          description: result.message || "Failed to connect to email server",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      toast({
        title: "Connection Test Failed",
        description: error.message || "Failed to test email connection",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/email/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          connectionId: connectionId,
          isUpdate: true, // Flag to indicate this is an update
          imapHost: formData.imapHost,
          imapPort: parseInt(formData.imapPort),
          imapSecure: formData.imapSecure,
          imapUsername: formData.imapUsername || formData.emailAddress,
          imapPassword: formData.imapPassword || undefined, // Only send if provided
          smtpHost: formData.smtpHost,
          smtpPort: parseInt(formData.smtpPort),
          smtpSecure: formData.smtpSecure,
          smtpUsername: formData.smtpUsername || formData.emailAddress,
          smtpPassword: formData.smtpPassword || undefined, // Only send if provided
          emailAddress: formData.emailAddress,
          displayName: formData.displayName,
          signature: formData.signature,
          syncFolder: formData.syncFolder,
          maxSyncMessages: parseInt(formData.maxSyncMessages)
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Email Channel Updated",
          description: "Your email channel has been updated successfully",
        });
        onSuccess();
        handleClose();
      } else {
        toast({
          title: "Update Failed",
          description: result.message || "Failed to update email channel",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error updating email channel:', error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update email channel",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isValidating) {
      onClose();
    }
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading email configuration...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-500" />
            Edit Email Channel
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Configuration</h3>
            
            <div className="grid gap-2">
              <Label htmlFor="connectionName">Connection Name</Label>
              <Input data-tour="components-settings-editemailchannelform.input.connectionName"
                id="connectionName"
                name="connectionName"
                value={formData.connectionName}
                onChange={handleInputChange}
                placeholder="My Email Support"
                required
              />
              <p className="text-sm text-gray-500">
                A friendly name for this email connection
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="emailAddress">Email Address</Label>
              <Input data-tour="components-settings-editemailchannelform.input.emailAddress"
                id="emailAddress"
                name="emailAddress"
                type="email"
                value={formData.emailAddress}
                onChange={handleInputChange}
                placeholder="support@company.com"
                required
              />
              <p className="text-sm text-gray-500">
                The email address for sending and receiving messages
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="displayName">Display Name (Optional)</Label>
              <Input data-tour="components-settings-editemailchannelform.input.displayName"
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                placeholder="Support Team"
              />
              <p className="text-sm text-gray-500">
                The name that appears when sending emails
              </p>
            </div>
          </div>

          {/* IMAP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">IMAP Settings (Receiving)</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="imapHost">IMAP Host</Label>
                <Input data-tour="components-settings-editemailchannelform.input.imapHost"
                  id="imapHost"
                  name="imapHost"
                  value={formData.imapHost}
                  onChange={handleInputChange}
                  placeholder="imap.gmail.com"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="imapPort">IMAP Port</Label>
                <Input data-tour="components-settings-editemailchannelform.input.imapPort"
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
              <Label htmlFor="imapSecure" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Use SSL/TLS for IMAP
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imapUsername">IMAP Username</Label>
              <Input data-tour="components-settings-editemailchannelform.input.imapUsername"
                id="imapUsername"
                name="imapUsername"
                value={formData.imapUsername}
                onChange={handleInputChange}
                placeholder="Leave empty to use email address"
              />
              <p className="text-sm text-gray-500">
                Usually your email address. Leave empty to use the email address above.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imapPassword">IMAP Password</Label>
              <div className="relative">
                <Input data-tour="components-settings-editemailchannelform.input.imapPassword"
                  id="imapPassword"
                  name="imapPassword"
                  type={showImapPassword ? "text" : "password"}
                  value={formData.imapPassword}
                  onChange={handleInputChange}
                  placeholder="Leave empty to keep current password"
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
              <p className="text-sm text-gray-500">
                Leave empty to keep the current password unchanged
              </p>
            </div>
          </div>

          {/* SMTP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">SMTP Settings (Sending)</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input data-tour="components-settings-editemailchannelform.input.smtpHost"
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
                <Input data-tour="components-settings-editemailchannelform.input.smtpPort"
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
              <Label htmlFor="smtpSecure" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Use SSL/TLS for SMTP
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtpUsername">SMTP Username</Label>
              <Input data-tour="components-settings-editemailchannelform.input.smtpUsername"
                id="smtpUsername"
                name="smtpUsername"
                value={formData.smtpUsername}
                onChange={handleInputChange}
                placeholder="Leave empty to use email address"
              />
              <p className="text-sm text-gray-500">
                Usually your email address. Leave empty to use the email address above.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtpPassword">SMTP Password</Label>
              <div className="relative">
                <Input data-tour="components-settings-editemailchannelform.input.smtpPassword"
                  id="smtpPassword"
                  name="smtpPassword"
                  type={showSmtpPassword ? "text" : "password"}
                  value={formData.smtpPassword}
                  onChange={handleInputChange}
                  placeholder="Leave empty to keep current password"
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
              <p className="text-sm text-gray-500">
                Leave empty to keep the current password unchanged
              </p>
            </div>
          </div>

          {/* Email Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Email Settings</h3>

            <div className="grid gap-2">
              <Label htmlFor="signature">Email Signature (Optional)</Label>
              <Input data-tour="components-settings-editemailchannelform.input.signature"
                id="signature"
                name="signature"
                value={formData.signature}
                onChange={handleInputChange}
                placeholder="Best regards, Support Team"
              />
              <p className="text-sm text-gray-500">
                Signature to append to outgoing emails
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="syncFolder">Sync Folder</Label>
                <Select value={formData.syncFolder} onValueChange={(value) => handleSelectChange('syncFolder', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INBOX">INBOX</SelectItem>
                    <SelectItem value="All">All Mail</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxSyncMessages">Max Messages to Sync</Label>
                <Input data-tour="components-settings-editemailchannelform.input.maxSyncMessages"
                  id="maxSyncMessages"
                  name="maxSyncMessages"
                  type="number"
                  value={formData.maxSyncMessages}
                  onChange={handleInputChange}
                  placeholder="100"
                  min="1"
                  max="1000"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
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
              {isValidating ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isValidating}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {isSubmitting ? 'Updating...' : 'Update Channel'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
