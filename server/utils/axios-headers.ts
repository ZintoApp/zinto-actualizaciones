/**
 * Coerce Axios raw response header values (widened in newer Axios typings) to a single string.
 */
export function rawAxiosHeaderToString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (first === undefined || first === null) return '';
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
