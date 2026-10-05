import type { StructuredRecord } from './json-processor';

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

interface ProtectedBlock {
  start: number;
  end: number;
}

function findProtectedBlocks(text: string): ProtectedBlock[] {
  const blocks: ProtectedBlock[] = [];
  const fencePattern = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(text)) !== null) {
    blocks.push({ start: match.index, end: match.index + match[0].length });
  }

  const lines = text.split('\n');
  let offset = 0;
  let tableStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const isTableLine = /^\s*\|.+\|\s*$/.test(line) || /^\s*\|[-:\s|]+\|\s*$/.test(line);

    if (isTableLine) {
      if (tableStart < 0) {
        tableStart = lineStart;
      }
    } else if (tableStart >= 0) {
      blocks.push({ start: tableStart, end: lineStart });
      tableStart = -1;
    }

    offset = lineEnd + 1;
  }

  if (tableStart >= 0) {
    blocks.push({ start: tableStart, end: text.length });
  }

  return blocks.sort((a, b) => a.start - b.start);
}

function isInsideProtectedBlock(index: number, blocks: ProtectedBlock[]): boolean {
  return blocks.some(block => index >= block.start && index < block.end);
}

/**
 * Split Markdown into heading-based sections, keeping fenced code blocks and pipe tables intact.
 */
export function parseMarkdownSections(rawText: string): StructuredRecord[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const protectedBlocks = findProtectedBlocks(normalized);
  const lines = normalized.split('\n');

  const sections: StructuredRecord[] = [];
  const headingStack: { level: number; title: string }[] = [];
  let currentBody: string[] = [];
  let sectionStartOffset = 0;
  let lineOffset = 0;

  const flushSection = (endOffset: number) => {
    const body = currentBody.join('\n').trim();
    if (body.length === 0 && headingStack.length === 0) {
      return;
    }
    const sectionLabel = headingStack.map(h => h.title).join(' > ') || undefined;
    const content = sectionLabel ? `${sectionLabel}\n\n${body}`.trim() : body;
    if (content.length > 0) {
      sections.push({
        content,
        ...(sectionLabel ? { sectionLabel } : {}),
      });
    }
    currentBody = [];
    sectionStartOffset = endOffset;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = lineOffset;

    if (isInsideProtectedBlock(lineStart, protectedBlocks)) {
      currentBody.push(line);
      lineOffset += line.length + 1;
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch) {
      flushSection(lineStart);
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      sectionStartOffset = lineStart;
    } else {
      currentBody.push(line);
    }

    lineOffset += line.length + 1;
  }

  flushSection(normalized.length);

  if (sections.length === 0 && normalized.trim().length > 0) {
    sections.push({ content: normalized.trim() });
  }

  return sections;
}
