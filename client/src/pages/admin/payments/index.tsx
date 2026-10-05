import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  DollarSign,
  TrendingUp,
  Users,
  AlertCircle,
  Download,
  Mail,
  CheckCircle,
  Eye,
  Calendar,
  CreditCard,
  Edit,
  Copy,
  Search,
  ArrowLeftRight as TabIconArrowLeftRight,
  Building2 as TabIconBuilding2,
  ChartNoAxesCombined as TabIconChartNoAxesCombined,
  Clock as TabIconClock,
  LayoutDashboard as TabIconLayoutDashboard,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, PieChart, Pie, Cell } from 'recharts';
import { useTheme } from "next-themes";
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';

interface PaymentMetrics {
  totalRevenue: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  monthlyGrowth: number;
  activeSubscriptions: number;
  pendingPayments: number;
  paymentSuccessRate: number;
}

interface PaymentTransaction {
  id: number;
  companyId: number;
  companyName: string;
  planId: number;
  planName: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  paymentMethod: string;
  notes?: string;
  externalTransactionId?: string;
  paymentIntentId?: string; // Stripe payment intent ID
  metadata?: any; // Contains additional payment-specific data
  createdAt: string;
  updatedAt: string;
}

interface PaginatedTransactions {
  data: PaymentTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PaymentTrend {
  period: string;
  revenue: number;
  transactions: number;
}

interface CompanyPaymentDetails {
  id: number;
  name: string;
  subscriptionStatus: string;
  planId: number;
  planName: string;
  subscriptionEndDate: string | null;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  lastPaymentMethod: string | null;
  totalPaid: number;
  createdAt: string;
}

interface PendingPayment extends PaymentTransaction {
  companyName: string;
  planName: string;
  daysOverdue: number;
}

interface PaymentMethodPerformance {
  paymentMethod: string;
  totalTransactions: number;
  successfulTransactions: number;
  totalRevenue: number;
  averageAmount: number;
  successRate: number;
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [trendsPeriod, setTrendsPeriod] = useState("12months");
  const [companiesSearchTerm, setCompaniesSearchTerm] = useState("");
  const [companiesPage, setCompaniesPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [reminderMessage, setReminderMessage] = useState("");


  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [companyViewDialogOpen, setCompanyViewDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<PaymentTransaction | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyPaymentDetails | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: DownloadExportFormat) => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (methodFilter !== 'all') params.set('paymentMethod', methodFilter);
      const response = await apiRequest('GET', `/api/admin/payments/export?${params.toString()}`);
      await downloadExportResponse(response, 'payments', format);
      toast({ title: t('admin.payments.export.success', 'Payment data exported') });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('admin.payments.export.error', 'Failed to export payment data'),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };


  const [editForm, setEditForm] = useState({
    status: "",
    paymentMethod: "",
    amount: "",
    notes: "",
    externalTransactionId: ""
  });


  const { data: metrics, isLoading: metricsLoading } = useQuery<PaymentMetrics>({
    queryKey: ['admin', 'payments', 'metrics'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/payments/metrics');
      if (!res.ok) throw new Error('Failed to fetch payment metrics');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin,
  });


  const { data: transactions, isLoading: transactionsLoading } = useQuery<PaginatedTransactions>({
    queryKey: ['admin', 'payments', 'transactions', currentPage, statusFilter, methodFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', '20');
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (methodFilter && methodFilter !== 'all') params.append('paymentMethod', methodFilter);

      const res = await apiRequest('GET', `/api/admin/payments/transactions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payment transactions');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'transactions',
  });


  const { data: trends, isLoading: trendsLoading } = useQuery<PaymentTrend[]>({
    queryKey: ['admin', 'payments', 'trends', trendsPeriod],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/admin/payments/trends?period=${trendsPeriod}`);
      if (!res.ok) throw new Error('Failed to fetch payment trends');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'dashboard',
  });


  const { data: pendingPayments, isLoading: pendingLoading } = useQuery<{ data: PendingPayment[], total: number, totalPages: number }>({
    queryKey: ['admin', 'payments', 'pending', pendingPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', pendingPage.toString());
      params.append('limit', '20');

      const res = await apiRequest('GET', `/api/admin/payments/pending?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch pending payments');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'pending',
  });


  const { data: companies, isLoading: companiesLoading } = useQuery<{ data: CompanyPaymentDetails[], total: number, totalPages: number }>({
    queryKey: ['admin', 'payments', 'companies', companiesPage, companiesSearchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', companiesPage.toString());
      params.append('limit', '20');
      if (companiesSearchTerm) params.append('search', companiesSearchTerm);

      const res = await apiRequest('GET', `/api/admin/payments/companies?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch companies payment details');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'companies',
  });


  const { data: performance, isLoading: performanceLoading } = useQuery<PaymentMethodPerformance[]>({
    queryKey: ['admin', 'payments', 'method-performance'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/payments/method-performance');
      if (!res.ok) throw new Error('Failed to fetch payment method performance');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'performance',
  });


  const { data: companyTransactions, isLoading: companyTransactionsLoading } = useQuery<PaymentTransaction[]>({
    queryKey: ['admin', 'companies', selectedCompany?.id, 'transactions'],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const res = await apiRequest('GET', `/api/admin/companies/${selectedCompany.id}/payment-transactions`);
      if (!res.ok) throw new Error('Failed to fetch company transactions');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && !!selectedCompany?.id && companyViewDialogOpen,
  });


  const markAsReceivedMutation = useMutation({
    mutationFn: async ({ transactionId, notes }: { transactionId: number; notes?: string }) => {
      const res = await apiRequest('PATCH', `/api/admin/payments/transactions/${transactionId}/status`, {
        status: 'completed',
        notes
      });
      if (!res.ok) throw new Error('Failed to mark payment as received');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
      toast({
        title: t('admin.payments.status_update.success', 'Payment status updated successfully'),
        description: 'The payment has been marked as received.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: async ({ companyId, message }: { companyId: number; message: string }) => {
      const res = await apiRequest('POST', `/api/admin/payments/reminders/${companyId}`, {
        message,
        type: 'email'
      });
      if (!res.ok) throw new Error('Failed to send reminder');
      return res.json();
    },
    onSuccess: () => {
      setReminderDialogOpen(false);
      setReminderMessage('');
      setSelectedCompanyId(null);
      toast({
        title: t('admin.payments.reminders.success', 'Reminder sent successfully'),
        description: 'Payment reminder has been sent to the company.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const editTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, updates }: { transactionId: number; updates: any }) => {
      const res = await apiRequest('PATCH', `/api/admin/payments/transactions/${transactionId}`, updates);
      if (!res.ok) throw new Error('Failed to update transaction');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
      setEditDialogOpen(false);
      setSelectedTransaction(null);
      toast({
        title: t('admin.payments.edit.success', 'Transaction updated successfully'),
        description: 'The payment transaction has been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const openEditDialog = (transaction: PaymentTransaction) => {
    setSelectedTransaction(transaction);
    setEditForm({
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      amount: transaction.amount.toString(),
      notes: transaction.notes || transaction.metadata?.notes || "",
      externalTransactionId: transaction.externalTransactionId || ""
    });
    setEditDialogOpen(true);
  };

  const openViewDialog = (transaction: PaymentTransaction) => {
    setSelectedTransaction(transaction);
    setViewDialogOpen(true);
  };

  const openCompanyViewDialog = (company: CompanyPaymentDetails) => {
    setSelectedCompany(company);
    setCompanyViewDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!selectedTransaction) return;

    const updates = {
      status: editForm.status,
      paymentMethod: editForm.paymentMethod,
      amount: parseFloat(editForm.amount),
      notes: editForm.notes,
      externalTransactionId: editForm.externalTransactionId
    };


    const isStatusDowngrade = (selectedTransaction.status === 'completed' &&
      ['pending', 'failed', 'cancelled'].includes(editForm.status));

    if (isStatusDowngrade) {
      setConfirmMessage(
        t('admin.payments.edit.confirm_status_change',
          'Are you sure you want to change this completed payment back to {{status}}? This action may affect billing and should only be done to correct errors.',
          { status: editForm.status }
        )
      );
      setConfirmAction(() => () => {
        editTransactionMutation.mutate({
          transactionId: selectedTransaction.id,
          updates
        });
        setConfirmDialogOpen(false);
      });
      setConfirmDialogOpen(true);
    } else {
      editTransactionMutation.mutate({
        transactionId: selectedTransaction.id,
        updates
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('admin.payments.copied', 'Copied to clipboard'),
        description: 'The text has been copied to your clipboard.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const getCssVariable = (variableName: string): string => {
    if (typeof window === 'undefined') return '';

    try {
      const root = document.documentElement;
      const value = getComputedStyle(root).getPropertyValue(variableName).trim();
      return value ? `hsl(${value})` : '';
    } catch {
      return '';
    }
  };

  const chartColors = {
    foreground: getCssVariable('--foreground') || (theme === 'dark' ? 'hsl(200 10% 91%)' : 'hsl(222.2 84% 4.9%)'),
    mutedForeground: getCssVariable('--muted-foreground') || (theme === 'dark' ? 'hsl(200 6% 70%)' : 'hsl(215.4 16.3% 46.9%)'),
    border: getCssVariable('--border') || (theme === 'dark' ? 'hsl(180 5% 26%)' : 'hsl(214.3 31.8% 91.4%)'),
    popover: getCssVariable('--popover') || (theme === 'dark' ? 'hsl(180 6% 15%)' : 'hsl(0 0% 100%)'),
    popoverForeground: getCssVariable('--popover-foreground') || (theme === 'dark' ? 'hsl(200 10% 91%)' : 'hsl(222.2 84% 4.9%)'),
  };

  const chartTooltipStyles = {
    contentStyle: {
      backgroundColor: theme === 'dark' ? 'rgba(23, 23, 23, 0.96)' : chartColors.popover,
      border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.06)' : `1px solid ${chartColors.border}`,
      borderRadius: '12px',
      color: chartColors.popoverForeground,
      boxShadow: theme === 'dark' ? '0 12px 30px rgba(0, 0, 0, 0.35)' : '0 10px 30px rgba(0, 0, 0, 0.12)',
      padding: '10px 12px',
    },
    labelStyle: {
      color: theme === 'dark' ? 'rgba(255, 255, 255, 0.98)' : chartColors.popoverForeground,
      fontWeight: 700,
      marginBottom: '4px',
    },
    itemStyle: {
      color: theme === 'dark' ? 'rgba(226, 232, 240, 0.92)' : chartColors.popoverForeground,
    },
  };

  const filteredTransactions = transactions?.data.filter((transaction) => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return true;

    return (
      transaction.id.toString().includes(query) ||
      transaction.companyName.toLowerCase().includes(query) ||
      transaction.planName.toLowerCase().includes(query) ||
      transaction.paymentMethod.toLowerCase().includes(query) ||
      transaction.status.toLowerCase().includes(query) ||
      transaction.externalTransactionId?.toLowerCase().includes(query)
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, methodFilter]);

  useEffect(() => {
    setCompaniesPage(1);
  }, [companiesSearchTerm]);

  if (!user?.isSuperAdmin) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: "default",
      pending: "secondary",
      failed: "destructive",
      cancelled: "outline"
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "outline"}>
        {t(`admin.payments.transactions.status.${status}`, status)}
      </Badge>
    );
  };

  const MetricsCards = () => {
    if (metricsLoading) {
      return (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </CardTitle>
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (!metrics) return null;

    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.payments.metrics.total_revenue', 'Total Revenue')}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {t('admin.payments.metrics.yearly_revenue', 'Yearly')}: {formatCurrency(metrics.yearlyRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.payments.metrics.monthly_revenue', 'Monthly Revenue')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.monthlyGrowth >= 0 ? '+' : ''}{metrics.monthlyGrowth.toFixed(1)}% {t('admin.payments.metrics.monthly_growth', 'from last month')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.payments.metrics.active_subscriptions', 'Active Subscriptions')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground">
              {t('admin.payments.metrics.payment_success_rate', 'Success Rate')}: {metrics.paymentSuccessRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.payments.metrics.pending_payments', 'Pending Payments')}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pendingPayments}</div>
            <p className="text-xs text-muted-foreground">
              {t('admin.payments.pending.description', 'Require attention')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <div>
            <h1 className="sm:text-2xl">{t('admin.payments.title', 'Payment Management')}</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              {t('admin.payments.description', 'Comprehensive payment tracking and management dashboard')}
            </p>
          </div>
          <ExportFormatMenu
            onExport={handleExport}
            loading={isExporting}
            className="w-full sm:w-auto"
            label={t('admin.payments.export.button', 'Export Data')}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="min-w-0">
            <TabsList>
              <TabsTrigger icon={TabIconLayoutDashboard} value="dashboard">
                <span className="hidden sm:inline">{t('admin.payments.dashboard.title', 'Dashboard')}</span>
                <span className="sm:hidden">{t('admin.payments.dashboard.short', 'Dashboard')}</span>
              </TabsTrigger>
              <TabsTrigger icon={TabIconArrowLeftRight} value="transactions">
                <span className="hidden sm:inline">{t('admin.payments.transactions.title', 'Transactions')}</span>
                <span className="sm:hidden">{t('admin.payments.transactions.short', 'Transactions')}</span>
              </TabsTrigger>
              <TabsTrigger icon={TabIconClock} value="pending">
                <span className="hidden sm:inline">{t('admin.payments.pending.title', 'Pending')}</span>
                <span className="sm:hidden">{t('admin.payments.pending.short', 'Pending')}</span>
              </TabsTrigger>
              <TabsTrigger icon={TabIconBuilding2} value="companies">
                <span className="hidden sm:inline">{t('admin.payments.companies.title', 'Companies')}</span>
                <span className="sm:hidden">{t('admin.payments.companies.short', 'Companies')}</span>
              </TabsTrigger>
              <TabsTrigger icon={TabIconChartNoAxesCombined} value="performance">
                <span className="hidden sm:inline">{t('admin.payments.performance.title', 'Performance')}</span>
                <span className="sm:hidden">{t('admin.payments.performance.short', 'Performance')}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-4">
            <MetricsCards />

            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg sm:text-xl">{t('admin.payments.trends.title', 'Payment Trends')}</CardTitle>
                  <CardDescription className="text-sm">
                    Revenue and transaction trends over time
                  </CardDescription>
                </div>
                <Select value={trendsPeriod} onValueChange={setTrendsPeriod}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">{t('admin.payments.trends.period.7days', 'Last 7 Days')}</SelectItem>
                    <SelectItem value="30days">{t('admin.payments.trends.period.30days', 'Last 30 Days')}</SelectItem>
                    <SelectItem value="12months">{t('admin.payments.trends.period.12months', 'Last 12 Months')}</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <div className="h-[300px] sm:h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : trends && trends.length > 0 ? (
                  <div className="h-[300px] sm:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="period"
                          fontSize={12}
                          tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                          tickLine={{ stroke: chartColors.border }}
                          axisLine={{ stroke: chartColors.border }}
                          tickFormatter={(value) => value}
                          stroke={chartColors.mutedForeground}
                        />
                        <YAxis
                          yAxisId="left"
                          fontSize={12}
                          tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                          tickLine={{ stroke: chartColors.border }}
                          axisLine={{ stroke: chartColors.border }}
                          stroke={chartColors.mutedForeground}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          fontSize={12}
                          tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                          tickLine={{ stroke: chartColors.border }}
                          axisLine={{ stroke: chartColors.border }}
                          stroke={chartColors.mutedForeground}
                        />
                        <Tooltip
                          formatter={(value, name) => [
                            name === 'revenue' ? formatCurrency(Number(value)) : value,
                            name === 'revenue' ? t('admin.payments.trends.revenue', 'Revenue') : t('admin.payments.trends.transactions', 'Transactions')
                          ]}
                          contentStyle={{
                            ...chartTooltipStyles.contentStyle,
                            fontSize: '14px',
                          }}
                          labelStyle={chartTooltipStyles.labelStyle}
                          itemStyle={chartTooltipStyles.itemStyle}
                        />
                        <Legend wrapperStyle={{ fontSize: '14px', color: chartColors.foreground }} />
                        <Bar yAxisId="left" dataKey="revenue" fill="#8884d8" name={t('admin.payments.trends.revenue', 'Revenue')} />
                        <Line yAxisId="right" type="monotone" dataKey="transactions" stroke="#82ca9d" strokeWidth={2} name={t('admin.payments.trends.transactions', 'Transactions')} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] sm:h-[400px] flex items-center justify-center text-muted-foreground">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{t('admin.payments.transactions.title', 'Payment Transactions')}</CardTitle>
                  <CardDescription>
                    {t('admin.payments.transactions.description', 'View and manage all payment transactions')}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {transactions?.total ?? 0} {t('admin.payments.transactions.records', 'records')}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="mb-4 rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('admin.payments.transactions.search_placeholder', 'Search transactions, companies, plans, or IDs...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8"
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                          <SelectValue placeholder={t('admin.payments.transactions.filter.all_statuses', 'All Statuses')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('admin.payments.transactions.filter.all_statuses', 'All Statuses')}</SelectItem>
                          <SelectItem value="completed">{t('admin.payments.transactions.status.completed', 'Completed')}</SelectItem>
                          <SelectItem value="pending">{t('admin.payments.transactions.status.pending', 'Pending')}</SelectItem>
                          <SelectItem value="failed">{t('admin.payments.transactions.status.failed', 'Failed')}</SelectItem>
                          <SelectItem value="cancelled">{t('admin.payments.transactions.status.cancelled', 'Cancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={methodFilter} onValueChange={setMethodFilter}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                          <SelectValue placeholder={t('admin.payments.transactions.filter.all_methods', 'All Methods')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('admin.payments.transactions.filter.all_methods', 'All Methods')}</SelectItem>
                          <SelectItem value="stripe">Stripe</SelectItem>
                          <SelectItem value="paypal">PayPal</SelectItem>
                          <SelectItem value="paystack">Paystack</SelectItem>
                          <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                          <SelectItem value="moyasar">Moyasar</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {transactionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : !filteredTransactions?.length ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                    <CreditCard className="mb-4 h-10 w-10 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">
                      {searchTerm || statusFilter !== 'all' || methodFilter !== 'all'
                        ? t('admin.payments.transactions.empty_filtered', 'No transactions match the current filters.')
                        : t('admin.payments.transactions.empty', 'No payment transactions found yet.')}
                    </p>
                    <p className="mt-1 text-sm">
                      {t('admin.payments.transactions.empty_hint', 'Try changing the filters or check back after new payments are recorded.')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[80px]">{t('admin.payments.transactions.table.id', 'ID')}</TableHead>
                          <TableHead className="min-w-[150px]">{t('admin.payments.transactions.table.company', 'Company')}</TableHead>
                          <TableHead className="min-w-[120px]">{t('admin.payments.transactions.table.plan', 'Plan')}</TableHead>
                          <TableHead className="min-w-[100px]">{t('admin.payments.transactions.table.amount', 'Amount')}</TableHead>
                          <TableHead className="min-w-[100px]">{t('admin.payments.transactions.table.method', 'Method')}</TableHead>
                          <TableHead className="min-w-[100px]">{t('admin.payments.transactions.table.status', 'Status')}</TableHead>
                          <TableHead className="min-w-[120px]">{t('admin.payments.transactions.table.date', 'Date')}</TableHead>
                          <TableHead className="min-w-[200px]">{t('admin.payments.transactions.table.actions', 'Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="font-mono text-sm">{transaction.id}</TableCell>
                            <TableCell className="font-medium">{transaction.companyName}</TableCell>
                            <TableCell>{transaction.planName}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(transaction.amount)}</TableCell>
                            <TableCell className="capitalize">{transaction.paymentMethod}</TableCell>
                            <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                            <TableCell className="text-sm">{formatDate(transaction.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openViewDialog(transaction)}
                                  className="justify-start sm:justify-center"
                                >
                                  <Eye className="mr-1 h-3 w-3" />
                                  <span className="hidden sm:inline">{t('admin.payments.actions.view_details', 'View Details')}</span>
                                  <span className="sm:hidden">{t('admin.payments.actions.view', 'View')}</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditDialog(transaction)}
                                  className="justify-start sm:justify-center"
                                >
                                  <Edit className="mr-1 h-3 w-3" />
                                  <span className="hidden sm:inline">{t('admin.payments.actions.edit_payment', 'Edit Payment')}</span>
                                  <span className="sm:hidden">{t('admin.payments.actions.edit', 'Edit')}</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Pagination for transactions */}
                {transactions && transactions.totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
                    <div className="text-sm text-muted-foreground">
                      {t('admin.payments.pagination.showing', 'Showing')} {((currentPage - 1) * 20) + 1} {t('admin.payments.pagination.to', 'to')} {Math.min(currentPage * 20, transactions.total)} {t('admin.payments.pagination.of', 'of')} {transactions.total} {t('admin.payments.pagination.records', 'records')}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="min-w-[80px]"
                      >
                        {t('admin.payments.pagination.previous', 'Previous')}
                      </Button>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">
                          {t('admin.payments.pagination.page', 'Page')} {currentPage} {t('admin.payments.pagination.of', 'of')} {transactions.totalPages}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(transactions.totalPages, currentPage + 1))}
                        disabled={currentPage === transactions.totalPages}
                        className="min-w-[80px]"
                      >
                        {t('admin.payments.pagination.next', 'Next')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{t('admin.payments.pending.title', 'Pending Payments')}</CardTitle>
                  <CardDescription>
                    {t('admin.payments.pending.description', 'Manage overdue and pending payments')}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {pendingPayments?.total ?? 0} {t('admin.payments.pending.records', 'records')}
                </Badge>
              </CardHeader>
              <CardContent>
                {pendingLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : pendingPayments?.data && pendingPayments.data.length > 0 ? (
                  <>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">{t('admin.payments.pending.table.company', 'Company')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.payments.pending.table.plan', 'Plan')}</TableHead>
                            <TableHead className="min-w-[100px]">{t('admin.payments.pending.table.amount', 'Amount')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.payments.pending.table.days_overdue', 'Days Overdue')}</TableHead>
                            <TableHead className="min-w-[100px]">{t('admin.payments.pending.table.method', 'Method')}</TableHead>
                            <TableHead className="min-w-[250px]">{t('admin.payments.pending.table.actions', 'Actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingPayments.data.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="font-medium">{payment.companyName}</TableCell>
                              <TableCell>{payment.planName}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                              <TableCell>
                                <Badge variant={payment.daysOverdue > 30 ? "destructive" : payment.daysOverdue > 7 ? "secondary" : "outline"}>
                                  {payment.daysOverdue} days
                                </Badge>
                              </TableCell>
                              <TableCell className="capitalize">{payment.paymentMethod}</TableCell>
                              <TableCell>
                                <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => markAsReceivedMutation.mutate({ transactionId: payment.id })}
                                    disabled={markAsReceivedMutation.isPending}
                                    className="justify-start sm:justify-center text-xs sm:text-sm"
                                  >
                                    <CheckCircle className="mr-1 h-3 w-3" />
                                    <span className="hidden sm:inline">{t('admin.payments.actions.mark_received', 'Mark as Received')}</span>
                                    <span className="sm:hidden">{t('admin.payments.actions.mark', 'Mark')}</span>
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedCompanyId(payment.companyId);
                                      setReminderDialogOpen(true);
                                    }}
                                    className="justify-start sm:justify-center text-xs sm:text-sm"
                                  >
                                    <Mail className="mr-1 h-3 w-3" />
                                    <span className="hidden sm:inline">{t('admin.payments.actions.send_reminder', 'Send Reminder')}</span>
                                    <span className="sm:hidden">{t('admin.payments.actions.remind', 'Remind')}</span>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {pendingPayments.totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
                        <div className="text-sm text-muted-foreground">
                          {t('admin.payments.pagination.showing', 'Showing')} {((pendingPage - 1) * 20) + 1} {t('admin.payments.pagination.to', 'to')} {Math.min(pendingPage * 20, pendingPayments.total)} {t('admin.payments.pagination.of', 'of')} {pendingPayments.total} {t('admin.payments.pagination.records', 'records')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingPage(Math.max(1, pendingPage - 1))}
                            disabled={pendingPage === 1}
                            className="min-w-[80px]"
                          >
                            {t('admin.payments.pagination.previous', 'Previous')}
                          </Button>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                              {t('admin.payments.pagination.page', 'Page')} {pendingPage} {t('admin.payments.pagination.of', 'of')} {pendingPayments.totalPages}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingPage(Math.min(pendingPayments.totalPages, pendingPage + 1))}
                            disabled={pendingPage === pendingPayments.totalPages}
                            className="min-w-[80px]"
                          >
                            {t('admin.payments.pagination.next', 'Next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                    <AlertCircle className="mb-4 h-10 w-10 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">
                      {t('admin.payments.pending.empty', 'No pending payments found')}
                    </p>
                    <p className="mt-1 text-sm">
                      {t('admin.payments.pending.empty_hint', 'All payments are currently up to date.')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="companies" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{t('admin.payments.companies.title', 'Company Payment Details')}</CardTitle>
                  <CardDescription>
                    {t('admin.payments.companies.description', 'View payment information for all companies')}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {companies?.total ?? 0} {t('admin.payments.companies.records', 'companies')}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="mb-4 rounded-lg border bg-muted/20 p-4">
                  <div className="relative max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('admin.payments.companies.search_placeholder', 'Search companies...')}
                      value={companiesSearchTerm}
                      onChange={(e) => setCompaniesSearchTerm(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                </div>

                {companiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : companies && companies.data.length > 0 ? (
                  <>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[180px]">{t('admin.payments.companies.table.company', 'Company')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.payments.companies.table.plan', 'Plan')}</TableHead>
                            <TableHead className="min-w-[100px]">{t('admin.payments.companies.table.status', 'Status')}</TableHead>
                            <TableHead className="min-w-[140px]">{t('admin.payments.companies.table.last_payment', 'Last Payment')}</TableHead>
                            <TableHead className="min-w-[130px]">{t('admin.payments.companies.table.next_renewal', 'Next Renewal')}</TableHead>
                            <TableHead className="min-w-[130px]">{t('admin.payments.companies.table.payment_method', 'Payment Method')}</TableHead>
                            <TableHead className="min-w-[100px]">{t('admin.payments.companies.table.total_paid', 'Total Paid')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.payments.companies.table.actions', 'Actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {companies.data.map((company) => (
                            <TableRow key={company.id}>
                              <TableCell className="font-medium">
                                <div>
                                  <div className="font-semibold">{company.name}</div>
                                  <div className="text-xs text-muted-foreground">ID: {company.id}</div>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{company.planName}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  company.subscriptionStatus === 'active' ? 'default' :
                                  company.subscriptionStatus === 'overdue' ? 'destructive' :
                                  company.subscriptionStatus === 'pending' ? 'secondary' : 'outline'
                                }>
                                  {t(`admin.payments.companies.status.${company.subscriptionStatus}`, company.subscriptionStatus)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {company.lastPaymentDate ? (
                                  <div>
                                    <div className="text-sm font-medium">{formatDate(company.lastPaymentDate)}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatCurrency(company.lastPaymentAmount)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">No payments</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {company.subscriptionEndDate ? (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    <span className="text-sm">{formatDate(company.subscriptionEndDate)}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {company.lastPaymentMethod ? (
                                  <div className="flex items-center gap-1">
                                    <CreditCard className="h-3 w-3" />
                                    <span className="capitalize text-sm">{company.lastPaymentMethod}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                {formatCurrency(company.totalPaid)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openCompanyViewDialog(company)}
                                  className="text-xs sm:text-sm"
                                >
                                  <Eye className="mr-1 h-3 w-3" />
                                  <span className="hidden sm:inline">{t('admin.payments.actions.view_details', 'View Details')}</span>
                                  <span className="sm:hidden">{t('admin.payments.actions.view', 'View')}</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
                      <div className="text-sm text-muted-foreground">
                        {t('admin.payments.pagination.showing', 'Showing')} {((companiesPage - 1) * 20) + 1} {t('admin.payments.pagination.to', 'to')} {Math.min(companiesPage * 20, companies.total)} {t('admin.payments.pagination.of', 'of')} {companies.total} {t('admin.payments.pagination.records', 'records')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCompaniesPage(Math.max(1, companiesPage - 1))}
                          disabled={companiesPage === 1}
                          className="min-w-[80px]"
                        >
                          {t('admin.payments.pagination.previous', 'Previous')}
                        </Button>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-muted-foreground">
                            {t('admin.payments.pagination.page', 'Page')} {companiesPage} {t('admin.payments.pagination.of', 'of')} {companies.totalPages}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCompaniesPage(companiesPage + 1)}
                          disabled={companiesPage >= companies.totalPages}
                          className="min-w-[80px]"
                        >
                          {t('admin.payments.pagination.next', 'Next')}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                    <Users className="mb-4 h-10 w-10 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">
                      {companiesSearchTerm
                        ? t('admin.payments.companies.empty_filtered', 'No companies match your search.')
                        : t('admin.payments.companies.empty', 'No companies found')}
                    </p>
                    <p className="mt-1 text-sm">
                      {t('admin.payments.companies.empty_hint', 'Try searching with a different company name or identifier.')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{t('admin.payments.performance.title', 'Payment Method Performance')}</CardTitle>
                  <CardDescription>
                    {t('admin.payments.performance.description', 'Analyze performance across different payment methods')}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {performance?.length ?? 0} {t('admin.payments.performance.methods', 'methods')}
                </Badge>
              </CardHeader>
              <CardContent>
                {performanceLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : performance && performance.length > 0 ? (
                  <>
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                      {performance.map((method) => (
                        <Card key={method.paymentMethod}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium capitalize">
                              {method.paymentMethod}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-xl sm:text-2xl font-bold">
                              {method.successRate.toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Success Rate
                            </p>
                            <div className="mt-2 text-xs sm:text-sm">
                              <div className="font-medium">{formatCurrency(method.totalRevenue)}</div>
                              <div className="text-muted-foreground">
                                {method.totalTransactions} transactions
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[140px]">{t('admin.payments.performance.table.method', 'Payment Method')}</TableHead>
                            <TableHead className="min-w-[140px]">{t('admin.payments.performance.table.transactions', 'Total Transactions')}</TableHead>
                            <TableHead className="min-w-[160px]">{t('admin.payments.performance.table.success_rate', 'Success Rate')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.payments.performance.table.revenue', 'Total Revenue')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.payments.performance.table.avg_amount', 'Average Amount')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {performance.map((method) => (
                            <TableRow key={method.paymentMethod}>
                              <TableCell className="font-medium capitalize">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="h-4 w-4" />
                                  <span className="text-sm sm:text-base">{method.paymentMethod}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium text-sm sm:text-base">{method.totalTransactions}</div>
                                  <div className="text-xs sm:text-sm text-muted-foreground">
                                    {method.successfulTransactions} successful
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-12 sm:w-16 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-green-600 h-2 rounded-full"
                                      style={{ width: `${method.successRate}%` }}
                                    ></div>
                                  </div>
                                  <span className="font-medium text-sm sm:text-base">{method.successRate.toFixed(1)}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium text-sm sm:text-base">
                                {formatCurrency(method.totalRevenue)}
                              </TableCell>
                              <TableCell className="text-sm sm:text-base">
                                {formatCurrency(method.averageAmount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-6">
                      <h3 className="text-base sm:text-lg font-medium mb-4">Revenue Distribution</h3>
                      <div className="h-[250px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={performance}
                              dataKey="totalRevenue"
                              nameKey="paymentMethod"
                              cx="50%"
                              cy="50%"
                              outerRadius="60%"
                              fill="#8884d8"
                              label={({ paymentMethod, percent }) =>
                                window.innerWidth >= 640
                                  ? `${paymentMethod}: ${(percent * 100).toFixed(0)}%`
                                  : `${(percent * 100).toFixed(0)}%`
                              }
                              labelLine={false}
                            >
                              {performance.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'][index % 5]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => formatCurrency(Number(value))}
                              contentStyle={chartTooltipStyles.contentStyle}
                              labelStyle={chartTooltipStyles.labelStyle}
                              itemStyle={chartTooltipStyles.itemStyle}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                    <TrendingUp className="mb-4 h-10 w-10 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">
                      {t('admin.payments.performance.empty', 'No performance data available')}
                    </p>
                    <p className="mt-1 text-sm">
                      {t('admin.payments.performance.empty_hint', 'Performance insights will appear once enough payment activity is available.')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Payment Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">{t('admin.payments.edit.title', 'Edit Payment Transaction')}</DialogTitle>
              <DialogDescription className="text-sm">
                Modify payment transaction details. Be careful when changing completed payments.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-status">{t('admin.payments.edit.status', 'Status')}</Label>
                  <Select value={editForm.status} onValueChange={(value) => setEditForm(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t('admin.payments.status.pending', 'Pending')}</SelectItem>
                      <SelectItem value="completed">{t('admin.payments.status.completed', 'Completed')}</SelectItem>
                      <SelectItem value="failed">{t('admin.payments.status.failed', 'Failed')}</SelectItem>
                      <SelectItem value="cancelled">{t('admin.payments.status.cancelled', 'Cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-method">{t('admin.payments.edit.payment_method', 'Payment Method')}</Label>
                  <Select value={editForm.paymentMethod} onValueChange={(value) => setEditForm(prev => ({ ...prev, paymentMethod: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="paystack">Paystack</SelectItem>
                      <SelectItem value="mercado_pago">Mercado Pago</SelectItem>
                      <SelectItem value="moyasar">Moyasar</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-amount">{t('admin.payments.edit.amount', 'Amount')}</Label>
                  <Input
                    id="edit-amount"
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-external-id">{t('admin.payments.edit.external_id', 'External Transaction ID')}</Label>
                  <Input
                    id="edit-external-id"
                    value={editForm.externalTransactionId}
                    onChange={(e) => setEditForm(prev => ({ ...prev, externalTransactionId: e.target.value }))}
                    placeholder="External reference ID"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-notes">{t('admin.payments.edit.notes', 'Notes')}</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('admin.payments.edit.notes_placeholder', 'Add notes about this transaction...')}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={handleEditSubmit}
                disabled={editTransactionMutation.isPending || !editForm.amount || !editForm.status}
                className="w-full sm:w-auto"
              >
                {editTransactionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Edit className="mr-2 h-4 w-4" />
                )}
                {t('admin.payments.edit.save_button', 'Save Changes')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Reminder Dialog */}
        <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.payments.reminders.title', 'Send Payment Reminder')}</DialogTitle>
              <DialogDescription>
                Send a payment reminder to the selected company.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder={t('admin.payments.reminders.message_placeholder', 'Enter reminder message...')}
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReminderDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedCompanyId && reminderMessage.trim()) {
                    sendReminderMutation.mutate({
                      companyId: selectedCompanyId,
                      message: reminderMessage.trim()
                    });
                  }
                }}
                disabled={!reminderMessage.trim() || sendReminderMutation.isPending}
              >
                {sendReminderMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {t('admin.payments.reminders.send_button', 'Send Reminder')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Payment Details Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">{t('admin.payments.view.title', 'Payment Transaction Details')}</DialogTitle>
              <DialogDescription className="text-sm">
                Complete information for transaction #{selectedTransaction?.id}
              </DialogDescription>
            </DialogHeader>
            {selectedTransaction && (
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{t('admin.payments.view.basic_info', 'Basic Information')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.transaction_id', 'Transaction ID')}:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{selectedTransaction.id}</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedTransaction.id.toString())}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.status', 'Status')}:</span>
                        <span>{getStatusBadge(selectedTransaction.status)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.amount', 'Amount')}:</span>
                        <span className="font-semibold">{formatCurrency(selectedTransaction.amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.payment_method', 'Payment Method')}:</span>
                        <span className="capitalize">{selectedTransaction.paymentMethod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.created_at', 'Created')}:</span>
                        <span>{formatDate(selectedTransaction.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.updated_at', 'Updated')}:</span>
                        <span>{formatDate(selectedTransaction.updatedAt)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{t('admin.payments.view.company_info', 'Company Information')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.company_id', 'Company ID')}:</span>
                        <span className="font-mono">{selectedTransaction.companyId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.company_name', 'Company Name')}:</span>
                        <span className="font-medium">{selectedTransaction.companyName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.plan_id', 'Plan ID')}:</span>
                        <span className="font-mono">{selectedTransaction.planId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('admin.payments.view.plan_name', 'Plan Name')}:</span>
                        <span className="font-medium">{selectedTransaction.planName}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Payment Method Specific Details */}
                {(selectedTransaction.paymentIntentId || selectedTransaction.externalTransactionId || selectedTransaction.metadata) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{t('admin.payments.view.payment_details', 'Payment Method Details')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedTransaction.paymentIntentId && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {selectedTransaction.paymentMethod === 'stripe' ? 'Stripe Payment Intent ID:' : 'Payment Intent ID:'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{selectedTransaction.paymentIntentId}</span>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedTransaction.paymentIntentId!)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {selectedTransaction.externalTransactionId && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">External Transaction ID:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{selectedTransaction.externalTransactionId}</span>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedTransaction.externalTransactionId!)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {selectedTransaction.metadata?.reference && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reference:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{selectedTransaction.metadata.reference}</span>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedTransaction.metadata.reference)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {selectedTransaction.metadata?.paypalTransactionId && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">PayPal Transaction ID:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{selectedTransaction.metadata.paypalTransactionId}</span>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedTransaction.metadata.paypalTransactionId)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Notes */}
                {(selectedTransaction.notes || selectedTransaction.metadata?.notes) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{t('admin.payments.view.notes', 'Notes')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedTransaction.notes || selectedTransaction.metadata?.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('admin.payments.confirm.title', 'Confirm Action')}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmDialogOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmAction && confirmAction()}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Company View Dialog */}
        <Dialog open={companyViewDialogOpen} onOpenChange={setCompanyViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {t('admin.payments.company_view.title', 'Company Payment Details')}
              </DialogTitle>
              <DialogDescription>
                {t('admin.payments.company_view.description', 'Comprehensive payment information for this company')}
              </DialogDescription>
            </DialogHeader>
            {selectedCompany && (
              <div className="space-y-6">
                {/* Company Information */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{t('admin.payments.company_view.company_info', 'Company Information')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Company Name:</span>
                        <p className="text-sm font-semibold">{selectedCompany.name}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Company ID:</span>
                        <p className="text-sm font-mono">{selectedCompany.id}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Member Since:</span>
                        <p className="text-sm">{formatDate(selectedCompany.createdAt)}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Current Plan:</span>
                        <p className="text-sm font-semibold">{selectedCompany.planName}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Subscription Status */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{t('admin.payments.company_view.subscription', 'Subscription Details')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Status:</span>
                        <div className="mt-1">
                          <Badge variant={
                            selectedCompany.subscriptionStatus === 'active' ? 'default' :
                            selectedCompany.subscriptionStatus === 'pending' ? 'secondary' :
                            selectedCompany.subscriptionStatus === 'overdue' ? 'destructive' :
                            'outline'
                          }>
                            {selectedCompany.subscriptionStatus}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Next Renewal:</span>
                        <p className="text-sm">
                          {selectedCompany.subscriptionEndDate
                            ? formatDate(selectedCompany.subscriptionEndDate)
                            : 'No renewal date set'
                          }
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{t('admin.payments.company_view.payment_summary', 'Payment Summary')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Total Paid:</span>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(selectedCompany.totalPaid)}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Last Payment:</span>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">
                            {selectedCompany.lastPaymentAmount > 0
                              ? formatCurrency(selectedCompany.lastPaymentAmount)
                              : 'No payments yet'
                            }
                          </p>
                          {selectedCompany.lastPaymentDate && (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(selectedCompany.lastPaymentDate)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Payment Method:</span>
                        <p className="text-sm">
                          {selectedCompany.lastPaymentMethod
                            ? selectedCompany.lastPaymentMethod.replace('_', ' ').toUpperCase()
                            : 'No payment method on file'
                          }
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Transactions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{t('admin.payments.company_view.transactions', 'Payment Transactions')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {companyTransactionsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : companyTransactions && companyTransactions.length > 0 ? (
                      <div className="space-y-3">
                        {companyTransactions.slice(0, 5).map((transaction) => (
                          <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant={
                                  transaction.status === 'completed' ? 'default' :
                                  transaction.status === 'pending' ? 'secondary' :
                                  transaction.status === 'failed' ? 'destructive' :
                                  'outline'
                                }>
                                  {transaction.status}
                                </Badge>
                                <span className="text-sm font-medium">{formatCurrency(transaction.amount)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {transaction.paymentMethod.replace('_', ' ').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDate(transaction.createdAt)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCompanyViewDialogOpen(false);
                                openViewDialog(transaction);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {companyTransactions.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center pt-2">
                            Showing 5 of {companyTransactions.length} transactions
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No payment transactions found for this company.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompanyViewDialogOpen(false)}>
                {t('common.close', 'Close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
