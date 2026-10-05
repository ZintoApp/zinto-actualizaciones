/**
 * Token embedded in A4 quotation PDF filenames after `templateType`
 * (`quotation-{n}-a4-{revision}-{lang}.pdf`).
 * Bump when A4 PDF rendering changes in ways not reflected by order / template / currency `updatedAt`
 * (so `quotationPdfCacheContentThresholdMs` alone would keep serving stale cached files).
 */
export const QUOTATION_PDF_RENDERER_CACHE_REVISION = 'q20260515';

/**
 * Minimum mtime (ms) a cached quotation PDF must have to be reused: max of sales order content change time,
 * company invoice template settings row change time, and (when present) the company currency row used
 * for amount-in-words / symbols. Matches the -500ms slack in generateQuotationPdf.
 */
export function quotationPdfCacheContentThresholdMs(
  orderUpdatedAt: string | Date | null | undefined,
  templateSettingsUpdatedAt: Date | null | undefined,
  currencyRowUpdatedAt?: string | Date | null | undefined
): number {
  const orderMs = new Date(orderUpdatedAt as unknown as string | number | Date).getTime();
  const tplMs =
    templateSettingsUpdatedAt != null ? new Date(templateSettingsUpdatedAt).getTime() : 0;
  const curMs =
    currencyRowUpdatedAt != null ? new Date(currencyRowUpdatedAt as unknown as string | number | Date).getTime() : 0;
  return Math.max(
    Number.isFinite(orderMs) ? orderMs : 0,
    Number.isFinite(tplMs) ? tplMs : 0,
    Number.isFinite(curMs) ? curMs : 0
  );
}
