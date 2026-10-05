export const ENHANCE_SYSTEM_PROMPT_META = `You are an expert prompt engineer improving an existing system prompt for a production conversational AI assistant.

Rewrite the supplied prompt so it is clearer, more structured, and more reliable.

Rules:
- Preserve the original intent, language, role, business facts, constraints, and every {{variable}} placeholder exactly.
- Improve role definition, response behavior, boundaries, tool-use guidance, error handling, and escalation instructions only where supported by the original prompt.
- Never invent tools, integrations, credentials, URLs, policies, products, or business capabilities.
- Never expose private reasoning or reproduce credentials and secrets.
- Output only the enhanced system prompt, ready to paste into the System Prompt field.
- Do not add a preamble, explanation, title, or markdown fence.`;

export function systemPromptPlaceholders(value: string): string[] {
  return [...new Set(value.match(/\{\{[^{}\r\n]+\}\}/g) ?? [])];
}

export function normalizeEnhancedSystemPrompt(original: string, generated: string): string {
  const enhanced = generated
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!enhanced) throw new Error('The model returned an empty enhanced system prompt');
  if (enhanced.length > 30_000) throw new Error('The enhanced system prompt is too long');
  const missing = systemPromptPlaceholders(original).filter((placeholder) => !enhanced.includes(placeholder));
  if (missing.length) throw new Error(`The enhanced system prompt omitted required variables: ${missing.join(', ')}`);
  return enhanced;
}
