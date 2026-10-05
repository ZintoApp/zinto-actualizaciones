export type WhatsAppParameterFormat = 'named' | 'positional';

export type WhatsAppTemplateVariableComponent = 'header' | 'body' | 'button';

export interface WhatsAppTemplateVariableDefinition {
  id: string;
  component: WhatsAppTemplateVariableComponent;
  name?: string;
  position?: number;
  buttonIndex?: number;
  buttonSubType?: 'url' | 'copy_code';
  example?: string;
}

export interface WhatsAppTemplateComponentValues {
  header?: string[] | Record<string, string>;
  body?: string[] | Record<string, string>;
  buttons?: Array<{
    index: number;
    subType: 'url' | 'copy_code';
    values: string[] | Record<string, string>;
  }>;
}

export interface WhatsAppTemplateVariableMapping {
  /**
   * `variable` is the canonical mapping used by templates. `contact` and
   * `custom` are retained for backwards compatibility with saved campaigns.
   */
  source: 'variable' | 'contact' | 'custom' | 'fixed';
  field?: string;
  value?: string;
  fallback?: string;
}

export type WhatsAppTemplateVariableMappings = Record<string, WhatsAppTemplateVariableMapping>;

/** Meta Cloud API limit for named template parameter identifiers. */
export const WHATSAPP_NAMED_PARAMETER_MAX_LENGTH = 20;

export function getInvalidWhatsAppNamedParameters(
  definitions: WhatsAppTemplateVariableDefinition[] = [],
): WhatsAppTemplateVariableDefinition[] {
  return definitions.filter(definition =>
    Boolean(definition.name && definition.name.length > WHATSAPP_NAMED_PARAMETER_MAX_LENGTH));
}

export function getWhatsAppTemplateVariableValidationError(
  definitions: WhatsAppTemplateVariableDefinition[] = [],
): string | undefined {
  const invalid = getInvalidWhatsAppNamedParameters(definitions)[0];
  if (!invalid?.name) return undefined;
  return `Meta named parameter "${invalid.name}" exceeds the ${WHATSAPP_NAMED_PARAMETER_MAX_LENGTH}-character limit. Recreate this template using numbered placeholders or system variables.`;
}

export function assertValidWhatsAppTemplateVariables(
  definitions: WhatsAppTemplateVariableDefinition[] = [],
): void {
  const error = getWhatsAppTemplateVariableValidationError(definitions);
  if (error) throw new Error(error);
}

export const SYSTEM_PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]+)\s*\}\}/g;

export function mappingVariablePath(mapping?: WhatsAppTemplateVariableMapping): string | undefined {
  if (!mapping) return undefined;
  if (mapping.source === 'variable') return mapping.field?.trim() || undefined;
  if (mapping.source === 'contact' && mapping.field) return `contact.${mapping.field}`;
  if (mapping.source === 'custom' && mapping.field) return `contact.custom.${mapping.field}`;
  return undefined;
}

export function mappingToTemplateExpression(mapping?: WhatsAppTemplateVariableMapping): string {
  if (!mapping) return '';
  if (mapping.source === 'fixed') return mapping.value || '';
  const path = mappingVariablePath(mapping);
  return path ? `{{${path}}}` : '';
}

export function templateExpressionToMapping(value: string): WhatsAppTemplateVariableMapping {
  const trimmed = value.trim();
  const match = trimmed.match(/^\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}$/);
  return match
    ? { source: 'variable', field: match[1] }
    : { source: 'fixed', value };
}

export function getValueAtVariablePath(context: Record<string, any>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(context, path)) return context[path];
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value == null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, context);
}

/** Resolve one saved mapping without making assumptions about the sending workflow. */
export function resolveTemplateVariableMapping(
  mapping: WhatsAppTemplateVariableMapping | undefined,
  context: Record<string, any>,
): string | undefined {
  if (!mapping) return undefined;
  let value: unknown;
  if (mapping.source === 'fixed') value = mapping.value;
  else {
    const path = mappingVariablePath(mapping);
    if (path) value = getValueAtVariablePath(context, path);
    // Legacy campaign contexts stored contact values at the root.
    if ((value == null || String(value).trim() === '') && mapping.source === 'contact' && mapping.field) {
      value = context[mapping.field];
    }
    if ((value == null || String(value).trim() === '') && mapping.source === 'custom' && mapping.field) {
      value = context.customFields?.[mapping.field];
    }
  }
  if (value == null || String(value).trim() === '') value = mapping.fallback;
  if (value == null || String(value).trim() === '') return undefined;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

export function mergeTemplateVariableMappings(
  defaults?: WhatsAppTemplateVariableMappings | null,
  overrides?: WhatsAppTemplateVariableMappings | null,
): WhatsAppTemplateVariableMappings {
  return { ...(defaults || {}), ...(overrides || {}) };
}

export function compileSystemVariableText(
  text: string,
  idForPosition: (position: number) => string,
): { text: string; mappings: WhatsAppTemplateVariableMappings } {
  const rawTokens = Array.from((text || '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g), match => match[1].trim());
  const systemTokens = rawTokens.filter(token => /^[A-Za-z_][A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]+$/.test(token));
  if (systemTokens.length > 0 && systemTokens.length !== rawTokens.length) {
    throw new Error('System variables and Meta placeholders cannot be mixed in the same component');
  }
  const positions = new Map<string, number>();
  const mappings: WhatsAppTemplateVariableMappings = {};
  const compiled = (text || '').replace(SYSTEM_PLACEHOLDER_PATTERN, (_token, rawPath: string) => {
    const path = rawPath.trim();
    let position = positions.get(path);
    if (!position) {
      position = positions.size + 1;
      positions.set(path, position);
      mappings[idForPosition(position)] = { source: 'variable', field: path };
    }
    return `{{${position}}}`;
  });
  return { text: compiled, mappings };
}

export function inferContactFieldForVariable(name?: string): string | undefined {
  if (!name) return undefined;
  const aliases: Record<string, string> = {
    name: 'name', customer_name: 'name', contact_name: 'name', full_name: 'name',
    phone: 'phone', phone_number: 'phone', mobile: 'phone',
    email: 'email', email_address: 'email',
    company: 'company', company_name: 'company',
    username: 'username', whatsapp_username: 'username',
  };
  return aliases[name];
}

const POSITIONAL_PATTERN = /\{\{(\d+)\}\}/g;
const NAMED_PATTERN = /\{\{([a-z][a-z0-9_]*)\}\}/g;

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function detectParameterFormat(texts: string[]): WhatsAppParameterFormat | null {
  let named = false;
  let positional = false;
  for (const text of texts) {
    POSITIONAL_PATTERN.lastIndex = 0;
    NAMED_PATTERN.lastIndex = 0;
    positional ||= POSITIONAL_PATTERN.test(text || '');
    NAMED_PATTERN.lastIndex = 0;
    named ||= Array.from((text || '').matchAll(NAMED_PATTERN)).some(match => !/^\d+$/.test(match[1]));
  }
  if (named && positional) throw new Error('Named and positional template variables cannot be mixed');
  return named ? 'named' : positional ? 'positional' : null;
}

export function extractTextVariableKeys(
  text: string,
  format: WhatsAppParameterFormat,
  options: { allowInvalidNamedParameters?: boolean } = {},
): string[] {
  const rawTokens = Array.from((text || '').matchAll(/\{\{([^{}]+)\}\}/g), match => match[1]);
  for (const token of rawTokens) {
    const valid = format === 'named' ? /^[a-z][a-z0-9_]*$/.test(token) : /^\d+$/.test(token);
    if (!valid) throw new Error(`Invalid ${format} variable {{${token}}}`);
  }
  const pattern = format === 'named' ? NAMED_PATTERN : POSITIONAL_PATTERN;
  pattern.lastIndex = 0;
  const keys = unique(Array.from((text || '').matchAll(pattern), match => match[1]));
  if (format === 'named' && !options.allowInvalidNamedParameters) {
    const invalid = keys.find(key => key.length > WHATSAPP_NAMED_PARAMETER_MAX_LENGTH);
    if (invalid) {
      throw new Error(`Meta named parameter "${invalid}" exceeds the ${WHATSAPP_NAMED_PARAMETER_MAX_LENGTH}-character limit. Recreate this template using numbered placeholders or system variables.`);
    }
  }
  if (format === 'positional' && keys.length) {
    const positions = keys.map(Number).sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) throw new Error('Positional variables must be sequential and start at {{1}}');
    });
    return positions.map(String);
  }
  return keys;
}

function exampleFor(component: any, format: WhatsAppParameterFormat, key: string, index: number): string | undefined {
  if (format === 'named') {
    const field = component.type?.toUpperCase() === 'HEADER' ? 'header_text_named_params' : 'body_text_named_params';
    return component.example?.[field]?.find((item: any) => item?.param_name === key)?.example;
  }
  const examples = component.type?.toUpperCase() === 'HEADER'
    ? component.example?.header_text
    : component.example?.body_text?.[0];
  return examples?.[index];
}

export function extractTemplateVariables(
  components: any[] = [],
  explicitFormat?: string | null,
  options: { allowInvalidNamedParameters?: boolean } = {},
): { parameterFormat: WhatsAppParameterFormat; variables: WhatsAppTemplateVariableDefinition[] } {
  const texts: string[] = [];
  for (const component of components) {
    const type = String(component?.type || '').toUpperCase();
    if (type === 'HEADER' || type === 'BODY') texts.push(component.text || '');
    if (type === 'BUTTONS') {
      for (const button of component.buttons || []) {
        if (String(button.type).toUpperCase() === 'URL') texts.push(button.url || '');
      }
    }
  }
  const parameterFormat = explicitFormat?.toLowerCase() === 'named'
    ? 'named'
    : explicitFormat?.toLowerCase() === 'positional'
      ? 'positional'
      : detectParameterFormat(texts) || 'positional';
  const variables: WhatsAppTemplateVariableDefinition[] = [];

  for (const component of components) {
    const type = String(component?.type || '').toUpperCase();
    if (type === 'HEADER' && String(component.format || '').toUpperCase() === 'TEXT') {
      extractTextVariableKeys(component.text || '', parameterFormat, options).forEach((key, index) => variables.push({
        id: `header:${key}`, component: 'header',
        ...(parameterFormat === 'named' ? { name: key } : { position: Number(key) }),
        example: exampleFor(component, parameterFormat, key, index),
      }));
    }
    if (type === 'BODY') {
      extractTextVariableKeys(component.text || '', parameterFormat, options).forEach((key, index) => variables.push({
        id: `body:${key}`, component: 'body',
        ...(parameterFormat === 'named' ? { name: key } : { position: Number(key) }),
        example: exampleFor(component, parameterFormat, key, index),
      }));
    }
    if (type === 'BUTTONS') {
      (component.buttons || []).forEach((button: any, buttonIndex: number) => {
        const buttonType = String(button.type || '').toUpperCase();
        if (buttonType === 'URL') {
          extractTextVariableKeys(button.url || '', parameterFormat, options).forEach((key, index) => variables.push({
            id: `button:${buttonIndex}:url:${key}`, component: 'button', buttonIndex, buttonSubType: 'url',
            ...(parameterFormat === 'named' ? { name: key } : { position: Number(key) }),
            example: Array.isArray(button.example) ? button.example[index] : undefined,
          }));
        } else if (buttonType === 'COPY_CODE') {
          variables.push({
            id: `button:${buttonIndex}:copy_code:1`, component: 'button', buttonIndex,
            buttonSubType: 'copy_code', position: 1,
            example: typeof button.example === 'string' ? button.example : button.example?.[0],
          });
        }
      });
    }
  }
  return { parameterFormat, variables };
}

export function buildTemplateTextExample(
  componentType: 'header' | 'body',
  textValue: string,
  format: WhatsAppParameterFormat,
  examples: Record<string, string>,
): Record<string, any> | undefined {
  const definitions = extractTemplateVariables([
    { type: componentType.toUpperCase(), format: 'TEXT', text: textValue },
  ], format).variables;
  if (!definitions.length) return undefined;
  for (const variable of definitions) {
    if (!examples[variable.id]?.trim()) throw new Error(`Example value is required for ${variable.id}`);
  }
  if (format === 'named') {
    return {
      [componentType === 'header' ? 'header_text_named_params' : 'body_text_named_params']:
        definitions.map(variable => ({ param_name: variable.name, example: examples[variable.id].trim() })),
    };
  }
  const values = definitions.map(variable => examples[variable.id].trim());
  return componentType === 'header' ? { header_text: values } : { body_text: [values] };
}

function valuesFor(
  definition: WhatsAppTemplateVariableDefinition,
  values: WhatsAppTemplateComponentValues,
): string | undefined {
  let source: string[] | Record<string, string> | undefined;
  if (definition.component === 'button') {
    source = values.buttons?.find(button =>
      button.index === definition.buttonIndex && button.subType === definition.buttonSubType
    )?.values;
  } else {
    source = values[definition.component];
  }
  if (Array.isArray(source)) return source[(definition.position || 1) - 1];
  const key = definition.name || String(definition.position || 1);
  return source?.[key];
}

export function buildTemplateSendComponents(
  definitions: WhatsAppTemplateVariableDefinition[],
  values: WhatsAppTemplateComponentValues,
  format: WhatsAppParameterFormat,
): any[] {
  assertValidWhatsAppTemplateVariables(definitions);
  const grouped = new Map<string, WhatsAppTemplateVariableDefinition[]>();
  for (const definition of definitions) {
    const groupKey = definition.component === 'button'
      ? `button:${definition.buttonIndex}:${definition.buttonSubType}`
      : definition.component;
    grouped.set(groupKey, [...(grouped.get(groupKey) || []), definition]);
  }

  const result: any[] = [];
  for (const [groupKey, group] of grouped) {
    group.sort((a, b) => (a.position || 0) - (b.position || 0));
    const resolved = group.map(definition => {
      const raw = valuesFor(definition, values);
      if (raw == null || String(raw).trim() === '') throw new Error(`Template variable ${definition.id} is required`);
      return { definition, value: String(raw).trim() };
    });
    if (groupKey === 'header' || groupKey === 'body') {
      result.push({
        type: groupKey,
        parameters: resolved.map(({ definition, value }) => ({
          type: 'text',
          ...(format === 'named' && definition.name ? { parameter_name: definition.name } : {}),
          text: value,
        })),
      });
    } else {
      const definition = resolved[0].definition;
      result.push({
        type: 'button',
        sub_type: definition.buttonSubType,
        index: String(definition.buttonIndex),
        parameters: resolved.map(({ definition: item, value }) => item.buttonSubType === 'copy_code'
          ? { type: 'coupon_code', coupon_code: value }
          : {
              type: 'text',
              ...(format === 'named' && item.name ? { parameter_name: item.name } : {}),
              text: encodeURIComponent(value),
            }),
      });
    }
  }
  return result;
}

export function renderTemplateTextPreview(
  text: string,
  component: 'header' | 'body',
  definitions: WhatsAppTemplateVariableDefinition[],
  sendComponents: any[] = [],
  format: WhatsAppParameterFormat = 'positional',
): string {
  const componentDefinitions = definitions
    .filter(definition => definition.component === component)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const parameters = sendComponents.find(item => String(item?.type).toLowerCase() === component)?.parameters || [];

  return componentDefinitions.reduce((preview, definition, index) => {
    const parameter = format === 'named' && definition.name
      ? parameters.find((item: any) => item?.parameter_name === definition.name)
      : parameters[(definition.position || index + 1) - 1];
    const value = parameter?.text;
    if (value == null) return preview;
    const key = definition.name || String(definition.position || index + 1);
    return preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }, text || '');
}

export function renderTemplateMessagePreview(
  canonicalComponents: any[] = [],
  definitions: WhatsAppTemplateVariableDefinition[] = [],
  sendComponents: any[] = [],
  format: WhatsAppParameterFormat = 'positional',
  fallbackContent = '',
): string {
  if (!canonicalComponents.length) {
    return renderTemplateTextPreview(fallbackContent, 'body', definitions, sendComponents, format);
  }

  const sections: string[] = [];
  for (const canonical of canonicalComponents) {
    const type = String(canonical?.type || '').toUpperCase();
    if (type === 'HEADER' && String(canonical?.format || 'TEXT').toUpperCase() === 'TEXT' && canonical.text) {
      sections.push(renderTemplateTextPreview(canonical.text, 'header', definitions, sendComponents, format));
    } else if (type === 'BODY' && canonical.text) {
      sections.push(renderTemplateTextPreview(canonical.text, 'body', definitions, sendComponents, format));
    } else if (type === 'FOOTER' && canonical.text) {
      sections.push(canonical.text);
    }
  }
  return sections.filter(Boolean).join('\n\n') || fallbackContent;
}

export function legacyBodyVariables(definitions: WhatsAppTemplateVariableDefinition[]): string[] {
  return definitions
    .filter(variable => variable.component === 'body')
    .map(variable => variable.name || String(variable.position));
}
