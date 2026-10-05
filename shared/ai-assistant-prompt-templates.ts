export const AI_ASSISTANT_PROMPT_TEMPLATE_IDS = ['rag', 'calendar_booking'] as const;

export type AiAssistantPromptTemplateId = typeof AI_ASSISTANT_PROMPT_TEMPLATE_IDS[number];

export interface AiAssistantPromptTemplateDefinition {
  id: AiAssistantPromptTemplateId;
  labelKey: string;
  contentKey: string;
}

export const AI_ASSISTANT_PROMPT_TEMPLATES: AiAssistantPromptTemplateDefinition[] = [
  {
    id: 'rag',
    labelKey: 'flow_builder.ai_prompt_template_rag_label',
    contentKey: 'flow_builder.ai_prompt_template_rag',
  },
  {
    id: 'calendar_booking',
    labelKey: 'flow_builder.ai_prompt_template_calendar_label',
    contentKey: 'flow_builder.ai_prompt_template_calendar_booking',
  },
];

export function isAiAssistantPromptTemplateId(value: string): value is AiAssistantPromptTemplateId {
  return (AI_ASSISTANT_PROMPT_TEMPLATE_IDS as readonly string[]).includes(value);
}
