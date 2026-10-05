import { z } from 'zod';

export type DentalScheduleSortColumn = 'scheduledAt' | 'patient' | 'title' | 'provider' | 'chair' | 'status';
export type DentalScheduleSortDirection = 'asc' | 'desc';
export const DEFAULT_DENTAL_SCHEDULE_SORT_COLUMN: DentalScheduleSortColumn = 'scheduledAt';
export const DEFAULT_DENTAL_SCHEDULE_SORT_DIRECTION: DentalScheduleSortDirection = 'desc';
export const dentalAppointmentColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a six-digit hex color');
export const dentalAppointmentColorOverrideSchema = dentalAppointmentColorSchema.nullable();

type SortableDentalScheduleRow = {
  scheduledAt: string | Date;
  contactId: number;
  contactName: string | null;
  title: string;
  providerName: string | null;
  chairName: string | null;
  status: string;
};

const localDateKeySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  }, 'Invalid calendar date');

export const dentalScheduleListQuerySchema = z.object({
  date: localDateKeySchema.optional(),
  fromDate: localDateKeySchema.optional(),
  toDate: localDateKeySchema.optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  providerUserId: z.coerce.number().int().positive().optional(),
  chairId: z.coerce.number().int().positive().optional(),
}).refine((value) => Boolean(value.from) === Boolean(value.to), {
  message: 'Provide both `from` and `to` when filtering by a date range',
}).refine((value) => Boolean(value.fromDate) === Boolean(value.toDate), {
  message: 'Provide both `fromDate` and `toDate` when filtering by a local date range',
}).refine((value) => !(value.date && (value.fromDate || value.toDate || value.from || value.to)), {
  message: '`date` cannot be combined with a date range',
}).refine((value) => !((value.fromDate || value.toDate) && (value.from || value.to)), {
  message: 'Use either local date bounds or timestamp bounds, not both',
}).refine((value) => !(value.fromDate && value.toDate) || value.fromDate <= value.toDate, {
  message: '`fromDate` must be on or before `toDate`',
});

export const dentalUpcomingScheduleQuerySchema = z.object({
  providerUserId: z.coerce.number().int().positive().optional(),
  chairId: z.coerce.number().int().positive().optional(),
  serviceKey: z.string().trim().min(1).max(64).optional(),
  search: z.string().trim().max(200).optional(),
  locale: z.string().trim().max(16).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['scheduledAt', 'patient', 'title', 'provider', 'chair', 'status']).default('scheduledAt'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export function buildDentalScheduleSearchParams(filters: {
  date?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  providerUserId?: string | null;
  chairId?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.fromDate && filters.toDate) {
    params.set('fromDate', filters.fromDate);
    params.set('toDate', filters.toDate);
  }
  if (filters.providerUserId && filters.providerUserId !== 'all') {
    params.set('providerUserId', filters.providerUserId);
  }
  if (filters.chairId && filters.chairId !== 'all') {
    params.set('chairId', filters.chairId);
  }
  return params;
}

export function sortDentalScheduleRows<T extends SortableDentalScheduleRow>(
  rows: T[],
  column: DentalScheduleSortColumn,
  direction: DentalScheduleSortDirection,
  locale?: string,
): T[] {
  const textValue = (row: T): string => {
    if (column === 'patient') return row.contactName || `#${row.contactId}`;
    if (column === 'title') return row.title;
    if (column === 'provider') return row.providerName || '';
    if (column === 'chair') return row.chairName || '';
    if (column === 'status') return row.status;
    return '';
  };

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      let comparison: number;
      if (column === 'scheduledAt') {
        comparison = new Date(left.row.scheduledAt).getTime() - new Date(right.row.scheduledAt).getTime();
      } else {
        const leftValue = textValue(left.row);
        const rightValue = textValue(right.row);
        if (!leftValue && rightValue) return 1;
        if (leftValue && !rightValue) return -1;
        comparison = leftValue.localeCompare(rightValue, locale, { sensitivity: 'base', numeric: true });
      }
      if (comparison === 0) return left.index - right.index;
      return direction === 'asc' ? comparison : -comparison;
    })
    .map(({ row }) => row);
}
