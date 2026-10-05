import type { AiAssistantVariableDefinition } from './types/node-types';

const AI_ASSISTANT_PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
const AI_ASSISTANT_VARIABLE_NAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

export function extractAiAssistantPlaceholderNames(prompt: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  AI_ASSISTANT_PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = AI_ASSISTANT_PLACEHOLDER_PATTERN.exec(prompt)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

export function normalizeAiAssistantVariables(value: unknown): AiAssistantVariableDefinition[] {
  if (!Array.isArray(value)) return [];

  const variables = new Map<string, AiAssistantVariableDefinition>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const name = String(raw.name ?? '').trim();
    if (!name || !AI_ASSISTANT_VARIABLE_NAME_PATTERN.test(name) || variables.has(name)) continue;
    const id = String(raw.id ?? '').trim() || `ai_var_${name}`;
    variables.set(name, {
      id,
      name,
      dataType: 'text',
      required: raw.required !== false,
    });
  }
  return [...variables.values()];
}

export function syncAiAssistantVariables(params: {
  prompt: string;
  current: unknown;
  knownReadNames: ReadonlySet<string>;
  legacyCustomNames: ReadonlySet<string>;
}): AiAssistantVariableDefinition[] {
  const currentByName = new Map(
    normalizeAiAssistantVariables(params.current).map((variable) => [variable.name, variable])
  );

  return extractAiAssistantPlaceholderNames(params.prompt).flatMap((name) => {
    if (params.legacyCustomNames.has(name) || params.knownReadNames.has(name)) return [];
    const existing = currentByName.get(name);
    if (existing) return [existing];
    return [{ id: `ai_var_${name}`, name, dataType: 'text' as const, required: true }];
  });
}
