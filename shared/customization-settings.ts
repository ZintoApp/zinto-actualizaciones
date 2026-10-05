export interface CustomCssSettings {
  enabled: boolean;
  css: string;
  lastModified: string;
}

export interface CustomJsSettings {
  enabled: boolean;
  js: string;
  lastModified: string;
}

export type CustomCssPayload = Pick<CustomCssSettings, 'enabled' | 'css'>;
export type CustomJsPayload = Pick<CustomJsSettings, 'enabled' | 'js'>;

export function coerceCustomJsSettings(value: unknown, lastModified = new Date().toISOString()): CustomJsSettings {
  const settingValue = typeof value === 'object' && value !== null
    ? value as Partial<CustomJsSettings>
    : null;

  return {
    enabled: typeof settingValue?.enabled === 'boolean' ? settingValue.enabled : false,
    js: typeof settingValue?.js === 'string' ? settingValue.js : '',
    lastModified: typeof settingValue?.lastModified === 'string' ? settingValue.lastModified : lastModified
  };
}

export function createDefaultCustomCssSettings(lastModified = new Date().toISOString()): CustomCssSettings {
  return {
    enabled: false,
    css: '',
    lastModified
  };
}

export function createDefaultCustomJsSettings(lastModified = new Date().toISOString()): CustomJsSettings {
  return {
    enabled: false,
    js: '',
    lastModified
  };
}

export function isCustomCssSettingsPayload(value: unknown): value is CustomCssPayload {
  return typeof value === 'object' && value !== null &&
    typeof (value as CustomCssPayload).enabled === 'boolean' &&
    typeof (value as CustomCssPayload).css === 'string';
}

export function isCustomJsSettingsPayload(value: unknown): value is CustomJsPayload {
  return typeof value === 'object' && value !== null &&
    typeof (value as CustomJsPayload).enabled === 'boolean' &&
    typeof (value as CustomJsPayload).js === 'string';
}

export function buildCustomCssSettings(payload: CustomCssPayload, lastModified = new Date().toISOString()): CustomCssSettings {
  return {
    enabled: Boolean(payload.enabled),
    css: payload.css || '',
    lastModified
  };
}

export function buildCustomJsSettings(payload: CustomJsPayload, lastModified = new Date().toISOString()): CustomJsSettings {
  return {
    enabled: Boolean(payload.enabled),
    js: payload.js || '',
    lastModified
  };
}