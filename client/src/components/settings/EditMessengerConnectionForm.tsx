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
import { TestTube, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';

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
  connectionId: number;
}

export function EditMessengerConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [formData, setFormData] = useState<MessengerFormData>({
    accountName: '',
    pageId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: `${window.location.origin}/api/webhooks/messenger`,
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
      
      setFormData({
        accountName: connection.accountName || '',
        pageId: connection.accountId || '',
        accessToken: '', // Will be empty since it's sanitized from API
        appId: connectionData.appId || '',
        appSecret: '', // Will be empty since it's sanitized from API
        webhookUrl: connectionData.webhookUrl || `${window.location.origin}/api/webhooks/messenger`,
        verifyToken: connectionData.verifyToken || ''
      });
    } catch (error: any) {
      console.error('Error loading connection data:', error);
      toast({
        title: "Error",
        description: "Failed to load connection data. Please try again.",
        variant: "destructive"
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
      return urlObj.protocol === 'https:' && urlObj.pathname.includes('/api/webhooks/messenger');
    } catch {
      return false;
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: "Validation Error",
        description: "Please fill in webhook URL and verify token first.",
        variant: "destructive"
      });
      return;
    }

    if (!validateWebhookUrl(formData.webhookUrl)) {
      toast({
        title: "Invalid Webhook URL",
        description: "Webhook URL must be HTTPS and point to /api/webhooks/messenger endpoint.",
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
          title: "Webhook Test Successful",
          description: "Your webhook configuration is valid and reachable.",
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Webhook test failed');
      }
    } catch (error: any) {
      toast({
        title: "Webhook Test Failed",
        description: error.message || "Could not validate webhook configuration.",
        variant: "destructive"
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.accountName || !formData.pageId || !formData.appId || !formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    
    try {

      const updateData: any = {
        channelType: 'messenger',
        accountId: formData.pageId,
        accountName: formData.accountName,
        connectionData: {
          pageId: formData.pageId,
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
        throw new Error(errorData.message || 'Failed to update Messenger connection');
      }

      await response.json();
      
      toast({
        title: "Messenger Updated",
        description: "Your Facebook page connection has been updated successfully.",
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating Messenger connection:', error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update Facebook page connection. Please check your credentials and try again.",
        variant: "destructive"
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Facebook Messenger Connection</DialogTitle>
          <DialogDescription>
            Update your Facebook page connection settings.
            You'll need your Meta for Developers credentials.
          </DialogDescription>
        </DialogHeader>
        
        {loadingConnection ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading connection data...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="accountName">Account Name *</Label>
                <Input data-tour="components-settings-editmessengerconnectionform.input.accountName"
                  id="accountName"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleInputChange}
                  placeholder="e.g. My Facebook Page"
                  required
                />
                <p className="text-sm text-gray-500">
                  A name to identify this connection
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="pageId">Facebook Page ID *</Label>
                <Input data-tour="components-settings-editmessengerconnectionform.input.pageId"
                  id="pageId"
                  name="pageId"
                  value={formData.pageId}
                  onChange={handleInputChange}
                  placeholder="1234567890"
                  required
                />
                <p className="text-sm text-gray-500">
                  Your Facebook Page ID from Meta for Developers
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="accessToken">Page Access Token</Label>
                <Input data-tour="components-settings-editmessengerconnectionform.input.accessToken"
                  id="accessToken"
                  name="accessToken"
                  type="password"
                  value={formData.accessToken}
                  onChange={handleInputChange}
                  placeholder="Enter new access token (leave empty to keep current)"
                />
                <p className="text-sm text-gray-500">
                  Long-lived page access token from Meta for Developers. Leave empty to keep current token.
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="appId">App ID *</Label>
                <Input data-tour="components-settings-editmessengerconnectionform.input.appId"
                  id="appId"
                  name="appId"
                  value={formData.appId}
                  onChange={handleInputChange}
                  placeholder="Your app ID"
                  required
                />
                <p className="text-sm text-gray-500">
                  Your Meta app ID
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="appSecret">App Secret</Label>
                <Input data-tour="components-settings-editmessengerconnectionform.input.appSecret"
                  id="appSecret"
                  name="appSecret"
                  type="password"
                  value={formData.appSecret}
                  onChange={handleInputChange}
                  placeholder="Enter new app secret (leave empty to keep current)"
                />
                <p className="text-sm text-gray-500">
                  Your Meta app secret (optional, for webhook verification). Leave empty to keep current secret.
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Webhook Configuration</h4>

                <div className="grid gap-2">
                  <Label htmlFor="webhookUrl">Webhook URL *</Label>
                  <Input data-tour="components-settings-editmessengerconnectionform.input.webhookUrl"
                    id="webhookUrl"
                    name="webhookUrl"
                    value={formData.webhookUrl}
                    onChange={handleInputChange}
                    placeholder="https://yourdomain.com/api/webhooks/messenger"
                    required
                  />
                  <p className="text-sm text-gray-500">
                    This URL will receive webhook events from Meta. Configure this in your Meta Developer Console.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="verifyToken">Webhook Verify Token *</Label>
                  <Input data-tour="components-settings-editmessengerconnectionform.input.verifyToken"
                    id="verifyToken"
                    name="verifyToken"
                    value={formData.verifyToken}
                    onChange={handleInputChange}
                    placeholder="Enter a secure verify token"
                    required
                  />
                  <p className="text-sm text-gray-500">
                    A secure token for webhook verification. Use the same token in your Meta Developer Console.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={testWebhookConnection}
                    disabled={testingWebhook || !formData.webhookUrl || !formData.verifyToken}
                    className="flex items-center gap-2"
                  >
                    <TestTube className="h-4 w-4" />
                    {testingWebhook ? 'Testing...' : 'Test Webhook'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://developers.facebook.com/docs/messenger-platform/webhooks', '_blank')}
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Meta Docs
                  </Button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Setup Instructions:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Configure the webhook URL and verify token in your Meta Developer Console</li>
                        <li>Subscribe to 'messages' and 'messaging_postbacks' webhook fields</li>
                        <li>Test the webhook connection using the button above</li>
                        <li>Ensure your page has the necessary permissions</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading || loadingConnection}>
                Cancel
              </Button>
              <Button type="submit" variant="outline" className="btn-brand-primary" disabled={loading || loadingConnection}>
                {loading ? 'Updating...' : 'Update Connection'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
