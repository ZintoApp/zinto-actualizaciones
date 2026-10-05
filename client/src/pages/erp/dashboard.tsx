import Header from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useErpBusinessType } from "@/hooks/use-erp-business-type";
import { usePermissions, type Permission } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  endOfDay,
  format,
  isAfter,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  differenceInDays,
} from "date-fns";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Package,
  Sparkles,
  Stethoscope,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "wouter";
import { useTranslation } from "@/hooks/use-translation";

type DatePreset =
  "today" | "thisWeek" | "thisMonth" | "thisQuarter" | "thisYear" | "custom";
type DateRange = { from: Date; to: Date };
type Kpis = {
  revenueLast30Days: number;
  pendingOrders: number;
  lowStockCount: number;
  overdueInvoices: number;
  openAr: number;
  openAp: number;
  activeKitchenTickets?: number;
  pendingDeliveries?: number;
};
type ActivityRow = {
  activityType: string;
  referenceId: number;
  title: string;
  createdAt: string;
};

const colors = ["#61d9a5", "#6ea8fe", "#f6b86a", "#c2a4ff", "#f37f9a"];
const chartGridStroke = "hsl(var(--border))";
const chartAxisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const chartTooltipStyle = {
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  boxShadow: "0 10px 30px hsl(var(--background) / 0.28)",
};
const chartTooltipLabelStyle = { color: "hsl(var(--card-foreground))" };
const chartTooltipItemStyle = { color: "hsl(var(--card-foreground))" };
const presets: Record<DatePreset, string> = {
  today: "Today",
  thisWeek: "This week",
  thisMonth: "This month",
  thisQuarter: "This quarter",
  thisYear: "This year",
  custom: "Custom range",
};

function rangeFor(preset: DatePreset): DateRange {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now };
  if (preset === "thisWeek")
    return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
  if (preset === "thisQuarter") return { from: startOfQuarter(now), to: now };
  if (preset === "thisYear") return { from: startOfYear(now), to: now };
  if (preset === "custom") return { from: subDays(now, 30), to: now };
  return { from: startOfMonth(now), to: now };
}

function periodFor(range: DateRange): "daily" | "weekly" | "monthly" {
  const days = differenceInDays(range.to, range.from) + 1;
  return days <= 14 ? "daily" : days <= 90 ? "weekly" : "monthly";
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
}

function arrayData<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 text-center text-sm text-muted-foreground">
      <Activity className="h-5 w-5 opacity-50" />
      <span>
        {label ?? t("erp.dashboard.empty.period", "No data for this period")}
      </span>
    </div>
  );
}

function ChartFrame({
  loading,
  empty,
  children,
}: {
  loading?: boolean;
  empty?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (loading)
    return (
      <div className="flex h-full min-h-[220px] animate-pulse items-center justify-center rounded-xl bg-muted/20 text-xs text-muted-foreground">
        {t("erp.dashboard.loading.analytics", "Loading analytics…")}
      </div>
    );
  if (empty) return <EmptyState />;
  return <div className="h-[250px] w-full">{children}</div>;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Activity;
  tone?: "default" | "warning" | "success";
  href: string;
}) {
  return (
    <Card className="group relative overflow-hidden border-border/60 bg-card/80 shadow-none transition-colors hover:border-primary/40">
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          tone === "warning"
            ? "bg-amber-400"
            : tone === "success"
              ? "bg-emerald-400"
              : "bg-primary",
        )}
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
          <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {hint}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function DashboardCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/60 bg-card/80 shadow-none", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function ERPDashboardPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { hasPermission, hasAnyPermission, PERMISSIONS } = usePermissions();
  const { isRestaurant, isDental } = useErpBusinessType();
  const { t } = useTranslation();
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [range, setRange] = useState<DateRange>(() => rangeFor("thisMonth"));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const date = useMemo(
    () => ({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      period: periodFor(range),
    }),
    [range],
  );

  const salesPerms: Permission[] = [
    PERMISSIONS.VIEW_SALES_ORDERS,
    PERMISSIONS.MANAGE_SALES_ORDERS,
    PERMISSIONS.CREATE_QUOTATIONS,
  ];
  const invoicePerms: Permission[] = [
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.RECORD_PAYMENTS,
  ];
  const inventoryPerms: Permission[] = [
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.MANAGE_INVENTORY,
  ];
  const accountingPerms: Permission[] = [
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
  ];
  const dashboard = hasPermission(PERMISSIONS.VIEW_ERP_DASHBOARD);
  const canSales = dashboard || hasAnyPermission(salesPerms);
  const canInvoices = dashboard || hasAnyPermission(invoicePerms);
  const canInventory = dashboard || hasAnyPermission(inventoryPerms);
  const canAccounting = dashboard || hasAnyPermission(accountingPerms);
  const canAnalytics =
    dashboard || hasAnyPermission([...salesPerms, ...invoicePerms]);
  const canActivity =
    dashboard ||
    hasAnyPermission([
      ...salesPerms,
      ...invoicePerms,
      ...inventoryPerms,
      ...accountingPerms,
    ]);

  const json = async (url: string) =>
    await (await apiRequest("GET", url)).json();
  const kpisQuery = useQuery({
    queryKey: ["/api/erp/dashboard/kpis", companyId, date.from, date.to],
    queryFn: async () => {
      const data = await json(
        `/api/erp/dashboard/kpis?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
      );
      return {
        kpis: data.data as Kpis,
        currency: String(data.baseCurrency ?? "USD"),
      };
    },
    enabled:
      !!companyId && (canSales || canInvoices || canInventory || canAccounting),
  });
  const revenueQuery = useQuery({
    queryKey: [
      "/api/erp/dashboard/revenue-summary",
      companyId,
      date.period,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/revenue-summary?period=${date.period}&dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && canInvoices,
  });
  const pipelineQuery = useQuery({
    queryKey: ["/api/erp/dashboard/order-pipeline", companyId],
    queryFn: async () =>
      (await json("/api/erp/dashboard/order-pipeline")).data ?? [],
    enabled: !!companyId && canSales,
  });
  const categoryQuery = useQuery({
    queryKey: [
      "/api/erp/dashboard/revenue-by-category",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/revenue-by-category?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && canAnalytics,
  });
  const topProductsQuery = useQuery({
    queryKey: [
      "/api/erp/dashboard/top-products",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/top-products?limit=6&dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && canAnalytics,
  });
  const activitiesQuery = useQuery({
    queryKey: ["/api/erp/dashboard/recent-activities", companyId],
    queryFn: async () =>
      (await json("/api/erp/dashboard/recent-activities?limit=8")).data ?? [],
    enabled: !!companyId && canActivity,
  });

  const restaurantQuery = (path: string, key: string, enabled: boolean) =>
    useQuery({
      queryKey: [path, companyId, key, date.period, date.from, date.to],
      queryFn: async () =>
        (
          await json(
            `${path}?${path.includes("ticket-throughput") ? `period=${date.period}&` : ""}dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
          )
        ).data ?? [],
      enabled: !!companyId && isRestaurant && enabled,
    });
  const orderMix = restaurantQuery(
    "/api/erp/dashboard/restaurant/order-mix",
    "mix",
    canSales,
  );
  const ticketThroughput = restaurantQuery(
    "/api/erp/dashboard/restaurant/ticket-throughput",
    "tickets",
    canSales,
  );
  const reservationLoad = restaurantQuery(
    "/api/erp/dashboard/restaurant/reservation-load",
    "reservations",
    canSales,
  );
  const ingredientRisk = useQuery({
    queryKey: ["/api/erp/dashboard/restaurant/ingredient-risk", companyId],
    queryFn: async () =>
      (await json("/api/erp/dashboard/restaurant/ingredient-risk")).data ?? [],
    enabled: !!companyId && isRestaurant && canInventory,
  });

  const dentalScheduleAccess = hasAnyPermission([
    PERMISSIONS.VIEW_DENTAL_SCHEDULE,
    PERMISSIONS.MANAGE_DENTAL_SCHEDULE,
  ]);
  const dentalPatientAccess = hasAnyPermission([
    PERMISSIONS.VIEW_DENTAL_PATIENTS,
    PERMISSIONS.MANAGE_DENTAL_PATIENTS,
  ]);
  const dentalPlanAccess = hasAnyPermission([
    PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS,
    PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS,
  ]);
  const dentalPatients = useQuery({
    queryKey: [
      "/api/erp/dashboard/dental/patients",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/dental/patients?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && isDental && dentalPatientAccess,
  });
  const dentalSchedule = useQuery({
    queryKey: [
      "/api/erp/dashboard/dental/schedule",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/dental/schedule?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && isDental && dentalScheduleAccess,
  });
  const dentalPlans = useQuery({
    queryKey: [
      "/api/erp/dashboard/dental/treatment-plans",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/dental/treatment-plans?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && isDental && dentalPlanAccess,
  });
  const dentalToday = useQuery({
    queryKey: ["/api/erp/dashboard/dental/appointments-today", companyId],
    queryFn: async () => {
      const data = (await json("/api/erp/dashboard/dental/appointments-today")).data;
      return {
        total: Number(data?.total ?? 0),
        byStatus: arrayData<{ status: string; count: number }>(data?.byStatus),
      };
    },
    enabled: !!companyId && isDental && dentalScheduleAccess,
  });
  const dentalProviders = useQuery({
    queryKey: [
      "/api/erp/dashboard/dental/provider-performance",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/dental/provider-performance?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && isDental && dentalScheduleAccess,
  });
  const dentalProcedures = useQuery({
    queryKey: [
      "/api/erp/dashboard/dental/procedure-revenue",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () =>
      (
        await json(
          `/api/erp/dashboard/dental/procedure-revenue?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
        )
      ).data ?? [],
    enabled: !!companyId && isDental && dentalPlanAccess && canInvoices,
  });
  const dentalFollowUps = useQuery({
    queryKey: [
      "/api/erp/dashboard/dental/follow-ups",
      companyId,
      date.from,
      date.to,
    ],
    queryFn: async () => {
      const data = (await json(
        `/api/erp/dashboard/dental/follow-ups?dateFrom=${encodeURIComponent(date.from)}&dateTo=${encodeURIComponent(date.to)}`,
      )).data;
      return { recallsDue: Number(data?.recallsDue ?? 0), noShows: Number(data?.noShows ?? 0) };
    },
    enabled: !!companyId && isDental && dentalScheduleAccess,
  });

  const currency = kpisQuery.data?.currency ?? "USD";
  const kpis = kpisQuery.data?.kpis;
  const revenue = useMemo(
    () =>
      arrayData<{ periodStart: string; revenue: number }>(revenueQuery.data).map(
        (row) => ({
          label: format(
            new Date(row.periodStart),
            date.period === "monthly" ? "MMM yy" : "MMM d",
          ),
          value: row.revenue,
        }),
      ),
    [revenueQuery.data, date.period],
  );
  const category = useMemo(
    () =>
      arrayData<{ categoryName: string; revenue: number }>(categoryQuery.data)
        .slice(0, 6)
        .map((row) => ({
          name:
            row.categoryName.length > 16
              ? `${row.categoryName.slice(0, 16)}…`
              : row.categoryName,
          value: row.revenue,
        })),
    [categoryQuery.data],
  );
  const topProducts = arrayData<{ productName: string; quantitySold: number }>(topProductsQuery.data);
  const activities = arrayData<ActivityRow>(activitiesQuery.data);
  const dentalPatientsData = arrayData<{ newPatients?: number }>(dentalPatients.data);
  const dentalPlansData = arrayData<{ count?: number }>(dentalPlans.data);
  const handlePreset = (value: string) => {
    const next = value as DatePreset;
    setPreset(next);
    if (next !== "custom") {
      setRange(rangeFor(next));
      setRangeError(null);
    }
  };
  const handleDate = (next?: { from?: Date; to?: Date }) => {
    if (!next?.from || !next.to) return;
    const to = endOfDay(next.to);
    if (
      isAfter(next.from, to) ||
      isAfter(next.from, new Date()) ||
      differenceInDays(to, next.from) > 365
    ) {
      setRangeError(t("erp.dashboard.errors.invalidRange", "Choose a valid range of up to 365 days."));
      return;
    }
    setRange({ from: next.from, to });
    setPreset("custom");
    setRangeError(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] space-y-8 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col justify-between gap-5 border-b border-border/60 pb-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px] shadow-primary" />
                {t("erp.dashboard.workspaceOverview", "Workspace overview")}
              </div>
              <h1 data-tour="pages-erp-dashboard.h1.erp.dashboard.title" className="text-2xl">
                {t("erp.dashboard.title", "ERP Dashboard")}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {isRestaurant
                  ? t(
                      "erp.dashboard.subtitle.restaurant",
                      "A live view of your floor, kitchen, and commercial performance.",
                    )
                  : isDental
                    ? t(
                        "erp.dashboard.subtitle.dental",
                        "A calm, focused view of your practice operations.",
                      )
                    : t(
                        "erp.dashboard.subtitle",
                        "A clear view of revenue, orders, and inventory performance.",
                      )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={preset} onValueChange={handlePreset}>
                <SelectTrigger data-tour="erp-dashboard-period" className="h-9 w-[145px] border-border/70 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(presets).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {t(`erp.dashboard.period.${key}`, label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-border/70 bg-card"
                  >
                    <CalendarDays className="mr-2 h-4 w-4 text-primary" />
                    {format(range.from, "MMM d")} –{" "}
                    {format(range.to, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={handleDate}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {rangeError && (
            <p className="-mt-5 text-xs text-destructive">{rangeError}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canInvoices && (
              <KpiCard
                label={t("erp.dashboard.kpi.revenue30d", "Revenue")}
                value={money(kpis?.revenueLast30Days ?? 0, currency)}
                hint={t("erp.common.view", "View invoices")}
                icon={CircleDollarSign}
                href="/erp/invoices"
              />
            )}
            {canSales && (
              <KpiCard
                label={t("erp.dashboard.kpi.pendingOrders", "Pending orders")}
                value={kpis?.pendingOrders ?? 0}
                hint={t("erp.salesOrders.title", "Review sales orders")}
                icon={Clock3}
                href="/erp/sales-orders"
              />
            )}
            {canInventory && (
              <KpiCard
                label={t("erp.dashboard.kpi.lowStock", "Inventory alerts")}
                value={kpis?.lowStockCount ?? 0}
                hint={t("erp.inventory.title", "Open inventory")}
                icon={Package}
                tone={(kpis?.lowStockCount ?? 0) > 0 ? "warning" : "success"}
                href="/erp/inventory"
              />
            )}
            {canInvoices && (
              <KpiCard
                label={t(
                  "erp.dashboard.kpi.overdueInvoices",
                  "Overdue invoices",
                )}
                value={kpis?.overdueInvoices ?? 0}
                hint={t("erp.common.view", "Resolve receivables")}
                icon={AlertTriangle}
                tone={(kpis?.overdueInvoices ?? 0) > 0 ? "warning" : "success"}
                href="/erp/invoices"
              />
            )}
          </div>
          <section className="space-y-4">
            <SectionHeading
              eyebrow={t("erp.dashboard.performance.eyebrow", "Performance")}
              title={t("erp.dashboard.performance.title", "The numbers that move your day")}
              description={t("erp.dashboard.performance.description", "Trends use the selected date range.")}
              action={
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {t("erp.dashboard.performance.updated", "Updated just now")}
                </span>
              }
            />
            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              {canInvoices && (
                <DashboardCard
                  title={t("erp.dashboard.cards.revenueTrend.title", "Revenue trend")}
                  description={t("erp.dashboard.cards.revenueTrend.description", "Collected sales over time")}
                >
                  <ChartFrame
                    loading={revenueQuery.isLoading}
                    empty={!revenueQuery.isLoading && !revenue.length}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={revenue}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke={chartGridStroke}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="label"
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                          tickFormatter={(v) => money(Number(v), currency)}
                        />
                        <Tooltip
                          formatter={(v: number) => money(v, currency)}
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          name={t("erp.dashboard.legend.revenue", "Revenue")}
                          stroke={colors[0]}
                          strokeWidth={3}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
              )}
              {canSales && (
                <DashboardCard
                  title={t("erp.dashboard.cards.orderPipeline.title", "Order pipeline")}
                  description={t("erp.dashboard.cards.orderPipeline.description", "Orders by current status")}
                >
                  <ChartFrame
                    loading={pipelineQuery.isLoading}
                    empty={
                      !pipelineQuery.isLoading && !pipelineQuery.data?.length
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pipelineQuery.data}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke={chartGridStroke}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="status"
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Bar
                          dataKey="count"
                          name={t("erp.dashboard.legend.orders", "Orders")}
                          fill={colors[1]}
                          radius={[5, 5, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
              )}
            </div>
          </section>
          {canAnalytics && (
            <section className="space-y-4">
              <SectionHeading
                eyebrow={t("erp.dashboard.mix.eyebrow", "Mix & focus")}
                title={t("erp.dashboard.mix.title", "Where attention is going")}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <DashboardCard
                  title={t("erp.dashboard.cards.revenueCategory.title", "Revenue by category")}
                  description={t("erp.dashboard.cards.revenueCategory.description", "Realized sales in the selected range")}
                >
                  <ChartFrame
                    loading={categoryQuery.isLoading}
                    empty={!categoryQuery.isLoading && !category.length}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={category}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={3}
                        >
                          {category.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={colors[index % colors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => money(v, currency)}
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
                <DashboardCard
                  title={t("erp.dashboard.cards.topProducts.title", "Top products")}
                  description={t("erp.dashboard.cards.topProducts.description", "Best-selling products")}
                >
                  <div className="space-y-3">
                    {topProductsQuery.isLoading ? (
                      <div className="h-[220px] animate-pulse rounded-xl bg-muted/20" />
                    ) : topProducts.length ? (
                      topProducts.map((item, index) => (
                        <div
                          key={item.productName}
                          className="flex items-center gap-3"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="truncate">
                                {item.productName}
                              </span>
                              <span className="font-medium">
                                {item.quantitySold}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${Math.min(100, (item.quantitySold / Math.max(1, topProducts[0]?.quantitySold ?? 1)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState label={t("erp.dashboard.empty.productSales", "No product sales yet")} />
                    )}
                  </div>
                </DashboardCard>
              </div>
            </section>
          )}
          {canAccounting && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-border/60 bg-gradient-to-br from-primary/10 via-card to-card shadow-none">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("erp.dashboard.accounting.openReceivables", "Open receivables")}
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {money(kpis?.openAr ?? 0, currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("erp.dashboard.accounting.accountsReceivable", "Accounts receivable")}
                    </p>
                  </div>
                  <CircleDollarSign className="h-8 w-8 text-primary/60" />
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-gradient-to-br from-violet-500/10 via-card to-card shadow-none">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("erp.dashboard.accounting.openPayables", "Open payables")}
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {money(kpis?.openAp ?? 0, currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("erp.dashboard.accounting.accountsPayable", "Accounts payable")}
                    </p>
                  </div>
                  <ArrowUpRight className="h-8 w-8 text-violet-400/70" />
                </CardContent>
              </Card>
            </div>
          )}
          {canActivity && (
            <section className="space-y-4">
              <SectionHeading
                eyebrow={t("erp.dashboard.activity.eyebrow", "Pulse")}
                title={t("erp.dashboard.activity.title", "Recent activity")}
                action={
                  <Link
                    href="/erp/reports"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t("erp.dashboard.activity.allReports", "All reports")} <ChevronRight className="h-3 w-3" />
                  </Link>
                }
              />
              <Card className="border-border/60 bg-card/80 shadow-none">
                <Table data-tour="pages-erp-dashboard.table.erp.dashboard.table.activity">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("erp.dashboard.table.activity", "Activity")}</TableHead>
                      <TableHead>{t("erp.dashboard.table.reference", "Reference")}</TableHead>
                      <TableHead className="text-right">{t("erp.dashboard.table.when", "When")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activitiesQuery.isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          {t("erp.dashboard.loading.activity", "Loading activity…")}
                        </TableCell>
                      </TableRow>
                    ) : activities.length ? (
                      activities.map((row) => (
                        <TableRow
                          key={`${row.activityType}-${row.referenceId}-${row.createdAt}`}
                        >
                          <TableCell className="capitalize">
                            {row.activityType.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={
                                row.activityType === "stock_movement"
                                  ? "/erp/inventory"
                                  : row.activityType === "invoice"
                                    ? "/erp/invoices"
                                    : "/erp/sales-orders"
                              }
                              className="font-medium text-primary hover:underline"
                            >
                              {row.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {format(new Date(row.createdAt), "PPp")}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <EmptyState label={t("erp.dashboard.empty.activity", "No recent activity")} />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}
          {isRestaurant && (
            <section className="space-y-4 rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-400/[0.08] via-card to-card p-4 sm:p-6">
              <SectionHeading
                eyebrow={t("erp.dashboard.restaurant.eyebrow", "Restaurant mode")}
                title={t("erp.dashboard.restaurant.title", "Service at a glance")}
                description={t("erp.dashboard.restaurant.description", "Keep the floor, kitchen, and reservations moving together.")}
                action={<UtensilsCrossed className="h-6 w-6 text-amber-400" />}
              />
              {canSales ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  <DashboardCard
                    title={t("erp.dashboard.restaurant.orderMix.title", "Order mix")}
                    description={t("erp.dashboard.restaurant.orderMix.description", "Orders by service type")}
                  >
                    <ChartFrame
                      loading={orderMix.isLoading}
                      empty={!orderMix.isLoading && !orderMix.data?.length}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={orderMix.data}
                          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke={chartGridStroke}
                            strokeDasharray="3 5"
                          />
                          <XAxis
                            dataKey="serviceType"
                            axisLine={false}
                            tickLine={false}
                            tick={chartAxisTick}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={chartAxisTick}
                          />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            labelStyle={chartTooltipLabelStyle}
                            itemStyle={chartTooltipItemStyle}
                          />
                          <Bar
                            dataKey="count"
                            fill="#f6b86a"
                            radius={[5, 5, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartFrame>
                  </DashboardCard>
                  <DashboardCard
                    title={t("erp.dashboard.restaurant.kitchen.title", "Kitchen throughput")}
                    description={t("erp.dashboard.restaurant.kitchen.description", "Completed tickets")}
                  >
                    <ChartFrame
                      loading={ticketThroughput.isLoading}
                      empty={
                        !ticketThroughput.isLoading &&
                        !ticketThroughput.data?.length
                      }
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={(ticketThroughput.data ?? []).map(
                            (row: {
                              periodStart: string;
                              ticketsCompleted: number;
                            }) => ({
                              ...row,
                              label: format(new Date(row.periodStart), "MMM d"),
                            }),
                          )}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke={chartGridStroke}
                            strokeDasharray="3 5"
                          />
                          <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={chartAxisTick}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={chartAxisTick}
                          />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            labelStyle={chartTooltipLabelStyle}
                            itemStyle={chartTooltipItemStyle}
                          />
                          <Line
                            type="monotone"
                            dataKey="ticketsCompleted"
                            stroke="#61d9a5"
                            strokeWidth={3}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartFrame>
                  </DashboardCard>
                  <DashboardCard
                    title={t("erp.dashboard.restaurant.reservations.title", "Reservation load")}
                    description={t("erp.dashboard.restaurant.reservations.description", "Booked, seated, and exceptions")}
                  >
                    <ChartFrame
                      loading={reservationLoad.isLoading}
                      empty={
                        !reservationLoad.isLoading &&
                        !reservationLoad.data?.length
                      }
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(reservationLoad.data ?? []).map(
                            (row: {
                              date: string;
                              booked: number;
                              seated: number;
                              noShow: number;
                            }) => ({
                              ...row,
                              label: format(new Date(row.date), "MMM d"),
                            }),
                          )}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke={chartGridStroke}
                            strokeDasharray="3 5"
                          />
                          <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={chartAxisTick}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={chartAxisTick}
                          />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            labelStyle={chartTooltipLabelStyle}
                            itemStyle={chartTooltipItemStyle}
                          />
                          <Bar dataKey="booked" stackId="a" fill="#6ea8fe" />
                          <Bar dataKey="seated" stackId="a" fill="#61d9a5" />
                          <Bar dataKey="noShow" stackId="a" fill="#f37f9a" />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartFrame>
                  </DashboardCard>
                </div>
              ) : (
                <EmptyState label={t("erp.dashboard.restaurant.salesAccess", "Restaurant analytics require sales-order access")} />
              )}
              {canInventory && (
                <div className="mt-4">
                  <DashboardCard
                    title={t("erp.dashboard.restaurant.ingredients.title", "Ingredient risk")}
                    description={t("erp.dashboard.restaurant.ingredients.description", "Items at or below reorder point")}
                  >
                    {ingredientRisk.isLoading ? (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("erp.dashboard.loading.ingredients", "Loading ingredient risk…")}>
                        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-muted/20" />)}
                      </div>
                    ) : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {(ingredientRisk.data ?? [])
                        .slice(0, 8)
                        .map(
                          (item: {
                            productId: number;
                            productName: string;
                            currentQty: number;
                            reorderPoint: number;
                            riskLevel: string;
                          }) => (
                            <div
                              key={item.productId}
                              className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm"
                            >
                              <span className="truncate">
                                {item.productName}
                              </span>
                              <Badge
                                variant={
                                  item.riskLevel === "critical"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {item.currentQty}/{item.reorderPoint}
                              </Badge>
                            </div>
                          ),
                        )}
                      {!ingredientRisk.isLoading &&
                        !ingredientRisk.data?.length && (
                          <EmptyState label={t("erp.dashboard.restaurant.ingredients.empty", "Ingredients are in good shape")} />
                        )}
                    </div>}
                  </DashboardCard>
                </div>
              )}
            </section>
          )}
          {isDental && (
            <section className="space-y-4 rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-400/[0.08] via-card to-card p-4 sm:p-6">
              <SectionHeading
                eyebrow={t("erp.dashboard.dental.eyebrow", "Dental mode")}
                title={t("erp.dashboard.dental.title", "Practice workspace")}
                description={t(
                  "erp.dashboard.dental.description",
                  "Appointments, patients, treatment plans, and clinical revenue.",
                )}
                action={<Stethoscope className="h-6 w-6 text-sky-400" />}
              />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {dentalScheduleAccess && (
                  <KpiCard
                    label={t(
                      "erp.dashboard.dental.todayAppointments",
                      "Today's appointments",
                    )}
                    value={dentalToday.data?.total ?? 0}
                    hint={t("erp.dental.schedule.menuLabel", "Open schedule")}
                    icon={CalendarDays}
                    href="/erp/dental/schedule"
                  />
                )}
                {dentalPatientAccess && (
                  <KpiCard
                    label={t(
                      "erp.dashboard.dental.newPatients",
                      "New patients",
                    )}
                    value={dentalPatientsData.reduce(
                      (sum, row) => sum + Number(row.newPatients ?? 0),
                      0,
                    )}
                    hint={t("erp.dental.patients.menuLabel", "Open patients")}
                    icon={Users}
                    href="/erp/dental/patients"
                  />
                )}
                {dentalPlanAccess && (
                  <KpiCard
                    label={t(
                      "erp.dashboard.dental.treatmentPlans",
                      "Treatment plans",
                    )}
                    value={dentalPlansData.reduce(
                      (sum, row) => sum + Number(row.count ?? 0),
                      0,
                    )}
                    hint={t(
                      "erp.dental.treatmentPlans.menuLabel",
                      "Open treatment plans",
                    )}
                    icon={Sparkles}
                    href="/erp/dental/treatment-plans"
                  />
                )}
                {dentalScheduleAccess && (
                  <KpiCard
                    label={t("erp.dashboard.dental.followUps", "Follow-ups")}
                    value={
                      (dentalFollowUps.data?.recallsDue ?? 0) +
                      (dentalFollowUps.data?.noShows ?? 0)
                    }
                    hint={t("erp.dental.schedule.menuLabel", "Open schedule")}
                    icon={Clock3}
                    href="/erp/dental/schedule"
                  />
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <DashboardCard
                  title={t(
                    "erp.dashboard.dental.status.title",
                    "Appointment status",
                  )}
                  description={t(
                    "erp.dashboard.dental.status.description",
                    "Today by appointment status",
                  )}
                >
                  <ChartFrame
                    loading={dentalToday.isLoading}
                    empty={
                      !dentalToday.isLoading &&
                      !dentalToday.data?.byStatus.length
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dentalToday.data?.byStatus ?? []}>
                        <CartesianGrid
                          vertical={false}
                          stroke={chartGridStroke}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="status"
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Bar
                          dataKey="count"
                          fill="#6ea8fe"
                          radius={[5, 5, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
                <DashboardCard
                  title={t(
                    "erp.dashboard.dental.providers.title",
                    "Provider performance",
                  )}
                  description={t(
                    "erp.dashboard.dental.providers.description",
                    "Appointments and completions in the selected range",
                  )}
                >
                  <ChartFrame
                    loading={dentalProviders.isLoading}
                    empty={
                      !dentalProviders.isLoading &&
                      !dentalProviders.data?.length
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(dentalProviders.data ?? []).slice(0, 8)}
                        layout="vertical"
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke={chartGridStroke}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          type="category"
                          dataKey="providerName"
                          width={100}
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Bar
                          dataKey="completed"
                          name={t(
                            "erp.dashboard.dental.providers.completed",
                            "Completed",
                          )}
                          fill="#61d9a5"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <DashboardCard
                  title={t(
                    "erp.dashboard.dental.procedures.title",
                    "Revenue by procedure",
                  )}
                  description={t(
                    "erp.dashboard.dental.procedures.description",
                    "Realized linked treatment revenue",
                  )}
                >
                  <ChartFrame
                    loading={dentalProcedures.isLoading}
                    empty={
                      !dentalProcedures.isLoading &&
                      !dentalProcedures.data?.length
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(dentalProcedures.data ?? []).slice(0, 8)}
                        layout="vertical"
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke={chartGridStroke}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => money(Number(v), currency)}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          type="category"
                          dataKey="procedure"
                          width={120}
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <Tooltip
                          formatter={(v: number) => money(v, currency)}
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Bar dataKey="revenue" fill="#c2a4ff" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
                <DashboardCard
                  title={t(
                    "erp.dashboard.dental.pipeline.title",
                    "Treatment pipeline",
                  )}
                  description={t(
                    "erp.dashboard.dental.pipeline.description",
                    "Plans grouped by current status",
                  )}
                >
                  <ChartFrame
                    loading={dentalPlans.isLoading}
                    empty={!dentalPlans.isLoading && !dentalPlans.data?.length}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dentalPlans.data ?? []}>
                        <CartesianGrid
                          vertical={false}
                          stroke={chartGridStroke}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="status"
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={chartAxisTick}
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          itemStyle={chartTooltipItemStyle}
                        />
                        <Bar
                          dataKey="count"
                          fill="#f6b86a"
                          radius={[5, 5, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                </DashboardCard>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
