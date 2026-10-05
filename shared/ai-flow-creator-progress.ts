import type { AiFlowCreatorProgressEvent } from './types/ai-flow-creator';

export type AiFlowCreatorProgressEntry = Omit<AiFlowCreatorProgressEvent, 'type'>;

export function visibleCreatorProgressText(text: string, chunkIndex?: number, chunkCount?: number): string {
  if (!chunkIndex || !chunkCount || chunkIndex >= chunkCount) return text;
  const segments = text.match(/\S+\s*/gu) ?? [text];
  const visibleCount = Math.max(1, Math.ceil((segments.length * chunkIndex) / chunkCount));
  return segments.slice(0, visibleCount).join('').trimEnd();
}

export function upsertCreatorProgressEntry(
  entries: AiFlowCreatorProgressEntry[],
  event: AiFlowCreatorProgressEvent,
): AiFlowCreatorProgressEntry[] {
  const nextEntry: AiFlowCreatorProgressEntry = {
    generationId: event.generationId,
    entryId: event.entryId,
    phase: event.phase,
    kind: event.kind,
    state: event.state,
    messageKey: event.messageKey,
    params: event.params,
    chunkIndex: event.chunkIndex,
    chunkCount: event.chunkCount,
  };
  const index = entries.findIndex((entry) => entry.entryId === event.entryId);
  if (index < 0) return [...entries, nextEntry];
  const current = entries[index];
  if ((event.chunkIndex ?? 0) < (current.chunkIndex ?? 0)) return entries;
  const next = [...entries];
  next[index] = { ...current, ...nextEntry };
  return next;
}
