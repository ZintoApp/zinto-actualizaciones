export type AIFunctionCall = { id?: string; name: string; arguments: unknown };
export type AIVariableWrite = { name: string; value: string };

export function isVariableWriteFunctionName(name: string): boolean {
  return name === 'set_variable' || name === 'set_variables' || name === 'set_custom_fields';
}

export function areAllVariableWriteFunctionCalls(functionCalls: AIFunctionCall[]): boolean {
  return functionCalls.length > 0 && functionCalls.every((fc) => isVariableWriteFunctionName(fc.name));
}

export function normalizeTriggeredVariableWrites(
  functionCalls: AIFunctionCall[],
  allowedVariableNames: Set<string>
): AIVariableWrite[] {
  const dedupedWrites = new Map<string, string>();

  const parseFunctionArgs = (rawArgs: unknown): Record<string, unknown> => {
    if (typeof rawArgs === 'string') {
      try {
        const parsed = JSON.parse(rawArgs);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
    if (rawArgs && typeof rawArgs === 'object') {
      return rawArgs as Record<string, unknown>;
    }
    return {};
  };

  for (const functionCall of functionCalls) {
    if (!isVariableWriteFunctionName(functionCall.name)) continue;

    const args = parseFunctionArgs(functionCall.arguments);
    const writes: Array<{ variable_name: unknown; value: unknown }> = [];

    if (functionCall.name === 'set_variable') {
      writes.push({
        variable_name: args.variable_name,
        value: args.value
      });
    } else if (Array.isArray(args.writes)) {
      for (const entry of args.writes) {
        if (entry && typeof entry === 'object') {
          const entryObj = entry as Record<string, unknown>;
          writes.push({
            variable_name: entryObj.variable_name,
            value: entryObj.value
          });
        }
      }
    }

    for (const write of writes) {
      const variableName = write.variable_name;
      const value = write.value;
      if (
        typeof variableName === 'string' &&
        typeof value === 'string' &&
        allowedVariableNames.has(variableName)
      ) {
        dedupedWrites.set(variableName, value);
      }
    }
  }

  return Array.from(dedupedWrites.entries()).map(([name, value]) => ({
    name,
    value
  }));
}
