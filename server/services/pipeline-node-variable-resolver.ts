export type PipelineVariableResolver = Pick<
  import('./flow-execution-context').FlowExecutionContext,
  'replaceVariables'
>;

const INTERPOLATED_SCALAR_FIELDS = [
  'dealIdVariable',
  'dealTitle',
  'dealValue',
  'dealDescription',
  'stageName',
] as const;

function resolveString(value: unknown, context: PipelineVariableResolver): unknown {
  return typeof value === 'string' ? context.replaceVariables(value) : value;
}

/**
 * Resolve every Pipeline-node value that the deal executor persists or uses
 * for lookup. The legacy executor's fallback resolver only knows built-in
 * contact/message values, so this bridge is required for Data Capture, Code
 * Execution, custom, and other session variables stored in FlowExecutionContext.
 */
export function resolvePipelineNodeVariables(
  input: Record<string, unknown>,
  context?: PipelineVariableResolver,
): Record<string, unknown> {
  if (!context) return input;

  const output = { ...input };
  for (const field of INTERPOLATED_SCALAR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(output, field)) {
      output[field] = resolveString(output[field], context);
    }
  }

  for (const field of ['tagsToAdd', 'tagsToRemove'] as const) {
    if (Array.isArray(output[field])) {
      output[field] = output[field].map((value) => resolveString(value, context));
    }
  }

  const customFields = output.customFieldsToSet;
  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    output.customFieldsToSet = Object.fromEntries(
      Object.entries(customFields as Record<string, unknown>).map(([field, value]) => [
        field,
        Array.isArray(value)
          ? value.map((entry) => resolveString(entry, context))
          : resolveString(value, context),
      ]),
    );
  }

  return output;
}
