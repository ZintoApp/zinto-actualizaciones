import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Zap, 
  Users, 
  Calendar,
  RefreshCw,
  Download
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/contexts/currency-context";
import { OpenAIIcon } from "@/components/ui/openai-icon";
import { AnthropicIcon } from "@/components/ui/anthropic-icon";
import { XAIIcon } from "@/components/ui/xai-icon";
import { AzureIcon } from "@/components/ui/azure-icon";
import { OpenRouterIcon } from "@/components/ui/openrouter-icon";
import { useTranslation } from "@/hooks/use-translation";

interface AiUsageStats {
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  totalCompanies?: number;
  totalPlans?: number;
  byProvider: Record<string, {
    tokens: number;
    cost: number;
    requests: number;
    companies?: number;
    plans?: number;
  }>;
  byPlan?: Record<string, {
    tokens: number;
    cost: number;
    requests: number;
    companies: number;
  }>;
}

interface AiUsageAnalyticsProps {
  planId?: number;
  companyId?: number;
  showSystemOverview?: boolean;
}

const AI_PROVIDER_COLORS: Record<string, string> = {
  'openai': 'bg-green-100 text-green-800 border-green-200',
  'anthropic': 'bg-orange-100 text-orange-800 border-orange-200',
  'gemini': 'bg-blue-100 text-blue-800 border-blue-200',
  'xai': 'bg-purple-100 text-purple-800 border-purple-200',
  'deepseek': 'bg-indigo-100 text-indigo-800 border-indigo-200'
};

export default function AiUsageAnalytics({ planId, companyId, showSystemOverview = false }: AiUsageAnalyticsProps) {
  const { formatCurrency } = useCurrency();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');


  const getDateRange = () => {
    const endDate = new Date();
    let startDate: Date | undefined;
    
    switch (dateRange) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
      default:
        startDate = undefined;
        break;
    }
    
    return { startDate, endDate };
  };


  const getApiEndpoint = () => {
    if (showSystemOverview) {
      return '/api/admin/ai-usage-overview';
    } else if (planId) {
      return `/api/admin/plans/${planId}/ai-usage-stats`;
    }
    return null;
  };


  const { data: usageStats, isLoading, refetch } = useQuery<AiUsageStats>({
    queryKey: [getApiEndpoint(), companyId, dateRange],
    queryFn: async () => {
      const endpoint = getApiEndpoint();
      if (!endpoint) throw new Error('No valid endpoint');
      
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams();
      
      if (companyId) params.append('companyId', companyId.toString());
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      
      const url = `${endpoint}${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await apiRequest("GET", url);
      
      if (!res.ok) throw new Error("Failed to fetch AI usage stats");
      return res.json();
    },
    enabled: !!getApiEndpoint()
  });

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };


  const getProviderDisplayName = (provider: string) => {
    const names: Record<string, string> = {
      'openai': 'OpenAI',
      'openrouter': 'OpenRouter',
      'azure': 'Azure OpenAI',
      'anthropic': 'Anthropic',
      'gemini': 'Google Gemini',
      'xai': 'xAI (Grok)',
      'deepseek': 'DeepSeek'
    };
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai':
        return <OpenAIIcon className="w-4 h-4" />;
      case 'openrouter':
        return <OpenRouterIcon className="w-4 h-4" size={16} />;
      case 'azure':
        return <AzureIcon className="w-4 h-4" size={16} />;
      case 'anthropic':
        return <AnthropicIcon className="w-4 h-4" />;
      case 'xai':
        return <XAIIcon className="w-4 h-4" />;
      default:
        return '🔧';
    }
  };

  if (!getApiEndpoint()) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            {t('admin.ai_usage.invalid_config')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('admin.ai_usage.title')}</h2>
          <p className="text-muted-foreground">
            {showSystemOverview 
              ? t('admin.ai_usage.system_overview')
              : `${t('admin.ai_usage.stats_label')} ${planId ? t('admin.ai_usage.for_plan') : ''} ${companyId ? t('admin.ai_usage.for_company') : ''}`
            }
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('common.refresh')}
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            {t('admin.ai_usage.export')}
          </Button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-2">
        {(['7d', '30d', '90d', 'all'] as const).map((range) => (
          <Button
            key={range}
            variant={dateRange === range ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange(range)}
          >
            {range === 'all' ? t('admin.ai_usage.range.all') : range.toUpperCase()}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : usageStats ? (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.ai_usage.stat.total_tokens')}</p>
                    <p className="text-2xl font-bold">{formatNumber(usageStats.totalTokens)}</p>
                  </div>
                  <Zap className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.ai_usage.stat.total_cost')}</p>
                    <p className="text-2xl font-bold">{formatCurrency(usageStats.totalCost)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.ai_usage.stat.total_requests')}</p>
                    <p className="text-2xl font-bold">{formatNumber(usageStats.totalRequests)}</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {showSystemOverview ? t('admin.ai_usage.stat.companies') : t('admin.ai_usage.stat.avg_cost_per_token')}
                    </p>
                    <p className="text-2xl font-bold">
                      {showSystemOverview 
                        ? formatNumber(usageStats.totalCompanies || 0)
                        : formatCurrency(usageStats.totalTokens > 0 ? usageStats.totalCost / usageStats.totalTokens : 0)
                      }
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Provider Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {t('admin.ai_usage.by_provider')}
              </CardTitle>
              <CardDescription>
                {t('admin.ai_usage.by_provider_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(usageStats.byProvider).map(([provider, stats]) => (
                  <div key={provider} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge className={AI_PROVIDER_COLORS[provider] || 'bg-gray-100 text-gray-800'}>
                        <div className="flex items-center gap-1">
                          {getProviderIcon(provider)}
                          <span>{getProviderDisplayName(provider)}</span>
                        </div>
                      </Badge>
                      {showSystemOverview && (
                        <div className="text-sm text-muted-foreground">
                          {stats.companies} {t('admin.ai_usage.companies_word')} • {stats.plans} {t('admin.ai_usage.plans_word')}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatNumber(stats.tokens)} {t('admin.ai_usage.tokens_word')}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(stats.cost)} • {formatNumber(stats.requests)} {t('admin.ai_usage.requests_word')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              {t('admin.system_usage.no_usage')}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
