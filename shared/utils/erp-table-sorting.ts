export type ErpTableSortDirection = 'asc' | 'desc';
export type ErpTableSortType = 'auto' | 'text' | 'number' | 'date';

export function normalizeErpSortValue(value: unknown, type: ErpTableSortType): string | number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim();
  if (!text || text === '—' || text === '-') return null;
  if (type === 'date') {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? text : parsed;
  }
  if (type === 'number') {
    const parsed = Number(text.replace(/[^\d,.-]/g, '').replace(/,/g, ''));
    return Number.isNaN(parsed) ? text : parsed;
  }
  if (type === 'auto') {
    if (/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)|^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|^\d{1,2}[\s/-][A-Za-z]{3,}|^[A-Za-z]{3,}[\s/-]\d{1,2}/.test(text)) {
      const parsedDate = Date.parse(text);
      if (!Number.isNaN(parsedDate)) return parsedDate;
    }
    if (/^[^\d-]*-?[\d,.]+\s*%?[^\d]*$/.test(text)) {
      const parsedNumber = Number(text.replace(/[^\d,.-]/g, '').replace(/,/g, ''));
      if (!Number.isNaN(parsedNumber)) return parsedNumber;
    }
  }
  return text;
}

export function compareErpSortValues(
  left: unknown,
  right: unknown,
  direction: ErpTableSortDirection,
  type: ErpTableSortType = 'auto',
  locale?: string,
): number {
  const a = normalizeErpSortValue(left, type);
  const b = normalizeErpSortValue(right, type);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const comparison = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), locale, { sensitivity: 'base', numeric: true });
  return direction === 'asc' ? comparison : -comparison;
}

export function sortErpRows<T>(
  rows: readonly T[],
  value: (row: T) => unknown,
  direction: ErpTableSortDirection,
  type: ErpTableSortType = 'auto',
  locale?: string,
): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => compareErpSortValues(
      value(left.row),
      value(right.row),
      direction,
      type,
      locale,
    ) || left.index - right.index)
    .map(({ row }) => row);
}
