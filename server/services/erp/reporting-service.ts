import { db } from '../../db';
import { storage } from '../../storage';
import {
  invoices,
  invoicePayments,
  invoiceItems,
  salesOrders,
  salesOrderItems,
  products,
  productCategories,
  stockLevels,
   stockMovements,
  purchaseOrders,
  purchaseOrderItems,
  suppliers,
  contacts,
  accountsReceivable,
  accountsPayable,
  restaurantOrderContexts,
  restaurantKitchenTickets,
  restaurantDeliveryDispatches,
  restaurantTables,
  restaurantReservations,
  dentalPatientProfiles,
  contactAppointments,
  dentalTreatmentPlans,
  dentalTreatmentProcedures,
  users,
} from '@shared/schema';
import { eq, and, sql, gte, lte, desc, inArray, isNotNull, or, isNull, type SQL } from 'drizzle-orm';
import { getEffectiveRate } from './currency-service';

/** Order statuses that count toward realized sales (excludes draft, quotation, cancelled, returned). */
export const REALIZED_SALES_ORDER_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'] as const;
export const REALIZED_CASH_RECEIPT_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid', 'overdue'] as const;
export type ReportPeriod = 'daily' | 'weekly' | 'monthly';
export type ReportPagination = { limit?: number; offset?: number };
export type PagedReportResult<T> = { data: T[]; total: number };

export function realizedSalesOrderCondition() {
  return inArray(salesOrders.status, [...REALIZED_SALES_ORDER_STATUSES]);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function resolveCompanyBaseCurrencyCode(companyId: number): Promise<string> {
  const base = await storage.getBaseCurrency(companyId);
  return (base?.code ?? 'USD').trim().toUpperCase();
}

type CurrencyConversionContext = {
  baseCurrency: Promise<string>;
  rates: Map<string, Promise<number>>;
};

function createCurrencyConversionContext(companyId: number): CurrencyConversionContext {
  return {
    baseCurrency: resolveCompanyBaseCurrencyCode(companyId),
    rates: new Map(),
  };
}

function effectiveDayKey(asOf: Date | null | undefined): string {
  const d = asOf ?? new Date();
  return d.toISOString().slice(0, 10);
}

async function resolveMemoizedRate(
  companyId: number,
  from: string,
  to: string,
  asOf: Date | null | undefined,
  context: CurrencyConversionContext,
): Promise<number> {
  const day = effectiveDayKey(asOf);
  const key = `${companyId}:${from}:${to}:${day}`;
  let promise = context.rates.get(key);
  if (!promise) {
    promise = getEffectiveRate(companyId, from, to, asOf ?? undefined);
    context.rates.set(key, promise);
  }
  return promise;
}

async function amountToBase(
  companyId: number,
  amount: number,
  transactionCurrency: string | null | undefined,
  asOf: Date | null | undefined,
  context: CurrencyConversionContext = createCurrencyConversionContext(companyId),
): Promise<number> {
  if (!Number.isFinite(amount)) return 0;
  const base = await context.baseCurrency;
  const from = (transactionCurrency ?? base).trim().toUpperCase();
  if (from === base) return amount;
  try {
    const rate = await resolveMemoizedRate(companyId, from, base, asOf, context);
    return amount * rate;
  } catch {
    return amount;
  }
}

function parseBucketDateTrunc(period: ReportPeriod) {
  switch (period) {
    case 'daily':
      return sql`date_trunc('day', ${invoicePayments.paymentDate})`;
    case 'weekly':
      return sql`date_trunc('week', ${invoicePayments.paymentDate})`;
    case 'monthly':
    default:
      return sql`date_trunc('month', ${invoicePayments.paymentDate})`;
  }
}

function parseSalesOrderCreatedBucket(period: ReportPeriod) {
  switch (period) {
    case 'daily':
      return sql`date_trunc('day', ${salesOrders.createdAt})`;
    case 'weekly':
      return sql`date_trunc('week', ${salesOrders.createdAt})`;
    case 'monthly':
    default:
      return sql`date_trunc('month', ${salesOrders.createdAt})`;
  }
}

function applyPagination<T>(rows: T[], pagination?: ReportPagination): PagedReportResult<T> {
  const total = rows.length;
  const offset = Math.max(0, pagination?.offset ?? 0);
  const limit = pagination?.limit == null ? total : Math.min(Math.max(pagination.limit, 1), 500);
  return { data: rows.slice(offset, offset + limit), total };
}

export async function getRevenueSummary(
  companyId: number,
  period: ReportPeriod,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ periodStart: string; revenue: number }>> {
  const bucket = parseBucketDateTrunc(period);
  const currencyContext = createCurrencyConversionContext(companyId);
  const payments = await db
    .select({
      periodStart: sql<string>`${bucket}::text`,
      amount: invoicePayments.amount,
      currency: invoices.currency,
      paymentDate: invoicePayments.paymentDate,
    })
    .from(invoicePayments)
    .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoicePayments.companyId, companyId),
        eq(invoices.companyId, companyId),
        eq(invoices.type, 'sales_invoice'),
        inArray(invoices.status, [...REALIZED_CASH_RECEIPT_INVOICE_STATUSES]),
        gte(invoicePayments.paymentDate, dateFrom),
        lte(invoicePayments.paymentDate, dateTo),
      ),
    );

  const totals = new Map<string, number>();
  for (const p of payments) {
    const baseAmt = await amountToBase(companyId, num(p.amount), p.currency, p.paymentDate ?? null, currencyContext);
    const k = p.periodStart;
    totals.set(k, (totals.get(k) ?? 0) + baseAmt);
  }

  return [...totals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([periodStart, revenue]) => ({ periodStart, revenue }));
}

export async function getTopProductsBySales(
  companyId: number,
  limit: number,
  dateFrom?: Date,
  dateTo?: Date,
): Promise<Array<{ productId: number; productName: string; sku: string | null; quantitySold: number }>> {
  const conditions: ReturnType<typeof and>[] = [
    eq(salesOrders.companyId, companyId),
    eq(products.companyId, companyId),
    isNotNull(salesOrderItems.productId),
    realizedSalesOrderCondition(),
  ];
  if (dateFrom) conditions.push(gte(salesOrders.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(salesOrders.createdAt, dateTo));

  const rows = await db
    .select({
      productId: salesOrderItems.productId,
      productName: products.name,
      sku: products.sku,
      quantitySold: sql<number>`coalesce(sum(${salesOrderItems.quantity}::numeric), 0)`,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .innerJoin(products, eq(salesOrderItems.productId, products.id))
    .where(and(...conditions))
    .groupBy(salesOrderItems.productId, products.name, products.sku)
    .orderBy(desc(sql`coalesce(sum(${salesOrderItems.quantity}::numeric), 0)`))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows
    .filter((r) => r.productId != null)
    .map((r) => ({
      productId: r.productId as number,
      productName: r.productName,
      sku: r.sku,
      quantitySold: num(r.quantitySold),
    }));
}

export async function getOrderPipelineSummary(
  companyId: number,
): Promise<Array<{ status: string; count: number }>> {
  const rows = await db
    .select({
      status: salesOrders.status,
      count: sql<number>`count(*)::int`,
    })
    .from(salesOrders)
    .where(eq(salesOrders.companyId, companyId))
    .groupBy(salesOrders.status)
    .orderBy(salesOrders.status);

  return rows.map((r) => ({ status: r.status, count: Number(r.count ?? 0) }));
}

export async function getInventoryValue(
  companyId: number,
  currencyContext: CurrencyConversionContext = createCurrencyConversionContext(companyId),
): Promise<{ totalValue: number }> {
  const rows = await db
    .select({
      qty: stockLevels.quantity,
      cost: products.costPrice,
      currency: products.currency,
    })
    .from(stockLevels)
    .innerJoin(products, eq(stockLevels.productId, products.id))
    .where(and(eq(stockLevels.companyId, companyId), eq(products.companyId, companyId)));

  let total = 0;
  for (const r of rows) {
    const line = num(r.qty) * num(r.cost);
    total += await amountToBase(companyId, line, r.currency ?? null, new Date(), currencyContext);
  }
  return { totalValue: total };
}

export async function getArApSummary(companyId: number): Promise<{
  openAr: number;
  openAp: number;
  arAgingTotals: { current: number; days30: number; days60: number; days90: number; over90: number };
  apAgingTotals: { current: number; days30: number; days60: number; days90: number; over90: number };
}> {
  const now = new Date();
  const currencyContext = createCurrencyConversionContext(companyId);

  const arOpen = await db
    .select({
      remaining: sql<string>`(${accountsReceivable.amount}::numeric - ${accountsReceivable.paidAmount}::numeric)::text`,
      dueDate: accountsReceivable.dueDate,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
    })
    .from(accountsReceivable)
    .innerJoin(invoices, and(eq(accountsReceivable.invoiceId, invoices.id), eq(invoices.companyId, companyId)))
    .where(
      and(
        eq(accountsReceivable.companyId, companyId),
        or(
          eq(accountsReceivable.status, 'open' as any),
          eq(accountsReceivable.status, 'partially_paid' as any),
          eq(accountsReceivable.status, 'overdue' as any),
        ),
      ),
    );

  const apOpen = await db
    .select({
      remaining: sql<string>`(${accountsPayable.amount}::numeric - ${accountsPayable.paidAmount}::numeric)::text`,
      dueDate: accountsPayable.dueDate,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
    })
    .from(accountsPayable)
    .innerJoin(invoices, and(eq(accountsPayable.invoiceId, invoices.id), eq(invoices.companyId, companyId)))
    .where(
      and(
        eq(accountsPayable.companyId, companyId),
        or(
          eq(accountsPayable.status, 'open' as any),
          eq(accountsPayable.status, 'partially_paid' as any),
          eq(accountsPayable.status, 'overdue' as any),
        ),
      ),
    );

  const arAgingTotals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
  let openAr = 0;
  for (const row of arOpen) {
    const remaining = num(row.remaining);
    if (remaining <= 0) continue;
    const asOf = row.issueDate ?? now;
    const baseRemaining = await amountToBase(companyId, remaining, row.currency, asOf, currencyContext);
    openAr += baseRemaining;
    if (!row.dueDate) continue;
    const dueDate = new Date(row.dueDate);
    const daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 0) arAgingTotals.current += baseRemaining;
    else if (daysDiff <= 30) arAgingTotals.days30 += baseRemaining;
    else if (daysDiff <= 60) arAgingTotals.days60 += baseRemaining;
    else if (daysDiff <= 90) arAgingTotals.days90 += baseRemaining;
    else arAgingTotals.over90 += baseRemaining;
  }

  const apAgingTotals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
  let openAp = 0;
  for (const row of apOpen) {
    const remaining = num(row.remaining);
    if (remaining <= 0) continue;
    const asOf = row.issueDate ?? now;
    const baseRemaining = await amountToBase(companyId, remaining, row.currency, asOf, currencyContext);
    openAp += baseRemaining;
    if (!row.dueDate) continue;
    const dueDate = new Date(row.dueDate);
    const daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 0) apAgingTotals.current += baseRemaining;
    else if (daysDiff <= 30) apAgingTotals.days30 += baseRemaining;
    else if (daysDiff <= 60) apAgingTotals.days60 += baseRemaining;
    else if (daysDiff <= 90) apAgingTotals.days90 += baseRemaining;
    else apAgingTotals.over90 += baseRemaining;
  }

  return { openAr, openAp, arAgingTotals, apAgingTotals };
}

export async function getCashFlowOverview(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<{ inflows: number; outflows: number; net: number }> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const rows = await db
    .select({
      type: invoices.type,
      amount: invoicePayments.amount,
      currency: invoices.currency,
      paymentDate: invoicePayments.paymentDate,
    })
    .from(invoicePayments)
    .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoicePayments.companyId, companyId),
        eq(invoices.companyId, companyId),
        gte(invoicePayments.paymentDate, dateFrom),
        lte(invoicePayments.paymentDate, dateTo),
        inArray(invoices.status, [...REALIZED_CASH_RECEIPT_INVOICE_STATUSES]),
      ),
    );

  let inflows = 0;
  let outflows = 0;
  for (const r of rows) {
    const baseAmt = await amountToBase(companyId, num(r.amount), r.currency, r.paymentDate ?? null, currencyContext);
    if (r.type === 'sales_invoice') inflows += baseAmt;
    if (r.type === 'purchase_invoice') outflows += baseAmt;
  }
  return { inflows, outflows, net: inflows - outflows };
}

export type RecentActivity = {
  activityType: string;
  referenceId: number;
  title: string;
  createdAt: Date;
};

export async function getRecentActivities(companyId: number, limit: number): Promise<RecentActivity[]> {
  const lim = Math.min(Math.max(limit, 1), 100);

  const [orderRows, invoiceRows, paymentRows, movementRows] = await Promise.all([
    db
      .select({
        referenceId: salesOrders.id,
        title: salesOrders.orderNumber,
        createdAt: salesOrders.createdAt,
      })
      .from(salesOrders)
      .where(eq(salesOrders.companyId, companyId))
      .orderBy(desc(salesOrders.createdAt))
      .limit(lim),
    db
      .select({
        referenceId: invoices.id,
        title: invoices.invoiceNumber,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .orderBy(desc(invoices.createdAt))
      .limit(lim),
    db
      .select({
        referenceId: invoicePayments.id,
        title: sql<string>`'Payment #' || ${invoicePayments.id}::text`,
        createdAt: invoicePayments.createdAt,
      })
      .from(invoicePayments)
      .where(eq(invoicePayments.companyId, companyId))
      .orderBy(desc(invoicePayments.createdAt))
      .limit(lim),
    db
      .select({
        referenceId: stockMovements.id,
        title: sql<string>`'Movement #' || ${stockMovements.id}::text`,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .where(eq(stockMovements.companyId, companyId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(lim),
  ]);

  const merged: RecentActivity[] = [
    ...orderRows.map((r) => ({
      activityType: 'sales_order',
      referenceId: r.referenceId,
      title: r.title,
      createdAt: r.createdAt!,
    })),
    ...invoiceRows.map((r) => ({
      activityType: 'invoice',
      referenceId: r.referenceId,
      title: r.title,
      createdAt: r.createdAt!,
    })),
    ...paymentRows.map((r) => ({
      activityType: 'payment',
      referenceId: r.referenceId,
      title: r.title,
      createdAt: r.createdAt!,
    })),
    ...movementRows.map((r) => ({
      activityType: 'stock_movement',
      referenceId: r.referenceId,
      title: r.title,
      createdAt: r.createdAt!,
    })),
  ];

  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(0, lim);
}

export async function getSalesReport(
  companyId: number,
  groupBy: 'product' | 'customer' | 'period',
  dateFrom: Date,
  dateTo: Date,
  period: ReportPeriod = 'monthly',
  pagination?: ReportPagination,
): Promise<
  PagedReportResult<{
    key: string;
    label: string;
    quantity: number;
    revenue: number;
    tax: number;
  }>
> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const windowCond = and(
    eq(salesOrders.companyId, companyId),
    realizedSalesOrderCondition(),
    gte(salesOrders.createdAt, dateFrom),
    lte(salesOrders.createdAt, dateTo),
  );

  const periodKey = sql<string>`(${parseSalesOrderCreatedBucket(period)})::text`;

  const extraConds: SQL[] = [];
  if (groupBy === 'product') {
    const cond = or(isNull(products.id), eq(products.companyId, companyId));
    if (cond) extraConds.push(cond);
  } else if (groupBy === 'customer') {
    const cond = or(isNull(contacts.id), eq(contacts.companyId, companyId));
    if (cond) extraConds.push(cond);
  }

  const lineRows = await db
    .select({
      qty: salesOrderItems.quantity,
      lineTotal: salesOrderItems.lineTotal,
      taxRate: salesOrderItems.taxRate,
      orderCurrency: salesOrders.currency,
      orderCreatedAt: salesOrders.createdAt,
      productId: salesOrderItems.productId,
      productName: products.name,
      lineDescription: salesOrderItems.description,
      contactId: salesOrders.contactId,
      contactName: contacts.name,
      periodBucket: periodKey,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .leftJoin(products, eq(salesOrderItems.productId, products.id))
    .leftJoin(contacts, eq(salesOrders.contactId, contacts.id))
    .where(extraConds.length ? and(windowCond, ...extraConds) : windowCond);

  type Agg = { label: string; quantity: number; revenue: number; tax: number };
  const map = new Map<string, Agg>();

  let anon = 0;
  for (const row of lineRows) {
    const qty = num(row.qty);
    const lineTotal = num(row.lineTotal);
    const taxRate = num(row.taxRate);
    const taxable = lineTotal;
    const taxAmt = taxable * (taxRate / 100);
    const asOf = row.orderCreatedAt ?? null;
    const cur = row.orderCurrency;

    const revenueBase = await amountToBase(companyId, taxable, cur, asOf, currencyContext);
    const taxBase = await amountToBase(companyId, taxAmt, cur, asOf, currencyContext);

    let key: string;
    let label: string;
    if (groupBy === 'product') {
      key = String(row.productId ?? `n-${anon++}`);
      label = row.productName ?? row.lineDescription ?? 'Line item';
    } else if (groupBy === 'customer') {
      key = String(row.contactId ?? `n-${anon++}`);
      label = row.contactName ?? 'Walk-in';
    } else {
      key = row.periodBucket;
      label = row.periodBucket;
    }

    const curAgg = map.get(key) ?? { label, quantity: 0, revenue: 0, tax: 0 };
    curAgg.label = label;
    curAgg.quantity += qty;
    curAgg.revenue += revenueBase;
    curAgg.tax += taxBase;
    map.set(key, curAgg);
  }

  const out = [...map.entries()].map(([k, v]) => ({
    key: k,
    label: v.label,
    quantity: v.quantity,
    revenue: v.revenue,
    tax: v.tax,
  }));
  out.sort((a, b) => (groupBy === 'period' ? a.key.localeCompare(b.key) : b.revenue - a.revenue));
  return applyPagination(out, pagination);
}

export async function getInventoryValuationReport(
  companyId: number,
  pagination?: ReportPagination,
): Promise<
  PagedReportResult<{
    productId: number;
    productName: string;
    sku: string | null;
    categoryName: string | null;
    quantity: number;
    unitCost: number;
    totalValue: number;
  }>
> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      categoryName: productCategories.name,
      quantity: sql<number>`coalesce(sum(${stockLevels.quantity}::numeric), 0)`,
      unitCost: sql<number>`coalesce(max(${products.costPrice}::numeric), 0)`,
      currency: products.currency,
      asOf: products.updatedAt,
    })
    .from(stockLevels)
    .innerJoin(products, eq(stockLevels.productId, products.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(stockLevels.companyId, companyId), eq(products.companyId, companyId)))
    .groupBy(
      products.id,
      products.name,
      products.sku,
      productCategories.name,
      products.currency,
      products.updatedAt,
    )
    .orderBy(
      desc(
        sql`coalesce(sum(${stockLevels.quantity}::numeric * coalesce(${products.costPrice}::numeric, 0)), 0)`,
      ),
    );

  const out: Array<{
    productId: number;
    productName: string;
    sku: string | null;
    categoryName: string | null;
    quantity: number;
    unitCost: number;
    totalValue: number;
  }> = [];

  for (const r of rows) {
    const qty = num(r.quantity);
    const unitCostTx = num(r.unitCost);
    const unitCostBase = await amountToBase(companyId, unitCostTx, r.currency ?? null, r.asOf ?? null, currencyContext);
    const totalValue = qty * unitCostBase;
    out.push({
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      categoryName: r.categoryName,
      quantity: qty,
      unitCost: unitCostBase,
      totalValue,
    });
  }

  out.sort((a, b) => b.totalValue - a.totalValue);
  return applyPagination(out, pagination);
}

export async function getPurchaseReport(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
  pagination?: ReportPagination,
): Promise<
  PagedReportResult<{
    supplierId: number | null;
    supplierName: string;
    orderCount: number;
    totalAmount: number;
    receivedOrderCount: number;
    receivedAmount: number;
  }>
> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const orders = await db
    .select({
      supplierId: purchaseOrders.supplierId,
      supplierName: sql<string>`coalesce(${suppliers.name}, 'Unknown supplier')`,
      totalAmount: purchaseOrders.totalAmount,
      currency: purchaseOrders.currency,
      createdAt: purchaseOrders.createdAt,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        gte(purchaseOrders.createdAt, dateFrom),
        lte(purchaseOrders.createdAt, dateTo),
      ),
    );

  type Agg = {
    supplierId: number | null;
    supplierName: string;
    orderCount: number;
    totalAmount: number;
    receivedOrderCount: number;
    receivedAmount: number;
  };
  const map = new Map<string, Agg>();

  for (const o of orders) {
    const sid = o.supplierId;
    const key = sid != null ? `s:${sid}` : 's:null';
    const name = o.supplierName;
    const cur = map.get(key) ?? {
      supplierId: sid,
      supplierName: name,
      orderCount: 0,
      totalAmount: 0,
      receivedOrderCount: 0,
      receivedAmount: 0,
    };
    cur.supplierName = name;
    cur.orderCount += 1;
    const amtBase = await amountToBase(companyId, num(o.totalAmount), o.currency, o.createdAt ?? null, currencyContext);
    cur.totalAmount += amtBase;
    if (o.status === 'received') {
      cur.receivedOrderCount += 1;
      cur.receivedAmount += amtBase;
    }
    map.set(key, cur);
  }

  const out = [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  return applyPagination(out, pagination);
}

/** Realized sales revenue by product category (pre-tax line totals on fulfilled orders). */
export async function getRevenueByProductCategory(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ categoryId: number | null; categoryName: string; revenue: number }>> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const lineRows = await db
    .select({
      categoryId: products.categoryId,
      categoryName: sql<string>`coalesce(${productCategories.name}, 'Uncategorized')`,
      lineTotal: salesOrderItems.lineTotal,
      orderCurrency: salesOrders.currency,
      orderCreatedAt: salesOrders.createdAt,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .innerJoin(products, eq(salesOrderItems.productId, products.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(
      and(
        eq(salesOrders.companyId, companyId),
        eq(products.companyId, companyId),
        realizedSalesOrderCondition(),
        gte(salesOrders.createdAt, dateFrom),
        lte(salesOrders.createdAt, dateTo),
        or(isNull(productCategories.id), eq(productCategories.companyId, companyId)),
      ),
    );

  const map = new Map<string, { categoryId: number | null; categoryName: string; revenue: number }>();
  for (const row of lineRows) {
    const key =
      row.categoryId != null ? `c:${row.categoryId}` : `c:null:${row.categoryName}`;
    const line = num(row.lineTotal);
    const revBase = await amountToBase(companyId, line, row.orderCurrency, row.orderCreatedAt ?? null, currencyContext);
    const cur = map.get(key) ?? {
      categoryId: row.categoryId ?? null,
      categoryName: row.categoryName,
      revenue: 0,
    };
    cur.revenue += revBase;
    map.set(key, cur);
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export async function getTopCustomersByRevenue(
  companyId: number,
  limit: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ contactId: number | null; customerName: string; revenue: number }>> {
  const lim = Math.min(Math.max(limit, 1), 100);
  const currencyContext = createCurrencyConversionContext(companyId);
  const lineRows = await db
    .select({
      contactId: salesOrders.contactId,
      customerName: sql<string>`coalesce(${contacts.name}, 'Walk-in')`,
      lineTotal: salesOrderItems.lineTotal,
      orderCurrency: salesOrders.currency,
      orderCreatedAt: salesOrders.createdAt,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .leftJoin(contacts, eq(salesOrders.contactId, contacts.id))
    .where(
      and(
        eq(salesOrders.companyId, companyId),
        realizedSalesOrderCondition(),
        gte(salesOrders.createdAt, dateFrom),
        lte(salesOrders.createdAt, dateTo),
        or(isNull(contacts.id), eq(contacts.companyId, companyId)),
      ),
    );

  const map = new Map<string, { contactId: number | null; customerName: string; revenue: number }>();
  for (const row of lineRows) {
    const cid = row.contactId;
    const key = cid != null ? `k:${cid}` : `anon:${row.customerName}`;
    const line = num(row.lineTotal);
    const revBase = await amountToBase(companyId, line, row.orderCurrency, row.orderCreatedAt ?? null, currencyContext);
    const cur = map.get(key) ?? {
      contactId: cid ?? null,
      customerName: row.customerName,
      revenue: 0,
    };
    cur.customerName = row.customerName;
    cur.revenue += revBase;
    map.set(key, cur);
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, lim);
}

/**
 * Cost of goods sold (qty × unit cost) by period vs current inventory value.
 * Turnover = period COGS / current total inventory value (constant denominator for the series).
 */
export async function getInventoryTurnoverSeries(
  companyId: number,
  period: ReportPeriod,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ periodStart: string; cogsAtCost: number; inventoryValue: number; turnover: number }>> {
  const bucket = parseSalesOrderCreatedBucket(period);
  const currencyContext = createCurrencyConversionContext(companyId);
  const inv = await getInventoryValue(companyId, currencyContext);
  const invVal = inv.totalValue;
  const denom = Math.max(invVal, 1e-9);

  const lineRows = await db
    .select({
      periodStart: sql<string>`(${bucket})::text`,
      createdAt: salesOrders.createdAt,
      qty: salesOrderItems.quantity,
      cost: products.costPrice,
      currency: products.currency,
    })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
    .innerJoin(products, eq(salesOrderItems.productId, products.id))
    .where(
      and(
        eq(salesOrders.companyId, companyId),
        eq(products.companyId, companyId),
        realizedSalesOrderCondition(),
        gte(salesOrders.createdAt, dateFrom),
        lte(salesOrders.createdAt, dateTo),
        isNotNull(salesOrderItems.productId),
      ),
    );

  const cogsByPeriod = new Map<string, number>();
  for (const row of lineRows) {
    const asOf = row.createdAt ?? null;
    const lineCogs = num(row.qty) * num(row.cost);
    const cogsBase = await amountToBase(companyId, lineCogs, row.currency ?? null, asOf, currencyContext);
    const k = row.periodStart;
    cogsByPeriod.set(k, (cogsByPeriod.get(k) ?? 0) + cogsBase);
  }

  const rows = [...cogsByPeriod.entries()]
    .map(([periodStart, cogsAtCost]) => ({
      periodStart,
      cogsAtCost,
      inventoryValue: invVal,
      turnover: denom > 0 ? cogsAtCost / denom : 0,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  return rows;
}

function parseRestaurantTicketBucket(period: ReportPeriod) {
  switch (period) {
    case 'daily':
      return sql`date_trunc('day', ${restaurantKitchenTickets.readyAt})`;
    case 'weekly':
      return sql`date_trunc('week', ${restaurantKitchenTickets.readyAt})`;
    case 'monthly':
    default:
      return sql`date_trunc('month', ${restaurantKitchenTickets.readyAt})`;
  }
}

export async function getRestaurantOrderMix(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ serviceType: string; count: number; revenue: number }>> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const rows = await db
    .select({
      serviceType: restaurantOrderContexts.serviceType,
      totalAmount: salesOrders.totalAmount,
      currency: salesOrders.currency,
      createdAt: salesOrders.createdAt,
    })
    .from(restaurantOrderContexts)
    .innerJoin(salesOrders, eq(restaurantOrderContexts.salesOrderId, salesOrders.id))
    .where(
      and(
        eq(restaurantOrderContexts.companyId, companyId),
        eq(salesOrders.companyId, companyId),
        gte(salesOrders.createdAt, dateFrom),
        lte(salesOrders.createdAt, dateTo),
      ),
    );

  const map = new Map<string, { serviceType: string; count: number; revenue: number }>();
  for (const row of rows) {
    const serviceType = row.serviceType ?? 'unknown';
    const entry = map.get(serviceType) ?? { serviceType, count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += await amountToBase(companyId, num(row.totalAmount), row.currency, row.createdAt ?? null, currencyContext);
    map.set(serviceType, entry);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export async function getRestaurantTicketThroughput(
  companyId: number,
  period: ReportPeriod,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ periodStart: string; ticketsCompleted: number; avgMinutesToReady: number }>> {
  const bucket = parseRestaurantTicketBucket(period);
  const rows = await db
    .select({
      periodStart: sql<string>`(${bucket})::text`,
      ticketsCompleted: sql<number>`count(*)::int`,
      avgMinutesToReady: sql<number>`coalesce(avg(extract(epoch from (${restaurantKitchenTickets.readyAt} - ${restaurantKitchenTickets.firedAt})) / 60.0), 0)`,
    })
    .from(restaurantKitchenTickets)
    .where(
      and(
        eq(restaurantKitchenTickets.companyId, companyId),
        inArray(restaurantKitchenTickets.status, ['ready', 'served']),
        isNotNull(restaurantKitchenTickets.readyAt),
        gte(restaurantKitchenTickets.readyAt, dateFrom),
        lte(restaurantKitchenTickets.readyAt, dateTo),
      ),
    )
    .groupBy(sql`${bucket}`)
    .orderBy(sql`${bucket}`);

  return rows.map((row) => ({
    periodStart: row.periodStart,
    ticketsCompleted: num(row.ticketsCompleted),
    avgMinutesToReady: num(row.avgMinutesToReady),
  }));
}

export async function getRestaurantTableTurnover(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ tableId: number; tableLabel: string; completedSessions: number; avgDurationMinutes: number }>> {
  const rows = await db
    .select({
      tableId: restaurantTables.id,
      tableLabel: restaurantTables.label,
      completedSessions: sql<number>`count(*)::int`,
      avgDurationMinutes: sql<number>`coalesce(avg(extract(epoch from (${restaurantOrderContexts.updatedAt} - ${restaurantOrderContexts.createdAt})) / 60.0), 0)`,
    })
    .from(restaurantOrderContexts)
    .innerJoin(restaurantTables, eq(restaurantOrderContexts.tableId, restaurantTables.id))
    .where(
      and(
        eq(restaurantOrderContexts.companyId, companyId),
        eq(restaurantTables.companyId, companyId),
        eq(restaurantOrderContexts.status, 'completed'),
        gte(restaurantOrderContexts.updatedAt, dateFrom),
        lte(restaurantOrderContexts.updatedAt, dateTo),
      ),
    )
    .groupBy(restaurantTables.id, restaurantTables.label)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({
    tableId: row.tableId,
    tableLabel: row.tableLabel,
    completedSessions: num(row.completedSessions),
    avgDurationMinutes: num(row.avgDurationMinutes),
  }));
}

export async function getRestaurantReservationLoad(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ date: string; booked: number; seated: number; noShow: number; cancelled: number }>> {
  const dayBucket = sql`date_trunc('day', ${restaurantReservations.reservationAt})`;
  const rows = await db
    .select({
      date: sql<string>`${dayBucket}::text`,
      status: restaurantReservations.status,
      count: sql<number>`count(*)::int`,
    })
    .from(restaurantReservations)
    .where(
      and(
        eq(restaurantReservations.companyId, companyId),
        gte(restaurantReservations.reservationAt, dateFrom),
        lte(restaurantReservations.reservationAt, dateTo),
      ),
    )
    .groupBy(sql`${dayBucket}`, restaurantReservations.status)
    .orderBy(sql`${dayBucket}`);

  const map = new Map<string, { date: string; booked: number; seated: number; noShow: number; cancelled: number }>();
  for (const row of rows) {
    const entry = map.get(row.date) ?? { date: row.date, booked: 0, seated: 0, noShow: 0, cancelled: 0 };
    const count = num(row.count);
    if (row.status === 'booked') entry.booked += count;
    else if (row.status === 'seated') entry.seated += count;
    else if (row.status === 'no_show') entry.noShow += count;
    else if (row.status === 'cancelled') entry.cancelled += count;
    map.set(row.date, entry);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRestaurantTipAndServiceChargeTotals(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<{ tipTotal: number; serviceChargeTotal: number }> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const rows = await db
    .select({
      tipAmount: invoices.tipAmount,
      serviceChargeAmount: invoices.serviceChargeAmount,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
    })
    .from(invoices)
    .innerJoin(salesOrders, eq(invoices.salesOrderId, salesOrders.id))
    .innerJoin(restaurantOrderContexts, eq(restaurantOrderContexts.salesOrderId, salesOrders.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(salesOrders.companyId, companyId),
        eq(restaurantOrderContexts.companyId, companyId),
        isNotNull(invoices.salesOrderId),
        gte(invoices.issueDate, dateFrom),
        lte(invoices.issueDate, dateTo),
      ),
    );

  let tipTotal = 0;
  let serviceChargeTotal = 0;
  for (const row of rows) {
    tipTotal += await amountToBase(companyId, num(row.tipAmount), row.currency, row.issueDate ?? null, currencyContext);
    serviceChargeTotal += await amountToBase(companyId, num(row.serviceChargeAmount), row.currency, row.issueDate ?? null, currencyContext);
  }
  return { tipTotal, serviceChargeTotal };
}

export async function getRestaurantIngredientRisk(
  companyId: number,
): Promise<Array<{ productId: number; productName: string; currentQty: number; reorderPoint: number; riskLevel: 'ok' | 'low' | 'critical' }>> {
  const recipeRows = await db
    .select({ recipeIngredients: products.recipeIngredients })
    .from(products)
    .where(
      and(
        eq(products.companyId, companyId),
        sql`coalesce(jsonb_array_length(${products.recipeIngredients}), 0) > 0`,
      ),
    );

  const ingredientRefs = new Set<string>();
  const ingredientProductIds = new Set<number>();
  for (const row of recipeRows) {
    const recipeIngredients = Array.isArray(row.recipeIngredients)
      ? (row.recipeIngredients as Array<{ productId?: number; variantId?: number | null }>)
      : [];
    for (const ingredient of recipeIngredients) {
      const ingredientProductId = Number(ingredient?.productId);
      if (!Number.isFinite(ingredientProductId) || ingredientProductId <= 0) continue;
      const ingredientVariantId =
        ingredient?.variantId == null ? null : Number(ingredient.variantId);
      if (ingredientVariantId != null && (!Number.isFinite(ingredientVariantId) || ingredientVariantId <= 0)) continue;
      ingredientRefs.add(`${ingredientProductId}:${ingredientVariantId ?? 'null'}`);
      ingredientProductIds.add(ingredientProductId);
    }
  }

  if (ingredientRefs.size === 0 || ingredientProductIds.size === 0) return [];

  const variantScopedConditions = [...ingredientRefs].map((ref) => {
    const [productPart, variantPart] = ref.split(':');
    const ingredientProductId = Number(productPart);
    if (!Number.isFinite(ingredientProductId) || ingredientProductId <= 0) return null;
    if (variantPart === 'null') {
      return and(eq(stockLevels.productId, ingredientProductId), isNull(stockLevels.variantId));
    }
    const ingredientVariantId = Number(variantPart);
    if (!Number.isFinite(ingredientVariantId) || ingredientVariantId <= 0) return null;
    return and(eq(stockLevels.productId, ingredientProductId), eq(stockLevels.variantId, ingredientVariantId));
  }).filter((condition): condition is SQL => condition != null);

  const stockFilter: SQL = variantScopedConditions.length > 0 ? or(...variantScopedConditions)! : sql`false`;
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      currentQty: sql<number>`coalesce(sum(${stockLevels.quantity}::numeric), 0)`,
      reorderPoint: sql<number>`coalesce(max(${stockLevels.reorderPoint}::numeric), 0)`,
    })
    .from(products)
    .leftJoin(
      stockLevels,
      and(
        eq(stockLevels.companyId, companyId),
        eq(stockLevels.productId, products.id),
        stockFilter,
      ),
    )
    .where(
      and(
        eq(products.companyId, companyId),
        inArray(products.id, [...ingredientProductIds]),
      ),
    )
    .groupBy(products.id, products.name)
    .orderBy(products.name);

  return rows.map((row) => {
    const currentQty = num(row.currentQty);
    const reorderPoint = num(row.reorderPoint);
    const riskLevel: 'ok' | 'low' | 'critical' =
      reorderPoint <= 0 ? 'ok' : currentQty <= reorderPoint * 0.5 ? 'critical' : currentQty <= reorderPoint ? 'low' : 'ok';
    return {
      productId: row.productId,
      productName: row.productName,
      currentQty,
      reorderPoint,
      riskLevel,
    };
  });
}

/** Tax from line items where tax_rate > 0, grouped by invoice type and month. */
export async function getTaxCollectedReport(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
  pagination?: ReportPagination,
): Promise<PagedReportResult<{ period: string; invoiceType: string; taxAmount: number }>> {
  const currencyContext = createCurrencyConversionContext(companyId);
  const monthBucket = sql<string>`date_trunc('month', ${invoices.issueDate})::text`;
  const lineRows = await db
    .select({
      period: monthBucket,
      issueDate: invoices.issueDate,
      invoiceType: invoices.type,
      lineTotal: invoiceItems.lineTotal,
      taxRate: invoiceItems.taxRate,
      currency: invoices.currency,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, dateFrom),
        lte(invoices.issueDate, dateTo),
        sql`${invoiceItems.taxRate}::numeric > 0`,
      ),
    );

  const map = new Map<string, { period: string; invoiceType: string; taxAmount: number }>();
  for (const row of lineRows) {
    const id = row.issueDate ?? new Date();
    const period = row.period;
    const key = `${period}|${row.invoiceType}`;
    const taxable = num(row.lineTotal);
    const taxAmt = taxable * (num(row.taxRate) / 100);
    const taxBase = await amountToBase(companyId, taxAmt, row.currency, id, currencyContext);
    const cur = map.get(key) ?? { period, invoiceType: row.invoiceType, taxAmount: 0 };
    cur.taxAmount += taxBase;
    map.set(key, cur);
  }

  const out = [...map.values()].sort((a, b) => a.period.localeCompare(b.period) || a.invoiceType.localeCompare(b.invoiceType));
  return applyPagination(out, pagination);
}

export async function getEmployeeHeadcountSummary(companyId: number, pagination?: ReportPagination): Promise<{
  byDepartment: Array<{ departmentId: number | null; departmentName: string; headcount: number }>;
  byStatus: Array<{ status: string; headcount: number }>;
  totalEmployees: number;
  departmentTotal: number;
  latestPayroll: null | {
    id: number;
    periodStart: string;
    periodEnd: string;
    totalGross: string;
    totalNet: string;
    status: string;
  };
}> {
  const [firstEmployeePage, departments, payrollResult] = await Promise.all([
    storage.getEmployees(companyId, { limit: 1000, offset: 0 }),
    storage.getDepartments(companyId),
    storage.getPayrollRuns(companyId, { limit: 1, offset: 0 }),
  ]);

  const employees = [...firstEmployeePage.data];
  const totalEmployees = firstEmployeePage.total;
  for (let offset = employees.length; offset < totalEmployees; offset += 1000) {
    const page = await storage.getEmployees(companyId, { limit: 1000, offset });
    employees.push(...page.data);
  }

  const deptName = new Map<number, string>();
  for (const d of departments) {
    deptName.set(d.id, d.name);
  }

  const byDeptMap = new Map<string, { departmentId: number | null; departmentName: string; headcount: number }>();
  const byStatusMap = new Map<string, number>();

  for (const e of employees) {
    const status = e.status;
    byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + 1);

    const did = e.departmentId;
    const dname = did != null ? deptName.get(did) ?? 'Department' : 'Unassigned';
    const key = did != null ? `id:${did}` : 'unassigned';
    const cur = byDeptMap.get(key) ?? { departmentId: did, departmentName: dname, headcount: 0 };
    cur.headcount += 1;
    byDeptMap.set(key, cur);
  }

  const latest = payrollResult.data[0];
  const byDepartment = [...byDeptMap.values()].sort((a, b) => b.headcount - a.headcount);

  return {
    byDepartment: applyPagination(byDepartment, pagination).data,
    byStatus: [...byStatusMap.entries()].map(([status, headcount]) => ({ status, headcount })),
    totalEmployees,
    departmentTotal: byDepartment.length,
    latestPayroll: latest
      ? {
          id: latest.id,
          periodStart: latest.periodStart instanceof Date ? latest.periodStart.toISOString() : String(latest.periodStart),
          periodEnd: latest.periodEnd instanceof Date ? latest.periodEnd.toISOString() : String(latest.periodEnd),
          totalGross: String(latest.totalGross),
          totalNet: String(latest.totalNet),
          status: latest.status,
        }
      : null,
  };
}

const PENDING_ORDER_STATUSES = ['draft', 'quotation', 'confirmed', 'processing'] as const;

/** Open AR/AP remaining balance (base currency) for invoices issued in [dateFrom, dateTo]. */
async function sumOpenArApFromInvoicesIssuedBetween(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
  currencyContext: CurrencyConversionContext,
): Promise<{ openAr: number; openAp: number }> {
  const now = new Date();

  const arOpen = await db
    .select({
      remaining: sql<string>`(${accountsReceivable.amount}::numeric - ${accountsReceivable.paidAmount}::numeric)::text`,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
    })
    .from(accountsReceivable)
    .innerJoin(invoices, and(eq(accountsReceivable.invoiceId, invoices.id), eq(invoices.companyId, companyId)))
    .where(
      and(
        eq(accountsReceivable.companyId, companyId),
        or(
          eq(accountsReceivable.status, 'open' as any),
          eq(accountsReceivable.status, 'partially_paid' as any),
          eq(accountsReceivable.status, 'overdue' as any),
        ),
        gte(invoices.issueDate, dateFrom),
        lte(invoices.issueDate, dateTo),
      ),
    );

  const apOpen = await db
    .select({
      remaining: sql<string>`(${accountsPayable.amount}::numeric - ${accountsPayable.paidAmount}::numeric)::text`,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
    })
    .from(accountsPayable)
    .innerJoin(invoices, and(eq(accountsPayable.invoiceId, invoices.id), eq(invoices.companyId, companyId)))
    .where(
      and(
        eq(accountsPayable.companyId, companyId),
        or(
          eq(accountsPayable.status, 'open' as any),
          eq(accountsPayable.status, 'partially_paid' as any),
          eq(accountsPayable.status, 'overdue' as any),
        ),
        gte(invoices.issueDate, dateFrom),
        lte(invoices.issueDate, dateTo),
      ),
    );

  let openAr = 0;
  for (const row of arOpen) {
    const remaining = num(row.remaining);
    if (remaining <= 0) continue;
    const asOf = row.issueDate ?? now;
    openAr += await amountToBase(companyId, remaining, row.currency, asOf, currencyContext);
  }
  let openAp = 0;
  for (const row of apOpen) {
    const remaining = num(row.remaining);
    if (remaining <= 0) continue;
    const asOf = row.issueDate ?? now;
    openAp += await amountToBase(companyId, remaining, row.currency, asOf, currencyContext);
  }
  return { openAr, openAp };
}

/**
 * ERP dashboard KPI snapshot. When `dateRange` is set (dashboard date filter), revenue, pipeline-style
 * counts, overdue, and AR/AP reflect that window. When omitted, behavior matches the legacy snapshot
 * (rolling 30d revenue, all pending orders, etc.).
 */
export async function getKpiSnapshot(
  companyId: number,
  isRestaurant = false,
  dateRange?: { from: Date; to: Date },
): Promise<{
  revenueLast30Days: number;
  pendingOrders: number;
  lowStockCount: number;
  overdueInvoices: number;
  openAr: number;
  openAp: number;
  activeKitchenTickets?: number;
  pendingDeliveries?: number;
}> {
  const now = new Date();
  const defaultRevFrom = new Date(now);
  defaultRevFrom.setDate(defaultRevFrom.getDate() - 30);
  const revenueFrom = dateRange?.from ?? defaultRevFrom;
  const revenueTo = dateRange?.to ?? now;
  const currencyContext = createCurrencyConversionContext(companyId);

  const [pendingOrders, overdueInvoices, lowStock, arApPartial, paymentsInRange, restaurantCounts] = await Promise.all([
    dateRange
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(salesOrders)
          .where(
            and(
              eq(salesOrders.companyId, companyId),
              inArray(salesOrders.status, [...PENDING_ORDER_STATUSES]),
              gte(salesOrders.createdAt, dateRange.from),
              lte(salesOrders.createdAt, dateRange.to),
            ),
          )
          .then((r) => num(r[0]?.count))
      : getOrderPipelineSummary(companyId).then((pipeline) =>
          pipeline
            .filter((p) => (PENDING_ORDER_STATUSES as readonly string[]).includes(p.status))
            .reduce((s, p) => s + p.count, 0),
        ),
    dateRange
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, companyId),
              eq(invoices.status, 'overdue'),
              gte(sql`coalesce(${invoices.dueDate}, ${invoices.issueDate})`, dateRange.from),
              lte(sql`coalesce(${invoices.dueDate}, ${invoices.issueDate})`, dateRange.to),
            ),
          )
          .then((r) => num(r[0]?.count))
      : storage.getInvoices(companyId, { status: 'overdue', limit: 1, offset: 0 }).then((x) => x.total),
    storage.getStockLevels(companyId, { lowStockOnly: true, limit: 1, offset: 0 }),
    dateRange
      ? sumOpenArApFromInvoicesIssuedBetween(companyId, dateRange.from, dateRange.to, currencyContext)
      : getArApSummary(companyId).then((a) => ({ openAr: a.openAr, openAp: a.openAp })),
    db
      .select({
        amount: invoicePayments.amount,
        currency: invoices.currency,
        paymentDate: invoicePayments.paymentDate,
      })
      .from(invoicePayments)
      .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
      .where(
        and(
          eq(invoicePayments.companyId, companyId),
          eq(invoices.companyId, companyId),
          eq(invoices.type, 'sales_invoice'),
          inArray(invoices.status, [...REALIZED_CASH_RECEIPT_INVOICE_STATUSES]),
          gte(invoicePayments.paymentDate, revenueFrom),
          lte(invoicePayments.paymentDate, revenueTo),
        ),
      ),
    isRestaurant
      ? Promise.all([
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(restaurantKitchenTickets)
            .where(
              and(
                eq(restaurantKitchenTickets.companyId, companyId),
                inArray(restaurantKitchenTickets.status, ['queued', 'in_progress']),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(restaurantDeliveryDispatches)
            .where(
              and(
                eq(restaurantDeliveryDispatches.companyId, companyId),
                inArray(restaurantDeliveryDispatches.status, ['pending', 'assigned', 'in_transit']),
              ),
            ),
        ])
      : Promise.resolve(null),
  ]);

  let revenueLast30Days = 0;
  for (const p of paymentsInRange) {
    revenueLast30Days += await amountToBase(companyId, num(p.amount), p.currency, p.paymentDate ?? null, currencyContext);
  }

  const baseData = {
    revenueLast30Days,
    pendingOrders,
    lowStockCount: lowStock.total,
    overdueInvoices,
    openAr: arApPartial.openAr,
    openAp: arApPartial.openAp,
  };
  if (!isRestaurant || !restaurantCounts) return baseData;
  return {
    ...baseData,
    activeKitchenTickets: num(restaurantCounts[0][0]?.count),
    pendingDeliveries: num(restaurantCounts[1][0]?.count),
  };
}

/** New dental patient profiles grouped by creation day. */
export async function getDentalPatientActivity(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ date: string; newPatients: number }>> {
  const day = sql`date_trunc('day', ${dentalPatientProfiles.createdAt})`;
  const rows = await db
    .select({ date: sql<string>`${day}::text`, newPatients: sql<number>`count(*)::int` })
    .from(dentalPatientProfiles)
    .where(
      and(
        eq(dentalPatientProfiles.companyId, companyId),
        gte(dentalPatientProfiles.createdAt, dateFrom),
        lte(dentalPatientProfiles.createdAt, dateTo),
      ),
    )
    .groupBy(day)
    .orderBy(day);

  return rows.map((row) => ({ date: row.date, newPatients: num(row.newPatients) }));
}

/** Dental appointments grouped by scheduled day and lifecycle status. */
export async function getDentalScheduleFlow(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ date: string; scheduled: number; confirmed: number; completed: number; cancelled: number; noShow: number }>> {
  const day = sql`date_trunc('day', ${contactAppointments.scheduledAt})`;
  const rows = await db
    .select({
      date: sql<string>`${day}::text`,
      status: contactAppointments.status,
      count: sql<number>`count(*)::int`,
    })
    .from(contactAppointments)
    .where(
      and(
        eq(contactAppointments.companyId, companyId),
        gte(contactAppointments.scheduledAt, dateFrom),
        lte(contactAppointments.scheduledAt, dateTo),
      ),
    )
    .groupBy(day, contactAppointments.status)
    .orderBy(day);

  const result = new Map<string, { date: string; scheduled: number; confirmed: number; completed: number; cancelled: number; noShow: number }>();
  for (const row of rows) {
    const entry = result.get(row.date) ?? { date: row.date, scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, noShow: 0 };
    const count = num(row.count);
    if (row.status === 'scheduled') entry.scheduled += count;
    else if (row.status === 'confirmed') entry.confirmed += count;
    else if (row.status === 'completed') entry.completed += count;
    else if (row.status === 'cancelled' || row.status === 'rescheduled') entry.cancelled += count;
    else if (row.status === 'no_show') entry.noShow += count;
    result.set(row.date, entry);
  }
  return [...result.values()];
}

/** Dental treatment plans grouped by status for plans created in the selected range. */
export async function getDentalTreatmentPlanSummary(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Array<{ status: string; count: number; estimatedTotal: number }>> {
  const rows = await db
    .select({
      status: dentalTreatmentPlans.status,
      count: sql<number>`count(*)::int`,
      estimatedTotal: sql<string>`coalesce(sum(${dentalTreatmentPlans.estimatedTotal}::numeric), 0)::text`,
    })
    .from(dentalTreatmentPlans)
    .where(
      and(
        eq(dentalTreatmentPlans.companyId, companyId),
        gte(dentalTreatmentPlans.createdAt, dateFrom),
        lte(dentalTreatmentPlans.createdAt, dateTo),
      ),
    )
    .groupBy(dentalTreatmentPlans.status)
    .orderBy(dentalTreatmentPlans.status);

  return rows.map((row) => ({
    status: row.status,
    count: num(row.count),
    estimatedTotal: num(row.estimatedTotal),
  }));
}

export async function getDentalAppointmentsToday(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<{ total: number; byStatus: Array<{ status: string; count: number }> }> {
  const rows = await db
    .select({ status: contactAppointments.status, count: sql<number>`count(*)::int` })
    .from(contactAppointments)
    .where(and(eq(contactAppointments.companyId, companyId), gte(contactAppointments.scheduledAt, dateFrom), lte(contactAppointments.scheduledAt, dateTo)))
    .groupBy(contactAppointments.status)
    .orderBy(contactAppointments.status);
  return { total: rows.reduce((sum, row) => sum + num(row.count), 0), byStatus: rows.map((row) => ({ status: row.status, count: num(row.count) })) };
}

export async function getDentalProviderPerformance(companyId: number, dateFrom: Date, dateTo: Date) {
  const rows = await db
    .select({
      providerId: contactAppointments.providerUserId,
      providerName: sql<string>`coalesce(${users.fullName}, 'Unassigned')`,
      appointments: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${contactAppointments.status} = 'completed')::int`,
      noShows: sql<number>`count(*) filter (where ${contactAppointments.status} = 'no_show')::int`,
    })
    .from(contactAppointments)
    .leftJoin(users, eq(users.id, contactAppointments.providerUserId))
    .where(and(eq(contactAppointments.companyId, companyId), gte(contactAppointments.scheduledAt, dateFrom), lte(contactAppointments.scheduledAt, dateTo)))
    .groupBy(contactAppointments.providerUserId, users.fullName)
    .orderBy(desc(sql`count(*)`));
  return rows.map((row) => ({ providerId: row.providerId, providerName: row.providerName, appointments: num(row.appointments), completed: num(row.completed), noShows: num(row.noShows) }));
}

export async function getDentalProcedureRevenue(companyId: number, dateFrom: Date, dateTo: Date) {
  const rows = await db
    .select({
      procedure: dentalTreatmentProcedures.description,
      revenue: sql<string>`coalesce(sum(${invoiceItems.lineTotal}::numeric), 0)::text`,
    })
    .from(dentalTreatmentProcedures)
    .innerJoin(dentalTreatmentPlans, and(eq(dentalTreatmentPlans.id, dentalTreatmentProcedures.planId), eq(dentalTreatmentPlans.companyId, companyId)))
    .innerJoin(invoices, and(eq(invoices.salesOrderId, dentalTreatmentPlans.salesOrderId), eq(invoices.companyId, companyId)))
    .innerJoin(invoiceItems, and(eq(invoiceItems.invoiceId, invoices.id), eq(invoiceItems.productId, dentalTreatmentProcedures.productId)))
    .where(and(gte(dentalTreatmentPlans.createdAt, dateFrom), lte(dentalTreatmentPlans.createdAt, dateTo), inArray(invoices.status, ['sent', 'partially_paid', 'paid', 'overdue']), inArray(dentalTreatmentProcedures.status, ['invoiced', 'completed'])))
    .groupBy(dentalTreatmentProcedures.description)
    .orderBy(desc(sql`sum(${invoiceItems.lineTotal}::numeric)`));
  return rows.map((row) => ({ procedure: row.procedure, revenue: num(row.revenue) }));
}

export async function getDentalFollowUps(companyId: number, dateFrom: Date, dateTo: Date) {
  const rows = await db
    .select({
      recallsDue: sql<number>`count(*) filter (where ${contactAppointments.isRecall} = true and ${contactAppointments.recallDueAt} is not null and ${contactAppointments.recallDueAt} <= ${dateTo})::int`,
      noShows: sql<number>`count(*) filter (where ${contactAppointments.status} = 'no_show')::int`,
    })
    .from(contactAppointments)
    .where(and(eq(contactAppointments.companyId, companyId), gte(contactAppointments.scheduledAt, dateFrom), lte(contactAppointments.scheduledAt, dateTo)));
  const row = rows[0] ?? { recallsDue: 0, noShows: 0 };
  return { recallsDue: num(row.recallsDue), noShows: num(row.noShows) };
}
