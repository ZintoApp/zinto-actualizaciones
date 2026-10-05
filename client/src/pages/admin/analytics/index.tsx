import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Users,
  Building,
  Calendar,
  TrendingUp,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

interface AnalyticsData {
  totalUsers: number;
  totalCompanies: number;
  activeCompanies: number;
  totalConversations: number;
  totalMessages: number;
  totalContacts: number;
  userGrowth: { date: string; count: number }[];
  messagesByChannel: { channel: string; count: number }[];
  conversationsByCompany: { company: string; count: number }[];
  activeUsersByDay: { date: string; count: number }[];
}

const CHART_COLORS = [
  "hsl(239 84% 67%)",
  "hsl(160 84% 39%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(258 90% 66%)",
  "hsl(189 94% 43%)",
  "hsl(330 81% 60%)",
  "hsl(168 76% 42%)",
];

const userGrowthConfig: ChartConfig = {
  count: { label: "New Users", color: "hsl(239 84% 67%)" },
};

const activeUsersConfig: ChartConfig = {
  count: { label: "Active Users", color: "hsl(38 92% 50%)" },
};

const conversationsConfig: ChartConfig = {
  count: { label: "Conversations", color: "hsl(160 84% 39%)" },
};

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonthYear(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function hasData(arr?: any[]) {
  return (
    arr &&
    arr.length > 0 &&
    !(arr.length === 1 && (arr[0].count === 0 || arr[0].channel === "No Data" || arr[0].company === "No Data"))
  );
}

export default function AnalyticsPage() {
  const { user, isLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState("30days");
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
  } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics", timeRange],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/analytics?timeRange=${timeRange}`);
      if (!res.ok) throw new Error(`Failed to fetch analytics data: ${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: !!user?.isSuperAdmin,
    retry: 2,
  });

  const channelConfig: ChartConfig = {};
  if (analyticsData?.messagesByChannel) {
    analyticsData.messagesByChannel.forEach((item, i) => {
      channelConfig[item.channel] = {
        label: item.channel.charAt(0).toUpperCase() + item.channel.slice(1),
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) return null;

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl text-foreground">{t("admin.analytics.dashboard_title", "Analytics Dashboard")}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("admin.analytics.time_range", "Time Range:")}</span>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("admin.analytics.select_time_range", "Select time range")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">{t("admin.analytics.last_7_days", "Last 7 Days")}</SelectItem>
                <SelectItem value="30days">{t("admin.analytics.last_30_days", "Last 30 Days")}</SelectItem>
                <SelectItem value="90days">{t("admin.analytics.last_90_days", "Last 90 Days")}</SelectItem>
                <SelectItem value="year">{t("admin.analytics.last_year", "Last Year")}</SelectItem>
                <SelectItem value="all">{t("admin.analytics.all_time", "All Time")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoadingAnalytics ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : analyticsError ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-red-500 dark:text-red-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">{t("admin.analytics.error_loading", "Error Loading Analytics")}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-center max-w-md">
              {analyticsError instanceof Error ? analyticsError.message : t("admin.analytics.failed_load_data", "Failed to load analytics data")}
            </p>
            <Button onClick={() => window.location.reload()}>{t("admin.analytics.retry", "Retry")}</Button>
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("admin.analytics.total_users", "Total Users")}</CardTitle>
                  <div className="rounded-md bg-primary/10 p-2">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{analyticsData?.totalUsers || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {t("admin.analytics.users_last_period", "+{{count}} in the last period", {
                      count: analyticsData?.userGrowth?.[analyticsData.userGrowth.length - 1]?.count || 0,
                    })}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("admin.analytics.companies", "Companies")}</CardTitle>
                  <div className="rounded-md bg-emerald-500/10 p-2">
                    <Building className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{analyticsData?.totalCompanies || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("admin.analytics.active_companies", "{{count}} active companies", {
                      count: analyticsData?.activeCompanies || 0,
                    })}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("admin.analytics.messages", "Messages")}</CardTitle>
                  <div className="rounded-md bg-amber-500/10 p-2">
                    <InboxConversationIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{analyticsData?.totalMessages?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("admin.analytics.across_conversations", "Across {{count}} conversations", {
                      count: analyticsData?.totalConversations || 0,
                    })}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("admin.analytics.contacts", "Contacts")}</CardTitle>
                  <div className="rounded-md bg-violet-500/10 p-2">
                    <Calendar className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{analyticsData?.totalContacts?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.analytics.in_contact_database", "In contact database")}</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* User Growth */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle>{t("admin.analytics.user_growth", "User Growth")}</CardTitle>
                  <CardDescription>{t("admin.analytics.user_growth_desc", "New user registrations over time")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {hasData(analyticsData?.userGrowth) ? (
                    <ChartContainer config={userGrowthConfig} className="h-72 w-full">
                      <AreaChart data={analyticsData!.userGrowth} accessibilityLayer>
                        <defs>
                          <linearGradient id="userGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(239 84% 67%)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(239 84% 67%)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatMonthYear} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(_, payload) => {
                                if (payload?.[0]?.payload?.date) {
                                  return new Date(payload[0].payload.date).toLocaleDateString(undefined, {
                                    month: "long",
                                    year: "numeric",
                                  });
                                }
                                return "";
                              }}
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="hsl(239 84% 67%)"
                          fill="url(#userGrowthGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                      {t("admin.analytics.no_data", "No data available for this period")}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Channel Distribution */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle>{t("admin.analytics.channel_distribution", "Channel Distribution")}</CardTitle>
                  <CardDescription>{t("admin.analytics.channel_distribution_desc", "Distribution of messages across channels")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {hasData(analyticsData?.messagesByChannel) ? (
                    <ChartContainer config={channelConfig} className="h-72 w-full">
                      <PieChart accessibilityLayer>
                        <Pie
                          data={analyticsData!.messagesByChannel}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={3}
                          dataKey="count"
                          nameKey="channel"
                          strokeWidth={2}
                          stroke="hsl(var(--background))"
                        >
                          {analyticsData!.messagesByChannel.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent nameKey="channel" />} />
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                      {t("admin.analytics.no_data", "No data available for this period")}
                    </div>
                  )}
                  {/* Legend below chart */}
                  {hasData(analyticsData?.messagesByChannel) && (
                    <div className="flex flex-wrap justify-center gap-3 mt-3">
                      {analyticsData!.messagesByChannel.map((item, i) => (
                        <div key={item.channel} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          <span className="capitalize">{item.channel}</span>
                          <span className="font-medium text-foreground">{item.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Conversations by Company */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle>{t("admin.analytics.conversations_by_company", "Conversations by Company")}</CardTitle>
                  <CardDescription>{t("admin.analytics.conversations_by_company_desc", "Top companies by conversation volume")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {hasData(analyticsData?.conversationsByCompany) ? (
                    <ChartContainer config={conversationsConfig} className="h-72 w-full">
                      <BarChart data={analyticsData!.conversationsByCompany} layout="vertical" accessibilityLayer>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="company"
                          width={110}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="hsl(160 84% 39%)" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                      {t("admin.analytics.no_data", "No data available for this period")}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Active Users */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle>{t("admin.analytics.active_users", "Active Users")}</CardTitle>
                  <CardDescription>{t("admin.analytics.active_users_desc", "Daily active users over time")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {hasData(analyticsData?.activeUsersByDay) ? (
                    <ChartContainer config={activeUsersConfig} className="h-72 w-full">
                      <LineChart data={analyticsData!.activeUsersByDay} accessibilityLayer>
                        <defs>
                          <linearGradient id="activeUsersGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatShortDate} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(_, payload) => {
                                if (payload?.[0]?.payload?.date) {
                                  return new Date(payload[0].payload.date).toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  });
                                }
                                return "";
                              }}
                            />
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="hsl(38 92% 50%)"
                          strokeWidth={2.5}
                          dot={{ fill: "hsl(38 92% 50%)", strokeWidth: 0, r: 3 }}
                          activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                        />
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                      {t("admin.analytics.no_data", "No data available for this period")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
