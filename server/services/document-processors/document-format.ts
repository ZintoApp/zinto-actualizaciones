export type DocumentFormat = 'json' | 'csv' | 'markdown' | 'text' | 'excel';

const JSON_MIMES = new Set(['application/json', 'text/json']);
const CSV_MIMES = new Set(['text/csv', 'application/csv']);
const MARKDOWN_MIMES = new Set(['text/markdown', 'text/x-markdown']);
const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** MIME type shared by legacy Excel binaries and CSV exports (e.g. Google Sheets). */
export const AMBIGUOUS_EXCEL_MIME = 'application/vnd.ms-excel';

export interface DocumentFormatHints {
  mediaUrl?: string;
  contentDisposition?: string;
  fileBuffer?: Buffer;
}

export function isAmbiguousExcelMime(mimeType: string): boolean {
  return mimeType.toLowerCase().trim() === AMBIGUOUS_EXCEL_MIME;
}

/**
 * Detect CSV intent from Google Sheets or similar export URLs.
 * e.g. https://docs.google.com/spreadsheets/d/.../export?format=csv
 */
export function indicatesCsvFromUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();

    if (pathname.endsWith('.csv')) {
      return true;
    }

    if (pathname.endsWith('/export') || pathname.includes('/export')) {
      const format = parsed.searchParams.get('format')?.toLowerCase();
      if (format === 'csv') {
        return true;
      }
      if (parsed.search.toLowerCase().includes('format=csv')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/** Detect CSV intent from Content-Disposition attachment filenames. */
export function indicatesCsvFromContentDisposition(contentDisposition: string): boolean {
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i);
  if (!match) {
    return false;
  }

  const filename = decodeURIComponent(match[1].replace(/['"]/g, '').trim());
  return filename.toLowerCase().endsWith('.csv');
}

/**
 * Lightweight content sniffing for ambiguous spreadsheet MIME types.
 * Returns null when the signature is inconclusive.
 */
export function sniffSpreadsheetFormat(buffer: Buffer): 'csv' | 'excel' | null {
  if (buffer.length < 4) {
    return null;
  }

  // XLSX / ZIP-based Office Open XML
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return 'excel';
  }

  // Legacy XLS OLE compound document
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return 'excel';
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let nullBytes = 0;
  let printable = 0;

  for (const byte of sample) {
    if (byte === 0) {
      nullBytes++;
    }
    if (
      (byte >= 0x09 && byte <= 0x0d) ||
      (byte >= 0x20 && byte <= 0x7e) ||
      byte >= 0x80
    ) {
      printable++;
    }
  }

  if (nullBytes === 0 && printable / sample.length > 0.85) {
    return 'csv';
  }

  return null;
}

/**
 * Resolve a display filename for ambiguous CSV exports (e.g. Google Sheets /export).
 */
export function resolveAmbiguousCsvFileName(
  mediaUrl: string,
  fallbackBaseName = 'export',
): string | null {
  if (!indicatesCsvFromUrl(mediaUrl)) {
    return null;
  }

  try {
    const pathname = new URL(mediaUrl).pathname;
    const base = pathBasename(pathname) || fallbackBaseName;
    if (base.toLowerCase().endsWith('.csv')) {
      return base;
    }
    return `${base}.csv`;
  } catch {
    return `${fallbackBaseName}.csv`;
  }
}

function pathBasename(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

function resolveAmbiguousExcelMime(
  fileName: string,
  hints?: DocumentFormatHints,
): DocumentFormat {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';

  if (ext === 'csv') {
    return 'csv';
  }
  if (ext === 'xls' || ext === 'xlsx') {
    return 'excel';
  }

  if (hints?.mediaUrl && indicatesCsvFromUrl(hints.mediaUrl)) {
    return 'csv';
  }
  if (hints?.contentDisposition && indicatesCsvFromContentDisposition(hints.contentDisposition)) {
    return 'csv';
  }
  if (hints?.fileBuffer) {
    const sniffed = sniffSpreadsheetFormat(hints.fileBuffer);
    if (sniffed) {
      return sniffed;
    }
  }

  // Ambiguous without binary Excel signals — prefer CSV text extraction.
  return 'csv';
}

/**
 * Detect document format from MIME type with file-extension fallback.
 * Browsers often send inconsistent MIME types for CSV and Markdown uploads.
 * Extension is checked first for spreadsheet/CSV ambiguity (.csv vs .xls/.xlsx).
 */
export function detectDocumentFormat(
  mimeType: string,
  fileName: string,
  hints?: DocumentFormatHints,
): DocumentFormat {
  const mime = mimeType.toLowerCase().trim();
  const ext = fileName.toLowerCase().split('.').pop() ?? '';

  if (ext === 'csv') {
    return 'csv';
  }
  if (ext === 'xls' || ext === 'xlsx') {
    return 'excel';
  }

  if (JSON_MIMES.has(mime) || mime.endsWith('+json')) {
    return 'json';
  }
  if (MARKDOWN_MIMES.has(mime)) {
    return 'markdown';
  }

  if (isAmbiguousExcelMime(mime)) {
    return resolveAmbiguousExcelMime(fileName, hints);
  }

  if (EXCEL_MIMES.has(mime)) {
    return 'excel';
  }
  if (CSV_MIMES.has(mime)) {
    return 'csv';
  }

  if (ext === 'json') {
    return 'json';
  }
  if (ext === 'md' || ext === 'markdown') {
    return 'markdown';
  }

  return 'text';
}

/** File extensions accepted regardless of browser-reported MIME type. */
export const STRUCTURED_UPLOAD_EXTENSIONS = new Set([
  'json',
  'csv',
  'md',
  'markdown',
  'xls',
  'xlsx',
]);

export function isStructuredUploadExtension(fileName: string): boolean {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return STRUCTURED_UPLOAD_EXTENSIONS.has(ext);
}
