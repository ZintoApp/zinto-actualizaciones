import type {
  AiAssistantCustomFieldBinding,
  AiAssistantCustomFieldMode,
} from './types/node-types';

export const AI_ASSISTANT_CUSTOM_FIELD_MODES = ['read', 'write', 'read_write'] as const;

const VALID_MODES = new Set<string>(AI_ASSISTANT_CUSTOM_FIELD_MODES);

export function customFieldVariablePath(
  entity: 'contact' | 'deal',
  fieldName: string,
): string {
  return `${entity}.customFields.${fieldName}`;
}

export function customFieldBindingCanRead(mode: AiAssistantCustomFieldMode): boolean {
  return mode === 'read' || mode === 'read_write';
}

export function customFieldBindingCanWrite(mode: AiAssistantCustomFieldMode): boolean {
  return mode === 'write' || mode === 'read_write';
}

export function normalizeAiAssistantCustomFieldBindings(
  value: unknown,
): AiAssistantCustomFieldBinding[] {
  if (!Array.isArray(value)) return [];
  const bindings = new Map<string, AiAssistantCustomFieldBinding>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const customFieldId = Number(raw.customFieldId);
    const entity = raw.entity === 'contact' || raw.entity === 'deal' ? raw.entity : null;
    const fieldName = String(raw.fieldName ?? '').trim();
    const mode = VALID_MODES.has(String(raw.mode))
      ? raw.mode as AiAssistantCustomFieldMode
      : null;
    if (!Number.isInteger(customFieldId) || customFieldId <= 0 || !entity || !fieldName || !mode) continue;
    const key = `${entity}:${customFieldId}`;
    if (bindings.has(key)) continue;
    bindings.set(key, {
      id: String(raw.id ?? '').trim() || `ai_custom_field_${entity}_${customFieldId}`,
      customFieldId,
      entity,
      fieldName,
      mode,
      required: customFieldBindingCanWrite(mode) && raw.required === true,
    });
  }
  return [...bindings.values()];
}
