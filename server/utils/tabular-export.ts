import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export type ExportFormat = 'csv' | 'xlsx';
export type ExportValueType = 'string' | 'number' | 'date' | 'currency' | 'percentage' | 'boolean';

export interface ExportColumn<Row extends Record<string, unknown> = Record<string, unknown>> {
  key: keyof Row & string;
  header: string;
  type?: ExportValueType;
  width?: number;
  numberFormat?: string;
}

export interface ExportSheet<Row extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
}

export interface TabularExportOptions {
  filename: string;
  format: ExportFormat;
  sheets: ExportSheet[];
}

export function parseExportFormat(value: unknown): ExportFormat | null {
  const normalized = String(value ?? 'csv').trim().toLowerCase();
  if (normalized === 'csv') return 'csv';
  if (normalized === 'xlsx' || normalized === 'excel') return 'xlsx';
  return null;
}

export function sanitizeExportFilename(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  return cleaned || 'export';
}

function sanitizeSheetName(value: string, fallback: string): string {
  const cleaned = value.replace(/[\\/*?:\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  return cleaned || fallback;
}

function cellValue(value: unknown, type?: ExportValueType): string | number | boolean | Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (!type) {
    if (value instanceof Date || typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value);
  }
  if (type === 'number' || type === 'currency' || type === 'percentage') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (type === 'date') {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date;
  }
  if (type === 'boolean') {
    if (typeof value === 'string') return !['', '0', 'false', 'no'].includes(value.trim().toLowerCase());
    return Boolean(value);
  }
  return String(value);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function writeCsv(path: string, sheet: ExportSheet): Promise<void> {
  const header = sheet.columns.map((column) => csvCell(column.header)).join(',');
  const rows = sheet.rows.map((row) =>
    sheet.columns.map((column) => csvCell(cellValue(row[column.key], column.type))).join(',')
  );
  await fs.writeFile(path, `\uFEFF${[header, ...rows].join('\n')}`, 'utf8');
}

async function writeXlsx(path: string, sheets: ExportSheet[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BotHivePlus';
  workbook.created = new Date();

  const usedNames = new Set<string>();
  sheets.forEach((sheet, sheetIndex) => {
    const baseName = sanitizeSheetName(sheet.name, `Sheet ${sheetIndex + 1}`);
    let worksheetName = baseName;
    let suffix = 2;
    while (usedNames.has(worksheetName.toLowerCase())) {
      const marker = ` (${suffix++})`;
      worksheetName = `${baseName.slice(0, 31 - marker.length)}${marker}`;
    }
    usedNames.add(worksheetName.toLowerCase());
    const worksheet = workbook.addWorksheet(worksheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = sheet.columns.map((column) => ({
      key: column.key,
      header: column.header,
      width: Math.min(60, Math.max(10, column.width ?? column.header.length + 3)),
      style: column.numberFormat ? { numFmt: column.numberFormat } : undefined,
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle' };

    for (const sourceRow of sheet.rows) {
      const values: Record<string, string | number | boolean | Date | null> = {};
      for (const column of sheet.columns) {
        values[column.key] = cellValue(sourceRow[column.key], column.type);
      }
      worksheet.addRow(values);
    }

    if (sheet.columns.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, worksheet.rowCount), column: sheet.columns.length },
      };
    }
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      row.alignment = { vertical: 'top' };
    });
  });

  await workbook.xlsx.writeFile(path);
}

export async function sendTabularExport(res: Response, options: TabularExportOptions): Promise<void> {
  const extension = options.format === 'xlsx' ? 'xlsx' : 'csv';
  const baseName = sanitizeExportFilename(options.filename);
  const path = join(tmpdir(), `${baseName}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);

  try {
    if (options.format === 'xlsx') {
      await writeXlsx(path, options.sheets);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else {
      await writeCsv(path, options.sheets[0] ?? { name: 'Data', columns: [], rows: [] });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    }
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${extension}"`);

    await new Promise<void>((resolve, reject) => {
      res.sendFile(path, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    await fs.unlink(path).catch(() => undefined);
  }
}
