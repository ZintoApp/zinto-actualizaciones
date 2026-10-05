/**
 * Token embedded in A4 invoice PDF filenames after `templateType` (`invoice-{n}-a4-{revision}-{lang}.pdf`).
 * Bump when A4 PDF rendering changes in ways not reflected by invoice / template / currency `updatedAt`
 * (so `invoicePdfCacheContentThresholdMs` alone would keep serving stale cached files).
 */
export const A4_INVOICE_PDF_RENDERER_CACHE_REVISION = 'r20260502';

/**
 * Minimum mtime (ms) a cached invoice PDF must have to be reused: max of invoice content change time,
 * company invoice template settings row change time, and (when present) the company currency row used
 * for amount-in-words / symbols. Matches the -500ms slack in generateInvoicePdf.
 */
export function invoicePdfCacheContentThresholdMs(
  invoiceUpdatedAt: string | Date | null | undefined,
  templateSettingsUpdatedAt: Date | null | undefined,
  currencyRowUpdatedAt?: string | Date | null | undefined
): number {
  const invMs = new Date(invoiceUpdatedAt as unknown as string | number | Date).getTime();
  const tplMs =
    templateSettingsUpdatedAt != null ? new Date(templateSettingsUpdatedAt).getTime() : 0;
  const curMs =
    currencyRowUpdatedAt != null ? new Date(currencyRowUpdatedAt as unknown as string | number | Date).getTime() : 0;
  return Math.max(
    Number.isFinite(invMs) ? invMs : 0,
    Number.isFinite(tplMs) ? tplMs : 0,
    Number.isFinite(curMs) ? curMs : 0
  );
}
