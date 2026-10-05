import type {
  AiFlowCreatorGenerationPhase,
  AiFlowCreatorProgressEvent,
  AiFlowCreatorProgressMessageKey,
  AiFlowCreatorProgressPhase,
} from '@shared/types/ai-flow-creator';

export type AiFlowCreatorPhaseUpdate = {
  phase: AiFlowCreatorGenerationPhase | 'finalizing';
  attempt?: number;
};

type ActiveProgress = {
  phase: AiFlowCreatorProgressPhase;
  narrativeId: string;
  actionId: string;
  params?: Record<string, string | number>;
  timers: Array<ReturnType<typeof setTimeout>>;
};

const progressMessageKey = (
  phase: AiFlowCreatorProgressPhase,
  kind: 'narrative' | 'action',
): AiFlowCreatorProgressMessageKey => `flow_builder.creator.progress.${phase}.${kind}`;

/**
 * Converts pipeline phase transitions into a safe, deterministic stream for the UI.
 * It never receives model output, prompts, credentials, or graph contents.
 */
export function createAiFlowCreatorProgressEmitter(params: {
  generationId: string;
  send: (event: AiFlowCreatorProgressEvent) => void;
  chunkCount?: number;
  chunkDelayMs?: number;
}) {
  const chunkCount = Math.max(1, params.chunkCount ?? 6);
  const chunkDelayMs = Math.max(0, params.chunkDelayMs ?? 85);
  let sequence = 0;
  let active: ActiveProgress | null = null;
  let disposed = false;

  const send = (event: AiFlowCreatorProgressEvent) => {
    if (!disposed) params.send(event);
  };

  const clearTimers = (entry: ActiveProgress) => {
    for (const timer of entry.timers) clearTimeout(timer);
    entry.timers = [];
  };

  const sendNarrative = (entry: ActiveProgress, chunkIndex: number, state: 'streaming' | 'complete') => {
    send({
      type: 'progress',
      generationId: params.generationId,
      entryId: entry.narrativeId,
      phase: entry.phase,
      kind: 'narrative',
      state,
      messageKey: progressMessageKey(entry.phase, 'narrative'),
      params: entry.params,
      chunkIndex,
      chunkCount,
    });
  };

  const finishActive = (state: 'complete' | 'failed') => {
    const entry = active;
    if (!entry) return;
    clearTimers(entry);
    sendNarrative(entry, chunkCount, 'complete');
    send({
      type: 'progress',
      generationId: params.generationId,
      entryId: entry.actionId,
      phase: entry.phase,
      kind: 'action',
      state,
      messageKey: progressMessageKey(entry.phase, 'action'),
      params: entry.params,
    });
    active = null;
  };

  const advance = (update: AiFlowCreatorPhaseUpdate) => {
    if (disposed) return;
    finishActive(update.phase === 'repairing' ? 'failed' : 'complete');
    sequence += 1;
    const suffix = `${sequence}-${update.phase}-${update.attempt ?? 0}`;
    const entry: ActiveProgress = {
      phase: update.phase,
      narrativeId: `${params.generationId}-${suffix}-narrative`,
      actionId: `${params.generationId}-${suffix}-action`,
      params: update.attempt ? { attempt: update.attempt } : undefined,
      timers: [],
    };
    active = entry;
    sendNarrative(entry, 1, chunkCount === 1 ? 'complete' : 'streaming');
    send({
      type: 'progress',
      generationId: params.generationId,
      entryId: entry.actionId,
      phase: entry.phase,
      kind: 'action',
      state: 'active',
      messageKey: progressMessageKey(entry.phase, 'action'),
      params: entry.params,
    });
    for (let chunkIndex = 2; chunkIndex <= chunkCount; chunkIndex += 1) {
      const timer = setTimeout(() => {
        if (active?.narrativeId !== entry.narrativeId) return;
        sendNarrative(entry, chunkIndex, chunkIndex === chunkCount ? 'complete' : 'streaming');
      }, chunkDelayMs * (chunkIndex - 1));
      entry.timers.push(timer);
    }
  };

  return {
    advance,
    complete: () => finishActive('complete'),
    fail: () => finishActive('failed'),
    dispose: () => {
      if (active) clearTimers(active);
      active = null;
      disposed = true;
    },
  };
}
