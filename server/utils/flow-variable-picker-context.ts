/** Flatten execution context into dot-path keys for flow-builder variable pickers (bounded depth). */
export function collectContextVariableKeysForPicker(
  obj: Record<string, unknown>,
  maxKeys: number
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (prefix: string, val: unknown, depth: number) => {
    if (out.length >= maxKeys || depth > 10) return;
    if (val === null || val === undefined) {
      if (prefix && !seen.has(prefix)) {
        seen.add(prefix);
        out.push(prefix);
      }
      return;
    }
    if (typeof val === "object" && !Array.isArray(val)) {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) {
        if (prefix && !seen.has(prefix)) {
          seen.add(prefix);
          out.push(prefix);
        }
        return;
      }
      for (const [k, v] of entries) {
        const next = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          walk(next, v, depth + 1);
        } else if (!seen.has(next)) {
          seen.add(next);
          out.push(next);
        }
      }
      return;
    }
    if (prefix && !seen.has(prefix)) {
      seen.add(prefix);
      out.push(prefix);
    }
  };
  for (const [k, v] of Object.entries(obj)) {
    walk(k, v, 0);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
