import { storage } from '../storage';
import type { Contact, Message } from '@shared/schema';
import type { FlowExecutionContext } from './flow-execution-context';
import {
  normalizeConditionNodeData,
  type ConditionRule,
  type ConditionRuleGroup,
  ERP_INVOICE_PAYMENT_METHODS,
} from '@shared/types/node-types';

export interface ConditionEvalScope {
  context: FlowExecutionContext;
  companyId?: number;
  contactId?: number;
  sessionId?: string;
  parseMessageMetadata: (message: Message | undefined) => Record<string, unknown>;
  findDealByIdOrContact: (dealId: string, contactId: number, companyId?: number) => Promise<any>;
}

interface ConditionResolverCache {
  contact?: Contact;
  contactTasks?: any[];
  parsedMessageMetadata?: Record<string, unknown>;
  customFieldSchemas: Map<string, any[]>;
  memo: Map<string, unknown>;
}

type OperatorFn = (
  actual: unknown,
  expected: string | undefined,
  rule: ConditionRule,
  scope?: ConditionEvalScope,
) => boolean;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function coerceToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(String).join(',');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function coerceToNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceToBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return null;
}

function coerceToDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeForCompare(value: unknown, caseSensitive?: boolean): string {
  const s = coerceToString(value).trim();
  return caseSensitive ? s : s.toLowerCase();
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path || obj == null) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveCompanyId(scope: ConditionEvalScope): number | undefined {
  if (scope.companyId) return scope.companyId;
  const contact = scope.context.getVariable('contact') as Contact | undefined;
  const conversation = scope.context.getVariable('conversation') as { companyId?: number } | undefined;
  return contact?.companyId ?? conversation?.companyId ?? undefined;
}

function resolveContactId(scope: ConditionEvalScope): number | undefined {
  if (scope.contactId) return scope.contactId;
  const fromVar = scope.context.getVariable('contact.id');
  if (fromVar != null && fromVar !== '') {
    const parsed = Number(fromVar);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  const contact = scope.context.getVariable('contact') as Contact | undefined;
  return contact?.id;
}

function resolveMessage(scope: ConditionEvalScope): Message | undefined {
  return scope.context.getVariable('message') as Message | undefined;
}

async function coerceCustomFieldValue(
  raw: unknown,
  fieldKey: string,
  entity: 'contact' | 'deal',
  companyId: number,
  cache: ConditionResolverCache,
): Promise<unknown> {
  const schemaKey = `${entity}:${companyId}`;
  if (!cache.customFieldSchemas.has(schemaKey)) {
    cache.customFieldSchemas.set(schemaKey, await storage.getCompanyCustomFields(companyId, entity));
  }
  const schema = cache.customFieldSchemas.get(schemaKey) || [];
  const fieldDef = schema.find((f: any) => f.fieldName === fieldKey);
  if (!fieldDef) return raw;

  switch (fieldDef.fieldType) {
    case 'number': {
      const n = coerceToNumber(raw);
      return n ?? raw;
    }
    case 'boolean': {
      const b = coerceToBoolean(raw);
      return b ?? raw;
    }
    case 'date': {
      const d = coerceToDate(raw);
      return d ?? raw;
    }
    case 'multi_select': {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          return raw.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
      return raw;
    }
    default:
      return raw;
  }
}

async function resolveContact(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
): Promise<Contact | undefined> {
  if (cache.contact) return cache.contact;
  const fromContext = scope.context.getVariable('contact') as Contact | undefined;
  if (fromContext?.id) {
    cache.contact = fromContext;
    return fromContext;
  }
  const contactId = resolveContactId(scope);
  const companyId = resolveCompanyId(scope);
  if (!contactId || !companyId) return undefined;
  const memoKey = `contact:${contactId}`;
  if (cache.memo.has(memoKey)) return cache.memo.get(memoKey) as Contact | undefined;
  try {
    const contact = await storage.getContact(contactId);
    if (contact && contact.companyId === companyId) {
      cache.contact = contact;
      cache.memo.set(memoKey, contact);
      return contact;
    }
  } catch {
    // deterministic false at leaf level
  }
  return undefined;
}

async function resolveDeal(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
  rule: ConditionRule,
): Promise<any | undefined> {
  const companyId = resolveCompanyId(scope);
  if (!companyId) return undefined;

  const explicitDealId = rule.options?.dealId != null ? String(rule.options.dealId) : '';
  const contactId = resolveContactId(scope);

  const dealFromContext = scope.context.getVariable('deal');
  if (dealFromContext && typeof dealFromContext === 'object') {
    const contextDealId = String((dealFromContext as { id?: unknown }).id ?? '');
    if (!explicitDealId || contextDealId === explicitDealId) {
      if (!dealFromContext.companyId || dealFromContext.companyId === companyId) {
        const memoKey = `deal:id:${contextDealId || 'context'}`;
        cache.memo.set(memoKey, dealFromContext);
        return dealFromContext;
      }
    }
  }

  if (explicitDealId) {
    const memoKey = `deal:id:${explicitDealId}`;
    if (cache.memo.has(memoKey)) return cache.memo.get(memoKey);
    try {
      const deal = await scope.findDealByIdOrContact(explicitDealId, contactId || 0, companyId);
      if (deal && deal.companyId === companyId) {
        cache.memo.set(memoKey, deal);
        return deal;
      }
    } catch {
      // leaf resolves false
    }
    return undefined;
  }

  if (!contactId) return undefined;
  const memoKey = `deal:contact:${contactId}`;
  if (cache.memo.has(memoKey)) return cache.memo.get(memoKey);
  try {
    const deal = await scope.findDealByIdOrContact('', contactId, companyId);
    if (deal && deal.companyId === companyId) {
      cache.memo.set(memoKey, deal);
      return deal;
    }
  } catch {
    // leaf resolves false
  }
  return undefined;
}

async function resolveContactTasks(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
): Promise<any[]> {
  if (cache.contactTasks) return cache.contactTasks;
  const contactId = resolveContactId(scope);
  const companyId = resolveCompanyId(scope);
  if (!contactId || !companyId) return [];
  const memoKey = `tasks:${contactId}`;
  if (cache.memo.has(memoKey)) return (cache.memo.get(memoKey) as any[]) || [];
  try {
    const tasks = await storage.getContactTasks(contactId, companyId);
    cache.contactTasks = tasks;
    cache.memo.set(memoKey, tasks);
    return tasks;
  } catch {
    return [];
  }
}

async function resolveSalesOrder(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
  rule: ConditionRule,
): Promise<any | undefined> {
  const erp = scope.context.getVariable('erp') as Record<string, unknown> | undefined;
  const fromContextId = erp?.salesOrderId ?? scope.context.getVariable('erp.salesOrderId');
  const orderId = rule.options?.salesOrderId ?? fromContextId;
  const companyId = resolveCompanyId(scope);
  if (!orderId || !companyId) return undefined;
  const memoKey = `salesOrder:${orderId}`;
  if (cache.memo.has(memoKey)) return cache.memo.get(memoKey);
  const parsedId = Number(orderId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) return undefined;
  try {
    const order = await storage.getSalesOrder(parsedId);
    if (order && order.companyId === companyId) {
      cache.memo.set(memoKey, order);
      return order;
    }
  } catch {
    // leaf false
  }
  return undefined;
}

async function resolveInvoice(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
  rule: ConditionRule,
): Promise<any | undefined> {
  const erp = scope.context.getVariable('erp') as Record<string, unknown> | undefined;
  const fromContextId = erp?.invoiceId ?? scope.context.getVariable('erp.invoiceId');
  const invoiceId = rule.options?.invoiceId ?? fromContextId;
  const companyId = resolveCompanyId(scope);
  if (!invoiceId || !companyId) return undefined;
  const memoKey = `invoice:${invoiceId}`;
  if (cache.memo.has(memoKey)) return cache.memo.get(memoKey);
  const parsedId = Number(invoiceId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) return undefined;
  try {
    const invoice = await storage.getInvoice(parsedId);
    if (invoice && invoice.companyId === companyId) {
      cache.memo.set(memoKey, invoice);
      return invoice;
    }
  } catch {
    // leaf false
  }
  return undefined;
}

async function resolveInvoicePayments(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
  rule: ConditionRule,
): Promise<any[]> {
  const invoice = await resolveInvoice(scope, cache, rule);
  if (!invoice?.id) return [];
  const memoKey = `invoicePayments:${invoice.id}`;
  if (cache.memo.has(memoKey)) return (cache.memo.get(memoKey) as any[]) || [];
  try {
    const payments = await storage.getInvoicePayments(invoice.id);
    cache.memo.set(memoKey, payments);
    return payments;
  } catch {
    return [];
  }
}

function getParsedMessageMetadata(
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
): Record<string, unknown> {
  if (cache.parsedMessageMetadata) return cache.parsedMessageMetadata;
  const message = resolveMessage(scope);
  cache.parsedMessageMetadata = scope.parseMessageMetadata(message);
  return cache.parsedMessageMetadata;
}

async function resolveFieldValue(
  rule: ConditionRule,
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
): Promise<unknown> {
  const field = String(rule.field || '');
  const options = rule.options || {};

  if (field === 'variable') {
    const path = String(options.variablePath || '');
    if (!path) return undefined;
    return scope.context.resolveVariablePath(path);
  }

  if (field === 'time') {
    return new Date();
  }

  if (field === 'message.text') {
    return (
      scope.context.getVariable('user.input')
      || scope.context.getVariable('message.content')
      || ''
    );
  }

  if (field === 'message.media') {
    return scope.context.getVariable('message.mediaUrl') || '';
  }

  if (field === 'message.mediaType') {
    const message = resolveMessage(scope);
    return message?.type || scope.context.getVariable('message.type') || '';
  }

  if (field === 'message.metadata') {
    const metadata = getParsedMessageMetadata(scope, cache);
    if (options.metadataPath) {
      return getNestedValue(metadata, String(options.metadataPath));
    }
    return metadata;
  }

  const contextFirst = scope.context.resolveVariablePath(field);
  if (contextFirst !== undefined && !field.endsWith('.customField')) {
    return contextFirst;
  }

  const companyId = resolveCompanyId(scope);

  if (field.startsWith('contact.')) {
    const contact = await resolveContact(scope, cache);
    if (!contact) return undefined;
    if (field === 'contact.customField') {
      const key = String(options.customFieldKey || '');
      if (!key) return undefined;
      const raw = (contact.customFields as Record<string, unknown> | null)?.[key];
      if (!companyId) return raw;
      return coerceCustomFieldValue(raw, key, 'contact', companyId, cache);
    }
    const prop = field.slice('contact.'.length);
    if (prop === 'tags') {
      return Array.isArray(contact.tags) ? contact.tags : [];
    }
    return (contact as Record<string, unknown>)[prop];
  }

  if (field.startsWith('deal.')) {
    const deal = await resolveDeal(scope, cache, rule);
    if (!deal) return undefined;
    if (field === 'deal.customField') {
      const key = String(options.customFieldKey || '');
      if (!key) return undefined;
      const raw = (deal.customFields as Record<string, unknown> | null)?.[key];
      if (!companyId) return raw;
      return coerceCustomFieldValue(raw, key, 'deal', companyId, cache);
    }
    const prop = field.slice('deal.'.length);
    return deal[prop];
  }

  if (field.startsWith('pipeline.')) {
    let pipelineVal = scope.context.getVariable(field);
    if (pipelineVal === undefined) {
      pipelineVal = scope.context.resolveVariablePath(field);
    }
    if (pipelineVal === undefined && field === 'pipeline.pipelineChanged') {
      pipelineVal = scope.context.getVariable('pipeline.movedBetweenPipelines')
        ?? scope.context.resolveVariablePath('pipeline.movedBetweenPipelines');
    }
    if (pipelineVal !== undefined) return pipelineVal;
    if (!companyId) return undefined;
    const deal = await resolveDeal(scope, cache, rule);
    if (!deal) return undefined;
    if (field === 'pipeline.currentPipelineId') return deal.pipelineId;
    if (field === 'pipeline.currentStageId') return deal.stageId;
    return undefined;
  }

  if (field.startsWith('task.')) {
    if (field === 'task.exists') {
      const tasks = await resolveContactTasks(scope, cache);
      return tasks.length > 0;
    }
    const explicitTaskId = options.taskId ?? scope.context.getVariable('task.id');
    if (explicitTaskId != null && explicitTaskId !== '') {
      const taskId = Number(explicitTaskId);
      if (Number.isInteger(taskId) && taskId > 0 && companyId) {
        const memoKey = `task:${taskId}`;
        if (!cache.memo.has(memoKey)) {
          try {
            const task = await storage.getContactTask(taskId, companyId);
            cache.memo.set(memoKey, task);
          } catch {
            cache.memo.set(memoKey, undefined);
          }
        }
        const task = cache.memo.get(memoKey);
        if (!task) return undefined;
        const prop = field.slice('task.'.length);
        return (task as Record<string, unknown>)[prop];
      }
    }
    return scope.context.resolveVariablePath(field);
  }

  if (field.startsWith('erp.')) {
    const erp = scope.context.getVariable('erp') as Record<string, unknown> | undefined;
    const erpContextVal = scope.context.resolveVariablePath(field);
    const entityScope = options.entityScope || 'header';

    if (field === 'erp.lastResponse') {
      return erp?.lastResponse ?? erpContextVal;
    }

    if (field === 'erp.salesOrderId') {
      const order = await resolveSalesOrder(scope, cache, rule);
      return order?.id ?? erp?.salesOrderId ?? erpContextVal;
    }
    if (field === 'erp.salesOrderStatus') {
      const order = await resolveSalesOrder(scope, cache, rule);
      return order?.status ?? erp?.salesOrderStatus ?? erpContextVal;
    }
    if (field === 'erp.salesOrderTotal') {
      const order = await resolveSalesOrder(scope, cache, rule);
      return order?.total ?? erp?.salesOrderTotal ?? erpContextVal;
    }

    if (field === 'erp.invoiceId') {
      const invoice = await resolveInvoice(scope, cache, rule);
      return invoice?.id ?? erp?.invoiceId ?? erpContextVal;
    }
    if (field === 'erp.invoiceStatus') {
      const invoice = await resolveInvoice(scope, cache, rule);
      return invoice?.status ?? erp?.invoiceStatus ?? erpContextVal;
    }
    if (field === 'erp.invoiceTotal') {
      const invoice = await resolveInvoice(scope, cache, rule);
      return invoice?.total ?? erp?.invoiceTotal ?? erpContextVal;
    }

    if (field === 'erp.invoicePaymentMethod' || field === 'erp.invoicePaymentAmount') {
      if (entityScope === 'payment') {
        const payments = await resolveInvoicePayments(scope, cache, rule);
        if (field === 'erp.invoicePaymentMethod') {
          return payments.map((p: any) => p.paymentMethod);
        }
        return payments.map((p: any) => p.amount);
      }
      const invoice = await resolveInvoice(scope, cache, rule);
      if (field === 'erp.invoicePaymentMethod') return invoice?.paymentMethod;
      return invoice?.amountPaid;
    }

    return erpContextVal ?? (erp ? getNestedValue(erp, field.slice('erp.'.length)) : undefined);
  }

  if (field.startsWith('conversation.')) {
    const conversation = scope.context.getVariable('conversation');
    if (!conversation || typeof conversation !== 'object') return undefined;
    return (conversation as Record<string, unknown>)[field.slice('conversation.'.length)];
  }

  return scope.context.resolveVariablePath(field);
}

function getCurrentTimeInZone(timeZone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/** Returns true when current HH:mm falls within [start, end], including overnight windows. */
export function isTimeInRange(current: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  if (start <= end) {
    return current >= start && current <= end;
  }
  return current >= start || current <= end;
}

const OPERATOR_REGISTRY: Record<string, OperatorFn> = {
  contains(actual, expected, rule) {
    const caseSensitive = !!rule.options?.caseSensitive;
    const actualStr = normalizeForCompare(actual, caseSensitive);
    const terms = splitList(expected);
    if (terms.length === 0) return actualStr.length > 0 && actualStr.includes(normalizeForCompare('', caseSensitive));
    if (terms.length > 1) {
      return terms.some((t) => actualStr.includes(normalizeForCompare(t, caseSensitive)));
    }
    return actualStr.includes(normalizeForCompare(expected, caseSensitive));
  },

  notContains(actual, expected, rule) {
    return !OPERATOR_REGISTRY.contains(actual, expected, rule);
  },

  exactMatch(actual, expected, rule) {
    const caseSensitive = !!rule.options?.caseSensitive;
    return normalizeForCompare(actual, caseSensitive) === normalizeForCompare(expected, caseSensitive);
  },

  startsWith(actual, expected, rule) {
    const caseSensitive = !!rule.options?.caseSensitive;
    return normalizeForCompare(actual, caseSensitive).startsWith(normalizeForCompare(expected, caseSensitive));
  },

  endsWith(actual, expected, rule) {
    const caseSensitive = !!rule.options?.caseSensitive;
    return normalizeForCompare(actual, caseSensitive).endsWith(normalizeForCompare(expected, caseSensitive));
  },

  regexMatch(actual, expected) {
    if (!expected) return false;
    try {
      const re = new RegExp(expected);
      return re.test(coerceToString(actual));
    } catch {
      return false;
    }
  },

  equals(actual, expected, rule) {
    if (rule.field === 'contact.tags' || (String(rule.field).endsWith('.tags') && expected?.includes(','))) {
      const tags = Array.isArray(actual) ? actual : splitList(coerceToString(actual));
      const conditionTags = splitList(expected).map((t) => t.toLowerCase());
      const normalizedTags = tags.map((t) => String(t).trim().toLowerCase());
      return conditionTags.some((t) => normalizedTags.includes(t));
    }
    const actualNum = coerceToNumber(actual);
    const expectedNum = coerceToNumber(expected);
    if (actualNum !== null && expectedNum !== null) return actualNum === expectedNum;
    const actualBool = coerceToBoolean(actual);
    const expectedBool = coerceToBoolean(expected);
    if (actualBool !== null && expectedBool !== null) return actualBool === expectedBool;
    return normalizeForCompare(actual, !!rule.options?.caseSensitive)
      === normalizeForCompare(expected, !!rule.options?.caseSensitive);
  },

  notEquals(actual, expected, rule) {
    return !OPERATOR_REGISTRY.equals(actual, expected, rule);
  },

  greaterThan(actual, expected) {
    const a = coerceToNumber(actual);
    const b = coerceToNumber(expected);
    return a !== null && b !== null && a > b;
  },

  lessThan(actual, expected) {
    const a = coerceToNumber(actual);
    const b = coerceToNumber(expected);
    return a !== null && b !== null && a < b;
  },

  greaterOrEqual(actual, expected) {
    const a = coerceToNumber(actual);
    const b = coerceToNumber(expected);
    return a !== null && b !== null && a >= b;
  },

  lessOrEqual(actual, expected) {
    const a = coerceToNumber(actual);
    const b = coerceToNumber(expected);
    return a !== null && b !== null && a <= b;
  },

  between(actual, expected, rule) {
    if (rule.field === 'time' || rule.operator === 'timeBetween') {
      return OPERATOR_REGISTRY.timeBetween(actual, expected, rule);
    }
    const parts = splitList(expected);
    if (parts.length < 2) return false;
    const a = coerceToNumber(actual);
    const low = coerceToNumber(parts[0]);
    const high = coerceToNumber(parts[1]);
    return a !== null && low !== null && high !== null && a >= low && a <= high;
  },

  isTrue(actual) {
    const b = coerceToBoolean(actual);
    return b === true;
  },

  isFalse(actual) {
    const b = coerceToBoolean(actual);
    return b === false;
  },

  containsItem(actual, expected, rule) {
    const caseSensitive = !!rule.options?.caseSensitive;
    if (Array.isArray(actual)) {
      const normalized = actual.map((v) => normalizeForCompare(v, caseSensitive));
      const terms = splitList(expected);
      if (terms.length > 1) {
        return terms.some((t) => normalized.includes(normalizeForCompare(t, caseSensitive)));
      }
      return normalized.includes(normalizeForCompare(expected, caseSensitive));
    }
    return OPERATOR_REGISTRY.contains(actual, expected, rule);
  },

  containsAny(actual, expected, rule) {
    const terms = splitList(expected);
    if (!Array.isArray(actual)) return OPERATOR_REGISTRY.contains(actual, expected, rule);
    const caseSensitive = !!rule.options?.caseSensitive;
    const normalized = actual.map((v) => normalizeForCompare(v, caseSensitive));
    return terms.some((t) => normalized.includes(normalizeForCompare(t, caseSensitive)));
  },

  containsAll(actual, expected, rule) {
    const terms = splitList(expected);
    if (!Array.isArray(actual)) return false;
    const caseSensitive = !!rule.options?.caseSensitive;
    const normalized = actual.map((v) => normalizeForCompare(v, caseSensitive));
    return terms.every((t) => normalized.includes(normalizeForCompare(t, caseSensitive)));
  },

  lengthEquals(actual, expected) {
    const len = Array.isArray(actual) ? actual.length : coerceToString(actual).length;
    const target = coerceToNumber(expected);
    return target !== null && len === target;
  },

  lengthGreaterThan(actual, expected) {
    const len = Array.isArray(actual) ? actual.length : coerceToString(actual).length;
    const target = coerceToNumber(expected);
    return target !== null && len > target;
  },

  lengthLessThan(actual, expected) {
    const len = Array.isArray(actual) ? actual.length : coerceToString(actual).length;
    const target = coerceToNumber(expected);
    return target !== null && len < target;
  },

  timeBefore(_actual, expected, rule) {
    const tz = String(rule.options?.timeZone || 'UTC');
    const current = getCurrentTimeInZone(tz);
    return !!expected && current < expected;
  },

  timeAfter(_actual, expected, rule) {
    const tz = String(rule.options?.timeZone || 'UTC');
    const current = getCurrentTimeInZone(tz);
    return !!expected && current > expected;
  },

  timeBetween(_actual, expected, rule) {
    const tz = String(rule.options?.timeZone || 'UTC');
    const current = getCurrentTimeInZone(tz);
    const parts = splitList(expected);
    if (parts.length < 2) return false;
    const [start, end] = parts;
    return isTimeInRange(current, start, end);
  },

  before(actual, expected) {
    const a = coerceToDate(actual);
    const b = coerceToDate(expected);
    return a !== null && b !== null && a.getTime() < b.getTime();
  },

  after(actual, expected) {
    const a = coerceToDate(actual);
    const b = coerceToDate(expected);
    return a !== null && b !== null && a.getTime() > b.getTime();
  },

  overdue(actual, expected) {
    const due = coerceToDate(actual);
    if (!due) return false;
    const ref = coerceToDate(expected) || new Date();
    return due.getTime() < ref.getTime();
  },

  hasMedia(actual) {
    return !isBlank(actual);
  },

  exists(actual) {
    return actual !== undefined && actual !== null;
  },

  missing(actual) {
    return actual === undefined || actual === null;
  },

  empty(actual) {
    if (actual === undefined || actual === null) return true;
    if (Array.isArray(actual)) return actual.length === 0;
    if (typeof actual === 'object') return Object.keys(actual as object).length === 0;
    return coerceToString(actual).trim().length === 0;
  },

  notEmpty(actual) {
    if (actual === undefined || actual === null) return false;
    if (Array.isArray(actual)) return actual.length > 0;
    if (typeof actual === 'object') return Object.keys(actual as object).length > 0;
    return coerceToString(actual).trim().length > 0;
  },

  pathExists(actual, _expected, rule) {
    if (rule.field === 'message.metadata' && rule.options?.metadataPath) {
      return actual !== undefined && actual !== null;
    }
    const path = String(rule.options?.metadataPath || '');
    if (!path) return actual !== undefined && actual !== null;
    return getNestedValue(actual, path) !== undefined;
  },

  pathEquals(actual, expected, rule) {
    if (rule.field === 'message.metadata' && rule.options?.metadataPath) {
      return OPERATOR_REGISTRY.equals(actual, expected, rule);
    }
    const path = String(rule.options?.metadataPath || '');
    const value = path ? getNestedValue(actual, path) : actual;
    return OPERATOR_REGISTRY.equals(value, expected, rule);
  },
};

function evaluateErpPaymentRule(
  actual: unknown,
  rule: ConditionRule,
  scope: ConditionEvalScope,
): boolean {
  const operator = OPERATOR_REGISTRY[rule.operator];
  if (!operator) return false;
  if (!Array.isArray(actual)) return false;

  if (rule.field === 'erp.invoicePaymentMethod') {
    const allowed = new Set(ERP_INVOICE_PAYMENT_METHODS as readonly string[]);
    const terms = splitList(rule.value);
    if (terms.some((term) => !allowed.has(term))) return false;
    return actual.some((method) => operator(method, rule.value, rule, scope));
  }

  return actual.some((entry) => operator(entry, rule.value, rule, scope));
}

async function evaluateConditionRule(
  rule: ConditionRule,
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
): Promise<boolean> {
  try {
    const operatorFn = OPERATOR_REGISTRY[rule.operator];
    if (!operatorFn) return false;

    const actual = await resolveFieldValue(rule, scope, cache);

    if (
      rule.options?.entityScope === 'payment'
      && (rule.field === 'erp.invoicePaymentMethod' || rule.field === 'erp.invoicePaymentAmount')
    ) {
      return evaluateErpPaymentRule(actual, rule, scope);
    }

    if (rule.operator === 'hasMedia' && rule.field === 'message.media') {
      return operatorFn(actual, rule.value, rule, scope);
    }

    if (rule.operator === 'missing' || rule.operator === 'exists' || rule.operator === 'empty' || rule.operator === 'notEmpty') {
      return operatorFn(actual, rule.value, rule, scope);
    }

    if (rule.field === 'time' && ['timeBefore', 'timeAfter', 'timeBetween'].includes(rule.operator)) {
      if (!rule.value) return false;
      return operatorFn(actual, rule.value, rule, scope);
    }

    if (isBlank(actual) && !['missing', 'empty', 'exists', 'notEmpty', 'hasMedia', 'isFalse'].includes(rule.operator)) {
      return false;
    }

    return operatorFn(actual, rule.value, rule, scope);
  } catch {
    return false;
  }
}

async function evaluateConditionRuleGroup(
  group: ConditionRuleGroup,
  scope: ConditionEvalScope,
  cache: ConditionResolverCache,
): Promise<boolean> {
  if (!group.children || group.children.length === 0) return false;

  if (group.combinator === 'or') {
    for (const child of group.children) {
      const result = child.type === 'group'
        ? await evaluateConditionRuleGroup(child, scope, cache)
        : await evaluateConditionRule(child, scope, cache);
      if (result) return true;
    }
    return false;
  }

  for (const child of group.children) {
    const result = child.type === 'group'
      ? await evaluateConditionRuleGroup(child, scope, cache)
      : await evaluateConditionRule(child, scope, cache);
    if (!result) return false;
  }
  return true;
}

export async function evaluateConditionNodeData(
  rawData: Record<string, unknown>,
  scope: ConditionEvalScope,
): Promise<boolean> {
  const normalized = normalizeConditionNodeData(rawData);
  const tree = normalized.conditionRuleTree as ConditionRuleGroup | undefined;
  if (!tree || tree.type !== 'group' || !Array.isArray(tree.children) || tree.children.length === 0) {
    return false;
  }

  if (scope.sessionId) {
    await scope.context.loadConditionSafeCapturedVariables(scope.sessionId);
  }

  const cache: ConditionResolverCache = {
    customFieldSchemas: new Map(),
    memo: new Map(),
  };

  return evaluateConditionRuleGroup(tree, scope, cache);
}
