export type FlowCodeVariableSourceNode = {
  id: string;
  type?: string;
  data?: unknown;
};

const CODE_EXECUTION_NODE_TYPES = new Set(['code_execution', 'codeExecution', 'codeExecutionNode']);
const VALID_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const ASSIGNMENT_OPERATOR = String.raw`(?:\+\+|--|(?:\+|-|\*|\/|%|\?\?|\|\||&&)?=(?!=|>))`;

function collectObjectLiteralKeys(source: string, names: Set<string>): void {
  const keyPattern = /(?:^|,)\s*(?:([A-Za-z_][A-Za-z0-9_.-]*)|['"]([A-Za-z_][A-Za-z0-9_.-]*)['"])\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(source)) !== null) {
    const name = match[1] || match[2];
    if (VALID_VARIABLE_NAME.test(name)) names.add(name);
  }
}

/**
 * Statically discovers variable keys written by a Code Execution node.
 * Dynamic computed keys remain available after a real run through runtime-variable discovery.
 */
export function extractCodeExecutionVariableNames(code: unknown): string[] {
  if (typeof code !== 'string' || !code.trim()) return [];
  const names = new Set<string>();

  const dotAssignment = new RegExp(
    String.raw`\bvariables\s*\.\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*${ASSIGNMENT_OPERATOR}`,
    'g',
  );
  let match: RegExpExecArray | null;
  while ((match = dotAssignment.exec(code)) !== null) {
    const name = match[1].replace(/\s+/g, '');
    if (VALID_VARIABLE_NAME.test(name)) names.add(name);
  }

  const bracketAssignment = new RegExp(
    String.raw`\bvariables\s*\[\s*(['"])([A-Za-z_][A-Za-z0-9_.-]*)\1\s*\]\s*${ASSIGNMENT_OPERATOR}`,
    'g',
  );
  while ((match = bracketAssignment.exec(code)) !== null) {
    if (VALID_VARIABLE_NAME.test(match[2])) names.add(match[2]);
  }

  const objectAssign = /\bObject\s*\.\s*assign\s*\(\s*variables\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  while ((match = objectAssign.exec(code)) !== null) collectObjectLiteralKeys(match[1], names);

  const objectReplacement = /\bvariables\s*=\s*\{([\s\S]*?)\}/g;
  while ((match = objectReplacement.exec(code)) !== null) collectObjectLiteralKeys(match[1], names);

  return [...names];
}

export function getCodeExecutionVariableNamesFromNodes(nodes: FlowCodeVariableSourceNode[]): Array<{
  nodeId: string;
  nodeName: string;
  variableName: string;
}> {
  const outputs: Array<{ nodeId: string; nodeName: string; variableName: string }> = [];
  for (const node of nodes) {
    if (!CODE_EXECUTION_NODE_TYPES.has(String(node.type ?? ''))) continue;
    const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? node.data as Record<string, unknown>
      : {};
    const nodeName = String(data.label ?? '').trim() || `Code Execution ${node.id}`;
    for (const variableName of extractCodeExecutionVariableNames(data.code)) {
      outputs.push({ nodeId: node.id, nodeName, variableName });
    }
  }
  return outputs;
}
