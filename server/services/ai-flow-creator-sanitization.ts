import type { FlowGraphDraft } from '@shared/types/ai-flow-creator';

const SENSITIVE_KEY = /(api[-_]?key|token|password|secret|authorization|connectionstring|consumersecret|clientsecret|privatekey|refreshtoken|accesstoken)/i;
const REDACTED = '[REDACTED]';

function isConfigured(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

export function redactCreatorText(value: string): string {
  return value
    .replace(/\b(sk-(?:proj-)?[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+\/-]{12,})\b/gi, REDACTED)
    .replace(/((?:api[-_ ]?key|token|password|secret|authorization|connection string)\s*[:=]\s*)([^\s,;]+)/gi, `$1${REDACTED}`)
    .slice(0, 30000);
}

export function promptPlaceholders(value: string): string[] {
  return [...new Set(value.match(/\{\{[^{}\r\n]+\}\}/g) ?? [])];
}

export function normalizeEnhancedWorkflowPrompt(original: string, generated: string): string {
  const enhanced = generated.trim().replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!enhanced) throw new Error('The model returned an empty enhanced prompt');
  if (enhanced.length > 20_000) throw new Error('The enhanced prompt is too long');
  const missing = promptPlaceholders(original).filter((placeholder) => !enhanced.includes(placeholder));
  if (missing.length) throw new Error(`The enhanced prompt omitted required variables: ${missing.join(', ')}`);
  return enhanced;
}

export function sanitizeCreatorValue(value: unknown, key = ''): unknown {
  if (typeof value === 'function') return undefined;
  if (SENSITIVE_KEY.test(key)) return isConfigured(value) ? '[CONFIGURED]' : '[NOT CONFIGURED]';
  if (Array.isArray(value)) return value.map((entry) => sanitizeCreatorValue(entry)).filter((entry) => entry !== undefined);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const namedKey = typeof source.key === 'string'
      ? source.key
      : typeof source.name === 'string'
        ? source.name
        : '';
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(source)) {
      const effectiveKey = childKey === 'value' && SENSITIVE_KEY.test(namedKey) ? namedKey : childKey;
      const sanitized = sanitizeCreatorValue(childValue, effectiveKey);
      if (sanitized !== undefined) result[childKey] = sanitized;
    }
    return result;
  }
  return value;
}

export function sanitizeFlowGraphForCreator(graph: FlowGraphDraft): FlowGraphDraft {
  return sanitizeCreatorValue(graph) as FlowGraphDraft;
}
