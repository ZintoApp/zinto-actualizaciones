import {
  type ConditionCategoryId,
  type ConditionCombinator,
  type ConditionFieldId,
  type ConditionNodeData,
  type ConditionOperatorId,
  type ConditionRule,
  type ConditionRuleGroup,
  type ConditionRuleOptions,
  getPrimaryConditionRule,
  normalizeConditionNodeData,
} from '@shared/types/node-types';

// ---------------------------------------------------------------------------
// Field catalog — resolver-aligned field / operator metadata
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

interface FieldDescriptor {
  field: ConditionFieldId;
  domain: ConditionDomainId;
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

const CONDITION_FIELD_CATALOG: FieldDescriptor[] = [
  { field: 'message.text', domain: 'message', operators: STRING_OPERATORS },
  { field: 'message.media', domain: 'message', operators: MEDIA_OPERATORS },
  { field: 'message.mediaType', domain: 'message', operators: ['equals', 'notEquals'] },
  { field: 'message.type', domain: 'message', operators: STRING_OPERATORS },
  { field: 'message.direction', domain: 'message', operators: STRING_OPERATORS },
  { field: 'message.metadata', domain: 'metadata', operators: METADATA_OPERATORS, requiresMetadataPath: true },
  { field: 'contact.name', domain: 'contact', operators: STRING_OPERATORS },
  { field: 'contact.phone', domain: 'contact', operators: STRING_OPERATORS },
  { field: 'contact.email', domain: 'contact', operators: STRING_OPERATORS },
  { field: 'contact.tags', domain: 'contact', operators: ARRAY_OPERATORS },
  { field: 'contact.assignedTo', domain: 'contact', operators: ['equals', 'notEquals'] },
  { field: 'contact.customField', domain: 'contact', operators: [...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS, ...DATE_OPERATORS], requiresCustomFieldKey: true },
  { field: 'deal.title', domain: 'deal', operators: STRING_OPERATORS, requiresDealId: true },
  { field: 'deal.value', domain: 'deal', operators: NUMERIC_OPERATORS, requiresDealId: true },
  { field: 'deal.status', domain: 'deal', operators: ['equals', 'notEquals', 'exactMatch'], requiresDealId: true },
  { field: 'deal.stageId', domain: 'deal', operators: ['equals', 'notEquals'], requiresDealId: true },
  { field: 'deal.pipelineId', domain: 'deal', operators: ['equals', 'notEquals'], requiresDealId: true },
  { field: 'deal.assignedTo', domain: 'deal', operators: ['equals', 'notEquals'], requiresDealId: true },
  { field: 'deal.customField', domain: 'deal', operators: [...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS, ...DATE_OPERATORS], requiresCustomFieldKey: true, requiresDealId: true },
  { field: 'pipeline.currentPipelineId', domain: 'pipeline', operators: ['equals', 'notEquals'] },
  { field: 'pipeline.currentStageId', domain: 'pipeline', operators: ['equals', 'notEquals'] },
  { field: 'pipeline.previousPipelineId', domain: 'pipeline', operators: ['equals', 'notEquals'] },
  { field: 'pipeline.previousStageId', domain: 'pipeline', operators: ['equals', 'notEquals'] },
  { field: 'pipeline.pipelineChanged', domain: 'pipeline', operators: BOOLEAN_OPERATORS },
  { field: 'pipeline.stageChanged', domain: 'pipeline', operators: BOOLEAN_OPERATORS },
  { field: 'task.exists', domain: 'task', operators: BOOLEAN_OPERATORS },
  { field: 'task.status', domain: 'task', operators: ['equals', 'notEquals'], requiresTaskId: true },
  { field: 'task.priority', domain: 'task', operators: ['equals', 'notEquals'], requiresTaskId: true },
  { field: 'task.title', domain: 'task', operators: STRING_OPERATORS, requiresTaskId: true },
  { field: 'erp.salesOrderId', domain: 'erp', operators: NUMERIC_OPERATORS, requiresSalesOrderId: true },
  { field: 'erp.salesOrderStatus', domain: 'erp', operators: STRING_OPERATORS, requiresSalesOrderId: true },
  { field: 'erp.salesOrderTotal', domain: 'erp', operators: NUMERIC_OPERATORS, requiresSalesOrderId: true },
  { field: 'erp.invoiceId', domain: 'erp', operators: NUMERIC_OPERATORS, requiresInvoiceId: true },
  { field: 'erp.invoiceStatus', domain: 'erp', operators: STRING_OPERATORS, requiresInvoiceId: true },
  { field: 'erp.invoiceTotal', domain: 'erp', operators: NUMERIC_OPERATORS, requiresInvoiceId: true },
  { field: 'erp.invoicePaymentMethod', domain: 'erp', operators: ['equals', 'containsItem', 'containsAny'], requiresInvoiceId: true, requiresEntityScope: true },
  { field: 'erp.invoicePaymentAmount', domain: 'erp', operators: NUMERIC_OPERATORS, requiresInvoiceId: true, requiresEntityScope: true },
  { field: 'erp.lastResponse', domain: 'erp', operators: STRING_OPERATORS },
  { field: 'conversation.id', domain: 'metadata', operators: ['equals', 'notEquals'] },
  { field: 'conversation.status', domain: 'metadata', operators: STRING_OPERATORS },
  { field: 'conversation.assignedTo', domain: 'metadata', operators: ['equals', 'notEquals'] },
  { field: 'variable', domain: 'variables', operators: [...STRING_OPERATORS, ...NUMERIC_OPERATORS, ...BOOLEAN_OPERATORS], requiresVariablePath: true },
  { field: 'time', domain: 'time', operators: TIME_OPERATORS, requiresTimeZone: true },
];

const FIELD_DESCRIPTOR_MAP = new Map<ConditionFieldId, FieldDescriptor>(
  CONDITION_FIELD_CATALOG.map((d) => [d.field, d]),
);

export function getFieldDescriptor(field: ConditionFieldId): FieldDescriptor | undefined {
  return FIELD_DESCRIPTOR_MAP.get(field);
}

export type CustomFieldSchema = Array<{ fieldName: string; fieldType: string }>;

export type TranslateFn = (key: string, fallback?: string, variables?: Record<string, unknown>) => string;

function operatorNeedsValue(op: ConditionOperatorId): boolean {
  return !['hasMedia', 'isTrue', 'isFalse', 'empty', 'notEmpty', 'exists', 'missing', 'pathExists'].includes(op);
}

function operatorNeedsRange(op: ConditionOperatorId): boolean {
  return op === 'between' || op === 'timeBetween';
}

export function inferCategoryFromField(field: ConditionFieldId): ConditionCategoryId {
  if (field === 'message.text') return 'message_contains';
  if (field === 'message.media') return 'has_media';
  if (field === 'message.mediaType') return 'media_type';
  if (field === 'time') return 'time_based';
  if (field === 'message.metadata') return 'message_metadata';
  if (field === 'variable') return 'runtime_variable';
  if (field.startsWith('contact.')) {
    return field === 'contact.customField' ? 'contact_custom_field' : 'contact_attribute';
  }
  if (field.startsWith('deal.')) {
    return field === 'deal.customField' ? 'deal_custom_field' : 'deal_field';
  }
  if (field.startsWith('pipeline.')) return 'pipeline_state';
  if (field.startsWith('task.')) return 'task_state';
  if (field.startsWith('erp.')) {
    if (field === 'erp.invoicePaymentMethod' || field === 'erp.invoicePaymentAmount') return 'erp_payment';
    if (field.startsWith('erp.invoice')) return 'erp_invoice';
    return 'erp_sales_order';
  }
  if (field.startsWith('conversation.')) return 'conversation_field';
  return 'message_contains';
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

export function normalizeOperatorForCustomFieldKey(
  rule: ConditionRule,
  customFieldKey: string,
  contactCustomFields?: CustomFieldSchema,
  dealCustomFields?: CustomFieldSchema,
): ConditionOperatorId {
  const desc = getFieldDescriptor(rule.field);
  if (!desc) return rule.operator;
  const entity = rule.field === 'deal.customField' ? dealCustomFields : contactCustomFields;
  const fieldDef = entity?.find((f) => f.fieldName === customFieldKey);
  const allowedOps = fieldDef ? getCustomFieldOperators(fieldDef.fieldType) : desc.operators;
  return allowedOps.includes(rule.operator) ? rule.operator : allowedOps[0];
}

function shouldPreserveCustomFieldKey(
  previousField: ConditionFieldId | undefined,
  newField: ConditionFieldId,
): boolean {
  return previousField === newField;
}

/** Rebuild rule options for a field/operator pair, dropping keys from the previous field. */
export function rebuildOptionsForField(
  field: ConditionFieldId,
  operator: ConditionOperatorId,
  previous?: ConditionRuleOptions,
  previousField?: ConditionFieldId,
): ConditionRuleOptions {
  const desc = getFieldDescriptor(field);
  const opts: ConditionRuleOptions = {};

  if (desc?.requiresVariablePath) {
    opts.variablePath = previousField === 'variable' ? (previous?.variablePath ?? '') : '';
  }
  if (desc?.requiresMetadataPath) {
    opts.metadataPath = previousField === field ? (previous?.metadataPath ?? '') : '';
  }
  if (desc?.requiresCustomFieldKey) {
    opts.customFieldKey = shouldPreserveCustomFieldKey(previousField, field)
      ? (previous?.customFieldKey ?? '')
      : '';
  }
  if (desc?.requiresTimeZone && TIME_OPERATORS.includes(operator)) {
    opts.timeZone = previous?.timeZone;
  }
  if (desc?.requiresEntityScope) {
    opts.entityScope = previous?.entityScope ?? 'header';
  }
  if (desc?.requiresDealId) {
    opts.dealId = previous?.dealId;
  }
  if (desc?.requiresTaskId) {
    opts.taskId = previous?.taskId;
  }
  if (desc?.requiresSalesOrderId) {
    opts.salesOrderId = previous?.salesOrderId;
  }
  if (desc?.requiresInvoiceId) {
    opts.invoiceId = previous?.invoiceId;
  }
  if (field === 'message.text' && STRING_OPERATORS.includes(operator) && operator !== 'regexMatch') {
    opts.caseSensitive = previous?.caseSensitive ?? false;
  }

  return opts;
}

export function shouldShowRulesGroupsSummary(ruleCount: number, groupCount: number): boolean {
  return ruleCount > 1 || groupCount > 1;
}

// ---------------------------------------------------------------------------
// Tree ids and defaults
// ---------------------------------------------------------------------------

export function newRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultRule(): ConditionRule {
  return {
    type: 'rule',
    id: newRuleId(),
    category: 'message_contains',
    field: 'message.text',
    operator: 'contains',
    value: '',
    options: { caseSensitive: false },
  };
}

export function createDefaultGroup(combinator: ConditionCombinator = 'and'): ConditionRuleGroup {
  return {
    type: 'group',
    id: newGroupId(),
    combinator,
    children: [createDefaultRule()],
  };
}

// ---------------------------------------------------------------------------
// Tree mutation helpers
// ---------------------------------------------------------------------------

export function cloneRule(rule: ConditionRule): ConditionRule {
  return { ...rule, id: newRuleId(), options: rule.options ? { ...rule.options } : undefined };
}

export function cloneRuleGroup(group: ConditionRuleGroup): ConditionRuleGroup {
  return {
    type: 'group',
    id: newGroupId(),
    combinator: group.combinator,
    children: group.children.map((child) =>
      child.type === 'rule' ? cloneRule(child) : cloneRuleGroup(child),
    ),
  };
}

function mapGroupInTree(
  tree: ConditionRuleGroup,
  groupId: string,
  fn: (group: ConditionRuleGroup) => ConditionRuleGroup,
): ConditionRuleGroup {
  if (tree.id === groupId) return fn(tree);
  return {
    ...tree,
    children: tree.children.map((child) =>
      child.type === 'group' ? mapGroupInTree(child, groupId, fn) : child,
    ),
  };
}

export function insertRuleIntoGroup(tree: ConditionRuleGroup, groupId: string): ConditionRuleGroup {
  return mapGroupInTree(tree, groupId, (g) => ({
    ...g,
    children: [...g.children, createDefaultRule()],
  }));
}

export function insertSubgroupIntoGroup(tree: ConditionRuleGroup, groupId: string): ConditionRuleGroup {
  return mapGroupInTree(tree, groupId, (g) => ({
    ...g,
    children: [...g.children, createDefaultGroup('and')],
  }));
}

export function removeChildFromGroup(
  tree: ConditionRuleGroup,
  parentGroupId: string,
  childId: string,
): ConditionRuleGroup {
  return mapGroupInTree(tree, parentGroupId, (g) => {
    if (g.children.length <= 1) return g;
    return { ...g, children: g.children.filter((c) => c.id !== childId) };
  });
}

export function duplicateChildInGroup(
  tree: ConditionRuleGroup,
  parentGroupId: string,
  childId: string,
): ConditionRuleGroup {
  return mapGroupInTree(tree, parentGroupId, (g) => {
    const index = g.children.findIndex((c) => c.id === childId);
    if (index === -1) return g;
    const source = g.children[index];
    const clone = source.type === 'rule' ? cloneRule(source) : cloneRuleGroup(source);
    const children = [...g.children];
    children.splice(index + 1, 0, clone);
    return { ...g, children };
  });
}

export function reorderGroupChildrenInTree(
  tree: ConditionRuleGroup,
  groupId: string,
  sourceIndex: number,
  destIndex: number,
): ConditionRuleGroup {
  return mapGroupInTree(tree, groupId, (g) => {
    const children = [...g.children];
    const [moved] = children.splice(sourceIndex, 1);
    children.splice(destIndex, 0, moved);
    return { ...g, children };
  });
}

export function updateGroupCombinatorInTree(
  tree: ConditionRuleGroup,
  groupId: string,
  combinator: ConditionCombinator,
): ConditionRuleGroup {
  return mapGroupInTree(tree, groupId, (g) => ({ ...g, combinator }));
}

export function applyRulePatch(
  rule: ConditionRule,
  patch: Partial<ConditionRule>,
  contactCustomFields?: CustomFieldSchema,
  dealCustomFields?: CustomFieldSchema,
): ConditionRule {
  const fieldChanged = patch.field !== undefined && patch.field !== rule.field;
  const newField = patch.field ?? rule.field;
  let operator = patch.operator ?? rule.operator;

  let options: ConditionRuleOptions | undefined;
  if (fieldChanged) {
    options = rebuildOptionsForField(newField, operator, rule.options, rule.field);
    if (patch.options !== undefined) {
      options = { ...options, ...patch.options };
    }
  } else if (patch.options !== undefined) {
    options = patch.options;
  } else {
    options = rule.options;
  }

  const updated: ConditionRule = {
    ...rule,
    ...patch,
    field: newField,
    operator,
    options,
  };

  if (fieldChanged) {
    updated.category = inferCategoryFromField(newField);
    const desc = getFieldDescriptor(newField);
    if (desc && !desc.operators.includes(updated.operator)) {
      updated.operator = desc.operators[0];
      updated.options = rebuildOptionsForField(newField, updated.operator, updated.options, rule.field);
    }
  }

  const customFieldKeyChanged = patch.options?.customFieldKey !== undefined
    && patch.options.customFieldKey !== rule.options?.customFieldKey;
  if (
    customFieldKeyChanged
    && (updated.field === 'contact.customField' || updated.field === 'deal.customField')
    && patch.options?.customFieldKey
  ) {
    updated.operator = normalizeOperatorForCustomFieldKey(
      updated,
      String(patch.options.customFieldKey),
      contactCustomFields,
      dealCustomFields,
    );
  }

  return updated;
}

export function updateRuleInTree(
  tree: ConditionRuleGroup,
  ruleId: string,
  patch: Partial<ConditionRule>,
  contactCustomFields?: CustomFieldSchema,
  dealCustomFields?: CustomFieldSchema,
): ConditionRuleGroup {
  return {
    ...tree,
    children: tree.children.map((child) => {
      if (child.type === 'rule') {
        return child.id === ruleId
          ? applyRulePatch(child, patch, contactCustomFields, dealCustomFields)
          : child;
      }
      return updateRuleInTree(child, ruleId, patch, contactCustomFields, dealCustomFields);
    }),
  };
}

export function getNormalizedTree(data: ConditionNodeData): ConditionRuleGroup {
  const normalized = normalizeConditionNodeData(data) as ConditionNodeData;
  const tree = normalized.conditionRuleTree;
  if (tree && tree.type === 'group' && Array.isArray(tree.children) && tree.children.length > 0) {
    return tree;
  }
  const rule = getPrimaryConditionRule(normalized) ?? createDefaultRule();
  return { type: 'group', id: 'root', combinator: 'and', children: [rule] };
}

export function countRulesInTree(node: ConditionRule | ConditionRuleGroup): { rules: number; groups: number } {
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

function getFieldLabel(field: ConditionFieldId): string {
  return field;
}

function formatRulePreview(rule: ConditionRule): string {
  const fieldLabel = getFieldLabel(rule.field);
  const opLabel = rule.operator;
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

function collectRulePreviews(node: ConditionRule | ConditionRuleGroup, limit = 3): string[] {
  const previews: string[] = [];
  const visit = (n: ConditionRule | ConditionRuleGroup) => {
    if (previews.length >= limit) return;
    if (n.type === 'rule') {
      previews.push(formatRulePreview(n));
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
  fullText: string;
}

export function buildConditionTreeSummary(tree: ConditionRuleGroup): ConditionTreeSummary {
  const { rules, groups } = countRulesInTree(tree);
  const previews = collectRulePreviews(tree, 3);
  const combinatorLabel = tree.combinator === 'or' ? 'ANY' : 'ALL';
  const fullLines: string[] = [];
  const buildFull = (node: ConditionRule | ConditionRuleGroup, depth: number) => {
    const indent = '  '.repeat(depth);
    if (node.type === 'rule') {
      fullLines.push(`${indent}• ${formatRulePreview(node)}`);
    } else {
      fullLines.push(`${indent}[${node.combinator === 'or' ? 'ANY' : 'ALL'}]`);
      node.children.forEach((c) => buildFull(c, depth + 1));
    }
  };
  buildFull(tree, 0);
  return {
    combinatorLabel,
    previews,
    ruleCount: rules,
    groupCount: groups,
    fullText: fullLines.join('\n'),
  };
}

/** Collect all rule ids in a tree (for clone id uniqueness checks). */
export function collectRuleIds(node: ConditionRule | ConditionRuleGroup): string[] {
  if (node.type === 'rule') return [node.id];
  return node.children.flatMap(collectRuleIds);
}

/** Collect all group ids in a tree. */
export function collectGroupIds(node: ConditionRule | ConditionRuleGroup): string[] {
  if (node.type === 'rule') return [];
  return [node.id, ...node.children.flatMap(collectGroupIds)];
}
