import type { ResponseConfig } from '@shared/types/webhook-trigger';
import type { FlowExecutionContext } from './flow-execution-context';
import { logger } from '../utils/logger';

export interface WebhookResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  contentType: string;
}

/**
 * Builds the HTTP response for a webhook trigger using responseConfig and execution context.
 * Interpolates variables in bodyTemplate, detects format, and sets appropriate headers.
 */
export function buildWebhookResponse(
  responseConfig: ResponseConfig,
  context: FlowExecutionContext,
  executionResult?: { status: 'completed' | 'failed'; result?: any; duration?: number; error?: string }
): WebhookResponse {
  const headers: Record<string, string> = { ...(responseConfig.headers || {}) };

  if (executionResult && 'setExecutionResult' in context && typeof context.setExecutionResult === 'function') {
    context.setExecutionResult(executionResult);
  }

  let body: string;
  try {
    body = context.replaceVariables(responseConfig.bodyTemplate || '');
  } catch (err) {
    body = JSON.stringify({
      success: false,
      error: 'Response template error',
      requestId: (context as { getVariable?: (k: string) => any }).getVariable?.('webhook.requestId') ?? ''
    });
  }

  const contentType = detectContentType(body, headers);
  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = contentType;
  }

  return {
    statusCode: responseConfig.statusCode >= 100 && responseConfig.statusCode <= 599
      ? responseConfig.statusCode
      : 200,
    body,
    headers,
    contentType
  };
}

function detectContentType(interpolatedBody: string, userHeaders: Record<string, string>): string {
  const ct = userHeaders['Content-Type'] || userHeaders['content-type'];
  if (ct) return ct;

  const trimmed = interpolatedBody.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(interpolatedBody);
      return 'application/json';
    } catch (parseErr) {
      logger.warn(
        'Webhook response body looks like JSON but failed to parse; sending as text/plain',
        parseErr instanceof Error ? parseErr.message : 'Parse error'
      );
      return 'text/plain';
    }
  }
  if (trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && /^<[\w-]+/.test(trimmed))) {
    return 'application/xml';
  }
  return 'text/plain';
}
