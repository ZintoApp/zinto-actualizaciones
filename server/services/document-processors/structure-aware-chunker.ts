import { createHash } from 'node:crypto';
import { RAG_CHUNK_DEFAULTS } from '../../../shared/rag-defaults';
import type { DocumentFormat } from './document-format';
import { parseJsonRecords } from './json-processor';
import { parseCsvRecords } from './csv-processor';
import { parseMarkdownSections } from './markdown-processor';

export interface DocumentChunk {
  content: string;
  index: number;
  startPosition: number;
  endPosition: number;
  tokenCount: number;
  recordId?: string;
  sectionLabel?: string;
  language?: string;
  contentHash?: string;
}

interface RawChunkCandidate {
  content: string;
  recordId?: string;
  sectionLabel?: string;
  startPosition: number;
  endPosition: number;
}

const RAG_MARKER_PATTERN =
  /##### RAG_CHUNK_START::(\S+) #####\s*([\s\S]*?)(?:RAG_CHUNK_END|$)/g;

const RECORD_KEY_PREFIX = /^(?:TOUR_ID|SECCION|ID|SKU)\s*:/im;
const DELIMITER_LINE = /^={4,}$|^-{4,}$/m;

const EN_STOPWORDS = new Set(['the', 'and', 'is', 'are', 'was', 'were', 'for', 'with', 'this', 'that']);
const ES_STOPWORDS = new Set(['el', 'la', 'de', 'que', 'en', 'y', 'es', 'un', 'una', 'por']);
const FR_STOPWORDS = new Set(['le', 'la', 'de', 'et', 'est', 'un', 'une', 'pour', 'dans']);

/**
 * Blended token estimator — handles both CJK-dense and word-heavy text.
 */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  const charEstimate = Math.ceil(trimmed.length / 4);
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  const wordEstimate = Math.ceil(wordCount * 1.3);
  return Math.max(charEstimate, wordEstimate);
}

export function hashChunkContent(content: string): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized).digest('hex');
}

function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000).toLowerCase();
  const cjkCount = (sample.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const hiraganaKatakana = (sample.match(/[\u3040-\u30ff]/g) ?? []).length;
  const hangul = (sample.match(/[\uac00-\ud7af]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) ?? []).length;
  const arabic = (sample.match(/[\u0600-\u06ff]/g) ?? []).length;

  if (hiraganaKatakana > 5) return 'ja';
  if (hangul > 5) return 'ko';
  if (cjkCount > 10) return 'zh';
  if (cyrillic > 10) return 'ru';
  if (arabic > 10) return 'ar';

  const words = sample.split(/\W+/).filter(w => w.length > 1);
  if (words.length === 0) return 'und';

  const countMatches = (stopwords: Set<string>) =>
    words.filter(w => stopwords.has(w)).length;

  const enScore = countMatches(EN_STOPWORDS);
  const esScore = countMatches(ES_STOPWORDS);
  const frScore = countMatches(FR_STOPWORDS);

  const maxScore = Math.max(enScore, esScore, frScore);
  if (maxScore >= 2) {
    if (enScore === maxScore) return 'en';
    if (esScore === maxScore) return 'es';
    if (frScore === maxScore) return 'fr';
  }

  return 'und';
}

function extractMarkerChunks(text: string): RawChunkCandidate[] | null {
  const matches = [...text.matchAll(RAG_MARKER_PATTERN)];
  if (matches.length === 0) {
    return null;
  }

  return matches.map(match => {
    const recordId = match[1];
    let content = match[2].trim();
    content = content.replace(/\s*RAG_CHUNK_END\s*$/, '').trim();
    const startPosition = match.index ?? 0;
    return {
      content,
      recordId,
      startPosition,
      endPosition: startPosition + match[0].length,
    };
  });
}

function recordsToCandidates(
  records: Array<{ content: string; recordId?: string; sectionLabel?: string }>,
  text: string,
  synthesizedContent = false,
): RawChunkCandidate[] {
  if (synthesizedContent) {
    return records.map(record => ({
      content: record.content,
      recordId: record.recordId,
      sectionLabel: record.sectionLabel,
      startPosition: 0,
      endPosition: 0,
    }));
  }

  let searchFrom = 0;
  return records.map(record => {
    const idx = text.indexOf(record.content, searchFrom);
    const startPosition = idx >= 0 ? idx : searchFrom;
    const endPosition = startPosition + record.content.length;
    searchFrom = endPosition;
    return {
      content: record.content,
      recordId: record.recordId,
      sectionLabel: record.sectionLabel,
      startPosition,
      endPosition,
    };
  });
}

function splitTextRecords(text: string): RawChunkCandidate[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (DELIMITER_LINE.test(normalized)) {
    const parts = normalized.split(/\n(?:={4,}|-{4,})\n/).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length > 1) {
      return parts.map((content, i) => ({
        content,
        startPosition: normalized.indexOf(content),
        endPosition: normalized.indexOf(content) + content.length,
        recordId: String(i),
      }));
    }
  }

  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (RECORD_KEY_PREFIX.test(line) && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current.join('\n').trim());
  }

  const nonEmptyBlocks = blocks.filter(b => b.length > 0);
  if (nonEmptyBlocks.length > 1) {
    return nonEmptyBlocks.map((content, i) => ({
      content,
      startPosition: normalized.indexOf(content),
      endPosition: normalized.indexOf(content) + content.length,
      recordId: String(i),
    }));
  }

  return [{ content: normalized.trim(), startPosition: 0, endPosition: normalized.length }];
}

function packParagraphs(text: string, maxChunkTokens: number): RawChunkCandidate[] {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length === 0) {
    return [];
  }

  const candidates: RawChunkCandidate[] = [];
  let current = '';
  let currentStart = 0;
  let searchFrom = 0;

  for (const paragraph of paragraphs) {
    const paraStart = text.indexOf(paragraph, searchFrom);
    searchFrom = paraStart + paragraph.length;
    const projected = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;

    if (current.length > 0 && estimateTokens(projected) > maxChunkTokens) {
      candidates.push({
        content: current,
        startPosition: currentStart,
        endPosition: currentStart + current.length,
      });
      current = paragraph;
      currentStart = paraStart;
    } else {
      current = projected;
      if (candidates.length === 0 && currentStart === 0 && paraStart >= 0) {
        currentStart = paraStart;
      }
    }
  }

  if (current.trim().length > 0) {
    candidates.push({
      content: current,
      startPosition: currentStart,
      endPosition: currentStart + current.length,
    });
  }

  return candidates;
}

function findProtectedSubBlocks(content: string): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  const fencePattern = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    blocks.push({ start: match.index, end: match.index + match[0].length });
  }

  const lines = content.split('\n');
  let offset = 0;
  let tableStart = -1;
  for (const line of lines) {
    const isTable = /^\s*\|.+\|\s*$/.test(line) || /^\s*\|[-:\s|]+\|\s*$/.test(line);
    if (isTable) {
      if (tableStart < 0) tableStart = offset;
    } else if (tableStart >= 0) {
      blocks.push({ start: tableStart, end: offset });
      tableStart = -1;
    }
    offset += line.length + 1;
  }
  if (tableStart >= 0) {
    blocks.push({ start: tableStart, end: content.length });
  }

  return blocks;
}

function isProtectedIndex(index: number, blocks: Array<{ start: number; end: number }>): boolean {
  return blocks.some(b => index >= b.start && index < b.end);
}

/**
 * Split an oversized record on sentence/line boundaries with light overlap.
 * Never splits inside fenced code blocks or pipe tables.
 */
function splitOversizedRecord(candidate: RawChunkCandidate, maxChunkTokens: number): RawChunkCandidate[] {
  const { content } = candidate;
  if (estimateTokens(content) <= maxChunkTokens) {
    return [candidate];
  }

  const protectedBlocks = findProtectedSubBlocks(content);
  const overlap = Math.floor(maxChunkTokens * 0.1);
  const parts: RawChunkCandidate[] = [];
  let current = '';
  let partStart = candidate.startPosition;

  const flush = (endOffset: number) => {
    if (current.trim().length === 0) return;
    parts.push({
      content: current.trim(),
      recordId: candidate.recordId,
      sectionLabel: candidate.sectionLabel,
      startPosition: partStart,
      endPosition: endOffset,
    });
  };

  const sentences = content.split(/(?<=[.!?])\s+|\n/);
  let offset = 0;

  for (const sentence of sentences) {
    const sentenceStart = content.indexOf(sentence, offset);
    if (sentenceStart >= 0 && isProtectedIndex(sentenceStart, protectedBlocks)) {
      const block = protectedBlocks.find(b => sentenceStart >= b.start && sentenceStart < b.end)!;
      const blockText = content.slice(block.start, block.end);
      if (current.length > 0 && estimateTokens(current + '\n' + blockText) > maxChunkTokens) {
        flush(candidate.startPosition + sentenceStart);
        current = blockText;
        partStart = candidate.startPosition + block.start;
      } else {
        current = current.length > 0 ? `${current}\n${blockText}` : blockText;
      }
      offset = block.end;
      continue;
    }

    const projected = current.length > 0 ? `${current} ${sentence}` : sentence;
    if (current.length > 0 && estimateTokens(projected) > maxChunkTokens) {
      flush(candidate.startPosition + (sentenceStart >= 0 ? sentenceStart : offset));
      const overlapText = current.split(/\s+/).slice(-overlap).join(' ');
      current = overlapText.length > 0 ? `${overlapText} ${sentence}` : sentence;
      partStart = candidate.startPosition + (sentenceStart >= 0 ? sentenceStart : offset);
    } else {
      current = projected;
    }
    offset = sentenceStart >= 0 ? sentenceStart + sentence.length : offset + sentence.length;
  }

  flush(candidate.endPosition);

  if (parts.length === 0) {
    return [candidate];
  }
  return parts;
}

function formatSpecificCandidates(text: string, format: DocumentFormat): RawChunkCandidate[] {
  switch (format) {
    case 'json':
      return recordsToCandidates(parseJsonRecords(text), text, true);
    case 'csv':
      return recordsToCandidates(parseCsvRecords(text), text, true);
    case 'markdown':
      return recordsToCandidates(parseMarkdownSections(text), text, true);
    case 'text':
      return splitTextRecords(text);
    default:
      return splitTextRecords(text);
  }
}

function applySizeGuardrail(candidates: RawChunkCandidate[], maxChunkTokens: number): RawChunkCandidate[] {
  const result: RawChunkCandidate[] = [];
  for (const candidate of candidates) {
    if (estimateTokens(candidate.content) > maxChunkTokens) {
      result.push(...splitOversizedRecord(candidate, maxChunkTokens));
    } else {
      result.push(candidate);
    }
  }
  return result;
}

function dedupeCandidates(candidates: RawChunkCandidate[]): RawChunkCandidate[] {
  const seen = new Set<string>();
  const result: RawChunkCandidate[] = [];
  for (const candidate of candidates) {
    const hash = hashChunkContent(candidate.content);
    if (seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    result.push(candidate);
  }
  return result;
}

export interface ChunkDocumentOptions {
  text: string;
  format: DocumentFormat;
  documentName: string;
  /** Target size for packing unstructured prose (paragraph merging). */
  maxChunkTokens: number;
  /** Per-record split threshold; keeps whole records unless truly oversized. */
  maxRecordTokens?: number;
}

/**
 * Structure-aware chunking: explicit markers first, then format/record boundaries,
 * size guardrail for oversized records, dedupe, and metadata enrichment.
 */
export function chunkDocument(options: ChunkDocumentOptions): DocumentChunk[] {
  const { text, format, maxChunkTokens } = options;
  const maxRecordTokens = options.maxRecordTokens ?? RAG_CHUNK_DEFAULTS.baseChunkSize;
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let candidates: RawChunkCandidate[];
  let fromExplicitMarkers = false;

  const markerChunks = extractMarkerChunks(text);
  if (markerChunks && markerChunks.length > 0) {
    candidates = markerChunks;
    fromExplicitMarkers = true;
  } else {
    candidates = formatSpecificCandidates(text, format);
    if (format === 'text') {
      const hasStructure = DELIMITER_LINE.test(text) || RECORD_KEY_PREFIX.test(text);
      if (!hasStructure) {
        candidates = packParagraphs(text, maxChunkTokens);
      }
    }
  }

  // Honor explicit RAG_CHUNK markers verbatim — do not split oversized marker blocks.
  if (!fromExplicitMarkers) {
    candidates = applySizeGuardrail(candidates, maxRecordTokens);
  }
  candidates = dedupeCandidates(candidates);

  return candidates.map((candidate, index) => {
    const contentHash = hashChunkContent(candidate.content);
    const language = detectLanguage(candidate.content);
    return {
      content: candidate.content,
      index,
      startPosition: candidate.startPosition,
      endPosition: candidate.endPosition,
      tokenCount: estimateTokens(candidate.content),
      ...(candidate.recordId ? { recordId: candidate.recordId } : {}),
      ...(candidate.sectionLabel ? { sectionLabel: candidate.sectionLabel } : {}),
      language,
      contentHash,
    };
  });
}
