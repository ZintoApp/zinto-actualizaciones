export function resolveWhatsAppMessageTimestamp(value: unknown, fallback = new Date()): Date {
  let numericValue: number;
  if (value && typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    numericValue = (value as { toNumber: () => number }).toNumber();
  } else {
    numericValue = Number(value);
  }

  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallback;
  const timestamp = new Date(numericValue < 1e12 ? numericValue * 1000 : numericValue);
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp;
}
