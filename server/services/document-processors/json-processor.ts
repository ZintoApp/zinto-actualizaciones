export interface StructuredRecord {
  content: string;
  recordId?: string;
  sectionLabel?: string;
}

const ID_KEYS = ['id', 'tour_id', 'sku', 'code'];
const SECTION_KEYS = ['section', 'category', 'type', 'title', 'name'];
const CONTENT_KEYS = ['content', 'text', 'body', 'description'];
const ARRAY_CONTAINER_KEYS = ['chunks', 'records', 'items'];

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return undefined;
}

function serializeObjectFields(obj: Record<string, unknown>, excludeKeys: Set<string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (excludeKeys.has(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join('\n');
}

function recordFromObject(obj: Record<string, unknown>): StructuredRecord | null {
  const directContent = pickFirstString(obj, CONTENT_KEYS);
  const recordId = pickFirstString(obj, ID_KEYS);
  const sectionLabel = pickFirstString(obj, SECTION_KEYS);

  const excludeKeys = new Set([...ID_KEYS, ...SECTION_KEYS, ...CONTENT_KEYS]);
  const serialized = serializeObjectFields(obj, excludeKeys);

  let content: string;
  if (directContent) {
    content = serialized.length > 0 ? `${directContent}\n${serialized}` : directContent;
  } else if (serialized.length > 0) {
    content = serialized;
  } else {
    content = JSON.stringify(obj, null, 2);
  }

  if (!content.trim()) {
    return null;
  }

  return {
    content: content.trim(),
    ...(recordId ? { recordId } : {}),
    ...(sectionLabel ? { sectionLabel } : {}),
  };
}

function recordFromValue(value: unknown, index: number): StructuredRecord | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? { content: trimmed, recordId: String(index) } : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return recordFromObject(value as Record<string, unknown>);
  }
  if (value !== null && value !== undefined) {
    return { content: String(value), recordId: String(index) };
  }
  return null;
}

/**
 * Parse JSON text into structured records — one chunk per array element or container item.
 */
export function parseJsonRecords(rawText: string): StructuredRecord[] {
  const parsed = JSON.parse(rawText.trim());

  if (Array.isArray(parsed)) {
    return parsed
      .map((item, index) => recordFromValue(item, index))
      .filter((record): record is StructuredRecord => record !== null);
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ARRAY_CONTAINER_KEYS) {
      const container = obj[key];
      if (Array.isArray(container)) {
        return container
          .map((item, index) => recordFromValue(item, index))
          .filter((record): record is StructuredRecord => record !== null);
      }
    }
    const single = recordFromObject(obj);
    return single ? [single] : [];
  }

  const fallback = recordFromValue(parsed, 0);
  return fallback ? [fallback] : [];
}
