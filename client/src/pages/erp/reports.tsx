import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions, type Permission } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';
import { format, subDays, startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, isAfter, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';

const CHART_COLORS = ['#25D366', '#1877F2', '#E4405F', '#F59E0B', '#8B5CF6', '#82CA9D'];

const DATE_RANGE_PRESETS = {
  today: { key: 'today' },
  thisWeek: { key: 'thisWeek' },
  last7days: { key: 'last7days' },
  thisMonth: { key: 'thisMonth' },
  thisQuarter: { key: 'thisQuarter' },
  thisYear: { key: 'thisYear' },
  custom: { key: 'custom' },
} as const;

type DateRangePreset = keyof typeof DATE_RANGE_PRESETS;

const calculateDateRange = (preset: DateRangePreset): { from: Date; to: Date } => {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: now };
    case 'thisWeek':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case 'last7days':
      return { from: subDays(now, 7), to: now };
    case 'thisMonth':
      return { from: startOfMonth(now), to: now };
    case 'thisQuarter':
      return { from: startOfQuarter(now), to: now };
    case 'thisYear':
      return { from: startOfYear(now), to: now };
    default:
      return { from: subDays(now, 30), to: now };
  }
};

const validateDateRange = (from: Date, to: Date): { isValid: boolean; errorKey?: string } => {
  if (isAfter(from, to)) return { isValid: false, errorKey: 'erp.reports.validation.startBeforeEnd' };
  if (isAfter(from, new Date())) return { isValid: false, errorKey: 'erp.reports.validation.startNotFuture' };
  if (differenceInDays(to, from) > 365) return { isValid: false, errorKey: 'erp.reports.validation.maxRange' };
  return { isValid: true };
};

function fmtMoney(n: number, currency: string) {
  const code = (currency || 'USD').trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(n);
  } catch {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);
  }
}

type SalesReportRow = { key: string; label: string; quantity: number; revenue: number; tax: number };
type InventoryValuationRow = {
  productId: number;
  productName: string;
  sku: string | null;
  categoryName: string | null;
  quantity: number;
  unitCost: number;
  totalValue: number;
};
type PurchaseReportRow = {
  supplierName: string;
  orderCount: number;
  totalAmount: number;
  receivedOrderCount: number;
  receivedAmount: number;
};
type ProfitAndLossReport = {
  revenue: Array<{ accountId: number; accountCode: string; accountName: string; amount: string }>;
  expenses: Array<{ accountId: number; accountCode: string; accountName: string; amount: string }>;
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
};
type TaxCollectedRow = { period: string; invoiceType: string; taxAmount: number };
type EmployeeSummary = {
  byDepartment: Array<{ departmentName: string; headcount: number }>;
  byStatus: Array<{ status: string; headcount: number }>;
  totalEmployees: number;
  departmentTotal?: number;
  latestPayroll: null | { totalGross: string; totalNet: string; status: string };
};

type ReportKind = 'sales' | 'inventory' | 'purchases' | 'pl' | 'tax' | 'employee' | 'restaurant';
type ReportPeriod = 'daily' | 'weekly' | 'monthly';
type ReportQueryResult<T> = { rows: T[]; total: number; baseCurrency: string };
type EmployeeQueryResult = { summary: EmployeeSummary; total: number; baseCurrency: string };

function reportPeriodForRange(from: Date, to: Date): ReportPeriod {
  const days = Math.max(1, differenceInDays(to, from) + 1);
  if (days <= 14) return 'daily';
  if (days <= 90) return 'weekly';
  return 'monthly';
}

export default function ERPReportsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { hasPermission, hasAnyPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isRestaurant } = useErpBusinessType();
  const [reportType, setReportType] = useState<ReportKind>('sales');
  const [salesGroupBy, setSalesGroupBy] = useState<'product' | 'customer' | 'period'>('product');
  const [timePeriod, setTimePeriod] = useState<DateRangePreset>('thisMonth');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => calculateDateRange('thisMonth'));
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const pageSize = 12;

  const fromTo = useMemo(
    () => ({ from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }),
    [dateRange],
  );
  const salesPeriod = useMemo(() => reportPeriodForRange(dateRange.from, dateRange.to), [dateRange]);
  const pageParams = useMemo(
    () => ({ limit: String(pageSize), offset: String(tablePage * pageSize) }),
    [pageSize, tablePage],
  );

  const SALES_ORDER_PERMS: Permission[] = [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS];
  const INVOICE_PERMS: Permission[] = [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS];
  const ACCOUNTING_PERMS: Permission[] = [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING];
  const INVENTORY_PERMS: Permission[] = [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY];
  const PURCHASE_PERMS: Permission[] = [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS, PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS];
  const HR_PAYROLL_PERMS: Permission[] = [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL];

  const canViewErpReports = hasPermission(PERMISSIONS.VIEW_ERP_REPORTS);
  const canSalesReport = canViewErpReports || hasAnyPermission([...SALES_ORDER_PERMS, ...INVOICE_PERMS]);
  const canInventoryReport = canViewErpReports || hasAnyPermission(INVENTORY_PERMS);
  const canPurchasesReport = canViewErpReports || hasAnyPermission(PURCHASE_PERMS);
  const canPl = canViewErpReports || hasAnyPermission(ACCOUNTING_PERMS);
  const canTaxReport = canViewErpReports || hasAnyPermission([...ACCOUNTING_PERMS, ...INVOICE_PERMS]);
  const canEmployeeReport = canViewErpReports || hasAnyPermission(HR_PAYROLL_PERMS);
  const canRestaurantSalesReport = canViewErpReports || hasAnyPermission(SALES_ORDER_PERMS);
  const canRestaurantReport = isRestaurant && (canRestaurantSalesReport || canInventoryReport);

  const availableReportTypes = useMemo(
    () =>
      [
        canSalesReport ? 'sales' : null,
        canInventoryReport ? 'inventory' : null,
        canPurchasesReport ? 'purchases' : null,
        canPl ? 'pl' : null,
        canTaxReport ? 'tax' : null,
        canEmployeeReport ? 'employee' : null,
        canRestaurantReport ? 'restaurant' : null,
      ].filter(Boolean) as ReportKind[],
    [canSalesReport, canInventoryReport, canPurchasesReport, canPl, canTaxReport, canEmployeeReport, canRestaurantReport],
  );

  useEffect(() => {
    if (!availableReportTypes.includes(reportType) && availableReportTypes[0]) {
      setReportType(availableReportTypes[0]);
      setTablePage(0);
    }
  }, [availableReportTypes, reportType]);

  const salesQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/sales', companyId, salesGroupBy, salesPeriod, fromTo.from, fromTo.to, tablePage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        groupBy: salesGroupBy,
        period: salesPeriod,
        dateFrom: fromTo.from,
        dateTo: fromTo.to,
        ...pageParams,
      });
      const u = `/api/erp/dashboard/reports/sales?${params.toString()}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as SalesReportRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<SalesReportRow>;
    },
    enabled: !!companyId && reportType === 'sales' && canSalesReport,
  });

  const salesAggregateQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/sales', 'aggregate', companyId, salesGroupBy, salesPeriod, fromTo.from, fromTo.to],
    queryFn: async () => {
      const params = new URLSearchParams({
        groupBy: salesGroupBy,
        period: salesPeriod,
        dateFrom: fromTo.from,
        dateTo: fromTo.to,
      });
      const u = `/api/erp/dashboard/reports/sales?${params.toString()}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as SalesReportRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<SalesReportRow>;
    },
    enabled: !!companyId && reportType === 'sales' && canSalesReport,
  });

  const inventoryQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/inventory-valuation', companyId, tablePage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams(pageParams);
      const res = await apiRequest('GET', `/api/erp/dashboard/reports/inventory-valuation?${params.toString()}`);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as InventoryValuationRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<InventoryValuationRow>;
    },
    enabled: !!companyId && reportType === 'inventory' && canInventoryReport,
  });

  const inventoryAggregateQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/inventory-valuation', 'aggregate', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dashboard/reports/inventory-valuation');
      const json = await res.json();
      return {
        rows: (json.data ?? []) as InventoryValuationRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<InventoryValuationRow>;
    },
    enabled: !!companyId && reportType === 'inventory' && canInventoryReport,
  });

  const purchasesQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/purchases', companyId, fromTo.from, fromTo.to, tablePage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: fromTo.from, dateTo: fromTo.to, ...pageParams });
      const u = `/api/erp/dashboard/reports/purchases?${params.toString()}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as PurchaseReportRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<PurchaseReportRow>;
    },
    enabled: !!companyId && reportType === 'purchases' && canPurchasesReport,
  });

  const purchasesAggregateQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/purchases', 'aggregate', companyId, fromTo.from, fromTo.to],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: fromTo.from, dateTo: fromTo.to });
      const u = `/api/erp/dashboard/reports/purchases?${params.toString()}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as PurchaseReportRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<PurchaseReportRow>;
    },
    enabled: !!companyId && reportType === 'purchases' && canPurchasesReport,
  });

  const plQuery = useQuery({
    queryKey: ['/api/erp/accounting/reports/profit-loss', companyId, fromTo.from, fromTo.to],
    queryFn: async () => {
      const u = `/api/erp/accounting/reports/profit-loss?startDate=${encodeURIComponent(fromTo.from)}&endDate=${encodeURIComponent(fromTo.to)}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        report: json.data as ProfitAndLossReport,
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      };
    },
    enabled: !!companyId && reportType === 'pl' && canPl,
  });

  const taxQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/tax-collected', companyId, fromTo.from, fromTo.to, tablePage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: fromTo.from, dateTo: fromTo.to, ...pageParams });
      const u = `/api/erp/dashboard/reports/tax-collected?${params.toString()}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as TaxCollectedRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<TaxCollectedRow>;
    },
    enabled: !!companyId && reportType === 'tax' && canTaxReport,
  });

  const taxAggregateQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/tax-collected', 'aggregate', companyId, fromTo.from, fromTo.to],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: fromTo.from, dateTo: fromTo.to });
      const u = `/api/erp/dashboard/reports/tax-collected?${params.toString()}`;
      const res = await apiRequest('GET', u);
      const json = await res.json();
      return {
        rows: (json.data ?? []) as TaxCollectedRow[],
        total: Number(json.total ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies ReportQueryResult<TaxCollectedRow>;
    },
    enabled: !!companyId && reportType === 'tax' && canTaxReport,
  });

  const employeeQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/employee-summary', companyId, tablePage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams(pageParams);
      const res = await apiRequest('GET', `/api/erp/dashboard/reports/employee-summary?${params.toString()}`);
      const json = await res.json();
      return {
        summary: json.data as EmployeeSummary,
        total: Number(json.total ?? json.data?.departmentTotal ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      };
    },
    enabled: !!companyId && reportType === 'employee' && canEmployeeReport,
  });

  const employeeAggregateQuery = useQuery({
    queryKey: ['/api/erp/dashboard/reports/employee-summary', 'aggregate', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dashboard/reports/employee-summary');
      const json = await res.json();
      return {
        summary: json.data as EmployeeSummary,
        total: Number(json.total ?? json.data?.departmentTotal ?? 0),
        baseCurrency: String(json.baseCurrency ?? 'USD'),
      } satisfies EmployeeQueryResult;
    },
    enabled: !!companyId && reportType === 'employee' && canEmployeeReport,
  });

  const restaurantOrderMixQuery = useQuery({
    queryKey: ['/api/erp/dashboard/restaurant/order-mix', companyId, fromTo.from, fromTo.to],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dashboard/restaurant/order-mix?dateFrom=${encodeURIComponent(fromTo.from)}&dateTo=${encodeURIComponent(fromTo.to)}`);
      const json = await res.json();
      return (json.data ?? []) as Array<{ serviceType: string; count: number; revenue: number }>;
    },
    enabled: !!companyId && reportType === 'restaurant' && isRestaurant && canRestaurantSalesReport,
  });

  const restaurantTicketThroughputQuery = useQuery({
    queryKey: ['/api/erp/dashboard/restaurant/ticket-throughput', companyId, salesPeriod, fromTo.from, fromTo.to],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dashboard/restaurant/ticket-throughput?period=${salesPeriod}&dateFrom=${encodeURIComponent(fromTo.from)}&dateTo=${encodeURIComponent(fromTo.to)}`);
      const json = await res.json();
      return (json.data ?? []) as Array<{ periodStart: string; ticketsCompleted: number; avgMinutesToReady: number }>;
    },
    enabled: !!companyId && reportType === 'restaurant' && isRestaurant && canRestaurantSalesReport,
  });

  const restaurantReservationLoadQuery = useQuery({
    queryKey: ['/api/erp/dashboard/restaurant/reservation-load', companyId, fromTo.from, fromTo.to],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dashboard/restaurant/reservation-load?dateFrom=${encodeURIComponent(fromTo.from)}&dateTo=${encodeURIComponent(fromTo.to)}`);
      const json = await res.json();
      return (json.data ?? []) as Array<{ date: string; booked: number; seated: number; noShow: number; cancelled: number }>;
    },
    enabled: !!companyId && reportType === 'restaurant' && isRestaurant && canRestaurantSalesReport,
  });

  const restaurantIngredientRiskQuery = useQuery({
    queryKey: ['/api/erp/dashboard/restaurant/ingredient-risk', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dashboard/restaurant/ingredient-risk');
      const json = await res.json();
      return (json.data ?? []) as Array<{ productId: number; productName: string; currentQty: number; reorderPoint: number; riskLevel: 'ok' | 'low' | 'critical' }>;
    },
    enabled: !!companyId && reportType === 'restaurant' && isRestaurant && canInventoryReport,
  });

  const baseCurrency = useMemo(() => {
    const cur =
      (reportType === 'sales' && (salesAggregateQuery.data?.baseCurrency ?? salesQuery.data?.baseCurrency)) ||
      (reportType === 'inventory' && (inventoryAggregateQuery.data?.baseCurrency ?? inventoryQuery.data?.baseCurrency)) ||
      (reportType === 'purchases' && (purchasesAggregateQuery.data?.baseCurrency ?? purchasesQuery.data?.baseCurrency)) ||
      (reportType === 'pl' && plQuery.data?.baseCurrency) ||
      (reportType === 'tax' && (taxAggregateQuery.data?.baseCurrency ?? taxQuery.data?.baseCurrency)) ||
      (reportType === 'employee' && (employeeAggregateQuery.data?.baseCurrency ?? employeeQuery.data?.baseCurrency)) ||
      (reportType === 'restaurant' && 'USD') ||
      'USD';
    return String(cur).trim().toUpperCase();
  }, [
    reportType,
    salesAggregateQuery.data,
    salesQuery.data,
    inventoryAggregateQuery.data,
    inventoryQuery.data,
    purchasesAggregateQuery.data,
    purchasesQuery.data,
    plQuery.data,
    taxAggregateQuery.data,
    taxQuery.data,
    employeeAggregateQuery.data,
    employeeQuery.data,
  ]);

  const inventoryPieData = useMemo(() => {
    const rows = inventoryAggregateQuery.data?.rows ?? [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = r.categoryName || t('erp.reports.common.uncategorized', 'Uncategorized');
      map.set(k, (map.get(k) ?? 0) + r.totalValue);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [inventoryAggregateQuery.data]);

  const taxLineData = useMemo(() => {
    const rows = taxAggregateQuery.data?.rows ?? [];
    const byPeriod = new Map<string, number>();
    for (const r of rows) {
      const k = format(new Date(r.period), 'MMM yyyy');
      byPeriod.set(k, (byPeriod.get(k) ?? 0) + r.taxAmount);
    }
    return [...byPeriod.entries()].map(([label, tax]) => ({ label, tax }));
  }, [taxAggregateQuery.data]);

  const plBarData = useMemo(() => {
    const pl = plQuery.data?.report;
    if (!pl) return [];
    return [
      ...pl.revenue.map((r) => ({ name: r.accountName.slice(0, 20), kind: t('erp.reports.pl.revenue', 'Revenue'), amount: Number(r.amount) })),
      ...pl.expenses.map((r) => ({ name: r.accountName.slice(0, 20), kind: t('erp.reports.pl.expenses', 'Expenses'), amount: Number(r.amount) })),
    ].slice(0, 24);
  }, [plQuery.data]);

  const plTableRows = useMemo(() => {
    const pl = plQuery.data?.report;
    if (!pl) return [];
    return [
      ...pl.revenue.map((r) => ({ section: t('erp.reports.pl.revenue', 'Revenue'), accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.amount) })),
      ...pl.expenses.map((r) => ({ section: t('erp.reports.pl.expensesSingle', 'Expense'), accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.amount) })),
    ];
  }, [plQuery.data]);

  const handlePresetChange = (v: string) => {
    const preset = v as DateRangePreset;
    setTimePeriod(preset);
    setDateRangeError(null);
    if (preset !== 'custom') {
      const next = calculateDateRange(preset);
      const val = validateDateRange(next.from, next.to);
      if (!val.isValid) {
        setDateRangeError(t(val.errorKey ?? 'erp.reports.validation.invalidRange', 'Invalid range'));
        return;
      }
      setDateRange(next);
    }
    setTablePage(0);
  };

  const exportReportType = (): string => {
    switch (reportType) {
      case 'sales':
        return 'sales';
      case 'inventory':
        return 'inventory_valuation';
      case 'purchases':
        return 'purchases';
      case 'pl':
        return 'profit_loss';
      case 'tax':
        return 'tax_collected';
      case 'employee':
        return 'employee_summary';
      default:
        return 'sales';
    }
  };

  const handleExport = async (format: DownloadExportFormat) => {
    try {
      const rt = exportReportType();
      const params = new URLSearchParams({ format, reportType: rt });
      if (['sales', 'purchases', 'tax', 'profit_loss'].includes(rt)) {
        params.set('dateFrom', fromTo.from);
        params.set('dateTo', fromTo.to);
      }
      if (rt === 'sales') {
        params.set('groupBy', salesGroupBy);
        params.set('period', salesPeriod);
      }
      const res = await fetch(`${window.location.origin}/api/erp/dashboard/reports/export?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const errText = await res.text();
      toast({ title: t('erp.reports.export.failed', 'Export failed'), description: errText.slice(0, 200), variant: 'destructive' });
        return;
      }
      await downloadExportResponse(res, `erp-${rt}-${Date.now()}`, format);
      toast({ title: t('erp.reports.export.started', 'Export started'), description: t('erp.reports.export.startedDescription', 'Your download should begin shortly.') });
    } catch (e) {
      toast({
        title: t('erp.reports.export.failed', 'Export failed'),
        description: e instanceof Error ? e.message : t('erp.reports.errors.unknown', 'Unknown error'),
        variant: 'destructive',
      });
    }
  };

  const activeRows = useMemo(() => {
    switch (reportType) {
      case 'sales':
        return salesQuery.data?.rows ?? [];
      case 'inventory':
        return inventoryQuery.data?.rows ?? [];
      case 'purchases':
        return purchasesQuery.data?.rows ?? [];
      case 'pl':
        return plTableRows;
      case 'tax':
        return taxQuery.data?.rows ?? [];
      case 'employee':
        return employeeQuery.data?.summary.byDepartment ?? [];
      case 'restaurant':
        return [];
      default:
        return [];
    }
  }, [reportType, salesQuery.data, inventoryQuery.data, purchasesQuery.data, plTableRows, taxQuery.data, employeeQuery.data]);

  const totalActiveRows = useMemo(() => {
    switch (reportType) {
      case 'sales':
        return salesQuery.data?.total ?? 0;
      case 'inventory':
        return inventoryQuery.data?.total ?? 0;
      case 'purchases':
        return purchasesQuery.data?.total ?? 0;
      case 'pl':
        return plTableRows.length;
      case 'tax':
        return taxQuery.data?.total ?? 0;
      case 'employee':
        return employeeQuery.data?.total ?? employeeQuery.data?.summary.departmentTotal ?? 0;
      case 'restaurant':
        return 0;
      default:
        return 0;
    }
  }, [reportType, salesQuery.data, inventoryQuery.data, purchasesQuery.data, plTableRows, taxQuery.data, employeeQuery.data]);

  const pagedRows = useMemo(() => {
    if (reportType !== 'pl') return activeRows;
    const start = tablePage * pageSize;
    return activeRows.slice(start, start + pageSize);
  }, [activeRows, reportType, tablePage]);

  const loading =
    (reportType === 'sales' && salesAggregateQuery.isLoading) ||
    (reportType === 'inventory' && inventoryAggregateQuery.isLoading) ||
    (reportType === 'purchases' && purchasesAggregateQuery.isLoading) ||
    (reportType === 'pl' && plQuery.isLoading) ||
    (reportType === 'tax' && taxAggregateQuery.isLoading) ||
    (reportType === 'employee' && employeeAggregateQuery.isLoading) ||
    (reportType === 'restaurant' && (restaurantOrderMixQuery.isLoading || restaurantTicketThroughputQuery.isLoading || restaurantReservationLoadQuery.isLoading || restaurantIngredientRiskQuery.isLoading));

  const tableLoading =
    (reportType === 'sales' && salesQuery.isLoading) ||
    (reportType === 'inventory' && inventoryQuery.isLoading) ||
    (reportType === 'purchases' && purchasesQuery.isLoading) ||
    (reportType === 'tax' && taxQuery.isLoading) ||
    (reportType === 'employee' && employeeQuery.isLoading);

  const tableError = useMemo(() => {
    switch (reportType) {
      case 'sales':
        return salesQuery.error;
      case 'inventory':
        return inventoryQuery.error;
      case 'purchases':
        return purchasesQuery.error;
      case 'pl':
        return plQuery.error;
      case 'tax':
        return taxQuery.error;
      case 'employee':
        return employeeQuery.error;
      case 'restaurant':
        return null;
      default:
        return null;
    }
  }, [reportType, salesQuery.error, inventoryQuery.error, purchasesQuery.error, plQuery.error, taxQuery.error, employeeQuery.error]);

  const tableColumnCount = useMemo(() => {
    switch (reportType) {
      case 'sales':
        return 4;
      case 'inventory':
        return 5;
      case 'purchases':
        return 4;
      case 'pl':
        return canPl ? 3 : 1;
      case 'tax':
        return 3;
      case 'employee':
        return 2;
      case 'restaurant':
        return 1;
      default:
        return 1;
    }
  }, [reportType, canPl]);

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h1 data-tour="pages-erp-reports.h1.erp.reports.title" className="text-2xl">{t('erp.reports.title', 'ERP Reports')}</h1>
            <p className="text-sm text-muted-foreground">{t('erp.reports.subtitle', 'Consolidated operational and financial reports')}</p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('erp.reports.filters.title', 'Filters')}</CardTitle>
              <CardDescription>{t('erp.reports.filters.description', 'Select report, range, and export')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t('erp.reports.filters.report', 'Report')}</p>
                <Select
                  value={reportType}
                  disabled={availableReportTypes.length === 0}
                  onValueChange={(v) => {
                    setReportType(v as ReportKind);
                    setTablePage(0);
                  }}
                >
                  <SelectTrigger data-tour="erp-report-type" className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReportTypes.includes('sales') ? <SelectItem value="sales">{t('erp.reports.types.sales', 'Sales Report')}</SelectItem> : null}
                    {availableReportTypes.includes('inventory') ? <SelectItem value="inventory">{t('erp.reports.types.inventory', 'Inventory Valuation')}</SelectItem> : null}
                    {availableReportTypes.includes('purchases') ? <SelectItem value="purchases">{t('erp.reports.types.purchases', 'Purchase Report')}</SelectItem> : null}
                    {availableReportTypes.includes('pl') ? <SelectItem value="pl">{t('erp.reports.types.pl', 'P&L')}</SelectItem> : null}
                    {availableReportTypes.includes('tax') ? <SelectItem value="tax">{t('erp.reports.types.tax', 'Tax Collected')}</SelectItem> : null}
                    {availableReportTypes.includes('employee') ? <SelectItem value="employee">{t('erp.reports.types.employee', 'Employee Summary')}</SelectItem> : null}
                    {availableReportTypes.includes('restaurant') ? <SelectItem value="restaurant">Restaurant</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>

              {reportType === 'sales' ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t('erp.reports.filters.groupBy', 'Group by')}</p>
                  <Select
                    value={salesGroupBy}
                    onValueChange={(v) => {
                      setSalesGroupBy(v as typeof salesGroupBy);
                      setTablePage(0);
                    }}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">{t('erp.reports.common.product', 'Product')}</SelectItem>
                      <SelectItem value="customer">{t('erp.reports.common.customer', 'Customer')}</SelectItem>
                      <SelectItem value="period">{t('erp.reports.common.period', 'Period')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t('erp.reports.filters.dateRange', 'Date range')}</p>
                <div className="flex flex-wrap gap-2">
                  <Select value={timePeriod} onValueChange={handlePresetChange}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DATE_RANGE_PRESETS) as DateRangePreset[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(
                            `erp.reports.datePreset.${DATE_RANGE_PRESETS[k].key}`,
                            DATE_RANGE_PRESETS[k].key === 'today'
                              ? 'Today'
                              : DATE_RANGE_PRESETS[k].key === 'thisWeek'
                                ? 'This Week'
                                : DATE_RANGE_PRESETS[k].key === 'last7days'
                                  ? 'Last 7 Days'
                                  : DATE_RANGE_PRESETS[k].key === 'thisMonth'
                                    ? 'This Month'
                                    : DATE_RANGE_PRESETS[k].key === 'thisQuarter'
                                      ? 'This Quarter'
                                      : DATE_RANGE_PRESETS[k].key === 'thisYear'
                                        ? 'This Year'
                                        : 'Custom Range'
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('justify-start text-left font-normal')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(dateRange.from, 'LLL d')} – {format(dateRange.to, 'LLL d, y')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: dateRange.from, to: dateRange.to }}
                        onSelect={(range) => {
                          if (range?.from && range?.to) {
                            const val = validateDateRange(range.from, range.to);
                            if (!val.isValid) {
                              setDateRangeError(t(val.errorKey ?? 'erp.reports.validation.invalid', 'Invalid'));
                              return;
                            }
                            setDateRangeError(null);
                            setDateRange({ from: range.from, to: range.to });
                            setTimePeriod('custom');
                            setTablePage(0);
                          }
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <ExportFormatMenu
                variant="secondary"
                disabled={availableReportTypes.length === 0 || reportType === 'restaurant'}
                onExport={handleExport}
              />
            </CardContent>
            {dateRangeError ? <p className="px-6 pb-3 text-sm text-destructive">{dateRangeError}</p> : null}
          </Card>

          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {reportType === 'sales' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.sales.lines', 'Lines')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">{salesAggregateQuery.data?.total ?? 0}</CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.sales.totalRevenue', 'Total revenue')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">
                        {fmtMoney((salesAggregateQuery.data?.rows ?? []).reduce((s, r) => s + r.revenue, 0), baseCurrency)}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.sales.totalTaxEstimate', 'Total tax (est.)')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">
                        {fmtMoney((salesAggregateQuery.data?.rows ?? []).reduce((s, r) => s + r.tax, 0), baseCurrency)}
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.reports.sales.byGroup', 'By {{group}}', { group: t(`erp.reports.groupBy.${salesGroupBy}`, salesGroupBy) })}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(salesAggregateQuery.data?.rows ?? []).map((r) => ({ name: r.label.slice(0, 18), revenue: r.revenue }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v) => fmtMoney(Number(v), baseCurrency)} />
                          <Tooltip formatter={(v: number) => fmtMoney(v, baseCurrency)} />
                          <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              ) : null}

              {reportType === 'inventory' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.inventory.skus', 'SKUs')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">{inventoryAggregateQuery.data?.total ?? 0}</CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.inventory.totalValuation', 'Total valuation')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">
                        {fmtMoney((inventoryAggregateQuery.data?.rows ?? []).reduce((s, r) => s + r.totalValue, 0), baseCurrency)}
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.reports.inventory.byCategory', 'By category')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={inventoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                            {inventoryPieData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => fmtMoney(v, baseCurrency)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              ) : null}

              {reportType === 'purchases' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.purchases.suppliers', 'Suppliers')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">{purchasesAggregateQuery.data?.total ?? 0}</CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.purchases.total', 'Purchases total')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">
                        {fmtMoney((purchasesAggregateQuery.data?.rows ?? []).reduce((s, r) => s + r.totalAmount, 0), baseCurrency)}
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.reports.purchases.bySupplier', 'By supplier')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(purchasesAggregateQuery.data?.rows ?? []).map((r) => ({ name: r.supplierName.slice(0, 16), total: r.totalAmount }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v) => fmtMoney(Number(v), baseCurrency)} />
                          <Tooltip formatter={(v: number) => fmtMoney(v, baseCurrency)} />
                          <Bar dataKey="total" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              ) : null}

              {reportType === 'pl' && canPl ? (
                <>
                  {plQuery.error ? (
                    <Card>
                      <CardContent className="py-8 text-center text-destructive">{t('erp.reports.pl.unableToLoad', 'Unable to load P&L.')}</CardContent>
                    </Card>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">{t('erp.reports.pl.revenue', 'Revenue')}</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {fmtMoney(Number(plQuery.data?.report.totalRevenue ?? 0), baseCurrency)}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">{t('erp.reports.pl.expenses', 'Expenses')}</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {fmtMoney(Number(plQuery.data?.report.totalExpenses ?? 0), baseCurrency)}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">{t('erp.reports.pl.netIncome', 'Net income')}</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {fmtMoney(Number(plQuery.data?.report.netIncome ?? 0), baseCurrency)}
                          </CardContent>
                        </Card>
                      </div>
                      <Card>
                        <CardHeader>
                          <CardTitle>{t('erp.reports.pl.accounts', 'Accounts')}</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[360px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={plBarData}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="name" angle={-25} textAnchor="end" height={70} tick={{ fontSize: 9 }} />
                              <YAxis tickFormatter={(v) => fmtMoney(Number(v), baseCurrency)} />
                              <Tooltip formatter={(v: number) => fmtMoney(v, baseCurrency)} />
                              <Legend />
                              <Bar dataKey="amount" fill={CHART_COLORS[3]} name={t('erp.common.amount', 'Amount')} radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </>
              ) : null}

              {reportType === 'pl' && !canPl ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    {t('erp.reports.pl.requiresAccounting', 'You need accounting access to view the P&L report.')}
                  </CardContent>
                </Card>
              ) : null}

              {reportType === 'tax' ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{t('erp.reports.tax.estimated', 'Tax (estimated from line items)')}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {fmtMoney((taxAggregateQuery.data?.rows ?? []).reduce((s, r) => s + r.taxAmount, 0), baseCurrency)}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.reports.tax.overTime', 'Over time')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={taxLineData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="label" />
                          <YAxis tickFormatter={(v) => fmtMoney(Number(v), baseCurrency)} />
                          <Tooltip formatter={(v: number) => fmtMoney(v, baseCurrency)} />
                          <Line type="monotone" dataKey="tax" name={t('erp.common.tax', 'Tax')} stroke={CHART_COLORS[0]} strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              ) : null}

              {reportType === 'employee' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.employee.headcount', 'Headcount')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">{employeeAggregateQuery.data?.summary.totalEmployees ?? 0}</CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.employee.latestPayrollNet', 'Latest payroll net')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">
                        {employeeAggregateQuery.data?.summary.latestPayroll
                          ? fmtMoney(Number(employeeAggregateQuery.data.summary.latestPayroll.totalNet), baseCurrency)
                          : t('erp.common.notAvailable', '—')}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{t('erp.reports.employee.payrollStatus', 'Payroll status')}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-lg font-medium capitalize">
                        {employeeAggregateQuery.data?.summary.latestPayroll?.status
                          ? t(`erp.payroll.status.${employeeAggregateQuery.data.summary.latestPayroll.status}`, employeeAggregateQuery.data.summary.latestPayroll.status)
                          : t('erp.common.notAvailable', '—')}
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.reports.employee.byDepartment', 'By department')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={(employeeAggregateQuery.data?.summary.byDepartment ?? []).map((d) => ({
                              name: d.departmentName,
                              value: d.headcount,
                            }))}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label
                          >
                            {(employeeAggregateQuery.data?.summary.byDepartment ?? []).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              ) : null}

              {reportType === 'restaurant' && canRestaurantReport ? (
                <div className="space-y-6">
                  {canRestaurantSalesReport ? (
                  <>
                  <Card>
                    <CardHeader><CardTitle>Order mix report</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service type</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(restaurantOrderMixQuery.data ?? []).map((row) => (
                            <TableRow key={row.serviceType}>
                              <TableCell>{row.serviceType}</TableCell>
                              <TableCell className="text-right">{row.count}</TableCell>
                              <TableCell className="text-right">{fmtMoney(row.revenue, baseCurrency)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Ticket throughput report</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead className="text-right">Tickets completed</TableHead>
                            <TableHead className="text-right">Avg minutes to ready</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(restaurantTicketThroughputQuery.data ?? []).map((row) => (
                            <TableRow key={row.periodStart}>
                              <TableCell>{row.periodStart}</TableCell>
                              <TableCell className="text-right">{row.ticketsCompleted}</TableCell>
                              <TableCell className="text-right">{row.avgMinutesToReady.toFixed(1)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Reservation load report</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Booked</TableHead>
                            <TableHead className="text-right">Seated</TableHead>
                            <TableHead className="text-right">No-show</TableHead>
                            <TableHead className="text-right">Cancelled</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(restaurantReservationLoadQuery.data ?? []).map((row) => (
                            <TableRow key={row.date}>
                              <TableCell>{row.date}</TableCell>
                              <TableCell className="text-right">{row.booked}</TableCell>
                              <TableCell className="text-right">{row.seated}</TableCell>
                              <TableCell className="text-right">{row.noShow}</TableCell>
                              <TableCell className="text-right">{row.cancelled}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  </>
                  ) : null}
                  {canInventoryReport ? (
                  <Card>
                    <CardHeader><CardTitle>Ingredient risk report</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ingredient</TableHead>
                            <TableHead className="text-right">Current qty</TableHead>
                            <TableHead className="text-right">Reorder point</TableHead>
                            <TableHead>Risk level</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(restaurantIngredientRiskQuery.data ?? []).map((row) => (
                            <TableRow key={row.productId}>
                              <TableCell>{row.productName}</TableCell>
                              <TableCell className="text-right">{row.currentQty}</TableCell>
                              <TableCell className="text-right">{row.reorderPoint}</TableCell>
                              <TableCell>
                                <Badge variant={row.riskLevel === 'critical' ? 'destructive' : row.riskLevel === 'low' ? 'secondary' : 'outline'}>
                                  {row.riskLevel}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  ) : null}
                </div>
              ) : null}

              {reportType !== 'restaurant' ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t('erp.reports.data.title', 'Data')}</CardTitle>
                  <div className="flex gap-2">
                    <Button data-tour="pages-erp-reports.button.erp.common.previous"
                      variant="outline"
                      size="sm"
                      disabled={tablePage <= 0}
                      onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                    >
                      {t('erp.common.previous', 'Previous')}
                    </Button>
                    <Button data-tour="pages-erp-reports.button.erp.common.next"
                      variant="outline"
                      size="sm"
                      disabled={(tablePage + 1) * pageSize >= totalActiveRows}
                      onClick={() => setTablePage((p) => p + 1)}
                    >
                      {t('erp.common.next', 'Next')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {tableLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : (
                    <Table data-tour="pages-erp-reports.table.erp.reports.common.customer">
                      <TableHeader>
                        {reportType === 'sales' ? (
                          <TableRow>
                            <TableHead>{salesGroupBy === 'customer' ? t('erp.reports.common.customer', 'Customer') : salesGroupBy === 'period' ? t('erp.reports.common.period', 'Period') : t('erp.reports.common.product', 'Product')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.quantityShort', 'Qty')}</TableHead>
                            <TableHead className="text-right">{t('erp.reports.sales.totalRevenue', 'Total revenue')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.tax', 'Tax')}</TableHead>
                          </TableRow>
                        ) : null}
                        {reportType === 'inventory' ? (
                          <TableRow>
                            <TableHead>{t('erp.reports.common.product', 'Product')}</TableHead>
                            <TableHead>{t('erp.common.sku', 'SKU')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.quantityShort', 'Qty')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.cost', 'Cost')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.value', 'Value')}</TableHead>
                          </TableRow>
                        ) : null}
                        {reportType === 'purchases' ? (
                          <TableRow>
                            <TableHead>{t('erp.common.supplier', 'Supplier')}</TableHead>
                            <TableHead className="text-right">{t('erp.reports.purchases.orders', 'Orders')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                            <TableHead className="text-right">{t('erp.reports.purchases.received', 'Received')}</TableHead>
                          </TableRow>
                        ) : null}
                        {reportType === 'pl' && canPl ? (
                          <TableRow>
                            <TableHead>{t('erp.reports.pl.section', 'Section')}</TableHead>
                            <TableHead>{t('erp.reports.pl.account', 'Account')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.amount', 'Amount')}</TableHead>
                          </TableRow>
                        ) : null}
                        {reportType === 'tax' ? (
                          <TableRow>
                            <TableHead>{t('erp.common.period', 'Period')}</TableHead>
                            <TableHead>{t('erp.common.type', 'Type')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.tax', 'Tax')}</TableHead>
                          </TableRow>
                        ) : null}
                        {reportType === 'employee' ? (
                          <TableRow>
                            <TableHead>{t('erp.common.department', 'Department')}</TableHead>
                            <TableHead className="text-right">{t('erp.reports.employee.headcount', 'Headcount')}</TableHead>
                          </TableRow>
                        ) : null}
                      </TableHeader>
                      <TableBody>
                        {reportType === 'sales'
                          ? (pagedRows as SalesReportRow[]).map((r) => (
                              <TableRow key={r.key}>
                                <TableCell>{r.label}</TableCell>
                                <TableCell className="text-right">{r.quantity}</TableCell>
                                <TableCell className="text-right">{fmtMoney(r.revenue, baseCurrency)}</TableCell>
                                <TableCell className="text-right">{fmtMoney(r.tax, baseCurrency)}</TableCell>
                              </TableRow>
                            ))
                          : null}
                        {reportType === 'inventory'
                          ? (pagedRows as InventoryValuationRow[]).map((r) => (
                              <TableRow key={r.productId}>
                                <TableCell>{r.productName}</TableCell>
                                <TableCell>{r.sku ?? t('erp.common.notAvailable', '—')}</TableCell>
                                <TableCell className="text-right">{r.quantity}</TableCell>
                                <TableCell className="text-right">{fmtMoney(r.unitCost, baseCurrency)}</TableCell>
                                <TableCell className="text-right">{fmtMoney(r.totalValue, baseCurrency)}</TableCell>
                              </TableRow>
                            ))
                          : null}
                        {reportType === 'purchases'
                          ? (pagedRows as PurchaseReportRow[]).map((r, i) => (
                              <TableRow key={`${r.supplierName}-${i}`}>
                                <TableCell>{r.supplierName}</TableCell>
                                <TableCell className="text-right">{r.orderCount}</TableCell>
                                <TableCell className="text-right">{fmtMoney(r.totalAmount, baseCurrency)}</TableCell>
                                <TableCell className="text-right">{fmtMoney(r.receivedAmount, baseCurrency)}</TableCell>
                              </TableRow>
                            ))
                          : null}
                        {reportType === 'pl' && canPl
                          ? (pagedRows as typeof plTableRows).map((r) => (
                              <TableRow key={`${r.section}-${r.accountCode}`}>
                                <TableCell>{r.section}</TableCell>
                                <TableCell>
                                  {r.accountCode} {r.accountName}
                                </TableCell>
                                <TableCell className="text-right">{fmtMoney(r.amount, baseCurrency)}</TableCell>
                              </TableRow>
                            ))
                          : null}
                        {reportType === 'tax'
                          ? (pagedRows as TaxCollectedRow[]).map((r, i) => (
                              <TableRow key={`${r.period}-${r.invoiceType}-${i}`}>
                                <TableCell>{r.period}</TableCell>
                                <TableCell className="capitalize">
                                  {t(`erp.reports.invoiceType.${r.invoiceType}`, r.invoiceType.replace(/_/g, ' '))}
                                </TableCell>
                                <TableCell className="text-right">{fmtMoney(r.taxAmount, baseCurrency)}</TableCell>
                              </TableRow>
                            ))
                          : null}
                        {reportType === 'employee'
                          ? (pagedRows as EmployeeSummary['byDepartment']).map((r, i) => (
                              <TableRow key={`${r.departmentName}-${i}`}>
                                <TableCell>{r.departmentName}</TableCell>
                                <TableCell className="text-right">{r.headcount}</TableCell>
                              </TableRow>
                            ))
                          : null}
                        {!tableLoading && pagedRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={tableColumnCount}
                              className={cn(
                                'py-8 text-center',
                                tableError ? 'text-destructive' : 'text-muted-foreground',
                              )}
                            >
                              {tableError
                                ? (tableError as Error).message || t('erp.reports.data.loadFailed', 'Failed to load table data.')
                                : t('erp.reports.data.empty', 'No data available for the selected filters.')}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
