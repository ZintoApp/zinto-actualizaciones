/** Explicit resource/operation from the caller wins; node payloads may omit them when AI/tools pass routing separately (see runErpOperationForContext). */
export function resolveErpRoutingResourceOperation(params: {
  resource: string;
  operation: string;
  data: { resource?: unknown; operation?: unknown };
}): { resource: string; operation: string } {
  let resource = String(params.resource || '').trim();
  let operation = String(params.operation || '').trim();
  if (!resource) resource = String(params.data.resource ?? '').trim();
  if (!operation) operation = String(params.data.operation ?? '').trim();
  return { resource, operation };
}
