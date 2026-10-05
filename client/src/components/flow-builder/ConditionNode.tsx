import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Position, useReactFlow } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { getBrowserTimezone } from '@/utils/timezones';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { NodeToolbar } from '@/components/flow-builder/NodeToolbar';
import { EnhancedVariablePicker } from '@/components/flow-builder/EnhancedVariablePicker';
import { StyledHandle, standardHandleStyle, yesHandleStyle, noHandleStyle } from './StyledHandle';
import { apiRequest } from '@/lib/queryClient';
import { useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { useCompanyDealCustomFields } from '@/hooks/use-company-deal-custom-fields';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ChevronsUpDown,
  GripVertical,
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';
import {
  type ConditionCategoryId,
  type ConditionEditorState,
  type ConditionNodeData,
  type ConditionCombinator,
  type ConditionFieldId,
  type ConditionOperatorId,
  type ConditionRule,
  type ConditionRuleGroup,
  type ConditionRuleOptions,
  ERP_INVOICE_PAYMENT_METHODS,
  ERP_SET_STATUS_TARGET_STATUSES,
  buildConditionRuleFromEditorState,
  conditionEditorStateFromRule,
  getPrimaryConditionRule,
  normalizeConditionNodeData,
} from '@shared/types/node-types';
import {
  applyRulePatch,
  createDefaultGroup,
  createDefaultRule,
  duplicateChildInGroup,
  getNormalizedTree,
  insertRuleIntoGroup,
  insertSubgroupIntoGroup,
  normalizeOperatorForCustomFieldKey,
  newRuleId,
  removeChildFromGroup,
  reorderGroupChildrenInTree,
  shouldShowRulesGroupsSummary,
  updateGroupCombinatorInTree,
  updateRuleInTree,
} from './condition-tree-helpers';

// ---------------------------------------------------------------------------
// Domain metadata — resolver-aligned field / operator catalog
// ---------------------------------------------------------------------------

type ConditionDomainId =
  | 'message'
  | 'contact'
  | 'deal'
  | 'pipeline'
  | 'task'
  | 'erp'
  | 'variables'
  | 'metadata'
  | 'time';

type FieldValueType = 'string' | 'number' | 'boolean' | 'array' | 'date' | 'time' | 'none';

interface FieldDescriptor {
  field: ConditionFieldId;
  domain: ConditionDomainId;
  valueType: FieldValueType;
  operators: ConditionOperatorId[];
  requiresCustomFieldKey?: boolean;
  requiresMetadataPath?: boolean;
  requiresVariablePath?: boolean;
  requiresTimeZone?: boolean;
  requiresEntityScope?: boolean;
  requiresDealId?: boolean;
  requiresTaskId?: boolean;
  requiresSalesOrderId?: boolean;
  requiresInvoiceId?: boolean;
  liveLookup?: boolean;
  simpleMode?: boolean;
}

const STRING_OPERATORS: ConditionOperatorId[] = [
  'contains', 'notContains', 'exactMatch', 'regexMatch', 'startsWith', 'endsWith', 'empty', 'notEmpty',
];
const NUMERIC_OPERATORS: ConditionOperatorId[] = [
  'equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'between',
];
const BOOLEAN_OPERATORS: ConditionOperatorId[] = ['isTrue', 'isFalse'];
const ARRAY_OPERATORS: ConditionOperatorId[] = [
  'containsItem', 'containsAny', 'containsAll', 'lengthEquals', 'lengthGreaterThan', 'lengthLessThan', 'empty', 'notEmpty',
];
const TIME_OPERATORS: ConditionOperatorId[] = ['timeBefore', 'timeAfter', 'timeBetween'];
const DATE_OPERATORS: ConditionOperatorId[] = ['before', 'after', 'overdue'];
const METADATA_OPERATORS: ConditionOperatorId[] = ['pathExists', 'pathEquals'];
const MEDIA_OPERATORS: ConditionOperatorId[] = ['hasMedia', 'empty', 'notEmpty'];

type TranslateFn = (key: string, fallback?: string, variables?: Record<string, unknown>) => string;

const DOMAIN_ORDER: ConditionDomainId[] = [
  'message', 'contact', 'deal', 'pipeline', 'task', 'erp', 'variables', 'metadata', 'time',
];

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;

const DEAL_STATUS_OPTIONS = ['active', 'won', 'lost'] as const;
const TASK_STATUS_OPTIONS = ['not_started', 'in_progress', 'completed', 'cancelled'] as const;
const TASK_PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;
const INVOICE_STATUS_OPTIONS = ['draft', 'sent', 'paid', 'partial', 'overdue', 'void', 'cancelled'] as const;

const SIMPLE_MODE_CATEGORIES: Set<ConditionCategoryId> = new Set([
  'message_contains',
  'exact_match',
  'regex_match',
  'message_starts_with',
  'message_ends_with',
  'has_media',
  'media_type',
  'time_based',
  'contact_attribute',
  'runtime_variable',
]);

const LIVE_LOOKUP_DOMAINS: Set<ConditionDomainId> = new Set(['deal', 'pipeline', 'task', 'erp']);

const CONDITION_FIELD_CATALOG: FieldDescriptor[] = [
  { field: 'message.text', domain: 'message', valueType: 'string', operators: STRING_OPERATORS, simpleMode: true },
  { field: 'message.media', domain: 'message', valueType: 'none', operators: MEDIA_OPERATORS, simpleMode: true },
  { field: 'message.mediaType', domain: 'message', valueType: 'string', operators: ['equals', 'notEquals'], simpleMode: true },
  { field: 'message.type', domain: 'message', valueType: 'string', operators: STRING_OPERATORS },
  { field: 'message.direction', domain: 'message', valueType: 'string', operators: STRING_OPERATORS },
  { field: 'message.metadata', domain: 'metadata', valueType: 'string', operators: METADATA_OPERATORS, requiresMetadataPath: true },
  { field: 'contact.name', domain: 'contact', valueType: 'string', operators: STRING_OPERATORS, simpleMode: true },
  { field: 'contact.phone', domain: 'contact', valueType: 'string', operators: STRING_OPERATORS, simpleMode: true },
  { field: 'contact.email', domain: 'contact', valueType: 'string', operators: STRING_OPERATORS, simpleMode: true },
  { field: 'contact.tags', domain: 'contact', valueType: 'array', operators: ARRAY_OPERATORS, simpleMode: true },
  { field: 'contact.assignedTo', domain: 'contact', valueType: 'string', operators: ['equals', 'notEquals'] },
  { field: 'contact.customField', domain: 'contact', valueType: 'string', operators: [...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS, ...DATE_OPERATORS], requiresCustomFieldKey: true },
  { field: 'deal.title', domain: 'deal', valueType: 'string', operators: STRING_OPERATORS, liveLookup: true, requiresDealId: true },
  { field: 'deal.value', domain: 'deal', valueType: 'number', operators: NUMERIC_OPERATORS, liveLookup: true, requiresDealId: true },
  { field: 'deal.status', domain: 'deal', valueType: 'string', operators: ['equals', 'notEquals', 'exactMatch'], liveLookup: true, requiresDealId: true },
  { field: 'deal.stageId', domain: 'deal', valueType: 'number', operators: ['equals', 'notEquals'], liveLookup: true, requiresDealId: true },
  { field: 'deal.pipelineId', domain: 'deal', valueType: 'number', operators: ['equals', 'notEquals'], liveLookup: true, requiresDealId: true },
  { field: 'deal.assignedTo', domain: 'deal', valueType: 'string', operators: ['equals', 'notEquals'], liveLookup: true, requiresDealId: true },
  { field: 'deal.customField', domain: 'deal', valueType: 'string', operators: [...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS, ...DATE_OPERATORS], requiresCustomFieldKey: true, liveLookup: true, requiresDealId: true },
  { field: 'pipeline.currentPipelineId', domain: 'pipeline', valueType: 'number', operators: ['equals', 'notEquals'], liveLookup: true },
  { field: 'pipeline.currentStageId', domain: 'pipeline', valueType: 'number', operators: ['equals', 'notEquals'], liveLookup: true },
  { field: 'pipeline.previousPipelineId', domain: 'pipeline', valueType: 'number', operators: ['equals', 'notEquals'], liveLookup: true },
  { field: 'pipeline.previousStageId', domain: 'pipeline', valueType: 'number', operators: ['equals', 'notEquals'], liveLookup: true },
  { field: 'pipeline.pipelineChanged', domain: 'pipeline', valueType: 'boolean', operators: BOOLEAN_OPERATORS, liveLookup: true },
  { field: 'pipeline.stageChanged', domain: 'pipeline', valueType: 'boolean', operators: BOOLEAN_OPERATORS, liveLookup: true },
  { field: 'task.exists', domain: 'task', valueType: 'boolean', operators: BOOLEAN_OPERATORS, liveLookup: true },
  { field: 'task.status', domain: 'task', valueType: 'string', operators: ['equals', 'notEquals'], liveLookup: true, requiresTaskId: true },
  { field: 'task.priority', domain: 'task', valueType: 'string', operators: ['equals', 'notEquals'], liveLookup: true, requiresTaskId: true },
  { field: 'task.title', domain: 'task', valueType: 'string', operators: STRING_OPERATORS, liveLookup: true, requiresTaskId: true },
  { field: 'erp.salesOrderId', domain: 'erp', valueType: 'number', operators: NUMERIC_OPERATORS, liveLookup: true, requiresSalesOrderId: true },
  { field: 'erp.salesOrderStatus', domain: 'erp', valueType: 'string', operators: STRING_OPERATORS, liveLookup: true, requiresSalesOrderId: true },
  { field: 'erp.salesOrderTotal', domain: 'erp', valueType: 'number', operators: NUMERIC_OPERATORS, liveLookup: true, requiresSalesOrderId: true },
  { field: 'erp.invoiceId', domain: 'erp', valueType: 'number', operators: NUMERIC_OPERATORS, liveLookup: true, requiresInvoiceId: true },
  { field: 'erp.invoiceStatus', domain: 'erp', valueType: 'string', operators: STRING_OPERATORS, liveLookup: true, requiresInvoiceId: true },
  { field: 'erp.invoiceTotal', domain: 'erp', valueType: 'number', operators: NUMERIC_OPERATORS, liveLookup: true, requiresInvoiceId: true },
  { field: 'erp.invoicePaymentMethod', domain: 'erp', valueType: 'string', operators: ['equals', 'containsItem', 'containsAny'], liveLookup: true, requiresInvoiceId: true, requiresEntityScope: true },
  { field: 'erp.invoicePaymentAmount', domain: 'erp', valueType: 'number', operators: NUMERIC_OPERATORS, liveLookup: true, requiresInvoiceId: true, requiresEntityScope: true },
  { field: 'erp.lastResponse', domain: 'erp', valueType: 'string', operators: STRING_OPERATORS, liveLookup: true },
  { field: 'conversation.id', domain: 'metadata', valueType: 'string', operators: ['equals', 'notEquals'] },
  { field: 'conversation.status', domain: 'metadata', valueType: 'string', operators: STRING_OPERATORS },
  { field: 'conversation.assignedTo', domain: 'metadata', valueType: 'string', operators: ['equals', 'notEquals'] },
  { field: 'variable', domain: 'variables', valueType: 'string', operators: [...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS], requiresVariablePath: true, simpleMode: true },
  { field: 'time', domain: 'time', valueType: 'time', operators: TIME_OPERATORS, requiresTimeZone: true, simpleMode: true },
];

const FIELD_DESCRIPTOR_MAP = new Map<ConditionFieldId, FieldDescriptor>(
  CONDITION_FIELD_CATALOG.map((d) => [d.field, d]),
);

function getFieldDescriptor(field: ConditionFieldId): FieldDescriptor | undefined {
  return FIELD_DESCRIPTOR_MAP.get(field);
}

function fieldTranslationKey(field: ConditionFieldId): string {
  return `flow_builder.condition_fields.${field.replace(/\./g, '_')}`;
}

function getDomainLabel(domain: ConditionDomainId, t: TranslateFn): string {
  const fallbacks: Record<ConditionDomainId, string> = {
    message: 'Message',
    contact: 'Contact',
    deal: 'Deal',
    pipeline: 'Pipeline / Stage',
    task: 'Task',
    erp: 'ERP',
    variables: 'Variables',
    metadata: 'Metadata / Conversation',
    time: 'Time',
  };
  return t(`flow_builder.condition_domains.${domain}`, fallbacks[domain]);
}

function getFieldLabel(field: ConditionFieldId, t: TranslateFn): string {
  const fallbacks: Partial<Record<ConditionFieldId, string>> = {
    'message.text': 'Message text',
    'message.media': 'Message media',
    'message.mediaType': 'Media type',
    'message.type': 'Message type',
    'message.direction': 'Message direction',
    'message.metadata': 'Message metadata',
    'contact.name': 'Contact name',
    'contact.phone': 'Contact phone',
    'contact.email': 'Contact email',
    'contact.tags': 'Contact tags',
    'contact.assignedTo': 'Contact assignee',
    'contact.customField': 'Contact custom field',
    'deal.title': 'Deal title',
    'deal.value': 'Deal value',
    'deal.status': 'Deal status',
    'deal.stageId': 'Deal stage',
    'deal.pipelineId': 'Deal pipeline',
    'deal.assignedTo': 'Deal assignee',
    'deal.customField': 'Deal custom field',
    'pipeline.currentPipelineId': 'Current pipeline',
    'pipeline.currentStageId': 'Current stage',
    'pipeline.previousPipelineId': 'Previous pipeline',
    'pipeline.previousStageId': 'Previous stage',
    'pipeline.pipelineChanged': 'Pipeline changed',
    'pipeline.stageChanged': 'Stage changed',
    'task.exists': 'Task exists',
    'task.status': 'Task status',
    'task.priority': 'Task priority',
    'task.title': 'Task title',
    'erp.salesOrderId': 'Sales order ID',
    'erp.salesOrderStatus': 'Sales order status',
    'erp.salesOrderTotal': 'Sales order total',
    'erp.invoiceId': 'Invoice ID',
    'erp.invoiceStatus': 'Invoice status',
    'erp.invoiceTotal': 'Invoice total',
    'erp.invoicePaymentMethod': 'Invoice payment method',
    'erp.invoicePaymentAmount': 'Invoice payment amount',
    'erp.lastResponse': 'ERP last response',
    'conversation.id': 'Conversation ID',
    'conversation.status': 'Conversation status',
    'conversation.assignedTo': 'Conversation assignee',
    variable: 'Runtime / captured variable',
    time: 'Time of day',
  };
  return t(fieldTranslationKey(field), fallbacks[field] ?? field);
}

function getOperatorLabel(op: ConditionOperatorId, t: TranslateFn): string {
  const fallbacks: Record<string, string> = {
    contains: 'contains',
    notContains: 'does not contain',
    exactMatch: 'exactly matches',
    regexMatch: 'matches regex',
    startsWith: 'starts with',
    endsWith: 'ends with',
    equals: 'equals',
    notEquals: 'does not equal',
    greaterThan: 'greater than',
    lessThan: 'less than',
    greaterOrEqual: 'greater or equal',
    lessOrEqual: 'less or equal',
    between: 'between',
    isTrue: 'is true',
    isFalse: 'is false',
    containsItem: 'contains item',
    containsAny: 'contains any of',
    containsAll: 'contains all of',
    lengthEquals: 'length equals',
    lengthGreaterThan: 'length greater than',
    lengthLessThan: 'length less than',
    timeBefore: 'before',
    timeAfter: 'after',
    timeBetween: 'between',
    before: 'before date',
    after: 'after date',
    overdue: 'is overdue',
    hasMedia: 'has media',
    exists: 'exists',
    missing: 'is missing',
    empty: 'is empty',
    notEmpty: 'is not empty',
    pathExists: 'path exists',
    pathEquals: 'path equals',
  };
  return t(`flow_builder.condition_operators.${op}`, fallbacks[op] ?? op);
}

function getCombinatorLabel(combinator: ConditionCombinator, t: TranslateFn): string {
  return combinator === 'or'
    ? t('flow_builder.condition_summary.combinator_any', 'ANY')
    : t('flow_builder.condition_summary.combinator_all', 'ALL');
}

function getMediaTypeLabel(type: (typeof MEDIA_TYPES)[number], t: TranslateFn): string {
  return t(`flow_builder.condition_enums.media_type.${type}`, type);
}

function getDealStatusLabel(status: (typeof DEAL_STATUS_OPTIONS)[number], t: TranslateFn): string {
  return t(`flow_builder.condition_enums.deal_status.${status}`, status);
}

function getTaskStatusLabel(status: (typeof TASK_STATUS_OPTIONS)[number], t: TranslateFn): string {
  const fallbacks: Record<(typeof TASK_STATUS_OPTIONS)[number], string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return t(`flow_builder.condition_enums.task_status.${status}`, fallbacks[status]);
}

function getTaskPriorityLabel(priority: (typeof TASK_PRIORITY_OPTIONS)[number], t: TranslateFn): string {
  return t(`flow_builder.condition_enums.task_priority.${priority}`, priority);
}

function getInvoiceStatusLabel(status: (typeof INVOICE_STATUS_OPTIONS)[number], t: TranslateFn): string {
  return t(`flow_builder.condition_enums.invoice_status.${status}`, status);
}

function getErpOrderStatusLabel(status: (typeof ERP_SET_STATUS_TARGET_STATUSES)[number], t: TranslateFn): string {
  const fallbacks: Record<(typeof ERP_SET_STATUS_TARGET_STATUSES)[number], string> = {
    quotation: 'Quotation',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    returned: 'Returned',
  };
  return t(`flow_builder.condition_enums.erp_order_status.${status}`, fallbacks[status]);
}

function getPaymentMethodLabel(method: (typeof ERP_INVOICE_PAYMENT_METHODS)[number], t: TranslateFn): string {
  const fallbacks: Record<(typeof ERP_INVOICE_PAYMENT_METHODS)[number], string> = {
    cash: 'Cash',
    check: 'Check',
    credit_card: 'Credit card',
    debit_card: 'Debit card',
    bank_transfer: 'Bank transfer',
    stripe: 'Stripe',
    paypal: 'PayPal',
    mercadopago: 'Mercado Pago',
    moyasar: 'Moyasar',
    mpesa: 'M-Pesa',
    paystack: 'Paystack',
    other: 'Other',
  };
  return t(`flow_builder.condition_enums.payment_method.${method}`, fallbacks[method]);
}

function operatorNeedsValue(op: ConditionOperatorId): boolean {
  return !['hasMedia', 'isTrue', 'isFalse', 'empty', 'notEmpty', 'exists', 'missing', 'pathExists'].includes(op);
}

function operatorNeedsRange(op: ConditionOperatorId): boolean {
  return op === 'between' || op === 'timeBetween';
}

function countRulesInTree(node: ConditionRule | ConditionRuleGroup): { rules: number; groups: number } {
  if (node.type === 'rule') return { rules: 1, groups: 0 };
  let rules = 0;
  let groups = 1;
  for (const child of node.children) {
    const sub = countRulesInTree(child);
    rules += sub.rules;
    groups += sub.groups;
  }
  return { rules, groups };
}

function collectDomainsFromTree(node: ConditionRule | ConditionRuleGroup): Set<ConditionDomainId> {
  const domains = new Set<ConditionDomainId>();
  const visit = (n: ConditionRule | ConditionRuleGroup) => {
    if (n.type === 'rule') {
      const desc = getFieldDescriptor(n.field);
      if (desc) domains.add(desc.domain);
    } else {
      n.children.forEach(visit);
    }
  };
  visit(node);
  return domains;
}

function treeHasLiveLookup(node: ConditionRule | ConditionRuleGroup): boolean {
  const domains = collectDomainsFromTree(node);
  for (const d of domains) {
    if (LIVE_LOOKUP_DOMAINS.has(d)) return true;
  }
  return false;
}

function isSimpleModeEligible(tree: ConditionRuleGroup): boolean {
  if (tree.combinator !== 'and') return false;
  if (tree.children.length !== 1) return false;
  const only = tree.children[0];
  if (only.type === 'group') return false;
  return SIMPLE_MODE_CATEGORIES.has(only.category);
}

function formatRulePreview(rule: ConditionRule, t: TranslateFn): string {
  const fieldLabel = getFieldLabel(rule.field, t);
  const opLabel = getOperatorLabel(rule.operator, t);
  if (!operatorNeedsValue(rule.operator)) {
    return `${fieldLabel} ${opLabel}`;
  }
  const val = rule.value ?? '';
  if (operatorNeedsRange(rule.operator)) {
    return `${fieldLabel} ${opLabel} ${val.replace(',', ' – ')}`;
  }
  if (rule.field === 'message.metadata' && rule.options?.metadataPath) {
    return `${fieldLabel}.${rule.options.metadataPath} ${opLabel} "${val}"`;
  }
  if (rule.field === 'variable' && rule.options?.variablePath) {
    return `${rule.options.variablePath} ${opLabel} "${val}"`;
  }
  if (
    (rule.field === 'contact.customField' || rule.field === 'deal.customField')
    && rule.options?.customFieldKey
  ) {
    return `${fieldLabel} (${rule.options.customFieldKey}) ${opLabel} "${val}"`;
  }
  return `${fieldLabel} ${opLabel} "${val}"`;
}

function collectRulePreviews(node: ConditionRule | ConditionRuleGroup, t: TranslateFn, limit = 3): string[] {
  const previews: string[] = [];
  const visit = (n: ConditionRule | ConditionRuleGroup) => {
    if (previews.length >= limit) return;
    if (n.type === 'rule') {
      previews.push(formatRulePreview(n, t));
    } else {
      n.children.forEach(visit);
    }
  };
  visit(node);
  return previews;
}

export interface ConditionTreeSummary {
  combinatorLabel: string;
  previews: string[];
  ruleCount: number;
  groupCount: number;
  domains: ConditionDomainId[];
  hasLiveLookup: boolean;
  fullText: string;
}

export function buildConditionTreeSummary(tree: ConditionRuleGroup, t: TranslateFn): ConditionTreeSummary {
  const { rules, groups } = countRulesInTree(tree);
  const domains = Array.from(collectDomainsFromTree(tree));
  const previews = collectRulePreviews(tree, t, 3);
  const combinatorLabel = getCombinatorLabel(tree.combinator, t);
  const fullLines: string[] = [];
  const buildFull = (node: ConditionRule | ConditionRuleGroup, depth: number) => {
    const indent = '  '.repeat(depth);
    if (node.type === 'rule') {
      fullLines.push(`${indent}• ${formatRulePreview(node, t)}`);
    } else {
      fullLines.push(`${indent}[${getCombinatorLabel(node.combinator, t)}]`);
      node.children.forEach((c) => buildFull(c, depth + 1));
    }
  };
  buildFull(tree, 0);
  return {
    combinatorLabel,
    previews,
    ruleCount: rules,
    groupCount: groups,
    domains,
    hasLiveLookup: treeHasLiveLookup(tree),
    fullText: fullLines.join('\n'),
  };
}

export interface RuleValidationError {
  ruleId: string;
  message: string;
}

export interface CustomFieldValidationContext {
  contactCustomFields?: Array<{ fieldName: string; fieldType: string }>;
  dealCustomFields?: Array<{ fieldName: string; fieldType: string }>;
}

function getAllowedOperatorsForRule(
  rule: ConditionRule,
  desc: FieldDescriptor,
  customFieldContext?: CustomFieldValidationContext,
): ConditionOperatorId[] {
  const opts = rule.options ?? {};
  if (desc.requiresCustomFieldKey && opts.customFieldKey?.toString().trim()) {
    const entity = rule.field === 'deal.customField'
      ? customFieldContext?.dealCustomFields
      : customFieldContext?.contactCustomFields;
    const fieldDef = entity?.find((f) => f.fieldName === opts.customFieldKey);
    if (fieldDef) {
      return getCustomFieldOperators(fieldDef.fieldType);
    }
  }
  return desc.operators;
}

function isValidRegex(pattern: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export function validateConditionRule(
  rule: ConditionRule,
  t: TranslateFn,
  customFieldContext?: CustomFieldValidationContext,
): RuleValidationError | null {
  if (!rule.field) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.field_required', 'Field is required') };
  }
  const desc = getFieldDescriptor(rule.field);
  if (!desc) {
    return {
      ruleId: rule.id,
      message: t('flow_builder.condition_validation.unsupported_field', 'Unsupported field: {{field}}', { field: rule.field }),
    };
  }
  if (!rule.operator) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.operator_required', 'Operator is required') };
  }
  const allowedOperators = getAllowedOperatorsForRule(rule, desc, customFieldContext);
  if (!allowedOperators.includes(rule.operator)) {
    return {
      ruleId: rule.id,
      message: t(
        'flow_builder.condition_validation.unsupported_operator',
        'Operator "{{operator}}" is not supported for {{field}}',
        { operator: rule.operator, field: getFieldLabel(rule.field, t) },
      ),
    };
  }
  const opts = rule.options ?? {};
  if (desc.requiresCustomFieldKey && !opts.customFieldKey?.toString().trim()) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.custom_field_required', 'Custom field is required') };
  }
  if (desc.requiresMetadataPath && !opts.metadataPath?.toString().trim()) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.metadata_path_required', 'Metadata path is required') };
  }
  if (desc.requiresVariablePath && !opts.variablePath?.toString().trim()) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.variable_path_required', 'Variable path is required') };
  }
  if (desc.requiresTimeZone && ['timeBefore', 'timeAfter', 'timeBetween'].includes(rule.operator) && !opts.timeZone?.toString().trim()) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.timezone_required', 'Timezone is required') };
  }
  if (operatorNeedsValue(rule.operator)) {
    if (operatorNeedsRange(rule.operator)) {
      const parts = (rule.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) {
        return { ruleId: rule.id, message: t('flow_builder.condition_validation.range_required', 'Range requires start and end values') };
      }
    } else if (!rule.value?.toString().trim() && rule.operator !== 'hasMedia') {
      return { ruleId: rule.id, message: t('flow_builder.condition_validation.comparison_value_required', 'Comparison value is required') };
    }
  }
  if (rule.operator === 'regexMatch' && rule.value && !isValidRegex(rule.value)) {
    return { ruleId: rule.id, message: t('flow_builder.condition_validation.invalid_regex', 'Invalid regex pattern') };
  }
  return null;
}

export function validateConditionTree(
  tree: ConditionRuleGroup,
  t: TranslateFn,
  customFieldContext?: CustomFieldValidationContext,
): RuleValidationError[] {
  const errors: RuleValidationError[] = [];
  const visit = (node: ConditionRule | ConditionRuleGroup) => {
    if (node.type === 'rule') {
      const err = validateConditionRule(node, t, customFieldContext);
      if (err) errors.push(err);
    } else {
      if (node.children.length === 0) {
        errors.push({
          ruleId: node.id,
          message: t('flow_builder.condition_validation.group_empty', 'Group must contain at least one rule'),
        });
      }
      node.children.forEach(visit);
    }
  };
  visit(tree);
  return errors;
}

function getCustomFieldOperators(fieldType: string): ConditionOperatorId[] {
  switch (fieldType) {
    case 'number':
      return NUMERIC_OPERATORS;
    case 'boolean':
      return BOOLEAN_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    case 'multi_select':
      return ARRAY_OPERATORS;
    default:
      return STRING_OPERATORS;
  }
}

// ---------------------------------------------------------------------------
// Simple mode helpers
// ---------------------------------------------------------------------------

const getConditionTypeLabels = (t: (key: string, fallback: string) => string): Record<ConditionCategoryId, string> => ({
  message_contains: t('flow_builder.condition_types.message_contains', 'Message Contains'),
  exact_match: t('flow_builder.condition_types.exact_match', 'Exact Match'),
  regex_match: t('flow_builder.condition_types.regex_match', 'Regex Match'),
  message_starts_with: t('flow_builder.condition_types.message_starts_with', 'Message Starts With'),
  message_ends_with: t('flow_builder.condition_types.message_ends_with', 'Message Ends With'),
  has_media: t('flow_builder.condition_types.has_media', 'Has Media'),
  media_type: t('flow_builder.condition_types.media_type_is', 'Media Type Is'),
  time_based: t('flow_builder.condition_types.time_condition', 'Time Condition'),
  contact_attribute: t('flow_builder.condition_types.contact_attribute', 'Contact Attribute'),
  contact_custom_field: t('flow_builder.condition_types.contact_custom_field', 'Contact Custom Field'),
  deal_field: t('flow_builder.condition_types.deal_field', 'Deal Field'),
  deal_custom_field: t('flow_builder.condition_types.deal_custom_field', 'Deal Custom Field'),
  pipeline_state: t('flow_builder.condition_types.pipeline_state', 'Pipeline State'),
  task_state: t('flow_builder.condition_types.task_state', 'Task State'),
  erp_sales_order: t('flow_builder.condition_types.erp_sales_order', 'ERP Sales Order'),
  erp_invoice: t('flow_builder.condition_types.erp_invoice', 'ERP Invoice'),
  erp_payment: t('flow_builder.condition_types.erp_payment', 'ERP Payment'),
  runtime_variable: t('flow_builder.condition_types.runtime_variable', 'Runtime Variable'),
  message_metadata: t('flow_builder.condition_types.message_metadata', 'Message Metadata'),
  conversation_field: t('flow_builder.condition_types.conversation_field', 'Conversation Field'),
  assignment: t('flow_builder.condition_types.assignment', 'Assignment'),
  presence: t('flow_builder.condition_types.presence', 'Presence'),
});

const SIMPLE_MODE_CATEGORY_OPTIONS: ConditionCategoryId[] = [
  'message_contains',
  'exact_match',
  'regex_match',
  'message_starts_with',
  'message_ends_with',
  'has_media',
  'media_type',
  'time_based',
  'contact_attribute',
  'runtime_variable',
];

function editorStateFromNodeData(data: ConditionNodeData): ConditionEditorState {
  const normalized = normalizeConditionNodeData(data) as ConditionNodeData;
  const rule = getPrimaryConditionRule(normalized);
  return conditionEditorStateFromRule(rule, {
    timeZone: String(data.timeZone ?? data.timezone ?? getBrowserTimezone()),
  });
}

interface ConditionNodeProps {
  id: string;
  data: ConditionNodeData;
  isConnectable: boolean;
}

// ---------------------------------------------------------------------------
// Rule value editor (shared by simple variable path + advanced mode)
// ---------------------------------------------------------------------------

interface RuleValueEditorProps {
  rule: ConditionRule;
  onChange: (updates: Partial<ConditionRule>) => void;
  flowId?: number;
  customVariables?: import('@shared/types/flow-custom-variable').FlowCustomVariable[];
  contactCustomFields: ReturnType<typeof useCompanyContactCustomFields>['data'];
  dealCustomFields: ReturnType<typeof useCompanyDealCustomFields>['data'];
  pipelines: Array<{ id: number; name: string }>;
  pipelineStages: Array<{ id: number; name: string; pipelineId: number }>;
  teamMembers: Array<{ id: number; fullName?: string; username?: string; email?: string }>;
  contactTags: string[];
  dealTags: string[];
  validationError?: string;
  t: TranslateFn;
}

function RuleValueEditor({
  rule,
  onChange,
  flowId,
  customVariables,
  contactCustomFields,
  dealCustomFields,
  pipelines,
  pipelineStages,
  teamMembers,
  contactTags,
  dealTags,
  validationError,
  t,
}: RuleValueEditorProps) {
  const desc = getFieldDescriptor(rule.field);
  const opts = rule.options ?? {};
  const updateOptions = (patch: Partial<ConditionRuleOptions>) => {
    onChange({ options: { ...opts, ...patch } });
  };

  const effectiveOperators = useMemo(() => {
    if (!desc) return [];
    if (desc.requiresCustomFieldKey && opts.customFieldKey) {
      const entity = rule.field === 'deal.customField' ? dealCustomFields : contactCustomFields;
      const fieldDef = entity?.find((f) => f.fieldName === opts.customFieldKey);
      if (fieldDef) return getCustomFieldOperators(fieldDef.fieldType);
    }
    return desc.operators;
  }, [desc, opts.customFieldKey, rule.field, contactCustomFields, dealCustomFields]);

  if (!desc) return null;

  return (
    <div className="space-y-2">
      {desc.requiresVariablePath && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.variable_path', 'Variable path')}</Label>
          <EnhancedVariablePicker
            value={String(opts.variablePath ?? '')}
            onChange={(v) => updateOptions({ variablePath: v })}
            flowId={flowId}
            customVariables={customVariables}
            wrapInBraces={false}
            placeholder="contact.name"
            className="text-xs"
          />
        </div>
      )}

      {desc.requiresMetadataPath && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.metadata_path', 'Metadata path')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.metadata_path"
            value={String(opts.metadataPath ?? '')}
            onChange={(e) => updateOptions({ metadataPath: e.target.value })}
            placeholder="campaign.source"
            className="text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            {t('flow_builder.metadata_path_hint', 'Dot-separated path into message.metadata')}
          </p>
        </div>
      )}

      {desc.requiresCustomFieldKey && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.custom_field', 'Custom field')}</Label>
          <Select
            value={String(opts.customFieldKey ?? '')}
            onValueChange={(v) => {
              const operator = normalizeOperatorForCustomFieldKey(
                rule,
                v,
                contactCustomFields,
                dealCustomFields,
              );
              onChange({
                options: { ...opts, customFieldKey: v },
                operator,
              });
            }}
          >
            <SelectTrigger data-tour="components-flow-builder-conditionnode.selecttrigger.flow_builder.select_field" className="text-xs h-8">
              <SelectValue placeholder={t('flow_builder.select_field', 'Select field')} />
            </SelectTrigger>
            <SelectContent>
              {(rule.field === 'deal.customField' ? dealCustomFields : contactCustomFields)?.map((f) => (
                <SelectItem key={f.fieldName} value={f.fieldName} className="text-xs">
                  {f.fieldLabel || f.fieldName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {desc.requiresDealId && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.deal_id', 'Deal ID (optional)')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.deal_id_hint"
            value={String(opts.dealId ?? '')}
            onChange={(e) => updateOptions({ dealId: e.target.value })}
            placeholder={t('flow_builder.deal_id_hint', 'Leave empty to use active deal')}
            className="text-xs"
          />
        </div>
      )}

      {desc.requiresTaskId && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.task_id', 'Task ID (optional)')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.task_id_hint"
            value={String(opts.taskId ?? '')}
            onChange={(e) => updateOptions({ taskId: e.target.value })}
            placeholder={t('flow_builder.task_id_hint', 'Leave empty to use context task')}
            className="text-xs"
          />
        </div>
      )}

      {desc.requiresSalesOrderId && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.sales_order_id', 'Sales order ID')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.sales_order_id"
            value={String(opts.salesOrderId ?? '')}
            onChange={(e) => updateOptions({ salesOrderId: e.target.value })}
            className="text-xs"
          />
        </div>
      )}

      {desc.requiresInvoiceId && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.invoice_id', 'Invoice ID')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.invoice_id"
            value={String(opts.invoiceId ?? '')}
            onChange={(e) => updateOptions({ invoiceId: e.target.value })}
            className="text-xs"
          />
        </div>
      )}

      {desc.requiresEntityScope && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.payment_scope', 'Payment scope')}</Label>
          <Select
            value={String(opts.entityScope ?? 'header')}
            onValueChange={(v) => updateOptions({ entityScope: v as 'header' | 'payment' })}
          >
            <SelectTrigger className="text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header" className="text-xs">{t('flow_builder.invoice_header', 'Invoice header')}</SelectItem>
              <SelectItem value="payment" className="text-xs">{t('flow_builder.payment_entries', 'Payment entries')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">{t('flow_builder.operator', 'Operator')}</Label>
        <Select
          value={rule.operator}
          onValueChange={(v) => onChange({ operator: v as ConditionOperatorId })}
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {effectiveOperators.map((op) => (
              <SelectItem key={op} value={op} className="text-xs">
                {getOperatorLabel(op, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rule.field === 'message.text' && STRING_OPERATORS.includes(rule.operator) && rule.operator !== 'regexMatch' && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`case-${rule.id}`}
            checked={!!opts.caseSensitive}
            onCheckedChange={(checked) => updateOptions({ caseSensitive: !!checked })}
          />
          <Label htmlFor={`case-${rule.id}`} className="text-xs">
            {t('flow_builder.case_sensitive', 'Case sensitive')}
          </Label>
        </div>
      )}

      {desc.requiresTimeZone && TIME_OPERATORS.includes(rule.operator) && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.timezone', 'Timezone')}</Label>
          <TimezoneSelector
            value={String(opts.timeZone ?? getBrowserTimezone())}
            onChange={(tz) => updateOptions({ timeZone: tz })}
            className="w-full"
          />
        </div>
      )}

      {operatorNeedsValue(rule.operator) && (
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.value', 'Value')}</Label>
          {rule.field === 'message.mediaType' ? (
            <Select value={rule.value ?? 'image'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEDIA_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="text-xs">{getMediaTypeLabel(type, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'deal.status' ? (
            <Select value={rule.value ?? 'active'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEAL_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{getDealStatusLabel(s, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'task.status' ? (
            <Select value={rule.value ?? 'not_started'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{getTaskStatusLabel(s, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'task.priority' ? (
            <Select value={rule.value ?? 'medium'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{getTaskPriorityLabel(s, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'erp.salesOrderStatus' ? (
            <Select value={rule.value ?? 'processing'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ERP_SET_STATUS_TARGET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{getErpOrderStatusLabel(s, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'erp.invoiceStatus' ? (
            <Select value={rule.value ?? 'draft'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{getInvoiceStatusLabel(s, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'erp.invoicePaymentMethod' && rule.operator === 'containsAny' ? (
            <PaymentMethodChipSelector
              value={rule.value ?? ''}
              onChange={(v) => onChange({ value: v })}
              t={t}
            />
          ) : rule.field === 'erp.invoicePaymentMethod' ? (
            <Select value={rule.value ?? 'cash'} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ERP_INVOICE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">{getPaymentMethodLabel(m, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'pipeline.currentPipelineId' || rule.field === 'pipeline.previousPipelineId' ? (
            <Select value={rule.value ?? ''} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger data-tour="components-flow-builder-conditionnode.selecttrigger.flow_builder.select_pipeline" className="text-xs h-8"><SelectValue placeholder={t('flow_builder.select_pipeline', 'Select pipeline')} /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'pipeline.currentStageId' || rule.field === 'pipeline.previousStageId' ? (
            <Select value={rule.value ?? ''} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger data-tour="components-flow-builder-conditionnode.selecttrigger.flow_builder.select_stage" className="text-xs h-8"><SelectValue placeholder={t('flow_builder.select_stage', 'Select stage')} /></SelectTrigger>
              <SelectContent>
                {pipelineStages.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)} className="text-xs">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'contact.assignedTo' || rule.field === 'conversation.assignedTo' || rule.field === 'deal.assignedTo' ? (
            <Select value={rule.value ?? ''} onValueChange={(v) => onChange({ value: v })}>
              <SelectTrigger data-tour="components-flow-builder-conditionnode.selecttrigger.flow_builder.select_assignee" className="text-xs h-8"><SelectValue placeholder={t('flow_builder.select_assignee', 'Select assignee')} /></SelectTrigger>
              <SelectContent>
                {teamMembers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                    {u.fullName || u.username || u.email || `#${u.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : rule.field === 'contact.tags' && (rule.operator === 'containsAny' || rule.operator === 'containsAll' || rule.operator === 'containsItem') ? (
            <TagChipSelector
              tags={contactTags}
              value={rule.value ?? ''}
              onChange={(v) => onChange({ value: v })}
              t={t}
            />
          ) : operatorNeedsRange(rule.operator) && desc.valueType === 'time' ? (
            <TimeRangeInputs
              value={rule.value ?? ''}
              timeZone={String(opts.timeZone ?? getBrowserTimezone())}
              onChange={(v) => onChange({ value: v })}
              onTimeZoneChange={(tz) => updateOptions({ timeZone: tz })}
              t={t}
            />
          ) : operatorNeedsRange(rule.operator) ? (
            <div className="grid grid-cols-2 gap-2">
              <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.min"
                placeholder={t('flow_builder.min', 'Min')}
                value={(rule.value ?? '').split(',')[0]?.trim() ?? ''}
                onChange={(e) => {
                  const end = (rule.value ?? '').split(',')[1]?.trim() ?? '';
                  onChange({ value: `${e.target.value},${end}` });
                }}
                className="text-xs"
              />
              <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.max"
                placeholder={t('flow_builder.max', 'Max')}
                value={(rule.value ?? '').split(',')[1]?.trim() ?? ''}
                onChange={(e) => {
                  const start = (rule.value ?? '').split(',')[0]?.trim() ?? '';
                  onChange({ value: `${start},${e.target.value}` });
                }}
                className="text-xs"
              />
            </div>
          ) : desc.valueType === 'time' && TIME_OPERATORS.includes(rule.operator) ? (
            <Input
              type="time"
              value={rule.value ?? ''}
              onChange={(e) => onChange({ value: e.target.value })}
              className="text-xs"
            />
          ) : (
            <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.enter_value"
              value={rule.value ?? ''}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={t('flow_builder.enter_value', 'Enter value')}
              className="text-xs"
            />
          )}
        </div>
      )}

      {validationError && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {validationError}
        </p>
      )}
    </div>
  );
}

function PaymentMethodChipSelector({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  t: TranslateFn;
}) {
  const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const toggle = (method: (typeof ERP_INVOICE_PAYMENT_METHODS)[number]) => {
    if (selected.includes(method)) {
      onChange(selected.filter((item) => item !== method).join(', '));
    } else {
      onChange([...selected, method].join(', '));
    }
  };
  return (
    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
      {ERP_INVOICE_PAYMENT_METHODS.map((method) => {
        const isSelected = selected.includes(method);
        return (
          <button
            key={method}
            type="button"
            onClick={() => toggle(method)}
            className={cn(
              'px-2 py-0.5 text-xs rounded border transition-colors',
              isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 border-border',
            )}
          >
            {getPaymentMethodLabel(method, t)}
          </button>
        );
      })}
    </div>
  );
}

function TagChipSelector({
  tags,
  value,
  onChange,
  t,
}: {
  tags: string[];
  value: string;
  onChange: (v: string) => void;
  t: TranslateFn;
}) {
  const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((item) => item !== tag).join(', '));
    } else {
      onChange([...selected, tag].join(', '));
    }
  };
  if (tags.length === 0) {
    return (
      <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.tag_placeholder"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('flow_builder.tag_placeholder', 'tag1, tag2')}
        className="text-xs"
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
      {tags.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              'px-2 py-0.5 text-xs rounded border transition-colors',
              isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 border-border',
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

function TimeRangeInputs({
  value,
  timeZone,
  onChange,
  onTimeZoneChange,
  t,
}: {
  value: string;
  timeZone: string;
  onChange: (v: string) => void;
  onTimeZoneChange: (tz: string) => void;
  t: TranslateFn;
}) {
  const parts = value.includes(',') ? value.split(',').map((s) => s.trim()) : ['09:00', '17:00'];
  const start = parts[0] || '09:00';
  const end = parts[1] || '17:00';
  const isOvernightRange = start > end;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.start_time', 'Start time')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.start_time" type="time" value={start} onChange={(e) => onChange(`${e.target.value},${end}`)} className="text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('flow_builder.end_time', 'End time')}</Label>
          <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.start_time" type="time" value={end} onChange={(e) => onChange(`${start},${e.target.value}`)} className="text-xs" />
        </div>
      </div>
      {isOvernightRange && (
        <p className="text-xs text-muted-foreground">
          {t(
            'flow_builder.overnight_range_hint',
            'When start time is after end time, the range spans midnight (e.g. 22:00–02:00).',
          )}
        </p>
      )}
      <div className="space-y-1">
        <Label className="text-xs">{t('flow_builder.timezone', 'Timezone')}</Label>
        <TimezoneSelector value={timeZone} onChange={onTimeZoneChange} className="w-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advanced group editor
// ---------------------------------------------------------------------------

interface AdvancedEditorActions {
  onAddCondition: (groupId: string) => void;
  onAddSubgroup: (groupId: string) => void;
  onDuplicateChild: (parentGroupId: string, childId: string) => void;
  onDeleteChild: (parentGroupId: string, childId: string) => void;
  onUpdateGroupCombinator: (groupId: string, combinator: ConditionCombinator) => void;
  onUpdateRule: (ruleId: string, patch: Partial<ConditionRule>) => void;
}

interface AdvancedGroupEditorProps extends AdvancedEditorActions {
  group: ConditionRuleGroup;
  isRoot?: boolean;
  depth?: number;
  validationErrors: Map<string, string>;
  metadataProps: Omit<RuleValueEditorProps, 'rule' | 'onChange' | 'validationError'>;
}

interface RuleCardProps extends AdvancedEditorActions {
  rule: ConditionRule;
  parentGroupId: string;
  depth: number;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  canDelete: boolean;
  validationErrors: Map<string, string>;
  metadataProps: Omit<RuleValueEditorProps, 'rule' | 'onChange' | 'validationError'>;
}

function RuleCard({
  rule,
  parentGroupId,
  depth,
  dragHandleProps,
  canDelete,
  validationErrors,
  metadataProps,
  onDuplicateChild,
  onDeleteChild,
  onUpdateRule,
}: RuleCardProps) {
  const { t } = metadataProps;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card shadow-sm',
        depth === 0 ? 'p-3' : 'p-2.5',
      )}
    >
      <div className="flex items-start gap-2">
        <div {...dragHandleProps} className="cursor-grab shrink-0 mt-1.5">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          <FieldDomainSelect
            value={rule.field}
            onChange={(field) => onUpdateRule(rule.id, { field })}
            t={t}
          />
          <RuleValueEditor
            rule={rule}
            onChange={(patch) => onUpdateRule(rule.id, patch)}
            {...metadataProps}
            validationError={validationErrors.get(rule.id)}
          />
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <Button data-tour="components-flow-builder-conditionnode.button.flow_builder.duplicate"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => onDuplicateChild(parentGroupId, rule.id)}
            title={t('flow_builder.duplicate', 'Duplicate')}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button data-tour="components-flow-builder-conditionnode.button.common.delete"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={() => onDeleteChild(parentGroupId, rule.id)}
            disabled={!canDelete}
            title={t('common.delete', 'Delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface NestedGroupCardProps extends AdvancedEditorActions {
  group: ConditionRuleGroup;
  parentGroupId: string;
  depth: number;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  canDelete: boolean;
  validationErrors: Map<string, string>;
  metadataProps: Omit<RuleValueEditorProps, 'rule' | 'onChange' | 'validationError'>;
}

function NestedGroupCard({
  group,
  parentGroupId,
  depth,
  dragHandleProps,
  canDelete,
  validationErrors,
  metadataProps,
  onAddCondition,
  onAddSubgroup,
  onDuplicateChild,
  onDeleteChild,
  onUpdateGroupCombinator,
  onUpdateRule,
}: NestedGroupCardProps) {
  const { t } = metadataProps;
  const [collapsed, setCollapsed] = useState(depth > 0);

  const groupSummary = group.children.length === 1 && group.children[0].type === 'rule'
    ? formatRulePreview(group.children[0], t)
    : t('flow_builder.condition_summary.group_items', '{{count}} items', { count: group.children.length });

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/30 overflow-hidden',
        depth > 1 && 'ml-1',
      )}
    >
      <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-muted/50 border-b">
          <div {...dragHandleProps} className="cursor-grab shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
              {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <Select
            value={group.combinator}
            onValueChange={(v) => onUpdateGroupCombinator(group.id, v as ConditionCombinator)}
          >
            <SelectTrigger className="h-7 text-xs w-[4.5rem] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and" className="text-xs">{getCombinatorLabel('and', t)}</SelectItem>
              <SelectItem value="or" className="text-xs">{getCombinatorLabel('or', t)}</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground truncate flex-1">{groupSummary}</span>
          <Button data-tour="components-flow-builder-conditionnode.button.flow_builder.duplicate"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => onDuplicateChild(parentGroupId, group.id)}
            title={t('flow_builder.duplicate', 'Duplicate')}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button data-tour="components-flow-builder-conditionnode.button.common.delete"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive shrink-0"
            onClick={() => onDeleteChild(parentGroupId, group.id)}
            disabled={!canDelete}
            title={t('common.delete', 'Delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <CollapsibleContent>
          <div className="p-2.5">
            <AdvancedGroupEditor
              group={group}
              depth={depth}
              validationErrors={validationErrors}
              metadataProps={metadataProps}
              onAddCondition={onAddCondition}
              onAddSubgroup={onAddSubgroup}
              onDuplicateChild={onDuplicateChild}
              onDeleteChild={onDeleteChild}
              onUpdateGroupCombinator={onUpdateGroupCombinator}
              onUpdateRule={onUpdateRule}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function AdvancedGroupEditor({
  group,
  isRoot = false,
  depth = 0,
  validationErrors,
  metadataProps,
  onAddCondition,
  onAddSubgroup,
  onDuplicateChild,
  onDeleteChild,
  onUpdateGroupCombinator,
  onUpdateRule,
}: AdvancedGroupEditorProps) {
  const { t } = metadataProps;
  const canDeleteChild = group.children.length > 1;

  const renderBody = () => (
    <>
      <Droppable droppableId={group.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="space-y-2.5"
          >
            {group.children.map((child, index) => (
              <Draggable key={child.id} draggableId={child.id} index={index}>
                {(dragProvided, snapshot) => {
                  const draggableContent = (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={cn(
                        snapshot.isDragging && 'shadow-lg rounded-lg z-[10000] opacity-100 bg-card',
                        'nodrag nopan',
                      )}
                    >
                      {child.type === 'group' ? (
                        <NestedGroupCard
                          group={child}
                          parentGroupId={group.id}
                          depth={depth + 1}
                          dragHandleProps={dragProvided.dragHandleProps}
                          canDelete={canDeleteChild}
                          validationErrors={validationErrors}
                          metadataProps={metadataProps}
                          onAddCondition={onAddCondition}
                          onAddSubgroup={onAddSubgroup}
                          onDuplicateChild={onDuplicateChild}
                          onDeleteChild={onDeleteChild}
                          onUpdateGroupCombinator={onUpdateGroupCombinator}
                          onUpdateRule={onUpdateRule}
                        />
                      ) : (
                        <RuleCard
                          rule={child}
                          parentGroupId={group.id}
                          depth={depth}
                          dragHandleProps={dragProvided.dragHandleProps}
                          canDelete={canDeleteChild}
                          validationErrors={validationErrors}
                          metadataProps={metadataProps}
                          onAddCondition={onAddCondition}
                          onAddSubgroup={onAddSubgroup}
                          onDuplicateChild={onDuplicateChild}
                          onDeleteChild={onDeleteChild}
                          onUpdateGroupCombinator={onUpdateGroupCombinator}
                          onUpdateRule={onUpdateRule}
                        />
                      )}
                    </div>
                  );
                  return snapshot.isDragging
                    ? createPortal(draggableContent, document.body)
                    : draggableContent;
                }}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-tour="components-flow-builder-conditionnode.button.flow_builder.add_condition" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddCondition(group.id)}>
          <Plus className="h-3 w-3 mr-1" />
          {t('flow_builder.add_condition', 'Add condition')}
        </Button>
        <Button data-tour="components-flow-builder-conditionnode.button.flow_builder.add_group" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddSubgroup(group.id)}>
          <Layers className="h-3 w-3 mr-1" />
          {t('flow_builder.add_group', 'Add group')}
        </Button>
      </div>
    </>
  );

  if (isRoot) {
    return <div className="space-y-3">{renderBody()}</div>;
  }

  return <div className="space-y-2.5">{renderBody()}</div>;
}

function AdvancedConditionHelperPanel({ tree, t }: { tree: ConditionRuleGroup; t: TranslateFn }) {
  const summary = buildConditionTreeSummary(tree, t);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold">
          {t('flow_builder.condition_helper.title', 'How it works')}
        </h4>
        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          {tree.combinator === 'or'
            ? t(
                'flow_builder.condition_helper.combinator_or_desc',
                'The flow continues when ANY of the rules below match.',
              )
            : t(
                'flow_builder.condition_helper.combinator_and_desc',
                'The flow continues only when ALL of the rules below match.',
              )}
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {t('flow_builder.condition_helper.summary_heading', 'Summary')}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary" className="text-[10px] h-5">
            {summary.combinatorLabel}
          </Badge>
          {summary.domains.map((d) => (
            <Badge key={d} variant="outline" className="text-[10px] h-5">
              {getDomainLabel(d, t)}
            </Badge>
          ))}
        </div>
        {(shouldShowRulesGroupsSummary(summary.ruleCount, summary.groupCount)) && (
          <p className="text-[10px] text-muted-foreground">
            {t('flow_builder.condition_summary.rules_groups', '{{rules}} rules · {{groups}} groups', {
              rules: summary.ruleCount,
              groups: summary.groupCount,
            })}
          </p>
        )}
        {summary.previews.length > 0 && (
          <div className="space-y-1">
            {summary.previews.map((preview, i) => (
              <p key={i} className="text-[10px] text-foreground leading-snug">
                • {preview}
              </p>
            ))}
          </div>
        )}
      </div>

      {summary.hasLiveLookup && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 p-3 [&>svg]:text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" />
          <AlertTitle className="text-[11px] font-medium text-amber-900">
            {t('flow_builder.condition_summary.live_lookup', 'live lookup')}
          </AlertTitle>
          <AlertDescription className="text-[10px] text-amber-800">
            {t(
              'flow_builder.live_lookup_warning',
              'Some rules depend on live data lookups (deal, task, ERP, pipeline). They may evaluate false if context is unavailable.',
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function FieldDomainSelect({
  value,
  onChange,
  t,
}: {
  value: ConditionFieldId;
  onChange: (field: ConditionFieldId) => void;
  t: TranslateFn;
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<ConditionDomainId, FieldDescriptor[]>();
    for (const d of CONDITION_FIELD_CATALOG) {
      if (!map.has(d.domain)) map.set(d.domain, []);
      map.get(d.domain)!.push(d);
    }
    return map;
  }, []);

  const selectedLabel = getFieldLabel(value, t);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearchValue('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-xs h-8 font-normal px-3"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="nodrag nopan w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('flow_builder.search_fields', 'Search fields...')}
            value={searchValue}
            onValueChange={setSearchValue}
            className="text-xs h-9"
          />
          <CommandList className="max-h-64">
            <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
              {t('flow_builder.no_fields_found', 'No fields found.')}
            </CommandEmpty>
            {DOMAIN_ORDER.map((domain) => {
              const fields = grouped.get(domain);
              if (!fields?.length) return null;
              const searchLower = searchValue.trim().toLowerCase();
              const filteredFields = searchLower
                ? fields.filter((f) => {
                    const label = getFieldLabel(f.field, t).toLowerCase();
                    const domainLabel = getDomainLabel(domain, t).toLowerCase();
                    return (
                      label.includes(searchLower)
                      || domainLabel.includes(searchLower)
                      || f.field.toLowerCase().includes(searchLower)
                    );
                  })
                : fields;
              if (filteredFields.length === 0) return null;
              return (
                <CommandGroup key={domain} heading={getDomainLabel(domain, t)}>
                  {filteredFields.map((f) => {
                    const label = getFieldLabel(f.field, t);
                    return (
                      <CommandItem
                        key={f.field}
                        value={f.field}
                        onSelect={() => {
                          onChange(f.field);
                          setOpen(false);
                          setSearchValue('');
                        }}
                        className="text-xs"
                      >
                        <Check
                          className={cn(
                            'mr-2 h-3 w-3 shrink-0',
                            value === f.field ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{label}</span>
                        {f.liveLookup && (
                          <span className="ml-1 text-muted-foreground shrink-0">
                            • {t('flow_builder.condition_summary.live_indicator', 'live')}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Compact summary display
// ---------------------------------------------------------------------------

function ConditionCompactSummary({ data }: { data: ConditionNodeData }) {
  const { t } = useTranslation();
  const tree = getNormalizedTree(data);
  const summary = buildConditionTreeSummary(tree, t);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-1.5 cursor-default">
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="secondary" className="text-[10px] h-5">
                {summary.combinatorLabel}
              </Badge>
              {summary.domains.map((d) => (
                <Badge key={d} variant="outline" className="text-[10px] h-5">
                  {getDomainLabel(d, t)}
                </Badge>
              ))}
              {summary.hasLiveLookup && (
                <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-300">
                  {t('flow_builder.condition_summary.live_lookup', 'live lookup')}
                </Badge>
              )}
              {shouldShowRulesGroupsSummary(summary.ruleCount, summary.groupCount) && (
                <span className="text-[10px] text-muted-foreground">
                  {t('flow_builder.condition_summary.rules_groups', '{{rules}} rules · {{groups}} groups', {
                    rules: summary.ruleCount,
                    groups: summary.groupCount,
                  })}
                </span>
              )}
            </div>
            {summary.previews.map((preview, i) => (
              <div key={i} className="text-xs text-foreground truncate">
                {preview}
              </div>
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap text-xs">
          {summary.fullText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Main node
// ---------------------------------------------------------------------------

export function ConditionNode({ data, isConnectable, id }: ConditionNodeProps) {
  const { t } = useTranslation();
  const CONDITION_TYPE_LABELS = getConditionTypeLabels(t);
  const { setNodes } = useReactFlow();
  const { onDuplicateNode, onDeleteNode, flowId, customVariables } = useFlowContext();

  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  const normalizedTree = useMemo(() => getNormalizedTree(data), [data]);
  const persistedSimpleEligible = useMemo(() => isSimpleModeEligible(normalizedTree), [normalizedTree]);

  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>(persistedSimpleEligible ? 'simple' : 'advanced');
  const [editTree, setEditTree] = useState<ConditionRuleGroup>(normalizedTree);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  const draftSimpleEligible = useMemo(() => isSimpleModeEligible(editTree), [editTree]);
  const simpleEligible = isEditing ? draftSimpleEligible : persistedSimpleEligible;

  const initialState = editorStateFromNodeData(data);
  const [category, setCategory] = useState<ConditionCategoryId>(initialState.category);
  const [conditionValue, setConditionValue] = useState(initialState.conditionValue);
  const [caseSensitive, setCaseSensitive] = useState(initialState.caseSensitive);
  const [mediaType, setMediaType] = useState(initialState.mediaType);
  const [timeOperator, setTimeOperator] = useState(initialState.timeOperator);
  const [timeValue, setTimeValue] = useState(initialState.timeValue);
  const [timeZone, setTimeZone] = useState(initialState.timeZone);
  const [contactAttribute, setContactAttribute] = useState(initialState.contactAttribute);
  const [attributeValue, setAttributeValue] = useState(initialState.attributeValue);
  const [variablePath, setVariablePath] = useState('');
  const [variableOperator, setVariableOperator] = useState<ConditionOperatorId>('equals');
  const [variableValue, setVariableValue] = useState('');

  const { data: contactTags = [] } = useQuery({
    queryKey: ['/api/contacts/tags'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/contacts/tags');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: dealTags = [] } = useQuery({
    queryKey: ['/api/deals/tags'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/deals/tags');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: pipelines = [] } = useQuery({
    queryKey: ['/api/pipelines'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipelines');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60 * 1000,
  });

  const { data: pipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipeline/stages');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60 * 1000,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60 * 1000,
  });

  const { data: contactCustomFields = [] } = useCompanyContactCustomFields();
  const { data: dealCustomFields = [] } = useCompanyDealCustomFields();

  const metadataProps: Omit<RuleValueEditorProps, 'rule' | 'onChange' | 'validationError'> = {
    flowId: flowId ?? undefined,
    customVariables,
    contactCustomFields,
    dealCustomFields,
    pipelines,
    pipelineStages,
    teamMembers,
    contactTags,
    dealTags,
    t,
  };

  const customFieldValidationContext = useMemo(
    () => ({ contactCustomFields, dealCustomFields }),
    [contactCustomFields, dealCustomFields],
  );

  const syncSimpleEditorStateFromRule = useCallback((rule: ConditionRule | null) => {
    const state = conditionEditorStateFromRule(rule, {
      timeZone: String(data.timeZone ?? data.timezone ?? getBrowserTimezone()),
    });
    setCategory(state.category);
    setConditionValue(state.conditionValue);
    setCaseSensitive(state.caseSensitive);
    setMediaType(state.mediaType);
    setTimeOperator(state.timeOperator);
    setTimeValue(state.timeValue);
    setTimeZone(state.timeZone);
    setContactAttribute(state.contactAttribute);
    setAttributeValue(state.attributeValue);
    if (rule?.category === 'runtime_variable') {
      setVariablePath(String(rule.options?.variablePath ?? ''));
      setVariableOperator(rule.operator);
      setVariableValue(rule.value ?? '');
    } else {
      setVariablePath('');
      setVariableOperator('equals');
      setVariableValue('');
    }
  }, [data]);

  useEffect(() => {
    if (isEditing) {
      const tree = getNormalizedTree(data);
      setEditTree(tree);
      setEditorMode(isSimpleModeEligible(tree) ? 'simple' : 'advanced');
      const rule = getPrimaryConditionRule(normalizeConditionNodeData(data) as ConditionNodeData);
      syncSimpleEditorStateFromRule(rule);
    }
  }, [isEditing, data, syncSimpleEditorStateFromRule]);

  useEffect(() => {
    if (!isEditing) return;
    const errors = validateConditionTree(editTree, t, customFieldValidationContext);
    setValidationErrors(new Map(errors.map((e) => [e.ruleId, e.message])));
  }, [isEditing, editTree, customFieldValidationContext, t]);

  const persistTree = useCallback((tree: ConditionRuleGroup) => {
    const errors = validateConditionTree(tree, t, customFieldValidationContext);
    const errorMap = new Map(errors.map((e) => [e.ruleId, e.message]));
    setValidationErrors(errorMap);
    if (errors.length > 0) return false;

    const normalized = normalizeConditionNodeData({
      ...data,
      conditionRuleTree: tree,
    });

    setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: normalized } : node)),
    );
    return true;
  }, [customFieldValidationContext, data, id, setNodes, t]);

  const handleAdvancedDragEnd = useCallback((result: DropResult) => {
    const destination = result.destination;
    if (!destination) return;
    if (result.source.droppableId !== destination.droppableId) return;
    if (result.source.index === destination.index) return;
    const groupId = result.source.droppableId;
    setEditTree((prev) =>
      reorderGroupChildrenInTree(prev, groupId, result.source.index, destination.index),
    );
  }, []);

  const handleAddCondition = useCallback((groupId: string) => {
    setEditTree((prev) => insertRuleIntoGroup(prev, groupId));
  }, []);

  const handleAddSubgroup = useCallback((groupId: string) => {
    setEditTree((prev) => insertSubgroupIntoGroup(prev, groupId));
  }, []);

  const handleDuplicateChild = useCallback((parentGroupId: string, childId: string) => {
    setEditTree((prev) => duplicateChildInGroup(prev, parentGroupId, childId));
  }, []);

  const handleDeleteChild = useCallback((parentGroupId: string, childId: string) => {
    setEditTree((prev) => removeChildFromGroup(prev, parentGroupId, childId));
  }, []);

  const handleUpdateGroupCombinator = useCallback((groupId: string, combinator: ConditionCombinator) => {
    setEditTree((prev) => updateGroupCombinatorInTree(prev, groupId, combinator));
  }, []);

  const handleUpdateRule = useCallback((ruleId: string, patch: Partial<ConditionRule>) => {
    setEditTree((prev) =>
      updateRuleInTree(prev, ruleId, patch, contactCustomFields, dealCustomFields),
    );
  }, [contactCustomFields, dealCustomFields]);

  const advancedEditorActions = useMemo(
    () => ({
      onAddCondition: handleAddCondition,
      onAddSubgroup: handleAddSubgroup,
      onDuplicateChild: handleDuplicateChild,
      onDeleteChild: handleDeleteChild,
      onUpdateGroupCombinator: handleUpdateGroupCombinator,
      onUpdateRule: handleUpdateRule,
    }),
    [
      handleAddCondition,
      handleAddSubgroup,
      handleDuplicateChild,
      handleDeleteChild,
      handleUpdateGroupCombinator,
      handleUpdateRule,
    ],
  );

  const handleSwitchToSimple = useCallback(() => {
    if (draftSimpleEligible) {
      setEditorMode('simple');
      return;
    }

    const confirmed = window.confirm(
      t(
        'flow_builder.simple_mode_replace_confirm',
        'Switching to Simple mode will replace your current rules with a single rule. Continue?',
      ),
    );
    if (!confirmed) return;

    const primary = getPrimaryConditionRule({ conditionRuleTree: editTree }) ?? createDefaultRule();
    const singleRuleTree: ConditionRuleGroup = {
      type: 'group',
      id: editTree.id || 'root',
      combinator: 'and',
      children: [primary],
    };
    setEditTree(singleRuleTree);
    syncSimpleEditorStateFromRule(primary);
    setEditorMode('simple');
  }, [draftSimpleEligible, editTree, syncSimpleEditorStateFromRule, t]);

  const getCurrentEditorState = useCallback((): ConditionEditorState => ({
    category,
    conditionValue,
    caseSensitive,
    mediaType,
    timeOperator,
    timeValue,
    timeZone,
    contactAttribute,
    attributeValue,
  }), [category, conditionValue, caseSensitive, mediaType, timeOperator, timeValue, timeZone, contactAttribute, attributeValue]);

  const buildSimpleModeRule = useCallback((): ConditionRule => {
    if (category === 'runtime_variable') {
      return {
        type: 'rule',
        id: getPrimaryConditionRule(normalizeConditionNodeData(data) as ConditionNodeData)?.id ?? newRuleId(),
        category: 'runtime_variable',
        field: 'variable',
        operator: variableOperator,
        value: variableValue,
        options: { variablePath },
      };
    }
    return buildConditionRuleFromEditorState(getCurrentEditorState());
  }, [category, variableOperator, variableValue, variablePath, getCurrentEditorState, data]);

  const handleDoneClick = () => {
    if (editorMode === 'simple') {
      const rule = buildSimpleModeRule();
      const err = validateConditionRule(rule, t, customFieldValidationContext);
      if (err) {
        setValidationErrors(new Map([[rule.id, err.message]]));
        return;
      }
      const singleRuleTree: ConditionRuleGroup = {
        type: 'group',
        id: editTree.id || 'root',
        combinator: 'and',
        children: [rule],
      };
      if (!persistTree(singleRuleTree)) return;
    } else {
      if (!persistTree(editTree)) return;
    }
    setIsEditing(false);
  };

  const liveLookupWarning = useMemo(() => {
    const tree = isEditing ? editTree : normalizedTree;
    return treeHasLiveLookup(tree);
  }, [isEditing, editTree, normalizedTree]);

  const renderSimpleModeInputs = () => {
    switch (category) {
      case 'message_contains':
      case 'exact_match':
      case 'regex_match':
      case 'message_starts_with':
      case 'message_ends_with':
        return (
          <div className="space-y-2">
            <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.enter_text_value"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder={t('flow_builder.enter_text_value', 'Enter text value')}
              className="text-xs"
            />
            {category !== 'regex_match' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`case-sensitive-${id}`}
                  checked={caseSensitive}
                  onCheckedChange={(checked) => setCaseSensitive(!!checked)}
                />
                <Label htmlFor={`case-sensitive-${id}`} className="text-xs">
                  {t('flow_builder.case_sensitive', 'Case sensitive')}
                </Label>
              </div>
            )}
          </div>
        );
      case 'has_media':
        return (
          <p className="text-xs text-muted-foreground">
            {t('flow_builder.has_media_desc', 'Checks if the message has any attached media.')}
          </p>
        );
      case 'media_type':
        return (
          <Select value={mediaType} onValueChange={setMediaType}>
            <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEDIA_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="text-xs">{getMediaTypeLabel(type, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'time_based':
        return (
          <div className="space-y-2">
            <Select
              value={timeOperator}
              onValueChange={(v) => setTimeOperator(v as ConditionEditorState['timeOperator'])}
            >
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="before" className="text-xs">{t('flow_builder.before', 'Before')}</SelectItem>
                <SelectItem value="after" className="text-xs">{t('flow_builder.after', 'After')}</SelectItem>
                <SelectItem value="between" className="text-xs">{t('flow_builder.between', 'Between')}</SelectItem>
              </SelectContent>
            </Select>
            {timeOperator === 'between' ? (
              <TimeRangeInputs
                value={timeValue}
                timeZone={timeZone}
                onChange={setTimeValue}
                onTimeZoneChange={setTimeZone}
                t={t}
              />
            ) : (
              <>
                <Input type="time" value={timeValue || ''} onChange={(e) => setTimeValue(e.target.value)} className="text-xs" />
                <TimezoneSelector value={timeZone} onChange={setTimeZone} className="w-full" />
              </>
            )}
          </div>
        );
      case 'contact_attribute':
        return (
          <div className="space-y-2">
            <Select
              value={contactAttribute}
              onValueChange={(v) => setContactAttribute(v as ConditionEditorState['contactAttribute'])}
            >
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name" className="text-xs">{t('flow_builder.name', 'Name')}</SelectItem>
                <SelectItem value="phone" className="text-xs">{t('flow_builder.phone', 'Phone')}</SelectItem>
                <SelectItem value="email" className="text-xs">{t('flow_builder.email', 'Email')}</SelectItem>
                <SelectItem value="tags" className="text-xs">{t('flow_builder.tags', 'Tags')}</SelectItem>
              </SelectContent>
            </Select>
            {contactAttribute === 'tags' ? (
              <TagChipSelector tags={contactTags} value={attributeValue} onChange={setAttributeValue} t={t} />
            ) : (
              <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.attribute_value"
                value={attributeValue}
                onChange={(e) => setAttributeValue(e.target.value)}
                placeholder={t('flow_builder.attribute_value', 'Attribute value')}
                className="text-xs"
              />
            )}
          </div>
        );
      case 'runtime_variable':
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('flow_builder.variable_path', 'Variable path')}</Label>
              <EnhancedVariablePicker
                value={variablePath}
                onChange={setVariablePath}
                flowId={flowId ?? undefined}
                customVariables={customVariables}
                wrapInBraces={false}
                placeholder="contact.name"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('flow_builder.operator', 'Operator')}</Label>
              <Select value={variableOperator} onValueChange={(v) => setVariableOperator(v as ConditionOperatorId)}>
                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS].map((op) => (
                    <SelectItem key={op} value={op} className="text-xs">{getOperatorLabel(op, t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {operatorNeedsValue(variableOperator) && !BOOLEAN_OPERATORS.includes(variableOperator) && (
              <Input data-tour="components-flow-builder-conditionnode.input.flow_builder.enter_value"
                value={variableValue}
                onChange={(e) => setVariableValue(e.target.value)}
                placeholder={t('flow_builder.enter_value', 'Enter value')}
                className="text-xs"
              />
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const simpleValidationError = useMemo(() => {
    const rule = buildSimpleModeRule();
    const err = validateConditionRule(rule, t, customFieldValidationContext);
    return err?.message;
  }, [buildSimpleModeRule, customFieldValidationContext, t]);

  return (
    <div
      className={cn(
        'node-condition p-3 rounded-lg bg-card border border-border shadow-sm group transition-[max-width,width,min-width] duration-200',
        isEditing && editorMode === 'advanced'
          ? 'min-w-[720px] w-[880px] max-w-[920px]'
          : isEditing
            ? 'min-w-[400px] w-[520px] max-w-[560px]'
            : 'min-w-[360px] max-w-[420px]',
      )}
    >
      <NodeToolbar id={id} onDuplicate={onDuplicateNode} onDelete={onDeleteNode} />

      <div className="font-medium flex items-center gap-2 mb-2">
        <img
          src={APP_ICONS.condition}
          alt={t('flow_builder.condition', 'Condition')}
          className="h-4 w-4"
        />
        <span>{t('flow_builder.condition', 'Condition')}</span>
        <button data-tour="components-flow-builder-conditionnode.button.common.done"
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => (isEditing ? handleDoneClick() : setIsEditing(true))}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-1">
            <Button data-tour="components-flow-builder-conditionnode.button.flow_builder.simple_mode"
              variant={editorMode === 'simple' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleSwitchToSimple}
            >
              {t('flow_builder.simple_mode', 'Simple')}
            </Button>
            <Button data-tour="components-flow-builder-conditionnode.button.flow_builder.advanced_mode"
              variant={editorMode === 'advanced' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => setEditorMode('advanced')}
            >
              {t('flow_builder.advanced_mode', 'Advanced')}
            </Button>
          </div>

          {!simpleEligible && editorMode === 'simple' && (
            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              {t(
                'flow_builder.simple_mode_unavailable',
                'Simple mode is unavailable because this condition has multiple rules or nested groups. Use Advanced mode.',
              )}
            </div>
          )}

          {liveLookupWarning && editorMode !== 'advanced' && (
            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              {t(
                'flow_builder.live_lookup_warning',
                'Some rules depend on live data lookups (deal, task, ERP, pipeline). They may evaluate false if context is unavailable.',
              )}
            </div>
          )}

          {editorMode === 'simple' && simpleEligible ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('flow_builder.condition_type', 'Condition Type')}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ConditionCategoryId)}>
                  <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIMPLE_MODE_CATEGORY_OPTIONS.map((key) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {CONDITION_TYPE_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderSimpleModeInputs()}
              {simpleValidationError && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {simpleValidationError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0 text-muted-foreground">
                  {t('flow_builder.condition_helper.match_label', 'Match')}
                </Label>
                <ToggleGroup
                  type="single"
                  value={editTree.combinator}
                  onValueChange={(value) => {
                    if (value) {
                      setEditTree({ ...editTree, combinator: value as ConditionCombinator });
                    }
                  }}
                  className="justify-start"
                  size="sm"
                >
                  <ToggleGroupItem value="and" className="h-7 px-3 text-xs">
                    {getCombinatorLabel('and', t)}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="or" className="h-7 px-3 text-xs">
                    {getCombinatorLabel('or', t)}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex h-[360px] rounded-lg border overflow-hidden">
                <ScrollArea className="nodrag nopan flex-1 min-w-0">
                  <div className="p-3">
                    <DragDropContext onDragEnd={handleAdvancedDragEnd}>
                      <AdvancedGroupEditor
                        group={editTree}
                        isRoot
                        validationErrors={validationErrors}
                        metadataProps={metadataProps}
                        {...advancedEditorActions}
                      />
                    </DragDropContext>
                  </div>
                </ScrollArea>
                <Separator orientation="vertical" className="h-auto" />
                <div className="nodrag nopan w-[220px] shrink-0 p-3 bg-muted/20 overflow-y-auto">
                  <AdvancedConditionHelperPanel tree={editTree} t={t} />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm p-2 rounded border border-border">
          <ConditionCompactSummary data={data} />
        </div>
      )}

      <div className="flex mt-2 text-xs justify-between">
        <div className="text-green-600">{t('flow_builder.yes', 'Yes')} →</div>
        <div className="text-red-500">{t('flow_builder.no', 'No')} →</div>
      </div>

      <StyledHandle type="target" position={Position.Top} style={standardHandleStyle} isConnectable={isConnectable} />
      <StyledHandle type="source" position={Position.Bottom} id="yes" style={yesHandleStyle} isConnectable={isConnectable} />
      <StyledHandle type="source" position={Position.Bottom} id="no" style={noHandleStyle} isConnectable={isConnectable} />
    </div>
  );
}
