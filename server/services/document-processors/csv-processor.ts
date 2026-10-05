import Papa from 'papaparse';
import type { StructuredRecord } from './json-processor';

const ID_HEADERS = ['id', 'tour_id', 'sku', 'code'];
const SECTION_HEADERS = ['section', 'category', 'type', 'title', 'name'];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

function pickFromRow(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeHeader(header);
    if (candidates.includes(normalized) && value != null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return undefined;
}

function rowToContent(row: Record<string, string>): string {
  return Object.entries(row)
    .filter(([, value]) => value != null && String(value).trim().length > 0)
    .map(([header, value]) => `${header.trim()}: ${String(value).trim()}`)
    .join('\n');
}

/**
 * Parse CSV text into structured records — one row per chunk.
 */
export function parseCsvRecords(rawText: string): StructuredRecord[] {
  const result = Papa.parse<Record<string, string>>(rawText, {
    header: true,
    skipEmptyLines: true,
  });

  const fatalErrors = result.errors.filter(
    error => error.type === 'Delimiter' || error.code === 'UndetectableDelimiter',
  );
  if (fatalErrors.length > 0) {
    const message = fatalErrors.map(error => error.message).join('; ');
    throw new Error(`CSV parse error: ${message}`);
  }

  const recoverableErrors = result.errors.filter(
    error => error.type !== 'Delimiter' && error.code !== 'UndetectableDelimiter',
  );
  if (recoverableErrors.length > 0) {
    console.warn(
      'CSV parse warnings (continuing with parsed rows):',
      recoverableErrors.map(error => error.message).join('; '),
    );
  }

  const records = result.data
    .map(row => {
      const content = rowToContent(row);
      if (!content.trim()) {
        return null;
      }
      const recordId = pickFromRow(row, ID_HEADERS);
      const sectionLabel = pickFromRow(row, SECTION_HEADERS);
      return {
        content,
        ...(recordId ? { recordId } : {}),
        ...(sectionLabel ? { sectionLabel } : {}),
      };
    })
    .filter((record): record is StructuredRecord => record !== null);

  if (records.length === 0) {
    throw new Error('CSV parse produced no usable rows');
  }

  return records;
}
