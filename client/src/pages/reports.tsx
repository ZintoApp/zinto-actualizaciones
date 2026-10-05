import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useState, useMemo, useEffect, Fragment, type ReactNode } from 'react';
import {
  Loader2,
  Calendar as CalendarIcon,
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Grid3X3,
  Star,
  UserX,
  Users,
  type LucideIcon,
  Bot as TabIconBot,
  ChartNoAxesCombined as TabIconChartNoAxesCombined,
  CircleCheck as TabIconCircleCheck,
  Grid3X3 as TabIconGrid3X3,
  ShieldCheck as TabIconShieldCheck,
  Timer as TabIconTimer,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format, subDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isAfter, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';

const DATE_RANGE_PRESETS = {
  today: { label: 'Today', key: 'today' },
  yesterday: { label: 'Yesterday', key: 'yesterday' },
  thisWeek: { label: 'This Week', key: 'thisWeek' },
  lastWeek: { label: 'Last Week', key: 'lastWeek' },
  last7days: { label: 'Last 7 Days', key: 'last7days' },
  thisMonth: { label: 'This Month', key: 'thisMonth' },
  lastMonth: { label: 'Last Month', key: 'lastMonth' },
  last30days: { label: 'Last 30 Days', key: 'last30days' },
  thisQuarter: { label: 'This Quarter', key: 'thisQuarter' },
  lastQuarter: { label: 'Last Quarter', key: 'lastQuarter' },
  last90days: { label: 'Last 90 Days', key: 'last90days' },
  thisYear: { label: 'This Year', key: 'thisYear' },
  lastYear: { label: 'Last Year', key: 'lastYear' },
  custom: { label: 'Custom Range', key: 'custom' },
} as const;

type DateRangePreset = keyof typeof DATE_RANGE_PRESETS;

const MetricCardSkeleton = () => (
  <Card className="animate-pulse">
    <CardContent className="pt-6">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16 mb-3" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </CardContent>
  </Card>
);

const ChartCardSkeleton = ({ height = 300 }: { height?: number }) => (
  <Card className="animate-pulse">
    <CardHeader className="pb-3">
      <Skeleton className="h-6 w-48" />
    </CardHeader>
    <CardContent>
      <Skeleton style={{ width: '100%', height: height }} className="w-full" />
    </CardContent>
  </Card>
);

interface ReportMetricCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  accentClassName?: string;
}

const ReportMetricCard = ({
  title,
  value,
  description,
  icon: Icon,
  accentClassName = 'from-background via-background to-background',
}: ReportMetricCardProps) => (
  <Card className={cn('border-border/60 bg-gradient-to-br shadow-sm', accentClassName)}>
    <CardContent className="flex items-start justify-between gap-4 p-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 text-muted-foreground shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
    </CardContent>
  </Card>
);

const ReportSectionHeader = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
  </div>
);

const ReportStateCard = ({
  title,
  description,
  icon: Icon = AlertCircle,
  action,
  tone = 'default',
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  tone?: 'default' | 'destructive';
}) => (
  <Card className={cn('border-dashed shadow-sm', tone === 'destructive' && 'border-destructive/40')}>
    <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className={cn(
          'rounded-full border p-3',
          tone === 'destructive'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/40 text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </CardContent>
  </Card>
);

const calculateDateRange = (preset: DateRangePreset): { from: Date; to: Date } => {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: new Date() };
    case 'yesterday': {
      const yesterday = subDays(now, 1);
      return {
        from: startOfDay(yesterday),
        to: new Date(startOfDay(yesterday).getTime() + 24 * 60 * 60 * 1000 - 1),
      };
    }
    case 'thisWeek':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case 'lastWeek': {
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return { from: lastWeekStart, to: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
    }
    case 'last7days':
      return { from: subDays(now, 7), to: now };
    case 'thisMonth':
      return { from: startOfMonth(now), to: now };
    case 'lastMonth': {
      const lastMonth = subDays(startOfMonth(now), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case 'last30days':
      return { from: subDays(now, 30), to: now };
    case 'thisQuarter':
      return { from: startOfQuarter(now), to: now };
    case 'lastQuarter': {
      const lastQuarter = subDays(startOfQuarter(now), 1);
      return { from: startOfQuarter(lastQuarter), to: endOfQuarter(lastQuarter) };
    }
    case 'last90days':
      return { from: subDays(now, 90), to: now };
    case 'thisYear':
      return { from: startOfYear(now), to: now };
    case 'lastYear': {
      const lastYear = subDays(startOfYear(now), 1);
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
    }
    default:
      return { from: subDays(now, 7), to: now };
  }
};

const validateDateRange = (from: Date, to: Date): { isValid: boolean; error?: string } => {
  if (isAfter(from, to)) return { isValid: false, error: 'Start date must be before end date' };
  if (isAfter(from, new Date())) return { isValid: false, error: 'Start date cannot be in the future' };
  if (differenceInDays(to, from) > 365) return { isValid: false, error: 'Date range cannot exceed 365 days' };
  return { isValid: true };
};

const formatDateRangeDisplay = (from: Date, to: Date): string => {
  if (format(from, 'yyyy-MM-dd') === format(to, 'yyyy-MM-dd')) return format(from, 'LLL dd, y');
  if (format(from, 'yyyy-MM') === format(to, 'yyyy-MM')) return `${format(from, 'LLL dd')} - ${format(to, 'dd, y')}`;
  if (format(from, 'yyyy') === format(to, 'yyyy')) return `${format(from, 'LLL dd')} - ${format(to, 'LLL dd, y')}`;
  return `${format(from, 'LLL dd, y')} - ${format(to, 'LLL dd, y')}`;
};

function formatSeconds(sec: number): string {
  if (sec == null || isNaN(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface AgentPerformanceRow {
  agentId: number | null;
  agentName: string | null;
  agentEmail?: string | null;
  conversationsHandled: number;
  avgFirstResponseTimeSec: number | null;
  avgResolutionTimeSec: number | null;
  totalAgentMessages: number;
  resolutionRate: number;
}

interface ResponseTimeRow {
  day: string;
  channelType: string | null;
  avgSec: number | null;
  minSec: number | null;
  maxSec: number | null;
  p95Sec: number | null;
  sampleCount?: number;
}

interface ChannelSlaRow {
  channelType: string | null;
  total: number;
  withinSla: number;
  slaComplianceRate: number;
  avgFirstResponseTimeSec?: number | null;
}

interface VolumeHeatmapRow {
  dayOfWeek: number;
  hourOfDay: number;
  conversationCount: number;
}

interface ResolutionData {
  total: number;
  resolved: number;
  open: number;
  resolutionRate: number;
  avgResolutionTimeSec: number | null;
}

interface CsatData {
  avgScore: number | null;
  responseCount: number;
  distribution?: { score: number; count: number }[];
}

interface BotCoverageRow {
  conversationId: number;
  contactId: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  channelType: string;
  status: string | null;
  contactedAt: string | null;
  assignedAgentName: string | null;
  inboundMessages: number;
  botMessages: number;
  agentMessages: number;
  unassistedConversationCount: number;
}

interface BotCoverageData {
  summary: {
    totalConversations: number;
    botAssistedConversations: number;
    unassistedConversations: number;
    unassistedContacts: number;
  };
  rows: BotCoverageRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}

const SLA_THRESHOLD_OPTIONS = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
  { value: 900, label: '15 min' },
  { value: 1800, label: '30 min' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Reports() {
  const [timePeriod, setTimePeriod] = useState<DateRangePreset>('last7days');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => calculateDateRange('last7days'));
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('agent-performance');
  const [slaThresholdSec, setSlaThresholdSec] = useState(300);
  const [agentTablePage, setAgentTablePage] = useState(0);
  const [agentSortKey, setAgentSortKey] = useState<keyof AgentPerformanceRow | ''>('');
  const [agentSortDir, setAgentSortDir] = useState<'asc' | 'desc'>('asc');
  const [botCoveragePage, setBotCoveragePage] = useState(0);

  const { t } = useTranslation();
  const { toast } = useToast();
  const { canExportReports } = usePermissions();

  const getDateRangePresetLabel = (preset: DateRangePreset) =>
    t(`reports.dateRange.${preset}`, DATE_RANGE_PRESETS[preset].label);

  const getValidationErrorMessage = (error?: string) => {
    if (error === 'Start date must be before end date') {
      return t('reports.validation.startBeforeEnd', 'Start date must be before end date');
    }
    if (error === 'Start date cannot be in the future') {
      return t('reports.validation.startInFuture', 'Start date cannot be in the future');
    }
    if (error === 'Date range cannot exceed 365 days') {
      return t('reports.validation.maxRange', 'Date range cannot exceed 365 days');
    }
    return error ?? t('reports.validation.invalidRange', 'Invalid date range');
  };

  const getDayLabel = (dayIndex: number) => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    return t(`reports.days.${dayKeys[dayIndex]}`, DAY_LABELS[dayIndex]);
  };

  const handleTimePeriodChange = (period: string) => {
    const preset = period as DateRangePreset;
    setTimePeriod(preset);
    setDateRangeError(null);
    if (preset !== 'custom') {
      const newRange = calculateDateRange(preset);
      const validation = validateDateRange(newRange.from, newRange.to);
      if (!validation.isValid) {
        const errorMessage = getValidationErrorMessage(validation.error);
        setDateRangeError(errorMessage);
        toast({
          title: t('reports.validation.invalidRangeTitle', 'Invalid Date Range'),
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }
      setDateRange(newRange);
    }
  };

  const handleCustomDateRangeChange = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      const validation = validateDateRange(range.from, range.to);
      if (!validation.isValid) {
        const errorMessage = getValidationErrorMessage(validation.error);
        setDateRangeError(errorMessage);
        toast({
          title: t('reports.validation.invalidRangeTitle', 'Invalid Date Range'),
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }
      setDateRangeError(null);
      setDateRange({ from: range.from, to: range.to });
      setTimePeriod('custom');
    }
  };

  const fromToParams = useMemo(() => {
    return {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    };
  }, [dateRange]);

  const agentPerfQuery = useQuery({
    queryKey: ['/api/reports/agent-performance', fromToParams.from, fromToParams.to],
    queryFn: async () => {
      const url = `/api/reports/agent-performance?from=${encodeURIComponent(fromToParams.from)}&to=${encodeURIComponent(fromToParams.to)}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error(t('reports.errors.fetchAgentPerformance', 'Failed to fetch agent performance'));
      const json = await res.json();
      return (json.data ?? []) as AgentPerformanceRow[];
    },
    enabled: activeTab === 'agent-performance',
  });

  const responseTimeQuery = useQuery({
    queryKey: ['/api/reports/response-time', fromToParams.from, fromToParams.to],
    queryFn: async () => {
      const url = `/api/reports/response-time?from=${encodeURIComponent(fromToParams.from)}&to=${encodeURIComponent(fromToParams.to)}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error(t('reports.errors.fetchResponseTime', 'Failed to fetch response time'));
      const json = await res.json();
      return (json.data ?? []) as ResponseTimeRow[];
    },
    enabled: activeTab === 'response-time',
  });

  const channelSlaQuery = useQuery({
    queryKey: ['/api/reports/channel-sla', fromToParams.from, fromToParams.to, slaThresholdSec],
    queryFn: async () => {
      const url = `/api/reports/channel-sla?from=${encodeURIComponent(fromToParams.from)}&to=${encodeURIComponent(fromToParams.to)}&slaThresholdSec=${slaThresholdSec}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error(t('reports.errors.fetchChannelSla', 'Failed to fetch channel SLA'));
      const json = await res.json();
      return (json.data ?? []) as ChannelSlaRow[];
    },
    enabled: activeTab === 'channel-sla',
  });

  const volumeHeatmapQuery = useQuery({
    queryKey: ['/api/reports/volume-heatmap', fromToParams.from, fromToParams.to],
    queryFn: async () => {
      const url = `/api/reports/volume-heatmap?from=${encodeURIComponent(fromToParams.from)}&to=${encodeURIComponent(fromToParams.to)}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error(t('reports.errors.fetchVolumeHeatmap', 'Failed to fetch volume heatmap'));
      const json = await res.json();
      return (json.data ?? []) as VolumeHeatmapRow[];
    },
    enabled: activeTab === 'volume-heatmap',
  });

  const resolutionQuery = useQuery({
    queryKey: ['/api/reports/resolution', fromToParams.from, fromToParams.to],
    queryFn: async () => {
      const url = `/api/reports/resolution?from=${encodeURIComponent(fromToParams.from)}&to=${encodeURIComponent(fromToParams.to)}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error(t('reports.errors.fetchResolution', 'Failed to fetch resolution data'));
      const json = await res.json();
      return (json.data ?? { total: 0, resolved: 0, open: 0, resolutionRate: 0, avgResolutionTimeSec: null }) as ResolutionData;
    },
    enabled: activeTab === 'resolution',
  });

  const csatQuery = useQuery({
    queryKey: ['/api/reports/csat', fromToParams.from, fromToParams.to],
    queryFn: async () => {
      const url = `/api/reports/csat?from=${encodeURIComponent(fromToParams.from)}&to=${encodeURIComponent(fromToParams.to)}`;
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error(t('reports.errors.fetchCsat', 'Failed to fetch CSAT'));
      const json = await res.json();
      return (json.data ?? { avgScore: null, responseCount: 0, distribution: [] }) as CsatData;
    },
    enabled: activeTab === 'resolution',
  });

  const botCoverageQuery = useQuery({
    queryKey: ['/api/reports/bot-coverage', fromToParams.from, fromToParams.to, botCoveragePage],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: fromToParams.from,
        to: fromToParams.to,
        page: String(botCoveragePage),
        pageSize: '10',
      });
      const res = await apiRequest('GET', `/api/reports/bot-coverage?${params.toString()}`);
      if (!res.ok) throw new Error(t('reports.errors.fetchBotCoverage', 'Failed to fetch bot coverage'));
      const json = await res.json();
      return json.data as BotCoverageData;
    },
    enabled: activeTab === 'bot-coverage',
  });

  const handleExport = async (endpoint: string, format: DownloadExportFormat, extraParams?: Record<string, string>) => {
    const params = new URLSearchParams({ from: fromToParams.from, to: fromToParams.to });
    params.set('format', format);
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
    }
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`, { credentials: 'include' });
      await downloadExportResponse(response, 'report', format);
    } catch (error) {
      toast({
        title: t('reports.export.failed', 'Export failed'),
        description: error instanceof Error ? error.message : t('reports.errors.failedToLoad', 'Failed to export report.'),
        variant: 'destructive',
      });
    }
  };

  const agentData = agentPerfQuery.data ?? [];
  const sortedAgentData = useMemo(() => {
    if (!agentSortKey) return agentData;
    return [...agentData].sort((a, b) => {
      const aVal = a[agentSortKey as keyof AgentPerformanceRow];
      const bVal = b[agentSortKey as keyof AgentPerformanceRow];
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      const aStr = typeof aVal === 'string' || aVal == null ? String(aVal ?? '') : '';
      const bStr = typeof bVal === 'string' || bVal == null ? String(bVal ?? '') : '';
      if (agentSortKey === 'agentName' || agentSortKey === 'agentEmail') {
        const cmp = aStr.localeCompare(bStr);
        return agentSortDir === 'asc' ? cmp : -cmp;
      }
      const cmp = aNum - bNum;
      return agentSortDir === 'asc' ? cmp : -cmp;
    });
  }, [agentData, agentSortKey, agentSortDir]);
  const PAGE_SIZE = 10;
  const paginatedAgentData = sortedAgentData.slice(agentTablePage * PAGE_SIZE, (agentTablePage + 1) * PAGE_SIZE);
  const totalAgentPages = Math.max(1, Math.ceil(sortedAgentData.length / PAGE_SIZE));

  const toggleSort = (key: keyof AgentPerformanceRow) => {
    if (agentSortKey === key) {
      setAgentSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setAgentSortKey(key);
      setAgentSortDir('asc');
    }
  };

  const heatmapGrid = useMemo(() => {
    const rows: Record<string, Record<number, number>> = {};
    for (let d = 0; d <= 6; d++) {
      rows[d] = {};
      for (let h = 0; h < 24; h++) rows[d][h] = 0;
    }
    (volumeHeatmapQuery.data ?? []).forEach((r) => {
      const d = Number(r.dayOfWeek);
      const h = Number(r.hourOfDay);
      if (d >= 0 && d <= 6 && h >= 0 && h < 24) rows[d][h] = (rows[d][h] ?? 0) + Number(r.conversationCount);
    });
    const maxCount = Math.max(1, ...Object.values(rows).flatMap((o) => Object.values(o)));
    return { rows, maxCount };
  }, [volumeHeatmapQuery.data]);

  const selectedPresetLabel = getDateRangePresetLabel(timePeriod);
  const formattedDateRange = formatDateRangeDisplay(dateRange.from, dateRange.to);

  const agentSummary = useMemo(() => {
    const totalHandled = agentData.reduce((sum, row) => sum + row.conversationsHandled, 0);
    const avgFirstResponse = agentData.reduce((sum, row) => sum + (row.avgFirstResponseTimeSec ?? 0), 0) / (agentData.length || 1);
    const avgResolutionTime = agentData.reduce((sum, row) => sum + (row.avgResolutionTimeSec ?? 0), 0) / (agentData.length || 1);
    const avgResolutionRate = agentData.length
      ? agentData.reduce((sum, row) => sum + row.resolutionRate, 0) / agentData.length
      : 0;

    return {
      totalHandled,
      avgFirstResponse,
      avgResolutionTime,
      avgResolutionRate,
    };
  }, [agentData]);

  const responseTimeSummary = useMemo(() => {
    const responseRows = responseTimeQuery.data ?? [];
    const minValues = responseRows.map((row) => row.minSec ?? Infinity).filter((value) => value !== Infinity);

    return {
      avg: responseRows.reduce((sum, row) => sum + (row.avgSec ?? 0), 0) / (responseRows.length || 1),
      min: minValues.length ? Math.min(...minValues) : 0,
      max: responseRows.length ? Math.max(...responseRows.map((row) => row.maxSec ?? 0)) : 0,
      p95: responseRows.reduce((sum, row) => sum + (row.p95Sec ?? 0), 0) / (responseRows.length || 1),
    };
  }, [responseTimeQuery.data]);

  const responseTimeChartData = useMemo(() => {
    const byDay: Record<string, Record<string, number>> = {};

    (responseTimeQuery.data ?? []).forEach((row) => {
      const dateStr = row.day ? format(new Date(row.day), 'yyyy-MM-dd') : '';
      if (!dateStr) return;

      if (!byDay[dateStr]) byDay[dateStr] = {};
      const channel = row.channelType ?? t('reports.labels.other', 'Other');
      byDay[dateStr][channel] = row.avgSec ?? 0;
    });

    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date: format(new Date(date), 'MMM d'), ...values }));
  }, [responseTimeQuery.data, t]);

  const responseTimeChannels = useMemo(
    () => Array.from(new Set((responseTimeQuery.data ?? []).map((row) => row.channelType ?? t('reports.labels.other', 'Other')))),
    [responseTimeQuery.data, t],
  );

  const topCsatScore = useMemo(() => {
    const distribution = [...(csatQuery.data?.distribution ?? [])].sort((a, b) => b.count - a.count);
    return distribution[0] ?? null;
  }, [csatQuery.data]);

  useEffect(() => {
    setAgentTablePage(0);
    setBotCoveragePage(0);
  }, [fromToParams.from, fromToParams.to]);

  const getSortLabel = (key: keyof AgentPerformanceRow) => {
    if (key === 'agentName') return t('reports.table.agent', 'Agent');
    if (key === 'agentEmail') return t('reports.table.email', 'Email');
    if (key === 'avgFirstResponseTimeSec') return t('reports.table.avgFirstResponse', 'Avg first response');
    if (key === 'avgResolutionTimeSec') return t('reports.table.avgResolution', 'Avg resolution');
    if (key === 'resolutionRate') return t('reports.table.resolutionPercent', 'Resolution %');
    return key.replace(/([A-Z])/g, ' $1').trim();
  };

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="flex w-full flex-col gap-6">
            <div className="space-y-2">
              <h1 data-tour="pages-reports.h1.reports.title" className="text-2xl text-foreground">
                {t('reports.title', 'Reports')}
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                {t(
                  'reports.subtitle',
                  'Review conversation health, agent performance, response speed, and satisfaction trends in one place.',
                )}
              </p>
            </div>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{t('reports.filters.title', 'Report Filters')}</CardTitle>
                  <CardDescription>
                    {t(
                      'reports.filters.description',
                      'Choose a preset or custom range to refresh every report with the same timeframe.',
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{selectedPresetLabel}</Badge>
                  <Badge variant="outline">{formattedDateRange}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <Select value={timePeriod} onValueChange={handleTimePeriodChange}>
                    <SelectTrigger data-tour="pages-reports.selecttrigger.reports.filters.selectTimePeriod" className="h-10 w-full sm:w-[220px]">
                      <SelectValue placeholder={t('reports.filters.selectTimePeriod', 'Select time period')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {Object.entries(DATE_RANGE_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {getDateRangePresetLabel(key as DateRangePreset)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'h-10 w-full justify-start text-left font-normal sm:w-[280px] lg:w-[320px]',
                          dateRangeError && 'border-destructive text-destructive',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formattedDateRange}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto max-w-[95vw] p-0" align="start">
                      <div className="max-w-md border-b p-3">
                        <h4 className="mb-3 text-sm font-medium">{t('reports.filters.quickPresets', 'Quick Presets')}</h4>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {Object.entries(DATE_RANGE_PRESETS)
                            .slice(0, -1)
                            .map(([key, preset]) => (
                              <Button
                                key={key}
                                variant={timePeriod === key ? 'default' : 'ghost'}
                                size="sm"
                                className="h-8 w-full justify-start whitespace-nowrap text-xs"
                                onClick={() => handleTimePeriodChange(key)}
                              >
                                {getDateRangePresetLabel(key as DateRangePreset)}
                              </Button>
                            ))}
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="mb-2 text-sm font-medium">{t('reports.filters.customRange', 'Custom Range')}</h4>
                        <div className="overflow-x-auto">
                          <div className="hidden md:block">
                            <Calendar
                              initialFocus
                              mode="range"
                              defaultMonth={dateRange?.from}
                              selected={dateRange}
                              onSelect={handleCustomDateRangeChange}
                              numberOfMonths={2}
                              disabled={(date) => isAfter(date, new Date())}
                              className="min-w-fit"
                            />
                          </div>
                          <div className="block md:hidden">
                            <Calendar
                              initialFocus
                              mode="range"
                              defaultMonth={dateRange?.from}
                              selected={dateRange}
                              onSelect={handleCustomDateRangeChange}
                              numberOfMonths={1}
                              disabled={(date) => isAfter(date, new Date())}
                              className="min-w-fit"
                            />
                          </div>
                        </div>
                        {dateRangeError ? <p className="mt-2 text-sm text-destructive">{dateRangeError}</p> : null}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t('reports.filters.helper', 'All charts, tables, and exports use the selected range.')}
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-1">
                  <TabsTrigger icon={TabIconChartNoAxesCombined} data-tour="pages-reports.tabstrigger.agent-performance" value="agent-performance">
                    {t('reports.tabs.agentPerformance', 'Agent Performance')}
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconTimer} data-tour="pages-reports.tabstrigger.response-time" value="response-time">
                    {t('reports.tabs.responseTime', 'Response Time')}
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconShieldCheck} data-tour="pages-reports.tabstrigger.channel-sla" value="channel-sla">
                    {t('reports.tabs.channelSla', 'Channel SLA')}
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconGrid3X3} data-tour="pages-reports.tabstrigger.volume-heatmap" value="volume-heatmap">
                    {t('reports.tabs.volumeHeatmap', 'Volume Heatmap')}
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconBot} data-tour="pages-reports.tabstrigger.bot-coverage" value="bot-coverage">
                    {t('reports.tabs.botCoverage', 'Bot Coverage')}
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconCircleCheck} data-tour="pages-reports.tabstrigger.resolution" value="resolution">
                    {t('reports.tabs.resolutionCsat', 'Resolution & CSAT')}
                  </TabsTrigger>
                </TabsList>

              <TabsContent data-tour="pages-reports.tabscontent.agent-performance" value="agent-performance" className="space-y-6">
                <ReportSectionHeader
                  title={t('reports.agentPerformance.title', 'Agent Performance')}
                  description={t(
                    'reports.agentPerformance.description',
                    'Compare workload, responsiveness, and resolution quality across your team.',
                  )}
                  action={
                    canExportReports() ? (
                      <ExportFormatMenu onExport={(format) => handleExport('/api/reports/export/agent-performance', format)} />
                    ) : null
                  }
                />

                {agentPerfQuery.isLoading ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <MetricCardSkeleton key={index} />
                      ))}
                    </div>
                    <ChartCardSkeleton />
                    <ChartCardSkeleton height={360} />
                  </>
                ) : agentPerfQuery.error ? (
                  <ReportStateCard
                    title={t('reports.agentPerformance.errorTitle', 'Unable to load agent performance')}
                    description={
                      agentPerfQuery.error instanceof Error
                        ? agentPerfQuery.error.message
                        : t('reports.errors.failedToLoad', 'Failed to load report data.')
                    }
                    tone="destructive"
                    action={
                      <Button data-tour="pages-reports.button.reports.actions.retry" variant="outline" onClick={() => agentPerfQuery.refetch()}>
                        {t('reports.actions.retry', 'Retry')}
                      </Button>
                    }
                  />
                ) : agentData.length === 0 ? (
                  <ReportStateCard
                    title={t('reports.agentPerformance.emptyTitle', 'No agent activity found')}
                    description={t(
                      'reports.agentPerformance.emptyDescription',
                      'Try a wider date range to see agent conversations, reply times, and resolution metrics.',
                    )}
                    icon={Users}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <ReportMetricCard
                        title={t('reports.agentPerformance.metrics.totalHandled', 'Total handled')}
                        value={agentSummary.totalHandled.toLocaleString()}
                        description={t(
                          'reports.agentPerformance.metrics.totalHandledDescription',
                          'Conversations assigned to agents during this range.',
                        )}
                        icon={Users}
                        accentClassName="from-emerald-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.agentPerformance.metrics.avgFirstResponse', 'Avg first response')}
                        value={formatSeconds(agentSummary.avgFirstResponse)}
                        description={t(
                          'reports.agentPerformance.metrics.avgFirstResponseDescription',
                          'Average time until the first agent reply.',
                        )}
                        icon={Clock3}
                        accentClassName="from-sky-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.agentPerformance.metrics.avgResolutionTime', 'Avg resolution time')}
                        value={formatSeconds(agentSummary.avgResolutionTime)}
                        description={t(
                          'reports.agentPerformance.metrics.avgResolutionTimeDescription',
                          'Average time taken to fully resolve a conversation.',
                        )}
                        icon={BarChart3}
                        accentClassName="from-violet-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.agentPerformance.metrics.avgResolutionRate', 'Avg resolution rate')}
                        value={`${agentSummary.avgResolutionRate.toFixed(1)}%`}
                        description={t(
                          'reports.agentPerformance.metrics.avgResolutionRateDescription',
                          'Average share of conversations resolved by agents.',
                        )}
                        icon={CheckCircle2}
                        accentClassName="from-amber-500/10 via-background to-background"
                      />
                    </div>

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader>
                        <CardTitle>{t('reports.agentPerformance.chartTitle', 'Conversations by Agent')}</CardTitle>
                        <CardDescription>
                          {t('reports.agentPerformance.chartDescription', 'See how workload is distributed across the team.')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart
                            data={agentData.map((row) => ({
                              name:
                                row.agentName ??
                                t('reports.agentPerformance.agentFallback', 'Agent {{id}}', {
                                  id: row.agentId ?? '—',
                                }),
                              conversationsHandled: row.conversationsHandled,
                            }))}
                            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis />
                            <Tooltip />
                            <Bar
                              dataKey="conversationsHandled"
                              fill="hsl(var(--primary))"
                              name={t('reports.labels.conversations', 'Conversations')}
                              radius={[6, 6, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader>
                        <CardTitle>{t('reports.agentPerformance.tableTitle', 'Agent Performance Table')}</CardTitle>
                        <CardDescription>
                          {t(
                            'reports.agentPerformance.tableDescription',
                            'Sort by any column to compare activity and service quality.',
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border">
                          <Table data-tour="pages-reports.table.reports.table.sortAsc">
                            <TableHeader>
                              <TableRow>
                                {(
                                  [
                                    'agentName',
                                    'agentEmail',
                                    'conversationsHandled',
                                    'avgFirstResponseTimeSec',
                                    'avgResolutionTimeSec',
                                    'totalAgentMessages',
                                    'resolutionRate',
                                  ] as const
                                ).map((key) => (
                                  <TableHead key={key}>
                                    <Button data-tour="pages-reports.button.reports.table.sortAsc"
                                      variant="ghost"
                                      className="h-auto px-0 py-0 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground"
                                      onClick={() => toggleSort(key)}
                                    >
                                      {getSortLabel(key)}
                                      <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                                      {agentSortKey === key ? (
                                        <span className="ml-1 text-[10px]">
                                          {agentSortDir === 'asc'
                                            ? t('reports.table.sortAsc', 'ASC')
                                            : t('reports.table.sortDesc', 'DESC')}
                                        </span>
                                      ) : null}
                                    </Button>
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedAgentData.map((row, index) => (
                                <TableRow key={row.agentId ?? index}>
                                  <TableCell className="font-medium">{row.agentName ?? '—'}</TableCell>
                                  <TableCell>{row.agentEmail ?? '—'}</TableCell>
                                  <TableCell>{row.conversationsHandled}</TableCell>
                                  <TableCell>{formatSeconds(row.avgFirstResponseTimeSec ?? 0)}</TableCell>
                                  <TableCell>{formatSeconds(row.avgResolutionTimeSec ?? 0)}</TableCell>
                                  <TableCell>{row.totalAgentMessages}</TableCell>
                                  <TableCell>{row.resolutionRate.toFixed(1)}%</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {totalAgentPages > 1 ? (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                              {t('reports.table.pageOf', 'Page {{current}} of {{total}}', {
                                current: agentTablePage + 1,
                                total: totalAgentPages,
                              })}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button data-tour="pages-reports.button.reports.actions.previous"
                                variant="outline"
                                size="sm"
                                disabled={agentTablePage === 0}
                                onClick={() => setAgentTablePage((page) => page - 1)}
                              >
                                {t('reports.actions.previous', 'Previous')}
                              </Button>
                              <Button data-tour="pages-reports.button.reports.actions.next"
                                variant="outline"
                                size="sm"
                                disabled={agentTablePage >= totalAgentPages - 1}
                                onClick={() => setAgentTablePage((page) => page + 1)}
                              >
                                {t('reports.actions.next', 'Next')}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              <TabsContent data-tour="pages-reports.tabscontent.response-time" value="response-time" className="space-y-6">
                <ReportSectionHeader
                  title={t('reports.responseTime.title', 'Response Time')}
                  description={t(
                    'reports.responseTime.description',
                    'Monitor average, minimum, peak, and p95 response speed across channels.',
                  )}
                  action={
                    canExportReports() ? (
                      <ExportFormatMenu onExport={(format) => handleExport('/api/reports/export/response-time', format)} />
                    ) : null
                  }
                />

                {responseTimeQuery.isLoading ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <MetricCardSkeleton key={index} />
                      ))}
                    </div>
                    <ChartCardSkeleton />
                  </>
                ) : responseTimeQuery.error ? (
                  <ReportStateCard
                    title={t('reports.responseTime.errorTitle', 'Unable to load response time data')}
                    description={
                      responseTimeQuery.error instanceof Error
                        ? responseTimeQuery.error.message
                        : t('reports.errors.failedToLoad', 'Failed to load report data.')
                    }
                    tone="destructive"
                    action={
                      <Button data-tour="pages-reports.button.reports.actions.retry" variant="outline" onClick={() => responseTimeQuery.refetch()}>
                        {t('reports.actions.retry', 'Retry')}
                      </Button>
                    }
                  />
                ) : (responseTimeQuery.data ?? []).length === 0 ? (
                  <ReportStateCard
                    title={t('reports.responseTime.emptyTitle', 'No response time data')}
                    description={t(
                      'reports.responseTime.emptyDescription',
                      'No channel response activity was recorded for the selected range.',
                    )}
                    icon={Clock3}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <ReportMetricCard
                        title={t('reports.responseTime.metrics.average', 'Average')}
                        value={formatSeconds(responseTimeSummary.avg)}
                        description={t(
                          'reports.responseTime.metrics.averageDescription',
                          'Typical reply speed across all sampled responses.',
                        )}
                        icon={Clock3}
                        accentClassName="from-sky-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.responseTime.metrics.minimum', 'Minimum')}
                        value={formatSeconds(responseTimeSummary.min)}
                        description={t(
                          'reports.responseTime.metrics.minimumDescription',
                          'Fastest recorded first response in the selected range.',
                        )}
                        icon={CheckCircle2}
                        accentClassName="from-emerald-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.responseTime.metrics.maximum', 'Maximum')}
                        value={formatSeconds(responseTimeSummary.max)}
                        description={t(
                          'reports.responseTime.metrics.maximumDescription',
                          'Slowest recorded response so you can spot outliers.',
                        )}
                        icon={BarChart3}
                        accentClassName="from-rose-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.responseTime.metrics.p95', 'P95')}
                        value={formatSeconds(responseTimeSummary.p95)}
                        description={t(
                          'reports.responseTime.metrics.p95Description',
                          'The upper bound for most customer response experiences.',
                        )}
                        icon={Grid3X3}
                        accentClassName="from-amber-500/10 via-background to-background"
                      />
                    </div>

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader>
                        <CardTitle>{t('reports.responseTime.chartTitle', 'Response Time by Day and Channel')}</CardTitle>
                        <CardDescription>
                          {t('reports.responseTime.chartDescription', 'Track daily response trends for each connected channel.')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={320}>
                          <LineChart data={responseTimeChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis tickFormatter={(value) => formatSeconds(Number(value))} />
                            <Tooltip formatter={(value: number) => [formatSeconds(value), t('reports.labels.time', 'Time')]} />
                            <Legend />
                            {responseTimeChannels.map((channel, index) => (
                              <Line
                                key={channel}
                                type="monotone"
                                dataKey={channel}
                                name={channel}
                                stroke={['#25D366', '#1877F2', '#E4405F', '#F59E0B', '#8B5CF6'][index % 5]}
                                strokeWidth={2}
                                dot={false}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              <TabsContent data-tour="pages-reports.tabscontent.channel-sla" value="channel-sla" className="space-y-6">
                <ReportSectionHeader
                  title={t('reports.channelSla.title', 'Channel SLA')}
                  description={t(
                    'reports.channelSla.description',
                    'Measure first-response SLA compliance by channel and tune the threshold as needed.',
                  )}
                  action={
                    <>
                      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{t('reports.channelSla.threshold', 'SLA threshold')}</span>
                        <Select value={String(slaThresholdSec)} onValueChange={(value) => setSlaThresholdSec(Number(value))}>
                          <SelectTrigger className="h-8 w-[120px] border-0 px-2 shadow-none focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SLA_THRESHOLD_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {canExportReports() ? (
                      <ExportFormatMenu
                        onExport={(format) => handleExport('/api/reports/export/channel-sla', format, {
                          slaThresholdSec: String(slaThresholdSec),
                        })}
                      />
                      ) : null}
                    </>
                  }
                />

                {channelSlaQuery.isLoading ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <MetricCardSkeleton key={index} />
                      ))}
                    </div>
                    <ChartCardSkeleton />
                    <ChartCardSkeleton height={260} />
                  </>
                ) : channelSlaQuery.error ? (
                  <ReportStateCard
                    title={t('reports.channelSla.errorTitle', 'Unable to load SLA data')}
                    description={
                      channelSlaQuery.error instanceof Error
                        ? channelSlaQuery.error.message
                        : t('reports.channelSla.errorDescription', 'Failed to load SLA report data.')
                    }
                    tone="destructive"
                    action={
                      <Button data-tour="pages-reports.button.reports.actions.retry" variant="outline" onClick={() => channelSlaQuery.refetch()}>
                        {t('reports.actions.retry', 'Retry')}
                      </Button>
                    }
                  />
                ) : (channelSlaQuery.data ?? []).length === 0 ? (
                  <ReportStateCard
                    title={t('reports.channelSla.emptyTitle', 'No SLA records found')}
                    description={t(
                      'reports.channelSla.emptyDescription',
                      'No qualifying channel activity was found for this date range and threshold.',
                    )}
                    icon={CheckCircle2}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <ReportMetricCard
                        title={t('reports.channelSla.metrics.channelsMeasured', 'Channels measured')}
                        value={(channelSlaQuery.data ?? []).length.toString()}
                        description={t(
                          'reports.channelSla.metrics.channelsMeasuredDescription',
                          'Number of channels included in the current SLA report.',
                        )}
                        icon={Grid3X3}
                        accentClassName="from-violet-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.channelSla.metrics.avgCompliance', 'Avg SLA compliance')}
                        value={`${(
                          (channelSlaQuery.data ?? []).reduce((sum, row) => sum + row.slaComplianceRate, 0) /
                          ((channelSlaQuery.data ?? []).length || 1)
                        ).toFixed(1)}%`}
                        description={t(
                          'reports.channelSla.metrics.avgComplianceDescription',
                          'Average first-response compliance across all reported channels.',
                        )}
                        icon={CheckCircle2}
                        accentClassName="from-emerald-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.channelSla.metrics.totalWithinSla', 'Total within SLA')}
                        value={(channelSlaQuery.data ?? []).reduce((sum, row) => sum + row.withinSla, 0).toLocaleString()}
                        description={t(
                          'reports.channelSla.metrics.totalWithinSlaDescription',
                          'Conversations whose first response met the current threshold.',
                        )}
                        icon={Clock3}
                        accentClassName="from-sky-500/10 via-background to-background"
                      />
                    </div>

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader>
                        <CardTitle>{t('reports.channelSla.chartTitle', 'SLA Compliance by Channel')}</CardTitle>
                        <CardDescription>
                          {t(
                            'reports.channelSla.chartDescription',
                            'Identify which channels consistently meet your response commitment.',
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={channelSlaQuery.data ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="channelType" />
                            <YAxis unit="%" />
                            <Tooltip
                              formatter={(value: number) => [`${Number(value).toFixed(1)}%`, t('reports.channelSla.compliance', 'Compliance')]}
                            />
                            <Bar
                              dataKey="slaComplianceRate"
                              fill="hsl(var(--primary))"
                              name={t('reports.channelSla.slaPercent', 'SLA %')}
                              radius={[6, 6, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader>
                        <CardTitle>{t('reports.channelSla.tableTitle', 'Per-Channel Breakdown')}</CardTitle>
                        <CardDescription>
                          {t(
                            'reports.channelSla.tableDescription',
                            'Use the detailed table to compare volume, compliance, and average first response.',
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                          <Table data-tour="pages-reports.table.reports.channelSla.table.channel">
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('reports.channelSla.table.channel', 'Channel')}</TableHead>
                                <TableHead>{t('reports.channelSla.table.total', 'Total')}</TableHead>
                                <TableHead>{t('reports.channelSla.table.withinSla', 'Within SLA')}</TableHead>
                                <TableHead>{t('reports.channelSla.table.slaPercent', 'SLA %')}</TableHead>
                                <TableHead>{t('reports.channelSla.table.avgFirstResponse', 'Avg first response')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(channelSlaQuery.data ?? []).map((row, index) => (
                                <TableRow key={index}>
                                  <TableCell className="font-medium">{row.channelType ?? '—'}</TableCell>
                                  <TableCell>{row.total}</TableCell>
                                  <TableCell>{row.withinSla}</TableCell>
                                  <TableCell>{row.slaComplianceRate.toFixed(1)}%</TableCell>
                                  <TableCell>{formatSeconds(row.avgFirstResponseTimeSec ?? 0)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              <TabsContent data-tour="pages-reports.tabscontent.volume-heatmap" value="volume-heatmap" className="space-y-6">
                <ReportSectionHeader
                  title={t('reports.volumeHeatmap.title', 'Volume Heatmap')}
                  description={t(
                    'reports.volumeHeatmap.description',
                    'Spot the busiest days and hours so staffing and automation can match demand.',
                  )}
                  action={
                    canExportReports() ? (
                      <ExportFormatMenu onExport={(format) => handleExport('/api/reports/export/volume-heatmap', format)} />
                    ) : null
                  }
                />

                {volumeHeatmapQuery.isLoading ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <MetricCardSkeleton key={index} />
                      ))}
                    </div>
                    <ChartCardSkeleton height={360} />
                  </>
                ) : volumeHeatmapQuery.error ? (
                  <ReportStateCard
                    title={t('reports.volumeHeatmap.errorTitle', 'Unable to load volume heatmap')}
                    description={
                      volumeHeatmapQuery.error instanceof Error
                        ? volumeHeatmapQuery.error.message
                        : t('reports.volumeHeatmap.errorDescription', 'Failed to load heatmap data.')
                    }
                    tone="destructive"
                    action={
                      <Button data-tour="pages-reports.button.reports.actions.retry" variant="outline" onClick={() => volumeHeatmapQuery.refetch()}>
                        {t('reports.actions.retry', 'Retry')}
                      </Button>
                    }
                  />
                ) : (volumeHeatmapQuery.data ?? []).length === 0 ? (
                  <ReportStateCard
                    title={t('reports.volumeHeatmap.emptyTitle', 'No volume data found')}
                    description={t(
                      'reports.volumeHeatmap.emptyDescription',
                      'No conversation volume was recorded in the selected range.',
                    )}
                    icon={Grid3X3}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <ReportMetricCard
                        title={t('reports.volumeHeatmap.metrics.totalConversations', 'Total conversations')}
                        value={(volumeHeatmapQuery.data ?? []).reduce((sum, row) => sum + row.conversationCount, 0).toLocaleString()}
                        description={t(
                          'reports.volumeHeatmap.metrics.totalConversationsDescription',
                          'Total conversations included in the heatmap.',
                        )}
                        icon={BarChart3}
                        accentClassName="from-sky-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.volumeHeatmap.metrics.peakCellVolume', 'Peak cell volume')}
                        value={heatmapGrid.maxCount.toLocaleString()}
                        description={t(
                          'reports.volumeHeatmap.metrics.peakCellVolumeDescription',
                          'Highest conversation count recorded in a single day and hour slot.',
                        )}
                        icon={Users}
                        accentClassName="from-emerald-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.volumeHeatmap.metrics.timeSlotsTracked', 'Time slots tracked')}
                        value="168"
                        description={t(
                          'reports.volumeHeatmap.metrics.timeSlotsTrackedDescription',
                          'Seven days times twenty-four hours for full weekly coverage.',
                        )}
                        icon={Grid3X3}
                        accentClassName="from-violet-500/10 via-background to-background"
                      />
                    </div>

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <CardTitle>{t('reports.volumeHeatmap.chartTitle', 'Volume by Day of Week and Hour')}</CardTitle>
                          <CardDescription>
                            {t('reports.volumeHeatmap.chartDescription', 'Dark cells indicate heavier conversation volume.')}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t('reports.volumeHeatmap.lower', 'Lower')}</span>
                          <div className="h-2 w-20 rounded-full bg-gradient-to-r from-primary/20 to-primary" />
                          <span>{t('reports.volumeHeatmap.higher', 'Higher')}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <div className="min-w-[880px] rounded-lg border bg-border p-px">
                            <div className="grid gap-px" style={{ gridTemplateColumns: 'auto repeat(24, minmax(2rem, 1fr))' }}>
                              <div className="rounded-tl-md bg-muted/60 p-2 text-xs font-medium" />
                              {Array.from({ length: 24 }, (_, hour) => (
                                <div key={hour} className="bg-muted/60 p-2 text-center text-xs font-medium">
                                  {hour}
                                </div>
                              ))}
                              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                                <Fragment key={day}>
                                  <div className="bg-muted/60 p-2 text-xs font-medium">{getDayLabel(day)}</div>
                                  {Array.from({ length: 24 }, (_, hour) => {
                                    const count = heatmapGrid.rows[day]?.[hour] ?? 0;
                                    const opacity = heatmapGrid.maxCount > 0 ? count / heatmapGrid.maxCount : 0;
                                    return (
                                      <div
                                        key={hour}
                                        className="flex h-9 min-w-[2rem] items-center justify-center bg-background text-xs transition-colors hover:ring-1 hover:ring-primary/40"
                                        style={{ backgroundColor: `hsl(var(--primary) / ${0.08 + opacity * 0.82})` }}
                                        title={t('reports.volumeHeatmap.cellTitle', '{{day}} {{hour}}:00 - {{count}} conversations', {
                                          day: getDayLabel(day),
                                          hour,
                                          count,
                                        })}
                                      >
                                        {count > 0 ? count : ''}
                                      </div>
                                    );
                                  })}
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              <TabsContent data-tour="pages-reports.tabscontent.bot-coverage" value="bot-coverage" className="space-y-6">
                <ReportSectionHeader
                  title={t('reports.botCoverage.title', 'Bot Coverage')}
                  description={t(
                    'reports.botCoverage.description',
                    'Find customer conversations that received no outbound response from the bot.',
                  )}
                  action={
                    canExportReports() ? (
                      <ExportFormatMenu onExport={(format) => handleExport('/api/reports/export/bot-coverage', format)} />
                    ) : null
                  }
                />

                {botCoverageQuery.isLoading ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <MetricCardSkeleton key={index} />
                      ))}
                    </div>
                    <ChartCardSkeleton height={360} />
                  </>
                ) : botCoverageQuery.error ? (
                  <ReportStateCard
                    title={t('reports.botCoverage.errorTitle', 'Unable to load bot coverage')}
                    description={
                      botCoverageQuery.error instanceof Error
                        ? botCoverageQuery.error.message
                        : t('reports.errors.failedToLoad', 'Failed to load report data.')
                    }
                    tone="destructive"
                    action={
                      <Button data-tour="pages-reports.button.reports.actions.retry" variant="outline" onClick={() => botCoverageQuery.refetch()}>
                        {t('reports.actions.retry', 'Retry')}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <ReportMetricCard
                        title={t('reports.botCoverage.metrics.total', 'Customer conversations')}
                        value={(botCoverageQuery.data?.summary.totalConversations ?? 0).toLocaleString()}
                        description={t(
                          'reports.botCoverage.metrics.totalDescription',
                          'Conversations started in this range with at least one inbound message.',
                        )}
                        icon={InboxConversationIcon}
                        accentClassName="from-sky-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.botCoverage.metrics.assisted', 'Bot assisted')}
                        value={(botCoverageQuery.data?.summary.botAssistedConversations ?? 0).toLocaleString()}
                        description={t(
                          'reports.botCoverage.metrics.assistedDescription',
                          'Conversations with at least one outbound bot response.',
                        )}
                        icon={Bot}
                        accentClassName="from-emerald-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.botCoverage.metrics.unassistedContacts', 'People not assisted')}
                        value={(botCoverageQuery.data?.summary.unassistedContacts ?? 0).toLocaleString()}
                        description={t(
                          'reports.botCoverage.metrics.unassistedContactsDescription',
                          '{{count}} conversations received no bot response.',
                          { count: botCoverageQuery.data?.summary.unassistedConversations ?? 0 },
                        )}
                        icon={UserX}
                        accentClassName="from-amber-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.botCoverage.metrics.rate', 'Bot coverage rate')}
                        value={`${
                          botCoverageQuery.data?.summary.totalConversations
                            ? (
                                (botCoverageQuery.data.summary.botAssistedConversations /
                                  botCoverageQuery.data.summary.totalConversations) *
                                100
                              ).toFixed(1)
                            : '0.0'
                        }%`}
                        description={t(
                          'reports.botCoverage.metrics.rateDescription',
                          'Share of eligible conversations that received a bot response.',
                        )}
                        icon={CheckCircle2}
                        accentClassName="from-violet-500/10 via-background to-background"
                      />
                    </div>

                    {(botCoverageQuery.data?.summary.totalConversations ?? 0) === 0 ? (
                      <ReportStateCard
                        title={t('reports.botCoverage.emptyTitle', 'No customer conversations found')}
                        description={t(
                          'reports.botCoverage.emptyDescription',
                          'There were no conversations with inbound customer messages in this date range.',
                        )}
                        icon={InboxConversationIcon}
                      />
                    ) : (botCoverageQuery.data?.summary.unassistedConversations ?? 0) === 0 ? (
                      <ReportStateCard
                        title={t('reports.botCoverage.completeTitle', 'Every conversation received bot assistance')}
                        description={t(
                          'reports.botCoverage.completeDescription',
                          'All eligible conversations in this range contain at least one outbound bot response.',
                        )}
                        icon={Bot}
                      />
                    ) : (
                      <Card className="border-border/60 shadow-sm">
                        <CardHeader>
                          <CardTitle>{t('reports.botCoverage.tableTitle', 'People Not Assisted by the Bot')}</CardTitle>
                          <CardDescription>
                            {t(
                              'reports.botCoverage.tableDescription',
                              'Each person appears once, represented by their latest conversation with customer activity and no outbound bot response.',
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="overflow-x-auto rounded-lg border">
                            <Table data-tour="pages-reports.table.reports.botCoverage.table.contact">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t('reports.botCoverage.table.contact', 'Contact')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.details', 'Contact details')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.channel', 'Channel')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.started', 'Started')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.status', 'Status')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.agent', 'Assigned agent')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.conversations', 'Unassisted conversations')}</TableHead>
                                  <TableHead>{t('reports.botCoverage.table.messages', 'Messages')}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(botCoverageQuery.data?.rows ?? []).map((row) => (
                                  <TableRow key={row.conversationId}>
                                    <TableCell className="font-medium">
                                      {row.contactName ??
                                        t('reports.botCoverage.unknownContact', 'Contact #{{id}}', {
                                          id: row.contactId ?? row.conversationId,
                                        })}
                                    </TableCell>
                                    <TableCell>
                                      <div className="space-y-0.5 text-sm">
                                        {row.contactPhone ? <div>{row.contactPhone}</div> : null}
                                        {row.contactEmail ? <div className="text-muted-foreground">{row.contactEmail}</div> : null}
                                        {!row.contactPhone && !row.contactEmail ? '—' : null}
                                      </div>
                                    </TableCell>
                                    <TableCell className="capitalize">{row.channelType.replace(/_/g, ' ')}</TableCell>
                                    <TableCell>
                                      {row.contactedAt ? format(new Date(row.contactedAt), 'MMM d, y, h:mm a') : '—'}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="capitalize">
                                        {(row.status ?? 'open').replace(/_/g, ' ')}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{row.assignedAgentName ?? '—'}</TableCell>
                                    <TableCell>{row.unassistedConversationCount}</TableCell>
                                    <TableCell>
                                      <span title={t('reports.botCoverage.inboundMessages', 'Inbound messages')}>
                                        {row.inboundMessages} {t('reports.botCoverage.inboundShort', 'in')}
                                      </span>
                                      <span className="text-muted-foreground"> · </span>
                                      <span title={t('reports.botCoverage.agentMessages', 'Agent messages')}>
                                        {row.agentMessages} {t('reports.botCoverage.agentShort', 'agent')}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {(botCoverageQuery.data?.pagination.totalPages ?? 0) > 1 ? (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm text-muted-foreground">
                                {t('reports.table.pageOf', 'Page {{current}} of {{total}}', {
                                  current: botCoveragePage + 1,
                                  total: botCoverageQuery.data?.pagination.totalPages ?? 1,
                                })}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button data-tour="pages-reports.button.reports.actions.previous"
                                  variant="outline"
                                  size="sm"
                                  disabled={botCoveragePage === 0}
                                  onClick={() => setBotCoveragePage((page) => Math.max(0, page - 1))}
                                >
                                  {t('reports.actions.previous', 'Previous')}
                                </Button>
                                <Button data-tour="pages-reports.button.reports.actions.next"
                                  variant="outline"
                                  size="sm"
                                  disabled={botCoveragePage >= (botCoverageQuery.data?.pagination.totalPages ?? 1) - 1}
                                  onClick={() => setBotCoveragePage((page) => page + 1)}
                                >
                                  {t('reports.actions.next', 'Next')}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent data-tour="pages-reports.tabscontent.resolution" value="resolution" className="space-y-6">
                <ReportSectionHeader
                  title={t('reports.resolution.title', 'Resolution & CSAT')}
                  description={t(
                    'reports.resolution.description',
                    'Understand closure rates, backlog mix, and customer sentiment for the selected range.',
                  )}
                  action={
                    canExportReports() ? (
                      <ExportFormatMenu onExport={(format) => handleExport('/api/reports/export/resolution', format)} />
                    ) : null
                  }
                />

                {resolutionQuery.isLoading ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <MetricCardSkeleton key={index} />
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <ChartCardSkeleton height={260} />
                      <ChartCardSkeleton height={260} />
                    </div>
                  </>
                ) : resolutionQuery.error ? (
                  <ReportStateCard
                    title={t('reports.resolution.errorTitle', 'Unable to load resolution data')}
                    description={
                      resolutionQuery.error instanceof Error
                        ? resolutionQuery.error.message
                        : t('reports.resolution.errorDescription', 'Failed to load resolution report data.')
                    }
                    tone="destructive"
                    action={
                      <Button data-tour="pages-reports.button.reports.actions.retry" variant="outline" onClick={() => resolutionQuery.refetch()}>
                        {t('reports.actions.retry', 'Retry')}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <ReportMetricCard
                        title={t('reports.resolution.metrics.resolved', 'Resolved')}
                        value={`${resolutionQuery.data?.resolutionRate?.toFixed(1) ?? 0}%`}
                        description={t(
                          'reports.resolution.metrics.resolvedDescription',
                          'Share of conversations resolved during the selected range.',
                        )}
                        icon={CheckCircle2}
                        accentClassName="from-emerald-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.resolution.metrics.open', 'Open')}
                        value={`${
                          resolutionQuery.data?.total
                            ? (((resolutionQuery.data.open ?? 0) / resolutionQuery.data.total) * 100).toFixed(1)
                            : 0
                        }%`}
                        description={t(
                          'reports.resolution.metrics.openDescription',
                          'Remaining conversations that stayed unresolved.',
                        )}
                        icon={Grid3X3}
                        accentClassName="from-amber-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.resolution.metrics.avgResolutionTime', 'Avg resolution time')}
                        value={formatSeconds(resolutionQuery.data?.avgResolutionTimeSec ?? 0)}
                        description={t(
                          'reports.resolution.metrics.avgResolutionTimeDescription',
                          'Average time taken to fully close a conversation.',
                        )}
                        icon={Clock3}
                        accentClassName="from-sky-500/10 via-background to-background"
                      />
                      <ReportMetricCard
                        title={t('reports.resolution.metrics.totalConversations', 'Total conversations')}
                        value={(resolutionQuery.data?.total ?? 0).toLocaleString()}
                        description={t(
                          'reports.resolution.metrics.totalConversationsDescription',
                          'Total conversations included in the resolution report.',
                        )}
                        icon={Users}
                        accentClassName="from-violet-500/10 via-background to-background"
                      />
                    </div>

                    {(resolutionQuery.data?.total ?? 0) === 0 ? (
                      <ReportStateCard
                        title={t('reports.resolution.emptyTitle', 'No resolution activity found')}
                        description={t(
                          'reports.resolution.emptyDescription',
                          'There were no conversations to evaluate for resolution or CSAT in this date range.',
                        )}
                        icon={BarChart3}
                      />
                    ) : (
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <Card className="border-border/60 shadow-sm">
                          <CardHeader>
                            <CardTitle>{t('reports.resolution.resolvedVsOpenTitle', 'Resolved vs Open')}</CardTitle>
                            <CardDescription>
                              {t(
                                'reports.resolution.resolvedVsOpenDescription',
                                'Quick snapshot of resolved volume versus remaining backlog.',
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={260}>
                              <PieChart>
                                <Pie
                                  data={[
                                    {
                                      name: t('reports.resolution.labels.resolved', 'Resolved'),
                                      value: resolutionQuery.data?.resolved ?? 0,
                                    },
                                    {
                                      name: t('reports.resolution.labels.open', 'Open'),
                                      value: resolutionQuery.data?.open ?? 0,
                                    },
                                  ]}
                                  dataKey="value"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={84}
                                  labelLine={false}
                                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                  <Cell fill="#22c55e" />
                                  <Cell fill="#94a3b8" />
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        <Card className="border-border/60 shadow-sm">
                          <CardHeader>
                            <CardTitle>{t('reports.resolution.rateTitle', 'Resolution Rate')}</CardTitle>
                            <CardDescription>
                              {t(
                                'reports.resolution.rateDescription',
                                'Summary trend card for the currently selected date range.',
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={260}>
                              <LineChart
                                data={[{ date: formattedDateRange, rate: resolutionQuery.data?.resolutionRate ?? 0 }]}
                                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis unit="%" />
                                <Tooltip
                                  formatter={(value: number) => [
                                    `${Number(value).toFixed(1)}%`,
                                    t('reports.resolution.rateLabel', 'Resolution rate'),
                                  ]}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="rate"
                                  name={t('reports.resolution.rateLabel', 'Resolution rate')}
                                  stroke="hsl(var(--primary))"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    <Card className="border-border/60 shadow-sm">
                      <CardHeader>
                        <CardTitle>{t('reports.csat.title', 'Customer Satisfaction')}</CardTitle>
                        <CardDescription>
                          {t('reports.csat.description', 'Review average score, response volume, and rating distribution.')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {csatQuery.isLoading ? (
                          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('reports.csat.loading', 'Loading CSAT data...')}
                          </div>
                        ) : csatQuery.error ? (
                          <ReportStateCard
                            title={t('reports.csat.unavailableTitle', 'CSAT data unavailable')}
                            description={t(
                              'reports.csat.unavailableDescription',
                              'Customer satisfaction data could not be loaded for this range.',
                            )}
                            icon={Star}
                          />
                        ) : (csatQuery.data?.responseCount ?? 0) === 0 ? (
                          <ReportStateCard
                            title={t('reports.csat.emptyTitle', 'No CSAT responses yet')}
                            description={t(
                              'reports.csat.emptyDescription',
                              'Once customers submit ratings, their score distribution will appear here.',
                            )}
                            icon={Star}
                          />
                        ) : (
                          <>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <ReportMetricCard
                                title={t('reports.csat.metrics.avgScore', 'Avg CSAT score')}
                                value={csatQuery.data?.avgScore != null ? `${Number(csatQuery.data.avgScore).toFixed(1)} / 5` : '—'}
                                description={t(
                                  'reports.csat.metrics.avgScoreDescription',
                                  'Average customer satisfaction score across submitted ratings.',
                                )}
                                icon={Star}
                                accentClassName="from-amber-500/10 via-background to-background"
                              />
                              <ReportMetricCard
                                title={t('reports.csat.metrics.responses', 'CSAT responses')}
                                value={(csatQuery.data?.responseCount ?? 0).toLocaleString()}
                                description={t(
                                  'reports.csat.metrics.responsesDescription',
                                  'Total ratings collected in the selected date range.',
                                )}
                                icon={Users}
                                accentClassName="from-sky-500/10 via-background to-background"
                              />
                              <ReportMetricCard
                                title={t('reports.csat.metrics.topScoreBand', 'Top score band')}
                                value={topCsatScore ? `${topCsatScore.score}/5` : '—'}
                                description={t(
                                  'reports.csat.metrics.topScoreBandDescription',
                                  'Most common score customers selected.',
                                )}
                                icon={BarChart3}
                                accentClassName="from-emerald-500/10 via-background to-background"
                              />
                            </div>

                            {(csatQuery.data?.distribution?.length ?? 0) > 0 ? (
                              <div className="rounded-lg border p-4">
                                <ResponsiveContainer width="100%" height={180}>
                                  <BarChart data={csatQuery.data?.distribution ?? []} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="score" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar
                                      dataKey="count"
                                      fill="hsl(var(--primary))"
                                      name={t('reports.csat.responsesLabel', 'Responses')}
                                      radius={[6, 6, 0, 0]}
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            ) : null}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
