/** Collect unique `{{name}}` placeholders that remain in template text. */
export function findUnresolvedTemplateVariables(...parts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  for (const part of parts) {
    if (!part) continue;
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((match = re.exec(part)) !== null) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}
