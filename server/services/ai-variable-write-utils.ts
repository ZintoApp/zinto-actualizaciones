import type { AIVariableWrite } from '@shared/types/flow-execution';

export type AIVariableWritePersistenceContext = {
  setVariable: (name: string, value: unknown) => void;
};

export type FlowVariableStorageAdapter = {
  setFlowVariable: (params: {
    sessionId: string;
    variableKey: string;
    variableValue: unknown;
    variableType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    scope?: 'global' | 'flow' | 'node' | 'user' | 'session';
  }) => Promise<unknown>;
};

export async function applyAIAssistantVariableWrites(params: {
  variableWrites?: AIVariableWrite[];
  allowedVariableNames: Set<string>;
  context: AIVariableWritePersistenceContext;
  sessionId?: string;
  storageAdapter?: FlowVariableStorageAdapter;
}): Promise<number> {
  const { variableWrites, allowedVariableNames, context, sessionId, storageAdapter } = params;
  if (!variableWrites || variableWrites.length === 0) {
    return 0;
  }

  let appliedWritesCount = 0;
  for (const write of variableWrites) {
    if (!allowedVariableNames.has(write.name)) {
      console.warn(
        `[AI Variable Extraction] Skipping write for variable not in active custom-variable allowlist: "${write.name}"`
      );
      continue;
    }
    appliedWritesCount += 1;
    context.setVariable(write.name, write.value);
    if (sessionId && storageAdapter) {
      await storageAdapter.setFlowVariable({
        sessionId,
        variableKey: write.name,
        variableValue: write.value,
        variableType: 'string',
        scope: 'session'
      });
    }
    console.log(`[AI Variable Extraction] Set variable "${write.name}" = "${write.value}"`);
  }

  return appliedWritesCount;
}

export function resolveAiVariablesCompleteRouting(params: {
  activeCustomVarNames: string[];
  prevValues: Record<string, string>;
  currentValues: Record<string, string>;
  appliedWritesCount: number;
  edgeAlreadyDispatched: boolean;
}): boolean {
  if (params.activeCustomVarNames.length === 0) {
    return false;
  }

  const beforeAllFilled = params.activeCustomVarNames.every(
    (name) => (params.prevValues[name] ?? '').trim().length > 0
  );
  const afterAllFilled = params.activeCustomVarNames.every(
    (name) => (params.currentValues[name] ?? '').trim().length > 0
  );
  const anyWatchedValueChangedFromPreTurn = params.activeCustomVarNames.some(
    (name) => (params.currentValues[name] ?? '').trim() !== (params.prevValues[name] ?? '').trim()
  );
  const refreshedWithNewData =
    beforeAllFilled &&
    params.appliedWritesCount > 0 &&
    anyWatchedValueChangedFromPreTurn;

  return (
    afterAllFilled &&
    ((!beforeAllFilled && !params.edgeAlreadyDispatched) || refreshedWithNewData)
  );
}
