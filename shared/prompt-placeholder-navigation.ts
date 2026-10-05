export type PromptPlaceholderRange = { start: number; end: number };

export type PromptPlaceholderSegment = PromptPlaceholderRange & {
  text: string;
  isPlaceholder: boolean;
};

const COMPLETE_PLACEHOLDER_PATTERN = /\{\{[^{}\r\n]+\}\}/g;

/** Split prompt text without changing it, marking only complete {{placeholder}} tokens. */
export function getPromptPlaceholderSegments(text: string): PromptPlaceholderSegment[] {
  if (!text) return [];

  const segments: PromptPlaceholderSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(COMPLETE_PLACEHOLDER_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > cursor) {
      segments.push({ start: cursor, end: start, text: text.slice(cursor, start), isPlaceholder: false });
    }
    segments.push({ start, end, text: match[0], isPlaceholder: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ start: cursor, end: text.length, text: text.slice(cursor), isPlaceholder: false });
  }
  return segments;
}

/** Center a rendered placeholder in a scrollable prompt, clamped to its scroll bounds. */
export function getCenteredPromptScrollTop(
  markerTop: number,
  markerHeight: number,
  viewportHeight: number,
  scrollHeight: number,
): number {
  const desired = markerTop - Math.max(0, viewportHeight - markerHeight) / 2;
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  return Math.min(Math.max(0, desired), maxScrollTop);
}

export function getPromptPlaceholderRanges(
  text: string,
  variableName: string,
): PromptPlaceholderRange[] {
  const token = `{{${variableName}}}`;
  if (!variableName || !text || token.length <= 4) return [];
  const ranges: PromptPlaceholderRange[] = [];
  let fromIndex = 0;
  while (fromIndex <= text.length - token.length) {
    const start = text.indexOf(token, fromIndex);
    if (start < 0) break;
    ranges.push({ start, end: start + token.length });
    fromIndex = start + token.length;
  }
  return ranges;
}

export function getNextPromptPlaceholderRange(
  text: string,
  variableName: string,
  previousStart?: number,
): PromptPlaceholderRange | null {
  const ranges = getPromptPlaceholderRanges(text, variableName);
  if (ranges.length === 0) return null;
  if (previousStart === undefined) return ranges[0];
  return ranges.find((range) => range.start > previousStart) ?? ranges[0];
}
