import FormData from 'form-data';
import {
  encodeHttpRequestConfig,
  normalizeHttpNodeData,
  type EncodedHttpBody
} from '../../shared/postman';
import { performFlowHttpRequest } from './flow-http-request';

type ReplaceFn = (s: string) => string;

async function fetchBinaryBytes(
  url: string,
  replaceVariables: ReplaceFn,
  options: { ssrfGuard: boolean; timeout: number }
): Promise<{ buffer: Buffer; contentType?: string }> {
  const resolved = replaceVariables(url).trim();
  if (!resolved) {
    throw new Error('Binary/file URL is empty — set a URL or path on the node');
  }

  const result = await performFlowHttpRequest({
    url: resolved,
    method: 'GET',
    timeout: options.timeout,
    followRedirects: true,
    retryCount: 0,
    responseType: 'binary',
    ssrfGuard: options.ssrfGuard
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Failed to fetch binary from ${resolved}: HTTP ${result.status}`);
  }

  const buffer = Buffer.isBuffer(result.data)
    ? result.data
    : Buffer.from(
        typeof result.data === 'string' ? result.data : String(result.data ?? ''),
        typeof result.data === 'string' ? 'utf8' : undefined
      );

  const contentType =
    result.headers['content-type'] ||
    result.headers['Content-Type'] ||
    undefined;

  return { buffer, contentType };
}

async function buildMultipartBody(
  fields: Array<{ name: string; value: string; type: 'text' | 'file' }>,
  replaceVariables: ReplaceFn,
  options: { ssrfGuard: boolean; timeout: number }
): Promise<{ body: Buffer; headers: Record<string, string> }> {
  const form = new FormData();
  for (const field of fields) {
    if (field.type === 'file') {
      if (!field.value.trim()) continue;
      const { buffer, contentType } = await fetchBinaryBytes(field.value, replaceVariables, options);
      const filename = field.value.split(/[\\/]/).pop() || 'file';
      form.append(field.name, buffer, {
        filename,
        contentType: contentType || 'application/octet-stream'
      });
    } else {
      form.append(field.name, field.value);
    }
  }
  const body: Buffer = form.getBuffer();
  const headers = form.getHeaders() as Record<string, string>;
  return { body, headers };
}

export type PreparedHttpNodeRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer;
};

/**
 * Prepare an outbound HTTP request from HTTP node data (shared by executor + test).
 */
export async function prepareHttpNodeOutboundRequest(
  nodeData: Record<string, unknown>,
  replaceVariables: ReplaceFn,
  options?: { ssrfGuard?: boolean; timeout?: number }
): Promise<PreparedHttpNodeRequest> {
  const ssrfGuard = options?.ssrfGuard !== false;
  const timeoutValue = options?.timeout ?? (typeof nodeData.timeout === 'number' ? nodeData.timeout : 30);
  const timeout = timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

  const config = normalizeHttpNodeData(nodeData);
  const encoded = encodeHttpRequestConfig(config, replaceVariables);

  const headers: Record<string, string> = {
    'User-Agent': 'FlowExecutor/1.0',
    ...encoded.headers
  };

  const bodyDesc: EncodedHttpBody = encoded.body;
  let body: string | Buffer | undefined;
  const fetchOpts = { ssrfGuard, timeout };

  if (bodyDesc.kind === 'string' || bodyDesc.kind === 'urlencoded') {
    body = bodyDesc.body;
    if (bodyDesc.contentType && !hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = bodyDesc.contentType;
    }
  } else if (bodyDesc.kind === 'multipart') {
    const built = await buildMultipartBody(bodyDesc.fields, replaceVariables, fetchOpts);
    body = built.body;
    Object.assign(headers, built.headers);
  } else if (bodyDesc.kind === 'binary') {
    const { buffer, contentType } = await fetchBinaryBytes(bodyDesc.url, replaceVariables, fetchOpts);
    body = buffer;
    if (!hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = contentType || 'application/octet-stream';
    }
  }

  return {
    url: encoded.url,
    method: encoded.method,
    headers,
    body
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower && headers[k] !== '');
}
