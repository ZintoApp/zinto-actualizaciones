export interface CapturedDataPaginationLike {
  page?: number | null;
  limit?: number | null;
  total?: number | null;
}

type TranslateFn = (key: string, fallback?: string, variables?: Record<string, unknown>) => string;

function formatPrimitiveValue(
  value: string | number | boolean | null | undefined,
  t?: TranslateFn,
): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? (t?.('common.yes', 'Yes') ?? 'Yes') : (t?.('common.no', 'No') ?? 'No');
  if (typeof value === 'string') return value.trim() ? value : '-';
  return String(value);
}

export function formatCapturedDataFieldLabel(key: string, t?: TranslateFn): string {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return t?.('captured_data.untitled_field', 'Untitled field') ?? 'Untitled field';

  return normalized
    .split(' ')
    .map((segment) => {
      if (!segment) return segment;
      if (/^[A-Z0-9]+$/.test(segment)) return segment;
      if (segment.length <= 2) return segment.toUpperCase();
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(' ');
}

/** URL string or object shape from some integrations. */
export function getCapturedMediaDisplayUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return s || null;
  }
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    const u = o.url ?? o.mediaUrl;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

export function isCapturedMediaFieldValue(value: unknown): boolean {
  const url = getCapturedMediaDisplayUrl(value);
  if (!url) return false;
  if (url.startsWith('data:')) return true;
  if (/^https?:\/\//i.test(url)) return true;
  if (url.startsWith('/') && url.length > 1) return true;
  return false;
}

export function toAbsoluteCapturedMediaSrc(url: string): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  if (typeof window === 'undefined') return url;
  const origin = window.location.origin;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function formatCapturedDataValue(value: unknown, t?: TranslateFn): string {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return formatPrimitiveValue(value, t);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '-';

    const hasOnlyPrimitiveValues = value.every(
      (item) => item === null || item === undefined || ['string', 'number', 'boolean'].includes(typeof item),
    );

    if (hasOnlyPrimitiveValues) {
      return value.map((item) => formatPrimitiveValue(item as string | number | boolean | null | undefined, t)).join(', ');
    }
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatCapturedDataTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return '-';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function countCapturedDataFields(fields: Record<string, unknown> | null | undefined): number {
  return Object.keys(fields ?? {}).length;
}

export function buildCapturedDataFieldPreview(
  fields: Record<string, unknown> | null | undefined,
  maxItems = 2,
  t?: TranslateFn,
): string[] {
  return Object.keys(fields ?? {})
    .slice(0, Math.max(0, maxItems))
    .map((key) => formatCapturedDataFieldLabel(key, t));
}

/**
 * Returns true if the date range is invalid (start is after end).
 * Empty strings are treated as "no limit" and do not cause invalidity.
 */
export function isCapturedDataDateRangeInvalid(
  startDate: string,
  endDate: string,
): boolean {
  if (!startDate || !endDate) return false;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start > end;
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function valueForCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface CapturedSubmissionForExport {
  id: number;
  contactName: string;
  flowName: string;
  submittedAt: string;
  capturedFields: Record<string, unknown>;
}

/**
 * Generates CSV content from captured submissions. Dynamic captured fields become columns.
 */
export function generateCapturedDataCsv(submissions: CapturedSubmissionForExport[]): string {
  const fixedHeaders = ['Submission ID', 'Contact', 'Flow', 'Submitted At'];
  const allFieldKeys = new Set<string>();
  submissions.forEach((s) => Object.keys(s.capturedFields ?? {}).forEach((k) => allFieldKeys.add(k)));
  const fieldHeaders = Array.from(allFieldKeys).sort();
  const headers = [...fixedHeaders, ...fieldHeaders];

  const rows = submissions.map((s) => {
    const fixed = [
      s.id.toString(),
      escapeCsvField(s.contactName || ''),
      escapeCsvField(s.flowName || ''),
      escapeCsvField(new Date(s.submittedAt).toISOString()),
    ];
    const fieldValues = fieldHeaders.map((k) =>
      escapeCsvField(valueForCsv((s.capturedFields ?? {})[k])),
    );
    return [...fixed, ...fieldValues].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Downloads captured submissions as CSV.
 */
export function downloadCapturedDataCsv(
  submissions: CapturedSubmissionForExport[],
  filename?: string,
): void {
  const csv = generateCapturedDataCsv(submissions);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const name = filename ?? `captured_data_${ts}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function getCapturedDataRange(
  pagination: CapturedDataPaginationLike | null | undefined,
  dataLength: number,
): { start: number; end: number } {
  if (dataLength <= 0) {
    return { start: 0, end: 0 };
  }

  const page = Math.max(pagination?.page ?? 1, 1);
  const limit = Math.max(pagination?.limit ?? dataLength, 1);
  const total = Math.max(pagination?.total ?? dataLength, dataLength);
  const start = (page - 1) * limit + 1;
  const end = Math.min(start + dataLength - 1, total);

  return { start, end };
}