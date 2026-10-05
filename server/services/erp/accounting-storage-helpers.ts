import { and, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import {
  accountsPayable,
  accountsReceivable,
  journalEntries,
  type AccountPayable,
  type AccountReceivable,
  type JournalEntry,
} from "@shared/schema";

export function fiscalYearRangesOverlap(
  left: { startDate: Date; endDate: Date },
  right: { startDate: Date; endDate: Date },
) {
  return left.startDate < right.endDate && left.endDate > right.startDate;
}

export function buildJournalEntriesWhereClause(
  companyId: number,
  filters?: { status?: string; referenceType?: string; fiscalYearId?: number; dateFrom?: Date; dateTo?: Date; search?: string }
) {
  const conditions: SQL[] = [eq(journalEntries.companyId, companyId)];
  if (filters?.status) {
    conditions.push(eq(journalEntries.status, filters.status as JournalEntry["status"]));
  }
  if (filters?.referenceType) {
    conditions.push(eq(journalEntries.referenceType, filters.referenceType as JournalEntry["referenceType"]));
  }
  if (filters?.fiscalYearId) {
    conditions.push(eq(journalEntries.fiscalYearId, filters.fiscalYearId));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(journalEntries.date, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(journalEntries.date, filters.dateTo));
  }
  if (filters?.search) {
    conditions.push(ilike(journalEntries.description, `%${filters.search}%`));
  }
  return and(...conditions);
}

export function buildAccountsReceivableWhereClause(
  companyId: number,
  filters?: { contactId?: number; status?: string }
) {
  const conditions: SQL[] = [eq(accountsReceivable.companyId, companyId)];
  if (filters?.contactId) {
    conditions.push(eq(accountsReceivable.contactId, filters.contactId));
  }
  if (filters?.status) {
    conditions.push(eq(accountsReceivable.status, filters.status as AccountReceivable["status"]));
  }
  return and(...conditions);
}

export function buildAccountsPayableWhereClause(
  companyId: number,
  filters?: { supplierId?: number; status?: string }
) {
  const conditions: SQL[] = [eq(accountsPayable.companyId, companyId)];
  if (filters?.supplierId) {
    conditions.push(eq(accountsPayable.supplierId, filters.supplierId));
  }
  if (filters?.status) {
    conditions.push(eq(accountsPayable.status, filters.status as AccountPayable["status"]));
  }
  return and(...conditions);
}

type CountRow = { count?: number | string; c?: number | string };
type QueryBuilder<T> = PromiseLike<T[]> & {
  where(whereClause: SQL | undefined): QueryBuilder<T>;
  orderBy(...args: unknown[]): QueryBuilder<T>;
  limit(value: number): QueryBuilder<T>;
  offset(value: number): QueryBuilder<T>;
};

export async function executeScopedPagedQuery<T>({
  dataQuery,
  countQuery,
  whereClause,
  limit,
  offset,
  orderBy,
}: {
  dataQuery: QueryBuilder<T>;
  countQuery: QueryBuilder<CountRow>;
  whereClause: SQL | undefined;
  limit?: number;
  offset?: number;
  orderBy: unknown[];
}) {
  const [countRow] = await countQuery.where(whereClause);
  const total = Number(countRow?.count ?? countRow?.c ?? 0);

  let scopedDataQuery = dataQuery.where(whereClause).orderBy(...orderBy);
  if (limit) {
    scopedDataQuery = scopedDataQuery.limit(limit);
  }
  if (offset) {
    scopedDataQuery = scopedDataQuery.offset(offset);
  }

  const data = await scopedDataQuery;
  return { data, total };
}
