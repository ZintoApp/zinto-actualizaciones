import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { emitTourSignal } from '@/components/guided-tours/signals';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/contexts/branding-context';
import { useTranslation } from '@/hooks/use-translation';
import {
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Activity,
  Code,
  BookOpen,
  BarChart3,
  Settings,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Cable as TabIconCable,
  CircleAlert as TabIconCircleAlert,
  Code as TabIconCode,
  Images as TabIconImages,
  Info as TabIconInfo,
  Layers as TabIconLayers,
  LayoutTemplate as TabIconLayoutTemplate,
  MousePointerClick as TabIconMousePointerClick,
  Webhook as TabIconWebhook,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
}

interface ApiUsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgDuration: number;
  totalDataTransfer?: number | null;
}

export function ApiAccessTab() {
  const { toast } = useToast();
  const { branding } = useBranding();
  const { t, currentLanguage } = useTranslation();
  const dateLocale = currentLanguage?.code?.toLowerCase().startsWith('es') ? es : enUS;
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usageStats, setUsageStats] = useState<ApiUsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadApiKeys();
    loadUsageStats();
  }, []);

  const loadApiKeys = async () => {
    try {
      const response = await fetch('/api/settings/api-keys');
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast({
        title: t('settings.api_access.toast.error', 'Error'),
        description: t('settings.api_access.toast.load_keys_failed', 'Failed to load API keys'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsageStats = async () => {
    try {
      const response = await fetch('/api/settings/api-usage-stats');
      if (response.ok) {
        const data = await response.json();
        setUsageStats(data);
      }
    } catch (error) {
      console.error('Error loading usage stats:', error);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: t('settings.api_access.toast.error', 'Error'),
        description: t('settings.api_access.toast.enter_key_name', 'Please enter a name for the API key'),
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newKeyName.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        emitTourSignal('settings-saved');
        setNewApiKey(data.key);
        setShowKeyModal(true);
        setShowCreateModal(false);
        setNewKeyName('');
        await loadApiKeys();
        
        toast({
          title: t('settings.api_access.toast.success', 'Success'),
          description: t('settings.api_access.toast.key_created', 'API key created successfully')
        });
      } else {
        const error = await response.json();
        throw new Error(error.message || t('settings.api_access.toast.create_key_failed', 'Failed to create API key'));
      }
    } catch (error: any) {
      toast({
        title: t('settings.api_access.toast.error', 'Error'),
        description: error.message || t('settings.api_access.toast.create_key_failed', 'Failed to create API key'),
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const deleteApiKey = async (id: number, name: string) => {
    if (!confirm(t('settings.api_access.confirm_delete_key', 'Are you sure you want to delete the API key "{{name}}"? This action cannot be undone.', { name }))) {
      return;
    }

    try {
      const response = await fetch(`/api/settings/api-keys/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadApiKeys();
        toast({
          title: t('settings.api_access.toast.success', 'Success'),
          description: t('settings.api_access.toast.key_deleted', 'API key deleted successfully')
        });
      } else {
        throw new Error(t('settings.api_access.toast.delete_key_failed', 'Failed to delete API key'));
      }
    } catch (error: any) {
      toast({
        title: t('settings.api_access.toast.error', 'Error'),
        description: error.message || t('settings.api_access.toast.delete_key_failed', 'Failed to delete API key'),
        variant: "destructive"
      });
    }
  };

  const toggleApiKey = async (id: number, isActive: boolean) => {
    try {
      const response = await fetch(`/api/settings/api-keys/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isActive: !isActive
        })
      });

      if (response.ok) {
        await loadApiKeys();
        toast({
          title: t('settings.api_access.toast.success', 'Success'),
          description: !isActive
            ? t('settings.api_access.toast.key_activated', 'API key activated successfully')
            : t('settings.api_access.toast.key_deactivated', 'API key deactivated successfully')
        });
      } else {
        throw new Error(t('settings.api_access.toast.update_key_failed', 'Failed to update API key'));
      }
    } catch (error: any) {
      toast({
        title: t('settings.api_access.toast.error', 'Error'),
        description: error.message || t('settings.api_access.toast.update_key_failed', 'Failed to update API key'),
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('settings.api_access.toast.copied', 'Copied'),
      description: t('settings.api_access.toast.key_copied', 'API key copied to clipboard')
    });
  };

  const formatBytes = (bytes: number | null | undefined) => {
    const n = typeof bytes === 'number' ? bytes : Number(bytes);
    const b = Number.isFinite(n) && n > 0 ? n : 0;
    if (b === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const rawIndex = Math.floor(Math.log(b) / Math.log(k));
    const i = Math.min(Math.max(0, rawIndex), sizes.length - 1);
    return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.api_access.loading', 'Loading API access...')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 data-tour="components-settings-apiaccesstab.h2.settings.api_access.title" className="text-2xl font-bold">{t('settings.api_access.title', 'API Access')}</h2>
          <p className="text-muted-foreground">
            {t('settings.api_access.description', 'Manage API keys and programmatic access to your channels')}
          </p>
        </div>
        <Button data-tour="components-settings-apiaccesstab.button.settings.api_access.create_key" data-tour-api-create onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('settings.api_access.create_key', 'Create API Key')}
        </Button>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger data-tour="components-settings-apiaccesstab.tabstrigger.keys" value="keys">
            <Key className="w-4 h-4 mr-2" />
            {t('settings.api_access.tabs.keys', 'API Keys')}
          </TabsTrigger>
          <TabsTrigger data-tour="components-settings-apiaccesstab.tabstrigger.usage" value="usage">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('settings.api_access.tabs.usage', 'Usage Statistics')}
          </TabsTrigger>
          <TabsTrigger data-tour="components-settings-apiaccesstab.tabstrigger.docs" value="docs">
            <BookOpen className="w-4 h-4 mr-2" />
            {t('settings.api_access.tabs.docs', 'Documentation')}
          </TabsTrigger>
        </TabsList>

        <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.keys" value="keys" className="space-y-4">
          {apiKeys.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Key className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{t('settings.api_access.no_keys_title', 'No API Keys')}</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {t('settings.api_access.no_keys_description', 'Create your first API key to start sending messages programmatically')}
                </p>
                <Button data-tour="components-settings-apiaccesstab.button.settings.api_access.create_key" onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('settings.api_access.create_key', 'Create API Key')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {apiKeys.map((apiKey) => (
                <Card key={apiKey.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center">
                          {apiKey.name}
                          <Badge 
                            variant={apiKey.isActive ? "default" : "secondary"}
                            className={apiKey.isActive ? "ml-2" : "ml-2 !bg-muted !text-muted-foreground"}
                          >
                            {apiKey.isActive ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {t('settings.api_access.status.active', 'Active')}
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 mr-1" />
                                {t('settings.api_access.status.inactive', 'Inactive')}
                              </>
                            )}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {t('settings.api_access.key_prefix', 'Key: {{prefix}}', { prefix: `${apiKey.keyPrefix}••••••••` })}
                        </CardDescription>
                      </div>
                      <div className="flex space-x-2">
                        <Button data-tour="components-settings-apiaccesstab.button.settings.api_access.deactivate"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleApiKey(apiKey.id, apiKey.isActive)}
                        >
                          {apiKey.isActive
                            ? t('settings.api_access.deactivate', 'Deactivate')
                            : t('settings.api_access.activate', 'Activate')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteApiKey(apiKey.id, apiKey.name)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <Label className="text-muted-foreground">{t('settings.api_access.created', 'Created')}</Label>
                        <p className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true, locale: dateLocale })}
                        </p>
                      </div>
                      <div>
                        <Label className="text-gray-500">{t('settings.api_access.last_used', 'Last Used')}</Label>
                        <p className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {apiKey.lastUsedAt 
                            ? formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true, locale: dateLocale })
                            : t('settings.api_access.never', 'Never')
                          }
                        </p>
                      </div>
                      <div>
                        <Label className="text-gray-500">{t('settings.api_access.rate_limits', 'Rate Limits')}</Label>
                        <p>{t('settings.api_access.rate_limits_short', '{{minute}}/min, {{hour}}/hr', { minute: apiKey.rateLimitPerMinute, hour: apiKey.rateLimitPerHour })}</p>
                      </div>
                      <div>
                        <Label className="text-gray-500">{t('settings.api_access.permissions', 'Permissions')}</Label>
                        <p>{apiKey.permissions.join(', ')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.usage" value="usage" className="space-y-4">
          {usageStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <Activity className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                    <div className="ml-2">
                      <p className="text-sm font-medium">{t('settings.api_access.usage.total_requests', 'Total Requests')}</p>
                      <p className="text-2xl font-bold">{usageStats.totalRequests.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    <div className="ml-2">
                      <p className="text-sm font-medium">{t('settings.api_access.usage.successful', 'Successful')}</p>
                      <p className="text-2xl font-bold">{usageStats.successfulRequests.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                    <div className="ml-2">
                      <p className="text-sm font-medium">{t('settings.api_access.usage.failed', 'Failed')}</p>
                      <p className="text-2xl font-bold">{usageStats.failedRequests.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
                    <div className="ml-2">
                      <p className="text-sm font-medium">{t('settings.api_access.usage.avg_duration', 'Avg Duration')}</p>
                      <p className="text-2xl font-bold">{Math.round(usageStats.avgDuration)}ms</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <BarChart3 className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                    <div className="ml-2">
                      <p className="text-sm font-medium">{t('settings.api_access.usage.data_transfer', 'Data Transfer')}</p>
                      <p className="text-2xl font-bold">{formatBytes(usageStats.totalDataTransfer)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.docs" value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.api_access.docs.title', 'API Documentation')}</CardTitle>
              <CardDescription>
                {t('settings.api_access.docs.description', 'Complete guide to integrate WhatsApp messaging into your applications')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                  <TabsTrigger icon={TabIconInfo} data-tour="components-settings-apiaccesstab.tabstrigger.overview" value="overview">{t('settings.api_access.docs.tabs.overview', 'Overview')}</TabsTrigger>
                  <TabsTrigger icon={TabIconCable} data-tour="components-settings-apiaccesstab.tabstrigger.channels" value="channels">{t('settings.api_access.docs.tabs.channels', 'Channels')}</TabsTrigger>
                  <TabsTrigger icon={InboxConversationIcon} data-tour="components-settings-apiaccesstab.tabstrigger.messages" value="messages">{t('settings.api_access.docs.tabs.messages', 'Messages')}</TabsTrigger>
                  <TabsTrigger icon={TabIconLayers} data-tour="components-settings-apiaccesstab.tabstrigger.batch" value="batch">{t('settings.api_access.docs.tabs.batch', 'Batch')}</TabsTrigger>
                  <TabsTrigger icon={TabIconLayoutTemplate} data-tour="components-settings-apiaccesstab.tabstrigger.template" value="template">{t('settings.api_access.docs.tabs.template', 'Template')}</TabsTrigger>
                  <TabsTrigger icon={TabIconMousePointerClick} data-tour="components-settings-apiaccesstab.tabstrigger.interactive" value="interactive">{t('settings.api_access.docs.tabs.interactive', 'Interactive')}</TabsTrigger>
                  <TabsTrigger icon={TabIconWebhook} data-tour="components-settings-apiaccesstab.tabstrigger.webhooks" value="webhooks">{t('settings.api_access.docs.tabs.webhooks', 'Webhooks')}</TabsTrigger>
                  <TabsTrigger icon={TabIconImages} data-tour="components-settings-apiaccesstab.tabstrigger.media" value="media">{t('settings.api_access.docs.tabs.media', 'Media')}</TabsTrigger>
                  <TabsTrigger icon={TabIconCircleAlert} data-tour="components-settings-apiaccesstab.tabstrigger.errors" value="errors">{t('settings.api_access.docs.tabs.errors', 'Errors')}</TabsTrigger>
                  <TabsTrigger icon={TabIconCode} data-tour="components-settings-apiaccesstab.tabstrigger.examples" value="examples">{t('settings.api_access.docs.tabs.examples', 'Examples')}</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.overview" value="overview" className="space-y-4">
                  <div className="space-y-6">
                    <div className=" dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                      <h4 className="font-semibold  dark:text-blue-400 mb-2">{t('settings.api_access.docs.getting_started', '🚀 Getting Started')}</h4>
                      <p className="text-blue-800 dark:text-blue-400 text-sm">
                        {t('settings.api_access.docs.getting_started_description', 'The API allows you to send WhatsApp messages programmatically. Follow this guide to integrate messaging capabilities into your applications.')}
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">{t('settings.api_access.docs.base_url', 'Base URL')}</h4>
                        <code className="text-sm bg-background px-3 py-2 rounded border block">
                          {window.location.origin}/api/v1
                        </code>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">{t('settings.api_access.docs.content_type', 'Content Type')}</h4>
                        <code className="text-sm bg-background px-3 py-2 rounded border block">
                          application/json
                        </code>
                      </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900">
                      <h4 className="font-semibold text-yellow-900 dark:text-yellow-400 mb-2">{t('settings.api_access.docs.authentication', '🔐 Authentication')}</h4>
                      <p className="text-yellow-800 dark:text-yellow-400 text-sm mb-3">
                        {t('settings.api_access.docs.authentication_description', 'All API requests require authentication using your API key in the Authorization header:')}
                      </p>
                      <code className="text-sm bg-background px-3 py-2 rounded border block">
                        Authorization: Bearer YOUR_API_KEY
                      </code>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                      <h4 className="font-semibold text-green-900 dark:text-green-400 mb-2">{t('settings.api_access.docs.rate_limits', '⚡ Rate Limits')}</h4>
                      <div className="text-green-800 dark:text-green-400 text-sm space-y-1">
                        <p>{t('settings.api_access.docs.rate_limit_minute', '• Per Minute: 60 requests')}</p>
                        <p>{t('settings.api_access.docs.rate_limit_hour', '• Per Hour: 1,000 requests')}</p>
                        <p>{t('settings.api_access.docs.rate_limit_day', '• Per Day: 10,000 requests')}</p>
                        <p className="mt-2 text-xs">{t('settings.api_access.docs.rate_limits_note', 'Rate limits are enforced per API key. Exceeded limits return HTTP 429.')}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold">{t('settings.api_access.docs.quick_start_workflow', 'Quick Start Workflow')}</h4>
                      <div className="space-y-2">
                        <div className="flex items-center p-3 bg-muted rounded border-l-4 border-blue-500">
                          <div className="0 dark:bg-blue-400 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3">1</div>
                          <div>
                            <p className="font-medium">{t('settings.api_access.docs.workflow_channels_title', 'Get Available Channels')}</p>
                            <p className="text-sm text-muted-foreground">{t('settings.api_access.docs.workflow_channels_desc', 'Fetch your configured WhatsApp channels')}</p>
                          </div>
                        </div>
                        <div className="flex items-center p-3 bg-muted rounded border-l-4 border-green-500">
                          <div className="bg-green-500 dark:bg-green-400 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3">2</div>
                          <div>
                            <p className="font-medium">{t('settings.api_access.docs.workflow_messages_title', 'Send Messages')}</p>
                            <p className="text-sm text-muted-foreground">{t('settings.api_access.docs.workflow_messages_desc', 'Send text or media messages through your channels')}</p>
                          </div>
                        </div>
                        <div className="flex items-center p-3 bg-muted rounded border-l-4 border-purple-500">
                          <div className="bg-purple-500 dark:bg-purple-400 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3">3</div>
                          <div>
                            <p className="font-medium">{t('settings.api_access.docs.workflow_responses_title', 'Handle Responses')}</p>
                            <p className="text-sm text-muted-foreground">{t('settings.api_access.docs.workflow_responses_desc', 'Process success/error responses and message IDs')}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Channels Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.channels" value="channels" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">GET /channels</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.channels_description', 'Retrieve all active channels configured for your account. Supported channel types: whatsapp_unofficial, whatsapp_official, whatsapp_meta, telegram, instagram, messenger, tiktok, email, twilio_sms, webchat.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.request', 'Request')}</h5>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">GET</Badge>
                            <code className="text-sm">/api/v1/channels</code>
                          </div>
                          <div className="text-sm">
                            <strong>{t('settings.api_access.docs.headers', 'Headers:')}</strong>
                            <pre className="bg-background p-2 rounded border mt-1 text-xs overflow-x-auto">
{`Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                        <h5 className="font-medium mb-2 text-green-900 dark:text-green-400">{t('settings.api_access.docs.success_response_200', 'Success Response (200)')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "MyBusinessNumber",
      "type": "whatsapp_unofficial",
      "status": "active",
      "phoneNumber": "1234567890",
      "displayName": "My Business"
    }
  ],
  "count": 1
}`}
                        </pre>
                      </div>

                      <div className=" dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                        <h5 className="font-medium mb-2  dark:text-blue-400">{t('settings.api_access.docs.response_fields', 'Response Fields')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">id</code> - {t('settings.api_access.docs.field_id', 'Unique channel identifier')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">name</code> - {t('settings.api_access.docs.field_name', 'Channel display name')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">type</code> - {t('settings.api_access.docs.field_type', 'Channel type (whatsapp_unofficial, whatsapp_official, whatsapp_meta, telegram, instagram, messenger, tiktok, email, twilio_sms, webchat)')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">status</code> - {t('settings.api_access.docs.field_status', 'Channel status (active, inactive)')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">phoneNumber</code> - {t('settings.api_access.docs.field_phone_number', 'WhatsApp phone number (if available)')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">displayName</code> - {t('settings.api_access.docs.field_display_name', 'WhatsApp display name')}</div>
                        </div>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.curl_example', 'cURL Example')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X GET "${window.location.origin}/api/v1/channels" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Messages Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.messages" value="messages" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">POST /messages/send</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.messages_description', 'Send text messages through your configured WhatsApp channels.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.request', 'Request')}</h5>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">POST</Badge>
                            <code className="text-sm">/api/v1/messages/send</code>
                          </div>
                          <div className="text-sm">
                            <strong>{t('settings.api_access.docs.headers', 'Headers:')}</strong>
                            <pre className="bg-background p-2 rounded border mt-1 text-xs overflow-x-auto">
{`Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}
                            </pre>
                          </div>
                          <div className="text-sm">
                            <strong>{t('settings.api_access.docs.body', 'Body:')}</strong>
                            <pre className="bg-background p-2 rounded border mt-1 text-xs overflow-x-auto">
{`{
  "channelId": 1,
  "to": "1234567890",
  "message": "Hello! This is a test message from application API."
}`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className=" dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                        <h5 className="font-medium mb-2  dark:text-blue-400">{t('settings.api_access.docs.request_parameters', 'Request Parameters')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">channelId</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_channel_id', 'Channel ID from /channels endpoint')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">to</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_to_with_country', 'Recipient phone number (with country code)')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">message</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_message', 'Text message content (max 4096 characters)')}</div>
                          <div className="text-xs text-muted-foreground mt-2"><span className="text-red-500 dark:text-red-400">*</span> {t('settings.api_access.docs.required_fields', 'Required fields')}</div>
                        </div>
                      </div>

                      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                        <h5 className="font-medium mb-2 text-green-900 dark:text-green-400">{t('settings.api_access.docs.success_response_200', 'Success Response (200)')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "success": true,
  "data": {
    "messageId": "msg_1234567890",
    "status": "sent",
    "channelId": 1,
    "to": "1234567890",
    "sentAt": "2026-01-15T10:30:00Z"
  }
}`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.curl_example', 'cURL Example')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/messages/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelId": 1,
    "to": "1234567890",
    "message": "Hello from application API!"
  }'`}
                        </pre>
                      </div>

                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900">
                        <h5 className="font-medium mb-2 text-yellow-900 dark:text-yellow-400">{t('settings.api_access.docs.phone_format', '📱 Phone Number Format')}</h5>
                        <div className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
                          <p>{t('settings.api_access.docs.phone_format_country', '• Include country code (e.g., 1 for US, 44 for UK)')}</p>
                          <p>{t('settings.api_access.docs.phone_format_no_spaces', '• No spaces, dashes, or special characters')}</p>
                          <p>{t('settings.api_access.docs.phone_format_examples', '• Examples: 1234567890, 447123456789')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Batch Messages Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.batch" value="batch" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">POST /messages/send-batch</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.batch_description', 'Send multiple messages in a single request. Maximum 100 messages per batch.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.request', 'Request')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "messages": [
    {
      "channelId": 1,
      "to": "1234567890",
      "message": "Hello from batch API!"
    },
    {
      "channelId": 1,
      "to": "0987654321",
      "message": "Another message"
    }
  ]
}`}
                        </pre>
                      </div>

                      <div className=" p-4 rounded-lg border border-blue-200">
                        <h5 className="font-medium mb-2 ">{t('settings.api_access.docs.request_parameters', 'Request Parameters')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">messages</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_messages', 'Array of message objects (1-100 messages)')}</div>
                          <div className="text-xs text-muted-foreground mt-2">{t('settings.api_access.docs.each_message_requires', 'Each message object requires: channelId, to, message')}</div>
                        </div>
                      </div>

                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h5 className="font-medium mb-2 text-green-900">{t('settings.api_access.docs.success_response_201', 'Success Response (201)')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "success": true,
  "data": [
    {
      "id": 123,
      "status": "sent",
      "timestamp": "2026-01-15T10:30:00Z",
      "channelType": "whatsapp_unofficial",
      "conversationId": 456
    },
    {
      "id": 124,
      "status": "failed",
      "error": "Invalid phone number",
      "timestamp": "2026-01-15T10:30:01Z"
    }
  ],
  "count": 2
}`}
                        </pre>
                      </div>

                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900">
                        <h5 className="font-medium mb-2 text-yellow-900 dark:text-yellow-400">{t('settings.api_access.docs.best_practices', 'Best Practices')}</h5>
                        <div className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
                          <p>{t('settings.api_access.docs.best_process_sequentially', '• Process messages sequentially to respect rate limits')}</p>
                          <p>{t('settings.api_access.docs.best_check_status', '• Check individual message status in response array')}</p>
                          <p>{t('settings.api_access.docs.best_handle_failures', '• Handle partial failures gracefully')}</p>
                          <p>{t('settings.api_access.docs.best_batch_usage', '• Use batch for bulk operations, single endpoint for critical messages')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Template Messages Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.template" value="template" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">POST /messages/send-template</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.template_description', 'Send WhatsApp template messages. Only supported on WhatsApp official and meta channels.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.request', 'Request')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "channelId": 1,
  "to": "1234567890",
  "templateId": 42,
  "appointmentId": 123,
  "componentValues": {
    "header": { "customer_name": "John" },
    "body": { "order_id": "A-100" },
    "buttons": [
      { "index": 0, "subType": "url", "values": { "order_id": "A-100" } }
    ]
  }
}`}
                        </pre>
                      </div>

                      <div className=" p-4 rounded-lg border border-blue-200">
                        <h5 className="font-medium mb-2 ">{t('settings.api_access.docs.request_parameters', 'Request Parameters')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">templateId</code> - {t('settings.api_access.docs.param_template_id', 'ID of an approved synced template; required when using componentValues')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">templateName</code> - {t('settings.api_access.docs.param_template_name', 'Name of approved template; required for raw components')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">templateLanguage</code> - {t('settings.api_access.docs.param_template_language', 'Language code (default: "en")')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">components</code> - {t('settings.api_access.docs.param_components', 'Array of template components with variables')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">componentValues</code> - {t('settings.api_access.docs.param_component_values', 'Component-scoped values built safely from the stored template')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">appointmentId / dealId</code> - {t('settings.api_access.docs.param_template_context_ids', 'Optional tenant-validated record context used by stored variable mappings')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">contextVariables</code> - {t('settings.api_access.docs.param_context_variables', 'Optional ERP or workflow values keyed by their system variable path')}</div>
                          <div className="text-xs text-muted-foreground mt-2">{t('settings.api_access.docs.template_defaults', 'componentValues can be omitted when every variable has a stored default mapping; supplied non-empty values override those defaults.')}</div>
                          <div className="text-xs text-muted-foreground mt-2">{t('settings.api_access.docs.component_types', 'Component types: header, body, button')}</div>
                        </div>
                      </div>

                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900">
                        <h5 className="font-medium mb-2 text-yellow-900 dark:text-yellow-400">{t('settings.api_access.docs.important_notes', '⚠️ Important Notes')}</h5>
                        <div className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
                          <p>{t('settings.api_access.docs.templates_approved', '• Templates must be approved by WhatsApp before use')}</p>
                          <p>{t('settings.api_access.docs.templates_channel_support', '• Only available on WhatsApp official and meta channels')}</p>
                          <p>{t('settings.api_access.docs.templates_variables_match', '• Template variables must match template structure')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Interactive Messages Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.interactive" value="interactive" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">POST /messages/send-interactive</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.interactive_description', 'Send interactive messages with buttons or lists. Only supported on WhatsApp channels.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.button_example', 'Button Example')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "channelId": 1,
  "to": "1234567890",
  "interactiveType": "button",
  "content": {
    "body": { "text": "Choose an option:" },
    "footer": { "text": ${JSON.stringify(t('settings.api_access.docs.powered_by_app', 'Powered by {{appName}}', { appName: branding.appName }))} }
  },
  "options": {
    "type": "button",
    "buttons": [
      { "id": "option1", "title": "Yes" },
      { "id": "option2", "title": "No" }
    ]
  }
}`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.list_example', 'List Example')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "channelId": 1,
  "to": "1234567890",
  "interactiveType": "list",
  "content": {
    "body": { "text": "Select a product:" }
  },
  "options": {
    "type": "list",
    "button": "View Products",
    "sections": [
      {
        "rows": [
          { "id": "product1", "title": "Product 1", "description": "Description 1" },
          { "id": "product2", "title": "Product 2", "description": "Description 2" }
        ]
      }
    ]
  }
}`}
                        </pre>
                      </div>

                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900">
                        <h5 className="font-medium mb-2 text-yellow-900 dark:text-yellow-400">{t('settings.api_access.docs.limitations', '⚠️ Limitations')}</h5>
                        <div className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
                          <p>{t('settings.api_access.docs.limit_buttons', '• Buttons: Maximum 3 buttons per message')}</p>
                          <p>{t('settings.api_access.docs.limit_lists', '• Lists: Maximum 10 sections, 10 rows per section')}</p>
                          <p>{t('settings.api_access.docs.limit_button_titles', '• Button titles: Maximum 20 characters')}</p>
                          <p>{t('settings.api_access.docs.limit_list_titles', '• List row titles: Maximum 24 characters')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Webhooks Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.webhooks" value="webhooks" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">{t('settings.api_access.docs.webhook_configuration', 'Webhook Configuration')}</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.webhook_description', 'Configure webhooks to receive real-time delivery status notifications for your messages.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className=" p-4 rounded-lg border border-blue-200">
                        <h5 className="font-medium mb-2 ">{t('settings.api_access.docs.webhook_payload_format', 'Webhook Payload Format')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "event": "message.sent",
  "messageId": 123,
  "status": "sent",
  "timestamp": "2026-01-15T10:30:00Z",
  "endpoint": "/api/v1/messages/send",
  "error": null
}`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.signature_verification', 'Signature Verification')}</h5>
                        <p className="text-sm text-muted-foreground mb-2">
                          {t('settings.api_access.docs.signature_description_prefix', 'All webhook requests include an')} <code className="bg-background px-1 rounded">X-Webhook-Signature</code> {t('settings.api_access.docs.signature_description_suffix', 'header for verification.')}
                        </p>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`// Node.js example
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return hash === signature;
}`}
                        </pre>
                      </div>

                      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                        <h5 className="font-medium mb-2 text-green-900 dark:text-green-400">{t('settings.api_access.docs.event_types', 'Event Types')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">message.sent</code> - {t('settings.api_access.docs.event_sent', 'Message was successfully sent')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">message.delivered</code> - {t('settings.api_access.docs.event_delivered', 'Message was delivered to recipient')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">message.failed</code> - {t('settings.api_access.docs.event_failed', 'Message sending failed')}</div>
                        </div>
                      </div>

                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <h5 className="font-medium mb-2 text-yellow-900">{t('settings.api_access.docs.retry_behavior', 'Retry Behavior')}</h5>
                        <div className="text-sm text-yellow-800 space-y-1">
                          <p>{t('settings.api_access.docs.retry_auto', '• Automatic retry with exponential backoff (3 attempts)')}</p>
                          <p>{t('settings.api_access.docs.retry_delays', '• Retry delays: 1s, 2s, 4s')}</p>
                          <p>{t('settings.api_access.docs.retry_respond', '• Webhook must respond with 200 OK within 10 seconds')}</p>
                          <p>{t('settings.api_access.docs.retry_logged', '• Failed webhooks are logged for debugging')}</p>
                        </div>
                      </div>

                      <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-900">
                        <h5 className="font-medium mb-2 text-purple-900 dark:text-purple-400">{t('settings.api_access.docs.security_best_practices', 'Security Best Practices')}</h5>
                        <div className="text-sm text-purple-800 dark:text-purple-400 space-y-1">
                          <p>{t('settings.api_access.docs.security_verify_signatures', '• Always verify webhook signatures')}</p>
                          <p>{t('settings.api_access.docs.security_https', '• Use HTTPS endpoints (required in production)')}</p>
                          <p>{t('settings.api_access.docs.security_idempotency', '• Implement idempotency checks using message IDs')}</p>
                          <p>{t('settings.api_access.docs.security_rate_limit', '• Rate limit your webhook handler')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Media Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.media" value="media" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">POST /messages/send-media</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.media_description', 'Send media messages (images, documents, audio, video) through WhatsApp.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.request', 'Request')}</h5>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">POST</Badge>
                            <code className="text-sm">/api/v1/messages/send-media</code>
                          </div>
                          <div className="text-sm">
                            <strong>{t('settings.api_access.docs.headers', 'Headers:')}</strong>
                            <pre className="bg-background p-2 rounded border mt-1 text-xs overflow-x-auto">
{`Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}
                            </pre>
                          </div>
                          <div className="text-sm">
                            <strong>{t('settings.api_access.docs.body_url_method', 'Body (URL Method):')}</strong>
                            <pre className="bg-background p-2 rounded border mt-1 text-xs overflow-x-auto">
{`{
  "channelId": 1,
  "to": "1234567890",
  "mediaUrl": "https://example.com/image.jpg",
  "mediaType": "image",
  "caption": "Check out this image!"
}`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className=" dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                        <h5 className="font-medium mb-2  dark:text-blue-400">{t('settings.api_access.docs.request_parameters', 'Request Parameters')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">channelId</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_channel_id', 'Channel ID from /channels endpoint')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">to</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_to', 'Recipient phone number')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">mediaUrl</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_media_url', 'Public URL to media file')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">mediaType</code> <span className="text-red-500 dark:text-red-400">*</span> - {t('settings.api_access.docs.param_media_type', 'Media type: image, document, audio, video')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">caption</code> - {t('settings.api_access.docs.param_caption', 'Optional caption text')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">filename</code> - {t('settings.api_access.docs.param_filename', 'Optional filename for documents')}</div>
                        </div>
                      </div>

                      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                        <h5 className="font-medium mb-2 text-green-900 dark:text-green-400">{t('settings.api_access.docs.success_response_200', 'Success Response (200)')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "success": true,
  "data": {
    "messageId": "msg_media_1234567890",
    "status": "sent",
    "channelId": 1,
    "to": "1234567890",
    "mediaType": "image",
    "sentAt": "2026-01-15T10:30:00Z"
  }
}`}
                        </pre>
                      </div>

                      <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-900">
                        <h5 className="font-medium mb-2 text-purple-900 dark:text-purple-400">{t('settings.api_access.docs.supported_media_types', '📎 Supported Media Types')}</h5>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <strong>{t('settings.api_access.docs.media_images', 'Images:')}</strong>
                            <ul className="text-xs mt-1 space-y-1">
                              <li>{t('settings.api_access.docs.media_images_formats', '• JPEG, PNG, WebP')}</li>
                              <li>{t('settings.api_access.docs.media_images_size', '• Max 5MB')}</li>
                              <li>{t('settings.api_access.docs.media_images_dimensions', '• Max 4096x4096px')}</li>
                            </ul>
                          </div>
                          <div>
                            <strong>{t('settings.api_access.docs.media_documents', 'Documents:')}</strong>
                            <ul className="text-xs mt-1 space-y-1">
                              <li>{t('settings.api_access.docs.media_documents_formats', '• PDF, DOC, DOCX, XLS, etc.')}</li>
                              <li>{t('settings.api_access.docs.media_documents_size', '• Max 100MB')}</li>
                              <li>{t('settings.api_access.docs.media_documents_filename', '• Include filename parameter')}</li>
                            </ul>
                          </div>
                          <div>
                            <strong>{t('settings.api_access.docs.media_audio', 'Audio:')}</strong>
                            <ul className="text-xs mt-1 space-y-1">
                              <li>{t('settings.api_access.docs.media_audio_formats', '• MP3, AAC, OGG (Opus codec), M4A')}</li>
                              <li>{t('settings.api_access.docs.media_audio_size', '• Max 16MB')}</li>
                              <li>{t('settings.api_access.docs.media_audio_duration', '• Max 30 minutes')}</li>
                              <li>{t('settings.api_access.docs.media_audio_conversion', '• Auto-converted to OGG Opus for WhatsApp')}</li>
                              <li>{t('settings.api_access.docs.media_audio_specs', '• Specs: 48000 Hz, mono, 64k bitrate')}</li>
                              <li>{t('settings.api_access.docs.media_audio_ptt', '• PTT (push-to-talk) flag enabled for voice messages')}</li>
                            </ul>
                          </div>
                          <div>
                            <strong>{t('settings.api_access.docs.media_video', 'Video:')}</strong>
                            <ul className="text-xs mt-1 space-y-1">
                              <li>{t('settings.api_access.docs.media_video_formats', '• MP4, 3GPP')}</li>
                              <li>{t('settings.api_access.docs.media_video_size', '• Max 16MB')}</li>
                              <li>{t('settings.api_access.docs.media_video_duration', '• Max 30 seconds')}</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Errors Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.errors" value="errors" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">{t('settings.api_access.docs.error_handling', 'Error Handling')}</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.error_handling_description', 'Understanding API error responses and how to handle them in your application.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900">
                        <h5 className="font-medium mb-2 text-red-900 dark:text-red-400">{t('settings.api_access.docs.http_status_codes', 'HTTP Status Codes')}</h5>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">200</code> <span>{t('settings.api_access.docs.status_200', 'Success')}</span></div>
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">400</code> <span>{t('settings.api_access.docs.status_400', 'Bad Request - Invalid parameters')}</span></div>
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">401</code> <span>{t('settings.api_access.docs.status_401', 'Unauthorized - Invalid API key')}</span></div>
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">403</code> <span>{t('settings.api_access.docs.status_403', 'Forbidden - Insufficient permissions')}</span></div>
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">404</code> <span>{t('settings.api_access.docs.status_404', "Not Found - Resource doesn't exist")}</span></div>
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">429</code> <span>{t('settings.api_access.docs.status_429', 'Rate Limited - Too many requests')}</span></div>
                          <div className="flex justify-between"><code className="bg-background px-2 py-1 rounded">500</code> <span>{t('settings.api_access.docs.status_500', 'Server Error - Internal error')}</span></div>
                        </div>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.error_response_format', 'Error Response Format')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`{
  "success": false,
  "error": {
    "code": "INVALID_PHONE_NUMBER",
    "message": "The phone number format is invalid",
    "details": "Phone number must include country code"
  }
}`}
                        </pre>
                      </div>

                      <div className=" p-4 rounded-lg border ">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.common_error_codes', 'Common Error Codes')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">INVALID_API_KEY</code> - {t('settings.api_access.docs.error_invalid_api_key', 'API key is invalid or expired')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">INSUFFICIENT_PERMISSIONS</code> - {t('settings.api_access.docs.error_insufficient_permissions', 'API key lacks required permissions')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">CHANNEL_NOT_FOUND</code> - {t('settings.api_access.docs.error_channel_not_found', "Specified channel ID doesn't exist")}</div>
                          <div><code className="bg-background px-2 py-1 rounded">CHANNEL_INACTIVE</code> - {t('settings.api_access.docs.error_channel_inactive', 'Channel is not active')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">INVALID_PHONE_NUMBER</code> - {t('settings.api_access.docs.error_invalid_phone', 'Phone number format is incorrect')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">MESSAGE_TOO_LONG</code> - {t('settings.api_access.docs.error_message_too_long', 'Message exceeds character limit')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">MEDIA_TOO_LARGE</code> - {t('settings.api_access.docs.error_media_too_large', 'Media file exceeds size limit')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">UNSUPPORTED_MEDIA_TYPE</code> - {t('settings.api_access.docs.error_unsupported_media', 'Media type not supported')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">RATE_LIMIT_EXCEEDED</code> - {t('settings.api_access.docs.error_rate_limit', 'Too many requests')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">AUDIO_CONVERSION_FAILED</code> - {t('settings.api_access.docs.error_audio_conversion', 'Audio file conversion failed')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">BATCH_SIZE_EXCEEDED</code> - {t('settings.api_access.docs.error_batch_size', 'Batch size exceeds maximum (100 messages)')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">TEMPLATE_NOT_FOUND</code> - {t('settings.api_access.docs.error_template_not_found', 'Template message not found or not approved')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">INVALID_INTERACTIVE_MESSAGE</code> - {t('settings.api_access.docs.error_invalid_interactive', 'Interactive message structure is invalid')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">WEBHOOK_DELIVERY_FAILED</code> - {t('settings.api_access.docs.error_webhook_delivery', 'Webhook notification delivery failed (informational)')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">UNSUPPORTED_CHANNEL_FEATURE</code> - {t('settings.api_access.docs.error_unsupported_feature', 'Feature not supported by this channel type')}</div>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg border border-blue-200">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.rate_limit_headers', 'Rate Limit Headers')}</h5>
                        <div className="space-y-2 text-sm">
                          <div><code className="bg-background px-2 py-1 rounded">X-RateLimit-Limit</code> - {t('settings.api_access.docs.rate_header_limit', 'Maximum requests allowed in the current window')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">X-RateLimit-Remaining</code> - {t('settings.api_access.docs.rate_header_remaining', 'Number of requests remaining in the current window')}</div>
                          <div><code className="bg-background px-2 py-1 rounded">X-RateLimit-Reset</code> - {t('settings.api_access.docs.rate_header_reset', 'Unix timestamp when the rate limit window resets')}</div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {t('settings.api_access.docs.rate_headers_example', 'Example: Check these headers in your client code to implement proper backoff strategies.')}
                          </div>
                        </div>
                      </div>

                      <div className=" p-4 rounded-lg border border-blue-200">
                        <h5 className="font-medium mb-2 ">{t('settings.api_access.docs.rate_limit_response', 'Rate Limit Response')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 6000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1642248000
Retry-After: 60

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": "Try again in 60 seconds"
  }
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Examples Tab */}
                <TabsContent data-tour="components-settings-apiaccesstab.tabscontent.examples" value="examples" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-3">{t('settings.api_access.docs.curl_examples', 'cURL Examples')}</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('settings.api_access.docs.curl_examples_description', 'Universal cURL command examples that work across all platforms and programming languages.')}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_get_channels', 'Get Channels')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X GET "${window.location.origin}/api/v1/channels" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_send_text', 'Send Text Message')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/messages/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelId": 1,
    "to": "1234567890",
    "message": "Hello from cURL!"
  }'`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_send_media', 'Send Media Message')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/messages/send-media" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelId": 1,
    "to": "1234567890",
    "mediaUrl": "https://example.com/document.pdf",
    "mediaType": "document",
    "caption": "Here is the document you requested",
    "filename": "report.pdf"
  }'`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_send_batch', 'Send Batch Messages')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/messages/send-batch" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "channelId": 1, "to": "1234567890", "message": "Hello!" },
      { "channelId": 1, "to": "0987654321", "message": "Hi there!" }
    ]
  }'`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_send_template', 'Send Template Message')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/messages/send-template" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelId": 1,
    "to": "1234567890",
    "templateName": "welcome_message",
    "templateLanguage": "en",
    "components": [
      { "type": "body", "parameters": ["John"] }
    ]
  }'`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_send_interactive', 'Send Interactive Message')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/messages/send-interactive" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelId": 1,
    "to": "1234567890",
    "interactiveType": "button",
    "content": {
      "body": { "text": "Choose an option:" }
    },
    "options": {
      "type": "button",
      "buttons": [
        { "id": "yes", "title": "Yes" },
        { "id": "no", "title": "No" }
      ]
    }
  }'`}
                        </pre>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h5 className="font-medium mb-2">{t('settings.api_access.docs.example_webhook_handler', 'Webhook Handler Example')}</h5>
                        <pre className="bg-background p-3 rounded border text-xs overflow-x-auto">
{`// Express.js webhook handler
app.post('/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;
  
  // Verify signature
  const isValid = verifyWebhook(payload, signature, YOUR_SECRET);
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  res.status(200).send('OK');
});`}
                        </pre>
                      </div>

                      <div className=" dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                        <h5 className="font-medium mb-2  dark:text-blue-400">{t('settings.api_access.docs.pro_tips', '💡 Pro Tips')}</h5>
                        <div className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                          <p>{t('settings.api_access.docs.tip_replace_key', '• Replace YOUR_API_KEY with your actual API key')}</p>
                          <p>{t('settings.api_access.docs.tip_phone_format', '• Use proper phone number format with country code')}</p>
                          <p>{t('settings.api_access.docs.tip_status_codes', '• Check response status codes for error handling')}</p>
                          <p>{t('settings.api_access.docs.tip_retry_logic', '• Implement retry logic for rate-limited requests')}</p>
                          <p>{t('settings.api_access.docs.tip_store_keys', '• Store API keys securely, never in client-side code')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create API Key Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent data-tour="components-settings-apiaccesstab.dialogcontent.settings.api_access.dialog.create_title">
          <DialogHeader>
            <DialogTitle>{t('settings.api_access.dialog.create_title', 'Create New API Key')}</DialogTitle>
            <DialogDescription>
              {t('settings.api_access.dialog.create_description', 'Create a new API key to access the messaging API programmatically.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="keyName">{t('settings.api_access.dialog.key_name', 'API Key Name')}</Label>
              <Input data-tour="components-settings-apiaccesstab.input.settings.api_access.dialog.key_name_placeholder"
                id="keyName"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t('settings.api_access.dialog.key_name_placeholder', 'e.g., Production Bot, Marketing Automation')}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button data-tour="components-settings-apiaccesstab.button.common.cancel" variant="outline" onClick={() => setShowCreateModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-apiaccesstab.button.settings.api_access.dialog.creating" onClick={createApiKey} disabled={isCreating}>
              {isCreating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {t('settings.api_access.dialog.creating', 'Creating...')}
                </>
              ) : (
                t('settings.api_access.create_key', 'Create API Key')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show API Key Modal */}
      <Dialog open={showKeyModal} onOpenChange={setShowKeyModal}>
        <DialogContent data-tour="components-settings-apiaccesstab.dialogcontent.settings.api_access.dialog.created_title">
          <DialogHeader>
            <DialogTitle>{t('settings.api_access.dialog.created_title', 'API Key Created')}</DialogTitle>
            <DialogDescription>
              {t('settings.api_access.dialog.created_description', "Your API key has been created. Copy it now as it won't be shown again.")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono break-all">{newApiKey}</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(newApiKey)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 p-4 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                <strong>{t('settings.api_access.dialog.important', 'Important:')}</strong> {t('settings.api_access.dialog.store_key_securely', "Store this API key securely. You won't be able to see it again.")}
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button data-tour="components-settings-apiaccesstab.button.settings.api_access.dialog.saved_key" onClick={() => setShowKeyModal(false)}>
              {t('settings.api_access.dialog.saved_key', "I've Saved the Key")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
