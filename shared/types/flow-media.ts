import { extractCodeExecutionVariableNames } from '../flow-code-output-variables';

export const FLOW_MEDIA_VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
export const FLOW_MEDIA_MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;
export const FLOW_MEDIA_MAX_PER_AI_TURN = 10;

export function normalizeFlowMediaVariableName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[_0-9]+/, '')
    .replace(/_+/g, '_');
}

export const FLOW_MEDIA_ALLOWED_MIME_TYPES_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'], '.gif': ['image/gif'], '.webp': ['image/webp'],
  '.mp4': ['video/mp4'], '.webm': ['video/webm'], '.mov': ['video/quicktime'], '.avi': ['video/x-msvideo'],
  '.mp3': ['audio/mpeg'], '.wav': ['audio/wav', 'audio/x-wav'], '.ogg': ['audio/ogg'],
  '.m4a': ['audio/mp4'], '.aac': ['audio/aac'],
  '.pdf': ['application/pdf'], '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.txt': ['text/plain'], '.csv': ['text/csv', 'text/plain'],
};

export function isAllowedFlowMediaUpload(filename: string, mimeType: string): boolean {
  const lastDot = filename.lastIndexOf('.');
  const extension = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  return FLOW_MEDIA_ALLOWED_MIME_TYPES_BY_EXTENSION[extension]?.includes(mimeType.toLowerCase()) === true;
}

export type FlowMediaKind = 'image' | 'video' | 'audio' | 'document';

export interface FlowMediaAsset {
  id: number;
  flowId: number;
  companyId: number;
  variableName: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  mediaKind: FlowMediaKind;
  fileSize: number;
  uploadedBy: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AIFlowMediaInvocation {
  variableNames: string[];
}

export function normalizeRequestedFlowMediaNames(
  value: unknown,
  allowedNames: ReadonlySet<string>,
  limit = FLOW_MEDIA_MAX_PER_AI_TURN,
): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const rawName of value) {
    const name = String(rawName);
    if (!allowedNames.has(name) || result.includes(name)) continue;
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}

const RESERVED_FLOW_VARIABLE_NAMES = new Set([
  'contact', 'message', 'current', 'date', 'time', 'flow', 'pipeline', 'session',
  'execution', 'ai', 'code_execution_output', 'database_query_output',
]);

export function collectDeclaredFlowVariableNames(
  nodes: unknown,
  customVariables: unknown,
): Set<string> {
  const names = new Set<string>(RESERVED_FLOW_VARIABLE_NAMES);
  if (Array.isArray(customVariables)) {
    for (const value of customVariables) {
      if (value && typeof value === 'object' && typeof (value as any).name === 'string') {
        names.add((value as any).name.trim());
      }
    }
  }
  if (!Array.isArray(nodes)) return names;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const raw = node as any;
    const type = String(raw.type ?? '');
    const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
    if (['data_capture', 'dataCapture', 'DataCapture'].includes(type)) {
      for (const rule of Array.isArray(data.captureRules) ? data.captureRules : []) {
        if (typeof rule?.variableName === 'string') names.add(rule.variableName.trim());
      }
    }
    if (['ai_assistant', 'aiAssistant', 'aiAssistantNode'].includes(type)) {
      for (const variable of Array.isArray(data.aiVariables) ? data.aiVariables : []) {
        if (typeof variable?.name === 'string') names.add(variable.name.trim());
      }
    }
    if (['code_execution', 'codeExecution', 'codeExecutionNode'].includes(type) && typeof data.code === 'string') {
      for (const name of extractCodeExecutionVariableNames(data.code)) names.add(name);
    }
  }
  return names;
}

export function removeStaleInferredAiMediaVariables(
  nodes: unknown,
  mediaVariableNames: ReadonlySet<string>,
): unknown {
  if (!Array.isArray(nodes) || mediaVariableNames.size === 0) return nodes;
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (!node || typeof node !== 'object') return node;
    const raw = node as any;
    if (!['ai_assistant', 'aiAssistant', 'aiAssistantNode'].includes(String(raw.type ?? '')) ||
        !raw.data || typeof raw.data !== 'object' || !Array.isArray(raw.data.aiVariables)) {
      return node;
    }
    const prompt = typeof raw.data.prompt === 'string' ? raw.data.prompt : '';
    const filtered = raw.data.aiVariables.filter((variable: any) => {
      const name = typeof variable?.name === 'string' ? variable.name.trim() : '';
      const isStaleInferredMedia = mediaVariableNames.has(name) &&
        variable?.id === `ai_var_${name}` &&
        prompt.includes(`{{${name}}}`);
      if (isStaleInferredMedia) changed = true;
      return !isStaleInferredMedia;
    });
    return filtered.length === raw.data.aiVariables.length
      ? node
      : { ...raw, data: { ...raw.data, aiVariables: filtered } };
  });
  return changed ? nextNodes : nodes;
}
