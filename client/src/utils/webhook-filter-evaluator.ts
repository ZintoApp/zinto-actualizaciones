/**
 * Client-side filter evaluation for webhook payload preview.
 * Mirrors server logic from webhook-trigger-processor for consistent behavior.
 */

import type { FilterCondition, FilterEvaluationResult } from '@shared/types/webhook-trigger';
import { FilterOperator } from '@shared/types/webhook-trigger';

function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  let traversePath = path.trim();
  if (traversePath === '$') return obj;
  if (traversePath.startsWith('$.')) traversePath = traversePath.slice(2);
  const parts = traversePath.split('.');
  let value: unknown = obj;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
    const key = bracketMatch ? bracketMatch[1] : part;
    const index = bracketMatch ? parseInt(bracketMatch[2], 10) : -1;
    if (typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    if (!(key in record)) return undefined;
    value = record[key];
    if (index >= 0 && Array.isArray(value)) {
      value = value[index];
    }
  }
  return value;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/**
 * Evaluate filter conditions against a payload (plain object or { body }).
 * Returns per-condition results and overall passed/failed.
 */
export function evaluateFilters(
  payload: object,
  filters: FilterCondition[]
): FilterEvaluationResult {
  const data = payload && typeof payload === 'object' && 'body' in payload
    ? (payload as { body: unknown }).body
    : payload;
  const evaluatedConditions: FilterEvaluationResult['evaluatedConditions'] = [];
  let passed = true;

  for (const condition of filters) {
    const actualValue = getNestedValue(data, condition.fieldPath);
    const expectedValue = condition.value;
    const caseSensitive = condition.caseSensitive ?? false;
    let result = false;
    let reason: string | undefined;

    const str = (v: unknown) =>
      (isString(v) ? (caseSensitive ? v : v.toLowerCase()) : String(v ?? ''));
    const a = str(actualValue);
    const b = str(expectedValue);

    switch (condition.operator as FilterOperator) {
      case FilterOperator.EQUALS:
        result = a === b;
        break;
      case FilterOperator.NOT_EQUALS:
        result = a !== b;
        break;
      case FilterOperator.CONTAINS:
        result =
          isString(actualValue) &&
          (caseSensitive
            ? actualValue.includes(String(expectedValue ?? ''))
            : actualValue.toLowerCase().includes(b));
        break;
      case FilterOperator.NOT_CONTAINS:
        result =
          !isString(actualValue) ||
          !(caseSensitive
            ? actualValue.includes(String(expectedValue ?? ''))
            : actualValue.toLowerCase().includes(b));
        break;
      case FilterOperator.STARTS_WITH:
        result =
          isString(actualValue) &&
          (caseSensitive
            ? actualValue.startsWith(String(expectedValue ?? ''))
            : actualValue.toLowerCase().startsWith(b));
        break;
      case FilterOperator.ENDS_WITH:
        result =
          isString(actualValue) &&
          (caseSensitive
            ? actualValue.endsWith(String(expectedValue ?? ''))
            : actualValue.toLowerCase().endsWith(b));
        break;
      case FilterOperator.GREATER_THAN:
        if (isNumber(actualValue) && isNumber(expectedValue)) {
          result = actualValue > expectedValue;
        } else {
          const an = Number(actualValue);
          const bn = Number(expectedValue);
          result = !Number.isNaN(an) && !Number.isNaN(bn) && an > bn;
        }
        break;
      case FilterOperator.LESS_THAN:
        if (isNumber(actualValue) && isNumber(expectedValue)) {
          result = actualValue < expectedValue;
        } else {
          const an = Number(actualValue);
          const bn = Number(expectedValue);
          result = !Number.isNaN(an) && !Number.isNaN(bn) && an < bn;
        }
        break;
      case FilterOperator.EXISTS:
        result =
          actualValue !== undefined &&
          actualValue !== null &&
          actualValue !== '';
        break;
      case FilterOperator.NOT_EXISTS:
        result =
          actualValue === undefined ||
          actualValue === null ||
          actualValue === '';
        break;
      case FilterOperator.IN: {
        const arr = isArray(expectedValue) ? expectedValue : [expectedValue];
        result = arr.some((v) => str(v) === a);
        break;
      }
      case FilterOperator.NOT_IN: {
        const arr = isArray(expectedValue) ? expectedValue : [expectedValue];
        result = !arr.some((v) => str(v) === a);
        break;
      }
      default:
        reason = `Unknown operator: ${(condition as FilterCondition).operator}`;
        result = false;
    }

    if (!result) passed = false;
    evaluatedConditions.push({ condition, result, actualValue, reason });
  }

  return { passed, evaluatedConditions };
}
