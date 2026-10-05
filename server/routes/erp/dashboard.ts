import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { parseExportFormat, sendTabularExport } from '../../utils/tabular-export';
import { storage } from '../../storage';
import {
  getRevenueSummary,
  getTopProductsBySales,
  getOrderPipelineSummary,
  getInventoryValue,
  getArApSummary,
  getCashFlowOverview,
  getRecentActivities,
  getSalesReport,
  getInventoryValuationReport,
  getPurchaseReport,
  getTaxCollectedReport,
  getEmployeeHeadcountSummary,
  getKpiSnapshot,
  getRevenueByProductCategory,
  getTopCustomersByRevenue,
  getInventoryTurnoverSeries,
  getRestaurantOrderMix,
  getRestaurantTicketThroughput,
  getRestaurantTableTurnover,
  getRestaurantReservationLoad,
  getRestaurantTipAndServiceChargeTotals,
  getRestaurantIngredientRisk,
  getDentalPatientActivity,
  getDentalScheduleFlow,
  getDentalTreatmentPlanSummary,
  getDentalAppointmentsToday,
  getDentalProviderPerformance,
  getDentalProcedureRevenue,
  getDentalFollowUps,
} from '../../services/erp/reporting-service';
import { ensureRestaurantBusinessType, ensureDentalBusinessType, getCompanyErpBusinessType } from './business-type';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_DASHBOARD_READ_PERMISSION = 'view_erp_dashboard';
const ERP_REPORTS_READ_PERMISSION = 'view_erp_reports';

const withErpDashboardAccess = (permissions: string[]) => [
  ERP_DASHBOARD_READ_PERMISSION,
  ...permissions,
];

const withErpReportsAccess = (permissions: string[]) => [
  ERP_REPORTS_READ_PERMISSION,
  ...permissions,
];

const withErpDashboardOrReportsAccess = (permissions: string[]) => [
  ERP_DASHBOARD_READ_PERMISSION,
  ERP_REPORTS_READ_PERMISSION,
  ...permissions,
];

/** Matches accounting routes for P&L, AR/AP aging, trial balance, etc. */
const ERP_ACCOUNTING_READ_PERMISSIONS = ['view_accounting', 'manage_accounting'];

const ERP_HR_PAYROLL_REPORT_PERMISSIONS = [
  'view_hr',
  'manage_hr',
  'view_payroll',
  'manage_payroll',
];

/** Tax, AR/AP summary, cash flow — accounting and/or invoice settlement. */
const ERP_FINANCE_AR_AP_CASH_TAX_PERMISSIONS = [
  'view_accounting',
  'manage_accounting',
  'view_invoices',
  'manage_invoices',
  'record_payments',
];

const ERP_SALES_AND_INVOICE_ANALYTICS_PERMISSIONS = [
  'view_sales_orders',
  'manage_sales_orders',
  'create_quotations',
  'view_invoices',
  'manage_invoices',
  'record_payments',
];

const ERP_ORDER_PIPELINE_PERMISSIONS = [
  'view_sales_orders',
  'manage_sales_orders',
  'create_quotations',
];

const ERP_INVENTORY_ANALYTICS_PERMISSIONS = [
  'view_inventory',
  'manage_inventory',
];

const ERP_INVENTORY_TURNOVER_PERMISSIONS = [
  'view_inventory',
  'manage_inventory',
  'view_sales_orders',
  'manage_sales_orders',
  'create_quotations',
];

const ERP_PURCHASES_REPORT_PERMISSIONS = [
  'view_purchase_orders',
  'manage_purchase_orders',
  'view_suppliers',
  'manage_suppliers',
];

const ERP_REVENUE_PAYMENTS_PERMISSIONS = [
  'view_invoices',
  'manage_invoices',
  'record_payments',
  'view_accounting',
  'manage_accounting',
];

const ERP_KPI_AND_ACTIVITY_PERMISSIONS = [
  'view_sales_orders',
  'manage_sales_orders',
  'create_quotations',
  'view_inventory',
  'manage_inventory',
  'view_invoices',
  'manage_invoices',
  'record_payments',
  'view_accounting',
  'manage_accounting',
];

const ERP_EXPORT_PERMISSIONS_BY_TYPE: Record<string, string[]> = {
  sales: withErpReportsAccess(ERP_SALES_AND_INVOICE_ANALYTICS_PERMISSIONS),
  inventory_valuation: withErpReportsAccess(ERP_INVENTORY_ANALYTICS_PERMISSIONS),
  purchases: withErpReportsAccess(ERP_PURCHASES_REPORT_PERMISSIONS),
  tax_collected: withErpReportsAccess(ERP_FINANCE_AR_AP_CASH_TAX_PERMISSIONS),
  employee_summary: withErpReportsAccess(ERP_HR_PAYROLL_REPORT_PERMISSIONS),
  profit_loss: withErpReportsAccess(ERP_ACCOUNTING_READ_PERMISSIONS),
};

function requireErpExportAccess(req: Request, res: Response, next: NextFunction) {
  const rawType = String(req.query.reportType ?? '');
  const reportType = rawType.replace(/-/g, '_');
  const perms = ERP_EXPORT_PERMISSIONS_BY_TYPE[reportType];
  if (!perms) {
    return res.status(400).json({ success: false, error: 'Invalid reportType' });
  }
  return requireAnyPermission(perms)(req, res, next);
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

function handleRouteError(res: Response, error: unknown, context: string) {
  console.error(context, error);
  return res.status(500).json({
    success: false,
    error: `${context} ${getErrorMessage(error)}`,
  });
}

function optionalQueryInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function optionalQueryDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function requiredDateRange(req: Request, res: Response): { from: Date; to: Date } | undefined {
  const rawFrom = req.query.dateFrom as string | undefined;
  const rawTo = req.query.dateTo as string | undefined;
  const from = optionalQueryDate(rawFrom);
  const to = rawTo == null || rawTo === '' ? new Date() : optionalQueryDate(rawTo);
  if (!from) {
    res.status(400).json({ success: false, error: 'dateFrom is required and must be a valid date' });
    return undefined;
  }
  if (!to) {
    res.status(400).json({ success: false, error: 'dateTo must be a valid date' });
    return undefined;
  }
  if (to < from) {
    res.status(400).json({ success: false, error: 'dateTo must be on or after dateFrom' });
    return undefined;
  }
  const now = new Date();
  if (from > now || to > now) {
    res.status(400).json({ success: false, error: 'Date range cannot be in the future' });
    return undefined;
  }
  if (to.getTime() - from.getTime() > 365 * 24 * 60 * 60 * 1000) {
    res.status(400).json({ success: false, error: 'Date range cannot exceed 365 days' });
    return undefined;
  }
  return { from, to };
}

async function erpBaseCurrencyCode(companyId: number): Promise<string> {
  const base = await storage.getBaseCurrency(companyId);
  return (base?.code ?? 'USD').trim().toUpperCase();
}

function requestHasAnyPermission(req: Request, permissions: string[]): boolean {
  const userPermissions = (req as any).userPermissions as Record<string, boolean> | undefined;
  if (!userPermissions) return true;
  return permissions.some((permission) => userPermissions[permission] === true);
}

const periodSchema = z.enum(['daily', 'weekly', 'monthly']);
const groupBySchema = z.enum(['product', 'customer', 'period']);
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get('/kpis', requireAnyPermission(withErpDashboardAccess(ERP_KPI_AND_ACTIVITY_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const isRestaurant = (await getCompanyErpBusinessType(companyId)) === 'restaurant';
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    const dateRange =
      dateFrom && dateTo ? ({ from: dateFrom, to: dateTo } as const) : undefined;
    const snapshot = await getKpiSnapshot(companyId, isRestaurant, dateRange);
    const data = { ...snapshot };
    if (!requestHasAnyPermission(req, withErpDashboardAccess(ERP_REVENUE_PAYMENTS_PERMISSIONS))) {
      data.revenueLast30Days = 0;
    }
    if (!requestHasAnyPermission(req, withErpDashboardAccess(ERP_ORDER_PIPELINE_PERMISSIONS))) {
      data.pendingOrders = 0;
      data.activeKitchenTickets = 0;
      data.pendingDeliveries = 0;
    }
    if (!requestHasAnyPermission(req, withErpDashboardAccess(ERP_INVENTORY_ANALYTICS_PERMISSIONS))) {
      data.lowStockCount = 0;
    }
    if (!requestHasAnyPermission(req, withErpDashboardAccess(['view_invoices', 'manage_invoices', 'record_payments']))) {
      data.overdueInvoices = 0;
    }
    if (!requestHasAnyPermission(req, withErpDashboardAccess(ERP_ACCOUNTING_READ_PERMISSIONS))) {
      data.openAr = 0;
      data.openAp = 0;
    }
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching ERP KPIs:');
  }
});

router.get('/restaurant/order-mix', requireAnyPermission(withErpDashboardOrReportsAccess(['view_sales_orders', 'manage_sales_orders'])), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRestaurantOrderMix(companyId, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching restaurant order mix:');
  }
});

router.get('/dental/patients', requireAnyPermission(['view_dental_patients', 'manage_dental_patients']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const range = requiredDateRange(req, res);
    if (!range) return;
    const data = await getDentalPatientActivity(companyId, range.from, range.to);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental patient activity:');
  }
});

router.get('/dental/schedule', requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const range = requiredDateRange(req, res);
    if (!range) return;
    const data = await getDentalScheduleFlow(companyId, range.from, range.to);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental schedule flow:');
  }
});

router.get('/dental/treatment-plans', requireAnyPermission(['view_dental_treatment_plans', 'manage_dental_treatment_plans']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const range = requiredDateRange(req, res);
    if (!range) return;
    const data = await getDentalTreatmentPlanSummary(companyId, range.from, range.to);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental treatment plan summary:');
  }
});

router.get('/dental/appointments-today', requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const data = await getDentalAppointmentsToday(companyId, from, now);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental appointments:');
  }
});

router.get('/dental/provider-performance', requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const range = requiredDateRange(req, res);
    if (!range) return;
    return res.json({ success: true, data: await getDentalProviderPerformance(companyId, range.from, range.to) });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental provider performance:');
  }
});

router.get('/dental/procedure-revenue', requireAnyPermission(['view_dental_treatment_plans', 'manage_dental_treatment_plans', 'view_invoices', 'manage_invoices']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const range = requiredDateRange(req, res);
    if (!range) return;
    return res.json({ success: true, data: await getDentalProcedureRevenue(companyId, range.from, range.to), baseCurrency: await erpBaseCurrencyCode(companyId) });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental procedure revenue:');
  }
});

router.get('/dental/follow-ups', requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    const range = requiredDateRange(req, res);
    if (!range) return;
    return res.json({ success: true, data: await getDentalFollowUps(companyId, range.from, range.to) });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching dental follow-ups:');
  }
});

router.get('/restaurant/ticket-throughput', requireAnyPermission(withErpDashboardOrReportsAccess(['view_sales_orders', 'manage_sales_orders'])), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const parsed = periodSchema.safeParse(req.query.period ?? 'daily');
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRestaurantTicketThroughput(companyId, parsed.data, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching restaurant ticket throughput:');
  }
});

router.get('/restaurant/table-turnover', requireAnyPermission(withErpDashboardOrReportsAccess(['view_sales_orders', 'manage_sales_orders'])), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRestaurantTableTurnover(companyId, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching restaurant table turnover:');
  }
});

router.get('/restaurant/reservation-load', requireAnyPermission(withErpDashboardOrReportsAccess(['view_sales_orders', 'manage_sales_orders'])), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRestaurantReservationLoad(companyId, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching restaurant reservation load:');
  }
});

router.get('/restaurant/tip-service-charge', requireAnyPermission(withErpDashboardOrReportsAccess(['view_sales_orders', 'manage_sales_orders'])), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRestaurantTipAndServiceChargeTotals(companyId, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching restaurant tip/service totals:');
  }
});

router.get('/restaurant/ingredient-risk', requireAnyPermission(withErpDashboardOrReportsAccess(['view_inventory', 'manage_inventory'])), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;
    const data = await getRestaurantIngredientRisk(companyId);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching restaurant ingredient risk:');
  }
});

router.get('/revenue-summary', requireAnyPermission(withErpDashboardAccess(ERP_REVENUE_PAYMENTS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = periodSchema.safeParse(req.query.period ?? 'monthly');
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRevenueSummary(companyId, parsed.data, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching revenue summary:');
  }
});

router.get('/top-products', requireAnyPermission(withErpDashboardAccess(ERP_SALES_AND_INVOICE_ANALYTICS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const limit = optionalQueryInt(req.query.limit as string) ?? 10;
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    const data = await getTopProductsBySales(companyId, limit, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching top products:');
  }
});

router.get('/revenue-by-category', requireAnyPermission(withErpDashboardAccess(ERP_SALES_AND_INVOICE_ANALYTICS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getRevenueByProductCategory(companyId, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching revenue by category:');
  }
});

router.get('/top-customers', requireAnyPermission(withErpDashboardAccess(ERP_SALES_AND_INVOICE_ANALYTICS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const limit = optionalQueryInt(req.query.limit as string) ?? 10;
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getTopCustomersByRevenue(companyId, limit, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching top customers:');
  }
});

router.get('/inventory-turnover', requireAnyPermission(withErpDashboardAccess(ERP_INVENTORY_TURNOVER_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = periodSchema.safeParse(req.query.period ?? 'monthly');
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getInventoryTurnoverSeries(companyId, parsed.data, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching inventory turnover:');
  }
});

router.get('/order-pipeline', requireAnyPermission(withErpDashboardAccess(ERP_ORDER_PIPELINE_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await getOrderPipelineSummary(companyId);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching order pipeline:');
  }
});

router.get('/inventory-value', requireAnyPermission(withErpDashboardAccess(ERP_INVENTORY_ANALYTICS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await getInventoryValue(companyId);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching inventory value:');
  }
});

router.get('/ar-ap-summary', requireAnyPermission(withErpDashboardAccess(ERP_ACCOUNTING_READ_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await getArApSummary(companyId);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching AR/AP summary:');
  }
});

router.get('/cash-flow', requireAnyPermission(withErpDashboardAccess(ERP_FINANCE_AR_AP_CASH_TAX_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const data = await getCashFlowOverview(companyId, dateFrom, dateTo);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching cash flow:');
  }
});

router.get('/recent-activities', requireAnyPermission(withErpDashboardAccess(ERP_KPI_AND_ACTIVITY_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const limit = optionalQueryInt(req.query.limit as string) ?? 20;
    const rows = await getRecentActivities(companyId, limit);
    const data = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching recent activities:');
  }
});

router.get('/reports/sales', requireAnyPermission(withErpReportsAccess(ERP_SALES_AND_INVOICE_ANALYTICS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const gb = groupBySchema.safeParse(req.query.groupBy ?? 'product');
    if (!gb.success) {
      return sendValidationError(res, gb.error);
    }
    const period = periodSchema.safeParse(req.query.period ?? 'monthly');
    if (!period.success) {
      return sendValidationError(res, period.error);
    }
    const pagination = paginationSchema.safeParse({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (!pagination.success) {
      return sendValidationError(res, pagination.error);
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const result = await getSalesReport(companyId, gb.data, dateFrom, dateTo, period.data, pagination.data);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data: result.data, total: result.total, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating sales report:');
  }
});

router.get('/reports/inventory-valuation', requireAnyPermission(withErpReportsAccess(ERP_INVENTORY_ANALYTICS_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const pagination = paginationSchema.safeParse({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (!pagination.success) {
      return sendValidationError(res, pagination.error);
    }
    const result = await getInventoryValuationReport(companyId, pagination.data);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data: result.data, total: result.total, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating inventory valuation:');
  }
});

router.get('/reports/purchases', requireAnyPermission(withErpReportsAccess(ERP_PURCHASES_REPORT_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const pagination = paginationSchema.safeParse({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (!pagination.success) {
      return sendValidationError(res, pagination.error);
    }
    const result = await getPurchaseReport(companyId, dateFrom, dateTo, pagination.data);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data: result.data, total: result.total, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating purchase report:');
  }
});

router.get('/reports/tax-collected', requireAnyPermission(withErpReportsAccess(ERP_FINANCE_AR_AP_CASH_TAX_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
    }
    const pagination = paginationSchema.safeParse({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (!pagination.success) {
      return sendValidationError(res, pagination.error);
    }
    const result = await getTaxCollectedReport(companyId, dateFrom, dateTo, pagination.data);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data: result.data, total: result.total, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating tax report:');
  }
});

router.get('/reports/employee-summary', requireAnyPermission(withErpReportsAccess(ERP_HR_PAYROLL_REPORT_PERMISSIONS)), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const pagination = paginationSchema.safeParse({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (!pagination.success) {
      return sendValidationError(res, pagination.error);
    }
    const data = await getEmployeeHeadcountSummary(companyId, pagination.data);
    const baseCurrency = await erpBaseCurrencyCode(companyId);
    return res.json({ success: true, data, total: data.departmentTotal, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating employee summary:');
  }
});

router.get('/reports/export', requireErpExportAccess, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const format = parseExportFormat(req.query.format);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });

    const rawType = String(req.query.reportType ?? '');
    const reportType = rawType.replace(/-/g, '_');
    const dateFrom = optionalQueryDate(req.query.dateFrom as string);
    const dateTo = optionalQueryDate(req.query.dateTo as string);
    const groupBy = (req.query.groupBy as string) || 'product';
    const gbParsed = groupBySchema.safeParse(groupBy);
    if (!gbParsed.success) {
      return sendValidationError(res, gbParsed.error);
    }
    const groupByVal = gbParsed.data;
    const period = periodSchema.safeParse(req.query.period ?? 'monthly');
    if (!period.success) {
      return sendValidationError(res, period.error);
    }

    let filename = 'erp-report';
    let records: Record<string, string | number>[] = [];
    let header: { id: string; title: string }[] = [];

    if (reportType === 'sales') {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
      }
      filename = 'erp-sales-report';
      const rows = await getSalesReport(companyId, groupByVal, dateFrom, dateTo, period.data);
      header = [
        { id: 'label', title: groupByVal === 'customer' ? 'Customer' : groupByVal === 'period' ? 'Period' : 'Product' },
        { id: 'quantity', title: 'Quantity' },
        { id: 'revenue', title: 'Revenue' },
        { id: 'tax', title: 'Tax' },
      ];
      records = rows.data.map((r) => ({ label: r.label, quantity: r.quantity, revenue: r.revenue, tax: r.tax }));
    } else if (reportType === 'inventory_valuation') {
      filename = 'erp-inventory-valuation';
      const rows = await getInventoryValuationReport(companyId);
      header = [
        { id: 'productName', title: 'Product' },
        { id: 'sku', title: 'SKU' },
        { id: 'categoryName', title: 'Category' },
        { id: 'quantity', title: 'Quantity' },
        { id: 'unitCost', title: 'Unit Cost' },
        { id: 'totalValue', title: 'Total Value' },
      ];
      records = rows.data.map((r) => ({
        productName: r.productName,
        sku: r.sku ?? '',
        categoryName: r.categoryName ?? '',
        quantity: r.quantity,
        unitCost: r.unitCost,
        totalValue: r.totalValue,
      }));
    } else if (reportType === 'purchases') {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
      }
      filename = 'erp-purchases';
      const rows = await getPurchaseReport(companyId, dateFrom, dateTo);
      header = [
        { id: 'supplierName', title: 'Supplier' },
        { id: 'orderCount', title: 'Orders' },
        { id: 'totalAmount', title: 'Total' },
        { id: 'receivedOrderCount', title: 'Received Orders' },
        { id: 'receivedAmount', title: 'Received Amount' },
      ];
      records = rows.data.map((r) => ({
        supplierName: r.supplierName,
        orderCount: r.orderCount,
        totalAmount: r.totalAmount,
        receivedOrderCount: r.receivedOrderCount,
        receivedAmount: r.receivedAmount,
      }));
    } else if (reportType === 'tax_collected') {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
      }
      filename = 'erp-tax-collected';
      const rows = await getTaxCollectedReport(companyId, dateFrom, dateTo);
      header = [
        { id: 'period', title: 'Period' },
        { id: 'invoiceType', title: 'Invoice Type' },
        { id: 'taxAmount', title: 'Tax Amount' },
      ];
      records = rows.data.map((r) => ({ period: r.period, invoiceType: r.invoiceType, taxAmount: r.taxAmount }));
    } else if (reportType === 'employee_summary') {
      filename = 'erp-employee-summary';
      const summary = await getEmployeeHeadcountSummary(companyId);
      header = [
        { id: 'departmentName', title: 'Department' },
        { id: 'headcount', title: 'Headcount' },
      ];
      records = summary.byDepartment.map((d) => ({ departmentName: d.departmentName, headcount: d.headcount }));
    } else if (reportType === 'profit_loss') {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ success: false, error: 'dateFrom and dateTo are required' });
      }
      filename = 'erp-profit-loss';
      const pl = await storage.getProfitAndLoss(companyId, dateFrom, dateTo);
      header = [
        { id: 'section', title: 'Section' },
        { id: 'accountCode', title: 'Account Code' },
        { id: 'accountName', title: 'Account' },
        { id: 'amount', title: 'Amount' },
      ];
      records = [
        ...pl.revenue.map((r) => ({
          section: 'revenue',
          accountCode: r.accountCode,
          accountName: r.accountName,
          amount: Number(r.amount),
        })),
        ...pl.expenses.map((r) => ({
          section: 'expense',
          accountCode: r.accountCode,
          accountName: r.accountName,
          amount: Number(r.amount),
        })),
      ];
    } else {
      return res.status(400).json({ success: false, error: 'Invalid reportType' });
    }

    return await sendTabularExport(res, {
      filename: `${filename}-${Date.now()}`,
      format,
      sheets: [{
        name: filename.replace(/^erp-/, '').replace(/-/g, ' '),
        columns: header.map((column) => ({ key: column.id, header: column.title })),
        rows: records,
      }],
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error exporting ERP report:');
  }
});

export default router;
