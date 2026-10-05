import * as fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let XLSX: typeof import('xlsx') | undefined;
try {
  XLSX = require('xlsx');
} catch {
  // xlsx not installed
}

const MAX_ROWS_PER_SHEET = 500;
const MAX_COLS_PER_SHEET = 50;
const MAX_TOTAL_CHARS = 200_000;

export function isExcelProcessorAvailable(): boolean {
  return !!XLSX;
}

function isNumericCell(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed);
}

interface RowCellProfile {
  nonEmptyCells: string[];
  numericCount: number;
}

function getRowCellProfile(row: string[]): RowCellProfile {
  const nonEmptyCells = row
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  const numericCount = nonEmptyCells.filter((cell) => isNumericCell(cell)).length;
  return { nonEmptyCells, numericCount };
}

/**
 * Heuristic header detection: distinguish label rows from numeric/data rows.
 * Avoids treating the first data row as headers when spreadsheets lack a header row.
 */
function rowLooksLikeHeader(row: string[], dataRow: string[] | undefined): boolean {
  const header = getRowCellProfile(row);

  if (header.nonEmptyCells.length === 0) {
    return false;
  }

  if (header.nonEmptyCells.every((cell) => isNumericCell(cell))) {
    return false;
  }

  if (!dataRow || !dataRow.some((cell) => cell.trim().length > 0)) {
    return false;
  }

  const data = getRowCellProfile(dataRow);

  if (data.nonEmptyCells.length === 0) {
    return false;
  }

  const headerNumericRatio = header.numericCount / header.nonEmptyCells.length;
  const dataNumericRatio = data.numericCount / data.nonEmptyCells.length;
  const numericCountDelta = data.numericCount - header.numericCount;
  const numericRatioDelta = dataNumericRatio - headerNumericRatio;

  // Similar value-type profiles: headerless sheet — keep the first row as data.
  if (header.numericCount === data.numericCount && Math.abs(numericRatioDelta) < 0.34) {
    return false;
  }

  // Both rows are entirely non-numeric — repeated text data, not a label header.
  if (header.numericCount === 0 && data.numericCount === 0) {
    return false;
  }

  const headerMostlyLabels =
    header.numericCount < header.nonEmptyCells.length && headerNumericRatio <= 0.5;
  const dataHasMoreNumericContent = numericCountDelta > 0 || numericRatioDelta >= 0.34;

  return headerMostlyLabels && dataHasMoreNumericContent;
}

function formatCellValue(cell: import('xlsx').CellObject | undefined): string {
  if (!cell || cell.v == null) {
    return '';
  }

  const { t, v, w } = cell;

  if (t === 'n') {
    if (XLSX?.SSF?.is_date?.(cell)) {
      return w ?? String(v);
    }
    return String(v);
  }

  if (t === 'd') {
    return w ?? String(v);
  }

  if (t === 'b') {
    return v ? 'true' : 'false';
  }

  return w ?? String(v);
}

function sheetToText(
  sheet: import('xlsx').WorkSheet,
  sheetName: string,
): { text: string; truncated: boolean; hasData: boolean } {
  if (!sheet['!ref']) {
    return { text: '', truncated: false, hasData: false };
  }

  const range = XLSX!.utils.decode_range(sheet['!ref']);
  const totalRows = range.e.r - range.s.r + 1;
  const totalCols = range.e.c - range.s.c + 1;
  const maxRows = Math.min(totalRows, MAX_ROWS_PER_SHEET);
  const maxCols = Math.min(totalCols, MAX_COLS_PER_SHEET);
  const truncated = totalRows > MAX_ROWS_PER_SHEET || totalCols > MAX_COLS_PER_SHEET;

  const rows: string[][] = [];
  for (let r = range.s.r; r < range.s.r + maxRows; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c < range.s.c + maxCols; c++) {
      const addr = XLSX!.utils.encode_cell({ r, c });
      row.push(formatCellValue(sheet[addr]));
    }
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmptyRows.length === 0) {
    return { text: '', truncated: false, hasData: false };
  }

  const maxDataCols = Math.max(...nonEmptyRows.map((row) => row.length));
  const hasHeader = rowLooksLikeHeader(nonEmptyRows[0], nonEmptyRows[1]);

  let headers: string[];
  let dataRows: string[][];

  if (hasHeader) {
    headers = nonEmptyRows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
    while (headers.length < maxDataCols) {
      headers.push(`Column ${headers.length + 1}`);
    }
    dataRows = nonEmptyRows.slice(1);
  } else {
    headers = Array.from({ length: maxDataCols }, (_, index) => `Column ${index + 1}`);
    dataRows = nonEmptyRows;
  }

  const lines: string[] = [`Sheet: ${sheetName}`, ''];

  if (dataRows.length === 0) {
    const headerLine = headers.filter((header) => header.trim().length > 0).join(' | ');
    if (headerLine) {
      lines.push(`Columns: ${headerLine}`);
    }
  } else {
    for (const row of dataRows) {
      if (!row.some((cell) => cell.trim().length > 0)) {
        continue;
      }

      const pairs = headers
        .map((header, index) => {
          const value = row[index] ?? '';
          return value.trim().length > 0 ? `${header}: ${value}` : null;
        })
        .filter((pair): pair is string => pair !== null);

      if (pairs.length > 0) {
        lines.push(pairs.join(' | '));
      }
    }
  }

  let text = lines.join('\n');
  if (truncated) {
    text += `\n\n[Note: Sheet "${sheetName}" was truncated to ${maxRows} rows and ${maxCols} columns.]`;
  }

  const hasRowValues = dataRows.some((row) => row.some((cell) => cell.trim().length > 0));
  const hasHeaderOnlyInfo = hasHeader && !hasRowValues && headers.some((header) => header.trim().length > 0);
  const hasData = hasRowValues || hasHeaderOnlyInfo;

  return { text, truncated, hasData };
}

/**
 * Extract report-ready text from .xls/.xlsx workbooks.
 */
export async function extractExcelText(filePath: string): Promise<string> {
  if (!XLSX) {
    throw new Error('Spreadsheet processing is not available/configured.');
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (error) {
    throw new Error(
      `Failed to read spreadsheet workbook: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new Error('Failed to read spreadsheet workbook.');
  }

  if (!workbook.SheetNames?.length) {
    throw new Error('Spreadsheet contains no usable data.');
  }

  const parts: string[] = [];
  let hasUsableData = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const { text, hasData } = sheetToText(sheet, sheetName);
    if (hasData) {
      hasUsableData = true;
      parts.push(text);
    }
  }

  if (!hasUsableData) {
    throw new Error('Spreadsheet contains no usable data.');
  }

  let result = parts.join('\n\n');
  if (result.length > MAX_TOTAL_CHARS) {
    result =
      result.slice(0, MAX_TOTAL_CHARS) +
      `\n\n[Note: Spreadsheet output was truncated to ${MAX_TOTAL_CHARS.toLocaleString()} characters.]`;
  }

  return result;
}
