/**
 * Interpolate {{variable}} placeholders in Code Execution source before sandbox run.
 * Matches FlowExecutionContext.replaceVariables formatting for plain string values.
 */
export function interpolateCodeTemplates(
  code: string,
  variables: Record<string, any> | null | undefined
): string {
  if (!code) return '';
  const vars = variables && typeof variables === 'object' ? variables : {};

  return code.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return formatTemplateValue(vars[key]);
    }

    const parts = key.split('.');
    let current: any = vars;
    for (const part of parts) {
      if (current != null && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return match;
      }
    }

    return formatTemplateValue(current);
  });
}

function formatTemplateValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Extract unique {{variable}} keys from code for test payloads. */
export function extractCodeTemplateKeys(code: string): string[] {
  if (!code) return [];
  const keys = new Set<string>();
  for (const match of code.matchAll(/\{\{([a-zA-Z0-9_.-]+)\}\}/g)) {
    keys.add(match[1]);
  }
  return [...keys];
}
