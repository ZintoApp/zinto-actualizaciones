import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/currency-context';
import { OpenAIIcon } from "@/components/ui/openai-icon";
import { AnthropicIcon } from "@/components/ui/anthropic-icon";
import { XAIIcon } from "@/components/ui/xai-icon";
import { AzureIcon } from "@/components/ui/azure-icon";
import { OpenRouterIcon } from "@/components/ui/openrouter-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Zap, 
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
  byCredentialType: Record<string, { requests: number; tokens: number; cost: number }>;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
  dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
}

interface UsageAlert {
  type: 'warning' | 'limit_exceeded';
  credentialId: number;
  credentialType: 'system' | 'company';
  provider: string;
  currentUsage: number;
  limit: number;
  percentage: number;
}

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: <OpenAIIcon className="w-4 h-4" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { id: 'openrouter', name: 'OpenRouter', icon: <OpenRouterIcon className="w-4 h-4" size={16} />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { id: 'azure', name: 'Azure OpenAI', icon: <AzureIcon className="w-4 h-4" size={16} />, color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  { id: 'anthropic', name: 'Anthropic', icon: <AnthropicIcon className="w-4 h-4" />, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  { id: 'xai', name: 'xAI (Grok)', icon: <XAIIcon className="w-4 h-4" />, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' }
];

export default function AiUsageAnalytics() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState('30d');
  const [isRefreshing, setIsRefreshing] = useState(false);


  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    
    switch (dateRange) {
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
      case '30d':
        start.setDate(end.getDate() - 30);
        break;
      case '90d':
        start.setDate(end.getDate() - 90);
        break;
      case '1y':
        start.setFullYear(end.getFullYear() - 1);
        break;
      default:
        start.setDate(end.getDate() - 30);
    }
    
    return { start, end };
  };

  const { start, end } = getDateRange();


  const { data: usageStats, isLoading: isLoadingUsage, refetch: refetchUsage } = useQuery({
    queryKey: ['ai-usage-stats', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/company/ai-credentials/usage?startDate=${start.toISOString()}&endDate=${end.toISOString()}`);
      const result = await response.json();
      return result.data as UsageStats;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });


  const { data: usageAlerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['ai-usage-alerts'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials/usage/alerts');
      const result = await response.json();
      return result.data.alerts as UsageAlert[];
    },
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
  });


  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {

      await Promise.all([
        refetchUsage(),
        refetchAlerts()
      ]);


      toast({
        title: t('ai_usage.refresh_success_title', 'Data Refreshed'),
        description: t('ai_usage.refresh_success_description', 'AI usage analytics have been updated successfully.'),
      });
    } catch (error) {
      console.error('Error refreshing data:', error);


      toast({
        title: t('ai_usage.refresh_error_title', 'Refresh Failed'),
        description: t('ai_usage.refresh_error_description', 'Failed to refresh AI usage data. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };


  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getProviderInfo = (providerId: string) => {
    return AI_PROVIDERS.find(p => p.id === providerId) || { 
      id: providerId, 
      name: providerId, 
      icon: '🔧', 
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' 
    };
  };

  const getAlertIcon = (alert: UsageAlert) => {
    return alert.type === 'limit_exceeded' ? (
      <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
    );
  };

  const getAlertBadgeColor = (alert: UsageAlert) => {
    return alert.type === 'limit_exceeded' ? 'destructive' : 'secondary';
  };

  if (isLoadingUsage) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                {t('settings.ai_usage.title', 'AI Usage Analytics')}
              </CardTitle>
              <CardDescription>
                {t('settings.ai_usage.description', 'Monitor your AI usage, costs, and performance')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger data-tour="ai-usage-period" aria-label={t("guided_tours.period","Reporting period")} className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                </SelectContent>
              </Select>
              <Button data-tour="components-settings-aiusageanalytics.button.common.refreshing"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? t('common.refreshing', 'Refreshing...') : t('common.refresh', 'Refresh')}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Usage Alerts */}
      {usageAlerts && usageAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
              {t('settings.ai_usage.alerts_title', 'Usage Alerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {usageAlerts.map((alert, index) => {
                const providerInfo = getProviderInfo(alert.provider);
                return (
                  <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      {getAlertIcon(alert)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{providerInfo.name}</span>
                          <Badge variant={getAlertBadgeColor(alert)}>
                            {alert.type === 'limit_exceeded' ? t('ai_usage.limit_exceeded', 'Limit Exceeded') : t('ai_usage.warning', 'Warning')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {alert.currentUsage.toLocaleString()} / {alert.limit.toLocaleString()} requests 
                          ({Math.round(alert.percentage)}%)
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={providerInfo.color}>
                      {alert.credentialType === 'company' ? t('ai_usage.company_credentials', 'Company') : t('ai_usage.system_credentials', 'System')}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('ai_usage.total_requests', 'Total Requests')}</p>
                <p className="text-2xl font-bold">{formatNumber(usageStats?.totalRequests || 0)}</p>
              </div>
              <Zap className="w-8 h-8 text-blue-500 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('ai_usage.total_tokens', 'Total Tokens')}</p>
                <p className="text-2xl font-bold">{formatNumber(usageStats?.totalTokens || 0)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('ai_usage.total_cost', 'Total Cost')}</p>
                <p className="text-2xl font-bold">{formatCurrency(usageStats?.totalCost || 0)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-500 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Provider */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.ai_usage.by_provider', 'Usage by Provider')}</CardTitle>
        </CardHeader>
        <CardContent>
          {usageStats?.byProvider && Object.keys(usageStats.byProvider).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(usageStats.byProvider).map(([provider, stats]) => {
                const providerInfo = getProviderInfo(provider);
                const percentage = usageStats.totalRequests > 0 
                  ? (stats.requests / usageStats.totalRequests) * 100 
                  : 0;
                
                return (
                  <div key={provider} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{providerInfo.icon}</span>
                        <span className="font-medium">{providerInfo.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatNumber(stats.requests)} {t('ai_usage.requests', 'requests')}</div>
                        <div className="text-xs text-muted-foreground">{formatCurrency(stats.cost)}</div>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-blue-500 dark:bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('ai_usage.usage_percentage', '{{percentage}}% of total usage', { percentage: percentage.toFixed(1) })} • {t('ai_usage.tokens_count', '{{count}} tokens', { count: formatNumber(stats.tokens) })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('settings.ai_usage.no_usage', 'No usage data available for the selected period')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage by Credential Type */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.ai_usage.by_credential_type', 'Usage by Credential Type')}</CardTitle>
        </CardHeader>
        <CardContent>
          {usageStats?.byCredentialType && Object.keys(usageStats.byCredentialType).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(usageStats.byCredentialType).map(([type, stats]) => (
                <div key={type} className="p-4 border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {type === 'company' ? (
                        <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      )}
                      <span className="font-medium">{type === 'company' ? t('ai_usage.company_credentials_label', 'Company Credentials') : t('ai_usage.system_credentials_label', 'System Credentials')}</span>
                    </div>
                    <Badge variant="outline" className={type === 'company' ? 'bg-green-50 dark:bg-green-900/25' : 'bg-blue-50 dark:bg-blue-900/25'}>
                      {formatNumber(stats.requests)}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>{t('ai_usage.tokens', 'Tokens')}: {formatNumber(stats.tokens)}</div>
                    <div>{t('ai_usage.cost', 'Cost')}: {formatCurrency(stats.cost)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('settings.ai_usage.no_credential_data', 'No credential usage data available')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
