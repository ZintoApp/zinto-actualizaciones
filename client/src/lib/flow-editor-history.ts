const FLOW_DRAFT_TRANSIENT_KEYS = new Set([
  'selected',
  'dragging',
  'resizing',
  'measured',
  'positionAbsolute',
]);

export const FLOW_EDITOR_HISTORY_LIMIT = 100;

export function createFlowDraftSignature(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (key, currentValue) => {
    if (FLOW_DRAFT_TRANSIENT_KEYS.has(key) || typeof currentValue === 'function') return undefined;
    if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      if (seen.has(currentValue)) return undefined;
      seen.add(currentValue);
      return Object.keys(currentValue)
        .sort()
        .reduce<Record<string, unknown>>((sorted, objectKey) => {
          sorted[objectKey] = currentValue[objectKey];
          return sorted;
        }, {});
    }
    return currentValue;
  });
}

export function cloneFlowHistoryValue<T>(value: T): T {
  return JSON.parse(createFlowDraftSignature(value)) as T;
}

export function appendBoundedFlowHistory<T>(stack: T[], value: T): T[] {
  return [...stack, value].slice(-FLOW_EDITOR_HISTORY_LIMIT);
}
