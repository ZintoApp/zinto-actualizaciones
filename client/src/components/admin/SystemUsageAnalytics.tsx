import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useCurrency } from '@/contexts/currency-context';
import { OpenAIIcon } from "@/components/ui/openai-icon";
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
  Building,
  Users,
  RefreshCw,
  Globe,
  Shield
} from 'lucide-react';

interface SystemUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
  byCredentialType: Record<string, { requests: number; tokens: number; cost: number }>;
  byCompany: Record<string, { requests: number; tokens: number; cost: number }>;
  dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
}

const AI_PROVIDERS = [
  { id: 'openai', icon: <OpenAIIcon className="w-4 h-4" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { id: 'openrouter', icon: <OpenRouterIcon className="w-4 h-4" size={16} />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { id: 'azure', icon: <AzureIcon className="w-4 h-4" size={16} />, color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
] as const;

export default function SystemUsageAnalytics() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState('30d');


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
    queryKey: ['system-ai-usage-stats', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/ai-credentials/usage?startDate=${start.toISOString()}&endDate=${end.toISOString()}`);
      const result = await response.json();
      return result.data as SystemUsageStats;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });


  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getProviderInfo = (providerId: string) => {
    const found = AI_PROVIDERS.find((p) => p.id === providerId);
    const defaultNames: Record<string, string> = { openai: 'OpenAI', openrouter: 'OpenRouter', azure: 'Azure OpenAI' };
    if (found) {
      return {
        id: found.id,
        name: t(`admin.system_usage.provider.${providerId}`, defaultNames[providerId] ?? providerId),
        icon: found.icon,
        color: found.color,
      };
    }
    return {
      id: providerId,
      name: providerId,
      icon: '🔧',
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    };
  };

  const getCredentialTypeLabel = (type: string) => {
    if (type === 'company') {
      return t('admin.system_usage.company_credentials_label', 'Company Credentials');
    }
    if (type === 'system') {
      return t('admin.system_usage.system_credentials_label', 'System Credentials');
    }
    return `${type.charAt(0).toUpperCase() + type.slice(1)} ${t('admin.system_usage.credentials_word', 'Credentials')}`;
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
                <Globe className="w-5 h-5" />
                {t('admin.system_usage.title', 'System-Wide AI Usage Analytics')}
              </CardTitle>
              <CardDescription>
                {t('admin.system_usage.description', 'Monitor AI usage across all companies and credential sources')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">{t('admin.system_usage.range.7d', 'Last 7 days')}</SelectItem>
                  <SelectItem value="30d">{t('admin.system_usage.range.30d', 'Last 30 days')}</SelectItem>
                  <SelectItem value="90d">{t('admin.system_usage.range.90d', 'Last 90 days')}</SelectItem>
                  <SelectItem value="1y">{t('admin.system_usage.range.1y', 'Last year')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetchUsage()}>
                <RefreshCw className="w-4 h-4 mr-1" />
                {t('common.refresh', 'Refresh')}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('admin.system_usage.stat.total_requests', 'Total Requests')}
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">
                  {t('admin.system_usage.stat.total_tokens', 'Total Tokens')}
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">
                  {t('admin.system_usage.stat.total_cost', 'Total Cost')}
                </p>
                <p className="text-2xl font-bold">{formatCurrency(usageStats?.totalCost || 0)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-500 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('admin.system_usage.stat.active_companies', 'Active Companies')}
                </p>
                <p className="text-2xl font-bold">
                  {usageStats?.byCompany ? Object.keys(usageStats.byCompany).length : 0}
                </p>
              </div>
              <Building className="w-8 h-8 text-orange-500 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Provider */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.system_usage.by_provider', 'Usage by AI Provider')}</CardTitle>
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
                        <div className="text-sm font-medium">
                          {t('admin.system_usage.requests_count', '{{count}} requests', {
                            count: formatNumber(stats.requests),
                          })}
                        </div>
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
                      {t(
                        'admin.system_usage.provider_usage_detail',
                        '{{percent}}% of total usage • {{tokens}} tokens',
                        {
                          percent: percentage.toFixed(1),
                          tokens: formatNumber(stats.tokens),
                        }
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('admin.system_usage.no_usage', 'No usage data available for the selected period')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage by Credential Type */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.system_usage.by_credential_type', 'Usage by Credential Type')}</CardTitle>
        </CardHeader>
        <CardContent>
          {usageStats?.byCredentialType && Object.keys(usageStats.byCredentialType).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(usageStats.byCredentialType).map(([type, stats]) => (
                <div key={type} className="p-4 border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {type === 'company' ? (
                        <Building className="w-4 h-4 text-green-500 dark:text-green-400" />
                      ) : (
                        <Shield className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      )}
                      <span className="font-medium">{getCredentialTypeLabel(type)}</span>
                    </div>
                    <Badge variant="outline" className={type === 'company' ? 'bg-green-50 dark:bg-green-900/25' : 'bg-blue-50 dark:bg-blue-900/25'}>
                      {formatNumber(stats.requests)}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>
                      {t('admin.system_usage.metric_tokens', 'Tokens: {{value}}', {
                        value: formatNumber(stats.tokens),
                      })}
                    </div>
                    <div>
                      {t('admin.system_usage.metric_cost', 'Cost: {{value}}', {
                        value: formatCurrency(stats.cost),
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('admin.system_usage.no_credential_data', 'No credential usage data available')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Companies by Usage */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.system_usage.top_companies', 'Top Companies by Usage')}</CardTitle>
        </CardHeader>
        <CardContent>
          {usageStats?.byCompany && Object.keys(usageStats.byCompany).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(usageStats.byCompany)
                .sort(([,a], [,b]) => b.requests - a.requests)
                .slice(0, 10)
                .map(([companyKey, stats], index) => {
                  const companyId = companyKey.replace('company_', '');
                  const percentage = usageStats.totalRequests > 0 
                    ? (stats.requests / usageStats.totalRequests) * 100 
                    : 0;
                  
                  return (
                    <div key={companyKey} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-300">
                          #{index + 1}
                        </div>
                        <div>
                          <div className="font-medium">
                            {t('admin.system_usage.company_title', 'Company {{id}}', { id: companyId })}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {t(
                              'admin.system_usage.company_usage_line',
                              '{{requests}} requests • {{tokens}} tokens',
                              {
                                requests: formatNumber(stats.requests),
                                tokens: formatNumber(stats.tokens),
                              }
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatCurrency(stats.cost)}</div>
                        <div className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('admin.system_usage.no_company_data', 'No company usage data available')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
