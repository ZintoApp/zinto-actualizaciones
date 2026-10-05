import type { WhatsAppTemplate } from '@/types/whatsapp-template';
import { getWhatsAppTemplateMediaSource, type WhatsAppTemplateMediaSource } from '@shared/whatsapp-template-media';
import {
  getInvalidWhatsAppNamedParameters,
  mappingVariablePath,
  resolveTemplateVariableMapping,
  WHATSAPP_NAMED_PARAMETER_MAX_LENGTH,
  type WhatsAppTemplateComponentValues,
  type WhatsAppTemplateVariableDefinition,
} from '@shared/whatsapp-template-variables';

type Translate = (key: string, fallback?: string, variables?: Record<string, any>) => string;

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i;
const VIDEO_EXTENSION = /\.(?:3gpp?|m4v|mov|mp4|webm)(?:$|[?#])/i;
const DOCUMENT_EXTENSION = /\.(?:csv|docx?|pdf|pptx?|rtf|txt|xlsx?)(?:$|[?#])/i;

export function getTemplatePreviewMedia(template: WhatsAppTemplate): WhatsAppTemplateMediaSource | undefined {
  const canonical = getWhatsAppTemplateMediaSource(template);
  if (canonical) return canonical;
  const url = template.mediaUrls?.find(value => typeof value === 'string' && value.trim())?.trim();
  if (!url) return undefined;
  if (IMAGE_EXTENSION.test(url)) return { type: 'image', url };
  if (VIDEO_EXTENSION.test(url)) return { type: 'video', url };
  if (DOCUMENT_EXTENSION.test(url)) return { type: 'document', url };
  return undefined;
}

export function getTemplateVariables(template: WhatsAppTemplate): WhatsAppTemplateVariableDefinition[] {
  if (template.whatsappTemplateVariables?.length) return template.whatsappTemplateVariables;
  return (template.variables || []).map(key => ({
    id: `body:${key}`,
    component: 'body',
    ...(/^\d+$/.test(key) ? { position: Number(key) } : { name: key }),
  }));
}

export function toTemplateComponentValues(
  definitions: WhatsAppTemplateVariableDefinition[],
  values: Record<string, string>,
): WhatsAppTemplateComponentValues {
  const result: WhatsAppTemplateComponentValues = { header: {}, body: {}, buttons: [] };
  definitions.forEach(definition => {
    const key = definition.name || String(definition.position || 1);
    if (definition.component === 'button') {
      let button = result.buttons!.find(item => item.index === definition.buttonIndex && item.subType === definition.buttonSubType);
      if (!button) {
        button = { index: definition.buttonIndex || 0, subType: definition.buttonSubType!, values: {} };
        result.buttons!.push(button);
      }
      (button.values as Record<string, string>)[key] = values[definition.id];
    } else {
      (result[definition.component] as Record<string, string>)[key] = values[definition.id];
    }
  });
  return result;
}

export function translatedTemplateValidationError(
  t: Translate,
  definitions: WhatsAppTemplateVariableDefinition[],
): string | undefined {
  const invalid = getInvalidWhatsAppNamedParameters(definitions)[0];
  if (!invalid?.name) return undefined;
  return t(
    'templates.named_parameter_too_long',
    'Meta named parameter "{{name}}" exceeds the {{limit}}-character limit. Recreate this template using numbered placeholders or system variables.',
    { name: invalid.name, limit: WHATSAPP_NAMED_PARAMETER_MAX_LENGTH },
  );
}

export function templateVariableHasValue(
  template: WhatsAppTemplate,
  definition: WhatsAppTemplateVariableDefinition,
  values: Record<string, string>,
  context: Record<string, any>,
  requireMappedResolution: boolean | string[] = false,
): boolean {
  if (values[definition.id]?.trim()) return true;
  const mapping = template.whatsappTemplateVariableMappings?.[definition.id];
  if (!mapping) return false;
  if (!requireMappedResolution) return true;
  if (Array.isArray(requireMappedResolution)) {
    const path = mappingVariablePath(mapping);
    if (!path || !requireMappedResolution.some(prefix => path.startsWith(prefix))) return true;
  }
  return Boolean(resolveTemplateVariableMapping(mapping, context));
}

export function templateVariableLabel(t: Translate, definition: WhatsAppTemplateVariableDefinition): string {
  const component = t(`templates.component.${definition.component}`, definition.component === 'body'
    ? 'Body'
    : definition.component === 'header'
      ? 'Header'
      : 'Button');
  const componentLabel = definition.buttonIndex === undefined
    ? component
    : t('templates.button_number', 'Button {{number}}', { number: definition.buttonIndex + 1 });
  return `${componentLabel}: ${definition.name || definition.position}`;
}
