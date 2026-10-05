import type { ResponseConfig } from '../types/webhook-trigger';

const HTTP_HEADER_NAME_REGEX = /^[!#$%&'*+-.0-9A-Z^_`a-z|~]+$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates response configuration for webhook triggers.
 * Returns validation errors for UI display.
 */
export function validateResponseConfig(config: ResponseConfig | null | undefined): ValidationResult {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Response configuration is required'] };
  }

  const statusCode = config.statusCode;
  if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 599) {
    errors.push('Status code must be between 100 and 599');
  }

  if (config.mode === 'sync') {
    const timeout = config.timeout;
    if (timeout !== undefined && timeout !== null) {
      const t = Number(timeout);
      if (t < 1000 || t > 30000) {
        errors.push('Timeout must be between 1000 and 30000 ms for sync mode');
      }
    }
  }

  const bodyTemplate = config.bodyTemplate;
  if (typeof bodyTemplate !== 'string') {
    errors.push('Body template is required and must be a string');
  } else if (bodyTemplate.trim() === '') {
    errors.push('Body template cannot be empty');
  } else {
    const trimmed = bodyTemplate.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const withoutVars = bodyTemplate.replace(/\{\{[^}]*\}\}/g, '""');
      try {
        JSON.parse(withoutVars);
      } catch {
        errors.push('Body template appears to be JSON but has invalid structure (check brackets and commas)');
      }
    }
    if (trimmed.startsWith('<') && !trimmed.startsWith('<?xml') && !/^<[\w-]+/.test(trimmed)) {
      errors.push('Body template appears to be XML but has invalid structure');
    }
  }

  const headers = config.headers;
  if (headers !== undefined && headers !== null) {
    if (typeof headers !== 'object' || Array.isArray(headers)) {
      errors.push('Headers must be an object');
    } else {
      for (const [name, value] of Object.entries(headers)) {
        if (!HTTP_HEADER_NAME_REGEX.test(name)) {
          errors.push(`Invalid header name: ${name}`);
        }
        if (typeof value !== 'string') {
          errors.push(`Header "${name}" value must be a string`);
        }
      }
    }
  }

  const mode = config.mode;
  if (mode !== 'sync' && mode !== 'async') {
    errors.push('Mode must be "sync" or "async"');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
