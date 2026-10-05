import type { AICustomFieldWrite } from '@shared/types/flow-execution';

export function normalizeTriggeredCustomFieldWrites(
  functionCalls: Array<{ name: string; arguments: unknown }>,
  allowedPaths: ReadonlySet<string>,
): AICustomFieldWrite[] {
  const deduped = new Map<string, unknown>();
  for (const call of functionCalls) {
    if (call.name !== 'set_custom_fields') continue;
    let args = call.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = {}; }
    }
    if (!args || typeof args !== 'object' || !Array.isArray((args as any).writes)) continue;
    for (const entry of (args as any).writes) {
      if (!entry || typeof entry !== 'object') continue;
      const path = typeof entry.field === 'string' ? entry.field : '';
      const value = entry.value;
      const empty = value == null || (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0);
      if (!allowedPaths.has(path) || empty) continue;
      deduped.set(path, value);
    }
  }
  return [...deduped].map(([path, value]) => ({ path, value }));
}
